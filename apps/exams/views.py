from django.db import transaction
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from apps.accounts.permissions import IsTeacher, IsStudent
from apps.classes.models import ClassEnrollment
from apps.tests_app.models import Question
from .grading import (
    GRADE_SCALE, GRADE_SCALE_ERROR, apply_manual_grade, draft_to_answers, finalize, finalize_overdue,
    grade, recalc_totals,
)
from .models import Exam, ExamResult, StudentAnswer
from .serializers import ExamSerializer, ExamResultSerializer, ExamResultDetailSerializer, SubmitExamSerializer


def _apply_answer_visibility(data, exam):
    """Trim a student's own result review to what the exam's show_answers setting allows."""
    mode = exam.show_answers
    running = timezone.now() <= exam.end_time
    data['show_answers'] = mode
    if data.get('needs_grading'):
        # open answers still count as 0 — a total or pass/fail now would be wrong
        data.update(score=None, percentage=None, passed=None, penalty=None)
    if mode == Exam.SHOW_NEVER or (mode == Exam.SHOW_AFTER_END and running):
        data['answers_review'] = []
        data['review_available_at'] = exam.end_time if mode == Exam.SHOW_AFTER_END else None
    elif mode == Exam.SHOW_MARKS_THEN_ANSWERS and running:
        # right/wrong per question now; which choice was right stays hidden until the end
        for review in data['answers_review']:
            for choice in review.get('all_answers') or []:
                choice['is_correct'] = None
            review['criteria'] = ''
            review['correct_text'] = ''
        data['answers_hidden_until'] = exam.end_time
    return data


class ExamViewSet(viewsets.ModelViewSet):
    serializer_class = ExamSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.is_teacher:
            qs = Exam.objects.filter(class_room__teacher=user).select_related('test', 'class_room')
            class_room = self.request.query_params.get('class_room')
            if class_room:
                qs = qs.filter(class_room_id=class_room)
            return qs
        enrolled_classes = user.enrollments.filter(is_active=True).values_list('class_room_id', flat=True)
        # A passive exam is hidden — except from students already inside it, so they can finish
        from django.db.models import Q
        # the current class's exams, plus any exam they've taken (kept after moving to another class)
        return Exam.objects.filter(Q(class_room__in=enrolled_classes) | Q(results__student=user)).filter(
            Q(is_active=True) | Q(results__student=user, results__status=ExamResult.STATUS_IN_PROGRESS)
        ).distinct().select_related('test', 'class_room')

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsTeacher()]
        # custom actions carry their own permission_classes (IsStudent / IsTeacher); list/retrieve use the default
        return super().get_permissions()

    def list(self, request, *args, **kwargs):
        if request.user.is_student:
            # so a timed-out exam shows as finished, not "continue"
            finalize_overdue(ExamResult.objects.filter(student=request.user))
        return super().list(request, *args, **kwargs)

    def perform_create(self, serializer):
        user = self.request.user
        from apps.subscriptions.models import Subscription
        from rest_framework.exceptions import PermissionDenied
        if not user.is_email_verified:
            raise PermissionDenied('İmtahan yaratmaq üçün əvvəlcə email ünvanınızı təsdiqləyin.')
        subscription = Subscription.objects.select_related('plan').filter(teacher=user).first()
        if subscription is None:
            raise PermissionDenied(Subscription.MISSING_MESSAGE)
        if not subscription.is_active:
            raise PermissionDenied(Subscription.EXPIRED_MESSAGE)
        subscription.reset_monthly_count_if_needed()
        if not subscription.can_create_exam():
            raise PermissionDenied(
                f'Aylıq imtahan limitinə çatmısınız ({subscription.plan.max_exams_per_month}). Abunəliyinizi yeniləyin.'
            )
        exam = serializer.save()
        subscription.exams_used_this_month += 1
        subscription.save(update_fields=['exams_used_this_month'])
        return exam

    # Deleting takes the results and answers with it — the page warns first and offers the archive instead
    def _teacher_exams(self, request):
        ids = request.data.get('exam_ids')
        if not isinstance(ids, list) or not ids or not all(isinstance(i, int) for i in ids):
            return None, Response({'detail': 'exam_ids must be a non-empty list.'}, status=400)
        exams = list(Exam.objects.filter(class_room__teacher=request.user, pk__in=ids))
        if len(exams) != len(set(ids)):
            return None, Response({'detail': 'İmtahan tapılmadı.'}, status=404)
        return exams, None

    @action(detail=False, methods=['post'], url_path='bulk_delete', permission_classes=[IsTeacher])
    def bulk_delete(self, request):
        """POST {exam_ids} — e.g. one exam given to three classes, deleted in one go."""
        exams, error = self._teacher_exams(request)
        if error:
            return error
        with transaction.atomic():
            for exam in exams:
                exam.delete()
        return Response({'deleted': len(exams)})

    @action(detail=False, methods=['post'], permission_classes=[IsTeacher])
    def archive(self, request):
        """POST {exam_ids, archived: true|false} — move exams into (or out of) the teacher's archive."""
        exams, error = self._teacher_exams(request)
        if error:
            return error
        archived = bool(request.data.get('archived', True))
        if archived and not all(e.can_archive for e in exams):
            return Response({'detail': 'Gedən imtahanı arxivə salmaq olmaz. Əvvəlcə onu passiv edin və ya bitməsini gözləyin.'},
                            status=400)
        Exam.objects.filter(pk__in=[e.pk for e in exams]).update(is_archived=archived)
        return Response({'updated': len(exams), 'archived': archived})

    @action(detail=True, methods=['post'], permission_classes=[IsStudent])
    def start(self, request, pk=None):
        exam = self.get_object()
        user = request.user

        result = ExamResult.objects.filter(exam=exam, student=user).first()
        if result is not None and result.status == ExamResult.STATUS_IN_PROGRESS and result.is_overdue:
            finalize(result)
            result.refresh_from_db()
        if result is not None and result.status != ExamResult.STATUS_IN_PROGRESS:
            return Response({'detail': 'Bu imtahanı artıq tamamlamısınız.'}, status=status.HTTP_400_BAD_REQUEST)

        if result is None:
            if not exam.is_ongoing:
                return Response({'detail': 'İmtahan hazırda aktiv deyil.'}, status=status.HTTP_400_BAD_REQUEST)
            enrolled = ClassEnrollment.objects.filter(
                student=user, class_room=exam.class_room, is_active=True
            ).exists()
            if not enrolled:
                return Response({'detail': 'Siz bu sinifdə deyilsiniz.'}, status=status.HTTP_403_FORBIDDEN)
            result, created = ExamResult.objects.get_or_create(exam=exam, student=user)
        else:
            created = False

        # The page restores saved answers from the draft and runs its timer to `deadline`
        data = ExamResultSerializer(result).data
        data['draft_answers'] = result.draft_answers
        return Response(data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    @action(detail=True, methods=['patch'], permission_classes=[IsStudent])
    def save_draft(self, request, pk=None):
        """Autosave of the student's answers while the exam is open."""
        exam = self.get_object()
        answers = request.data.get('answers')
        if not isinstance(answers, dict) or len(answers) > 500:
            return Response({'detail': 'answers must be an object.'}, status=status.HTTP_400_BAD_REQUEST)
        result = ExamResult.objects.filter(
            exam=exam, student=request.user, status=ExamResult.STATUS_IN_PROGRESS).first()
        if result is None:
            return Response({'detail': 'Aktiv imtahan sessiyası yoxdur.'}, status=status.HTTP_400_BAD_REQUEST)
        if result.is_overdue:
            finalize(result)
            return Response({'detail': 'İmtahan vaxtı bitib.'}, status=status.HTTP_400_BAD_REQUEST)
        result.draft_answers = answers
        result.save(update_fields=['draft_answers'])
        return Response({'saved': True})

    @action(detail=True, methods=['post'], permission_classes=[IsStudent])
    def submit(self, request, pk=None):
        exam = self.get_object()
        serializer = SubmitExamSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        # One transaction: all answers + the score are saved together (no half-graded result), and the
        # row lock makes a double-clicked submit wait and then see the result is already submitted
        with transaction.atomic():
            result = (ExamResult.objects.select_for_update()
                      .filter(exam=exam, student=request.user, status=ExamResult.STATUS_IN_PROGRESS).first())
            if result is None:
                return Response({'detail': 'Aktiv imtahan sessiyası yoxdur.'}, status=status.HTTP_400_BAD_REQUEST)
            if result.is_overdue:
                # Too late: what was saved before the time ran out is graded, the late answers are not
                grade(exam, result, draft_to_answers(result.draft_answers), submitted_at=result.deadline, auto=True)
            else:
                grade(exam, result, serializer.validated_data['answers'])
        return Response(ExamResultSerializer(result).data)

    @action(detail=True, methods=['post'], permission_classes=[IsTeacher])
    def grade_answer(self, request, pk=None):
        """Manually grade a long_answer (or open) student answer."""
        exam = self.get_object()
        if exam.class_room.teacher != request.user:
            return Response({'detail': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)

        student_id = request.data.get('student_id')
        question_id = request.data.get('question_id')
        grade_key = str(request.data.get('grade', ''))
        if grade_key not in GRADE_SCALE:
            return Response({'detail': GRADE_SCALE_ERROR}, status=status.HTTP_400_BAD_REQUEST)

        try:
            result = ExamResult.objects.get(exam=exam, student_id=student_id)
        except ExamResult.DoesNotExist:
            return Response({'detail': 'Result not found.'}, status=status.HTTP_404_NOT_FOUND)

        try:
            answer = StudentAnswer.objects.select_related('question').get(
                result=result, question_id=question_id
            )
        except StudentAnswer.DoesNotExist:
            return Response({'detail': 'Answer not found.'}, status=status.HTTP_404_NOT_FOUND)

        if answer.question.question_type not in ('long_answer', 'open'):
            return Response(
                {'detail': 'Only long_answer/open questions can be manually graded.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        apply_manual_grade(answer, grade_key)
        answer.save(update_fields=['points_earned', 'is_correct'])

        recalc_totals(result)

        return Response({
            'success': True,
            'points_earned': answer.points_earned,
            'is_correct': answer.is_correct,
            'new_percentage': result.percentage,
            'new_score': result.score,
            'total_points': result.total_points,
            'passed': result.passed,
            'needs_grading': result.answers.filter(
                question__question_type__in=Question.MANUAL_GRADE_TYPES, is_correct__isnull=True).exists(),
        })

    @action(detail=True, methods=['patch'], permission_classes=[IsStudent])
    def tab_switch(self, request, pk=None):
        exam = self.get_object()
        try:
            result = ExamResult.objects.get(exam=exam, student=request.user, status=ExamResult.STATUS_IN_PROGRESS)
            result.tab_switch_count += 1
            result.save(update_fields=['tab_switch_count'])
            return Response({'tab_switch_count': result.tab_switch_count})
        except ExamResult.DoesNotExist:
            return Response({'detail': 'No active session.'}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['get'], permission_classes=[IsStudent])
    def my_result(self, request, pk=None):
        exam = self.get_object()
        finalize_overdue(ExamResult.objects.filter(exam=exam, student=request.user))
        try:
            result = ExamResult.objects.prefetch_related(
                'answers__question__answers',
                'answers__selected_answer',
            ).get(exam=exam, student=request.user)
            data = ExamResultDetailSerializer(result, context={'request': request}).data
            return Response(_apply_answer_visibility(data, exam))
        except ExamResult.DoesNotExist:
            return Response({'detail': 'No result found.'}, status=status.HTTP_404_NOT_FOUND)

    @action(detail=False, methods=['get'], permission_classes=[IsTeacher])
    def needs_grading_count(self, request):
        count = ExamResult.objects.filter(
            exam__class_room__teacher=request.user,
            status=ExamResult.STATUS_SUBMITTED,
            answers__is_correct__isnull=True,
        ).distinct().count()
        return Response({'count': count})

    @action(detail=True, methods=['get'], permission_classes=[IsTeacher])
    def results(self, request, pk=None):
        exam = self.get_object()
        if exam.class_room.teacher != request.user:
            return Response({'detail': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)
        finalize_overdue(exam.results.all())
        results = exam.results.select_related('student').prefetch_related('answers__question').order_by('-percentage')
        serializer = ExamResultSerializer(results, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'], permission_classes=[IsTeacher])
    def report_cards(self, request, pk=None):
        """Printable report cards of every submitted result (?student_id= for one student)."""
        from .report_cards import build_card
        exam = self.get_object()
        if exam.class_room.teacher != request.user:
            return Response({'detail': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)
        finalize_overdue(exam.results.all())
        results = (exam.results.filter(status=ExamResult.STATUS_SUBMITTED)
                   .select_related('student', 'exam__test')
                   .prefetch_related('answers')
                   .order_by('student__first_name', 'student__last_name'))
        if request.query_params.get('student_id'):
            results = results.filter(student_id=request.query_params['student_id'])
        cls = exam.class_room
        return Response({
            'exam': {
                'id': exam.id, 'title': exam.title, 'test_title': exam.test.title, 'topic': exam.test.topic,
                'class_name': cls.name, 'class_grade': cls.grade, 'class_group': cls.group,
                'subject': cls.subject, 'teacher_name': request.user.get_full_name(),
                'start_time': exam.start_time, 'passing_score': exam.test.passing_score,
                'negative_marking': exam.test.negative_marking, 'wrong_per_correct': exam.test.wrong_per_correct,
            },
            'cards': [build_card(r) for r in results],
        })

    @action(detail=True, methods=['post', 'delete'], permission_classes=[IsTeacher])
    def offline_result(self, request, pk=None):
        """
        Paper exam: the teacher types in a student's answers (answer ids already mapped from the
        printed variant's letters) and the system grades them like an online submit.
        Written answers can carry the teacher's points. POST again to correct, DELETE to remove.
        """
        exam = self.get_object()
        if exam.class_room.teacher != request.user:
            return Response({'detail': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)
        data = request.data if request.method == 'POST' else request.query_params
        student_id = data.get('student_id')
        if not ClassEnrollment.objects.filter(class_room=exam.class_room, student_id=student_id,
                                              is_active=True, student__is_active=True).exists():
            return Response({'detail': 'Şagird bu sinifdə deyil.'}, status=status.HTTP_400_BAD_REQUEST)
        existing = ExamResult.objects.filter(exam=exam, student_id=student_id).first()
        if existing is not None and not existing.is_offline:
            return Response({'detail': 'Bu şagird imtahanı onlayn verib.'}, status=status.HTTP_400_BAD_REQUEST)
        if request.method == 'DELETE':
            if existing is not None:
                existing.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)

        raw = data.get('answers') or []
        if not isinstance(raw, list):
            return Response({'detail': 'answers must be a list.'}, status=status.HTTP_400_BAD_REQUEST)
        manual_grades = {}
        for a in raw:
            if isinstance(a, dict) and a.get('grade') not in (None, ''):
                if str(a['grade']) not in GRADE_SCALE:
                    return Response({'detail': GRADE_SCALE_ERROR}, status=status.HTTP_400_BAD_REQUEST)
                try:
                    manual_grades[int(a['question'])] = str(a['grade'])
                except (TypeError, ValueError, KeyError):
                    return Response({'detail': 'question must be an id.'}, status=status.HTTP_400_BAD_REQUEST)
        serializer = SubmitExamSerializer(data={'answers': [
            {k: v for k, v in a.items() if k != 'grade'} for a in raw if isinstance(a, dict)]})
        serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            created = existing is None
            result = existing or ExamResult.objects.create(exam=exam, student_id=student_id)
            result.answers.all().delete()
            result.is_offline = True
            result.offline_variant = str(data.get('variant') or '')[:1].upper()
            grade(exam, result, serializer.validated_data['answers'])
            if manual_grades:
                written = (result.answers.select_related('question')
                           .filter(question_id__in=manual_grades, question__question_type__in=Question.MANUAL_GRADE_TYPES))
                for sa in written:
                    apply_manual_grade(sa, manual_grades[sa.question_id])
                    if not (sa.answer_text or sa.open_text):
                        sa.answer_text = 'kağızda'
                    sa.save(update_fields=['points_earned', 'is_correct', 'answer_text'])
                recalc_totals(result)
        return Response(ExamResultSerializer(result).data,
                        status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    @action(detail=True, methods=['get'], permission_classes=[IsTeacher])
    def absent(self, request, pk=None):
        """Students of the exam's class who haven't started it."""
        exam = self.get_object()
        if exam.class_room.teacher != request.user:
            return Response({'detail': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)
        started = exam.results.values_list('student_id', flat=True)
        enrollments = (ClassEnrollment.objects
                       .filter(class_room=exam.class_room, is_active=True, student__is_active=True)
                       .exclude(student_id__in=started).select_related('student')
                       .order_by('student__first_name', 'student__last_name'))
        return Response([{'student': e.student_id, 'student_name': e.student.get_full_name(),
                          'student_username': e.student.username} for e in enrollments])

    @action(detail=True, methods=['get'], permission_classes=[IsTeacher])
    def result_detail(self, request, pk=None):
        """Get full answer detail for a specific student result (for grading page)."""
        exam = self.get_object()
        if exam.class_room.teacher != request.user:
            return Response({'detail': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)

        student_id = request.query_params.get('student_id')
        if not student_id:
            return Response({'detail': 'student_id query param is required.'}, status=status.HTTP_400_BAD_REQUEST)

        finalize_overdue(exam.results.filter(student_id=student_id))
        try:
            result = ExamResult.objects.prefetch_related(
                'answers__question__answers',
                'answers__selected_answer',
            ).get(exam=exam, student_id=student_id)
            serializer = ExamResultDetailSerializer(result, context={'request': request})
            return Response(serializer.data)
        except ExamResult.DoesNotExist:
            return Response({'detail': 'Result not found.'}, status=status.HTTP_404_NOT_FOUND)

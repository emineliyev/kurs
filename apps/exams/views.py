from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from apps.accounts.permissions import IsTeacher, IsStudent
from apps.classes.models import ClassEnrollment
from .models import Exam, ExamResult, StudentAnswer
from .serializers import ExamSerializer, ExamResultSerializer, ExamResultDetailSerializer, SubmitExamSerializer


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
        return Exam.objects.filter(
            class_room__in=enrolled_classes,
            is_active=True
        ).select_related('test', 'class_room')

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsTeacher()]
        return [IsAuthenticated()]

    def perform_create(self, serializer):
        user = self.request.user
        from apps.subscriptions.models import Subscription
        from rest_framework.exceptions import PermissionDenied
        if not user.is_email_verified:
            raise PermissionDenied('İmtahan yaratmaq üçün əvvəlcə email ünvanınızı təsdiqləyin.')
        try:
            subscription = Subscription.objects.select_related('plan').get(teacher=user)
            subscription.reset_monthly_count_if_needed()
            if not subscription.can_create_exam():
                raise PermissionDenied(
                    f'Aylıq imtahan limitinə çatmısınız ({subscription.plan.max_exams_per_month}). Abunəliyinizi yeniləyin.'
                )
            exam = serializer.save()
            subscription.exams_used_this_month += 1
            subscription.save(update_fields=['exams_used_this_month'])
            return exam
        except Subscription.DoesNotExist:
            return serializer.save()

    def update(self, request, *args, **kwargs):
        exam = self.get_object()
        if not exam.is_upcoming:
            return Response(
                {'detail': 'Yalnız başlamamış imtahanlar redaktə edilə bilər.'},
                status=status.HTTP_403_FORBIDDEN
            )
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if self.get_object().results.filter(status=ExamResult.STATUS_SUBMITTED).exists():
            return Response(
                {'detail': 'Şagirdlər bu imtahanı tamamladığı üçün silinə bilməz.'},
                status=status.HTTP_403_FORBIDDEN
            )
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['post'], permission_classes=[IsStudent])
    def start(self, request, pk=None):
        exam = self.get_object()
        user = request.user

        if not exam.is_ongoing:
            return Response(
                {'detail': 'Exam is not currently active.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        enrolled = ClassEnrollment.objects.filter(
            student=user,
            class_room=exam.class_room,
            is_active=True
        ).exists()
        if not enrolled:
            return Response({'detail': 'You are not enrolled in this class.'}, status=status.HTTP_403_FORBIDDEN)

        result, created = ExamResult.objects.get_or_create(
            exam=exam,
            student=user,
        )

        if not created and result.status != ExamResult.STATUS_IN_PROGRESS:
            return Response({'detail': 'You have already completed this exam.'}, status=status.HTTP_400_BAD_REQUEST)

        return Response(ExamResultSerializer(result).data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    @action(detail=True, methods=['post'], permission_classes=[IsStudent])
    def submit(self, request, pk=None):
        exam = self.get_object()
        user = request.user

        try:
            result = ExamResult.objects.get(exam=exam, student=user, status=ExamResult.STATUS_IN_PROGRESS)
        except ExamResult.DoesNotExist:
            return Response({'detail': 'No active exam session found.'}, status=status.HTTP_400_BAD_REQUEST)

        serializer = SubmitExamSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        answers_data = serializer.validated_data['answers']
        total_points = 0
        earned_points = 0

        for answer_data in answers_data:
            question = answer_data['question']
            selected_answer = answer_data.get('selected_answer')
            open_text = answer_data.get('open_text', '')
            answer_text = answer_data.get('answer_text', '')

            # Passage is display-only — skip grading entirely
            if question.question_type == 'passage':
                continue

            # All gradable questions count toward total
            total_points += question.points

            if question.question_type in ('long_answer', 'open'):
                # Manual grading — store text, no auto-grade
                StudentAnswer.objects.update_or_create(
                    result=result,
                    question=question,
                    defaults={
                        'selected_answer': None,
                        'open_text': open_text,
                        'answer_text': answer_text or open_text,
                        'is_correct': None,
                        'points_earned': 0,
                    }
                )

            elif question.question_type == 'short_answer':
                correct = (question.correct_answer or '').strip().lower()
                student_text = (answer_text or '').strip().lower()
                is_correct = bool(correct and student_text == correct)
                points = question.points if is_correct else 0
                StudentAnswer.objects.update_or_create(
                    result=result,
                    question=question,
                    defaults={
                        'selected_answer': None,
                        'open_text': '',
                        'answer_text': answer_text,
                        'is_correct': is_correct,
                        'points_earned': points,
                    }
                )
                earned_points += points

            elif question.question_type == 'numeric':
                try:
                    student_val = float(answer_text or '')
                    correct_val = float(question.correct_answer or '')
                    tol = question.tolerance or 0
                    is_correct = abs(student_val - correct_val) <= tol
                except (ValueError, TypeError):
                    is_correct = False
                points = question.points if is_correct else 0
                StudentAnswer.objects.update_or_create(
                    result=result,
                    question=question,
                    defaults={
                        'selected_answer': None,
                        'open_text': '',
                        'answer_text': answer_text,
                        'is_correct': is_correct,
                        'points_earned': points,
                    }
                )
                earned_points += points

            else:
                # MCQ types: mcq, true_false, image_mcq, multiple_choice
                is_correct = bool(selected_answer and selected_answer.is_correct)
                points = question.points if is_correct else 0
                StudentAnswer.objects.update_or_create(
                    result=result,
                    question=question,
                    defaults={
                        'selected_answer': selected_answer,
                        'open_text': '',
                        'answer_text': '',
                        'is_correct': is_correct,
                        'points_earned': points,
                    }
                )
                earned_points += points

        percentage = (earned_points / total_points * 100) if total_points > 0 else 0
        result.score = earned_points
        result.total_points = total_points
        result.percentage = round(percentage, 2)
        result.passed = percentage >= exam.test.passing_score
        result.status = ExamResult.STATUS_SUBMITTED
        result.submitted_at = timezone.now()
        result.save()

        return Response(ExamResultSerializer(result).data)

    @action(detail=True, methods=['post'], permission_classes=[IsTeacher])
    def grade_answer(self, request, pk=None):
        """Manually grade a long_answer (or open) student answer."""
        exam = self.get_object()
        if exam.class_room.teacher != request.user:
            return Response({'detail': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)

        student_id = request.data.get('student_id')
        question_id = request.data.get('question_id')
        awarded_points = request.data.get('awarded_points')

        if awarded_points is None:
            return Response({'detail': 'awarded_points is required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            awarded_points = float(awarded_points)
        except (ValueError, TypeError):
            return Response({'detail': 'awarded_points must be a number.'}, status=status.HTTP_400_BAD_REQUEST)

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

        max_pts = answer.question.points
        awarded_points = min(max(awarded_points, 0), max_pts)
        answer.points_earned = awarded_points
        answer.is_correct = awarded_points >= max_pts
        answer.save()

        # Recalculate result score from all answers
        all_answers = result.answers.all()
        total = sum(a.question.points for a in all_answers)
        earned = sum(a.points_earned for a in all_answers)
        percentage = (earned / total * 100) if total > 0 else 0
        result.score = earned
        result.total_points = total
        result.percentage = round(percentage, 2)
        result.passed = percentage >= exam.test.passing_score
        result.save()

        return Response({
            'success': True,
            'points_earned': answer.points_earned,
            'new_percentage': result.percentage,
            'new_score': result.score,
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
        try:
            result = ExamResult.objects.prefetch_related(
                'answers__question__answers',
                'answers__selected_answer',
            ).get(exam=exam, student=request.user)
            serializer = ExamResultDetailSerializer(result, context={'request': request})
            return Response(serializer.data)
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
        results = exam.results.select_related('student').prefetch_related('answers__question').order_by('-percentage')
        serializer = ExamResultSerializer(results, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'], permission_classes=[IsTeacher])
    def result_detail(self, request, pk=None):
        """Get full answer detail for a specific student result (for grading page)."""
        exam = self.get_object()
        if exam.class_room.teacher != request.user:
            return Response({'detail': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)

        student_id = request.query_params.get('student_id')
        if not student_id:
            return Response({'detail': 'student_id query param is required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            result = ExamResult.objects.prefetch_related(
                'answers__question__answers',
                'answers__selected_answer',
            ).get(exam=exam, student_id=student_id)
            serializer = ExamResultDetailSerializer(result, context={'request': request})
            return Response(serializer.data)
        except ExamResult.DoesNotExist:
            return Response({'detail': 'Result not found.'}, status=status.HTTP_404_NOT_FOUND)

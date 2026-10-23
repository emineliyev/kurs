import copy
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from apps.accounts.permissions import IsTeacher
from apps.subscriptions.permissions import ActiveSubscriptionFor
from .models import Test, Question, Answer, TestVersion, BankQuestion, BankAnswer, BankFolder
from .serializers import (
    BankFolderSerializer,
    TestSerializer, TestDetailSerializer, TestVersionSerializer,
    QuestionSerializer, QuestionPublicSerializer, AnswerSerializer,
    BankQuestionSerializer,
)


def copy_image(source, question):
    """Copy an image file into question.image (each question owns its own file)."""
    import os
    from django.core.files.base import ContentFile
    source.open('rb')
    try:
        question.image.save(os.path.basename(source.name), ContentFile(source.read()), save=True)
    finally:
        source.close()


def shuffled_for_student(questions, exam, student):
    """
    Question/answer order for one student, stable across reloads.
    A passage stays first in its block with the questions that follow it;
    image_mcq choices are not shuffled (their A/B/C/D labels are printed on the image).
    """
    import random
    rng = random.Random(f'{exam.pk}:{student.pk}')
    questions = list(questions)
    if exam.randomize_questions:
        blocks, current = [], None
        for q in questions:
            if q.question_type == Question.TYPE_PASSAGE:
                current = [q]
                blocks.append(current)
            elif current is not None:
                current.append(q)
            else:
                blocks.append([q])
        for block in blocks:
            if block[0].question_type == Question.TYPE_PASSAGE:
                rest = block[1:]
                rng.shuffle(rest)
                block[1:] = rest
        rng.shuffle(blocks)
        questions = [q for block in blocks for q in block]
    answer_order = {}
    if exam.randomize_answers:
        for q in questions:
            answers = list(q.answers.all())
            if q.question_type != Question.TYPE_IMAGE_MCQ:
                rng.shuffle(answers)
            answer_order[q.pk] = answers
    return questions, answer_order


class TestViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    # once the plan runs out: tests can still be opened, exported and deleted, not built or printed
    subscription_actions = ('create', 'update', 'partial_update', 'duplicate')

    def get_serializer_class(self):
        # Questions (with correct answers) are for the owning teacher only.
        if self.action == 'retrieve' and self.request.user.is_teacher:
            return TestDetailSerializer
        return TestSerializer

    def get_queryset(self):
        user = self.request.user
        if user.is_teacher:
            from django.db.models import Count, Exists, OuterRef, Q
            from django.utils import timezone
            from apps.exams.models import ExamResult
            return Test.objects.filter(teacher=user).prefetch_related('class_rooms').annotate(
                has_results=Exists(ExamResult.objects.filter(exam__test=OuterRef('pk'))),
                open_exam_count=Count('exams', filter=Q(exams__is_active=True, exams__end_time__gte=timezone.now()),
                                      distinct=True),
            )
        # Students reach a test only through an exam scheduled for one of their classes;
        # the questions themselves are served only while that exam is in progress.
        enrolled_classes = user.enrollments.filter(is_active=True).values_list('class_room_id', flat=True)
        from django.db.models import Q
        from apps.exams.models import ExamResult
        return Test.objects.filter(exams__class_room__in=enrolled_classes).filter(
            Q(exams__is_active=True)
            | Q(exams__results__student=user, exams__results__status=ExamResult.STATUS_IN_PROGRESS)
        ).distinct().prefetch_related('class_rooms')

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy', 'duplicate', 'versions']:
            return [IsTeacher(), ActiveSubscriptionFor()]
        return [IsAuthenticated(), ActiveSubscriptionFor()]

    def perform_create(self, serializer):
        # Publishing goes through update(), where email, quota and content are checked.
        serializer.save(teacher=self.request.user, is_published=False)

    def update(self, request, *args, **kwargs):
        test = self.get_object()
        from apps.exams.models import ExamResult
        if ExamResult.objects.filter(exam__test=test, status=ExamResult.STATUS_SUBMITTED).exists():
            return Response(
                {'detail': 'Şagirdlər bu testə aid imtahanı tamamladığı üçün test redaktə edilə bilməz.'},
                status=status.HTTP_403_FORBIDDEN
            )
        is_publishing = not test.is_published and request.data.get('is_published') in (True, 'true', 'True', '1', 1)
        if test.is_published and request.data.get('is_published') in (False, 'false', 'False', '0', 0):
            error = self._unpublish_error(test)
            if error:
                return Response({'detail': error}, status=status.HTTP_400_BAD_REQUEST)
        if is_publishing and not request.user.is_email_verified:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Testi tamamlamaq üçün əvvəlcə email ünvanınızı təsdiqləyin.')
        if is_publishing:
            errors = test.publish_errors()
            if errors:
                return Response({'detail': ' '.join(errors)}, status=status.HTTP_400_BAD_REQUEST)
        # Tests are unlimited; the monthly quota applies to exams only.
        response = super().update(request, *args, **kwargs)
        if is_publishing and test.published_at is None and response.status_code < 300:
            from django.utils import timezone
            Test.objects.filter(pk=test.pk).update(published_at=timezone.now())
        return response

    @staticmethod
    def _unpublish_error(test):
        """A test goes back to draft only while no student has used it and no exam is waiting on it."""
        from django.utils import timezone
        if test.is_locked:
            return 'Şagirdlər bu testlə imtahan veriblər. Dəyişmək üçün testin surətini çıxarın.'
        open_exams = test.exams.filter(is_active=True, end_time__gte=timezone.now()).count()
        if open_exams:
            return f'Bu testə {open_exams} aktiv imtahan təyin olunub. Əvvəlcə onları passiv edin.'
        return None

    def destroy(self, request, *args, **kwargs):
        test = self.get_object()
        from apps.exams.models import ExamResult
        if ExamResult.objects.filter(exam__test=test, status=ExamResult.STATUS_SUBMITTED).exists():
            return Response(
                {'detail': 'Şagirdlər bu testə aid imtahanı tamamladığı üçün test silinə bilməz.'},
                status=status.HTTP_403_FORBIDDEN
            )
        return super().destroy(request, *args, **kwargs)

    def perform_update(self, serializer):
        instance = self.get_object()
        version_number = instance.versions.count() + 1
        snapshot = TestDetailSerializer(instance).data
        TestVersion.objects.create(
            test=instance,
            version_number=version_number,
            snapshot=snapshot,
            created_by=self.request.user
        )
        test = serializer.save()
        test.rebalance_points()  # total or the equal-points switch may have changed

    @action(detail=True, methods=['post'], permission_classes=[IsTeacher])
    def duplicate(self, request, pk=None):
        original = self.get_object()
        if original.teacher != request.user:
            return Response({'detail': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)

        new_test = Test.objects.create(
            teacher=request.user,
            title=f'{original.title} (Copy)',
            description=original.description,
            topic=original.topic,
            randomize_questions=original.randomize_questions,
            randomize_answers=original.randomize_answers,
            passing_score=original.passing_score,
            is_published=False,
        )

        for question in original.questions.prefetch_related('answers'):
            new_question = Question.objects.create(
                test=new_test,
                question_type=question.question_type,
                text=question.text,
                points=question.points,
                order=question.order,
                math_formula=question.math_formula,
                model_answer=question.model_answer,
                correct_answer=question.correct_answer,
                tolerance=question.tolerance,
                answer_format=question.answer_format,
                hide_choices=question.hide_choices,
                source_bank_question_id=question.source_bank_question_id,
            )
            if question.image:
                copy_image(question.image, new_question)
            for answer in question.answers.all():
                Answer.objects.create(
                    question=new_question,
                    text=answer.text,
                    is_correct=answer.is_correct,
                    order=answer.order,
                )

        new_test.class_rooms.set(original.class_rooms.all())
        return Response(TestSerializer(new_test).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'])
    def versions(self, request, pk=None):
        test = self.get_object()
        versions = test.versions.all()
        serializer = TestVersionSerializer(versions, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def questions(self, request, pk=None):
        test = self.get_object()
        user = request.user
        questions = test.questions.prefetch_related('answers')
        if user.is_student:
            # Students get the questions only while taking an exam built on this test.
            from django.utils import timezone
            from apps.exams.models import ExamResult
            now = timezone.now()
            result = ExamResult.objects.select_related('exam').filter(
                # no is_active check: a student already inside may finish after the exam is made passive
                student=user, exam__test=test,
                exam__start_time__lte=now, exam__end_time__gte=now,
                status=ExamResult.STATUS_IN_PROGRESS,
            ).first()
            if not result:
                return Response({'detail': 'Suallar yalnız imtahan zamanı əlçatandır.'},
                                status=status.HTTP_403_FORBIDDEN)
            ordered, answer_order = shuffled_for_student(questions, result.exam, user)
            serializer = QuestionPublicSerializer(
                ordered, many=True, context={'request': request, 'answer_order': answer_order})
        else:
            serializer = QuestionSerializer(questions, many=True, context={'request': request})
        return Response(serializer.data)


class QuestionViewSet(viewsets.ModelViewSet):
    serializer_class = QuestionSerializer
    permission_classes = [IsTeacher, ActiveSubscriptionFor]
    # fixing an answer key stays open: it corrects results of exams already given
    subscription_actions = ('create', 'update', 'partial_update', 'destroy', 'reorder')
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        return Question.objects.filter(
            test__teacher=self.request.user
        ).prefetch_related('answers')

    @staticmethod
    def _ensure_editable(test):
        if test.is_locked:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied(Test.LOCKED_MESSAGE)

    def perform_create(self, serializer):
        test_id = self.request.data.get('test')
        try:
            test = Test.objects.get(id=test_id, teacher=self.request.user)
        except (Test.DoesNotExist, ValueError, TypeError):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Test not found or permission denied.')
        self._ensure_editable(test)
        question = serializer.save(test=test)
        test.rebalance_points()
        question.refresh_from_db(fields=['points'])

    def perform_update(self, serializer):
        self._ensure_editable(serializer.instance.test)
        question = serializer.save()
        question.test.rebalance_points()  # a passage ↔ question type change alters the count
        question.refresh_from_db(fields=['points'])

    def perform_destroy(self, instance):
        test = instance.test
        self._ensure_editable(test)
        instance.delete()
        test.rebalance_points()

    @action(detail=True, methods=['post'])
    def fix_key(self, request, pk=None):
        """
        Correct a question's answer key — allowed even after students have answered (the rest of
        the question stays frozen). Every submitted answer to it is re-marked and the results recounted.
        Choice questions: {correct_answer_ids: [...]}; short answer: {correct_answer};
        numeric: {correct_answer, tolerance?}.
        """
        from django.db import transaction
        from apps.exams.grading import parse_number, regrade_question
        question = self.get_object()
        qtype = question.question_type
        data = request.data
        with transaction.atomic():
            if qtype in Question.MCQ_TYPES:
                ids = data.get('correct_answer_ids')
                try:
                    ids = {int(i) for i in ids} if isinstance(ids, list) else set()
                except (TypeError, ValueError):
                    ids = set()
                own = set(question.answers.values_list('id', flat=True))
                if not ids or not ids <= own:
                    return Response({'detail': 'Ən azı bir düzgün variant seçin.'}, status=status.HTTP_400_BAD_REQUEST)
                question.answers.filter(id__in=ids).update(is_correct=True)
                question.answers.exclude(id__in=ids).update(is_correct=False)
            elif qtype == Question.TYPE_SHORT_ANSWER:
                key = str(data.get('correct_answer') or '').strip()
                if not key:
                    return Response({'detail': 'Düzgün cavabı yazın.'}, status=status.HTTP_400_BAD_REQUEST)
                question.correct_answer = key
                question.save(update_fields=['correct_answer'])
            elif qtype == Question.TYPE_NUMERIC:
                key = str(data.get('correct_answer') or '').strip()
                if parse_number(key) is None:
                    return Response({'detail': 'Düzgün cavab rəqəm olmalıdır.'}, status=status.HTTP_400_BAD_REQUEST)
                tolerance = data.get('tolerance', question.tolerance)
                if tolerance in ('', None):
                    tolerance = None
                else:
                    tolerance = parse_number(tolerance)
                    if tolerance is None or tolerance < 0:
                        return Response({'detail': 'Tolerans müsbət rəqəm olmalıdır.'}, status=status.HTTP_400_BAD_REQUEST)
                question.correct_answer = key
                question.tolerance = tolerance
                question.save(update_fields=['correct_answer', 'tolerance'])
            else:
                return Response({'detail': 'Bu sual müəllim tərəfindən əl ilə qiymətləndirilir.'},
                                status=status.HTTP_400_BAD_REQUEST)
            answers_changed, results_changed = regrade_question(question)
        question = Question.objects.prefetch_related('answers').get(pk=question.pk)
        return Response({'question': QuestionSerializer(question, context={'request': request}).data,
                         'answers_changed': answers_changed, 'results_changed': results_changed})

    @action(detail=False, methods=['post'])
    def reorder(self, request):
        ordered_ids = request.data.get('ordered_ids', [])
        if not isinstance(ordered_ids, list):
            return Response({'detail': 'ordered_ids must be a list.'}, status=status.HTTP_400_BAD_REQUEST)
        questions = Question.objects.filter(
            id__in=ordered_ids, test__teacher=request.user
        ).select_related('test')
        # Same lock as editing: once students have answered, the order they saw (and their review) stays
        if any(t.is_locked for t in {q.test for q in questions}):
            return Response({'detail': Test.LOCKED_MESSAGE}, status=status.HTTP_403_FORBIDDEN)
        id_to_q = {q.id: q for q in questions}
        for new_order, qid in enumerate(ordered_ids):
            if qid in id_to_q:
                id_to_q[qid].order = new_order
        Question.objects.bulk_update(list(id_to_q.values()), ['order'])
        return Response({'status': 'ok'})


class BankQuestionViewSet(viewsets.ModelViewSet):
    serializer_class = BankQuestionSerializer
    permission_classes = [IsTeacher, ActiveSubscriptionFor]
    subscription_actions = ('create', 'update', 'partial_update', 'copy_to_test', 'add_to_test')
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        return BankQuestion.objects.filter(
            teacher=self.request.user
        ).prefetch_related('answers')

    def perform_create(self, serializer):
        serializer.save(teacher=self.request.user)

    @action(detail=True, methods=['post'])
    def copy_to_test(self, request, pk=None):
        bank_q = self.get_object()
        test, error = _editable_test(request)
        if error:
            return error
        if test.questions.filter(source_bank_question=bank_q).exists():
            return Response({'detail': 'Bu sual artıq bu testə əlavə edilib.'}, status=status.HTTP_400_BAD_REQUEST)
        new_q = _copy_bank_question(bank_q, test)
        test.rebalance_points()
        new_q.refresh_from_db(fields=['points'])
        return Response(QuestionSerializer(new_q, context={'request': request}).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'])
    def add_to_test(self, request):
        """
        Add many bank questions to a test: a folder (with its subfolders unless recursive=false),
        optionally only `count` random ones. Questions already in the test are skipped.
        """
        import random
        test, error = _editable_test(request)
        if error:
            return error
        qs = self.get_queryset()
        folder_id = request.data.get('folder')
        if folder_id in ('none', None, ''):
            qs = qs.filter(folder__isnull=True) if folder_id == 'none' else qs
        else:
            folder = BankFolder.objects.filter(pk=folder_id, teacher=request.user).first()
            if folder is None:
                return Response({'detail': 'Qovluq tapılmadı.'}, status=status.HTTP_404_NOT_FOUND)
            recursive = request.data.get('recursive', True) not in (False, 'false', '0', 0)
            qs = qs.filter(folder_id__in=folder.subtree_ids() if recursive else [folder.pk])
        pool = list(qs.exclude(pk__in=test.questions.exclude(source_bank_question=None)
                               .values_list('source_bank_question_id', flat=True)).order_by('created_at'))
        count = request.data.get('count')
        if count not in (None, ''):
            try:
                count = max(0, int(count))
            except (TypeError, ValueError):
                return Response({'detail': 'count must be a number.'}, status=status.HTTP_400_BAD_REQUEST)
            pool = random.sample(pool, min(count, len(pool)))
        created = [_copy_bank_question(bq, test) for bq in pool]
        test.rebalance_points()
        fresh = Question.objects.filter(pk__in=[q.pk for q in created]).prefetch_related('answers').order_by('order')
        return Response({'added': len(created),
                         'questions': QuestionSerializer(fresh, many=True, context={'request': request}).data},
                        status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'])
    def move(self, request):
        """Move bank questions (ids) into a folder (null = no folder)."""
        ids = request.data.get('ids') or []
        folder_id = request.data.get('folder')
        folder = None
        if folder_id not in (None, '', 'none'):
            folder = BankFolder.objects.filter(pk=folder_id, teacher=request.user).first()
            if folder is None:
                return Response({'detail': 'Qovluq tapılmadı.'}, status=status.HTTP_404_NOT_FOUND)
        moved = self.get_queryset().filter(pk__in=ids).update(folder=folder)
        return Response({'moved': moved})


def _editable_test(request):
    """(test, None) for the teacher's own unlocked test given as test_id, else (None, error response)."""
    test = Test.objects.filter(id=request.data.get('test_id'), teacher=request.user).first()
    if test is None:
        return None, Response({'detail': 'Test tapılmadı.'}, status=status.HTTP_404_NOT_FOUND)
    if test.is_locked:
        return None, Response({'detail': Test.LOCKED_MESSAGE}, status=status.HTTP_403_FORBIDDEN)
    return test, None


def _copy_bank_question(bank_q, test):
    """A real copy (own image file, own answers) at the end of the test, remembering its source."""
    new_q = Question.objects.create(
        test=test,
        question_type=bank_q.question_type,
        text=bank_q.text,
        math_formula=bank_q.math_formula,
        model_answer=bank_q.model_answer,
        correct_answer=bank_q.correct_answer,
        tolerance=bank_q.tolerance,
        answer_format=bank_q.answer_format,
        points=bank_q.points,
        order=test.questions.count(),
        source_bank_question=bank_q,
    )
    if bank_q.image:
        copy_image(bank_q.image, new_q)
    Answer.objects.bulk_create([
        Answer(question=new_q, text=a.text, is_correct=a.is_correct, order=a.order) for a in bank_q.answers.all()
    ])
    return new_q


class BankFolderViewSet(viewsets.ModelViewSet):
    serializer_class = BankFolderSerializer
    permission_classes = [IsTeacher]
    pagination_class = None

    def get_queryset(self):
        from django.db.models import Count
        return BankFolder.objects.filter(teacher=self.request.user).annotate(question_count=Count('questions'))

    def perform_create(self, serializer):
        serializer.save(teacher=self.request.user)

    def perform_destroy(self, folder):
        # Nothing is lost: subfolders and questions move one level up (or out of any folder)
        from django.db import transaction
        with transaction.atomic():
            BankFolder.objects.filter(parent=folder).update(parent=folder.parent)
            BankQuestion.objects.filter(folder=folder).update(folder=folder.parent)
            folder.delete()

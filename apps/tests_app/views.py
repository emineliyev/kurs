import copy
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from apps.accounts.permissions import IsTeacher
from .models import Test, Question, Answer, TestVersion, BankQuestion, BankAnswer
from .serializers import (
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

    def get_serializer_class(self):
        # Questions (with correct answers) are for the owning teacher only.
        if self.action == 'retrieve' and self.request.user.is_teacher:
            return TestDetailSerializer
        return TestSerializer

    def get_queryset(self):
        user = self.request.user
        if user.is_teacher:
            return Test.objects.filter(teacher=user).prefetch_related('class_rooms')
        # Students reach a test only through an exam scheduled for one of their classes;
        # the questions themselves are served only while that exam is in progress.
        enrolled_classes = user.enrollments.filter(is_active=True).values_list('class_room_id', flat=True)
        return Test.objects.filter(
            exams__class_room__in=enrolled_classes,
            exams__is_active=True,
        ).distinct().prefetch_related('class_rooms')

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy', 'duplicate', 'versions']:
            return [IsTeacher()]
        return [IsAuthenticated()]

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
        # Only the first publish uses the monthly quota; republishing a draft is free.
        first_publish = is_publishing and test.published_at is None
        if is_publishing and not request.user.is_email_verified:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Testi yayımlamaq üçün əvvəlcə email ünvanınızı təsdiqləyin.')
        if is_publishing:
            errors = test.publish_errors()
            if errors:
                return Response({'detail': ' '.join(errors)}, status=status.HTTP_400_BAD_REQUEST)
        if first_publish:
            from apps.subscriptions.models import Subscription
            from rest_framework.exceptions import PermissionDenied
            try:
                subscription = Subscription.objects.get(teacher=request.user)
                subscription.reset_monthly_count_if_needed()
                if not subscription.can_create_test():
                    raise PermissionDenied(
                        'Aylıq test limitinə çatmısınız. Abunəliyinizi yeniləyin.'
                    )
            except Subscription.DoesNotExist:
                pass
        response = super().update(request, *args, **kwargs)
        if first_publish and response.status_code < 300:
            from django.utils import timezone
            from apps.subscriptions.models import Subscription
            Test.objects.filter(pk=test.pk).update(published_at=timezone.now())
            try:
                subscription = Subscription.objects.get(teacher=request.user)
                subscription.tests_used_this_month += 1
                subscription.save(update_fields=['tests_used_this_month'])
            except Subscription.DoesNotExist:
                pass
        return response

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
        serializer.save()

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
                hide_choices=question.hide_choices,
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
                student=user, exam__test=test, exam__is_active=True,
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
    permission_classes = [IsTeacher]
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
        serializer.save(test=test)

    def perform_update(self, serializer):
        self._ensure_editable(serializer.instance.test)
        serializer.save()

    def perform_destroy(self, instance):
        self._ensure_editable(instance.test)
        instance.delete()

    @action(detail=False, methods=['post'])
    def reorder(self, request):
        ordered_ids = request.data.get('ordered_ids', [])
        if not isinstance(ordered_ids, list):
            return Response({'detail': 'ordered_ids must be a list.'}, status=status.HTTP_400_BAD_REQUEST)
        questions = Question.objects.filter(
            id__in=ordered_ids, test__teacher=request.user
        )
        id_to_q = {q.id: q for q in questions}
        for new_order, qid in enumerate(ordered_ids):
            if qid in id_to_q:
                id_to_q[qid].order = new_order
        Question.objects.bulk_update(list(id_to_q.values()), ['order'])
        return Response({'status': 'ok'})


class BankQuestionViewSet(viewsets.ModelViewSet):
    serializer_class = BankQuestionSerializer
    permission_classes = [IsTeacher]
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
        test_id = request.data.get('test_id')
        try:
            test = Test.objects.get(id=test_id, teacher=request.user)
        except Test.DoesNotExist:
            return Response({'detail': 'Test tapılmadı.'}, status=status.HTTP_404_NOT_FOUND)
        if test.is_locked:
            return Response({'detail': Test.LOCKED_MESSAGE}, status=status.HTTP_403_FORBIDDEN)

        new_order = test.questions.count()
        new_q = Question.objects.create(
            test=test,
            question_type=bank_q.question_type,
            text=bank_q.text,
            math_formula=bank_q.math_formula,
            model_answer=bank_q.model_answer,
            correct_answer=bank_q.correct_answer,
            tolerance=bank_q.tolerance,
            points=bank_q.points,
            order=new_order,
        )
        if bank_q.image:
            copy_image(bank_q.image, new_q)
        for ans in bank_q.answers.all():
            Answer.objects.create(
                question=new_q,
                text=ans.text,
                is_correct=ans.is_correct,
                order=ans.order,
            )
        return Response(QuestionSerializer(new_q, context={'request': request}).data, status=status.HTTP_201_CREATED)

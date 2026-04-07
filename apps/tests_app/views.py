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


class TestViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.action in ['retrieve']:
            return TestDetailSerializer
        return TestSerializer

    def get_queryset(self):
        user = self.request.user
        if user.is_teacher:
            return Test.objects.filter(teacher=user).prefetch_related('class_rooms')
        enrolled_classes = user.enrollments.filter(is_active=True).values_list('class_room_id', flat=True)
        return Test.objects.filter(
            class_rooms__in=enrolled_classes,
            is_published=True
        ).distinct().prefetch_related('class_rooms')

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy', 'duplicate']:
            return [IsTeacher()]
        return [IsAuthenticated()]

    def perform_create(self, serializer):
        serializer.save(teacher=self.request.user)

    def update(self, request, *args, **kwargs):
        test = self.get_object()
        from apps.exams.models import ExamResult
        if ExamResult.objects.filter(exam__test=test, status=ExamResult.STATUS_SUBMITTED).exists():
            return Response(
                {'detail': 'Şagirdlər bu testə aid imtahanı tamamladığı üçün test redaktə edilə bilməz.'},
                status=status.HTTP_403_FORBIDDEN
            )
        # Check subscription limit only on first publish
        is_publishing = not test.is_published and request.data.get('is_published')
        if is_publishing and not request.user.is_email_verified:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Testi yayımlamaq üçün əvvəlcə email ünvanınızı təsdiqləyin.')
        if is_publishing:
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
        # Increment counter after successful publish
        if is_publishing and response.status_code < 300:
            from apps.subscriptions.models import Subscription
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
            randomize_questions=original.randomize_questions,
            randomize_answers=original.randomize_answers,
            passing_score=original.passing_score,
            is_published=False,
        )

        for question in original.questions.all():
            new_question = Question.objects.create(
                test=new_test,
                question_type=question.question_type,
                text=question.text,
                points=question.points,
                order=question.order,
                math_formula=question.math_formula,
            )
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
            serializer = QuestionPublicSerializer(questions, many=True, context={'request': request})
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

    def perform_create(self, serializer):
        test_id = self.request.data.get('test')
        try:
            test = Test.objects.get(id=test_id, teacher=self.request.user)
        except Test.DoesNotExist:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Test not found or permission denied.')
        serializer.save(test=test)

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
            import os as _os
            from django.core.files.base import ContentFile
            bank_q.image.open('rb')
            new_q.image.save(
                _os.path.basename(bank_q.image.name),
                ContentFile(bank_q.image.read()),
                save=True,
            )
            bank_q.image.close()
        for ans in bank_q.answers.all():
            Answer.objects.create(
                question=new_q,
                text=ans.text,
                is_correct=ans.is_correct,
                order=ans.order,
            )
        return Response(QuestionSerializer(new_q, context={'request': request}).data, status=status.HTTP_201_CREATED)

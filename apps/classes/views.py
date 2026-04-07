from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from apps.accounts.permissions import IsTeacher
from apps.accounts.models import User
from .models import Subject, Class, ClassEnrollment
from .serializers import (
    SubjectSerializer, ClassSerializer,
    ClassEnrollmentSerializer, EnrollStudentSerializer
)


class SubjectViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Subject.objects.all()
    serializer_class = SubjectSerializer
    permission_classes = [IsAuthenticated]


class ClassViewSet(viewsets.ModelViewSet):
    serializer_class = ClassSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.is_teacher:
            return Class.objects.filter(teacher=user).select_related('subject')
        return Class.objects.filter(enrollments__student=user, is_active=True).select_related('subject')

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsTeacher()]
        return [IsAuthenticated()]

    def perform_create(self, serializer):
        user = self.request.user
        from apps.subscriptions.models import Subscription
        from rest_framework.exceptions import PermissionDenied
        try:
            sub = Subscription.objects.select_related('plan').get(teacher=user)
            if sub.plan.max_classes != -1:
                current = user.classes.filter(is_active=True).count()
                if current >= sub.plan.max_classes:
                    raise PermissionDenied(
                        f'Sinif limitinə çatmısınız ({sub.plan.max_classes}). Abunəliyinizi yeniləyin.'
                    )
        except Subscription.DoesNotExist:
            pass
        serializer.save(teacher=user)

    def destroy(self, request, *args, **kwargs):
        class_obj = self.get_object()
        student_count = class_obj.enrollments.filter(is_active=True).count()
        if student_count > 0:
            return Response(
                {'detail': f'Bu sinifdə {student_count} şagird var. Əvvəlcə şagirdləri sifdən çıxarın.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['get'])
    def students(self, request, pk=None):
        class_obj = self.get_object()
        if not request.user.is_teacher or class_obj.teacher != request.user:
            return Response({'detail': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)
        enrollments = class_obj.enrollments.filter(is_active=True).select_related('student')
        serializer = ClassEnrollmentSerializer(enrollments, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], permission_classes=[IsTeacher])
    def enroll(self, request, pk=None):
        class_obj = self.get_object()
        if class_obj.teacher != request.user:
            return Response({'detail': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)
        from apps.subscriptions.models import Subscription
        try:
            sub = Subscription.objects.select_related('plan').get(teacher=request.user)
            if sub.plan.max_students != -1:
                current = ClassEnrollment.objects.filter(
                    class_room__teacher=request.user, is_active=True
                ).values('student').distinct().count()
                if current >= sub.plan.max_students:
                    return Response(
                        {'detail': f'Şagird limitinə çatmısınız ({sub.plan.max_students}). Abunəliyinizi yeniləyin.'},
                        status=status.HTTP_403_FORBIDDEN
                    )
        except Subscription.DoesNotExist:
            pass
        serializer = EnrollStudentSerializer(data=request.data)
        if serializer.is_valid():
            student = User.objects.get(id=serializer.validated_data['student_id'])
            enrollment, created = ClassEnrollment.objects.get_or_create(
                student=student,
                class_room=class_obj,
                defaults={'is_active': True}
            )
            if not created:
                enrollment.is_active = True
                enrollment.save()
            return Response({'detail': 'Student enrolled successfully.'})
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], permission_classes=[IsTeacher])
    def unenroll(self, request, pk=None):
        class_obj = self.get_object()
        if class_obj.teacher != request.user:
            return Response({'detail': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)
        student_id = request.data.get('student_id')
        try:
            enrollment = ClassEnrollment.objects.get(student_id=student_id, class_room=class_obj)
            enrollment.is_active = False
            enrollment.save()
            return Response({'detail': 'Student unenrolled.'})
        except ClassEnrollment.DoesNotExist:
            return Response({'detail': 'Enrollment not found.'}, status=status.HTTP_404_NOT_FOUND)

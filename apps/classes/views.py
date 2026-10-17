from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from apps.accounts.permissions import IsTeacher
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
            qs = Class.objects.filter(teacher=user)
            # archived classes (kept for their exams' results) are left out of the list
            return qs.filter(is_active=True) if self.action == 'list' else qs
        return Class.objects.filter(enrollments__student=user, is_active=True)

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsTeacher()]
        return [IsAuthenticated()]

    def perform_create(self, serializer):
        user = self.request.user
        from apps.subscriptions.models import Subscription
        from rest_framework.exceptions import PermissionDenied
        sub = Subscription.objects.select_related('plan').filter(teacher=user).first()
        if sub is None:
            raise PermissionDenied(Subscription.MISSING_MESSAGE)
        if not sub.is_active:
            raise PermissionDenied(Subscription.EXPIRED_MESSAGE)
        if sub.plan.max_classes != -1:
            current = user.classes.filter(is_active=True).count()
            if current >= sub.plan.max_classes:
                raise PermissionDenied(
                    f'Sinif limitinə çatmısınız ({sub.plan.max_classes}). Abunəliyinizi yeniləyin.'
                )
        serializer.save(teacher=user)

    def destroy(self, request, *args, **kwargs):
        class_obj = self.get_object()
        student_count = class_obj.student_count
        if student_count > 0:
            return Response(
                {'detail': f'Bu sinifdə {student_count} şagird var. Əvvəlcə şagirdləri başqa sinfə köçürün və ya sinifsiz edin.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        # Exams belong to the class (deleting it would delete them and their results): archive instead
        if class_obj.exams.exists():
            class_obj.is_active = False
            class_obj.save(update_fields=['is_active'])
            return Response({'archived': True, 'detail': 'Sinif arxivləndi, imtahanları və nəticələri saxlanıldı.'})
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['get'])
    def students(self, request, pk=None):
        class_obj = self.get_object()
        if not request.user.is_teacher or class_obj.teacher != request.user:
            return Response({'detail': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)
        enrollments = class_obj.enrollments.filter(is_active=True, student__is_active=True).select_related('student')
        serializer = ClassEnrollmentSerializer(enrollments, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], permission_classes=[IsTeacher])
    def enroll(self, request, pk=None):
        """Add one of the teacher's own students to this class (already counted in the plan limit)."""
        class_obj = self.get_object()
        if class_obj.teacher != request.user:
            return Response({'detail': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)
        if not class_obj.is_active:
            return Response({'detail': 'Bu sinif arxivdədir.'}, status=status.HTTP_400_BAD_REQUEST)
        from apps.subscriptions.models import Subscription
        sub = Subscription.objects.filter(teacher=request.user).first()
        if sub is None or not sub.is_active:
            message = Subscription.MISSING_MESSAGE if sub is None else Subscription.EXPIRED_MESSAGE
            return Response({'detail': message}, status=status.HTTP_403_FORBIDDEN)
        serializer = EnrollStudentSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        # one class per student: joining this class leaves the previous one
        from .membership import place_students
        moved = place_students([serializer.validated_data['student_id']], class_obj)
        return Response({'detail': 'Student enrolled successfully.', 'moved': bool(moved)})

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
            return Response({'detail': 'Şagird bu sinifdə deyil.'}, status=status.HTTP_404_NOT_FOUND)

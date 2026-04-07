from django.utils.translation import gettext_lazy as _
from rest_framework.permissions import BasePermission


class IsTeacher(BasePermission):
    message = _('Only teachers can perform this action.')

    def has_permission(self, request, view):
        return bool(
            request.user and
            request.user.is_authenticated and
            request.user.role == 'teacher'
        )


class IsStudent(BasePermission):
    message = _('Only students can perform this action.')

    def has_permission(self, request, view):
        return bool(
            request.user and
            request.user.is_authenticated and
            request.user.role == 'student'
        )


class IsOwnerOrReadOnly(BasePermission):
    def has_object_permission(self, request, view, obj):
        if request.method in ('GET', 'HEAD', 'OPTIONS'):
            return True
        return obj == request.user or getattr(obj, 'user', None) == request.user or getattr(obj, 'teacher', None) == request.user

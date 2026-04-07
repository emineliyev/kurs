from django.contrib import admin
from modeltranslation.admin import TranslationAdmin
from .models import Subject, Class, ClassEnrollment


@admin.register(Subject)
class SubjectAdmin(TranslationAdmin):
    list_display = ['name', 'description']
    search_fields = ['name']


@admin.register(Class)
class ClassAdmin(admin.ModelAdmin):
    list_display = ['name', 'teacher', 'grade', 'group', 'student_count', 'is_active', 'created_at']
    list_filter = ['grade', 'group', 'is_active']
    search_fields = ['name', 'teacher__email']


@admin.register(ClassEnrollment)
class ClassEnrollmentAdmin(admin.ModelAdmin):
    list_display = ['student', 'class_room', 'enrolled_at', 'is_active']
    list_filter = ['is_active', 'class_room__teacher']
    search_fields = ['student__first_name', 'student__last_name', 'student__username', 'class_room__name']
    list_editable = ['is_active']
    ordering = ['is_active', '-enrolled_at']

    @admin.action(description='Seçilənləri bərpa et (is_active=True)')
    def restore_enrollments(self, request, queryset):
        queryset.update(is_active=True)

    @admin.action(description='Seçilənləri deaktiv et (is_active=False)')
    def deactivate_enrollments(self, request, queryset):
        queryset.update(is_active=False)

    actions = ['restore_enrollments', 'deactivate_enrollments']

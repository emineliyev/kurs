from django.contrib import admin
from django.utils.html import format_html

from .models import Exam, ExamResult, StudentAnswer


@admin.register(Exam)
class ExamAdmin(admin.ModelAdmin):
    list_display = ['title', 'test', 'class_room', 'start_time', 'end_time', 'is_active']
    list_filter = ['is_active']
    search_fields = ['title', 'test__title', 'class_room__name']
    list_select_related = ['test', 'class_room']
    date_hierarchy = 'start_time'


class StudentAnswerInline(admin.TabularInline):
    model = StudentAnswer
    extra = 0
    can_delete = False
    fields = ['question', 'selected_answer', 'answer_text', 'is_correct', 'points_earned']
    readonly_fields = ['question', 'selected_answer', 'answer_text']

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(ExamResult)
class ExamResultAdmin(admin.ModelAdmin):
    list_display = ['student', 'exam', 'status', 'score', 'percentage_display', 'passed', 'tab_switch_count']
    list_filter = ['status', 'passed']
    search_fields = ['student__email', 'student__first_name', 'student__last_name', 'student__username', 'exam__title']
    list_select_related = ['student', 'exam']
    inlines = [StudentAnswerInline]

    @admin.display(description='Faiz', ordering='percentage')
    def percentage_display(self, obj):
        if obj.percentage is None:
            return '—'
        color = '#16a34a' if obj.passed else '#dc2626'
        return format_html('<b style="color:{}">{}%</b>', color, f'{obj.percentage:.0f}')

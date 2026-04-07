from django.contrib import admin
from .models import Exam, ExamResult, StudentAnswer


@admin.register(Exam)
class ExamAdmin(admin.ModelAdmin):
    list_display = ['title', 'test', 'class_room', 'start_time', 'end_time', 'is_active']
    list_filter = ['is_active']
    search_fields = ['title', 'test__title']


@admin.register(ExamResult)
class ExamResultAdmin(admin.ModelAdmin):
    list_display = ['student', 'exam', 'status', 'score', 'percentage', 'passed', 'tab_switch_count']
    list_filter = ['status', 'passed']
    search_fields = ['student__email', 'exam__title']


@admin.register(StudentAnswer)
class StudentAnswerAdmin(admin.ModelAdmin):
    list_display = ['result', 'question', 'selected_answer', 'is_correct', 'points_earned']

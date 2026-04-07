from django.contrib import admin
from .models import Test, Question, Answer, TestVersion


class AnswerInline(admin.TabularInline):
    model = Answer
    extra = 4


class QuestionInline(admin.StackedInline):
    model = Question
    extra = 0
    show_change_link = True


@admin.register(Test)
class TestAdmin(admin.ModelAdmin):
    list_display = ['title', 'teacher', 'question_count', 'is_published', 'created_at']
    list_filter = ['is_published', 'randomize_questions']
    search_fields = ['title', 'teacher__email']
    inlines = [QuestionInline]


@admin.register(Question)
class QuestionAdmin(admin.ModelAdmin):
    list_display = ['text', 'test', 'question_type', 'points', 'order']
    list_filter = ['question_type']
    inlines = [AnswerInline]

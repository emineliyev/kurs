from django.db import models
from django.utils import timezone
from apps.accounts.models import User
from apps.classes.models import Class
from apps.tests_app.models import Test, Question, Answer


class Exam(models.Model):
    test = models.ForeignKey(Test, on_delete=models.CASCADE, related_name='exams')
    class_room = models.ForeignKey(Class, on_delete=models.CASCADE, related_name='exams')
    title = models.CharField(max_length=300, blank=True)
    start_time = models.DateTimeField()
    end_time = models.DateTimeField()
    duration_minutes = models.PositiveSmallIntegerField(default=60)
    randomize_questions = models.BooleanField(default=False)
    randomize_answers = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-start_time']

    def __str__(self):
        return self.title or self.test.title

    @property
    def is_ongoing(self):
        now = timezone.now()
        return self.start_time <= now <= self.end_time

    @property
    def is_upcoming(self):
        return timezone.now() < self.start_time

    @property
    def is_finished(self):
        return timezone.now() > self.end_time

    def save(self, *args, **kwargs):
        if not self.title:
            self.title = self.test.title if self.test_id else ''
        super().save(*args, **kwargs)


class ExamResult(models.Model):
    STATUS_IN_PROGRESS = 'in_progress'
    STATUS_SUBMITTED = 'submitted'
    STATUS_EXPIRED = 'expired'
    STATUS_CHOICES = [
        (STATUS_IN_PROGRESS, 'In Progress'),
        (STATUS_SUBMITTED, 'Submitted'),
        (STATUS_EXPIRED, 'Expired'),
    ]

    exam = models.ForeignKey(Exam, on_delete=models.CASCADE, related_name='results')
    student = models.ForeignKey(User, on_delete=models.CASCADE, related_name='exam_results')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_IN_PROGRESS)
    score = models.FloatField(null=True, blank=True)
    total_points = models.PositiveSmallIntegerField(default=0)
    percentage = models.FloatField(null=True, blank=True)
    passed = models.BooleanField(null=True, blank=True)
    tab_switch_count = models.PositiveSmallIntegerField(default=0)
    started_at = models.DateTimeField(auto_now_add=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    pdf_report_url = models.URLField(blank=True)

    class Meta:
        unique_together = ['exam', 'student']
        ordering = ['-started_at']

    def __str__(self):
        return f'{self.student.get_full_name()} - {self.exam}'


class StudentAnswer(models.Model):
    result = models.ForeignKey(ExamResult, on_delete=models.CASCADE, related_name='answers')
    question = models.ForeignKey(Question, on_delete=models.CASCADE)
    selected_answer = models.ForeignKey(Answer, on_delete=models.SET_NULL, null=True, blank=True)
    open_text = models.TextField(blank=True)
    answer_text = models.TextField(blank=True, help_text='Student text for short_answer/numeric/long_answer')
    is_correct = models.BooleanField(null=True, blank=True)
    points_earned = models.FloatField(default=0)

    class Meta:
        unique_together = ['result', 'question']

    def __str__(self):
        return f'Answer: {self.result.student.username} - Q{self.question.order}'

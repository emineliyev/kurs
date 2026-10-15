from datetime import timedelta

from django.db import models
from django.utils import timezone
from apps.accounts.models import User
from apps.classes.models import Class
from apps.tests_app.models import Test, Question, Answer


class Exam(models.Model):
    test = models.ForeignKey(Test, on_delete=models.CASCADE, related_name='exams', verbose_name='Test')
    class_room = models.ForeignKey(Class, on_delete=models.CASCADE, related_name='exams', verbose_name='Sinif')
    title = models.CharField(max_length=300, blank=True, verbose_name='Başlıq')
    start_time = models.DateTimeField(verbose_name='Başlama vaxtı')
    end_time = models.DateTimeField(verbose_name='Bitmə vaxtı')
    duration_minutes = models.PositiveSmallIntegerField(default=60, verbose_name='Müddət (dəq.)')
    randomize_questions = models.BooleanField(default=False, verbose_name='Sualları qarışdır')
    randomize_answers = models.BooleanField(default=False, verbose_name='Cavabları qarışdır')
    is_active = models.BooleanField(default=True, verbose_name='Aktiv')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Yaradılıb')

    class Meta:
        verbose_name = 'İmtahan'
        verbose_name_plural = 'İmtahanlar'
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
        (STATUS_IN_PROGRESS, 'Davam edir'),
        (STATUS_SUBMITTED, 'Təhvil verilib'),
        (STATUS_EXPIRED, 'Vaxtı bitib'),
    ]

    exam = models.ForeignKey(Exam, on_delete=models.CASCADE, related_name='results', verbose_name='İmtahan')
    student = models.ForeignKey(User, on_delete=models.CASCADE, related_name='exam_results', verbose_name='Şagird')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_IN_PROGRESS, verbose_name='Status')
    score = models.FloatField(null=True, blank=True, verbose_name='Bal')
    total_points = models.FloatField(default=0, verbose_name='Ümumi bal')
    percentage = models.FloatField(null=True, blank=True, verbose_name='Faiz')
    passed = models.BooleanField(null=True, blank=True, verbose_name='Keçdi')
    tab_switch_count = models.PositiveSmallIntegerField(default=0, verbose_name='Tab dəyişmə sayı')
    started_at = models.DateTimeField(auto_now_add=True, verbose_name='Başlayıb')
    submitted_at = models.DateTimeField(null=True, blank=True, verbose_name='Təhvil verib')
    pdf_report_url = models.URLField(blank=True, verbose_name='PDF hesabat')
    # Answers saved while the student works ({question_id: {...}}, same shape as the exam page keeps them):
    # survive a reload/another device, and are graded if the time runs out before "Submit"
    draft_answers = models.JSONField(default=dict, blank=True, verbose_name='Yadda saxlanmış cavablar')
    auto_submitted = models.BooleanField(default=False, verbose_name='Vaxt bitəndə avtomatik təhvil')
    # Taken on paper; the teacher typed the answers in. Order/letters follow the printed variant.
    is_offline = models.BooleanField(default=False, verbose_name='Kağız üzərində')
    offline_variant = models.CharField(max_length=1, blank=True, verbose_name='Çap variantı')

    # Slack for a slow network between the timer hitting zero and the submit arriving
    GRACE = timedelta(minutes=2)

    class Meta:
        verbose_name = 'İmtahan nəticəsi'
        verbose_name_plural = 'İmtahan nəticələri'
        unique_together = ['exam', 'student']
        ordering = ['-started_at']

    def __str__(self):
        return f'{self.student.get_full_name()} - {self.exam}'

    @property
    def deadline(self):
        """When this student's time is up: their own duration, but never past the exam's end."""
        return min(self.started_at + timedelta(minutes=self.exam.duration_minutes), self.exam.end_time)

    @property
    def is_overdue(self):
        return timezone.now() > self.deadline + self.GRACE


class StudentAnswer(models.Model):
    result = models.ForeignKey(ExamResult, on_delete=models.CASCADE, related_name='answers', verbose_name='Nəticə')
    question = models.ForeignKey(Question, on_delete=models.CASCADE, verbose_name='Sual')
    selected_answer = models.ForeignKey(Answer, on_delete=models.SET_NULL, null=True, blank=True, verbose_name='Seçilmiş cavab')
    open_text = models.TextField(blank=True, verbose_name='Açıq cavab')
    answer_text = models.TextField(blank=True, help_text='Qısa cavab, rəqəm və uzun cavab sualları üçün şagirdin yazdığı', verbose_name='Cavab mətni')
    is_correct = models.BooleanField(null=True, blank=True, verbose_name='Düzgündür')
    points_earned = models.FloatField(default=0, verbose_name='Qazanılan bal')

    class Meta:
        verbose_name = 'Şagird cavabı'
        verbose_name_plural = 'Şagird cavabları'
        unique_together = ['result', 'question']

    def __str__(self):
        return f'{self.result.student.username} — sual {self.question.order}'

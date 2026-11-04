"""One-way announcements from a teacher to students (whole classes and/or chosen students).

The recipients are fixed when the notice is sent (one row each), so a student who joins a class later
doesn't get old notices, and "who has read it" is a simple per-row timestamp.
"""
from datetime import timedelta

from django.db import models
from django.utils import timezone

from apps.accounts.models import User

KEEP_DAYS = 365          # notices older than this are deleted by the daily `purge_old_notices`
BODY_MAX = 2000
TITLE_MAX = 150


class Notice(models.Model):
    teacher = models.ForeignKey(User, on_delete=models.CASCADE, related_name='notices_sent', verbose_name='Müəllim')
    title = models.CharField(max_length=TITLE_MAX, blank=True, verbose_name='Başlıq')
    body = models.TextField(max_length=BODY_MAX, verbose_name='Mətn')
    # the classes it went to — only to show "7A, 7B" to the teacher; recipients are the real list
    class_rooms = models.ManyToManyField('classes.Class', blank=True, related_name='notices', verbose_name='Siniflər')
    created_at = models.DateTimeField(auto_now_add=True, db_index=True, verbose_name='Göndərilib')

    class Meta:
        verbose_name = 'Elan'
        verbose_name_plural = 'Elanlar'
        ordering = ['-created_at']

    def __str__(self):
        return self.title or self.body[:50]

    @classmethod
    def cutoff(cls):
        return timezone.now() - timedelta(days=KEEP_DAYS)


class NoticeRecipient(models.Model):
    notice = models.ForeignKey(Notice, on_delete=models.CASCADE, related_name='recipients', verbose_name='Elan')
    student = models.ForeignKey(User, on_delete=models.CASCADE, related_name='notices', verbose_name='Şagird')
    read_at = models.DateTimeField(null=True, blank=True, verbose_name='Oxunub')

    class Meta:
        verbose_name = 'Alıcı'
        verbose_name_plural = 'Alıcılar'
        constraints = [models.UniqueConstraint(fields=['notice', 'student'], name='notice_once_per_student')]
        # the student's inbox and unread count
        indexes = [models.Index(fields=['student', 'read_at'], name='notice_inbox_idx')]

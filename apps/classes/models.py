from django.db import models
from apps.accounts.models import User


class Subject(models.Model):
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)

    def __str__(self):
        return self.name


class Class(models.Model):
    GRADE_CHOICES = [(i, str(i)) for i in range(1, 12)]
    GROUP_CHOICES = [('I', 'I'), ('II', 'II'), ('III', 'III'), ('IV', 'IV'), ('V', 'V')]

    teacher = models.ForeignKey(User, on_delete=models.CASCADE, related_name='classes')
    # Free text typed by the teacher; Subject rows only feed the suggestions.
    subject = models.CharField(max_length=100, blank=True)
    name = models.CharField(max_length=200)
    grade = models.PositiveSmallIntegerField(choices=GRADE_CHOICES, null=True, blank=True)
    group = models.CharField(max_length=10, choices=GROUP_CHOICES, blank=True)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Class'
        verbose_name_plural = 'Classes'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.name} - Grade {self.grade} {self.group}'

    @property
    def student_count(self):
        return self.enrollments.filter(is_active=True).count()


class ClassEnrollment(models.Model):
    student = models.ForeignKey(User, on_delete=models.CASCADE, related_name='enrollments')
    class_room = models.ForeignKey(Class, on_delete=models.CASCADE, related_name='enrollments')
    enrolled_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = ['student', 'class_room']
        ordering = ['-enrolled_at']

    def __str__(self):
        return f'{self.student.get_full_name()} -> {self.class_room.name}'

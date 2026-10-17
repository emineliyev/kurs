from django.db import models
from apps.accounts.models import User


class Subject(models.Model):
    name = models.CharField(max_length=100, unique=True, verbose_name='Ad')
    description = models.TextField(blank=True, verbose_name='Təsvir')

    class Meta:
        verbose_name = 'Fənn'
        verbose_name_plural = 'Fənlər'

    def __str__(self):
        return self.name


class Class(models.Model):
    GRADE_CHOICES = [(i, str(i)) for i in range(1, 12)]
    GROUP_CHOICES = [('I', 'I'), ('II', 'II'), ('III', 'III'), ('IV', 'IV'), ('V', 'V')]

    teacher = models.ForeignKey(User, on_delete=models.CASCADE, related_name='classes', verbose_name='Müəllim')
    # Free text typed by the teacher; Subject rows only feed the suggestions.
    subject = models.CharField(max_length=100, blank=True, verbose_name='Fənn')
    name = models.CharField(max_length=200, verbose_name='Ad')
    grade = models.PositiveSmallIntegerField(choices=GRADE_CHOICES, null=True, blank=True, verbose_name='Sinif')
    group = models.CharField(max_length=10, choices=GROUP_CHOICES, blank=True, verbose_name='Qrup')
    description = models.TextField(blank=True, verbose_name='Təsvir')
    is_active = models.BooleanField(default=True, verbose_name='Aktiv')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Yaradılıb')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='Yenilənib')

    class Meta:
        verbose_name = 'Sinif'
        verbose_name_plural = 'Siniflər'
        ordering = ['-created_at']

    def __str__(self):
        extra = ' · '.join(str(x) for x in (self.grade, self.group) if x)
        return f'{self.name} ({extra})' if extra else self.name

    @property
    def student_count(self):
        return self.enrollments.filter(is_active=True, student__is_active=True).count()


class ClassEnrollment(models.Model):
    student = models.ForeignKey(User, on_delete=models.CASCADE, related_name='enrollments', verbose_name='Şagird')
    class_room = models.ForeignKey(Class, on_delete=models.CASCADE, related_name='enrollments', verbose_name='Sinif')
    enrolled_at = models.DateTimeField(auto_now_add=True, verbose_name='Qoşulma tarixi')
    is_active = models.BooleanField(default=True, verbose_name='Aktiv')

    class Meta:
        verbose_name = 'Sinif üzvlüyü'
        verbose_name_plural = 'Sinif üzvlükləri'
        unique_together = ['student', 'class_room']
        ordering = ['-enrolled_at']
        constraints = [
            # a student is in one class at most (old memberships stay, inactive, as history)
            models.UniqueConstraint(fields=['student'], condition=models.Q(is_active=True),
                                    name='one_active_class_per_student'),
        ]

    def __str__(self):
        return f'{self.student.get_full_name()} -> {self.class_room.name}'

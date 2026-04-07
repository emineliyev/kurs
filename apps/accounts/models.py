from django.db import models
from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from .managers import UserManager


class User(AbstractBaseUser, PermissionsMixin):
    ROLE_TEACHER = 'teacher'
    ROLE_STUDENT = 'student'
    ROLE_ADMIN   = 'admin'
    ROLE_CHOICES = [
        (ROLE_TEACHER, 'Teacher'),
        (ROLE_STUDENT, 'Student'),
        (ROLE_ADMIN,   'Admin'),
    ]

    email = models.EmailField(unique=True)
    username = models.CharField(max_length=50, unique=True)
    first_name = models.CharField(max_length=100, blank=True, default='')
    last_name = models.CharField(max_length=100, blank=True, default='')
    role = models.CharField(max_length=10, choices=ROLE_CHOICES, blank=True, default='')
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    is_email_verified = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['username']

    objects = UserManager()

    class Meta:
        verbose_name = 'User'
        verbose_name_plural = 'Users'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.get_full_name()} ({self.email})'

    def get_full_name(self):
        return f'{self.first_name} {self.last_name}'.strip()

    @property
    def is_teacher(self):
        return self.role == self.ROLE_TEACHER

    @property
    def is_student(self):
        return self.role == self.ROLE_STUDENT


class TeacherProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='teacher_profile')
    subject = models.ForeignKey(
        'classes.Subject',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='teachers'
    )
    avatar = models.ImageField(upload_to='avatars/teachers/', blank=True, null=True)
    bio = models.TextField(blank=True)
    organization = models.CharField(max_length=200, blank=True)
    phone = models.CharField(max_length=20, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'TeacherProfile: {self.user.get_full_name()}'


class Feedback(models.Model):
    TYPE_BUG        = 'bug'
    TYPE_SUGGESTION = 'suggestion'
    TYPE_COMPLAINT  = 'complaint'
    TYPE_OTHER      = 'other'
    TYPE_CHOICES = [
        (TYPE_BUG,        'Xəta/Bug'),
        (TYPE_SUGGESTION, 'Təklif'),
        (TYPE_COMPLAINT,  'Şikayət'),
        (TYPE_OTHER,      'Digər'),
    ]

    teacher    = models.ForeignKey(User, on_delete=models.CASCADE, related_name='feedbacks')
    type       = models.CharField(max_length=20, choices=TYPE_CHOICES, default=TYPE_OTHER)
    subject    = models.CharField(max_length=200)
    message    = models.TextField()
    is_read    = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'[{self.type}] {self.subject} — {self.teacher.get_full_name()}'


class StudentProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='student_profile')
    avatar = models.ImageField(upload_to='avatars/students/', blank=True, null=True)
    grade = models.PositiveSmallIntegerField(null=True, blank=True)
    parent_email = models.EmailField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'StudentProfile: {self.user.get_full_name()}'

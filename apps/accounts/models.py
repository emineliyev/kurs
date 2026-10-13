from django.db import models
from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from .managers import UserManager


class User(AbstractBaseUser, PermissionsMixin):
    ROLE_TEACHER = 'teacher'
    ROLE_STUDENT = 'student'
    ROLE_ADMIN   = 'admin'
    ROLE_CHOICES = [
        (ROLE_TEACHER, 'Müəllim'),
        (ROLE_STUDENT, 'Şagird'),
        (ROLE_ADMIN,   'Admin'),
    ]

    # Students sign in with username only, so their email stays empty (NULL — unique allows many)
    email = models.EmailField(unique=True, null=True, blank=True, verbose_name='E-poçt')
    username = models.CharField(max_length=50, unique=True, verbose_name='İstifadəçi adı')
    first_name = models.CharField(max_length=100, blank=True, default='', verbose_name='Ad')
    last_name = models.CharField(max_length=100, blank=True, default='', verbose_name='Soyad')
    role = models.CharField(max_length=10, choices=ROLE_CHOICES, blank=True, default='', verbose_name='Rol')
    is_active = models.BooleanField(default=True, verbose_name='Aktiv')
    # The teacher who owns a student account; only that teacher may edit, archive or enroll it
    created_by = models.ForeignKey('self', null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name='created_students', verbose_name='Yaradan müəllim')
    is_staff = models.BooleanField(default=False, verbose_name='Admin panelinə giriş')
    is_email_verified = models.BooleanField(default=False, verbose_name='E-poçt təsdiqlənib')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Qeydiyyat tarixi')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='Yenilənmə tarixi')

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['username']

    objects = UserManager()

    class Meta:
        verbose_name = 'İstifadəçi'
        verbose_name_plural = 'İstifadəçilər'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.get_full_name()} ({self.email or self.username})'

    def save(self, *args, **kwargs):
        if not self.email:
            self.email = None  # '' would collide with the next empty email on the unique index
        super().save(*args, **kwargs)

    def get_full_name(self):
        return f'{self.first_name} {self.last_name}'.strip()

    @property
    def is_teacher(self):
        return self.role == self.ROLE_TEACHER

    @property
    def is_student(self):
        return self.role == self.ROLE_STUDENT


class TeacherProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='teacher_profile', verbose_name='İstifadəçi')
    subject = models.CharField(max_length=100, blank=True, verbose_name='Fənn')
    avatar = models.ImageField(upload_to='avatars/teachers/', blank=True, null=True, verbose_name='Şəkil')
    bio = models.TextField(blank=True, verbose_name='Haqqında')
    organization = models.CharField(max_length=200, blank=True, verbose_name='Təşkilat')
    phone = models.CharField(max_length=20, blank=True, verbose_name='Telefon')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Yaradılıb')

    class Meta:
        verbose_name = 'Müəllim profili'
        verbose_name_plural = 'Müəllim profilləri'

    def __str__(self):
        return self.user.get_full_name() or self.user.email or self.user.username


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

    teacher    = models.ForeignKey(User, on_delete=models.CASCADE, related_name='feedbacks', verbose_name='Müəllim')
    type       = models.CharField(max_length=20, choices=TYPE_CHOICES, default=TYPE_OTHER, verbose_name='Növ')
    subject    = models.CharField(max_length=200, verbose_name='Mövzu')
    message    = models.TextField(verbose_name='Mesaj')
    is_read    = models.BooleanField(default=False, verbose_name='Oxunub')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Tarix')

    class Meta:
        verbose_name = 'Rəy'
        verbose_name_plural = 'Rəylər'
        ordering = ['-created_at']

    def __str__(self):
        return f'[{self.type}] {self.subject} — {self.teacher.get_full_name()}'


class StudentProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='student_profile', verbose_name='İstifadəçi')
    avatar = models.ImageField(upload_to='avatars/students/', blank=True, null=True, verbose_name='Şəkil')
    grade = models.PositiveSmallIntegerField(null=True, blank=True, verbose_name='Sinif')
    parent_email = models.EmailField(blank=True, verbose_name='Valideyn e-poçtu')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Yaradılıb')

    class Meta:
        verbose_name = 'Şagird profili'
        verbose_name_plural = 'Şagird profilləri'

    def __str__(self):
        return self.user.get_full_name() or self.user.username

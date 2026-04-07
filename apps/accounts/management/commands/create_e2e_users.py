"""
Management command: create_e2e_users

Creates seed users for Playwright E2E tests.
Safe to run multiple times (get_or_create).

Usage:
    python manage.py create_e2e_users
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.accounts.models import User, TeacherProfile, StudentProfile
from apps.classes.models import Class, ClassEnrollment


class Command(BaseCommand):
    help = 'Create E2E test seed users (teacher + student)'

    TEACHER = {
        'email':      'e2e_teacher@kursum.az',
        'username':   'e2e_teacher',
        'password':   'E2ETest123!',
        'first_name': 'E2E',
        'last_name':  'Teacher',
        'role':       User.ROLE_TEACHER,
    }

    STUDENT = {
        'email':      'e2e_student@kursum.az',
        'username':   'e2e_student',
        'password':   'E2ETest123!',
        'first_name': 'E2E',
        'last_name':  'Student',
        'role':       User.ROLE_STUDENT,
    }

    def handle(self, *args, **options):
        with transaction.atomic():
            teacher = self._ensure_user(self.TEACHER)
            student = self._ensure_user(self.STUDENT)

            # Ensure profiles exist
            TeacherProfile.objects.get_or_create(user=teacher)
            StudentProfile.objects.get_or_create(user=student)

            # Ensure the teacher has at least one class (required to create tests)
            cls, class_created = Class.objects.get_or_create(
                teacher=teacher,
                name='E2E Test Class',
                defaults={'grade': 10, 'group': 'A', 'is_active': True},
            )
            if class_created:
                self.stdout.write(f'  Created class: {cls.name}')

            # Enroll the E2E student in that class
            ClassEnrollment.objects.get_or_create(student=student, class_room=cls)

        self.stdout.write(self.style.SUCCESS(
            f'E2E users ready:\n'
            f'  Teacher: {self.TEACHER["email"]} / {self.TEACHER["password"]}\n'
            f'  Student: {self.STUDENT["email"]} / {self.STUDENT["password"]}'
        ))

    def _ensure_user(self, data: dict) -> User:
        user, created = User.objects.get_or_create(
            email=data['email'],
            defaults={
                'username':         data['username'],
                'first_name':       data['first_name'],
                'last_name':        data['last_name'],
                'role':             data['role'],
                'is_active':        True,
                'is_email_verified': True,
            },
        )
        # Always reset password so the known value is guaranteed
        user.set_password(data['password'])
        if created:
            action = 'Created'
        else:
            action = 'Updated'
        user.save()
        self.stdout.write(f'  {action}: {user.email}')
        return user

"""
Throw-away data for load testing (see loadtest/locustfile.py). Everything it creates has
a username starting with "loadtest_", so it never touches real accounts.

    python manage.py loadtest_data                      # 20 teachers × 30 students, ongoing exam each
    python manage.py loadtest_data --teachers 10 --students 50 --questions 25
    python manage.py loadtest_data --reset-results      # let the same students take the exams again
    python manage.py loadtest_data --delete             # remove all load-test users and their data
"""
from datetime import timedelta

from django.contrib.auth.hashers import make_password
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.accounts.hashers import STUDENT_HASHER
from apps.accounts.models import StudentProfile, User
from apps.classes.models import Class, ClassEnrollment
from apps.exams.models import Exam, ExamResult
from apps.subscriptions.models import Plan, Subscription
from apps.tests_app.models import Answer, Question, Test

PREFIX = 'loadtest_'
PASSWORD = 'Loadtest-2026!'


class Command(BaseCommand):
    help = 'Create or delete load-test teachers, students, tests and ongoing exams.'

    def add_arguments(self, parser):
        parser.add_argument('--teachers', type=int, default=20)
        parser.add_argument('--students', type=int, default=30, help='Students per teacher')
        parser.add_argument('--questions', type=int, default=20, help='Questions in each exam')
        parser.add_argument('--hours', type=int, default=4, help='How long the exams stay open')
        parser.add_argument('--reset-results', action='store_true')
        parser.add_argument('--delete', action='store_true')

    def handle(self, *args, **o):
        users = User.objects.filter(username__startswith=PREFIX)
        if o['delete']:
            n = users.count()
            for user in users.filter(role=User.ROLE_TEACHER):
                user.delete()  # one by one so question/bank image files are removed too
            users.delete()
            self.stdout.write(self.style.SUCCESS(f'{n} load-test istifadəçisi və onların bütün məlumatları silindi.'))
            return
        if o['reset_results']:
            n, _ = ExamResult.objects.filter(student__username__startswith=PREFIX).delete()
            Exam.objects.filter(class_room__teacher__username__startswith=PREFIX).update(
                start_time=timezone.now() - timedelta(minutes=5), end_time=timezone.now() + timedelta(hours=o['hours']))
            self.stdout.write(self.style.SUCCESS(f'Nəticələr sıfırlandı ({n} sətir), imtahanlar yenidən açıqdır.'))
            return
        if users.exists():
            self.stderr.write('Load-test məlumatları artıq var. Əvvəlcə: python manage.py loadtest_data --delete')
            return

        # hash once — hashing per user would take minutes
        password = make_password(PASSWORD)
        student_password = make_password(PASSWORD, hasher=STUDENT_HASHER)
        plan = Plan.objects.order_by('-price').first()
        now = timezone.now()
        with transaction.atomic():
            for t in range(1, o['teachers'] + 1):
                teacher = User.objects.create(
                    username=f'{PREFIX}t{t}', email=f'{PREFIX}t{t}@loadtest.invalid', password=password,
                    first_name='Yük', last_name=f'Müəllim {t}', role=User.ROLE_TEACHER, is_email_verified=True)
                if plan:
                    Subscription.objects.create(teacher=teacher, plan=plan, status=Subscription.STATUS_ACTIVE,
                                                start_date=now, end_date=now + timedelta(days=30))
                cls = Class.objects.create(teacher=teacher, name=f'Yük sinfi {t}')
                students = User.objects.bulk_create([
                    User(username=f'{PREFIX}s{t}_{s}', email=None, password=student_password, first_name='Şagird',
                         last_name=f'{t}-{s}', role=User.ROLE_STUDENT, created_by=teacher)
                    for s in range(1, o['students'] + 1)
                ])
                StudentProfile.objects.bulk_create([StudentProfile(user=s) for s in students])
                ClassEnrollment.objects.bulk_create([ClassEnrollment(student=s, class_room=cls) for s in students])

                test = Test.objects.create(teacher=teacher, title=f'Yük testi {t}', is_published=True,
                                           published_at=now, randomize_questions=True, randomize_answers=True)
                test.class_rooms.add(cls)
                for q in range(o['questions']):
                    question = Question.objects.create(
                        test=test, question_type=Question.TYPE_MULTIPLE_CHOICE, order=q, points=1,
                        text=f'<p>{q + 1}. {t * 7 + q} + {q * 3} neçədir?</p>')
                    right = t * 7 + q + q * 3
                    Answer.objects.bulk_create([
                        Answer(question=question, text=str(right + d), is_correct=(d == 0), order=i)
                        for i, d in enumerate((0, 1, -1, 10))
                    ])
                Exam.objects.create(test=test, class_room=cls, title=f'Yük imtahanı {t}', duration_minutes=60,
                                    start_time=now - timedelta(minutes=5), end_time=now + timedelta(hours=o['hours']))

        total = o['teachers'] * o['students']
        self.stdout.write(self.style.SUCCESS(
            f"Yaradıldı: {o['teachers']} müəllim, {total} şagird, hər müəllimə {o['questions']} suallıq açıq imtahan.\n"
            f'Girişlər: {PREFIX}t1..t{o["teachers"]} və {PREFIX}s<müəllim>_<nömrə>, şifrə: {PASSWORD}'))

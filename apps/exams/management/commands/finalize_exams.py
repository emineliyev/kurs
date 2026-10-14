"""
Grade exams whose time ran out without "Submit" (student closed the page, lost connection…),
from the answers saved while they worked. Pages also do this lazily; run it from cron so
analytics stay current:  */10 * * * *  python manage.py finalize_exams
"""
from django.core.management.base import BaseCommand

from apps.exams.grading import finalize_overdue
from apps.exams.models import ExamResult


class Command(BaseCommand):
    help = 'Auto-submit in-progress exam results whose time is over.'

    def handle(self, *args, **options):
        qs = ExamResult.objects.filter(status=ExamResult.STATUS_IN_PROGRESS)
        before = qs.count()
        finalize_overdue(qs)
        done = before - ExamResult.objects.filter(status=ExamResult.STATUS_IN_PROGRESS).count()
        self.stdout.write(f'{done} nəticə avtomatik təhvil verildi.')

"""
Re-mark every handed-in short-answer / numeric answer with the current matching rules and recount the
results that changed. Run it after the rules get more forgiving (e.g. "1b 2e 3d" = "1B2E3D"):

    python manage.py regrade_typed_answers --dry-run     # only report what would change
    python manage.py regrade_typed_answers
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.exams.grading import regrade_question
from apps.exams.models import ExamResult
from apps.tests_app.models import Question


class Command(BaseCommand):
    help = 'Re-mark submitted short-answer and numeric answers with the current rules.'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='Report the changes without saving them.')

    def handle(self, *args, **options):
        dry = options['dry_run']
        questions = (Question.objects
                     .filter(question_type__in=Question.AUTO_TEXT_TYPES,
                             studentanswer__result__status=ExamResult.STATUS_SUBMITTED)
                     .distinct())
        answers_changed = results_changed = 0
        with transaction.atomic():
            for q in questions:
                a, r = regrade_question(q)
                answers_changed += a
                results_changed += r
            if dry:
                transaction.set_rollback(True)
        prefix = '[dry-run] ' if dry else ''
        self.stdout.write(f'{prefix}{questions.count()} sual yoxlandı: {answers_changed} cavab dəyişdi, '
                          f'{results_changed} nəticə yenidən hesablandı.')

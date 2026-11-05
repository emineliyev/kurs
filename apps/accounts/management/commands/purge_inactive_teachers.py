"""Warn, then delete, teachers idle for 7 months (run daily from cron). See apps.accounts.inactivity."""
from django.core.management.base import BaseCommand

from apps.accounts import inactivity


class Command(BaseCommand):
    help = 'Send inactivity warnings and delete teachers idle for 7 months.'

    def handle(self, *args, **options):
        warned, deleted = inactivity.run()
        self.stdout.write(self.style.SUCCESS(
            f'purge_inactive_teachers: {warned} warning(s) sent, {deleted} teacher(s) deleted.'))

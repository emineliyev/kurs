"""Delete notices older than a year (run daily, e.g. from cron next to process_subscriptions)."""
from django.core.management.base import BaseCommand

from apps.notices.models import Notice


class Command(BaseCommand):
    help = 'Delete notices older than one year.'

    def handle(self, *args, **options):
        deleted, _ = Notice.objects.filter(created_at__lt=Notice.cutoff()).delete()
        self.stdout.write(self.style.SUCCESS(f'purge_old_notices: {deleted} row(s) deleted.'))

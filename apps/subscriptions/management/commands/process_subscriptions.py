"""
Management command: process_subscriptions
Run daily (e.g. via cron or Celery beat) to:
  1. Apply scheduled downgrades whose billing period has ended.
  2. Expire subscriptions whose end_date has passed.

Usage:
    python manage.py process_subscriptions
"""
from django.core.management.base import BaseCommand
from django.utils import timezone
from apps.subscriptions.models import Subscription


class Command(BaseCommand):
    help = 'Apply pending plan changes and expire outdated subscriptions.'

    def handle(self, *args, **options):
        now = timezone.now()
        processed = 0

        # 1. Apply pending downgrades whose date has arrived
        pending = Subscription.objects.filter(
            pending_plan__isnull=False,
            pending_change_date__lte=now,
        ).select_related('pending_plan')

        for sub in pending:
            self.stdout.write(
                f'Applying downgrade: {sub.teacher} → {sub.pending_plan.display_name}'
            )
            sub.apply_pending_downgrade()
            processed += 1

        # 2. Expire subscriptions that ended without a pending change
        expired = Subscription.objects.filter(
            end_date__lte=now,
            status__in=[Subscription.STATUS_ACTIVE, Subscription.STATUS_TRIAL],
            pending_plan__isnull=True,
        )
        count = expired.update(status=Subscription.STATUS_EXPIRED)
        processed += count

        # 3. Also expire cancelled subscriptions past end_date
        cancelled_expired = Subscription.objects.filter(
            end_date__lte=now,
            status=Subscription.STATUS_CANCELLED,
        )
        count2 = cancelled_expired.update(status=Subscription.STATUS_EXPIRED)
        processed += count2

        self.stdout.write(
            self.style.SUCCESS(f'process_subscriptions: {processed} record(s) processed.')
        )

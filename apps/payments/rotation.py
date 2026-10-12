"""
Which payment requisite (card) to show a teacher.

Each requisite may have a daily_limit of incoming transfers. A transfer is counted
when a pending or approved PaymentRequest names the requisite (rejected ones usually
mean no money arrived). Teachers looking at the payment page hold their card for
HOLD_MINUTES so concurrent visitors aren't sent to a card that is about to fill up.
Counters reset at 00:00 in settings.TIME_ZONE (Asia/Baku).
"""
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from .models import PaymentHold, PaymentRequest, PaymentRequisite

HOLD_MINUTES = 30
COUNTED_STATUSES = (PaymentRequest.STATUS_PENDING, PaymentRequest.STATUS_APPROVED)


def day_start():
    return timezone.localtime().replace(hour=0, minute=0, second=0, microsecond=0)


def transfers_today(requisite):
    return requisite.payment_requests.filter(created_at__gte=day_start(), status__in=COUNTED_STATUSES).count()


def usage(requisite, teacher=None):
    """Transfers today plus other teachers' active holds."""
    holds = requisite.holds.filter(expires_at__gt=timezone.now())
    if teacher is not None:
        holds = holds.exclude(teacher=teacher)
    return transfers_today(requisite) + holds.count()


def has_room(requisite, teacher=None):
    return requisite.daily_limit is None or usage(requisite, teacher) < requisite.daily_limit


def assign_requisites(teacher):
    """
    One requisite per payment method for this teacher.
    Returns (requisites, exhausted_methods).
    """
    now = timezone.now()
    with transaction.atomic():
        active = list(PaymentRequisite.objects.select_for_update().filter(is_active=True).order_by('sort_order', 'id'))
        PaymentHold.objects.filter(expires_at__lte=now).delete()

        groups = {}
        for req in active:
            groups.setdefault(req.method, []).append(req)

        chosen, exhausted = [], []
        for method, group in groups.items():
            # Keep showing the card the teacher already holds while it still has room
            held = PaymentHold.objects.filter(teacher=teacher, requisite__in=group).select_related('requisite').first()
            pick = held.requisite if held and has_room(held.requisite, teacher) else None
            if pick is None:
                pick = next((r for r in group if has_room(r, teacher)), None)
            PaymentHold.objects.filter(teacher=teacher, requisite__in=group).exclude(requisite=pick).delete()
            if pick is None:
                exhausted.append(method)
                continue
            if pick.daily_limit is not None:
                PaymentHold.objects.update_or_create(
                    requisite=pick, teacher=teacher,
                    defaults={'expires_at': now + timedelta(minutes=HOLD_MINUTES)},
                )
            chosen.append(pick)
    return chosen, exhausted


def release_holds(teacher):
    PaymentHold.objects.filter(teacher=teacher).delete()

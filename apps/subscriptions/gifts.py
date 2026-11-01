"""Free plans: what a new teacher starts with, and the admin's gifts."""
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from .models import Plan, SignupGift, Subscription

GIFT_DEFAULT_DAYS = 60


def start_new_teacher(user):
    """A new teacher's first subscription: the running campaign's gift, otherwise the free trial."""
    if Subscription.objects.filter(teacher=user).exists():
        return
    now = timezone.now()
    gift = SignupGift.current()
    if gift:
        Subscription.objects.create(teacher=user, plan=gift.plan, status=Subscription.STATUS_TRIAL, is_gift=True,
                                    start_date=now, end_date=now + timedelta(days=gift.days))
        return
    plan = Plan.objects.filter(name=Plan.PLAN_FREE, is_active=True).first()
    if plan:
        Subscription.objects.create(teacher=user, plan=plan, status=Subscription.STATUS_TRIAL,
                                    start_date=now, end_date=now + timedelta(days=plan.duration_days))


def gift_settings():
    """(plan, days) the admin's gift action gives: the latest campaign's, or Pro for 60 days."""
    gift = SignupGift.objects.select_related('plan').order_by('-id').first()
    if gift:
        return gift.plan, gift.days
    return Plan.objects.filter(name=Plan.PLAN_PRO).first(), GIFT_DEFAULT_DAYS


@transaction.atomic
def grant_gift(teacher, plan, days):
    """Give `plan` for `days` more days. Days already paid for are kept: the gift is added after them.
    Returns the subscription."""
    now = timezone.now()
    sub = Subscription.objects.select_for_update().filter(teacher=teacher).first()
    if sub is None:
        return Subscription.objects.create(teacher=teacher, plan=plan, status=Subscription.STATUS_TRIAL,
                                           is_gift=True, start_date=now, end_date=now + timedelta(days=days))
    paid_running = sub.is_active and not sub.is_gift and sub.status in (Subscription.STATUS_ACTIVE,
                                                                        Subscription.STATUS_CANCELLED)
    if not sub.is_active:
        sub.start_date = now
    sub.end_date = max(sub.end_date, now) + timedelta(days=days)
    sub.plan = plan
    if paid_running:
        sub.status = Subscription.STATUS_ACTIVE          # a paid plan stays paid; the gift just adds days
    else:
        sub.status = Subscription.STATUS_TRIAL
        sub.is_gift = True
    sub.cancelled_at = None
    if sub.pending_plan_id:                               # a scheduled downgrade waits for the new end
        sub.pending_change_date = sub.end_date
    sub.reminder_end, sub.reminder_stage = None, 0
    sub.save()
    return sub

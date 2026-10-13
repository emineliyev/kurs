"""
Site-wide admin setup: Azerbaijani titles, a dashboard on the index page,
and hiding technical sections nobody manages by hand.
"""
from datetime import timedelta

from django.conf import settings
from django.contrib import admin
from django.contrib.auth.models import Group
from django.db.models import Count
from django.utils import timezone

admin.site.site_header = 'Kursum — İdarəetmə paneli'
admin.site.site_title = 'Kursum admin'
admin.site.index_title = 'İdarəetmə lövhəsi'
admin.site.site_url = getattr(settings, 'FRONTEND_URL', '/') or '/'
admin.site.index_template = 'admin/kursum_index.html'


def _hide(*models):
    for model in models:
        try:
            admin.site.unregister(model)
        except admin.sites.NotRegistered:
            pass


_hide(Group)
try:
    from django_celery_beat.models import (
        ClockedSchedule, CrontabSchedule, IntervalSchedule, PeriodicTask, SolarSchedule,
    )
    _hide(PeriodicTask, ClockedSchedule, CrontabSchedule, IntervalSchedule, SolarSchedule)
except ImportError:  # pragma: no cover
    pass


def dashboard_context():
    from apps.accounts.models import Feedback, User
    from apps.exams.models import Exam
    from apps.payments.models import PaymentRequest, PaymentRequisite
    from apps.payments.rotation import transfers_today
    from apps.subscriptions.models import Subscription

    now = timezone.now()
    today = timezone.localdate()
    active_subs = Subscription.objects.filter(
        end_date__gt=now,
        status__in=[Subscription.STATUS_ACTIVE, Subscription.STATUS_TRIAL, Subscription.STATUS_CANCELLED],
    )
    pending = PaymentRequest.objects.filter(status=PaymentRequest.STATUS_PENDING)
    teachers = User.objects.filter(role=User.ROLE_TEACHER)
    return {
        'dash_pending_count': pending.count(),
        'dash_pending': pending.select_related('teacher', 'plan').order_by('created_at')[:6],
        'dash_cards': [
            {'requisite': r, 'used': transfers_today(r), 'limit': r.daily_limit,
             'full': r.daily_limit is not None and transfers_today(r) >= r.daily_limit}
            for r in PaymentRequisite.objects.filter(is_active=True).order_by('sort_order', 'id')
        ],
        'dash_expiring': active_subs.filter(end_date__lte=now + timedelta(days=7))
                                    .select_related('teacher', 'plan').order_by('end_date')[:8],
        'dash_by_plan': active_subs.values('plan__display_name').annotate(n=Count('id')).order_by('-n'),
        'dash_teachers': teachers.count(),
        'dash_new_teachers': teachers.filter(created_at__gte=now - timedelta(days=7)).count(),
        'dash_students': User.objects.filter(role=User.ROLE_STUDENT).count(),
        'dash_exams_today': Exam.objects.filter(start_time__date=today).count(),
        'dash_unread_feedback': Feedback.objects.filter(is_read=False).count(),
    }


_original_index = admin.site.index


def _index_with_dashboard(request, extra_context=None):
    context = dashboard_context()
    context.update(extra_context or {})
    return _original_index(request, extra_context=context)


admin.site.index = _index_with_dashboard

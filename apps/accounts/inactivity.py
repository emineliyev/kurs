"""
Teachers who haven't used the site for 7 months are deleted with all their data.

    day 180 idle  → first warning e-mail (30 days left)
    day 203 idle  → last warning e-mail (7 days left)
    day 210 idle  → deleted (and never sooner than 7 days after the last warning)

Opening the site resets the clock (see touch()). Never deleted: staff/superusers and teachers
with a running paid plan or a payment waiting for review. Payment records are kept, detached
from the deleted teacher. Uploaded files go with their rows (core.media_cleanup).
"""
from datetime import timedelta

from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone

from .models import User

DELETE_AFTER = timedelta(days=210)
WARN_AT = (timedelta(days=180), timedelta(days=203))   # stage 1, stage 2
LAST_WARNING_NOTICE = timedelta(days=7)
TOUCH_EVERY = timedelta(hours=12)


def touch(user):
    """Record that the user is using the site — one write at most every 12 hours."""
    now = timezone.now()
    last = user.last_activity_at
    if last and now - last < TOUCH_EVERY:
        return
    User.objects.filter(pk=user.pk).update(last_activity_at=now, inactivity_warning_stage=0,
                                           inactivity_warned_at=None)
    user.last_activity_at = now
    user.inactivity_warning_stage = 0
    user.inactivity_warned_at = None


def _protected_ids(now):
    """Teachers that are never deleted: a running paid plan or a payment under review."""
    from apps.payments.models import PaymentRequest
    from apps.subscriptions.models import Plan, Subscription
    paid = (Subscription.objects.filter(end_date__gt=now).exclude(plan__name=Plan.PLAN_FREE)
            .exclude(status=Subscription.STATUS_EXPIRED).values_list('teacher_id', flat=True))
    pending = PaymentRequest.objects.filter(status=PaymentRequest.STATUS_PENDING).values_list('teacher_id', flat=True)
    return set(paid) | set(pending)


def candidates(now=None):
    """Idle teachers the rules apply to (protected ones excluded)."""
    now = now or timezone.now()
    return (User.objects.filter(role=User.ROLE_TEACHER, is_staff=False, is_superuser=False,
                                last_activity_at__lt=now - WARN_AT[0])
            .exclude(pk__in=_protected_ids(now)))


def send_warning(user, delete_on, final):
    from apps.email_utils import email_shell, cta_button, greeting, paragraph, note

    name = user.get_full_name() or user.username
    url = f'{settings.FRONTEND_URL}/login'
    when = f'{delete_on:%d.%m.%Y}'
    subject = (f'⚠️ Son xəbərdarlıq: Kursum hesabınız {when} tarixində silinəcək' if final
               else f'Kursum hesabınız {when} tarixində silinəcək')
    text = (f'Siz 6 aydan çoxdur ki, Kursum-a daxil olmamısınız. Platformanın qaydalarına görə 7 ay istifadə '
            f'olunmayan müəllim hesabları bütün məlumatları ilə (testlər, siniflər, şagird hesabları, imtahan '
            f'nəticələri) silinir. Hesabınız {when} tarixində silinəcək.')
    keep = 'Hesabı saxlamaq üçün sadəcə sayta daxil olun — başqa heç nə etmək lazım deyil.'
    plain = f'Salam {name},\n\n{text}\n\n{keep}\n{url}\n\n— Kursum'
    body = (greeting(name) + paragraph(text) + paragraph(keep)
            + cta_button('Sayta daxil ol', url)
            + note('Silinəndən sonra məlumatları bərpa etmək mümkün deyil.'))
    html = email_shell('#dc2626' if final else '#d97706', '⚠️', 'Hesabınız silinəcək', body)
    send_mail(subject, plain, settings.DEFAULT_FROM_EMAIL, [user.email], html_message=html, fail_silently=True)


def delete_teacher(teacher):
    """Delete a teacher, the student accounts they made and everything that hangs off them."""
    from apps.payments.models import PaymentRequest
    label = f'Silinmiş müəllim #{teacher.pk}'
    with transaction.atomic():
        PaymentRequest.objects.filter(teacher=teacher).update(teacher=None, deleted_teacher=label)
        User.objects.filter(created_by=teacher, role=User.ROLE_STUDENT).delete()
        teacher.delete()


def run(now=None):
    """Send the warnings that are due and delete the teachers whose time is up. Returns (warned, deleted)."""
    now = now or timezone.now()
    warned = deleted = 0
    for user in candidates(now).iterator():
        idle = now - user.last_activity_at
        stage = user.inactivity_warning_stage
        if (idle >= DELETE_AFTER and stage >= 2 and user.inactivity_warned_at
                and now - user.inactivity_warned_at >= LAST_WARNING_NOTICE):
            delete_teacher(user)
            deleted += 1
            continue
        due = 2 if idle >= WARN_AT[1] else 1
        if stage >= due:
            continue
        if due == 2:
            delete_on = max(user.last_activity_at + DELETE_AFTER, now + LAST_WARNING_NOTICE)
        else:
            delete_on = user.last_activity_at + DELETE_AFTER
        if user.email:
            send_warning(user, delete_on, final=due == 2)
        User.objects.filter(pk=user.pk).update(inactivity_warning_stage=due, inactivity_warned_at=now)
        warned += 1
    return warned, deleted


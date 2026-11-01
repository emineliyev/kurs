"""'Your plan ends soon' e-mails: 7 days and 1 day before a running plan ends, once each per end date."""
from datetime import timedelta
import math

from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone

from .models import Subscription

STEPS = (7, 1)   # days left when a reminder goes out


def due_step(sub, now):
    """The reminder step (7 or 1) this subscription should get now, or None."""
    days_left = math.ceil((sub.end_date - now).total_seconds() / 86400)
    if days_left < 1:
        return None
    done = sub.reminder_stage if sub.reminder_end == sub.end_date else 0
    for step in reversed(STEPS):              # 1 before 7: the nearest step that's due
        if days_left <= step and (done == 0 or step < done):
            return step
    return None


def send_reminder(sub, days_left):
    from apps.email_utils import email_shell, cta_button, greeting, paragraph, note

    user = sub.teacher
    name = user.get_full_name() or user.username
    url = f'{settings.FRONTEND_URL}/teacher/subscription'
    plan = sub.plan.display_name
    when = 'sabah' if days_left == 1 else f'{days_left} gün sonra'
    what = f'Hədiyyə {plan} planınız' if sub.is_gift else f'{plan} planınız'
    subject = f'⏳ {what} {when} bitir — Kursum'
    text = (f'{what} {sub.end_date:%d.%m.%Y} tarixində bitir. Bundan sonra imtahanlarınıza və nəticələrə baxmaq '
            f'açıq qalacaq, amma yeni test yaratmaq və çap üçün abunəliyi yeniləmək lazımdır.')
    plain = f'Salam {name},\n\n{text}\n\nAbunəliyi yeniləmək: {url}\n\n— Kursum'
    body = (greeting(name) + paragraph(text)
            + cta_button('Abunəliyi yenilə', url)
            + note('Artıq ödəniş etmisinizsə, bu e-poçtu nəzərə almayın.'))
    html = email_shell('#d97706', '⏳', 'Planınız bitir', body)
    send_mail(subject, plain, settings.DEFAULT_FROM_EMAIL, [user.email], html_message=html, fail_silently=True)


def send_due_reminders(now=None):
    """Send every reminder that is due. Returns how many went out."""
    now = now or timezone.now()
    running = (Subscription.objects
               .filter(status__in=[Subscription.STATUS_ACTIVE, Subscription.STATUS_TRIAL],
                       end_date__gt=now, end_date__lte=now + timedelta(days=max(STEPS)))
               .exclude(teacher__email='')
               .select_related('teacher', 'plan'))
    sent = 0
    for sub in running:
        step = due_step(sub, now)
        if step is None:
            continue
        days_left = math.ceil((sub.end_date - now).total_seconds() / 86400)
        send_reminder(sub, days_left)
        Subscription.objects.filter(pk=sub.pk).update(reminder_end=sub.end_date, reminder_stage=step)
        sent += 1
    return sent

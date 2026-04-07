"""
Email notifications for the manual payment system.
"""
import logging
from django.conf import settings
from django.core.mail import send_mail
from apps.email_utils import email_shell, info_table, cta_button, greeting, paragraph, note

logger = logging.getLogger(__name__)

FRONTEND_URL = getattr(settings, 'FRONTEND_URL', '')


def notify_admin_new_request(payment_request):
    """Send email to admin(s) when a new payment request is submitted."""
    admin_emails = getattr(settings, 'ADMIN_EMAILS', [])
    if not admin_emails:
        return

    teacher = payment_request.teacher
    admin_url = f"{settings.BACKEND_URL}/admin/payments/paymentrequest/{payment_request.id}/change/"

    subject = f'[Kursum] Yeni ödəniş sorğusu — {teacher.get_full_name() or teacher.email}'

    plain = (
        f"Yeni ödəniş sorğusu daxil oldu:\n\n"
        f"Müəllim: {teacher.get_full_name()} ({teacher.email})\n"
        f"Plan:    {payment_request.plan.display_name}\n"
        f"Məbləğ: {payment_request.amount} {payment_request.currency}\n"
        f"Növ:    {payment_request.get_order_type_display()}\n"
        f"Tarix:  {payment_request.created_at.strftime('%d.%m.%Y %H:%M')}\n\n"
        f"Admin panel: {admin_url}\n"
    )

    body = (
        paragraph('Yeni bir ödəniş sorğusu daxil oldu. '
                  'Aşağıdakı məlumatları nəzərdən keçirib təsdiq və ya rədd edin.')
        + info_table([
            ('Müəllim', f"{teacher.get_full_name()} &lt;{teacher.email}&gt;"),
            ('Plan',    payment_request.plan.display_name),
            ('Məbləğ', f"{payment_request.amount} {payment_request.currency}"),
            ('Növ',    payment_request.get_order_type_display()),
            ('Tarix',  payment_request.created_at.strftime('%d.%m.%Y %H:%M')),
        ])
        + cta_button('Admin Paneldə Bax', admin_url)
    )

    html = email_shell('#1e40af', '🔔', 'Yeni Ödəniş Sorğusu', body)

    try:
        send_mail(subject, plain, settings.DEFAULT_FROM_EMAIL, admin_emails,
                  html_message=html, fail_silently=True)
    except Exception:
        logger.exception("Failed to send admin notification email")


def notify_user_approved(payment_request):
    """Send email to teacher when their payment is approved."""
    teacher = payment_request.teacher
    if not teacher.email:
        return

    subject = f'✅ Ödənişiniz təsdiqləndi — {payment_request.plan.display_name}'

    plain = (
        f"Salam {teacher.get_full_name() or teacher.username},\n\n"
        f"Ödəniş sorğunuz uğurla təsdiqləndi!\n\n"
        f"Plan:    {payment_request.plan.display_name}\n"
        f"Məbləğ: {payment_request.amount} {payment_request.currency}\n\n"
        f"Abunəliyiniz aktivdir. Platformadan tam istifadə edə bilərsiniz.\n\n"
        f"— Kursum Platforması"
    )

    body = (
        greeting(teacher.get_full_name() or teacher.username)
        + paragraph('Ödəniş sorğunuz uğurla təsdiqləndi. Abunəliyiniz aktivdir '
                    'və platformanın bütün imkanlarından istifadə edə bilərsiniz.')
        + info_table([
            ('Plan',    payment_request.plan.display_name),
            ('Məbləğ', f"{payment_request.amount} {payment_request.currency}"),
        ], bg='#f0fdf4')
        + cta_button('Platformaya Keç', f"{FRONTEND_URL}/teacher", color='#059669')
        + note('Hər hansı sualınız olarsa bizimlə əlaqə saxlayın.')
    )

    html = email_shell('#059669', '✅', 'Ödənişiniz Təsdiqləndi!', body)

    try:
        send_mail(subject, plain, settings.DEFAULT_FROM_EMAIL, [teacher.email],
                  html_message=html, fail_silently=True)
    except Exception:
        logger.exception("Failed to send approval email")


def notify_user_rejected(payment_request):
    """Send email to teacher when their payment is rejected."""
    teacher = payment_request.teacher
    if not teacher.email:
        return

    subject = '❌ Ödəniş sorğunuz rədd edildi'
    reason = payment_request.rejection_reason or 'Ətraflı məlumat üçün bizimlə əlaqə saxlayın.'

    plain = (
        f"Salam {teacher.get_full_name() or teacher.username},\n\n"
        f"Təəssüflər ki, ödəniş sorğunuz rədd edildi.\n\n"
        f"Plan:    {payment_request.plan.display_name}\n"
        f"Məbləğ: {payment_request.amount} {payment_request.currency}\n"
        f"Səbəb:  {reason}\n\n"
        f"Suallarınız üçün bizimlə əlaqə saxlayın.\n\n"
        f"— Kursum Platforması"
    )

    body = (
        greeting(teacher.get_full_name() or teacher.username)
        + paragraph('Təəssüflər ki, ödəniş sorğunuz rədd edildi. '
                    'Ətraflı məlumat aşağıdadır.')
        + info_table([
            ('Plan',    payment_request.plan.display_name),
            ('Məbləğ', f"{payment_request.amount} {payment_request.currency}"),
            ('Səbəb',  reason),
        ], bg='#fff5f5')
        + note('Suallarınız olarsa bizimlə əlaqə saxlayın. '
               'İstəsəniz yeni sorğu da göndərə bilərsiniz.')
    )

    html = email_shell('#dc2626', '❌', 'Sorğunuz Rədd Edildi', body)

    try:
        send_mail(subject, plain, settings.DEFAULT_FROM_EMAIL, [teacher.email],
                  html_message=html, fail_silently=True)
    except Exception:
        logger.exception("Failed to send rejection email")

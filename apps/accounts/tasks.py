from celery import shared_task


@shared_task(ignore_result=True)
def send_verification_email_task(user_id):
    from django.conf import settings
    from django.core import signing
    from django.core.mail import send_mail
    from apps.accounts.models import User
    from apps.email_utils import email_shell, cta_button, greeting, paragraph, note

    try:
        user = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return

    token = signing.dumps({'user_id': user.pk}, salt='email-verify')
    verify_url = f"{settings.FRONTEND_URL}/verify-email?token={token}"
    subject = "📧 Email ünvanınızı təsdiqləyin — Kurs"

    plain = (
        f"Salam {user.get_full_name() or user.username},\n\n"
        f"Aşağıdakı linkə keçərək email ünvanınızı təsdiqləyin:\n\n"
        f"{verify_url}\n\n"
        f"Link 24 saat ərzində etibarlıdır.\n\n"
        f"Əgər bu hesabı siz yaratmamısınızsa, bu emaili nəzərə almayın.\n\n"
        f"— Kurs Platforması"
    )

    body = (
        greeting(user.get_full_name() or user.username)
        + paragraph('Kurs platformasına xoş gəldiniz! Hesabınızı aktivləşdirmək üçün '
                    'aşağıdakı düyməyə klikləyin.')
        + cta_button('Email Ünvanımı Təsdiqlə', verify_url)
        + note('Bu link 24 saat ərzində etibarlıdır. '
               'Əgər bu hesabı siz yaratmamısınızsa, emaili nəzərə almayın.')
    )

    html = email_shell('#1e40af', '📧', 'Email Təsdiqi', body)

    try:
        send_mail(subject, plain, settings.DEFAULT_FROM_EMAIL, [user.email],
                  html_message=html, fail_silently=True)
    except Exception:
        pass


@shared_task(ignore_result=True)
def send_password_reset_email_task(user_id):
    from django.conf import settings
    from django.core import signing
    from django.core.mail import send_mail
    from apps.accounts.models import User
    from apps.email_utils import email_shell, cta_button, greeting, paragraph, note

    try:
        user = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return

    from .tokens import make_reset_token
    token = make_reset_token(user)
    reset_url = f"{settings.FRONTEND_URL}/reset-password?token={token}"
    subject = "🔐 Şifrənizi sıfırlayın — Kurs"

    plain = (
        f"Salam {user.get_full_name() or user.username},\n\n"
        f"Şifrənizi sıfırlamaq üçün aşağıdakı linkə keçin:\n\n"
        f"{reset_url}\n\n"
        f"Link 1 saat ərzində etibarlıdır.\n\n"
        f"Əgər siz bu tələbi göndərməmisinizsə, bu emaili nəzərə almayın.\n\n"
        f"— Kurs Platforması"
    )

    body = (
        greeting(user.get_full_name() or user.username)
        + paragraph('Şifrə sıfırlama tələbi alındı. Yeni şifrə təyin etmək üçün '
                    'aşağıdakı düyməyə klikləyin.')
        + cta_button('Şifrəmi Sıfırla', reset_url, color='#7c3aed')
        + note('Bu link 1 saat ərzində etibarlıdır. '
               'Əgər bu tələbi siz göndərməmisinizsə, emaili nəzərə almayın.')
    )

    html = email_shell('#7c3aed', '🔐', 'Şifrə Sıfırlama', body)

    try:
        send_mail(subject, plain, settings.DEFAULT_FROM_EMAIL, [user.email],
                  html_message=html, fail_silently=True)
    except Exception:
        pass

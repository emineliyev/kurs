from celery import shared_task


@shared_task(ignore_result=True)
def send_admin_notification_task(payment_request_id):
    from apps.payments.models import PaymentRequest
    try:
        pr = PaymentRequest.objects.select_related('teacher', 'plan').get(pk=payment_request_id)
    except PaymentRequest.DoesNotExist:
        return
    from apps.payments.services import notify_admin_new_request
    notify_admin_new_request(pr)


@shared_task(ignore_result=True)
def send_approval_email_task(payment_request_id):
    from apps.payments.models import PaymentRequest
    try:
        pr = PaymentRequest.objects.select_related('teacher', 'plan').get(pk=payment_request_id)
    except PaymentRequest.DoesNotExist:
        return
    from apps.payments.services import notify_user_approved
    notify_user_approved(pr)


@shared_task(ignore_result=True)
def send_rejection_email_task(payment_request_id):
    from apps.payments.models import PaymentRequest
    try:
        pr = PaymentRequest.objects.select_related('teacher', 'plan').get(pk=payment_request_id)
    except PaymentRequest.DoesNotExist:
        return
    from apps.payments.services import notify_user_rejected
    notify_user_rejected(pr)

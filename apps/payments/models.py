import os
import uuid

from django.db import models
from apps.accounts.models import User


def screenshot_path(instance, filename):
    """Random file name: receipts are private, so their URL must not be guessable."""
    ext = os.path.splitext(filename)[1].lower()[:5] or '.jpg'
    return f'payment_screenshots/{uuid.uuid4().hex}{ext}'
from apps.subscriptions.models import Plan


class PaymentRequisite(models.Model):
    """
    Admin-managed payment details shown to users.
    Admin can update these anytime from the Django admin panel.
    """
    METHOD_CARD  = 'card'
    METHOD_IBAN  = 'iban'
    METHOD_M10   = 'm10'
    METHOD_OTHER = 'other'
    METHOD_CHOICES = [
        (METHOD_CARD,  'Bank kartı'),
        (METHOD_IBAN,  'IBAN'),
        (METHOD_M10,   'M10'),
        (METHOD_OTHER, 'Digər'),
    ]

    method         = models.CharField(max_length=20, choices=METHOD_CHOICES, default=METHOD_CARD, verbose_name='Ödəniş üsulu')
    label          = models.CharField(max_length=100, verbose_name='Bank / şirkət adı', help_text='məs. Kapital Bank, M10')
    account_number = models.CharField(max_length=200, verbose_name='Kart / IBAN / nömrə')
    account_name   = models.CharField(max_length=100, verbose_name='Hesab sahibinin adı')
    note           = models.TextField(blank=True, verbose_name='Əlavə qeyd', help_text='İstifadəçiyə göstəriləcək xüsusi təlimat')
    is_active      = models.BooleanField(default=True, verbose_name='Aktiv')
    daily_limit    = models.PositiveSmallIntegerField(
        null=True, blank=True, verbose_name='Gündəlik limit',
        help_text='Gündə neçə köçürmə qəbul edir. Boş qalsa limitsizdir. Bakı vaxtı ilə 00:00-da sıfırlanır.',
    )
    sort_order     = models.PositiveSmallIntegerField(default=0, verbose_name='Sıra')
    updated_at     = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['sort_order', 'method']
        verbose_name = 'Ödəniş rekviziti'
        verbose_name_plural = 'Ödəniş rekvizitləri'

    def __str__(self):
        return f'{self.label} — {self.account_number}'


class PaymentRequest(models.Model):
    """
    Submitted by user after making a manual payment.
    Admin reviews and approves/rejects.
    """
    STATUS_PENDING  = 'pending'
    STATUS_APPROVED = 'approved'
    STATUS_REJECTED = 'rejected'
    STATUS_CHOICES = [
        (STATUS_PENDING,  'Gözləmədə'),
        (STATUS_APPROVED, 'Təsdiqləndi'),
        (STATUS_REJECTED, 'Rədd edildi'),
    ]

    TYPE_NEW_SUB = 'new_sub'
    TYPE_UPGRADE = 'upgrade'
    TYPE_RENEWAL = 'renewal'
    TYPE_CHOICES = [
        (TYPE_NEW_SUB, 'Yeni abunəlik'),
        (TYPE_UPGRADE, 'Yüksəltmə'),
        (TYPE_RENEWAL, 'Yeniləmə'),
    ]

    teacher          = models.ForeignKey(User, on_delete=models.CASCADE, related_name='payment_requests', verbose_name='Müəllim')
    plan             = models.ForeignKey(Plan, on_delete=models.PROTECT, related_name='payment_requests', verbose_name='Plan')
    requisite        = models.ForeignKey(
        PaymentRequisite, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='payment_requests', verbose_name='Rekvizit',
    )
    amount           = models.DecimalField(max_digits=8, decimal_places=2, verbose_name='Məbləğ')
    currency         = models.CharField(max_length=3, default='AZN')
    order_type       = models.CharField(max_length=20, choices=TYPE_CHOICES, default=TYPE_NEW_SUB, verbose_name='Əməliyyat növü')
    status           = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING, verbose_name='Status')

    # User submitted data
    screenshot       = models.ImageField(upload_to=screenshot_path, verbose_name='Ödəniş çeki (screenshot)')
    user_note        = models.TextField(blank=True, verbose_name='İstifadəçi qeydi')

    # Admin review
    reviewed_by      = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='reviewed_payment_requests', verbose_name='Yoxlayan admin'
    )
    reviewed_at      = models.DateTimeField(null=True, blank=True, verbose_name='Yoxlama tarixi')
    rejection_reason = models.TextField(blank=True, verbose_name='Rədd səbəbi')

    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Göndərilmə tarixi')
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Ödəniş sorğusu'
        verbose_name_plural = 'Ödəniş sorğuları'

    def __str__(self):
        return f'{self.teacher.email} — {self.plan.display_name} — {self.get_status_display()}'


class PaymentHold(models.Model):
    """
    A short reservation of a limited requisite for a teacher who is on the payment page,
    so two teachers can't both be sent to a card with one transfer left.
    """
    requisite  = models.ForeignKey(PaymentRequisite, on_delete=models.CASCADE, related_name='holds', verbose_name='Rekvizit')
    teacher    = models.ForeignKey(User, on_delete=models.CASCADE, related_name='payment_holds', verbose_name='Müəllim')
    expires_at = models.DateTimeField(verbose_name='Bitmə vaxtı')

    class Meta:
        verbose_name = 'Rekvizit rezervi'
        verbose_name_plural = 'Rekvizit rezervləri'
        unique_together = ['requisite', 'teacher']

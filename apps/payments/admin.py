from datetime import timedelta

from django.contrib import admin, messages
from django.utils import timezone
from django.utils.html import format_html

from apps.subscriptions.models import Subscription
from .models import PaymentRequisite, PaymentRequest
from .tasks import send_approval_email_task, send_rejection_email_task


# ── PaymentRequisite ──────────────────────────────────────────────────────────

@admin.register(PaymentRequisite)
class PaymentRequisiteAdmin(admin.ModelAdmin):
    list_display  = ['label', 'method_display_badge', 'account_number', 'account_name', 'today_usage', 'daily_limit', 'is_active', 'sort_order']
    list_editable = ['daily_limit', 'is_active', 'sort_order']
    list_filter   = ['method', 'is_active']
    search_fields = ['label', 'account_number', 'account_name']
    ordering      = ['sort_order', 'method']

    fieldsets = (
        ('Rekvizit məlumatları', {
            'fields': ('method', 'label', 'account_number', 'account_name', 'daily_limit', 'is_active', 'sort_order')
        }),
        ('Əlavə', {
            'fields': ('note',),
            'classes': ('collapse',),
        }),
    )

    @admin.display(description='Bu gün')
    def today_usage(self, obj):
        from .rotation import transfers_today
        used = transfers_today(obj)
        if obj.daily_limit is None:
            return f'{used} / ∞'
        color = '#dc2626' if used >= obj.daily_limit else '#059669'
        return format_html('<b style="color:{}">{} / {}</b>', color, used, obj.daily_limit)

    @admin.display(description='Üsul')
    def method_display_badge(self, obj):
        colors = {'card': '#1d4ed8', 'iban': '#059669', 'm10': '#d97706', 'other': '#6b7280'}
        color = colors.get(obj.method, '#6b7280')
        return format_html(
            '<span style="background:{};color:white;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600">{}</span>',
            color, obj.get_method_display()
        )


# ── PaymentRequest ────────────────────────────────────────────────────────────

@admin.register(PaymentRequest)
class PaymentRequestAdmin(admin.ModelAdmin):
    list_display  = [
        'id', 'teacher_link', 'plan', 'amount_display', 'requisite',
        'order_type_badge', 'status_badge', 'screenshot_thumb',
        'created_at',
    ]
    list_filter   = ['status', 'order_type', 'plan']
    search_fields = ['teacher__email', 'teacher__first_name', 'teacher__last_name']
    ordering      = ['-created_at']
    actions       = ['approve_payments', 'reject_payments']
    readonly_fields = [
        'teacher', 'plan', 'requisite', 'amount', 'currency', 'order_type',
        'screenshot_preview', 'user_note', 'created_at', 'updated_at',
        'reviewed_by', 'reviewed_at',
    ]

    fieldsets = (
        ('Sorğu məlumatları', {
            'fields': ('teacher', 'plan', 'requisite', 'amount', 'currency', 'order_type', 'created_at')
        }),
        ('İstifadəçi yükləməsi', {
            'fields': ('screenshot_preview', 'user_note')
        }),
        ('Admin qərari', {
            'fields': ('status', 'rejection_reason', 'reviewed_by', 'reviewed_at')
        }),
    )

    def save_model(self, request, obj, form, change):
        """Auto-set reviewed_by and reviewed_at when status changes."""
        if change:
            old = PaymentRequest.objects.get(pk=obj.pk)
            status_changed = old.status != obj.status
            if status_changed:
                obj.reviewed_by = request.user
                obj.reviewed_at = timezone.now()
                super().save_model(request, obj, form, change)
                if obj.status == PaymentRequest.STATUS_APPROVED:
                    self._activate_subscription(obj)
                    send_approval_email_task.delay(obj.pk)
                    messages.success(request, f'{obj.teacher.email} üçün abunəlik aktivləşdirildi.')
                elif obj.status == PaymentRequest.STATUS_REJECTED:
                    send_rejection_email_task.delay(obj.pk)
                return
        super().save_model(request, obj, form, change)

    # ── Bulk actions ──────────────────────────────────────────────────────────

    @admin.action(description='✅ Seçilmiş sorğuları təsdiqlə')
    def approve_payments(self, request, queryset):
        pending = queryset.filter(status=PaymentRequest.STATUS_PENDING)
        count = 0
        for pr in pending:
            pr.status      = PaymentRequest.STATUS_APPROVED
            pr.reviewed_by = request.user
            pr.reviewed_at = timezone.now()
            pr.save(update_fields=['status', 'reviewed_by', 'reviewed_at'])
            self._activate_subscription(pr)
            send_approval_email_task.delay(pr.pk)
            count += 1
        self.message_user(request, f'{count} ödəniş təsdiqləndi, abunəliklər aktivləşdirildi.', messages.SUCCESS)

    @admin.action(description='❌ Seçilmiş sorğuları rədd et')
    def reject_payments(self, request, queryset):
        pending = queryset.filter(status=PaymentRequest.STATUS_PENDING)
        count = 0
        for pr in pending:
            pr.status      = PaymentRequest.STATUS_REJECTED
            pr.reviewed_by = request.user
            pr.reviewed_at = timezone.now()
            if not pr.rejection_reason:
                pr.rejection_reason = 'Ödəniş təsdiqlənmədi.'
            pr.save(update_fields=['status', 'reviewed_by', 'reviewed_at', 'rejection_reason'])
            send_rejection_email_task.delay(pr.pk)
            count += 1
        self.message_user(request, f'{count} sorğu rədd edildi.', messages.WARNING)

    # ── Subscription activation ───────────────────────────────────────────────

    def _activate_subscription(self, payment_request):
        now  = timezone.now()
        plan = payment_request.plan
        try:
            if payment_request.order_type == PaymentRequest.TYPE_UPGRADE:
                sub = Subscription.objects.get(teacher=payment_request.teacher)
                sub.apply_upgrade(plan)
                sub.payment_reference = f'manual:{payment_request.id}'
                sub.save(update_fields=['payment_reference'])
            else:
                # paying again for the same plan before it runs out: the new period follows the
                # current one, so the days already paid for aren't lost
                current = Subscription.objects.filter(teacher=payment_request.teacher).first()
                start = now
                if current is not None and current.plan_id == plan.id and current.is_active and current.end_date > now:
                    start = current.end_date
                Subscription.objects.update_or_create(
                    teacher=payment_request.teacher,
                    defaults={
                        'plan':                  plan,
                        'status':                Subscription.STATUS_ACTIVE,
                        'start_date':            now if start == now else current.start_date,
                        'end_date':              start + timedelta(days=plan.duration_days),
                        'payment_reference':     f'manual:{payment_request.id}',
                        'tests_used_this_month': 0,
                        'exams_used_this_month': 0,
                        'pending_plan':          None,
                        'pending_change_date':   None,
                        'cancelled_at':          None,
                    }
                )
        except Exception:
            import logging
            logging.getLogger(__name__).exception(
                f'Subscription activation failed for PaymentRequest {payment_request.id}'
            )

    # ── Display helpers ───────────────────────────────────────────────────────

    @admin.display(description='Müəllim')
    def teacher_link(self, obj):
        return format_html('<b>{}</b><br/><small style="color:#6b7280">{}</small>',
                           obj.teacher.get_full_name() or '—', obj.teacher.email)

    @admin.display(description='Məbləğ')
    def amount_display(self, obj):
        return format_html('<b>{} {}</b>', obj.amount, obj.currency)

    @admin.display(description='Növ')
    def order_type_badge(self, obj):
        colors = {'new_sub': '#1d4ed8', 'upgrade': '#059669', 'renewal': '#d97706'}
        color = colors.get(obj.order_type, '#6b7280')
        return format_html(
            '<span style="background:{};color:white;padding:2px 7px;border-radius:4px;font-size:11px">{}</span>',
            color, obj.get_order_type_display()
        )

    @admin.display(description='Status')
    def status_badge(self, obj):
        configs = {
            'pending':  ('#f59e0b', '⏳ Gözləmədə'),
            'approved': ('#10b981', '✅ Təsdiqləndi'),
            'rejected': ('#ef4444', '❌ Rədd edildi'),
        }
        color, label = configs.get(obj.status, ('#6b7280', obj.status))
        return format_html(
            '<span style="background:{};color:white;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600">{}</span>',
            color, label
        )

    # Receipts are private (/media/payment_screenshots/ is closed in nginx): the admin gets them
    # through this view, which only staff can open
    def get_urls(self):
        from django.urls import path
        return [
            path('<int:pk>/screenshot/', self.admin_site.admin_view(self.screenshot_view),
                 name='payments_paymentrequest_screenshot'),
        ] + super().get_urls()

    def screenshot_view(self, request, pk):
        from django.http import FileResponse, Http404
        obj = self.get_object(request, pk)
        if obj is None or not obj.screenshot or not self.has_view_permission(request, obj):
            raise Http404
        return FileResponse(obj.screenshot.open('rb'))

    def _screenshot_url(self, obj):
        from django.urls import reverse
        return reverse('admin:payments_paymentrequest_screenshot', args=[obj.pk])

    @admin.display(description='Çek')
    def screenshot_thumb(self, obj):
        if obj.screenshot:
            url = self._screenshot_url(obj)
            return format_html(
                '<a href="{}" target="_blank">'
                '<img src="{}" style="height:40px;width:56px;object-fit:cover;border-radius:4px;border:1px solid #e2e8f0"/>'
                '</a>',
                url, url
            )
        return '—'

    @admin.display(description='Çek (böyük)')
    def screenshot_preview(self, obj):
        if obj.screenshot:
            url = self._screenshot_url(obj)
            return format_html(
                '<a href="{}" target="_blank">'
                '<img src="{}" style="max-height:400px;max-width:600px;border-radius:8px;border:1px solid #e2e8f0"/>'
                '</a><br/><a href="{}" target="_blank">Tam ölçüdə aç →</a>',
                url, url, url
            )
        return 'Yüklənməyib'

    def has_add_permission(self, request):
        return False  # Only users can submit payment requests

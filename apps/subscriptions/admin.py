from datetime import timedelta

from django.contrib import admin
from django.utils import timezone
from django.utils.html import format_html

from .models import Plan, SignupGift, Subscription


def gift_action(teachers_of):
    """Admin action: give the gift plan (the campaign's plan and days, else Pro · 60 days) to the
    teachers behind the selected rows. Paid days are kept — the gift is added after them."""
    @admin.action(description='🎁 Hədiyyə ver (kampaniya ayarına görə, yoxdursa Pro · 60 gün)')
    def action(modeladmin, request, queryset):
        from apps.subscriptions.gifts import gift_settings, grant_gift
        plan, days = gift_settings()
        if plan is None:
            modeladmin.message_user(request, 'Hədiyyə planı tapılmadı (Pro planı yoxdur).', level='error')
            return
        teachers = [t for t in teachers_of(queryset) if t.is_teacher]
        for t in teachers:
            grant_gift(t, plan, days)
        modeladmin.message_user(request, f'{len(teachers)} müəllimə {plan.display_name} · {days} gün hədiyyə edildi.')
    action.__name__ = 'gift_plan'
    return action


def _limit(value):
    return '∞ Limitsiz' if value == -1 else value


@admin.register(Plan)
class PlanAdmin(admin.ModelAdmin):
    list_display = ['display_name', 'price', 'students', 'classes', 'exams', 'duration_days', 'active_count', 'is_active']
    list_filter = ['is_active']
    ordering = ['price']
    exclude = ['max_tests_per_month']  # tests are unlimited on every plan
    fieldsets = (
        (None, {'fields': ('name', 'display_name', 'price', 'duration_days', 'is_active')}),
        ('Limitlər (-1 = limitsiz)', {'fields': ('max_students', 'max_classes', 'max_exams_per_month')}),
        ('Təsvir', {'fields': ('description',)}),
    )

    @admin.display(description='Şagird', ordering='max_students')
    def students(self, obj):
        return _limit(obj.max_students)

    @admin.display(description='Sinif', ordering='max_classes')
    def classes(self, obj):
        return _limit(obj.max_classes)

    @admin.display(description='İmtahan / ay', ordering='max_exams_per_month')
    def exams(self, obj):
        return _limit(obj.max_exams_per_month)

    @admin.display(description='Aktiv abunəçi')
    def active_count(self, obj):
        return obj.subscriptions.filter(end_date__gt=timezone.now()).count()


STATUS_COLORS = {
    Subscription.STATUS_ACTIVE: '#16a34a',
    Subscription.STATUS_TRIAL: '#2563eb',
    Subscription.STATUS_CANCELLED: '#d97706',
    Subscription.STATUS_EXPIRED: '#dc2626',
}


def _switch_plan_action(plan_name, label):
    @admin.action(description=f'Plana keçir: {label} (bu gündən)')
    def action(modeladmin, request, queryset):
        plan = Plan.objects.filter(name=plan_name).first()
        if plan is None:
            modeladmin.message_user(request, f'"{label}" planı tapılmadı.', level='error')
            return
        now = timezone.now()
        status = Subscription.STATUS_TRIAL if plan.price == 0 else Subscription.STATUS_ACTIVE
        n = queryset.update(plan=plan, status=status, start_date=now,
                            end_date=now + timedelta(days=plan.duration_days),
                            pending_plan=None, pending_change_date=None, cancelled_at=None)
        modeladmin.message_user(request, f'{n} abunəlik "{plan.display_name}" planına keçirildi.')
    action.__name__ = f'switch_to_{plan_name}'
    return action


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = ['teacher', 'plan', 'status_badge', 'is_gift', 'end_date', 'days_left', 'exams_used_this_month']
    list_filter = ['status', 'plan', 'is_gift']
    search_fields = ['teacher__email', 'teacher__first_name', 'teacher__last_name']
    list_select_related = ['teacher', 'plan']
    autocomplete_fields = ['teacher']
    readonly_fields = ['created_at', 'updated_at']
    ordering = ['end_date']
    actions = ['extend_30_days', _switch_plan_action('standard', 'Standard'), _switch_plan_action('pro', 'Pro'),
               gift_action(lambda qs: [s.teacher for s in qs.select_related('teacher')])]

    @admin.display(description='Status', ordering='status')
    def status_badge(self, obj):
        status = obj.status if obj.is_active or obj.status == Subscription.STATUS_EXPIRED else Subscription.STATUS_EXPIRED
        label = obj.get_status_display() if status == obj.status else 'Bitib'
        return format_html('<b style="color:{}">{}</b>', STATUS_COLORS.get(status, '#64748b'), label)

    @admin.display(description='Qalan gün')
    def days_left(self, obj):
        days = obj.days_remaining
        color = '#dc2626' if days <= 3 else '#d97706' if days <= 7 else 'inherit'
        return format_html('<span style="color:{}">{}</span>', color, days)

    @admin.action(description='⏩ 30 gün uzat')
    def extend_30_days(self, request, queryset):
        now = timezone.now()
        for sub in queryset:
            sub.end_date = max(sub.end_date, now) + timedelta(days=30)
            if sub.status in (Subscription.STATUS_EXPIRED, Subscription.STATUS_CANCELLED):
                sub.status = Subscription.STATUS_ACTIVE
                sub.cancelled_at = None
            sub.save(update_fields=['end_date', 'status', 'cancelled_at'])
        self.message_user(request, f'{queryset.count()} abunəlik 30 gün uzadıldı.')


@admin.register(SignupGift)
class SignupGiftAdmin(admin.ModelAdmin):
    """The sign-up campaign: switch it on, pick the plan and days, optionally a last day."""
    list_display = ['__str__', 'is_active', 'running', 'ends_on', 'created_at']
    list_editable = ['is_active']
    fields = ['is_active', 'plan', 'days', 'ends_on']

    @admin.display(description='İndi işləyir', boolean=True)
    def running(self, obj):
        current = SignupGift.current()
        return current is not None and current.pk == obj.pk

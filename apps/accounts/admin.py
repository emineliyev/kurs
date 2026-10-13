from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.utils import timezone
from django.utils.html import format_html

from apps.payments.models import PaymentRequest
from apps.subscriptions.models import Subscription
from .models import User, TeacherProfile, StudentProfile, Feedback


# ── Inlines shown on a user's page ────────────────────────────────────────────

class TeacherProfileInline(admin.StackedInline):
    model = TeacherProfile
    can_delete = False
    extra = 0
    fields = ['subject', 'organization', 'phone', 'bio']


class StudentProfileInline(admin.StackedInline):
    model = StudentProfile
    can_delete = False
    extra = 0
    fields = ['grade', 'parent_email']


class SubscriptionInline(admin.StackedInline):
    model = Subscription
    fk_name = 'teacher'
    can_delete = False
    extra = 0
    fields = [('plan', 'status'), ('start_date', 'end_date'), 'exams_used_this_month', 'payment_reference']
    readonly_fields = ['exams_used_this_month']


class PaymentRequestInline(admin.TabularInline):
    model = PaymentRequest
    fk_name = 'teacher'
    extra = 0
    can_delete = False
    show_change_link = True
    fields = ['created_at', 'plan', 'amount', 'requisite', 'status']
    readonly_fields = fields
    ordering = ['-created_at']
    verbose_name_plural = 'Ödəniş sorğuları'

    def has_add_permission(self, request, obj=None):
        return False


# ── Filters ───────────────────────────────────────────────────────────────────

class SubscriptionStateFilter(admin.SimpleListFilter):
    title = 'Abunəlik'
    parameter_name = 'sub'

    def lookups(self, request, model_admin):
        return [('active', 'Aktiv'), ('trial', 'Sınaq'), ('expired', 'Bitib'), ('none', 'Abunəlik yoxdur')]

    def queryset(self, request, queryset):
        now = timezone.now()
        if self.value() == 'active':
            return queryset.filter(subscription__end_date__gt=now).exclude(subscription__status=Subscription.STATUS_TRIAL)
        if self.value() == 'trial':
            return queryset.filter(subscription__end_date__gt=now, subscription__status=Subscription.STATUS_TRIAL)
        if self.value() == 'expired':
            return queryset.filter(subscription__end_date__lte=now)
        if self.value() == 'none':
            return queryset.filter(role=User.ROLE_TEACHER, subscription__isnull=True)
        return queryset


# ── Users ─────────────────────────────────────────────────────────────────────

@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ['email', 'full_name', 'role', 'plan_info', 'is_active', 'is_email_verified', 'created_at']
    list_filter = ['role', SubscriptionStateFilter, 'is_active', 'is_email_verified', 'is_staff']
    list_editable = ['is_email_verified']
    search_fields = ['email', 'username', 'first_name', 'last_name']
    ordering = ['-created_at']
    list_select_related = ['subscription__plan']
    actions = ['activate_users', 'block_users', 'mark_email_verified', 'mark_email_unverified']
    fieldsets = (
        (None, {'fields': ('email', 'username', 'password')}),
        ('Şəxsi məlumat', {'fields': ('first_name', 'last_name', 'role')}),
        ('İcazələr', {
            'fields': ('is_active', 'is_email_verified', 'is_staff', 'is_superuser', 'groups', 'user_permissions'),
            'classes': ('collapse',),
        }),
    )
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('email', 'username', 'first_name', 'last_name', 'role', 'password1', 'password2'),
        }),
    )

    def get_inlines(self, request, obj):
        if obj is None:
            return []
        if obj.is_teacher:
            return [TeacherProfileInline, SubscriptionInline, PaymentRequestInline]
        if obj.is_student:
            return [StudentProfileInline]
        return []

    @admin.display(description='Ad Soyad')
    def full_name(self, obj):
        return obj.get_full_name() or '—'

    @admin.display(description='Plan / bitmə')
    def plan_info(self, obj):
        if not obj.is_teacher:
            return '—'
        sub = getattr(obj, 'subscription', None)
        if sub is None:
            return format_html('<span style="color:#d97706">Abunəlik yoxdur</span>')
        color = '#16a34a' if sub.is_active else '#dc2626'
        return format_html('{} <span style="color:{}">· {}</span>',
                           sub.plan.display_name, color, sub.end_date.strftime('%d.%m.%Y'))

    @admin.action(description='✅ Aktivləşdir')
    def activate_users(self, request, queryset):
        n = queryset.update(is_active=True)
        self.message_user(request, f'{n} istifadəçi aktivləşdirildi.')

    @admin.action(description='⛔ Blokla (daxil ola bilməz)')
    def block_users(self, request, queryset):
        n = queryset.exclude(pk=request.user.pk).update(is_active=False)
        self.message_user(request, f'{n} istifadəçi bloklandı.')

    @admin.action(description='E-poçtu təsdiqlənmiş et')
    def mark_email_verified(self, request, queryset):
        updated = queryset.update(is_email_verified=True)
        self.message_user(request, f'{updated} istifadəçinin e-poçtu təsdiqləndi.')

    @admin.action(description='E-poçt təsdiqini ləğv et')
    def mark_email_unverified(self, request, queryset):
        updated = queryset.update(is_email_verified=False)
        self.message_user(request, f'{updated} istifadəçinin e-poçt təsdiqi ləğv edildi.')


@admin.register(TeacherProfile)
class TeacherProfileAdmin(admin.ModelAdmin):
    list_display = ['user', 'subject', 'organization', 'phone', 'created_at']
    search_fields = ['user__email', 'user__first_name', 'user__last_name', 'organization', 'subject']


@admin.register(StudentProfile)
class StudentProfileAdmin(admin.ModelAdmin):
    list_display = ['user', 'grade', 'parent_email', 'created_at']
    search_fields = ['user__email', 'user__first_name', 'user__last_name', 'user__username']


@admin.register(Feedback)
class FeedbackAdmin(admin.ModelAdmin):
    list_display  = ['subject', 'teacher', 'type', 'short_message', 'is_read', 'created_at']
    list_filter   = ['is_read', 'type']
    list_editable = ['is_read']
    search_fields = ['teacher__email', 'teacher__first_name', 'subject', 'message']
    readonly_fields = ['teacher', 'type', 'subject', 'message', 'created_at']
    actions = ['mark_read', 'mark_unread']

    @admin.display(description='Mesaj')
    def short_message(self, obj):
        return (obj.message[:80] + '…') if len(obj.message) > 80 else obj.message

    @admin.action(description='Oxunmuş kimi qeyd et')
    def mark_read(self, request, queryset):
        self.message_user(request, f'{queryset.update(is_read=True)} rəy oxunmuş kimi qeyd edildi.')

    @admin.action(description='Oxunmamış kimi qeyd et')
    def mark_unread(self, request, queryset):
        self.message_user(request, f'{queryset.update(is_read=False)} rəy oxunmamış kimi qeyd edildi.')


from . import admin_site  # noqa: E402,F401  — titles, dashboard, hidden sections

from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.db.models import Count, IntegerField, OuterRef, Subquery, Value
from django.db.models.functions import Coalesce
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


def _count(qs):
    """A per-teacher count as a subquery (no join fan-out when several counts sit side by side)."""
    return Coalesce(Subquery(qs.order_by().values('_t').annotate(n=Count('pk')).values('n')[:1],
                             output_field=IntegerField()), Value(0))


def with_teacher_stats(queryset):
    """Students (active), classes (active), exams and handed-in results of every teacher in the list."""
    from apps.classes.models import Class
    from apps.exams.models import Exam, ExamResult
    me = OuterRef('pk')
    return queryset.annotate(
        n_students=_count(User.objects.filter(created_by=me, role=User.ROLE_STUDENT, is_active=True)
                          .annotate(_t=Value(1))),
        n_classes=_count(Class.objects.filter(teacher=me, is_active=True).annotate(_t=Value(1))),
        n_exams=_count(Exam.objects.filter(class_room__teacher=me).annotate(_t=Value(1))),
        n_results=_count(ExamResult.objects.filter(exam__class_room__teacher=me)
                         .exclude(status=ExamResult.STATUS_IN_PROGRESS).annotate(_t=Value(1))),
    )


class TeacherActivityFilter(admin.SimpleListFilter):
    """Who actually uses it: teachers with no exam yet are the ones to call or help."""
    title = 'Fəallıq'
    parameter_name = 'activity'

    def lookups(self, request, model_admin):
        return [('none', 'Heç imtahan verməyib'), ('no_students', 'Şagird əlavə etməyib'), ('used', 'İmtahan keçirib')]

    def queryset(self, request, queryset):
        v = self.value()
        if not v:
            return queryset
        queryset = queryset.filter(role=User.ROLE_TEACHER)
        if v == 'none':
            return queryset.filter(n_exams=0)
        if v == 'no_students':
            return queryset.filter(n_students=0)
        return queryset.filter(n_exams__gt=0)


class SharedSignupIPFilter(admin.SimpleListFilter):
    """Teachers who signed up from an address that 3+ teacher accounts came from — the usual sign of
    someone opening new accounts for new free trials. Click an IP in the list to see all of them."""
    title = 'Eyni IP-dən qeydiyyat'
    parameter_name = 'shared_ip'

    def lookups(self, request, model_admin):
        return [('3', '3+ müəllim hesabı'), ('5', '5+ müəllim hesabı')]

    def queryset(self, request, queryset):
        if not self.value():
            return queryset
        from django.db.models import Count
        busy = (User.objects.filter(role=User.ROLE_TEACHER, signup_ip__isnull=False)
                .values('signup_ip').annotate(n=Count('id')).filter(n__gte=int(self.value()))
                .values('signup_ip'))
        return queryset.filter(role=User.ROLE_TEACHER, signup_ip__in=busy)


class InactivityFilter(admin.SimpleListFilter):
    title = 'Aktivsizlik'
    parameter_name = 'idle'

    def lookups(self, request, model_admin):
        return [('soon', 'Silinməyə namizəd (6+ ay gəlməyib)'), ('warned', 'Xəbərdarlıq göndərilib')]

    def queryset(self, request, queryset):
        from . import inactivity
        if self.value() == 'soon':
            return queryset.filter(pk__in=inactivity.candidates().values('pk'))
        if self.value() == 'warned':
            return queryset.filter(pk__in=inactivity.candidates().values('pk'), inactivity_warning_stage__gt=0)
        return queryset


# ── Users ─────────────────────────────────────────────────────────────────────

@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ['email', 'full_name', 'role', 'plan_info', 'students_count', 'classes_count', 'exams_count',
                    'results_count', 'last_activity_at', 'is_active', 'is_email_verified', 'signup_ip_link', 'created_at']
    list_filter = ['role', SubscriptionStateFilter, TeacherActivityFilter, InactivityFilter, SharedSignupIPFilter, 'is_active',
                   'is_email_verified', 'is_staff']
    list_editable = ['is_email_verified']
    search_fields = ['email', 'username', 'first_name', 'last_name', 'signup_ip']
    ordering = ['-created_at']
    list_select_related = ['subscription__plan', 'created_by']
    autocomplete_fields = ['created_by']
    actions = ['activate_users', 'block_users', 'mark_email_verified', 'mark_email_unverified', 'gift_plan']
    fieldsets = (
        (None, {'fields': ('email', 'username', 'password')}),
        ('Şəxsi məlumat', {'fields': ('first_name', 'last_name', 'role', 'created_by', 'signup_ip', 'last_activity_at')}),
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

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        # the counts are only for the list page (sortable columns and the activity filter)
        if request.resolver_match and request.resolver_match.url_name.endswith('changelist'):
            qs = with_teacher_stats(qs)
        return qs

    def _stat(self, obj, field):
        return getattr(obj, field, None) if obj.is_teacher else None

    @admin.display(description='Şagird', ordering='n_students', empty_value='')
    def students_count(self, obj):
        return self._stat(obj, 'n_students')

    @admin.display(description='Sinif', ordering='n_classes', empty_value='')
    def classes_count(self, obj):
        return self._stat(obj, 'n_classes')

    @admin.display(description='İmtahan', ordering='n_exams', empty_value='')
    def exams_count(self, obj):
        return self._stat(obj, 'n_exams')

    @admin.display(description='Nəticə', ordering='n_results', empty_value='')
    def results_count(self, obj):
        # handed-in results: how many students actually wrote this teacher's exams
        return self._stat(obj, 'n_results')

    @admin.display(description='Qeydiyyat IP', ordering='signup_ip')
    def signup_ip_link(self, obj):
        # click: every account that signed up from the same address
        if not obj.signup_ip:
            return '—'
        from django.utils.html import format_html
        return format_html('<a href="?q={}">{}</a>', obj.signup_ip, obj.signup_ip)

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
        if obj.is_student:
            return f'Müəllim: {obj.created_by}' if obj.created_by_id else '—'
        if not obj.is_teacher:
            return '—'
        sub = getattr(obj, 'subscription', None)
        if sub is None:
            return format_html('<span style="color:{}">{}</span>', '#d97706', 'Abunəlik yoxdur')
        color = '#16a34a' if sub.is_active else '#dc2626'
        return format_html('{}{} <span style="color:{}">· {}</span>', '🎁 ' if sub.is_gift else '',
                           sub.plan.display_name, color, sub.end_date.strftime('%d.%m.%Y'))

    def gift_plan(self, request, queryset):
        from apps.subscriptions.admin import gift_action
        return gift_action(lambda qs: list(qs))(self, request, queryset)
    gift_plan.short_description = '🎁 Hədiyyə ver (kampaniya ayarına görə, yoxdursa Pro · 60 gün)'

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

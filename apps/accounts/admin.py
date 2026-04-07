from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User, TeacherProfile, StudentProfile, Feedback


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ['email', 'username', 'full_name', 'role', 'is_active', 'is_email_verified', 'created_at']
    list_filter = ['role', 'is_active', 'is_staff', 'is_email_verified']
    list_editable = ['is_email_verified']
    search_fields = ['email', 'username', 'first_name', 'last_name']
    ordering = ['-created_at']
    actions = ['mark_email_verified', 'mark_email_unverified']
    fieldsets = (
        (None, {'fields': ('email', 'username', 'password')}),
        ('Personal info', {'fields': ('first_name', 'last_name', 'role')}),
        ('Permissions', {'fields': ('is_active', 'is_staff', 'is_superuser', 'is_email_verified', 'groups', 'user_permissions')}),
    )
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('email', 'username', 'first_name', 'last_name', 'role', 'password1', 'password2'),
        }),
    )

    @admin.display(description='Ad Soyad')
    def full_name(self, obj):
        return obj.get_full_name() or '—'

    @admin.action(description='Seçilmiş emailləri təsdiqlənmiş et')
    def mark_email_verified(self, request, queryset):
        updated = queryset.update(is_email_verified=True)
        self.message_user(request, f'{updated} istifadəçinin emaili təsdiqləndi.')

    @admin.action(description='Seçilmiş emailləri təsdiqlənməmiş et')
    def mark_email_unverified(self, request, queryset):
        updated = queryset.update(is_email_verified=False)
        self.message_user(request, f'{updated} istifadəçinin email təsdiqi ləğv edildi.')


@admin.register(TeacherProfile)
class TeacherProfileAdmin(admin.ModelAdmin):
    list_display = ['user', 'organization', 'phone', 'created_at']
    search_fields = ['user__email', 'user__first_name', 'organization']


@admin.register(StudentProfile)
class StudentProfileAdmin(admin.ModelAdmin):
    list_display = ['user', 'grade', 'parent_email', 'created_at']
    search_fields = ['user__email', 'user__first_name']


@admin.register(Feedback)
class FeedbackAdmin(admin.ModelAdmin):
    list_display  = ['teacher', 'type', 'subject', 'is_read', 'created_at']
    list_filter   = ['type', 'is_read']
    list_editable = ['is_read']
    search_fields = ['teacher__email', 'teacher__first_name', 'subject', 'message']
    readonly_fields = ['teacher', 'type', 'subject', 'message', 'created_at']

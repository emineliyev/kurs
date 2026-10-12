from django.contrib import admin
from .models import Plan, Subscription


@admin.register(Plan)
class PlanAdmin(admin.ModelAdmin):
    list_display = ['display_name', 'name', 'price', 'max_students', 'max_classes', 'max_exams_per_month', 'duration_days', 'is_active']
    list_filter = ['is_active']
    exclude = ['max_tests_per_month']  # tests are unlimited on every plan


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = ['teacher', 'plan', 'status', 'start_date', 'end_date', 'exams_used_this_month']
    list_filter = ['status', 'plan']
    search_fields = ['teacher__email', 'teacher__first_name']
    readonly_fields = ['created_at', 'updated_at']

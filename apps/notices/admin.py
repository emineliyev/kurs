from django.contrib import admin
from django.db.models import Count, Q

from .models import Notice


@admin.register(Notice)
class NoticeAdmin(admin.ModelAdmin):
    list_display = ['__str__', 'teacher', 'recipients_count', 'read_count', 'created_at']
    search_fields = ['title', 'body', 'teacher__email', 'teacher__first_name', 'teacher__last_name']
    list_select_related = ['teacher']
    readonly_fields = ['teacher', 'title', 'body', 'class_rooms', 'created_at']

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(
            n=Count('recipients'), r=Count('recipients', filter=Q(recipients__read_at__isnull=False)))

    @admin.display(description='Alıcı', ordering='n')
    def recipients_count(self, obj):
        return obj.n

    @admin.display(description='Oxudu', ordering='r')
    def read_count(self, obj):
        return obj.r

    def has_add_permission(self, request):
        return False

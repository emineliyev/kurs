from django.contrib import admin
from django.shortcuts import redirect
from django.urls import reverse
from django.utils.html import format_html
from modeltranslation.admin import TranslationAdmin

from .models import LegalPage, SiteSettings


@admin.register(SiteSettings)
class SiteSettingsAdmin(admin.ModelAdmin):
    fieldsets = (
        ('Əlaqə', {'fields': ('whatsapp_number', 'contact_email')}),
        ('Sosial şəbəkələr', {'fields': ('youtube_url',)}),
    )

    def has_add_permission(self, request):
        return not SiteSettings.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False

    def changelist_view(self, request, extra_context=None):
        # a single row: the list page goes straight to its form
        obj = SiteSettings.load()
        return redirect(reverse('admin:sitecontent_sitesettings_change', args=[obj.pk]))


@admin.register(LegalPage)
class LegalPageAdmin(TranslationAdmin):
    list_display = ['title', 'link', 'is_published', 'show_in_footer', 'order', 'updated_at']
    list_editable = ['is_published', 'show_in_footer', 'order']
    fields = ['slug', 'title', 'content', 'is_published', 'show_in_footer', 'order']
    actions = None  # bulk delete would skip the cache reset in delete()

    @admin.display(description='Link')
    def link(self, obj):
        return format_html('<a href="/legal/{0}" target="_blank">/legal/{0}</a>', obj.slug)

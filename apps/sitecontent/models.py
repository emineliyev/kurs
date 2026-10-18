from django.core.cache import cache
from django.core.validators import RegexValidator
from django.db import models

SETTINGS_CACHE_KEY = 'site_settings_public'
PAGE_CACHE_KEY = 'legal_page:{slug}:{lang}'
SITEMAP_CACHE_KEY = 'site_sitemap_xml'


class SiteSettings(models.Model):
    """One row: the contact details shown on the public site (edited in the admin)."""
    whatsapp_number = models.CharField(
        'WhatsApp nömrəsi', max_length=20, blank=True,
        validators=[RegexValidator(r'^\+?[0-9 ()-]{7,20}$', 'Nömrəni rəqəmlərlə yazın, məs. 994701234567.')],
        help_text='Ölkə kodu ilə, məs. 994701234567. Boş qalsa WhatsApp düyməsi gizlənir.',
    )
    contact_email = models.EmailField('Əlaqə e-poçtu', blank=True)
    youtube_url = models.URLField('YouTube kanalı', blank=True)
    updated_at = models.DateTimeField('Yenilənib', auto_now=True)

    class Meta:
        verbose_name = 'Sayt ayarları'
        verbose_name_plural = 'Sayt ayarları'

    def __str__(self):
        return 'Sayt ayarları'

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)
        cache.delete(SETTINGS_CACHE_KEY)

    def delete(self, *args, **kwargs):  # the single row stays
        pass

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    @property
    def whatsapp_digits(self):
        return ''.join(ch for ch in self.whatsapp_number if ch.isdigit())


class LegalPage(models.Model):
    SLUG_PRIVACY = 'privacy'
    SLUG_TERMS = 'terms'

    slug = models.SlugField('Ünvan', max_length=50, unique=True,
                            help_text='Səhifənin linki: kursum.cloud/legal/<ünvan>, məs. privacy, terms.')
    title = models.CharField('Başlıq', max_length=200)
    content = models.TextField(
        'Mətn',
        help_text='Boş sətir yeni abzas açır. "## " ilə başlayan sətir başlıq, "- " ilə başlayan sətir siyahı olur.',
    )
    is_published = models.BooleanField('Dərc edilib', default=True)
    show_in_footer = models.BooleanField('Saytın altında link göstər', default=True)
    order = models.PositiveSmallIntegerField('Sıra', default=0)
    updated_at = models.DateTimeField('Yenilənib', auto_now=True)

    class Meta:
        verbose_name = 'Hüquqi səhifə'
        verbose_name_plural = 'Hüquqi səhifələr'
        ordering = ['order', 'id']

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        self.clear_cache()

    def delete(self, *args, **kwargs):
        self.clear_cache()
        return super().delete(*args, **kwargs)

    def clear_cache(self):
        from django.conf import settings
        cache.delete_many([SETTINGS_CACHE_KEY, SITEMAP_CACHE_KEY])  # footer links and the sitemap list the pages
        cache.delete_many([PAGE_CACHE_KEY.format(slug=self.slug, lang=code) for code, _ in settings.LANGUAGES])

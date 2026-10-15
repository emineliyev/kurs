from django.conf import settings
from django.core.cache import cache
from django.http import Http404
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import PAGE_CACHE_KEY, SETTINGS_CACHE_KEY, LegalPage, SiteSettings

CACHE_SECONDS = 300
LANG_CODES = [code for code, _ in settings.LANGUAGES]


def _lang(request):
    lang = (request.query_params.get('lang') or '').split('-')[0].lower()
    return lang if lang in LANG_CODES else settings.LANGUAGE_CODE


def _localized(page, field, lang):
    # modeltranslation stores title_az / title_ru / …; an empty translation falls back to Azerbaijani
    return getattr(page, f'{field}_{lang}', None) or getattr(page, f'{field}_az', None) or getattr(page, field)


class SiteSettingsView(APIView):
    """Public contact details and the footer's legal links."""
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        data = cache.get(SETTINGS_CACHE_KEY)
        if data is None:
            s = SiteSettings.load()
            pages = LegalPage.objects.filter(is_published=True, show_in_footer=True)
            data = {
                'whatsapp_number': s.whatsapp_digits,
                'contact_email': s.contact_email,
                'youtube_url': s.youtube_url,
                'pages': [
                    {'slug': p.slug, 'titles': {code: _localized(p, 'title', code) for code in LANG_CODES}}
                    for p in pages
                ],
            }
            cache.set(SETTINGS_CACHE_KEY, data, CACHE_SECONDS)
        return Response(data)


class LegalPageView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, slug):
        lang = _lang(request)
        key = PAGE_CACHE_KEY.format(slug=slug, lang=lang)
        data = cache.get(key)
        if data is None:
            page = LegalPage.objects.filter(slug=slug, is_published=True).first()
            if page is None:
                raise Http404
            data = {
                'slug': page.slug,
                'title': _localized(page, 'title', lang),
                'content': _localized(page, 'content', lang),
                'updated_at': page.updated_at,
            }
            cache.set(key, data, CACHE_SECONDS)
        return Response(data)

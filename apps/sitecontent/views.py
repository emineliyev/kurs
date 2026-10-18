from io import StringIO

from django.conf import settings
from django.core.cache import cache
from django.http import Http404, HttpResponse
from django.utils.xmlutils import SimplerXMLGenerator
from django.views.decorators.http import require_GET
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import PAGE_CACHE_KEY, SETTINGS_CACHE_KEY, SITEMAP_CACHE_KEY, LegalPage, SiteSettings

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


# Public pages of the React site; everything behind a login stays out (robots.txt closes it too)
SITEMAP_STATIC = ['/', '/register', '/login']


@require_GET
def sitemap_xml(request):
    """kursum.cloud/sitemap.xml — the landing, sign-up/login and every published legal page."""
    body = cache.get(SITEMAP_CACHE_KEY)
    if body is None:
        base = settings.FRONTEND_URL.rstrip('/')
        urls = [(base + path, None) for path in SITEMAP_STATIC]
        urls += [(f'{base}/legal/{p.slug}', p.updated_at)
                 for p in LegalPage.objects.filter(is_published=True).only('slug', 'updated_at')]
        out = StringIO()
        xml = SimplerXMLGenerator(out, 'utf-8')
        xml.startDocument()
        xml.startElement('urlset', {'xmlns': 'http://www.sitemaps.org/schemas/sitemap/0.9'})
        for loc, lastmod in urls:
            xml.startElement('url', {})
            xml.addQuickElement('loc', loc)
            if lastmod:
                xml.addQuickElement('lastmod', lastmod.date().isoformat())
            xml.endElement('url')
        xml.endElement('urlset')
        xml.endDocument()
        body = out.getvalue()
        cache.set(SITEMAP_CACHE_KEY, body, CACHE_SECONDS)
    return HttpResponse(body, content_type='application/xml; charset=utf-8')

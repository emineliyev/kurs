from modeltranslation.translator import register, TranslationOptions
from .models import LegalPage


@register(LegalPage)
class LegalPageTranslationOptions(TranslationOptions):
    fields = ('title', 'content')
    required_languages = ('az',)

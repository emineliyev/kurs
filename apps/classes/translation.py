from modeltranslation.translator import register, TranslationOptions
from .models import Subject


@register(Subject)
class SubjectTranslationOptions(TranslationOptions):
    fields = ('name', 'description')

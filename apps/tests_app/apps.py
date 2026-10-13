from django.apps import AppConfig


class TestsAppConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.tests_app'
    verbose_name = 'Testlər'
    label = 'tests_app'

    def ready(self):
        import apps.tests_app.signals  # noqa

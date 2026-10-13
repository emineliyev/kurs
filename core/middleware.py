from django.utils import translation


class AdminAzerbaijaniMiddleware:
    """The admin is always in Azerbaijani, whatever language the browser asks for."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path.startswith('/admin/'):
            translation.activate('az')
            request.LANGUAGE_CODE = 'az'
        return self.get_response(request)

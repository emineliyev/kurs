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


class AdminLoginGuardMiddleware:
    """Same failed-attempt lockout for the Django admin login as for the app login."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.method != 'POST' or not request.path.startswith('/admin/login'):
            return self.get_response(request)
        from django.http import HttpResponse
        from apps.accounts import login_guard
        ident = request.POST.get('username')
        if login_guard.is_blocked(request, ident):
            return HttpResponse(login_guard.MESSAGE, status=429, content_type='text/plain; charset=utf-8')
        response = self.get_response(request)
        # a failed admin login re-renders the form (200); a successful one redirects
        if response.status_code == 200:
            login_guard.record_failure(request, ident)
        elif response.status_code in (301, 302):
            login_guard.record_success(request, ident)
        return response

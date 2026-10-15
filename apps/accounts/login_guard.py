"""
Brute-force guard for sign-in (app login and the Django admin).

Only *failed* attempts count, so a whole class signing in from one school IP is never slowed
down; guessing passwords is: 10 failures for one account, or 50 from one IP, within 15 minutes
lock that account / IP out for the rest of the window.
"""
from django.core.cache import cache

WINDOW = 15 * 60
USER_LIMIT = 10
IP_LIMIT = 50
MESSAGE = 'Çox sayda uğursuz cəhd. Bir qədər sonra (15 dəqiqəyə qədər) yenidən yoxlayın.'


def client_ip(request):
    # nginx sets X-Real-IP to the connecting address (a client can't forge it); direct runs use REMOTE_ADDR
    return request.META.get('HTTP_X_REAL_IP') or request.META.get('REMOTE_ADDR') or 'unknown'


def _user_key(ident):
    ident = (ident or '').strip().lower()
    return f'login_fail_u:{ident}' if ident else None


def _ip_key(request):
    return f'login_fail_ip:{client_ip(request)}'


def _bump(key):
    if cache.add(key, 1, WINDOW):
        return
    try:
        cache.incr(key)
    except ValueError:  # expired between add() and incr()
        cache.add(key, 1, WINDOW)


def is_blocked(request, ident):
    user_key = _user_key(ident)
    if user_key and cache.get(user_key, 0) >= USER_LIMIT:
        return True
    return cache.get(_ip_key(request), 0) >= IP_LIMIT


def record_failure(request, ident):
    user_key = _user_key(ident)
    if user_key:
        _bump(user_key)
    _bump(_ip_key(request))


def record_success(request, ident):
    user_key = _user_key(ident)
    if user_key:
        cache.delete(user_key)

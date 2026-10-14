"""Password-reset links: valid for an hour and only until the password changes (so used once)."""
import hashlib

from django.core import signing

SALT = 'password-reset'
MAX_AGE = 3600


def _fingerprint(user):
    return hashlib.sha256(f'{user.pk}:{user.password}'.encode()).hexdigest()[:16]


def make_reset_token(user):
    return signing.dumps({'user_id': user.pk, 'pw': _fingerprint(user)}, salt=SALT)


def user_from_reset_token(token):
    """The user the link was made for, or None if it is invalid, used or older than an hour.
    Raises signing.SignatureExpired for an expired link so the caller can say so."""
    from .models import User
    try:
        data = signing.loads(token, salt=SALT, max_age=MAX_AGE)
    except signing.SignatureExpired:
        raise
    except signing.BadSignature:
        return None
    user = User.objects.filter(pk=data.get('user_id'), is_active=True).first()
    if user is None or data.get('pw') != _fingerprint(user):
        return None
    return user

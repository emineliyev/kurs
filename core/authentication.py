from rest_framework_simplejwt.authentication import JWTAuthentication


class ActivityJWTAuthentication(JWTAuthentication):
    """JWT auth that also records the teacher's last activity (at most twice a day)."""

    def authenticate(self, request):
        result = super().authenticate(request)
        if result is not None and result[0].is_teacher:
            from apps.accounts.inactivity import touch
            touch(result[0])
        return result

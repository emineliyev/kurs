"""
What a teacher can still do once the trial or plan has run out: look at, export and delete their
work, fix an answer key — but not build new tests or print them. A view lists the actions that
need a live subscription in `subscription_actions`.
"""
from rest_framework.permissions import BasePermission

from .models import Subscription


def subscription_error(teacher):
    """Why this teacher can't use paid features right now, or None."""
    sub = Subscription.objects.select_related('plan').filter(teacher=teacher).first()
    if sub is None:
        return Subscription.MISSING_MESSAGE
    if not sub.is_active:
        return Subscription.EXPIRED_MESSAGE
    return None


def wants_print(request):
    return request.query_params.get('print') in ('1', 'true')


class ActiveSubscriptionFor(BasePermission):
    """Teachers need a live subscription for the view's `subscription_actions` (and for ?print=1)."""

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated and getattr(user, 'is_teacher', False)):
            return True
        if view.action not in getattr(view, 'subscription_actions', ()) and not wants_print(request):
            return True
        error = subscription_error(user)
        if error:
            self.message = error
            return False
        return True

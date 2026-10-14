"""Student accounts belong to the teacher who created them (User.created_by)."""
import re

from .models import User

USERNAME_RE = re.compile(r'^[a-z0-9._]{3,50}$')
USERNAME_RULES = 'İstifadəçi adı 3–50 simvol olmalıdır: yalnız latın hərfləri, rəqəmlər, nöqtə və alt xətt (_).'


def students_of(teacher):
    return User.objects.filter(role=User.ROLE_STUDENT, created_by=teacher)


def active_student_count(teacher):
    """Archived (inactive) students don't count toward the plan limit."""
    return students_of(teacher).filter(is_active=True).count()


def student_limit_error(teacher):
    """Message explaining why the teacher can't add/restore one more student, or None."""
    from apps.subscriptions.models import Subscription
    sub = Subscription.objects.select_related('plan').filter(teacher=teacher).first()
    if sub is None:
        return Subscription.MISSING_MESSAGE
    if not sub.is_active:
        return Subscription.EXPIRED_MESSAGE
    limit = sub.plan.max_students
    if limit != -1 and active_student_count(teacher) >= limit:
        return f'Şagird limitinə çatmısınız ({limit}). Abunəliyinizi yeniləyin.'
    return None


def find_by_username(username):
    """Case-insensitive lookup; an exact match wins if old accounts differ only by case."""
    username = (username or '').strip()
    candidates = list(User.objects.filter(username__iexact=username)[:5])
    for user in candidates:
        if user.username == username:
            return user
    return candidates[0] if len(candidates) == 1 else None

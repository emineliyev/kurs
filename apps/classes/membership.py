"""
Class membership rule: a student is in one class at most. Putting a student in a class closes any
other active membership (kept as history, results untouched); class_room=None takes them out.
Every write path goes through place_students(); the DB constraint backs it up.
"""
from django.db import transaction

from .models import ClassEnrollment


def place_students(student_ids, class_room=None):
    """Move the students into `class_room` (or into no class). Returns {student_id: old_class_id} for
    those that left another class."""
    ids = list(dict.fromkeys(student_ids))
    target = class_room.pk if class_room is not None else None
    with transaction.atomic():
        current = list(ClassEnrollment.objects.select_for_update()
                       .filter(student_id__in=ids, is_active=True))
        leaving = [e for e in current if e.class_room_id != target]
        ClassEnrollment.objects.filter(pk__in=[e.pk for e in leaving]).update(is_active=False)
        if target is not None:
            known = dict(ClassEnrollment.objects.filter(student_id__in=ids, class_room_id=target)
                         .values_list('student_id', 'pk'))
            ClassEnrollment.objects.filter(pk__in=known.values()).update(is_active=True)
            ClassEnrollment.objects.bulk_create([
                ClassEnrollment(student_id=sid, class_room_id=target, is_active=True)
                for sid in ids if sid not in known
            ])
    return {e.student_id: e.class_room_id for e in leaving}

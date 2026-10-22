"""
The teacher's live view of exams being written: who is in, how far they got, how long they have left.

A student counts as "writing" while their exam page keeps checking in (a heartbeat every 30 s, plus
every autosave and tab switch); after ONLINE_WINDOW of silence they show as "idle" (closed the tab,
lost the connection, or just stopped). Answers aren't shown here — only progress.
"""
from datetime import timedelta

from django.utils import timezone

from apps.classes.models import ClassEnrollment
from apps.tests_app.models import Question
from .models import ExamResult

ONLINE_WINDOW = timedelta(seconds=90)

WRITING, IDLE, SUBMITTED, NOT_STARTED = 'writing', 'idle', 'submitted', 'not_started'


def touch(result_qs):
    """Mark a student's open exam as alive (cheap: one UPDATE, no model save)."""
    return result_qs.filter(status=ExamResult.STATUS_IN_PROGRESS).update(last_seen_at=timezone.now())


def answered_count(draft):
    """How many questions the saved draft has an answer for (same shape as the exam page keeps)."""
    n = 0
    for a in (draft or {}).values():
        if not isinstance(a, dict):
            continue
        kind = a.get('type')
        if kind == 'mcq':
            n += a.get('selected') is not None
        elif kind == 'numeric':
            n += str('' if a.get('value') is None else a.get('value')).strip() != ''
        else:
            n += bool(str(a.get('text') or '').strip())
    return n


def state_of(result, now):
    if result.status != ExamResult.STATUS_IN_PROGRESS:
        return SUBMITTED
    if result.last_seen_at and now - result.last_seen_at <= ONLINE_WINDOW:
        return WRITING
    return IDLE


def _name(user):
    return user.get_full_name() or user.username


def summary(teacher):
    """Open (not timed-out) exam sessions of this teacher's exams, by exam: who is writing / idle."""
    now = timezone.now()
    open_results = (ExamResult.objects
                    .filter(exam__class_room__teacher=teacher, status=ExamResult.STATUS_IN_PROGRESS,
                            exam__end_time__gte=now - ExamResult.GRACE)
                    .select_related('student', 'exam'))
    by_exam = {}
    for r in open_results:
        if r.is_overdue:
            continue
        entry = by_exam.setdefault(r.exam_id, {'writing': [], 'idle': []})
        entry[state_of(r, now)].append(_name(r.student))
    for entry in by_exam.values():
        entry['writing'].sort(key=str.lower)
        entry['idle'].sort(key=str.lower)
    students = sum(len(e['writing']) + len(e['idle']) for e in by_exam.values())
    return {'exams': {str(k): v for k, v in by_exam.items()}, 'students': students, 'exam_count': len(by_exam)}


def board(exams):
    """Every student of these exams' classes, with their live state (one row each)."""
    now = timezone.now()
    rows = []
    for exam in exams:
        total = exam.test.questions.exclude(question_type=Question.TYPE_PASSAGE).count()
        results = {r.student_id: r for r in exam.results.select_related('student').prefetch_related('answers')}
        enrolled = (ClassEnrollment.objects
                    .filter(class_room=exam.class_room, is_active=True, student__is_active=True)
                    .select_related('student'))
        students = {e.student_id: e.student for e in enrolled}
        for r in results.values():            # took it, then moved class: still listed
            students.setdefault(r.student_id, r.student)
        for sid, student in students.items():
            r = results.get(sid)
            if r is None:
                state, answered = NOT_STARTED, 0
            else:
                state = state_of(r, now)
                answered = (answered_count(r.draft_answers) if state != SUBMITTED
                            else sum(1 for a in r.answers.all()
                                     if a.selected_answer_id or (a.answer_text or a.open_text or '').strip()))
            rows.append({
                'exam': exam.id,
                'class_name': exam.class_room.name,
                'student': sid,
                'name': _name(student),
                'username': student.username,
                'state': state,
                'answered': answered,
                'total': total,
                'started_at': r.started_at if r else None,
                'deadline': r.deadline if r and state != SUBMITTED else None,
                'submitted_at': r.submitted_at if r else None,
                'last_seen_at': r.last_seen_at if r else None,
                'tab_switches': r.tab_switch_count if r else 0,
                'is_offline': bool(r and r.is_offline),
                'score': r.score if r and state == SUBMITTED else None,
                'total_points': r.total_points if r and state == SUBMITTED else None,
            })
    order = {WRITING: 0, IDLE: 1, NOT_STARTED: 2, SUBMITTED: 3}
    rows.sort(key=lambda x: (order[x['state']], x['class_name'], x['name'].lower()))
    counts = {s: sum(1 for x in rows if x['state'] == s) for s in order}
    return {
        'now': now,
        'exams': [{'id': e.id, 'title': e.title, 'class_name': e.class_room.name, 'test': e.test_id,
                   'start_time': e.start_time, 'end_time': e.end_time, 'is_active': e.is_active,
                   'duration_minutes': e.duration_minutes} for e in exams],
        'counts': counts,
        'rows': rows,
    }

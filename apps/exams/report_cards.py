"""
Report cards ("karne"): per student, every question of the exam with the key, the student's answer
and a mark — in the order and with the letters that student saw (shuffled exams included).
"""
from apps.tests_app.models import Question

LETTERS = 'ABCDEFGH'
MCQ_TYPES = Question.MCQ_TYPES
MANUAL_TYPES = Question.MANUAL_GRADE_TYPES


def _short(text, limit=12):
    text = (text or '').strip()
    return text if len(text) <= limit else text[:limit - 1] + '…'


def _item(number, question, choices, answer):
    """One column of the card: key / answer / mark ('+', '-', '' for blank, '?' pending, '½' partial)."""
    qtype = question.question_type
    if qtype in MCQ_TYPES:
        letter = {c.id: LETTERS[i] for i, c in enumerate(choices) if i < len(LETTERS)}
        key = ''.join(letter[c.id] for c in choices if c.is_correct and c.id in letter)
        given = letter.get(answer.selected_answer_id, '') if answer and answer.selected_answer_id else ''
    elif qtype in MANUAL_TYPES:
        key = '✎'
        given = '✎' if answer and (answer.answer_text or answer.open_text) else ''
    else:  # short_answer / numeric
        key = _short(question.correct_answer)
        given = _short(answer.answer_text) if answer else ''

    if not given:
        mark = ''
    elif answer.is_correct is None:
        mark = '?'
    elif answer.is_correct:
        mark = '+'
    elif answer.points_earned > 0:
        mark = '½'
    else:
        mark = '-'
    return {'n': number, 'type': qtype, 'key': key, 'answer': given, 'mark': mark}


def build_card(result):
    from apps.tests_app.views import shuffled_for_student
    exam = result.exam
    if result.is_offline:  # paper: the test's own order
        questions, answer_order = list(exam.test.questions.prefetch_related('answers')), {}
    else:
        questions, answer_order = shuffled_for_student(
            exam.test.questions.prefetch_related('answers'), exam, result.student)
    answers = {a.question_id: a for a in result.answers.all()}

    items, number = [], 0
    for q in questions:
        if q.question_type == Question.TYPE_PASSAGE:
            continue
        number += 1
        choices = answer_order.get(q.pk) or list(q.answers.all())
        items.append(_item(number, q, choices, answers.get(q.pk)))

    counts = {
        'correct': sum(i['mark'] == '+' for i in items),
        'wrong': sum(i['mark'] in ('-', '½') for i in items),
        'empty': sum(i['mark'] == '' for i in items),
        'pending': sum(i['mark'] == '?' for i in items),
    }
    student = result.student
    return {
        'student_id': student.id,
        'student_name': student.get_full_name() or student.username,
        'student_username': student.username,
        'score': result.score,
        'total_points': result.total_points,
        'percentage': result.percentage,
        'passed': result.passed,
        'submitted_at': result.submitted_at,
        'auto_submitted': result.auto_submitted,
        'is_offline': result.is_offline,
        'counts': counts,
        'items': items,
    }

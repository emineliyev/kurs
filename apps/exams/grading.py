"""
Grading an exam result — on "Submit", when the time runs out (auto-finalize from the saved
draft), and after a teacher grades an open answer by hand.
"""
import math
import re
import unicodedata

from django.db import transaction
from django.utils import timezone

from .models import ExamResult, StudentAnswer


# Hand-graded open answers use the DİM scale: a share of the question's points, nothing in between
GRADE_SCALE = {'0': 0, '1/3': 1 / 3, '1/2': 1 / 2, '2/3': 2 / 3, '1': 1}
GRADE_SCALE_ERROR = 'Qiymət 0, 1/3, 1/2, 2/3 və ya 1 olmalıdır.'


def apply_manual_grade(answer, key):
    """Set an open answer's points from a GRADE_SCALE key (KeyError for anything else); caller saves."""
    share = GRADE_SCALE[str(key)]
    answer.points_earned = round(answer.question.points * share, 4)
    answer.is_correct = share == 1  # partial credit is "not fully correct", told apart by points_earned > 0


# ── Matching typed answers ───────────────────────────────────────────────────
_SPACES = re.compile(r'\s+')
_AROUND_SIGNS = re.compile(r'\s*([/:;.+\-=*^()<>])\s*')
# Cyrillic letters that look exactly like Latin ones (a Russian keyboard layout): а→a, в→b, е→e …
_LOOKALIKES = str.maketrans('авсенкмортхуіј', 'abcehkmopтxyij'.replace('т', 't'))
# other ways of writing the same sign
_SIGNS = str.maketrans({'−': '-', '–': '-', '—': '-', '÷': '/', '×': '*', '·': '*'})
# wrapping that doesn't change the answer: «Bakı», "Bakı", Bakı. — quotes on both ends, punctuation only
# at the end (a leading dot is part of a number: .5)
_QUOTES = ' "\'«»“”„‘’`'
_TRAILING = _QUOTES + '.;:!?'
# matching answers: number + letter pairs, any separators ("1B2E3D", "1-b, 2-e", "1)B 2)E")
_PAIR = re.compile(r'(\d+)\s*[-.:)=>]*\s*([a-z])')
_MATCHING = re.compile(r'^(\s*\d+\s*[-.:)=>]*\s*[a-z]\s*[.;]?\s*){2,}$')
ALTERNATIVES = '|'   # the teacher's key "0,5 | 1/2": any of them is right


def normalize_answer(text):
    """A typed answer in a form where trivial differences don't count: case (İ/I/ı/i alike),
    look-alike Cyrillic letters, 2,5 = 2.5, −/–/— = -, ÷ = /, extra spaces, spaces around signs
    (2 / 2 = 2/2), and quotes or a full stop around the whole answer."""
    s = unicodedata.normalize('NFKC', str(text or '')).strip()
    s = s.replace('İ', 'i').replace('I', 'i').lower().replace('ı', 'i').replace('\u0307', '')
    s = s.translate(_LOOKALIKES).translate(_SIGNS)
    s = s.replace(',', '.')
    s = _SPACES.sub(' ', s)
    s = _AROUND_SIGNS.sub(r'\1', s)
    return s.strip(_QUOTES).rstrip(_TRAILING).strip(_QUOTES)


def parse_number(text):
    """'2,5' / ' 2.50 ' / '1 000' / '−5' → float; None if it isn't a plain number."""
    s = normalize_answer(text).replace(' ', '')
    if not s:
        return None
    try:
        value = float(s)
    except ValueError:
        return None
    return value if math.isfinite(value) else None


def _matching_pairs(s):
    """{number: letter} of a matching answer ("1b2e3d" / "1-b.2-e" …); None if it isn't one."""
    if not _MATCHING.match(s):
        return None
    return {n.lstrip('0') or '0': letter for n, letter in _PAIR.findall(s)}


def _one_key_matches(key, given):
    if not key:
        return False
    if given == key or given.replace(' ', '') == key.replace(' ', ''):   # "1b 2e 3d" = "1B2E3D"
        return True
    a, b = parse_number(given), parse_number(key)                       # 0.5 = .5 = 0,50
    if a is not None and b is not None:
        return math.isclose(a, b, rel_tol=0, abs_tol=1e-9)
    pk, pg = _matching_pairs(key), _matching_pairs(given)               # "1-B, 2-E" = "1B2E", any order
    return pk is not None and pk == pg


def answer_keys(question):
    """The accepted answers: the key, split on | when the teacher listed several."""
    return [k for k in (question.correct_answer or '').split(ALTERNATIVES) if k.strip()]


def short_answer_correct(question, text):
    given = normalize_answer(text)
    if not given:
        return False
    return any(_one_key_matches(normalize_answer(k), given) for k in answer_keys(question))


def numeric_correct(question, text):
    a, b = parse_number(text), parse_number(question.correct_answer)
    if a is None or b is None:
        return False
    return abs(a - b) <= (question.tolerance or 0) + 1e-9


def is_answer_correct(question, student_answer):
    """Auto-marked types only (choice, short, numeric); None for hand-graded ones."""
    from apps.tests_app.models import Question
    qtype = question.question_type
    if qtype in Question.MCQ_TYPES:
        return bool(student_answer.selected_answer_id and student_answer.selected_answer.is_correct)
    if qtype == 'short_answer':
        return short_answer_correct(question, student_answer.answer_text)
    if qtype == 'numeric':
        return numeric_correct(question, student_answer.answer_text)
    return None


def regrade_question(question):
    """The teacher fixed a question's key after students answered: re-mark every submitted
    answer to it and recount those results (score, net-scoring penalty, pass/fail)."""
    changed_results = set()
    changed = 0
    answers = (StudentAnswer.objects.select_related('selected_answer')
               .filter(question=question, result__status=ExamResult.STATUS_SUBMITTED))
    for sa in answers:
        ok = is_answer_correct(question, sa)
        if ok is None:
            continue
        points = question.points if ok else 0
        if sa.is_correct != ok or sa.points_earned != points:
            sa.is_correct, sa.points_earned = ok, points
            sa.save(update_fields=['is_correct', 'points_earned'])
            changed += 1
            changed_results.add(sa.result_id)
    for result in ExamResult.objects.select_related('exam__test').filter(pk__in=changed_results):
        recalc_totals(result)
    return changed, len(changed_results)


def gradable_total(exam):
    """Points of every question that is graded (passages aren't) — answered or not."""
    return sum(q.points for q in exam.test.questions.exclude(question_type='passage'))


def wrong_choice_penalty(result, test):
    """Net scoring: each wrong choice answer takes away 1/N of its question's points (blanks don't)."""
    if not test.negative_marking or not test.wrong_per_correct:
        return 0
    from apps.tests_app.models import Question
    wrong = result.answers.filter(
        question__question_type__in=Question.MCQ_TYPES, selected_answer__isnull=False, is_correct=False,
    ).values_list('question__points', flat=True)
    return sum(wrong) / test.wrong_per_correct


def _set_totals(result, exam, earned, total):
    # Points, rounded to 2 decimals so 30 × 3.3333 shows as 100; the pass mark is in points too
    penalty = wrong_choice_penalty(result, exam.test)
    earned, total = round(max(earned - penalty, 0), 2), round(total, 2)
    result.penalty = round(penalty, 2)
    result.score = earned
    result.total_points = total
    result.percentage = round(earned / total * 100, 2) if total > 0 else 0
    result.passed = earned >= exam.test.passing_score


def recalc_totals(result):
    """After a manual grade: same total as at submit (all gradable questions), earned = sum of answers."""
    exam = result.exam
    earned = sum(a.points_earned for a in result.answers.all())
    _set_totals(result, exam, earned, gradable_total(exam))
    result.save(update_fields=['score', 'total_points', 'percentage', 'passed', 'penalty'])


def grade(exam, result, answers_data, submitted_at=None, auto=False):
    # Grade against the exam's own questions: each counts once, unanswered ones still count
    # toward the total, and answers for other tests' questions are ignored
    submitted = {}
    for answer_data in answers_data:
        submitted.setdefault(answer_data['question'].id, answer_data)

    total_points = 0
    earned_points = 0

    # Passage is display-only — not graded
    for question in exam.test.questions.exclude(question_type='passage'):
        total_points += question.points
        answer_data = submitted.get(question.id)
        if answer_data is None:
            continue
        selected_answer = answer_data.get('selected_answer')
        if selected_answer is not None and selected_answer.question_id != question.id:
            selected_answer = None  # an answer id from another question
        open_text = answer_data.get('open_text', '')
        answer_text = answer_data.get('answer_text', '')

        if question.question_type in ('long_answer', 'open'):
            # Manual grading — store text, no auto-grade
            StudentAnswer.objects.update_or_create(
                result=result,
                question=question,
                defaults={
                    'selected_answer': None,
                    'open_text': open_text,
                    'answer_text': answer_text or open_text,
                    'is_correct': None,
                    'points_earned': 0,
                }
            )

        elif question.question_type == 'short_answer':
            is_correct = short_answer_correct(question, answer_text)
            points = question.points if is_correct else 0
            StudentAnswer.objects.update_or_create(
                result=result,
                question=question,
                defaults={
                    'selected_answer': None,
                    'open_text': '',
                    'answer_text': answer_text,
                    'is_correct': is_correct,
                    'points_earned': points,
                }
            )
            earned_points += points

        elif question.question_type == 'numeric':
            is_correct = numeric_correct(question, answer_text)
            points = question.points if is_correct else 0
            StudentAnswer.objects.update_or_create(
                result=result,
                question=question,
                defaults={
                    'selected_answer': None,
                    'open_text': '',
                    'answer_text': answer_text,
                    'is_correct': is_correct,
                    'points_earned': points,
                }
            )
            earned_points += points

        else:
            # MCQ types: mcq, true_false, image_mcq, multiple_choice
            is_correct = bool(selected_answer and selected_answer.is_correct)
            points = question.points if is_correct else 0
            StudentAnswer.objects.update_or_create(
                result=result,
                question=question,
                defaults={
                    'selected_answer': selected_answer,
                    'open_text': '',
                    'answer_text': '',
                    'is_correct': is_correct,
                    'points_earned': points,
                }
            )
            earned_points += points

    result.status = ExamResult.STATUS_SUBMITTED
    result.submitted_at = submitted_at or timezone.now()
    result.auto_submitted = auto
    _set_totals(result, exam, earned_points, total_points)
    result.save()
    return result


def draft_to_answers(draft):
    """The exam page's {question_id: {type, selected|text|value}} map → validated submit items."""
    from .serializers import StudentAnswerSerializer
    items = []
    for qid, a in (draft or {}).items():
        if not isinstance(a, dict):
            continue
        raw = {'question': qid}
        if a.get('type') == 'mcq':
            raw['selected_answer'] = a.get('selected')
        elif a.get('type') == 'numeric':
            raw['answer_text'] = '' if a.get('value') is None else str(a.get('value'))
        else:
            raw['answer_text'] = raw['open_text'] = str(a.get('text') or '')
        s = StudentAnswerSerializer(data=raw)
        if s.is_valid():
            items.append(s.validated_data)
    return items


def finalize(result):
    """Grade a timed-out result from its saved draft (idempotent; safe to call concurrently)."""
    with transaction.atomic():
        locked = (ExamResult.objects.select_for_update().select_related('exam__test')
                  .filter(pk=result.pk, status=ExamResult.STATUS_IN_PROGRESS).first())
        if locked is None:
            return
        grade(locked.exam, locked, draft_to_answers(locked.draft_answers),
              submitted_at=locked.deadline, auto=True)


def finalize_overdue(results):
    """Finalize every in-progress result in the queryset whose time (plus grace) is over."""
    for r in results.filter(status=ExamResult.STATUS_IN_PROGRESS).select_related('exam'):
        if r.is_overdue:
            finalize(r)

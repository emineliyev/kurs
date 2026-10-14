"""
Grading an exam result — on "Submit", when the time runs out (auto-finalize from the saved
draft), and after a teacher grades an open answer by hand.
"""
from django.db import transaction
from django.utils import timezone

from .models import ExamResult, StudentAnswer


def gradable_total(exam):
    """Points of every question that is graded (passages aren't) — answered or not."""
    return sum(q.points for q in exam.test.questions.exclude(question_type='passage'))


def _set_totals(result, exam, earned, total):
    percentage = (earned / total * 100) if total > 0 else 0
    result.score = earned
    result.total_points = total
    result.percentage = round(percentage, 2)
    result.passed = percentage >= exam.test.passing_score


def recalc_totals(result):
    """After a manual grade: same total as at submit (all gradable questions), earned = sum of answers."""
    exam = result.exam
    earned = sum(a.points_earned for a in result.answers.all())
    _set_totals(result, exam, earned, gradable_total(exam))
    result.save(update_fields=['score', 'total_points', 'percentage', 'passed'])


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
            correct = (question.correct_answer or '').strip().lower()
            student_text = (answer_text or '').strip().lower()
            is_correct = bool(correct and student_text == correct)
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
            try:
                student_val = float(answer_text or '')
                correct_val = float(question.correct_answer or '')
                tol = question.tolerance or 0
                is_correct = abs(student_val - correct_val) <= tol
            except (ValueError, TypeError):
                is_correct = False
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

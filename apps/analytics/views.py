from django.db.models import Avg, Count, Max, Min, Q
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from apps.accounts.permissions import IsTeacher
from apps.classes.models import Class
from apps.exams.models import ExamResult


class TeacherDashboardView(APIView):
    permission_classes = [IsTeacher]

    def get(self, request):
        user = request.user
        classes = Class.objects.filter(teacher=user, is_active=True)
        total_classes = classes.count()
        from apps.accounts.students import active_student_count
        total_students = active_student_count(user)

        from apps.tests_app.models import Test
        total_tests = Test.objects.filter(teacher=user).count()
        published_tests = Test.objects.filter(teacher=user, is_published=True).count()

        from apps.exams.models import Exam
        total_exams = Exam.objects.filter(class_room__teacher=user).count()

        recent_results = ExamResult.objects.filter(
            exam__class_room__teacher=user,
            status='submitted'
        ).select_related('student', 'exam', 'exam__class_room').order_by('-submitted_at')[:50]

        results_data = [
            {
                'student_name': r.student.get_full_name(),
                'exam_title': r.exam.title,
                'class_name': r.exam.class_room.name,
                'class_grade': r.exam.class_room.grade,
                'class_group': r.exam.class_room.group,
                'percentage': r.percentage,
                'score': r.score,
                'total_points': r.total_points,
                'passed': r.passed,
                'submitted_at': r.submitted_at,
            }
            for r in recent_results
        ]

        return Response({
            'total_classes': total_classes,
            'total_students': total_students,
            'total_tests': total_tests,
            'published_tests': published_tests,
            'total_exams': total_exams,
            'recent_results': results_data,
        })


def _scope(request, class_id):
    """(classes, label) for one of the teacher's classes, or all of them when class_id is None."""
    classes = Class.objects.filter(teacher=request.user)
    if class_id is None:
        return classes, None
    classes = classes.filter(id=class_id)
    cls = classes.first()
    return (classes, cls.name) if cls else (None, None)


def _filter_results(results, params):
    month, year = params.get('month'), params.get('year')
    if month and year:
        results = results.filter(submitted_at__month=int(month), submitted_at__year=int(year))
    if params.get('exam'):
        results = results.filter(exam_id=params['exam'])
    return results


class ClassAnalyticsView(APIView):
    """Stats for one class, or for all the teacher's classes (class/all/)."""
    permission_classes = [IsTeacher]

    def get(self, request, class_id=None):
        classes, name = _scope(request, class_id)
        if classes is None:
            return Response({'detail': 'Class not found.'}, status=404)

        results = _filter_results(
            ExamResult.objects.filter(exam__class_room__in=classes, status='submitted'), request.query_params)

        stats = results.aggregate(
            avg_score=Avg('percentage'),
            max_score=Max('percentage'),
            min_score=Min('percentage'),
            total_attempts=Count('id'),
        )

        pass_count = results.filter(passed=True).count()
        fail_count = results.filter(passed=False).count()

        student_stats = results.values(
            'student__id', 'student__first_name', 'student__last_name'
        ).annotate(
            avg_percentage=Avg('percentage'),
            total_exams=Count('id'),
        ).order_by('-avg_percentage')

        return Response({
            'class_name': name,
            'overview': stats,
            'pass_count': pass_count,
            'fail_count': fail_count,
            'student_stats': list(student_stats),
        })


class ClassDetailedExportView(APIView):
    """Per-exam, per-student, per-question answers for the Excel export (same filters as the page)."""
    permission_classes = [IsTeacher]

    def get(self, request, class_id=None):
        classes, name = _scope(request, class_id)
        if classes is None:
            return Response({'detail': 'Class not found.'}, status=404)

        from apps.exams.models import Exam
        from apps.tests_app.models import Question

        exams = Exam.objects.filter(class_room__in=classes).select_related('class_room').order_by('start_time')
        if request.query_params.get('exam'):
            exams = exams.filter(id=request.query_params['exam'])
        export_exams = []

        for exam in exams:
            questions = list(Question.objects.filter(test=exam.test).order_by('order').prefetch_related('answers'))
            # Letters follow the teacher's own order of the choices
            letters = {a.id: 'ABCDEF'[i] for q in questions for i, a in enumerate(q.answers.all()) if i < 6}
            results = list(
                _filter_results(ExamResult.objects.filter(exam=exam, status='submitted'), request.query_params)
                .select_related('student')
                .prefetch_related('answers__selected_answer')
            )
            if not results:
                continue

            rows = []
            for result in results:
                answer_map = {a.question_id: a for a in result.answers.all()}
                answers = []
                for q in questions:
                    a = answer_map.get(q.id)
                    if a is None:
                        answers.append({'text': '', 'is_correct': None})
                    elif a.selected_answer_id:
                        label = letters.get(a.selected_answer_id) or a.selected_answer.text[:20]
                        answers.append({'text': label, 'is_correct': a.is_correct})
                    else:
                        answers.append({'text': (a.answer_text or '')[:30], 'is_correct': a.is_correct})

                rows.append({
                    'student': result.student.get_full_name(),
                    'percentage': round(result.percentage or 0, 1),
                    'answers': answers,
                })

            export_exams.append({
                'title': exam.title if class_id else f'{exam.class_room.name} — {exam.title}',
                'questions': [q.text[:40] if q.text else f'S{q.order}' for q in questions],
                'rows': rows,
            })

        return Response({
            'class_name': name,
            'exams': export_exams,
        })


class StudentResultsForTeacherView(APIView):
    """Teacher views a specific student's exam results."""
    permission_classes = [IsTeacher]

    def get(self, request, student_id):
        from apps.accounts.students import students_of
        if not students_of(request.user).filter(pk=student_id).exists():
            return Response({'detail': 'Not found.'}, status=404)

        results = ExamResult.objects.filter(
            student_id=student_id,
            status='submitted',
        ).select_related('exam').order_by('-submitted_at')

        data = [{
            'exam_id': r.exam.id,
            'exam_title': r.exam.title,
            'percentage': round(r.percentage or 0, 1),
            'passed': r.passed,
            'score': r.score,
            'total_points': r.total_points,
            'submitted_at': r.submitted_at,
            'needs_grading': r.answers.filter(is_correct__isnull=True).exists(),
        } for r in results]

        return Response({'results': data})


class StudentAnalyticsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        results = ExamResult.objects.filter(
            student=user,
            status='submitted',
            exam__is_active=True,  # a passive exam is hidden from the student, results included
        ).select_related('exam').order_by('submitted_at')

        # Results whose open answers the teacher hasn't graded yet don't count until they are
        from django.db.models import Exists, OuterRef
        from apps.exams.models import StudentAnswer
        pending = StudentAnswer.objects.filter(result=OuterRef('pk'), is_correct__isnull=True)
        results = results.annotate(pending=Exists(pending))
        graded = results.filter(pending=False)

        data = [
            {
                'exam_title': r.exam.title,
                'percentage': None if r.pending else r.percentage,
                'passed': None if r.pending else r.passed,
                'pending': r.pending,
                'submitted_at': r.submitted_at,
            }
            for r in results
        ]
        if graded.exists():
            from django.db.models import Avg
            avg = graded.aggregate(avg=Avg('percentage'))['avg']
            total = graded.count()
            passed = graded.filter(passed=True).count()
        else:
            avg = 0
            total = 0
            passed = 0

        return Response({
            'average_score': round(avg or 0, 2),
            'total_exams': total,
            'passed_exams': passed,
            'history': data,
        })

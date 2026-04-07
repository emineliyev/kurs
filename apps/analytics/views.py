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
        total_students = sum(c.student_count for c in classes)

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


class ClassAnalyticsView(APIView):
    permission_classes = [IsTeacher]

    def get(self, request, class_id):
        try:
            class_obj = Class.objects.get(id=class_id, teacher=request.user)
        except Class.DoesNotExist:
            return Response({'detail': 'Class not found.'}, status=404)

        results = ExamResult.objects.filter(
            exam__class_room=class_obj,
            status='submitted'
        )

        month = request.query_params.get('month')
        year = request.query_params.get('year')
        if month and year:
            results = results.filter(
                submitted_at__month=int(month),
                submitted_at__year=int(year)
            )

        exam_id = request.query_params.get('exam')
        if exam_id:
            results = results.filter(exam_id=exam_id)


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
            'class_name': class_obj.name,
            'overview': stats,
            'pass_count': pass_count,
            'fail_count': fail_count,
            'student_stats': list(student_stats),
        })


class ClassDetailedExportView(APIView):
    """Returns per-exam, per-student, per-question answer data for Excel export."""
    permission_classes = [IsTeacher]

    def get(self, request, class_id):
        try:
            class_obj = Class.objects.get(id=class_id, teacher=request.user)
        except Class.DoesNotExist:
            return Response({'detail': 'Class not found.'}, status=404)

        from apps.exams.models import Exam, StudentAnswer
        from apps.tests_app.models import Question

        exams = Exam.objects.filter(class_room=class_obj).order_by('start_time')
        export_exams = []

        for exam in exams:
            questions = list(
                Question.objects.filter(test=exam.test).order_by('order')
            )
            results = list(
                ExamResult.objects.filter(exam=exam, status='submitted')
                .select_related('student')
                .prefetch_related('answers__question', 'answers__selected_answer')
            )
            if not results:
                continue

            q_ids = [q.id for q in questions]

            rows = []
            for result in results:
                answer_map = {a.question_id: a for a in result.answers.all()}
                answers = []
                for q in questions:
                    a = answer_map.get(q.id)
                    if a is None:
                        answers.append({'text': '', 'is_correct': None})
                    elif a.selected_answer:
                        # MCQ: show letter label
                        try:
                            idx = q_ids.index(q.id)
                            all_q_answers = list(q.answers.order_by('id'))
                            letter_idx = next(
                                (i for i, qa in enumerate(all_q_answers) if qa.id == a.selected_answer_id),
                                None
                            )
                            label = 'ABCDEF'[letter_idx] if letter_idx is not None else a.selected_answer.text[:20]
                        except Exception:
                            label = a.selected_answer.text[:20] if a.selected_answer else ''
                        answers.append({'text': label, 'is_correct': a.is_correct})
                    else:
                        answers.append({'text': (a.answer_text or '')[:30], 'is_correct': a.is_correct})

                rows.append({
                    'student': result.student.get_full_name(),
                    'percentage': round(result.percentage or 0, 1),
                    'answers': answers,
                })

            export_exams.append({
                'title': exam.title,
                'questions': [q.text[:40] if q.text else f'S{q.order}' for q in questions],
                'rows': rows,
            })

        return Response({
            'class_name': class_obj.name,
            'exams': export_exams,
        })


class StudentResultsForTeacherView(APIView):
    """Teacher views a specific student's exam results."""
    permission_classes = [IsTeacher]

    def get(self, request, student_id):
        from apps.classes.models import ClassEnrollment
        enrolled = ClassEnrollment.objects.filter(
            student_id=student_id,
            class_room__teacher=request.user,
        ).exists()
        if not enrolled:
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
            status='submitted'
        ).select_related('exam').order_by('submitted_at')

        data = [
            {
                'exam_title': r.exam.title,
                'percentage': r.percentage,
                'passed': r.passed,
                'submitted_at': r.submitted_at,
            }
            for r in results
        ]

        if results.exists():
            from django.db.models import Avg
            avg = results.aggregate(avg=Avg('percentage'))['avg']
            total = results.count()
            passed = results.filter(passed=True).count()
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

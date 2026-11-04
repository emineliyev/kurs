"""Announcements: teachers on the Pro plan send, students read (any plan, any time)."""
from datetime import timedelta

from django.core.cache import cache
from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.accounts.permissions import IsStudent, IsTeacher
from apps.classes.models import Class, ClassEnrollment

from .models import BODY_MAX, TITLE_MAX, Notice, NoticeRecipient

PRO_MESSAGE = 'Elan göndərmək Pro planındadır.'
DAILY_LIMIT = 50                 # notices a teacher may send per day (spam guard)
UNREAD_TTL = 120                 # seconds the student's unread count is cached
LIST_LIMIT = 100


def can_send(teacher):
    """Pro only (a gifted Pro too), while it runs."""
    from apps.subscriptions.models import Subscription
    sub = Subscription.objects.filter(teacher=teacher).select_related('plan').first()
    return bool(sub and sub.is_active and sub.plan.tier >= 2)


def _unread_key(student_id):
    return f'notice_unread:{student_id}'


def _forget_unread(student_ids):
    cache.delete_many([_unread_key(i) for i in student_ids])


def _teacher_students(teacher):
    """Students this teacher may write to: in the teacher's classes, or created by the teacher."""
    in_classes = ClassEnrollment.objects.filter(class_room__teacher=teacher, is_active=True).values('student_id')
    return User.objects.filter(role=User.ROLE_STUDENT, is_active=True).filter(
        Q(pk__in=in_classes) | Q(created_by=teacher))


def _notice_row(n):
    return {
        'id': n.id, 'title': n.title, 'body': n.body, 'created_at': n.created_at,
        'classes': [c.name for c in n.class_rooms.all()],
        'recipients': n.n_recipients, 'read': n.n_read,
    }


class TeacherNoticesView(APIView):
    """GET: the teacher's sent notices with "read 18 / 25". POST: send a new one (Pro)."""
    permission_classes = [IsTeacher]

    def get(self, request):
        notices = (Notice.objects.filter(teacher=request.user, created_at__gte=Notice.cutoff())
                   .annotate(n_recipients=Count('recipients'),
                             n_read=Count('recipients', filter=Q(recipients__read_at__isnull=False)))
                   .prefetch_related('class_rooms')[:LIST_LIMIT])
        return Response({'can_send': can_send(request.user), 'results': [_notice_row(n) for n in notices]})

    def post(self, request):
        teacher = request.user
        if not can_send(teacher):
            return Response({'detail': PRO_MESSAGE}, status=status.HTTP_403_FORBIDDEN)
        title = str(request.data.get('title') or '').strip()[:TITLE_MAX]
        body = str(request.data.get('body') or '').strip()
        if not body:
            return Response({'body': ['Mətni yazın.']}, status=status.HTTP_400_BAD_REQUEST)
        if len(body) > BODY_MAX:
            return Response({'body': [f'Mətn ən çox {BODY_MAX} simvol ola bilər.']}, status=status.HTTP_400_BAD_REQUEST)
        try:
            class_ids = {int(x) for x in request.data.get('class_ids') or []}
            student_ids = {int(x) for x in request.data.get('student_ids') or []}
        except (TypeError, ValueError):
            return Response({'detail': 'Alıcılar düzgün deyil.'}, status=status.HTTP_400_BAD_REQUEST)
        day_ago = timezone.now() - timedelta(days=1)
        if Notice.objects.filter(teacher=teacher, created_at__gte=day_ago).count() >= DAILY_LIMIT:
            return Response({'detail': f'Bir gündə ən çox {DAILY_LIMIT} elan göndərmək olar.'},
                            status=status.HTTP_429_TOO_MANY_REQUESTS)

        # only the teacher's own classes and students — anything else is silently left out
        classes = list(Class.objects.filter(teacher=teacher, pk__in=class_ids))
        allowed = _teacher_students(teacher)
        recipients = set(ClassEnrollment.objects.filter(class_room__in=classes, is_active=True,
                                                        student__is_active=True)
                         .values_list('student_id', flat=True))
        recipients |= set(allowed.filter(pk__in=student_ids).values_list('pk', flat=True))
        if not recipients:
            return Response({'detail': 'Ən azı bir sinif və ya şagird seçin.'}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            notice = Notice.objects.create(teacher=teacher, title=title, body=body)
            notice.class_rooms.set(classes)
            NoticeRecipient.objects.bulk_create([NoticeRecipient(notice=notice, student_id=s) for s in recipients])
        _forget_unread(recipients)
        notice.n_recipients, notice.n_read = len(recipients), 0
        return Response(_notice_row(notice), status=status.HTTP_201_CREATED)


class TeacherNoticeDetailView(APIView):
    """DELETE: the teacher removes a notice (any plan) — it disappears from the students too."""
    permission_classes = [IsTeacher]

    def delete(self, request, pk):
        notice = Notice.objects.filter(pk=pk, teacher=request.user).first()
        if notice is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        unread = list(notice.recipients.filter(read_at__isnull=True).values_list('student_id', flat=True))
        notice.delete()
        _forget_unread(unread)
        return Response(status=status.HTTP_204_NO_CONTENT)


class TeacherNoticeReadersView(APIView):
    """GET: who has read it and who hasn't (the read ones first, newest first)."""
    permission_classes = [IsTeacher]

    def get(self, request, pk):
        notice = Notice.objects.filter(pk=pk, teacher=request.user).first()
        if notice is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        rows = (notice.recipients.select_related('student')
                .order_by('read_at', 'student__first_name', 'student__last_name'))
        data = [{'id': r.student_id, 'name': r.student.get_full_name() or r.student.username, 'read_at': r.read_at}
                for r in rows]
        data.sort(key=lambda r: (r['read_at'] is None, r['name'].lower()))
        return Response(data)


class TeacherRecipientsView(APIView):
    """GET: the classes and students the composer can pick from."""
    permission_classes = [IsTeacher]

    def get(self, request):
        teacher = request.user
        classes = (Class.objects.filter(teacher=teacher, is_active=True)
                   .annotate(n=Count('enrollments', filter=Q(enrollments__is_active=True,
                                                            enrollments__student__is_active=True)))
                   .order_by('name'))
        students = _teacher_students(teacher).order_by('first_name', 'last_name')
        enroll = {}
        for sid, cname in ClassEnrollment.objects.filter(class_room__teacher=teacher, is_active=True) \
                .values_list('student_id', 'class_room__name'):
            enroll.setdefault(sid, []).append(cname)
        return Response({
            'classes': [{'id': c.id, 'name': c.name, 'students': c.n} for c in classes],
            'students': [{'id': s.id, 'name': s.get_full_name() or s.username, 'classes': enroll.get(s.id, [])}
                         for s in students],
        })


class StudentInboxView(APIView):
    """GET: the student's notices (last year, newest first). POST: mark them read."""
    permission_classes = [IsStudent]

    def get(self, request):
        rows = (NoticeRecipient.objects.filter(student=request.user, notice__created_at__gte=Notice.cutoff())
                .select_related('notice__teacher').order_by('-notice__created_at')[:LIST_LIMIT])
        return Response([{
            'id': r.notice_id, 'title': r.notice.title, 'body': r.notice.body,
            'teacher': r.notice.teacher.get_full_name() or r.notice.teacher.username,
            'created_at': r.notice.created_at, 'read_at': r.read_at,
        } for r in rows])

    def post(self, request):
        ids = request.data.get('ids')
        qs = NoticeRecipient.objects.filter(student=request.user, read_at__isnull=True)
        if isinstance(ids, list):
            qs = qs.filter(notice_id__in=[i for i in ids if isinstance(i, int)])
        marked = qs.update(read_at=timezone.now())
        _forget_unread([request.user.id])
        return Response({'marked': marked})


class StudentUnreadView(APIView):
    """GET: how many unread notices (the bell's badge). Cached briefly — asked every few minutes."""
    permission_classes = [IsStudent]

    def get(self, request):
        key = _unread_key(request.user.id)
        count = cache.get(key)
        if count is None:
            count = NoticeRecipient.objects.filter(student=request.user, read_at__isnull=True,
                                                   notice__created_at__gte=Notice.cutoff()).count()
            cache.set(key, count, UNREAD_TTL)
        return Response({'count': count})

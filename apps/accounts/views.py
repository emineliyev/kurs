import requests as http_requests
from django.conf import settings
from django.core import signing
from django.core.mail import send_mail
from django.utils.translation import gettext_lazy as _
from apps.email_utils import email_shell, cta_button, greeting, paragraph, note
from apps.accounts.tasks import send_verification_email_task, send_password_reset_email_task
from rest_framework import generics, serializers, status
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated, BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenRefreshView
from .models import User


def _verify_recaptcha(token):
    """Returns True if CAPTCHA is valid or RECAPTCHA_SECRET_KEY is not set."""
    secret = getattr(settings, 'RECAPTCHA_SECRET_KEY', '')
    if not secret:
        return True
    try:
        resp = http_requests.post(
            'https://www.google.com/recaptcha/api/siteverify',
            data={'secret': secret, 'response': token or ''},
            timeout=5
        )
        return resp.json().get('success', False)
    except Exception:
        return False


def _send_verification_email(user):
    token = signing.dumps({'user_id': user.pk}, salt='email-verify')
    verify_url = f"{settings.FRONTEND_URL}/verify-email?token={token}"
    subject = "📧 Email ünvanınızı təsdiqləyin — Kurs"

    plain = (
        f"Salam {user.get_full_name() or user.username},\n\n"
        f"Aşağıdakı linkə keçərək email ünvanınızı təsdiqləyin:\n\n"
        f"{verify_url}\n\n"
        f"Link 24 saat ərzində etibarlıdır.\n\n"
        f"Əgər bu hesabı siz yaratmamısınızsa, bu emaili nəzərə almayın.\n\n"
        f"— Kurs Platforması"
    )

    body = (
        greeting(user.get_full_name() or user.username)
        + paragraph('Kurs platformasına xoş gəldiniz! Hesabınızı aktivləşdirmək üçün '
                    'aşağıdakı düyməyə klikləyin.')
        + cta_button('Email Ünvanımı Təsdiqlə', verify_url)
        + note('Bu link 24 saat ərzində etibarlıdır. '
               'Əgər bu hesabı siz yaratmamısınızsa, emaili nəzərə almayın.')
    )

    html = email_shell('#1e40af', '📧', 'Email Təsdiqi', body)

    try:
        send_mail(subject, plain, settings.DEFAULT_FROM_EMAIL, [user.email],
                  html_message=html, fail_silently=True)
    except Exception:
        pass


def _send_password_reset_email(user):
    from .tokens import make_reset_token
    token = make_reset_token(user)
    reset_url = f"{settings.FRONTEND_URL}/reset-password?token={token}"
    subject = "🔐 Şifrənizi sıfırlayın — Kurs"

    plain = (
        f"Salam {user.get_full_name() or user.username},\n\n"
        f"Şifrənizi sıfırlamaq üçün aşağıdakı linkə keçin:\n\n"
        f"{reset_url}\n\n"
        f"Link 1 saat ərzində etibarlıdır.\n\n"
        f"Əgər siz bu tələbi göndərməmisinizsə, bu emaili nəzərə almayın.\n\n"
        f"— Kurs Platforması"
    )

    body = (
        greeting(user.get_full_name() or user.username)
        + paragraph('Şifrə sıfırlama tələbi alındı. Yeni şifrə təyin etmək üçün '
                    'aşağıdakı düyməyə klikləyin.')
        + cta_button('Şifrəmi Sıfırla', reset_url, color='#7c3aed')
        + note('Bu link 1 saat ərzində etibarlıdır. '
               'Əgər bu tələbi siz göndərməmisinizsə, emaili nəzərə almayın.')
    )

    html = email_shell('#7c3aed', '🔐', 'Şifrə Sıfırlama', body)

    try:
        send_mail(subject, plain, settings.DEFAULT_FROM_EMAIL, [user.email],
                  html_message=html, fail_silently=True)
    except Exception:
        pass


from .serializers import (
    TeacherRegisterSerializer, LoginSerializer,
    UserSerializer, PasswordChangeSerializer, StudentCreateSerializer,
    TeacherProfileSerializer, StudentUpdateSerializer, FeedbackSerializer, StudentSerializer,
    validate_strong_password,
)
from .students import students_of, student_limit_error


class IsTeacher(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == User.ROLE_TEACHER)


class TeacherRegisterView(APIView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'register'
    permission_classes = [AllowAny]

    def post(self, request):
        # Verify reCAPTCHA
        if not _verify_recaptcha(request.data.get('recaptcha_token')):
            return Response({'detail': 'CAPTCHA doğrulanmadı. Yenidən cəhd edin.'}, status=status.HTTP_400_BAD_REQUEST)

        serializer = TeacherRegisterSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            self._create_free_subscription(user)
            send_verification_email_task.delay(user.pk)
            refresh = RefreshToken.for_user(user)
            return Response({
                'user': UserSerializer(user).data,
                'access': str(refresh.access_token),
                'refresh': str(refresh),
            }, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def _create_free_subscription(self, user):
        try:
            from apps.subscriptions.models import Plan, Subscription
            from django.utils import timezone
            from datetime import timedelta
            plan = Plan.objects.filter(name=Plan.PLAN_FREE, is_active=True).first()
            if plan:
                Subscription.objects.get_or_create(
                    teacher=user,
                    defaults={
                        'plan': plan,
                        'status': Subscription.STATUS_TRIAL,
                        'start_date': timezone.now(),
                        'end_date': timezone.now() + timedelta(days=plan.duration_days),
                    }
                )
        except Exception:
            pass


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        from . import login_guard
        ident = request.data.get('username') or request.data.get('email')
        if login_guard.is_blocked(request, ident):
            return Response({'detail': login_guard.MESSAGE}, status=status.HTTP_429_TOO_MANY_REQUESTS)
        serializer = LoginSerializer(data=request.data, context={'request': request})
        if serializer.is_valid():
            login_guard.record_success(request, ident)
            user = serializer.validated_data['user']
            refresh = RefreshToken.for_user(user)
            return Response({
                'user': UserSerializer(user).data,
                'access': str(refresh.access_token),
                'refresh': str(refresh),
            })
        login_guard.record_failure(request, ident)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            refresh_token = request.data.get('refresh')
            if refresh_token:
                token = RefreshToken(refresh_token)
                token.blacklist()
        except Exception:
            pass
        return Response({'detail': 'Logged out successfully.'})


class ProfileView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = UserSerializer

    def get_object(self):
        return self.request.user

    # Only these are self-editable. Email, username, role and active/verified flags are not: a student's
    # login is managed by their teacher, and an email change would keep the old "verified" status.
    SELF_EDITABLE = {'teacher': ('first_name', 'last_name'), 'student': ()}

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        allowed = self.SELF_EDITABLE.get(instance.role, ())
        data = {k: request.data[k] for k in allowed if k in request.data}
        serializer = self.get_serializer(instance, data=data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()

        # Handle nested teacher_profile separately (UserSerializer has it as read_only)
        teacher_profile_data = request.data.get('teacher_profile')
        if teacher_profile_data and hasattr(instance, 'teacher_profile'):
            ts = TeacherProfileSerializer(
                instance.teacher_profile, data=teacher_profile_data, partial=True
            )
            if ts.is_valid():
                ts.save()

        instance.refresh_from_db()
        return Response(UserSerializer(instance).data)


class PasswordChangeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = PasswordChangeSerializer(data=request.data)
        if serializer.is_valid():
            user = request.user
            if not user.check_password(serializer.validated_data['old_password']):
                return Response(
                    {'old_password': _('Incorrect password.')},
                    status=status.HTTP_400_BAD_REQUEST
                )
            user.set_password(serializer.validated_data['new_password'])
            user.save()
            return Response({'detail': 'Password changed successfully.'})
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


def _with_classes(queryset, teacher):
    from django.db.models import Prefetch
    from apps.classes.models import ClassEnrollment
    return queryset.prefetch_related(Prefetch(
        'enrollments',
        queryset=ClassEnrollment.objects.filter(is_active=True, class_room__teacher=teacher)
                                        .select_related('class_room').order_by('class_room__name'),
        to_attr='active_enrollments',
    ))


class StudentListCreateView(APIView):
    """GET: the teacher's students (?archived=1 for archived ones). POST: create + enroll in one step."""
    permission_classes = [IsTeacher]

    def get(self, request):
        archived = request.query_params.get('archived') in ('1', 'true')
        qs = students_of(request.user).filter(is_active=not archived).order_by('first_name', 'last_name')
        return Response(StudentSerializer(_with_classes(qs, request.user), many=True).data)

    def post(self, request):
        error = student_limit_error(request.user)
        if error:
            return Response({'detail': error}, status=status.HTTP_403_FORBIDDEN)
        serializer = StudentCreateSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        student = serializer.save()
        student = _with_classes(students_of(request.user), request.user).get(pk=student.pk)
        return Response(StudentSerializer(student).data, status=status.HTTP_201_CREATED)


def _own_student(request, student_id):
    return _with_classes(students_of(request.user), request.user).filter(pk=student_id).first()


class StudentDetailView(APIView):
    """PATCH: edit (names, username, password, classes). DELETE: archive — can't log in, keeps results."""
    permission_classes = [IsTeacher]

    def patch(self, request, student_id):
        student = _own_student(request, student_id)
        if student is None:
            return Response({'detail': 'Şagird tapılmadı.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = StudentUpdateSerializer(student, data=request.data, partial=True, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(StudentSerializer(_own_student(request, student_id)).data)

    def delete(self, request, student_id):
        student = _own_student(request, student_id)
        if student is None:
            return Response({'detail': 'Şagird tapılmadı.'}, status=status.HTTP_404_NOT_FOUND)
        student.is_active = False
        student.save(update_fields=['is_active'])
        return Response({'detail': 'Şagird arxivə köçürüldü.'})


def _ids(request):
    ids = request.data.get('student_ids')
    if not isinstance(ids, list) or not ids or len(ids) > 500 or not all(isinstance(i, int) for i in ids):
        return None
    return ids


class StudentBulkCreateView(APIView):
    """POST {students: [{first_name, last_name, username, password}], class_id?} — a pasted list."""
    permission_classes = [IsTeacher]

    def post(self, request):
        from apps.subscriptions.models import Subscription
        from .serializers import StudentBulkCreateSerializer
        from .students import active_student_count
        error = student_limit_error(request.user)
        if error:
            return Response({'detail': error}, status=status.HTTP_403_FORBIDDEN)
        serializer = StudentBulkCreateSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        sub = Subscription.objects.select_related('plan').get(teacher=request.user)
        limit = sub.plan.max_students
        room = limit - active_student_count(request.user) if limit != -1 else None
        if room is not None and len(serializer.validated_data['students']) > room:
            return Response({'detail': f'Şagird limitinə görə yalnız {room} şagird əlavə edə bilərsiniz ({limit}).'},
                            status=status.HTTP_403_FORBIDDEN)
        created = serializer.save()
        order = {u.pk: i for i, u in enumerate(created)}
        rows = sorted(_with_classes(students_of(request.user).filter(pk__in=order), request.user),
                      key=lambda u: order[u.pk])
        return Response(StudentSerializer(rows, many=True).data, status=status.HTTP_201_CREATED)


class StudentUsernameCheckView(APIView):
    """POST {usernames: [...]} → {taken: [...]} — for the paste preview."""
    permission_classes = [IsTeacher]

    def post(self, request):
        names = request.data.get('usernames')
        if not isinstance(names, list) or len(names) > 500:
            return Response({'detail': 'usernames must be a list.'}, status=status.HTTP_400_BAD_REQUEST)
        wanted = {str(n).strip().lower() for n in names if str(n).strip()}
        taken = {u.lower() for u in User.objects.filter(username__in=wanted).values_list('username', flat=True)}
        # case-insensitive leftovers (old mixed-case accounts)
        from django.db.models.functions import Lower
        taken |= set(User.objects.annotate(l=Lower('username')).filter(l__in=wanted - taken)
                     .values_list('l', flat=True))
        return Response({'taken': sorted(taken)})


class StudentAssignView(APIView):
    """POST {student_ids, class_id (null = no class)} — a student is in one class at most."""
    permission_classes = [IsTeacher]

    def post(self, request):
        from apps.classes.membership import place_students
        from apps.classes.models import Class
        ids = _ids(request)
        if ids is None:
            return Response({'detail': 'student_ids must be a list.'}, status=status.HTTP_400_BAD_REQUEST)
        class_id = request.data.get('class_id')
        class_room = None
        if class_id is not None:
            class_room = Class.objects.filter(pk=class_id, teacher=request.user).first()
            if class_room is None:
                return Response({'detail': 'Sinif tapılmadı.'}, status=status.HTTP_404_NOT_FOUND)
        own = list(students_of(request.user).filter(pk__in=ids).values_list('pk', flat=True))
        if len(own) != len(set(ids)):
            return Response({'detail': 'Şagird tapılmadı.'}, status=status.HTTP_404_NOT_FOUND)
        moved = place_students(own, class_room)
        rows = _with_classes(students_of(request.user).filter(pk__in=own), request.user)
        return Response({'moved': len(moved), 'students': StudentSerializer(rows, many=True).data})


class StudentResetPasswordsView(APIView):
    """POST {student_ids} → new easy-to-type passwords, shown once (they're stored hashed)."""
    permission_classes = [IsTeacher]

    def post(self, request):
        from django.db import transaction
        from .students import friendly_password
        ids = _ids(request)
        if ids is None:
            return Response({'detail': 'student_ids must be a list.'}, status=status.HTTP_400_BAD_REQUEST)
        students = list(students_of(request.user).filter(pk__in=ids).order_by('first_name', 'last_name'))
        if len(students) != len(set(ids)):
            return Response({'detail': 'Şagird tapılmadı.'}, status=status.HTTP_404_NOT_FOUND)
        out = []
        with transaction.atomic():
            for s in students:
                password = friendly_password(s.first_name)
                s.set_password(password)
                s.save(update_fields=['password'])
                out.append({'id': s.pk, 'full_name': s.get_full_name(), 'username': s.username, 'password': password})
        return Response({'credentials': out})


class StudentRestoreView(APIView):
    permission_classes = [IsTeacher]

    def post(self, request, student_id):
        student = _own_student(request, student_id)
        if student is None:
            return Response({'detail': 'Şagird tapılmadı.'}, status=status.HTTP_404_NOT_FOUND)
        if not student.is_active:
            error = student_limit_error(request.user)
            if error:
                return Response({'detail': error}, status=status.HTTP_403_FORBIDDEN)
            student.is_active = True
            student.save(update_fields=['is_active'])
        return Response(StudentSerializer(student).data)


def _free_username(base):
    """A username not taken yet: 'ali', then 'ali1', 'ali2', …"""
    import re
    base = re.sub(r'[^a-z0-9._]', '', base.lower())[:40] or 'user'
    candidate, n = base, 0
    while User.objects.filter(username__iexact=candidate).exists():
        n += 1
        candidate = f'{base}{n}'
    return candidate


class GoogleAuthView(APIView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'google_auth'
    permission_classes = [AllowAny]

    def _create_free_subscription(self, user):
        try:
            from apps.subscriptions.models import Plan, Subscription
            from django.utils import timezone
            from datetime import timedelta
            plan = Plan.objects.filter(name=Plan.PLAN_FREE, is_active=True).first()
            if plan:
                Subscription.objects.get_or_create(
                    teacher=user,
                    defaults={
                        'plan': plan,
                        'status': Subscription.STATUS_TRIAL,
                        'start_date': timezone.now(),
                        'end_date': timezone.now() + timedelta(days=plan.duration_days),
                    }
                )
        except Exception:
            pass

    def post(self, request):
        token = request.data.get('credential')
        if not token:
            return Response({'detail': _('Google token is required.')}, status=status.HTTP_400_BAD_REQUEST)

        try:
            # Verify token with Google
            google_response = http_requests.get(
                f'https://oauth2.googleapis.com/tokeninfo?id_token={token}',
                timeout=10
            )
            if google_response.status_code != 200:
                return Response({'detail': _('Invalid Google token.')}, status=status.HTTP_400_BAD_REQUEST)

            google_data = google_response.json()
            email = google_data.get('email')
            first_name = google_data.get('given_name', '')
            last_name = google_data.get('family_name', '')

            if not email:
                return Response({'detail': _('Could not get email from Google.')}, status=status.HTTP_400_BAD_REQUEST)

            # The token must be issued for *our* app (otherwise any site's Google token would log in)
            # and Google must have verified the address
            client_id = getattr(settings, 'GOOGLE_CLIENT_ID', '')
            if not client_id or google_data.get('aud') != client_id:
                return Response({'detail': _('Invalid Google token.')}, status=status.HTTP_400_BAD_REQUEST)
            if str(google_data.get('email_verified')).lower() != 'true':
                return Response({'detail': _('Invalid Google token.')}, status=status.HTTP_400_BAD_REQUEST)

            existing = User.objects.filter(email__iexact=email).first()
            if existing is not None and not existing.is_active:
                return Response({'detail': _('Account is disabled.')}, status=status.HTTP_400_BAD_REQUEST)

            # Get or create user
            user, created = User.objects.get_or_create(
                email=existing.email if existing else email,
                defaults={
                    'username': _free_username(email.split('@')[0]),
                    'first_name': first_name,
                    'last_name': last_name,
                    'role': User.ROLE_TEACHER,
                    'is_active': True,
                    'is_email_verified': True,  # Google already verified the email
                }
            )

            if created:
                user.set_unusable_password()
                self._create_free_subscription(user)
                user.save()
            elif not user.is_email_verified:
                # Existing user - mark email as verified via Google
                user.is_email_verified = True
                user.save(update_fields=['is_email_verified'])

            refresh = RefreshToken.for_user(user)
            return Response({
                'user': UserSerializer(user).data,
                'access': str(refresh.access_token),
                'refresh': str(refresh),
                'created': created,
            })

        except Exception as e:
            return Response({'detail': _('Google authentication failed.')}, status=status.HTTP_400_BAD_REQUEST)


class VerifyEmailView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        token = request.data.get('token', '')
        try:
            data = signing.loads(token, salt='email-verify', max_age=86400)
            user = User.objects.get(pk=data['user_id'])
            if not user.is_email_verified:
                user.is_email_verified = True
                user.save(update_fields=['is_email_verified'])
            return Response({'detail': 'Email uğurla təsdiqləndi!'})
        except signing.SignatureExpired:
            return Response({'detail': 'Linkin müddəti bitib. Yeni link tələb edin.'}, status=status.HTTP_400_BAD_REQUEST)
        except Exception:
            return Response({'detail': 'Keçərsiz və ya köhnəlmiş link.'}, status=status.HTTP_400_BAD_REQUEST)


class ResendVerificationView(APIView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'resend_verification'
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        if user.is_email_verified:
            return Response({'detail': 'Email artıq təsdiqlənib.'})
        send_verification_email_task.delay(user.pk)
        return Response({'detail': 'Doğrulama emaili yenidən göndərildi.'})


class FeedbackCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = FeedbackSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(teacher=request.user)
            return Response({'detail': 'Feedback göndərildi. Təşəkkürlər!'}, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class PasswordResetRequestView(APIView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'password_reset'
    permission_classes = [AllowAny]

    def post(self, request):
        email = request.data.get('email', '').strip()
        # Always return success to prevent email enumeration
        try:
            user = User.objects.get(email=email, is_active=True)
            send_password_reset_email_task.delay(user.pk)
        except User.DoesNotExist:
            pass
        return Response({'detail': 'Əgər bu email mövcuddursa, şifrə sıfırlama linki göndəriləcək.'})


class PasswordResetConfirmView(APIView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'password_reset_confirm'
    permission_classes = [AllowAny]

    def post(self, request):
        token = request.data.get('token', '')
        new_password = request.data.get('new_password', '')
        if not token or not new_password:
            return Response({'detail': 'Token və yeni şifrə tələb olunur.'}, status=status.HTTP_400_BAD_REQUEST)
        from .tokens import user_from_reset_token
        try:
            user = user_from_reset_token(token)
        except signing.SignatureExpired:
            return Response({'detail': 'Linkin müddəti bitib. Yeni sıfırlama tələb edin.'}, status=status.HTTP_400_BAD_REQUEST)
        if user is None:
            return Response({'detail': 'Keçərsiz və ya artıq istifadə olunmuş link.'}, status=status.HTTP_400_BAD_REQUEST)
        # Same rules as registration
        if len(new_password) < 8:
            return Response({'detail': 'Şifrə ən azı 8 simvol olmalıdır.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            validate_strong_password(new_password)
        except serializers.ValidationError as e:
            return Response({'detail': str(e.detail[0])}, status=status.HTTP_400_BAD_REQUEST)
        user.set_password(new_password)
        user.save(update_fields=['password'])  # changes the fingerprint, so this link can't be used again
        return Response({'detail': 'Şifrə uğurla sıfırlandı. İndi daxil ola bilərsiniz.'})

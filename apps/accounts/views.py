import requests as http_requests
from django.conf import settings
from django.core import signing
from django.core.mail import send_mail
from django.utils.translation import gettext_lazy as _
from apps.email_utils import email_shell, cta_button, greeting, paragraph, note
from apps.accounts.tasks import send_verification_email_task, send_password_reset_email_task
from rest_framework import status, generics
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
    token = signing.dumps({'user_id': user.pk}, salt='password-reset')
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
    TeacherProfileSerializer, StudentUpdateSerializer, FeedbackSerializer
)


class IsTeacher(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == User.ROLE_TEACHER)


class TeacherRegisterView(APIView):
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
        serializer = LoginSerializer(data=request.data, context={'request': request})
        if serializer.is_valid():
            user = serializer.validated_data['user']
            refresh = RefreshToken.for_user(user)
            return Response({
                'user': UserSerializer(user).data,
                'access': str(refresh.access_token),
                'refresh': str(refresh),
            })
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

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=True)
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


class StudentCreateView(APIView):
    permission_classes = [IsTeacher]

    def post(self, request):
        class_id = request.data.get('class_id')
        # Check enrollment limit BEFORE creating the student account
        if class_id:
            from apps.subscriptions.models import Subscription
            from apps.classes.models import ClassEnrollment
            try:
                sub = Subscription.objects.select_related('plan').get(teacher=request.user)
                if sub.plan.max_students != -1:
                    current = ClassEnrollment.objects.filter(
                        class_room__teacher=request.user, is_active=True
                    ).values('student').distinct().count()
                    if current >= sub.plan.max_students:
                        return Response(
                            {'detail': f'Şagird limitinə çatmısınız ({sub.plan.max_students}). Abunəliyinizi yeniləyin.'},
                            status=status.HTTP_403_FORBIDDEN
                        )
            except Subscription.DoesNotExist:
                pass

        serializer = StudentCreateSerializer(data=request.data)
        if serializer.is_valid():
            student = serializer.save()
            # Enroll in class atomically if class_id was provided
            if class_id:
                from apps.classes.models import Class, ClassEnrollment
                try:
                    class_obj = Class.objects.get(id=class_id, teacher=request.user)
                    ClassEnrollment.objects.get_or_create(
                        student=student, class_room=class_obj,
                        defaults={'is_active': True}
                    )
                except Class.DoesNotExist:
                    pass
            return Response(UserSerializer(student).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class StudentUpdateView(APIView):
    permission_classes = [IsTeacher]

    def patch(self, request, student_id):
        from apps.classes.models import ClassEnrollment
        enrolled = ClassEnrollment.objects.filter(
            student_id=student_id,
            class_room__teacher=request.user,
            is_active=True
        ).exists()
        if not enrolled:
            return Response({'detail': 'Şagird tapılmadı.'}, status=status.HTTP_404_NOT_FOUND)
        try:
            student = User.objects.get(id=student_id, role=User.ROLE_STUDENT)
        except User.DoesNotExist:
            return Response({'detail': 'Şagird tapılmadı.'}, status=status.HTTP_404_NOT_FOUND)

        serializer = StudentUpdateSerializer(student, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(UserSerializer(student).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, student_id):
        from apps.classes.models import ClassEnrollment
        enrolled = ClassEnrollment.objects.filter(
            student_id=student_id,
            class_room__teacher=request.user,
        ).exists()
        if not enrolled:
            return Response({'detail': 'Şagird tapılmadı.'}, status=status.HTTP_404_NOT_FOUND)
        try:
            student = User.objects.get(id=student_id, role=User.ROLE_STUDENT)
        except User.DoesNotExist:
            return Response({'detail': 'Şagird tapılmadı.'}, status=status.HTTP_404_NOT_FOUND)
        student.is_active = False
        student.save(update_fields=['is_active'])
        return Response({'detail': 'Şagirdin hesabı deaktivləşdirildi.'}, status=status.HTTP_200_OK)


class GoogleAuthView(APIView):
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

            # Verify audience matches our client ID
            client_id = getattr(settings, 'GOOGLE_CLIENT_ID', '')
            if client_id and google_data.get('aud') != client_id:
                return Response({'detail': _('Invalid Google token.')}, status=status.HTTP_400_BAD_REQUEST)

            # Get or create user
            user, created = User.objects.get_or_create(
                email=email,
                defaults={
                    'username': email.split('@')[0],
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
    permission_classes = [AllowAny]

    def post(self, request):
        token = request.data.get('token', '')
        new_password = request.data.get('new_password', '')
        if not token or not new_password:
            return Response({'detail': 'Token və yeni şifrə tələb olunur.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            data = signing.loads(token, salt='password-reset', max_age=3600)
            user = User.objects.get(pk=data['user_id'])
            user.set_password(new_password)
            user.save(update_fields=['password'])
            return Response({'detail': 'Şifrə uğurla sıfırlandı. İndi daxil ola bilərsiniz.'})
        except signing.SignatureExpired:
            return Response({'detail': 'Linkin müddəti bitib. Yeni sıfırlama tələb edin.'}, status=status.HTTP_400_BAD_REQUEST)
        except Exception:
            return Response({'detail': 'Keçərsiz və ya köhnəlmiş link.'}, status=status.HTTP_400_BAD_REQUEST)

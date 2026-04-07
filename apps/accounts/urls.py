from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from .views import (
    TeacherRegisterView, LoginView, LogoutView,
    ProfileView, PasswordChangeView, StudentCreateView, StudentUpdateView,
    GoogleAuthView, FeedbackCreateView, VerifyEmailView, ResendVerificationView,
    PasswordResetRequestView, PasswordResetConfirmView,
)

urlpatterns = [
    path('register/', TeacherRegisterView.as_view(), name='teacher-register'),
    path('login/', LoginView.as_view(), name='login'),
    path('logout/', LogoutView.as_view(), name='logout'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token-refresh'),
    path('profile/', ProfileView.as_view(), name='profile'),
    path('password/change/', PasswordChangeView.as_view(), name='password-change'),
    path('students/', StudentCreateView.as_view(), name='student-create'),
    path('students/<int:student_id>/', StudentUpdateView.as_view(), name='student-update'),
    path('google/', GoogleAuthView.as_view(), name='google-auth'),
    path('feedback/', FeedbackCreateView.as_view(), name='feedback'),
    path('verify-email/', VerifyEmailView.as_view(), name='verify-email'),
    path('resend-verification/', ResendVerificationView.as_view(), name='resend-verification'),
    path('password/reset/', PasswordResetRequestView.as_view(), name='password-reset'),
    path('password/reset/confirm/', PasswordResetConfirmView.as_view(), name='password-reset-confirm'),
]

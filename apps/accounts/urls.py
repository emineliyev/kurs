from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from .views import (
    TeacherRegisterView, LoginView, LogoutView,
    ProfileView, PasswordChangeView, StudentListCreateView, StudentDetailView, StudentRestoreView,
    StudentBulkCreateView, StudentUsernameCheckView, StudentAssignView, StudentResetPasswordsView,
    StudentPurgeView,
    GoogleAuthView, GoogleRedirectView, GoogleExchangeView, FeedbackCreateView, VerifyEmailView, ResendVerificationView,
    PasswordResetRequestView, PasswordResetConfirmView,
)

urlpatterns = [
    path('register/', TeacherRegisterView.as_view(), name='teacher-register'),
    path('login/', LoginView.as_view(), name='login'),
    path('logout/', LogoutView.as_view(), name='logout'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token-refresh'),
    path('profile/', ProfileView.as_view(), name='profile'),
    path('password/change/', PasswordChangeView.as_view(), name='password-change'),
    path('students/', StudentListCreateView.as_view(), name='student-create'),
    path('students/bulk/', StudentBulkCreateView.as_view(), name='student-bulk-create'),
    path('students/check-usernames/', StudentUsernameCheckView.as_view(), name='student-check-usernames'),
    path('students/assign/', StudentAssignView.as_view(), name='student-assign'),
    path('students/reset-passwords/', StudentResetPasswordsView.as_view(), name='student-reset-passwords'),
    path('students/purge/', StudentPurgeView.as_view(), name='student-purge'),
    path('students/<int:student_id>/', StudentDetailView.as_view(), name='student-update'),
    path('students/<int:student_id>/restore/', StudentRestoreView.as_view(), name='student-restore'),
    path('google/', GoogleAuthView.as_view(), name='google-auth'),
    path('google/redirect/', GoogleRedirectView.as_view(), name='google-redirect'),
    path('google/exchange/', GoogleExchangeView.as_view(), name='google-exchange'),
    path('feedback/', FeedbackCreateView.as_view(), name='feedback'),
    path('verify-email/', VerifyEmailView.as_view(), name='verify-email'),
    path('resend-verification/', ResendVerificationView.as_view(), name='resend-verification'),
    path('password/reset/', PasswordResetRequestView.as_view(), name='password-reset'),
    path('password/reset/confirm/', PasswordResetConfirmView.as_view(), name='password-reset-confirm'),
]

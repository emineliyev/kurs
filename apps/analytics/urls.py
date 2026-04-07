from django.urls import path
from .views import TeacherDashboardView, ClassAnalyticsView, ClassDetailedExportView, StudentResultsForTeacherView, StudentAnalyticsView

urlpatterns = [
    path('dashboard/', TeacherDashboardView.as_view(), name='teacher-dashboard'),
    path('class/<int:class_id>/', ClassAnalyticsView.as_view(), name='class-analytics'),
    path('class/<int:class_id>/detail/', ClassDetailedExportView.as_view(), name='class-analytics-detail'),
    path('student/<int:student_id>/results/', StudentResultsForTeacherView.as_view(), name='student-results-teacher'),
    path('student/', StudentAnalyticsView.as_view(), name='student-analytics'),
]

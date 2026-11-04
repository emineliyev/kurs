from django.urls import path

from . import views

urlpatterns = [
    path('', views.TeacherNoticesView.as_view()),
    path('recipients/', views.TeacherRecipientsView.as_view()),
    path('<int:pk>/', views.TeacherNoticeDetailView.as_view()),
    path('<int:pk>/readers/', views.TeacherNoticeReadersView.as_view()),
    path('inbox/', views.StudentInboxView.as_view()),
    path('inbox/unread/', views.StudentUnreadView.as_view()),
]

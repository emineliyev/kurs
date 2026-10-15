from django.urls import path
from .views import LegalPageView, SiteSettingsView

urlpatterns = [
    path('settings/', SiteSettingsView.as_view()),
    path('pages/<slug:slug>/', LegalPageView.as_view()),
]

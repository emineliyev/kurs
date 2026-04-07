from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import SubjectViewSet, ClassViewSet

router = DefaultRouter()
router.register('subjects', SubjectViewSet, basename='subject')
router.register('', ClassViewSet, basename='class')

urlpatterns = [
    path('', include(router.urls)),
]

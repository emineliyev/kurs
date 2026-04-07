from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import TestViewSet, QuestionViewSet, BankQuestionViewSet

router = DefaultRouter()
router.register('bank-questions', BankQuestionViewSet, basename='bank-question')
router.register('questions', QuestionViewSet, basename='question')
router.register('', TestViewSet, basename='test')

urlpatterns = [
    path('', include(router.urls)),
]

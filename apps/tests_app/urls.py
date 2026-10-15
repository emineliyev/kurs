from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import TestViewSet, QuestionViewSet, BankQuestionViewSet, BankFolderViewSet

router = DefaultRouter()
router.register('bank-folders', BankFolderViewSet, basename='bank-folder')
router.register('bank-questions', BankQuestionViewSet, basename='bank-question')
router.register('questions', QuestionViewSet, basename='question')
router.register('', TestViewSet, basename='test')

urlpatterns = [
    path('', include(router.urls)),
]

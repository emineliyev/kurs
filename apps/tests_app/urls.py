from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import AutoCropView, TestViewSet, QuestionViewSet, BankQuestionViewSet, BankFolderViewSet

router = DefaultRouter()
router.register('bank-folders', BankFolderViewSet, basename='bank-folder')
router.register('bank-questions', BankQuestionViewSet, basename='bank-question')
router.register('questions', QuestionViewSet, basename='question')
router.register('', TestViewSet, basename='test')

urlpatterns = [
    path('auto-crop/', AutoCropView.as_view(), name='auto-crop'),   # before the router: '' would take it as a test id
    path('', include(router.urls)),
]

from django.urls import path
from .views import (
    PlanListView,
    SubscriptionView,
    UpgradeSubscriptionView,
    DowngradeSubscriptionView,
    CancelSubscriptionView,
    ResumeSubscriptionView,
    UpgradeProrationPreviewView,
)

urlpatterns = [
    path('plans/',                 PlanListView.as_view()),
    path('my/',                    SubscriptionView.as_view()),
    path('upgrade/',               UpgradeSubscriptionView.as_view()),
    path('downgrade/',             DowngradeSubscriptionView.as_view()),
    path('cancel/',                CancelSubscriptionView.as_view()),
    path('resume/',                ResumeSubscriptionView.as_view()),
    path('preview/<int:plan_id>/', UpgradeProrationPreviewView.as_view()),
]

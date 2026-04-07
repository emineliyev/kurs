from django.urls import path
from .views import PaymentRequisiteListView, SubmitPaymentRequestView, MyPaymentRequestsView

urlpatterns = [
    path('requisites/', PaymentRequisiteListView.as_view(), name='payment-requisites'),
    path('submit/', SubmitPaymentRequestView.as_view(), name='payment-submit'),
    path('my-requests/', MyPaymentRequestsView.as_view(), name='payment-my-requests'),
]

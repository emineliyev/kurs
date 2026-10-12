import logging
from rest_framework import status
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsTeacher
from .models import PaymentRequisite, PaymentRequest
from .serializers import PaymentRequisiteSerializer, PaymentRequestSerializer, SubmitPaymentRequestSerializer
from .tasks import send_admin_notification_task
from .rotation import assign_requisites, release_holds

logger = logging.getLogger(__name__)


class PaymentRequisiteListView(APIView):
    """
    GET /api/payments/requisites/ — one requisite per payment method for this teacher.
    Cards with a daily limit rotate: a full card is skipped for the next one.
    """
    permission_classes = [IsTeacher]

    def get(self, request):
        requisites, exhausted = assign_requisites(request.user)
        return Response({
            'requisites': PaymentRequisiteSerializer(requisites, many=True).data,
            'exhausted_methods': exhausted,
        })


class SubmitPaymentRequestView(APIView):
    """POST /api/payments/submit/ — user submits payment screenshot + details."""
    permission_classes = [IsTeacher]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        serializer = SubmitPaymentRequestSerializer(data=request.data, context={'request': request})
        if serializer.is_valid():
            payment = serializer.save(teacher=request.user)
            if payment.requisite_id is None:
                # Fall back to the card this teacher was shown
                hold = request.user.payment_holds.select_related('requisite').first()
                if hold:
                    payment.requisite = hold.requisite
                    payment.save(update_fields=['requisite'])
            release_holds(request.user)
            send_admin_notification_task.delay(payment.pk)
            return Response(
                {'detail': 'Ödəniş sorğunuz qəbul edildi. Admin yoxlayandan sonra abunəliyiniz aktivləşdiriləcək.'},
                status=status.HTTP_201_CREATED,
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class MyPaymentRequestsView(APIView):
    """GET /api/payments/my-requests/ — teacher's own payment history."""
    permission_classes = [IsTeacher]

    def get(self, request):
        requests = PaymentRequest.objects.filter(teacher=request.user).select_related('plan')
        return Response(PaymentRequestSerializer(requests, many=True).data)

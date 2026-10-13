from datetime import timedelta
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from apps.accounts.permissions import IsTeacher
from .models import Plan, Subscription
from .serializers import PlanSerializer, SubscriptionSerializer


class PlanListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        plans = Plan.objects.filter(is_active=True).order_by('price')
        return Response(PlanSerializer(plans, many=True).data)


class SubscriptionView(APIView):
    """GET current subscription · POST to subscribe to a plan (initial or re-subscribe)."""
    permission_classes = [IsTeacher]

    def get(self, request):
        try:
            sub = Subscription.objects.select_related('plan', 'pending_plan').get(teacher=request.user)
            sub.reset_monthly_count_if_needed()
            return Response(SubscriptionSerializer(sub).data)
        except Subscription.DoesNotExist:
            return Response({'detail': 'No subscription found.'}, status=status.HTTP_404_NOT_FOUND)

    def post(self, request):
        """
        Activate the free trial for a teacher who has never had a subscription.
        Paid plans are activated only by an admin approving a PaymentRequest.
        """
        plan_id = request.data.get('plan_id')
        try:
            plan = Plan.objects.get(id=plan_id, is_active=True)
        except (Plan.DoesNotExist, ValueError, TypeError):
            return Response({'detail': 'Plan tapılmadı.'}, status=status.HTTP_404_NOT_FOUND)

        if plan.price > 0:
            return Response(
                {'detail': 'Ödənişli plan yalnız ödəniş təsdiqləndikdən sonra aktivləşir.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        if Subscription.objects.filter(teacher=request.user).exists():
            return Response(
                {'detail': 'Pulsuz sınaq müddətindən artıq istifadə etmisiniz.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        now = timezone.now()
        sub = Subscription.objects.create(
            teacher=request.user,
            plan=plan,
            status=Subscription.STATUS_TRIAL,
            start_date=now,
            end_date=now + timedelta(days=plan.duration_days),
        )
        return Response(SubscriptionSerializer(sub).data, status=status.HTTP_201_CREATED)


class DowngradeSubscriptionView(APIView):
    """Schedule a downgrade to take effect at end of billing period."""
    permission_classes = [IsTeacher]

    def post(self, request):
        plan_id = request.data.get('plan_id')
        try:
            sub  = Subscription.objects.select_related('plan').get(teacher=request.user)
            plan = Plan.objects.get(id=plan_id, is_active=True)
        except Subscription.DoesNotExist:
            return Response({'detail': 'Abunəlik tapılmadı.'}, status=status.HTTP_404_NOT_FOUND)
        except Plan.DoesNotExist:
            return Response({'detail': 'Plan tapılmadı.'}, status=status.HTTP_404_NOT_FOUND)

        if plan.tier >= sub.plan.tier:
            return Response({'detail': 'Bu bir downgrade deyil.'}, status=status.HTTP_400_BAD_REQUEST)

        # The free trial is given once at signup; switching to it would grant
        # another free period. To stop paying, the teacher cancels instead.
        if plan.price == 0:
            return Response(
                {'detail': 'Pulsuz plana keçmək mümkün deyil. Ödənişi dayandırmaq üçün abunəliyi ləğv edin.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Check if user exceeds new plan limits
        classes_used  = sub.teacher.classes.filter(is_active=True).count()
        from apps.accounts.students import active_student_count
        students_used = active_student_count(sub.teacher)

        errors = []
        if plan.max_classes != -1 and classes_used > plan.max_classes:
            errors.append(f'Mövcud sinif sayı ({classes_used}) yeni planın limitini ({plan.max_classes}) aşır.')
        if plan.max_students != -1 and students_used > plan.max_students:
            errors.append(f'Mövcud şagird sayı ({students_used}) yeni planın limitini ({plan.max_students}) aşır.')

        if errors:
            return Response({'detail': ' '.join(errors)}, status=status.HTTP_400_BAD_REQUEST)

        sub.schedule_downgrade(plan)
        return Response(SubscriptionSerializer(sub).data)


class CancelSubscriptionView(APIView):
    """Cancel subscription; access continues until end_date."""
    permission_classes = [IsTeacher]

    def post(self, request):
        try:
            sub = Subscription.objects.get(teacher=request.user)
        except Subscription.DoesNotExist:
            return Response({'detail': 'Abunəlik tapılmadı.'}, status=status.HTTP_404_NOT_FOUND)

        if sub.status == Subscription.STATUS_CANCELLED:
            return Response({'detail': 'Abunəlik artıq ləğv edilib.'}, status=status.HTTP_400_BAD_REQUEST)

        sub.cancel()
        return Response(SubscriptionSerializer(sub).data)


class ResumeSubscriptionView(APIView):
    """Cancel any pending downgrade or undo cancellation."""
    permission_classes = [IsTeacher]

    def post(self, request):
        try:
            sub = Subscription.objects.get(teacher=request.user)
        except Subscription.DoesNotExist:
            return Response({'detail': 'Abunəlik tapılmadı.'}, status=status.HTTP_404_NOT_FOUND)

        sub.resume()
        return Response(SubscriptionSerializer(sub).data)


class UpgradeProrationPreviewView(APIView):
    """Preview the proration charge before confirming upgrade."""
    permission_classes = [IsTeacher]

    def get(self, request, plan_id):
        try:
            sub  = Subscription.objects.select_related('plan').get(teacher=request.user)
            plan = Plan.objects.get(id=plan_id, is_active=True)
        except (Subscription.DoesNotExist, Plan.DoesNotExist):
            return Response({'detail': 'Tapılmadı.'}, status=status.HTTP_404_NOT_FOUND)

        proration = sub.calculate_upgrade_proration(plan)
        return Response({
            'current_plan': PlanSerializer(sub.plan).data,
            'new_plan': PlanSerializer(plan).data,
            'charged_amount': proration,
            'effective_immediately': True,
        })

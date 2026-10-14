from rest_framework import serializers
from apps.subscriptions.models import Plan
from .models import PaymentRequisite, PaymentRequest


class PaymentRequisiteSerializer(serializers.ModelSerializer):
    method_display = serializers.CharField(source='get_method_display', read_only=True)

    class Meta:
        model = PaymentRequisite
        fields = ['id', 'method', 'method_display', 'label', 'account_number', 'account_name', 'note']


class PaymentRequestSerializer(serializers.ModelSerializer):
    plan_name  = serializers.CharField(source='plan.display_name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    type_display   = serializers.CharField(source='get_order_type_display', read_only=True)

    class Meta:
        model = PaymentRequest
        fields = [
            'id', 'plan_name', 'amount', 'currency', 'order_type', 'type_display',
            'status', 'status_display', 'rejection_reason',
            'user_note', 'created_at',
        ]


class SubmitPaymentRequestSerializer(serializers.ModelSerializer):
    plan_id = serializers.PrimaryKeyRelatedField(
        queryset=Plan.objects.filter(is_active=True),
        source='plan',
        write_only=True,
    )
    requisite_id = serializers.PrimaryKeyRelatedField(
        queryset=PaymentRequisite.objects.all(),
        source='requisite',
        write_only=True, required=False, allow_null=True,
    )

    class Meta:
        model = PaymentRequest
        fields = ['plan_id', 'requisite_id', 'amount', 'order_type', 'screenshot', 'user_note']
        extra_kwargs = {'amount': {'required': False}}

    def validate(self, attrs):
        # The price is the server's to decide, not the form's: plan price, or the prorated
        # difference for an upgrade (same formula as the preview the teacher saw)
        plan = attrs['plan']
        amount = plan.price
        if attrs.get('order_type') == PaymentRequest.TYPE_UPGRADE:
            from apps.subscriptions.models import Subscription
            sub = Subscription.objects.select_related('plan').filter(teacher=self.context['request'].user).first()
            if sub is not None and sub.is_active and plan.tier > sub.plan.tier:
                amount = sub.calculate_upgrade_proration(plan)
        if amount <= 0:
            raise serializers.ValidationError({'amount': 'Bu plan üçün ödəniş tələb olunmur.'})
        from decimal import Decimal
        attrs['amount'] = Decimal(str(round(float(amount), 2)))
        return attrs

    def validate_screenshot(self, value):
        max_mb = 5
        if value.size > max_mb * 1024 * 1024:
            raise serializers.ValidationError(f'Fayl ölçüsü {max_mb}MB-dan çox ola bilməz.')
        allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic']
        if hasattr(value, 'content_type') and value.content_type not in allowed:
            raise serializers.ValidationError('Yalnız JPG, PNG, WEBP formatı qəbul edilir.')
        return value

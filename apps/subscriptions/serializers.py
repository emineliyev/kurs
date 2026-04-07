from rest_framework import serializers
from .models import Plan, Subscription


class PlanSerializer(serializers.ModelSerializer):
    tier = serializers.IntegerField(read_only=True)

    class Meta:
        model = Plan
        fields = [
            'id', 'name', 'display_name', 'price', 'tier',
            'max_tests_per_month', 'max_exams_per_month',
            'max_classes', 'max_students',
            'duration_days', 'description', 'is_active',
        ]


class SubscriptionSerializer(serializers.ModelSerializer):
    plan_details         = PlanSerializer(source='plan', read_only=True)
    pending_plan_details = PlanSerializer(source='pending_plan', read_only=True)
    is_active            = serializers.BooleanField(read_only=True)
    can_create_test      = serializers.BooleanField(read_only=True)
    can_create_exam      = serializers.BooleanField(read_only=True)
    days_remaining       = serializers.IntegerField(read_only=True)
    has_pending_downgrade       = serializers.BooleanField(read_only=True)
    is_cancellation_scheduled   = serializers.BooleanField(read_only=True)
    classes_used         = serializers.SerializerMethodField()
    students_used        = serializers.SerializerMethodField()

    class Meta:
        model = Subscription
        fields = [
            'id', 'plan', 'plan_details',
            'pending_plan', 'pending_plan_details', 'pending_change_date',
            'status', 'start_date', 'end_date',
            'cancelled_at', 'days_remaining',
            'tests_used_this_month', 'exams_used_this_month',
            'is_active', 'can_create_test', 'can_create_exam',
            'has_pending_downgrade', 'is_cancellation_scheduled',
            'classes_used', 'students_used',
            'created_at',
        ]
        read_only_fields = ['id', 'start_date', 'created_at']

    def get_classes_used(self, obj):
        return obj.teacher.classes.filter(is_active=True).count()

    def get_students_used(self, obj):
        from apps.classes.models import ClassEnrollment
        return ClassEnrollment.objects.filter(
            class_room__teacher=obj.teacher,
            is_active=True
        ).values('student').distinct().count()

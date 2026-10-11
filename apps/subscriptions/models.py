from django.db import models
from django.utils import timezone
from apps.accounts.models import User


class Plan(models.Model):
    PLAN_FREE     = 'free'
    PLAN_STANDARD = 'standard'
    PLAN_PRO      = 'pro'
    PLAN_CHOICES  = [
        (PLAN_FREE,     'Free Trial'),
        (PLAN_STANDARD, 'Standard'),
        (PLAN_PRO,      'Pro'),
    ]
    # Determines upgrade vs downgrade direction
    PLAN_TIER = {PLAN_FREE: 0, PLAN_STANDARD: 1, PLAN_PRO: 2}

    name         = models.CharField(max_length=50, choices=PLAN_CHOICES, unique=True)
    display_name = models.CharField(max_length=100)
    price        = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    max_tests_per_month = models.IntegerField(default=-1, help_text='-1 means unlimited')
    max_exams_per_month = models.IntegerField(default=-1, help_text='-1 means unlimited')
    max_classes         = models.IntegerField(default=-1, help_text='-1 means unlimited')
    max_students        = models.IntegerField(default=-1, help_text='-1 means unlimited')
    duration_days       = models.PositiveSmallIntegerField(default=30)
    is_active    = models.BooleanField(default=True)
    description  = models.TextField(blank=True)
    created_at   = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.display_name

    @property
    def tier(self):
        return self.PLAN_TIER.get(self.name, 0)


class Subscription(models.Model):
    EXPIRED_MESSAGE = 'Abunəliyinizin müddəti bitib. Davam etmək üçün abunəliyinizi yeniləyin.'

    STATUS_ACTIVE    = 'active'
    STATUS_EXPIRED   = 'expired'
    STATUS_CANCELLED = 'cancelled'
    STATUS_TRIAL     = 'trial'
    STATUS_CHOICES   = [
        (STATUS_ACTIVE,    'Active'),
        (STATUS_EXPIRED,   'Expired'),
        (STATUS_CANCELLED, 'Cancelled'),
        (STATUS_TRIAL,     'Free Trial'),
    ]

    teacher              = models.OneToOneField(User, on_delete=models.CASCADE, related_name='subscription')
    plan                 = models.ForeignKey(Plan, on_delete=models.PROTECT, related_name='subscriptions')
    status               = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_TRIAL)
    start_date           = models.DateTimeField(default=timezone.now)
    end_date             = models.DateTimeField()

    # Scheduled downgrade — applied when end_date is reached
    pending_plan         = models.ForeignKey(
        Plan, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='pending_subscriptions'
    )
    pending_change_date  = models.DateTimeField(null=True, blank=True)

    # Cancellation tracking
    cancelled_at         = models.DateTimeField(null=True, blank=True)

    payment_reference       = models.CharField(max_length=200, blank=True)
    tests_used_this_month   = models.PositiveIntegerField(default=0)
    exams_used_this_month   = models.PositiveIntegerField(default=0)
    last_reset_date         = models.DateField(auto_now_add=True)
    created_at              = models.DateTimeField(auto_now_add=True)
    updated_at              = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'{self.teacher.get_full_name()} — {self.plan.display_name}'

    # ── Status helpers ─────────────────────────────────────────────────────────

    @property
    def is_active(self):
        """User retains access until end_date even after cancellation."""
        now = timezone.now()
        if now > self.end_date:
            return False
        return self.status in [self.STATUS_ACTIVE, self.STATUS_TRIAL, self.STATUS_CANCELLED]

    @property
    def days_remaining(self):
        delta = self.end_date - timezone.now()
        return max(0, delta.days)

    @property
    def has_pending_downgrade(self):
        return self.pending_plan_id is not None

    @property
    def is_cancellation_scheduled(self):
        return self.status == self.STATUS_CANCELLED and self.cancelled_at is not None

    # ── Usage helpers ──────────────────────────────────────────────────────────

    def can_create_test(self):
        if not self.is_active:
            return False
        if self.plan.max_tests_per_month == -1:
            return True
        return self.tests_used_this_month < self.plan.max_tests_per_month

    def can_create_exam(self):
        if not self.is_active:
            return False
        if self.plan.max_exams_per_month == -1:
            return True
        return self.exams_used_this_month < self.plan.max_exams_per_month

    def reset_monthly_count_if_needed(self):
        today = timezone.now().date()
        if today.month != self.last_reset_date.month or today.year != self.last_reset_date.year:
            self.tests_used_this_month = 0
            self.exams_used_this_month = 0
            self.last_reset_date = today
            self.save(update_fields=['tests_used_this_month', 'exams_used_this_month', 'last_reset_date'])

    # ── Plan change helpers ────────────────────────────────────────────────────

    def calculate_upgrade_proration(self, new_plan):
        """
        Amount charged for immediate upgrade.
        = new_plan_price − (credit for remaining days on current plan)
        """
        now = timezone.now()
        total_secs     = (self.end_date - self.start_date).total_seconds()
        remaining_secs = (self.end_date - now).total_seconds()
        if total_secs <= 0 or remaining_secs <= 0:
            return float(new_plan.price)
        fraction   = remaining_secs / total_secs
        credit     = float(self.plan.price) * fraction
        proration  = float(new_plan.price) - credit
        return max(0.0, round(proration, 2))

    def apply_upgrade(self, new_plan):
        """Immediately switch to higher plan, reset billing period."""
        now = timezone.now()
        self.plan       = new_plan
        self.status     = self.STATUS_ACTIVE
        self.start_date = now
        self.end_date   = now + __import__('datetime').timedelta(days=new_plan.duration_days)
        # Clear any pending changes
        self.pending_plan        = None
        self.pending_change_date = None
        self.cancelled_at        = None
        self.save()

    def schedule_downgrade(self, new_plan):
        """Queue a downgrade to take effect at end of current billing period."""
        self.pending_plan        = new_plan
        self.pending_change_date = self.end_date
        self.save(update_fields=['pending_plan', 'pending_change_date'])

    def apply_pending_downgrade(self):
        """Called by management command when billing period ends."""
        if not self.pending_plan:
            return
        now = timezone.now()
        self.plan        = self.pending_plan
        self.start_date  = now
        self.end_date    = now + __import__('datetime').timedelta(days=self.pending_plan.duration_days)
        self.status      = self.STATUS_ACTIVE
        self.pending_plan        = None
        self.pending_change_date = None
        self.cancelled_at        = None
        self.save()

    def cancel(self):
        """Mark for cancellation; access remains until end_date."""
        self.status       = self.STATUS_CANCELLED
        self.cancelled_at = timezone.now()
        # Clear any pending downgrade since cancel supersedes it
        self.pending_plan        = None
        self.pending_change_date = None
        self.save(update_fields=['status', 'cancelled_at', 'pending_plan', 'pending_change_date'])

    def resume(self):
        """Remove pending downgrade or undo cancellation."""
        self.status              = self.STATUS_ACTIVE
        self.cancelled_at        = None
        self.pending_plan        = None
        self.pending_change_date = None
        self.save(update_fields=['status', 'cancelled_at', 'pending_plan', 'pending_change_date'])

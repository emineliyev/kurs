import re
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.utils.translation import gettext_lazy as _
from rest_framework import serializers
from rest_framework_simplejwt.tokens import RefreshToken
from .models import User, TeacherProfile, StudentProfile, Feedback


def validate_strong_password(value):
    if not re.search(r'[A-Z]', value):
        raise serializers.ValidationError(_('Password must contain at least one uppercase letter.'))
    if not re.search(r'[a-z]', value):
        raise serializers.ValidationError(_('Password must contain at least one lowercase letter.'))
    if not re.search(r'\d', value):
        raise serializers.ValidationError(_('Password must contain at least one digit.'))
    if not re.search(r'[!@#$%^&*(),.?":{}|<>]', value):
        raise serializers.ValidationError(_('Password must contain at least one special character.'))
    return value


class TeacherProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = TeacherProfile
        fields = ['avatar', 'bio', 'organization', 'phone', 'subject']


class StudentProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = StudentProfile
        fields = ['avatar', 'grade', 'parent_email']


class UserSerializer(serializers.ModelSerializer):
    teacher_profile = TeacherProfileSerializer(read_only=True)
    student_profile = StudentProfileSerializer(read_only=True)
    full_name = serializers.CharField(source='get_full_name', read_only=True)

    class Meta:
        model = User
        fields = [
            'id', 'email', 'username', 'first_name', 'last_name',
            'full_name', 'role', 'is_active', 'is_email_verified', 'created_at',
            'teacher_profile', 'student_profile',
        ]
        read_only_fields = ['id', 'created_at', 'role', 'is_email_verified']


class TeacherRegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    password_confirm = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ['email', 'username', 'first_name', 'last_name', 'password', 'password_confirm']

    def validate_password(self, value):
        return validate_strong_password(value)

    def validate(self, attrs):
        if attrs.get('password') != attrs.pop('password_confirm'):
            raise serializers.ValidationError({'password_confirm': _('Passwords do not match.')})
        return attrs

    def create(self, validated_data):
        password = validated_data.pop('password')
        user = User(**validated_data, role=User.ROLE_TEACHER)
        user.set_password(password)
        user.save()
        from .models import TeacherProfile
        TeacherProfile.objects.get_or_create(user=user)
        return user


def _clean_username(value, instance=None):
    from .students import USERNAME_RE, USERNAME_RULES
    value = (value or '').strip().lower()
    if not USERNAME_RE.match(value):
        raise serializers.ValidationError(USERNAME_RULES)
    taken = User.objects.filter(username__iexact=value)
    if instance is not None:
        taken = taken.exclude(pk=instance.pk)
    if taken.exists():
        raise serializers.ValidationError('Bu istifadəçi adı artıq tutulub.')
    return value


def _strong_student_password(value):
    """Teacher-set student passwords follow the same rules as everyone else's."""
    if len(value) < 8:
        raise serializers.ValidationError('Şifrə ən azı 8 simvol olmalıdır.')
    return validate_strong_password(value)


def _teacher_classes(serializer):
    from apps.classes.models import Class
    return Class.objects.filter(teacher=serializer.context['request'].user)


class StudentSerializer(serializers.ModelSerializer):
    """A student as the owning teacher sees it, with the teacher's classes it's enrolled in."""
    full_name = serializers.CharField(source='get_full_name', read_only=True)
    classes = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'first_name', 'last_name', 'full_name', 'username', 'is_active', 'created_at', 'classes']

    def get_classes(self, obj):
        # relies on the view's prefetch of active enrollments (to_attr='active_enrollments')
        return [{'id': e.class_room_id, 'name': e.class_room.name} for e in obj.active_enrollments]


class StudentCreateSerializer(serializers.ModelSerializer):
    first_name = serializers.CharField(max_length=100)
    last_name = serializers.CharField(max_length=100)
    username = serializers.CharField(max_length=50)
    password = serializers.CharField(write_only=True)
    class_id = serializers.IntegerField(write_only=True)

    class Meta:
        model = User
        fields = ['first_name', 'last_name', 'username', 'password', 'class_id']

    def validate_username(self, value):
        return _clean_username(value)

    def validate_password(self, value):
        return _strong_student_password(value)

    def validate_class_id(self, value):
        if not _teacher_classes(self).filter(pk=value).exists():
            raise serializers.ValidationError('Sinif tapılmadı.')
        return value

    def create(self, validated_data):
        from django.db import transaction
        from apps.classes.models import ClassEnrollment
        from .models import StudentProfile
        password = validated_data.pop('password')
        class_id = validated_data.pop('class_id')
        with transaction.atomic():
            user = User(**validated_data, role=User.ROLE_STUDENT, email=None,
                        created_by=self.context['request'].user)
            user.set_password(password)
            user.save()
            StudentProfile.objects.get_or_create(user=user)
            ClassEnrollment.objects.create(student=user, class_room_id=class_id, is_active=True)
        return user


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField(required=False)
    username = serializers.CharField(required=False)
    password = serializers.CharField()

    def validate(self, attrs):
        from django.contrib.auth import authenticate
        email = attrs.get('email')
        username = attrs.get('username')
        password = attrs.get('password')

        if not email and not username:
            raise serializers.ValidationError(_('Email or username is required.'))

        user = None
        if email:
            user = authenticate(request=self.context.get('request'), username=email, password=password)
        if not user and username:
            # Students have no email, so check the password directly instead of via the email backend
            from .students import find_by_username
            user_obj = find_by_username(username)
            if user_obj is not None and user_obj.check_password(password):
                user = user_obj

        if not user:
            raise serializers.ValidationError(_('Invalid credentials.'))

        if not user.is_active:
            raise serializers.ValidationError(_('Account is disabled.'))

        attrs['user'] = user
        return attrs


class StudentUpdateSerializer(serializers.ModelSerializer):
    first_name = serializers.CharField(max_length=100)
    last_name = serializers.CharField(max_length=100)
    username = serializers.CharField(max_length=50)
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    # Full set of the teacher's classes the student should be in; omitted = leave as is
    class_ids = serializers.ListField(child=serializers.IntegerField(), write_only=True, required=False)

    class Meta:
        model = User
        fields = ['first_name', 'last_name', 'username', 'password', 'class_ids']

    def validate_username(self, value):
        return _clean_username(value, self.instance)

    def validate_password(self, value):
        if not value:
            return value  # blank = keep the current password
        return _strong_student_password(value)

    def validate_class_ids(self, value):
        value = set(value)
        if len(value) != _teacher_classes(self).filter(pk__in=value).count():
            raise serializers.ValidationError('Sinif tapılmadı.')
        return value

    def update(self, instance, validated_data):
        from django.db import transaction
        from apps.classes.models import ClassEnrollment
        password = validated_data.pop('password', None)
        class_ids = validated_data.pop('class_ids', None)
        with transaction.atomic():
            for attr, value in validated_data.items():
                setattr(instance, attr, value)
            if password:
                instance.set_password(password)
            instance.save()
            if class_ids is not None:
                mine = ClassEnrollment.objects.filter(student=instance, class_room__in=_teacher_classes(self))
                mine.exclude(class_room_id__in=class_ids).update(is_active=False)
                mine.filter(class_room_id__in=class_ids).update(is_active=True)
                existing = set(mine.values_list('class_room_id', flat=True))
                ClassEnrollment.objects.bulk_create([
                    ClassEnrollment(student=instance, class_room_id=cid, is_active=True)
                    for cid in class_ids - existing
                ])
        return instance


class PasswordChangeSerializer(serializers.Serializer):
    old_password = serializers.CharField()
    new_password = serializers.CharField(min_length=8)
    new_password_confirm = serializers.CharField()

    def validate_new_password(self, value):
        return validate_strong_password(value)

    def validate(self, attrs):
        if attrs.get('new_password') != attrs.get('new_password_confirm'):
            raise serializers.ValidationError({'new_password_confirm': _('Passwords do not match.')})
        return attrs


class FeedbackSerializer(serializers.ModelSerializer):
    teacher_name = serializers.CharField(source='teacher.get_full_name', read_only=True)

    class Meta:
        model = Feedback
        fields = ['id', 'type', 'subject', 'message', 'teacher_name', 'is_read', 'created_at']
        read_only_fields = ['id', 'teacher_name', 'is_read', 'created_at']

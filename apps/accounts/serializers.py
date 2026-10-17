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
    """A student as the owning teacher sees it, with the class it's in (one at most)."""
    full_name = serializers.CharField(source='get_full_name', read_only=True)
    classes = serializers.SerializerMethodField()
    class_id = serializers.SerializerMethodField()
    class_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'first_name', 'last_name', 'full_name', 'username', 'is_active', 'created_at',
                  'classes', 'class_id', 'class_name']

    def get_classes(self, obj):
        # relies on the view's prefetch of active enrollments (to_attr='active_enrollments')
        return [{'id': e.class_room_id, 'name': e.class_room.name} for e in obj.active_enrollments]

    def get_class_id(self, obj):
        return obj.active_enrollments[0].class_room_id if obj.active_enrollments else None

    def get_class_name(self, obj):
        return obj.active_enrollments[0].class_room.name if obj.active_enrollments else None


def _own_class(serializer, value):
    """One of the teacher's classes, or None."""
    if value is None:
        return None
    cls = _teacher_classes(serializer).filter(pk=value).first()
    if cls is None:
        raise serializers.ValidationError('Sinif tapılmadı.')
    return cls


class StudentCreateSerializer(serializers.ModelSerializer):
    first_name = serializers.CharField(max_length=100)
    last_name = serializers.CharField(max_length=100)
    username = serializers.CharField(max_length=50)
    password = serializers.CharField(write_only=True)
    # optional: a student can be added without a class and placed in one later
    class_id = serializers.IntegerField(write_only=True, required=False, allow_null=True)

    class Meta:
        model = User
        fields = ['first_name', 'last_name', 'username', 'password', 'class_id']

    def validate_username(self, value):
        return _clean_username(value)

    def validate_password(self, value):
        return _strong_student_password(value)

    def validate_class_id(self, value):
        return _own_class(self, value)

    def create(self, validated_data):
        from django.db import transaction
        from apps.classes.models import ClassEnrollment
        from .models import StudentProfile
        password = validated_data.pop('password')
        class_room = validated_data.pop('class_id', None)
        with transaction.atomic():
            user = User(**validated_data, role=User.ROLE_STUDENT, email=None,
                        created_by=self.context['request'].user)
            user.set_password(password)
            user.save()
            StudentProfile.objects.get_or_create(user=user)
            if class_room is not None:
                ClassEnrollment.objects.create(student=user, class_room=class_room, is_active=True)
        return user


class StudentBulkCreateSerializer(serializers.Serializer):
    """Many students in one go (a pasted list), optionally all into one class."""
    MAX = 200
    students = serializers.ListField(child=serializers.DictField(), allow_empty=False, max_length=MAX)
    class_id = serializers.IntegerField(required=False, allow_null=True)

    def validate_class_id(self, value):
        return _own_class(self, value)

    def validate_students(self, rows):
        errors = {}
        # the same username twice in the list — flagged on every such row, whatever else is wrong
        by_name = {}
        for i, row in enumerate(rows):
            by_name.setdefault(str(row.get('username') or '').strip().lower(), []).append(i)
        for name, idx in by_name.items():
            if name and len(idx) > 1:
                for i in idx:
                    errors[i] = {'username': 'Bu istifadəçi adı siyahıda təkrarlanır.'}
        for i, row in enumerate(rows):
            row_serializer = StudentCreateSerializer(data={k: row.get(k) for k in
                                                           ('first_name', 'last_name', 'username', 'password')},
                                                     context=self.context)
            if not row_serializer.is_valid():
                errors[i] = {**{k: v[0] for k, v in row_serializer.errors.items()}, **errors.get(i, {})}
                continue
            rows[i] = row_serializer.validated_data
        if errors:
            raise serializers.ValidationError({str(k): v for k, v in sorted(errors.items())})
        return rows

    def create(self, validated_data):
        from django.db import transaction
        from apps.classes.models import ClassEnrollment
        teacher = self.context['request'].user  # profiles come from the post_save signal
        class_room = validated_data.get('class_id')
        created = []
        with transaction.atomic():
            for row in validated_data['students']:
                row = dict(row)
                password = row.pop('password')
                user = User(**row, role=User.ROLE_STUDENT, email=None, created_by=teacher)
                user.set_password(password)
                user.save()
                created.append(user)
            if class_room is not None:
                ClassEnrollment.objects.bulk_create([
                    ClassEnrollment(student=u, class_room=class_room, is_active=True) for u in created])
        return created


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
    # The student's class (null = no class); omitted = leave as is
    class_id = serializers.IntegerField(write_only=True, required=False, allow_null=True)
    # Older clients send a list — at most one class now
    class_ids = serializers.ListField(child=serializers.IntegerField(), write_only=True, required=False)

    class Meta:
        model = User
        fields = ['first_name', 'last_name', 'username', 'password', 'class_id', 'class_ids']

    def validate_username(self, value):
        return _clean_username(value, self.instance)

    def validate_password(self, value):
        if not value:
            return value  # blank = keep the current password
        return _strong_student_password(value)

    def validate_class_id(self, value):
        return _own_class(self, value)

    def validate_class_ids(self, value):
        value = list(dict.fromkeys(value))
        if len(value) > 1:
            raise serializers.ValidationError('Şagird yalnız bir sinifdə ola bilər.')
        return _own_class(self, value[0]) if value else None

    def update(self, instance, validated_data):
        from django.db import transaction
        from apps.classes.membership import place_students
        password = validated_data.pop('password', None)
        has_class = 'class_id' in validated_data or 'class_ids' in validated_data
        class_room = validated_data.pop('class_id', validated_data.pop('class_ids', None))
        validated_data.pop('class_ids', None)
        with transaction.atomic():
            for attr, value in validated_data.items():
                setattr(instance, attr, value)
            if password:
                instance.set_password(password)
            instance.save()
            if has_class:
                place_students([instance.pk], class_room)
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

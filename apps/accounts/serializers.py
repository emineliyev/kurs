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


class StudentCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=6)

    class Meta:
        model = User
        fields = ['username', 'first_name', 'last_name', 'password']

    def create(self, validated_data):
        password = validated_data.pop('password')
        username = validated_data['username']
        email = f'{username}@student.kurs.az'
        user = User(**validated_data, role=User.ROLE_STUDENT, email=email)
        user.set_password(password)
        user.save()
        from .models import StudentProfile
        StudentProfile.objects.get_or_create(user=user)
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
            try:
                user_obj = User.objects.get(username=username)
                user = authenticate(request=self.context.get('request'), username=user_obj.email, password=password)
            except User.DoesNotExist:
                pass

        if not user:
            raise serializers.ValidationError(_('Invalid credentials.'))

        if not user.is_active:
            raise serializers.ValidationError(_('Account is disabled.'))

        attrs['user'] = user
        return attrs


class StudentUpdateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, min_length=6, allow_blank=True)

    class Meta:
        model = User
        fields = ['first_name', 'last_name', 'username', 'password']

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
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

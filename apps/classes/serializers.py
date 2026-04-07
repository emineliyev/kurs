from rest_framework import serializers
from apps.accounts.serializers import UserSerializer
from .models import Subject, Class, ClassEnrollment


class SubjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = Subject
        fields = ['id', 'name', 'name_az', 'name_en', 'name_ru', 'description']


class ClassSerializer(serializers.ModelSerializer):
    teacher_name = serializers.CharField(source='teacher.get_full_name', read_only=True)
    subject_name = serializers.CharField(source='subject.name', read_only=True)
    subject_name_az = serializers.CharField(source='subject.name_az', read_only=True, default=None)
    subject_name_en = serializers.CharField(source='subject.name_en', read_only=True, default=None)
    subject_name_ru = serializers.CharField(source='subject.name_ru', read_only=True, default=None)
    student_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Class
        fields = [
            'id', 'name', 'grade', 'group', 'description',
            'subject', 'subject_name', 'subject_name_az', 'subject_name_en', 'subject_name_ru',
            'teacher_name', 'student_count', 'is_active', 'created_at',
        ]
        read_only_fields = ['id', 'created_at']


class ClassEnrollmentSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.get_full_name', read_only=True)
    student_username = serializers.CharField(source='student.username', read_only=True)
    student_is_active = serializers.BooleanField(source='student.is_active', read_only=True)

    class Meta:
        model = ClassEnrollment
        fields = ['id', 'student', 'student_name', 'student_username', 'enrolled_at', 'is_active', 'student_is_active']
        read_only_fields = ['id', 'enrolled_at']


class EnrollStudentSerializer(serializers.Serializer):
    student_id = serializers.IntegerField()

    def validate_student_id(self, value):
        from apps.accounts.models import User
        try:
            user = User.objects.get(id=value, role='student')
        except User.DoesNotExist:
            raise serializers.ValidationError('Student not found.')
        return value

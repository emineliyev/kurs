from rest_framework import serializers
from apps.accounts.serializers import UserSerializer
from .models import Subject, Class, ClassEnrollment


class SubjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = Subject
        fields = ['id', 'name', 'name_az', 'name_en', 'name_ru', 'description']


class ClassSerializer(serializers.ModelSerializer):
    teacher_name = serializers.CharField(source='teacher.get_full_name', read_only=True)
    student_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Class
        fields = [
            'id', 'name', 'grade', 'group', 'description',
            'subject',
            'teacher_name', 'student_count', 'is_active', 'created_at',
        ]
        read_only_fields = ['id', 'created_at']

    def to_internal_value(self, data):
        # Forms send "" when no grade is chosen; treat it as "not set".
        if hasattr(data, 'get') and data.get('grade') == '':
            data = data.copy() if hasattr(data, 'copy') else dict(data)
            data['grade'] = None
        return super().to_internal_value(data)


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
        from apps.accounts.students import students_of
        if not students_of(self.context['request'].user).filter(pk=value, is_active=True).exists():
            raise serializers.ValidationError('Şagird tapılmadı.')
        return value

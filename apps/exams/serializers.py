from django.utils import timezone
from rest_framework import serializers
from apps.accounts.serializers import UserSerializer
from apps.tests_app.serializers import QuestionPublicSerializer
from .models import Exam, ExamResult, StudentAnswer


class ExamSerializer(serializers.ModelSerializer):
    test_title = serializers.CharField(source='test.title', read_only=True)
    test_topic = serializers.CharField(source='test.topic', read_only=True, default='')
    class_name = serializers.CharField(source='class_room.name', read_only=True)
    class_grade = serializers.IntegerField(source='class_room.grade', read_only=True)
    class_group = serializers.CharField(source='class_room.group', read_only=True)
    teacher_name = serializers.SerializerMethodField()
    subject_name = serializers.SerializerMethodField()
    is_ongoing = serializers.BooleanField(read_only=True)
    is_upcoming = serializers.BooleanField(read_only=True)
    is_finished = serializers.BooleanField(read_only=True)
    my_status = serializers.SerializerMethodField()
    participants_count = serializers.SerializerMethodField()
    passed_count = serializers.SerializerMethodField()
    failed_count = serializers.SerializerMethodField()
    has_results = serializers.SerializerMethodField()
    needs_grading_count = serializers.SerializerMethodField()

    class Meta:
        model = Exam
        fields = [
            'id', 'test', 'test_title', 'test_topic', 'class_room', 'class_name',
            'class_grade', 'class_group', 'teacher_name', 'subject_name',
            'title', 'start_time', 'end_time', 'duration_minutes',
            'randomize_questions', 'randomize_answers', 'is_active',
            'is_ongoing', 'is_upcoming', 'is_finished', 'my_status',
            'participants_count', 'passed_count', 'failed_count', 'has_results',
            'needs_grading_count', 'created_at',
        ]
        read_only_fields = ['id', 'created_at']

    def get_teacher_name(self, obj):
        try:
            return obj.class_room.teacher.get_full_name() or obj.class_room.teacher.username
        except Exception:
            return ''

    def get_subject_name(self, obj):
        try:
            return obj.class_room.subject
        except Exception:
            return ''

    def get_my_status(self, obj):
        request = self.context.get('request')
        if not request or not hasattr(request.user, 'is_student') or not request.user.is_student:
            return None
        try:
            return obj.results.get(student=request.user).status
        except ExamResult.DoesNotExist:
            return None

    def get_participants_count(self, obj):
        return obj.results.filter(status='submitted').count()

    def get_passed_count(self, obj):
        return obj.results.filter(status='submitted', passed=True).count()

    def get_failed_count(self, obj):
        return obj.results.filter(status='submitted', passed=False).count()

    def get_has_results(self, obj):
        return obj.results.exists()

    def get_needs_grading_count(self, obj):
        return ExamResult.objects.filter(
            exam=obj,
            status=ExamResult.STATUS_SUBMITTED,
            answers__is_correct__isnull=True,
        ).distinct().count()

    def validate(self, attrs):
        start = attrs.get('start_time')
        end = attrs.get('end_time')
        if start and end and start >= end:
            raise serializers.ValidationError({'end_time': 'End time must be after start time.'})
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            test = attrs.get('test')
            if test is not None and test.teacher_id != request.user.id:
                raise serializers.ValidationError({'test': 'Test tapılmadı.'})
            if test is not None and not test.is_published:
                raise serializers.ValidationError({'test': 'Test hazır deyil. Əvvəlcə testi tamamlayın.'})
            class_room = attrs.get('class_room')
            if class_room is not None and class_room.teacher_id != request.user.id:
                raise serializers.ValidationError({'class_room': 'Sinif tapılmadı.'})
        return attrs


class StudentAnswerSerializer(serializers.ModelSerializer):
    class Meta:
        model = StudentAnswer
        fields = ['question', 'selected_answer', 'open_text', 'answer_text']
        extra_kwargs = {
            'selected_answer': {'required': False, 'allow_null': True},
            'open_text': {'required': False},
            'answer_text': {'required': False},
        }


class AnswerReviewSerializer(serializers.ModelSerializer):
    class Meta:
        from apps.tests_app.models import Answer
        model = Answer
        fields = ['id', 'text', 'is_correct', 'order']


class StudentAnswerReviewSerializer(serializers.ModelSerializer):
    question_text = serializers.CharField(source='question.text', read_only=True)
    question_type = serializers.CharField(source='question.question_type', read_only=True)
    question_image = serializers.SerializerMethodField()
    question_order = serializers.IntegerField(source='question.order', read_only=True)
    question_points = serializers.IntegerField(source='question.points', read_only=True)
    all_answers = serializers.SerializerMethodField()
    selected_answer_id = serializers.SerializerMethodField()

    class Meta:
        model = StudentAnswer
        fields = [
            'question', 'question_text', 'question_type', 'question_image', 'question_order',
            'question_points', 'all_answers', 'selected_answer_id',
            'open_text', 'answer_text', 'is_correct', 'points_earned',
        ]

    def get_question_image(self, obj):
        if not obj.question.image:
            return None
        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(obj.question.image.url)
        return obj.question.image.url

    def get_all_answers(self, obj):
        manual_types = ('open', 'long_answer', 'short_answer', 'numeric')
        if obj.question.question_type in manual_types:
            return []
        return [
            {'id': a.id, 'text': a.text, 'is_correct': a.is_correct, 'order': a.order}
            for a in obj.question.answers.all()
        ]

    def get_selected_answer_id(self, obj):
        return obj.selected_answer_id


class ExamResultSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.get_full_name', read_only=True)
    student_username = serializers.CharField(source='student.username', read_only=True)
    needs_grading = serializers.SerializerMethodField()

    class Meta:
        model = ExamResult
        fields = [
            'id', 'exam', 'student', 'student_name', 'student_username',
            'status', 'score', 'total_points', 'percentage', 'passed',
            'tab_switch_count', 'started_at', 'submitted_at', 'pdf_report_url',
            'needs_grading',
        ]
        read_only_fields = [
            'id', 'student', 'started_at', 'submitted_at',
            'score', 'total_points', 'percentage', 'passed',
            'tab_switch_count', 'pdf_report_url', 'needs_grading',
        ]

    def get_needs_grading(self, obj):
        """True if any long_answer question hasn't been manually graded yet (points_earned still 0 and is_correct is None)."""
        manual_types = ('open', 'long_answer')
        return obj.answers.filter(
            question__question_type__in=manual_types,
            is_correct__isnull=True,
        ).exists()


class ExamResultDetailSerializer(ExamResultSerializer):
    answers_review = StudentAnswerReviewSerializer(source='answers', many=True, read_only=True)

    class Meta(ExamResultSerializer.Meta):
        fields = ExamResultSerializer.Meta.fields + ['answers_review']


class SubmitExamSerializer(serializers.Serializer):
    answers = StudentAnswerSerializer(many=True)

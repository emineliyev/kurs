from rest_framework import serializers
from .models import Test, Question, Answer, TestVersion, BankQuestion, BankAnswer


class AnswerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Answer
        fields = ['id', 'text', 'is_correct', 'order']
        read_only_fields = ['id']


class AnswerPublicSerializer(serializers.ModelSerializer):
    """Serializer without is_correct field for students"""
    class Meta:
        model = Answer
        fields = ['id', 'text', 'order']


class QuestionSerializer(serializers.ModelSerializer):
    answers = AnswerSerializer(many=True, required=False)

    class Meta:
        model = Question
        fields = [
            'id', 'question_type', 'text', 'image', 'math_formula',
            'model_answer', 'correct_answer', 'tolerance',
            'points', 'order', 'hide_choices', 'answers',
        ]
        read_only_fields = ['id']

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if instance.image:
            data['image'] = f'/media/{instance.image.name}'
        return data

    def create(self, validated_data):
        answers_data = validated_data.pop('answers', [])
        question = Question.objects.create(**validated_data)
        for answer_data in answers_data:
            Answer.objects.create(question=question, **answer_data)
        return question

    def update(self, instance, validated_data):
        answers_data = validated_data.pop('answers', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if answers_data is not None:
            instance.answers.all().delete()
            for answer_data in answers_data:
                Answer.objects.create(question=instance, **answer_data)
        return instance


class QuestionPublicSerializer(serializers.ModelSerializer):
    """For students - no correct answer info"""
    answers = serializers.SerializerMethodField()

    def get_answers(self, obj):
        # Per-student shuffled order when the exam asks for it
        order = self.context.get('answer_order', {}).get(obj.pk)
        return AnswerPublicSerializer(order if order is not None else obj.answers.all(), many=True).data

    class Meta:
        model = Question
        # correct_answer, tolerance, model_answer intentionally excluded (teacher reference only)
        fields = ['id', 'question_type', 'text', 'image', 'math_formula', 'points', 'order', 'answers']

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if instance.image:
            data['image'] = f'/media/{instance.image.name}'
        return data


class TestSerializer(serializers.ModelSerializer):
    question_count = serializers.IntegerField(read_only=True)
    total_points = serializers.IntegerField(read_only=True)
    teacher_name = serializers.CharField(source='teacher.get_full_name', read_only=True)
    class_names = serializers.SerializerMethodField()

    def get_class_names(self, obj):
        return [{'id': c.id, 'name': c.name} for c in obj.class_rooms.all()]

    def validate_class_rooms(self, value):
        request = self.context.get('request')
        if request and any(c.teacher_id != request.user.id for c in value):
            raise serializers.ValidationError('Sinif tapılmadı.')
        return value

    class Meta:
        model = Test
        fields = [
            'id', 'title', 'description', 'topic', 'class_rooms', 'class_names',
            'is_published', 'randomize_questions', 'randomize_answers',
            'passing_score', 'question_count', 'total_points',
            'teacher_name', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class TestDetailSerializer(TestSerializer):
    questions = QuestionSerializer(many=True, read_only=True)

    class Meta(TestSerializer.Meta):
        fields = TestSerializer.Meta.fields + ['questions']


class TestVersionSerializer(serializers.ModelSerializer):
    class Meta:
        model = TestVersion
        fields = ['id', 'version_number', 'snapshot', 'created_at', 'created_by']


class BankAnswerSerializer(serializers.ModelSerializer):
    class Meta:
        model = BankAnswer
        fields = ['id', 'text', 'is_correct', 'order']
        read_only_fields = ['id']


class BankQuestionSerializer(serializers.ModelSerializer):
    answers = BankAnswerSerializer(many=True, required=False)

    def to_internal_value(self, data):
        import json as _json
        answers_raw = data.get('answers') if hasattr(data, 'get') else None
        if isinstance(answers_raw, str):
            try:
                parsed = _json.loads(answers_raw)
                # QueryDict-i plain dict-ə çeviririk ki, ListSerializer
                # html.parse_html_list() əvəzinə dict.get() işlətsin
                data = dict(data.items())
                data['answers'] = parsed
            except (ValueError, TypeError):
                pass
        return super().to_internal_value(data)

    class Meta:
        model = BankQuestion
        fields = [
            'id', 'question_type', 'text', 'image', 'math_formula',
            'model_answer', 'correct_answer', 'tolerance',
            'points', 'answers', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if instance.image:
            data['image'] = f'/media/{instance.image.name}'
        return data

    def create(self, validated_data):
        answers_data = validated_data.pop('answers', [])
        question = BankQuestion.objects.create(**validated_data)
        for answer_data in answers_data:
            BankAnswer.objects.create(question=question, **answer_data)
        return question

    def update(self, instance, validated_data):
        answers_data = validated_data.pop('answers', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if answers_data is not None:
            instance.answers.all().delete()
            for answer_data in answers_data:
                BankAnswer.objects.create(question=instance, **answer_data)
        return instance

from rest_framework import serializers

from .sanitize import clean_html
from .models import Test, Question, Answer, TestVersion, BankQuestion, BankAnswer


class AnswerSerializer(serializers.ModelSerializer):
    def validate_text(self, value):
        return clean_html(value)  # editor HTML: formatting kept, scripts/handlers removed

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
    def validate_text(self, value):
        return clean_html(value)  # editor HTML: formatting kept, scripts/handlers removed

    answers = AnswerSerializer(many=True, required=False)

    class Meta:
        model = Question
        fields = [
            'id', 'question_type', 'text', 'image', 'math_formula',
            'model_answer', 'correct_answer', 'tolerance',
            'points', 'order', 'hide_choices', 'answers', 'source_bank_question',
        ]
        read_only_fields = ['id', 'source_bank_question']

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
    total_points = serializers.FloatField(read_only=True)
    teacher_name = serializers.CharField(source='teacher.get_full_name', read_only=True)
    class_names = serializers.SerializerMethodField()

    # Why "back to draft" may be refused (annotated in the teacher queryset; see TestViewSet)
    has_results = serializers.BooleanField(read_only=True, default=False)
    open_exam_count = serializers.IntegerField(read_only=True, default=0)

    def get_class_names(self, obj):
        return [{'id': c.id, 'name': c.name} for c in obj.class_rooms.all()]

    def validate(self, attrs):
        max_score = attrs.get('max_score', getattr(self.instance, 'max_score', 100))
        passing = attrs.get('passing_score', getattr(self.instance, 'passing_score', 50))
        if max_score is not None and max_score <= 0:
            raise serializers.ValidationError({'max_score': 'Ümumi bal 0-dan böyük olmalıdır.'})
        if passing is not None and passing < 0:
            raise serializers.ValidationError({'passing_score': 'Keçid balı mənfi ola bilməz.'})
        per = attrs.get('wrong_per_correct', getattr(self.instance, 'wrong_per_correct', 4))
        if per is not None and not 2 <= per <= 10:
            raise serializers.ValidationError({'wrong_per_correct': '2 ilə 10 arasında olmalıdır.'})
        equal = attrs.get('equal_points', getattr(self.instance, 'equal_points', True))
        if equal and passing is not None and max_score and passing > max_score:
            raise serializers.ValidationError({'passing_score': f'Keçid balı ümumi baldan ({max_score:g}) çox ola bilməz.'})
        return attrs

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
            'passing_score', 'max_score', 'equal_points', 'negative_marking', 'wrong_per_correct',
            'question_count', 'total_points',
            'teacher_name', 'created_at', 'updated_at', 'has_results', 'open_exam_count',
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
    def validate_text(self, value):
        return clean_html(value)  # editor HTML: formatting kept, scripts/handlers removed

    class Meta:
        model = BankAnswer
        fields = ['id', 'text', 'is_correct', 'order']
        read_only_fields = ['id']


class BankFolderSerializer(serializers.ModelSerializer):
    question_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        from .models import BankFolder
        model = BankFolder
        fields = ['id', 'name', 'parent', 'question_count', 'created_at']
        read_only_fields = ['id', 'created_at']

    def validate_name(self, value):
        value = (value or '').strip()
        if not value:
            raise serializers.ValidationError('Qovluğun adı boş ola bilməz.')
        return value

    def validate(self, attrs):
        from .models import BankFolder
        teacher = self.context['request'].user
        parent = attrs.get('parent', getattr(self.instance, 'parent', None))
        name = attrs.get('name', getattr(self.instance, 'name', ''))
        if parent is not None:
            if parent.teacher_id != teacher.id:
                raise serializers.ValidationError({'parent': 'Qovluq tapılmadı.'})
            if self.instance is not None and parent.pk in self.instance.subtree_ids():
                raise serializers.ValidationError({'parent': 'Qovluğu öz içinə köçürmək olmaz.'})
        siblings = BankFolder.objects.filter(teacher=teacher, parent=parent, name__iexact=name)
        if self.instance is not None:
            siblings = siblings.exclude(pk=self.instance.pk)
        if siblings.exists():
            raise serializers.ValidationError({'name': 'Bu adda qovluq artıq var.'})
        return attrs


class BankQuestionSerializer(serializers.ModelSerializer):
    def validate_text(self, value):
        return clean_html(value)  # editor HTML: formatting kept, scripts/handlers removed

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
            'id', 'folder', 'question_type', 'text', 'image', 'math_formula',
            'model_answer', 'correct_answer', 'tolerance',
            'points', 'answers', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate_folder(self, folder):
        if folder is not None and folder.teacher_id != self.context['request'].user.id:
            raise serializers.ValidationError('Qovluq tapılmadı.')
        return folder

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

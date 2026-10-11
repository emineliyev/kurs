from django.db import models
from apps.accounts.models import User
from apps.classes.models import Class


class Test(models.Model):
    teacher = models.ForeignKey(User, on_delete=models.CASCADE, related_name='tests')
    class_rooms = models.ManyToManyField(Class, blank=True, related_name='tests')
    title = models.CharField(max_length=300)
    description = models.TextField(blank=True)
    is_published = models.BooleanField(default=False)
    randomize_questions = models.BooleanField(default=False)
    randomize_answers = models.BooleanField(default=False)
    topic = models.CharField(max_length=300, blank=True)
    passing_score = models.PositiveIntegerField(default=50)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.title

    @property
    def question_count(self):
        return self.questions.count()

    @property
    def total_points(self):
        return sum(q.points for q in self.questions.all())

    LOCKED_MESSAGE = 'Şagirdlər bu testə aid imtahana başladığı üçün suallar dəyişdirilə bilməz.'

    @property
    def is_locked(self):
        """Questions are frozen once any student has started an exam built on this test."""
        from apps.exams.models import ExamResult
        return ExamResult.objects.filter(exam__test=self).exists()


class Question(models.Model):
    TYPE_MCQ = 'mcq'
    TYPE_TRUE_FALSE = 'true_false'
    TYPE_OPEN = 'open'
    TYPE_IMAGE_MCQ = 'image_mcq'
    TYPE_MULTIPLE_CHOICE = 'multiple_choice'
    TYPE_SHORT_ANSWER = 'short_answer'
    TYPE_NUMERIC = 'numeric'
    TYPE_LONG_ANSWER = 'long_answer'
    TYPE_PASSAGE = 'passage'

    # Types that use selected_answer (MCQ-style)
    MCQ_TYPES = ('mcq', 'true_false', 'image_mcq', 'multiple_choice')
    # Types that require manual teacher grading
    MANUAL_GRADE_TYPES = ('open', 'long_answer')
    # Types that are auto-graded by text comparison
    AUTO_TEXT_TYPES = ('short_answer', 'numeric')
    # Types that are not graded at all
    NO_GRADE_TYPES = ('passage',)

    TYPE_CHOICES = [
        (TYPE_MCQ, 'Multiple Choice (legacy)'),
        (TYPE_TRUE_FALSE, 'True/False (legacy)'),
        (TYPE_OPEN, 'Open-ended (legacy)'),
        (TYPE_IMAGE_MCQ, 'Image-based MCQ'),
        (TYPE_MULTIPLE_CHOICE, 'Multiple Choice'),
        (TYPE_SHORT_ANSWER, 'Short Answer'),
        (TYPE_NUMERIC, 'Numeric'),
        (TYPE_LONG_ANSWER, 'Long Answer'),
        (TYPE_PASSAGE, 'Passage / Reading Text'),
    ]

    test = models.ForeignKey(Test, on_delete=models.CASCADE, related_name='questions')
    question_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default=TYPE_MULTIPLE_CHOICE)
    text = models.TextField(blank=True)
    image = models.ImageField(upload_to='questions/images/', blank=True, null=True)
    math_formula = models.TextField(blank=True, help_text='LaTeX formula')
    model_answer = models.TextField(blank=True, help_text='Teacher reference answer for open/long_answer questions')
    correct_answer = models.TextField(blank=True, help_text='Expected answer for short_answer/numeric auto-grading')
    tolerance = models.FloatField(null=True, blank=True, help_text='Acceptable deviation for numeric questions')
    points = models.PositiveSmallIntegerField(default=1)
    order = models.PositiveSmallIntegerField(default=0)
    hide_choices = models.BooleanField(default=False, help_text='Hide answer choices in PDF for image_mcq questions')

    class Meta:
        ordering = ['order']

    def __str__(self):
        return f'Q{self.order}: {self.text[:50]}'


class Answer(models.Model):
    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name='answers')
    text = models.CharField(max_length=500)
    is_correct = models.BooleanField(default=False)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ['order']

    def __str__(self):
        return f'{self.text[:50]} ({"correct" if self.is_correct else "wrong"})'


class BankQuestion(models.Model):
    TYPE_CHOICES = Question.TYPE_CHOICES

    teacher = models.ForeignKey(User, on_delete=models.CASCADE, related_name='bank_questions')
    question_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default='multiple_choice')
    text = models.TextField(blank=True)
    image = models.ImageField(upload_to='bank_questions/images/', blank=True, null=True)
    math_formula = models.TextField(blank=True)
    model_answer = models.TextField(blank=True)
    correct_answer = models.TextField(blank=True)
    tolerance = models.FloatField(null=True, blank=True)
    points = models.PositiveSmallIntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'[Bank] {self.text[:50]}'


class BankAnswer(models.Model):
    question = models.ForeignKey(BankQuestion, on_delete=models.CASCADE, related_name='answers')
    text = models.CharField(max_length=500)
    is_correct = models.BooleanField(default=False)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ['order']

    def __str__(self):
        return f'{self.text[:50]} ({"correct" if self.is_correct else "wrong"})'


class TestVersion(models.Model):
    test = models.ForeignKey(Test, on_delete=models.CASCADE, related_name='versions')
    version_number = models.PositiveSmallIntegerField()
    snapshot = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)

    class Meta:
        ordering = ['-version_number']
        unique_together = ['test', 'version_number']

    def __str__(self):
        return f'{self.test.title} v{self.version_number}'

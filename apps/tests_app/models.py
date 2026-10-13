from django.db import models
from apps.accounts.models import User
from apps.classes.models import Class


class Test(models.Model):
    teacher = models.ForeignKey(User, on_delete=models.CASCADE, related_name='tests', verbose_name='Müəllim')
    class_rooms = models.ManyToManyField(Class, blank=True, related_name='tests', verbose_name='Siniflər')
    title = models.CharField(max_length=300, verbose_name='Ad')
    description = models.TextField(blank=True, verbose_name='Təsvir')
    is_published = models.BooleanField(default=False, verbose_name='Hazır')
    randomize_questions = models.BooleanField(default=False, verbose_name='Sualları qarışdır')
    randomize_answers = models.BooleanField(default=False, verbose_name='Cavabları qarışdır')
    topic = models.CharField(max_length=300, blank=True, verbose_name='Mövzu')
    passing_score = models.PositiveIntegerField(default=50, verbose_name='Keçid balı (%)')
    # Set on the first publish; republishing does not use the monthly quota again.
    published_at = models.DateTimeField(null=True, blank=True, verbose_name='İlk dəfə hazır olub')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Yaradılıb')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='Yenilənib')

    class Meta:
        verbose_name = 'Test'
        verbose_name_plural = 'Testlər'
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

    def publish_errors(self):
        """Reasons the test can't be published yet (empty list = ready)."""
        questions = list(self.questions.prefetch_related('answers'))
        if not any(q.question_type not in Question.NO_GRADE_TYPES for q in questions):
            return ['Testdə ən azı bir sual olmalıdır.']
        errors = []
        for n, q in enumerate(questions, start=1):
            if q.question_type in Question.MCQ_TYPES:
                answers = list(q.answers.all())
                if len(answers) < 2:
                    errors.append(f'Sual {n}: ən azı 2 cavab variantı olmalıdır.')
                elif not any(a.is_correct for a in answers):
                    errors.append(f'Sual {n}: düzgün cavab işarələnməyib.')
            elif q.question_type == Question.TYPE_SHORT_ANSWER and not q.correct_answer.strip():
                errors.append(f'Sual {n}: düzgün cavab yazılmayıb.')
            elif q.question_type == Question.TYPE_NUMERIC:
                try:
                    float(q.correct_answer)  # same parsing as grading
                except ValueError:
                    errors.append(f'Sual {n}: düzgün cavab rəqəm olmalıdır.')
        return errors

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
        (TYPE_MCQ, 'Çoxseçimli (köhnə)'),
        (TYPE_TRUE_FALSE, 'Doğru/Yanlış (köhnə)'),
        (TYPE_OPEN, 'Açıq (köhnə)'),
        (TYPE_IMAGE_MCQ, 'Şəkilli'),
        (TYPE_MULTIPLE_CHOICE, 'Çoxseçimli'),
        (TYPE_SHORT_ANSWER, 'Qısa cavab'),
        (TYPE_NUMERIC, 'Rəqəm'),
        (TYPE_LONG_ANSWER, 'Uzun cavab'),
        (TYPE_PASSAGE, 'Mətn bloku'),
    ]

    test = models.ForeignKey(Test, on_delete=models.CASCADE, related_name='questions', verbose_name='Test')
    question_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default=TYPE_MULTIPLE_CHOICE, verbose_name='Sual tipi')
    text = models.TextField(blank=True, verbose_name='Mətn')
    image = models.ImageField(upload_to='questions/images/', blank=True, null=True, verbose_name='Şəkil')
    math_formula = models.TextField(blank=True, help_text='LaTeX formatında', verbose_name='Formul (LaTeX)')
    model_answer = models.TextField(blank=True, help_text='Açıq və uzun cavab sualları üçün müəllimin nümunə cavabı', verbose_name='Nümunə cavab')
    correct_answer = models.TextField(blank=True, help_text='Qısa cavab və rəqəm suallarının avtomatik yoxlanması üçün', verbose_name='Düzgün cavab')
    tolerance = models.FloatField(null=True, blank=True, help_text='Rəqəm sualları üçün icazə verilən fərq', verbose_name='Tolerans')
    points = models.PositiveSmallIntegerField(default=1, verbose_name='Bal')
    order = models.PositiveSmallIntegerField(default=0, verbose_name='Sıra')
    hide_choices = models.BooleanField(default=False, help_text='Şəkilli suallarda A–E artıq şəklin içindədirsə', verbose_name='Çapda variantları gizlət')

    class Meta:
        verbose_name = 'Sual'
        verbose_name_plural = 'Suallar'
        ordering = ['order']

    def __str__(self):
        return f'Q{self.order}: {self.text[:50]}'


class Answer(models.Model):
    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name='answers', verbose_name='Sual')
    text = models.CharField(max_length=500, verbose_name='Mətn')
    is_correct = models.BooleanField(default=False, verbose_name='Düzgün')
    order = models.PositiveSmallIntegerField(default=0, verbose_name='Sıra')

    class Meta:
        verbose_name = 'Cavab variantı'
        verbose_name_plural = 'Cavab variantları'
        ordering = ['order']

    def __str__(self):
        return f'{self.text[:50]} ({"correct" if self.is_correct else "wrong"})'


class BankQuestion(models.Model):
    TYPE_CHOICES = Question.TYPE_CHOICES

    teacher = models.ForeignKey(User, on_delete=models.CASCADE, related_name='bank_questions', verbose_name='Müəllim')
    question_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default='multiple_choice', verbose_name='Sual tipi')
    text = models.TextField(blank=True, verbose_name='Mətn')
    image = models.ImageField(upload_to='bank_questions/images/', blank=True, null=True, verbose_name='Şəkil')
    math_formula = models.TextField(blank=True, verbose_name='Formul (LaTeX)')
    model_answer = models.TextField(blank=True, verbose_name='Nümunə cavab')
    correct_answer = models.TextField(blank=True, verbose_name='Düzgün cavab')
    tolerance = models.FloatField(null=True, blank=True, verbose_name='Tolerans')
    points = models.PositiveSmallIntegerField(default=1, verbose_name='Bal')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Yaradılıb')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='Yenilənib')

    class Meta:
        verbose_name = 'Bank sualı'
        verbose_name_plural = 'Bank sualları'
        ordering = ['-created_at']

    def __str__(self):
        return f'[Bank] {self.text[:50]}'


class BankAnswer(models.Model):
    question = models.ForeignKey(BankQuestion, on_delete=models.CASCADE, related_name='answers', verbose_name='Sual')
    text = models.CharField(max_length=500, verbose_name='Mətn')
    is_correct = models.BooleanField(default=False, verbose_name='Düzgün')
    order = models.PositiveSmallIntegerField(default=0, verbose_name='Sıra')

    class Meta:
        verbose_name = 'Bank cavabı'
        verbose_name_plural = 'Bank cavabları'
        ordering = ['order']

    def __str__(self):
        return f'{self.text[:50]} ({"correct" if self.is_correct else "wrong"})'


class TestVersion(models.Model):
    test = models.ForeignKey(Test, on_delete=models.CASCADE, related_name='versions', verbose_name='Test')
    version_number = models.PositiveSmallIntegerField(verbose_name='Versiya')
    snapshot = models.JSONField(verbose_name='Məzmun')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Yaradılıb')
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, verbose_name='Yaradan')

    class Meta:
        verbose_name = 'Test versiyası'
        verbose_name_plural = 'Test versiyaları'
        ordering = ['-version_number']
        unique_together = ['test', 'version_number']

    def __str__(self):
        return f'{self.test.title} v{self.version_number}'

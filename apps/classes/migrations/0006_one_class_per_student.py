from django.conf import settings
from django.db import migrations, models


def keep_latest_class(apps, schema_editor):
    """A student in several classes keeps the most recently joined one; the others are closed
    (is_active=False — nothing is deleted, results are untouched)."""
    ClassEnrollment = apps.get_model('classes', 'ClassEnrollment')
    seen = set()
    close = []
    for e in ClassEnrollment.objects.filter(is_active=True).order_by('student_id', '-enrolled_at', '-pk'):
        if e.student_id in seen:
            close.append(e.pk)
        else:
            seen.add(e.student_id)
    ClassEnrollment.objects.filter(pk__in=close).update(is_active=False)


class Migration(migrations.Migration):

    dependencies = [
        ('classes', '0005_azerbaijani_names'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.RunPython(keep_latest_class, migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name='classenrollment',
            constraint=models.UniqueConstraint(condition=models.Q(('is_active', True)), fields=('student',), name='one_active_class_per_student'),
        ),
    ]

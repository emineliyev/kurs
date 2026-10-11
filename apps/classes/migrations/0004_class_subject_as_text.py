from django.db import migrations, models


def copy_subject_names(apps, schema_editor):
    Class = apps.get_model('classes', 'Class')
    for cls in Class.objects.exclude(subject__isnull=True).select_related('subject'):
        cls.subject_text = cls.subject.name_az or cls.subject.name
        cls.save(update_fields=['subject_text'])


class Migration(migrations.Migration):
    """Class.subject: FK to Subject → free text, keeping the existing names."""

    dependencies = [
        ('classes', '0003_alter_class_group'),
    ]

    operations = [
        migrations.AddField(
            model_name='class',
            name='subject_text',
            field=models.CharField(blank=True, default='', max_length=100),
            preserve_default=False,
        ),
        migrations.RunPython(copy_subject_names, migrations.RunPython.noop),
        migrations.RemoveField(model_name='class', name='subject'),
        migrations.RenameField(model_name='class', old_name='subject_text', new_name='subject'),
    ]

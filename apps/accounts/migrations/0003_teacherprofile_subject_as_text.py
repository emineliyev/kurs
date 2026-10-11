from django.db import migrations, models


def copy_subject_names(apps, schema_editor):
    TeacherProfile = apps.get_model('accounts', 'TeacherProfile')
    for profile in TeacherProfile.objects.exclude(subject__isnull=True).select_related('subject'):
        profile.subject_text = profile.subject.name_az or profile.subject.name
        profile.save(update_fields=['subject_text'])


class Migration(migrations.Migration):
    """TeacherProfile.subject: FK to Subject → free text, keeping the existing names."""

    dependencies = [
        ('accounts', '0002_initial'),
        ('classes', '0003_alter_class_group'),
    ]

    operations = [
        migrations.AddField(
            model_name='teacherprofile',
            name='subject_text',
            field=models.CharField(blank=True, default='', max_length=100),
            preserve_default=False,
        ),
        migrations.RunPython(copy_subject_names, migrations.RunPython.noop),
        migrations.RemoveField(model_name='teacherprofile', name='subject'),
        migrations.RenameField(model_name='teacherprofile', old_name='subject_text', new_name='subject'),
    ]

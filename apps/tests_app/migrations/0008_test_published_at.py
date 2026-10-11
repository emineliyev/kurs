from django.db import migrations, models
from django.db.models import F


def backfill_published_at(apps, schema_editor):
    Test = apps.get_model('tests_app', 'Test')
    Test.objects.filter(is_published=True).update(published_at=F('updated_at'))


class Migration(migrations.Migration):

    dependencies = [
        ('tests_app', '0007_add_hide_choices'),
    ]

    operations = [
        migrations.AddField(
            model_name='test',
            name='published_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.RunPython(backfill_published_at, migrations.RunPython.noop),
    ]

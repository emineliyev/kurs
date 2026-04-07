import os
from django.db.models.signals import pre_delete, pre_save
from django.dispatch import receiver
from .models import Question


@receiver(pre_delete, sender=Question)
def delete_question_image(sender, instance, **kwargs):
    if instance.image:
        if os.path.isfile(instance.image.path):
            os.remove(instance.image.path)


@receiver(pre_save, sender=Question)
def delete_old_question_image(sender, instance, **kwargs):
    if not instance.pk:
        return
    try:
        old = Question.objects.get(pk=instance.pk)
    except Question.DoesNotExist:
        return
    if old.image and old.image != instance.image:
        if os.path.isfile(old.image.path):
            os.remove(old.image.path)

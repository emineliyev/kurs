from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import User, TeacherProfile, StudentProfile


@receiver(post_save, sender=User)
def create_user_profile(sender, instance, created, **kwargs):
    if created:
        if instance.role == User.ROLE_TEACHER:
            TeacherProfile.objects.create(user=instance)
        elif instance.role == User.ROLE_STUDENT:
            StudentProfile.objects.create(user=instance)


from core.media_cleanup import track  # noqa: E402

track(TeacherProfile, 'avatar')
track(StudentProfile, 'avatar')

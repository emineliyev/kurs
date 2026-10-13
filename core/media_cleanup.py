"""
Delete uploaded files when their row is deleted or the file is replaced.

Files are removed only after the transaction commits, so a rolled-back delete never
loses an image, and only if no other tracked row still points at the same file.
Payment screenshots are intentionally not tracked — receipts are kept.
"""
from django.db import transaction
from django.db.models import Q
from django.db.models.signals import post_delete, pre_save

TRACKED = []  # (model, field_name)


def _still_used(name):
    for model, field in TRACKED:
        if model._default_manager.filter(**{field: name}).exists():
            return True
    return False


def _delete_later(storage, name):
    def run():
        if name and not _still_used(name) and storage.exists(name):
            storage.delete(name)
    transaction.on_commit(run)


def track(model, field):
    TRACKED.append((model, field))
    storage = model._meta.get_field(field).storage
    uid = f'media_cleanup:{model._meta.label}.{field}'

    def on_delete(sender, instance, **kwargs):
        f = getattr(instance, field)
        if f:
            _delete_later(storage, f.name)

    def on_replace(sender, instance, raw=False, **kwargs):
        if raw or not instance.pk:
            return
        old = sender._default_manager.filter(pk=instance.pk).values_list(field, flat=True).first()
        new = getattr(instance, field)
        if old and old != (new.name if new else None):
            _delete_later(storage, old)

    post_delete.connect(on_delete, sender=model, weak=False, dispatch_uid=f'{uid}:delete')
    pre_save.connect(on_replace, sender=model, weak=False, dispatch_uid=f'{uid}:replace')


def referenced_names():
    """Every file name currently stored in a tracked field."""
    names = set()
    for model, field in TRACKED:
        names.update(model._default_manager.exclude(Q(**{field: ''}) | Q(**{f'{field}__isnull': True}))
                     .values_list(field, flat=True))
    return names

"""
Find (and with --delete remove) uploaded images that no row points at any more.

Only the folders of tracked fields are scanned (question/bank images, avatars) —
payment screenshots are never touched. Files younger than --min-age-hours are skipped
so an upload that is still being saved is never removed.

    python manage.py cleanup_media              # report only
    python manage.py cleanup_media --delete     # remove the files listed
"""
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from core.media_cleanup import TRACKED, referenced_names


def _walk(storage, folder):
    try:
        dirs, files = storage.listdir(folder)
    except (FileNotFoundError, NotADirectoryError):
        return
    for f in files:
        yield f'{folder}/{f}'
    for d in dirs:
        yield from _walk(storage, f'{folder}/{d}')


class Command(BaseCommand):
    help = 'Report or delete question/bank/avatar images that are no longer referenced.'

    def add_arguments(self, parser):
        parser.add_argument('--delete', action='store_true', help='Delete the unused files (default: report only)')
        parser.add_argument('--min-age-hours', type=int, default=24, help='Skip files newer than this (default 24)')

    def handle(self, *args, delete=False, min_age_hours=24, **options):
        used = referenced_names()
        cutoff = timezone.now() - timedelta(hours=min_age_hours)
        folders = {}
        for model, field in TRACKED:
            f = model._meta.get_field(field)
            folders[str(f.upload_to).strip('/')] = f.storage

        orphans, total = [], 0
        for folder, storage in sorted(folders.items()):
            found = 0
            for name in _walk(storage, folder):
                if name in used:
                    continue
                if storage.get_modified_time(name) > cutoff:
                    continue
                size = storage.size(name)
                orphans.append((storage, name, size))
                total += size
                found += 1
            self.stdout.write(f'{folder}/: {found} istifadə olunmayan fayl')

        for _, name, size in orphans[:30]:
            self.stdout.write(f'  {name}  ({size / 1024:.0f} KB)')
        if len(orphans) > 30:
            self.stdout.write(f'  … və daha {len(orphans) - 30} fayl')
        self.stdout.write(f'Cəmi: {len(orphans)} fayl, {total / 1024 / 1024:.1f} MB')

        if not orphans:
            return
        if not delete:
            self.stdout.write(self.style.WARNING('Heç nə silinmədi. Silmək üçün: python manage.py cleanup_media --delete'))
            return
        for storage, name, _ in orphans:
            storage.delete(name)
        self.stdout.write(self.style.SUCCESS(f'{len(orphans)} fayl silindi ({total / 1024 / 1024:.1f} MB).'))

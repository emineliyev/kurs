from django.contrib.auth.hashers import PBKDF2PasswordHasher

STUDENT_HASHER = 'pbkdf2_sha256_student'


class StudentPBKDF2PasswordHasher(PBKDF2PasswordHasher):
    """
    Lighter PBKDF2 for student accounts. Their passwords are short teacher-issued codes, so the
    default 1.2M iterations add little protection but cost ~0.5 s of CPU per login — a whole class
    signing in at once queues every request behind the hashing. Teachers/admins keep the default.
    """
    algorithm = STUDENT_HASHER
    iterations = 60_000

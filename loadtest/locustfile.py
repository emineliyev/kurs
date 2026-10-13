"""
Load test: students taking exams while teachers build tests at the same time.

Needs the data from `python manage.py loadtest_data` on the server (same --teachers/--students).
Run from your own computer:

    pip install locust pillow
    locust -f loadtest/locustfile.py --host https://kursum.cloud
    # open http://localhost:8089, set users + spawn rate, Start

Each simulated student logs in, opens the exam, "answers" for a while like a real
student, submits once and leaves. Teachers keep working until the test is stopped.
Settings (environment variables): LT_TEACHERS=20 LT_STUDENTS=30 LT_ANSWER_SECONDS=60
"""
import io
import itertools
import os
import random
import threading

from locust import HttpUser, between, events, task
from locust.exception import StopUser

PASSWORD = 'Loadtest-2026!'
TEACHERS = int(os.environ.get('LT_TEACHERS', 20))
STUDENTS = int(os.environ.get('LT_STUDENTS', 30))
ANSWER_SECONDS = int(os.environ.get('LT_ANSWER_SECONDS', 60))  # how long a student "thinks" in total

_lock = threading.Lock()
_student_ids = itertools.product(range(1, TEACHERS + 1), range(1, STUDENTS + 1))
_teacher_ids = itertools.cycle(range(1, TEACHERS + 1))


def _image_bytes():
    """A real ~100 KB JPEG (the API validates images), like a cropped question photo."""
    from PIL import Image
    img = Image.effect_noise((900, 600), 60).convert('RGB')
    buf = io.BytesIO()
    img.save(buf, 'JPEG', quality=80)
    return buf.getvalue()


IMAGE = None


@events.test_start.add_listener
def _prepare(**kwargs):
    global IMAGE
    IMAGE = _image_bytes()


class _ApiUser(HttpUser):
    abstract = True

    def login(self, username):
        r = self.client.post('/api/auth/login/', json={'username': username, 'password': PASSWORD},
                             name='login')
        if r.status_code != 200:
            raise StopUser()
        self.headers = {'Authorization': f'Bearer {r.json()["access"]}'}

    def get(self, url, name=None):
        return self.client.get(url, headers=self.headers, name=name or url)

    def post(self, url, name=None, **kw):
        return self.client.post(url, headers=self.headers, name=name or url, **kw)


class Student(_ApiUser):
    weight = 10
    wait_time = between(1, 3)

    def on_start(self):
        with _lock:
            try:
                t, s = next(_student_ids)
            except StopIteration:  # more simulated students than accounts
                raise StopUser()
        self.login(f'loadtest_s{t}_{s}')

    @task
    def take_exam(self):
        self.get('/api/auth/profile/')
        exams = self.get('/api/exams/').json()
        exams = exams.get('results', exams) if isinstance(exams, dict) else exams
        if not exams:
            raise StopUser()
        exam = exams[0]
        eid = exam['id']
        self.get(f'/api/exams/{eid}/', name='/api/exams/[id]/')
        r = self.post(f'/api/exams/{eid}/start/', name='/api/exams/[id]/start/')
        if r.status_code not in (200, 201):
            raise StopUser()  # already finished — run `loadtest_data --reset-results`
        questions = self.get(f'/api/tests/{exam["test"]}/questions/', name='/api/tests/[id]/questions/ (şagird)').json()

        # Answer like a person: spread the thinking time over the questions
        answers = []
        pause = ANSWER_SECONDS / max(len(questions), 1)
        for q in questions:
            self._sleep(random.uniform(pause * 0.5, pause * 1.5))
            choice = random.choice(q['answers']) if q.get('answers') else None
            answers.append({'question': q['id'], 'selected_answer': choice['id'] if choice else None})
            if random.random() < 0.02:
                self.client.patch(f'/api/exams/{eid}/tab_switch/', headers=self.headers,
                                  name='/api/exams/[id]/tab_switch/')

        self.post(f'/api/exams/{eid}/submit/', name='/api/exams/[id]/submit/', json={'answers': answers})
        self.get(f'/api/exams/{eid}/my_result/', name='/api/exams/[id]/my_result/')
        raise StopUser()  # each student takes the exam once

    def _sleep(self, seconds):
        import gevent
        gevent.sleep(seconds)


class Teacher(_ApiUser):
    weight = 1
    wait_time = between(3, 8)

    def on_start(self):
        with _lock:
            t = next(_teacher_ids)
        self.login(f'loadtest_t{t}')

    @task(3)
    def dashboard(self):
        self.get('/api/analytics/dashboard/')
        self.get('/api/exams/needs_grading_count/')

    @task(2)
    def watch_results(self):
        exams = self.get('/api/exams/').json()
        exams = exams.get('results', exams) if isinstance(exams, dict) else exams
        if exams:
            self.get(f'/api/exams/{exams[0]["id"]}/results/', name='/api/exams/[id]/results/')

    @task(2)
    def browse(self):
        self.get('/api/tests/')
        self.get('/api/tests/bank-questions/')
        self.get('/api/auth/students/')

    @task(1)
    def build_test(self):
        """Create a draft test and add questions, some with an image upload."""
        r = self.post('/api/tests/', json={'title': 'Yük qaralama', 'passing_score': 50})
        if r.status_code != 201:
            return
        test_id = r.json()['id']
        for i in range(5):
            r = self.post('/api/tests/questions/', json={
                'test': test_id, 'question_type': 'multiple_choice', 'text': f'<p>Sual {i + 1}</p>',
                'points': 1, 'order': i,
                'answers': [{'text': str(n), 'is_correct': n == 0, 'order': n} for n in range(4)],
            })
            if r.status_code == 201 and i % 2 == 0:
                self.client.patch(f'/api/tests/questions/{r.json()["id"]}/', headers=self.headers,
                                  name='/api/tests/questions/[id]/ (şəkil)',
                                  files={'image': ('q.jpg', IMAGE, 'image/jpeg')})

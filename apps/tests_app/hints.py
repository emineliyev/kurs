"""
The "write your answer like this" hint students see under a short-answer box.

The teacher can type one (answer_format). If they didn't and the key is a matching answer such as
"1B2E3D" or "1-b, 2-e, 3-d", a sample is made from its shape — same numbers and separators, the
letters replaced by A, B, C… — so students know the format without being shown the answer.
"""
import re

LETTERS = 'ABCDEFGH'
_PAIR = re.compile(r'(\d+)(\s*[-–.:)]?\s*)([A-Za-z])')
# the whole key is number+letter pairs, optionally separated by spaces / commas / semicolons
_MATCHING = re.compile(r'^\s*(\d+\s*[-–.:)]?\s*[A-Za-z]\s*[,;]?\s*){2,}$')


def _sample(key, shift):
    i = -1

    def swap(m):
        nonlocal i
        i += 1
        letter = LETTERS[(i + shift) % len(LETTERS)]
        return m.group(1) + m.group(2) + (letter if m.group(3).isupper() else letter.lower())
    return _PAIR.sub(swap, key)


def _same(a, b):
    return re.sub(r'\s+', '', a).lower() == re.sub(r'\s+', '', b).lower()


def auto_hint(key):
    key = (key or '').strip()
    if not _MATCHING.match(key):
        return ''
    for shift in range(len(LETTERS)):          # never hand out the key itself
        sample = _sample(key, shift)
        if not _same(sample, key):
            return sample
    return ''


def answer_hint(question):
    return (question.answer_format or '').strip() or auto_hint(question.correct_answer)

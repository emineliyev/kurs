"""
Finds the questions on PDF pages from their text layout (Pro, and the free trial).

The browser opens the PDF (pdf.js) and sends only the words with their place on the rendered
page — never the file itself. This module groups the words into columns and lines, finds the
numbered question starts ("1.", "2)", "№3" at the left edge, numbered one after another),
reads an answer key ("1-C 2-A", "1. C" lists, or a row of numbers over a row of letters) and
returns one box per question in the same pixel coordinates, plus its key letter when found.

Pages without a text layer (scans) are reported so the teacher cuts them by hand.
"""
import re

MAX_PAGES = 80
MAX_WORDS = 40000

NUM_START = re.compile(r'^\s*(?:№\s*(\d{1,3})|(\d{1,3})\s*[.)](?!\d))')
_CYR = str.maketrans({'А': 'A', 'В': 'B', 'С': 'C', 'Е': 'E', 'а': 'A', 'в': 'B', 'с': 'C', 'е': 'E'})
KEY_PAIR = re.compile(r'(\d{1,3})\s*[-–—.):]?\s*([A-E])(?![^\W\d_])')
KEY_LINE = re.compile(r'(?:\s*\d{1,3}\s*[-–—.):]?\s*[A-E]\s*[,;|]?)+\s*')
KEY_TITLE = re.compile(r'^\s*(cavab(lar)?|cavab\s+aç(a|ə)r[ıi]|açar|düzgün\s+cavablar)\b', re.I)
NUMS_ROW = re.compile(r'(?:\s*\d{1,3}\s*[|]?)+')
LETTERS_ROW = re.compile(r'(?:\s*[A-E]\s*[|]?)+')
HAS_E = re.compile(r'(?:^|\s)E\s*[).]')
HAS_D = re.compile(r'(?:^|\s)D\s*[).]')


class Line:
    __slots__ = ('x0', 'x1', 'top', 'bottom', 'text', 'h')

    def __init__(self, words):
        words.sort(key=lambda w: w[1])
        self.x0 = min(w[1] for w in words)
        self.x1 = max(w[1] + w[3] for w in words)
        self.top = min(w[2] for w in words)
        self.bottom = max(w[2] + w[4] for w in words)
        self.h = max(w[4] for w in words)
        parts, end = [], None
        for s, x, _, w, h in words:
            if end is not None and x - end > 0.2 * h:
                parts.append(' ')
            parts.append(s)
            end = x + w
        self.text = ''.join(parts).strip()


def _clean_words(raw):
    words = []
    for item in raw or []:
        try:
            s, x, y, w, h = str(item[0])[:200], float(item[1]), float(item[2]), float(item[3]), float(item[4])
        except (TypeError, ValueError, IndexError):
            continue
        if s.strip() and w >= 0 and h > 0:
            words.append((s.strip(), x, y, w, h))
    return words


def _split_columns(words, width):
    """
    [(x_from, x_to, words)]: two columns when a vertical line through the middle crosses
    (almost) no words — a centred title or the page number may cross it, real lines of a
    one-column page cross it everywhere.
    """
    bins = 200
    cover = [0] * bins
    for _, x, _, w, _ in words:
        a = max(0, int(x / width * bins) + 1)
        b = min(bins - 1, int((x + w) / width * bins) - 1)
        for i in range(a, b + 1):
            cover[i] += 1
    lo, hi = int(bins * 0.3), int(bins * 0.7)
    least = min(cover[lo:hi + 1])
    if least > max(2, 0.05 * len(words)):
        return [(0, width, words)]
    best, run, start = (0, 0), 0, 0
    for i in range(lo, hi + 1):
        if cover[i] == least:
            if run == 0:
                start = i
            run += 1
            if run > best[0]:
                best = (run, start)
        else:
            run = 0
    if best[0] >= 2:
        split = (best[1] + best[0] / 2) / bins * width
        left = [w for w in words if w[1] + w[3] / 2 < split]
        right = [w for w in words if w[1] + w[3] / 2 >= split]
        if len(left) >= 0.15 * len(words) and len(right) >= 0.15 * len(words):
            return [(0, split, left), (split, width, right)]
    return [(0, width, words)]


def _lines(words):
    out, cur, centre, height = [], [], None, 0
    for w in sorted(words, key=lambda w: w[2] + w[4] / 2):
        c = w[2] + w[4] / 2
        if cur and abs(c - centre) <= 0.5 * max(height, w[4]):
            cur.append(w)
            height = max(height, w[4])
        else:
            if cur:
                out.append(Line(cur))
            cur, centre, height = [w], c, w[4]
    if cur:
        out.append(Line(cur))
    return out


def _parse_key(lines):
    """{number: letter} from key-looking lines, and the indexes of those lines."""
    key, used = {}, set()
    for i, ln in enumerate(lines):
        text = ln.text.translate(_CYR)
        if KEY_LINE.fullmatch(text) and KEY_PAIR.search(text):
            for n, letter in KEY_PAIR.findall(text):
                key.setdefault(int(n), letter)
            used.add(i)
        elif NUMS_ROW.fullmatch(text) and i + 1 < len(lines):
            nums = re.findall(r'\d{1,3}', text)
            nxt = lines[i + 1].text.translate(_CYR)
            if len(nums) >= 3 and LETTERS_ROW.fullmatch(nxt):
                letters = re.findall(r'[A-E]', nxt)
                if len(letters) == len(nums):
                    for n, letter in zip(nums, letters):
                        key.setdefault(int(n), letter)
                    used.update((i, i + 1))
    return key, used


def detect(pages):
    """
    pages: [{"index", "doc", "w", "h", "words": [[text, x, top, width, height], ...]}]
    → {"boxes": [{page, x, y, w, h, n, answer, continues}], "choice_count", "no_text", "key_found"}
    """
    cols = []          # every column of every page, in reading order
    no_text = []
    for pg in pages[:MAX_PAGES]:
        try:
            W, H = float(pg.get('w') or 0), float(pg.get('h') or 0)
        except (TypeError, ValueError):
            W = H = 0
        words = _clean_words(pg.get('words'))
        if W <= 0 or H <= 0 or len(words) < 3:
            no_text.append(pg.get('index'))
            continue
        # page number / footer line: short text in the bottom strip, anywhere across the page
        footer = min((ln.top for ln in _lines(words) if ln.top > 0.92 * H and len(ln.text) <= 25), default=None)
        for x_from, x_to, cw in _split_columns(words, W):
            lines = _lines(cw)
            if not lines:
                continue
            key, key_lines = _parse_key(lines)
            title = next((i for i, ln in enumerate(lines) if KEY_TITLE.match(ln.text)), None)
            stop = min([lines[i].top for i in key_lines] + ([lines[title].top] if title is not None else []),
                       default=None)
            starts = sorted(ln.x0 for ln in lines)
            cols.append({
                'page': pg.get('index'), 'doc': pg.get('doc'), 'W': W, 'H': H, 'lines': lines,
                'x_from': x_from, 'x_to': x_to, 'key': key, 'key_lines': key_lines,
                'stop': stop, 'footer': footer,
                'text_x0': min(ln.x0 for ln in lines), 'text_x1': max(ln.x1 for ln in lines),
                # the left edge most lines start at (a centred title's half may start further left)
                'edge': starts[len(starts) // 4],
            })

    # question-start candidates, in reading order
    cands = []
    for ci, col in enumerate(cols):
        margin = col['edge'] + 0.06 * (col['text_x1'] - col['text_x0'])
        for li, ln in enumerate(col['lines']):
            if li in col['key_lines'] or (col['stop'] is not None and ln.top >= col['stop']):
                continue
            m = NUM_START.match(ln.text)
            if m and ln.x0 <= margin:
                cands.append((ci, li, int(m.group(1) or m.group(2))))

    # the longest run numbered one after another (a new section may start again from 1)
    best_len = [1] * len(cands)
    prev = [-1] * len(cands)
    for j, (cj, _, nj) in enumerate(cands):
        for i in range(j):
            ni = cands[i][2]
            if (nj == ni + 1 or (nj == 1 and ni >= 5)) and best_len[i] + 1 > best_len[j]:
                best_len[j], prev[j] = best_len[i] + 1, i
    chain = []
    if cands:
        j = max(range(len(cands)), key=lambda k: best_len[k])
        while j != -1:
            chain.append(cands[j])
            j = prev[j]
        chain.reverse()
    if len(chain) < 2:
        chain = []

    # answer keys per document, split into sections where the numbering starts again
    keys_by_doc = {}
    for col in cols:
        if col['key']:
            sections = keys_by_doc.setdefault(col['doc'], [{}])
            for n in sorted(col['key']):
                if n in sections[-1]:
                    sections.append({})
                sections[-1][n] = col['key'][n]

    boxes, section, last_n, choice5, choice4 = [], 0, None, False, False
    for k, (ci, li, n) in enumerate(chain):
        if last_n is not None and n == 1 and last_n >= 5:
            section += 1
        last_n = n
        col = cols[ci]
        ln = col['lines'][li]
        nxt = chain[k + 1] if k + 1 < len(chain) else None
        same_col_next = nxt is not None and nxt[0] == ci
        if same_col_next:
            nl = col['lines'][nxt[1]]
            bottom = nl.top - 0.4 * nl.h       # where the next question's box starts
        else:
            limits = [col['H'] * 0.985] + [v for v in (col['footer'], col['stop']) if v is not None and v > ln.top]
            bottom = min(limits)
        # does the question carry on in the next column / page (text before that column's first start)?
        continues = False
        if nxt is not None and not same_col_next and nxt[0] == ci + 1:
            ncol = cols[nxt[0]]
            first_top = ncol['lines'][nxt[1]].top
            # body text above it, starting at the column's edge (a centred page title doesn't count)
            near = ncol['edge'] + 0.06 * (ncol['text_x1'] - ncol['text_x0'])
            continues = any(l2.top < first_top and l2.x0 <= near and len(l2.text) > 25 for l2 in ncol['lines'])
        pad = 0.4 * ln.h
        # one column: the text's own width; two columns: the whole column (figures may stick out)
        alone = sum(1 for c in cols if c['page'] == col['page']) == 1
        x0 = max(0, (col['text_x0'] if alone else col['x_from']) - pad)
        x1 = min(col['W'], (col['text_x1'] if alone else col['x_to']) + pad)
        y0 = max(0, ln.top - pad)
        y1 = min(col['H'], bottom)
        if y1 - y0 < ln.h:
            continue
        region = [l2.text.translate(_CYR) for l2 in col['lines'] if y0 <= l2.top < y1]
        choice5 = choice5 or any(HAS_E.search(t) for t in region)
        choice4 = choice4 or any(HAS_D.search(t) for t in region)
        sections = keys_by_doc.get(col['doc']) or []
        answer = sections[section].get(n) if section < len(sections) else None
        boxes.append({'page': col['page'], 'x': round(x0), 'y': round(y0), 'w': round(x1) - round(x0), 'h': round(y1) - round(y0),
                      'n': n, 'answer': answer, 'continues': continues})

    return {
        'boxes': boxes,
        'choice_count': 5 if choice5 else 4 if choice4 else None,
        'no_text': [i for i in no_text if i is not None],
        'key_found': sum(1 for b in boxes if b['answer']),
    }


AUTO_CROP_PLAN_MESSAGE = 'Sualları avtomatik tapmaq Pro planındadır.'


def can_auto_crop(user):
    """Pro (a gifted Pro too) and the free trial, while it runs."""
    from apps.subscriptions.models import Subscription
    sub = Subscription.objects.filter(teacher=user).select_related('plan').first()
    return bool(sub and sub.is_active and (sub.plan.tier >= 2 or sub.status == Subscription.STATUS_TRIAL))

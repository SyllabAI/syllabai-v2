#!/usr/bin/env python3
"""UIUX-TIER-B bundle patch: T2 re-transcription (flattened fractions/tables/formula
boxes from QP-of-record renders) + T3 NNq degree debris. Fail-closed: every rule must
hit exactly once or the run aborts. Modes: full | splice | tokens."""
import json, re, sys

B = '/home/z/my-project/ws/syllabai-v2/apps/hub/content/igcse-maths-b-16/questions.json'
APPLY = '--apply' in sys.argv

d = json.load(open(B, encoding='utf-8'))

def part(slug, qi, pi):
    return d[[i for i, s in enumerate(d) if s['slug'] == slug][0]]['questions'][qi - 1]['parts'][pi]

RULES = []

# ---------- T2 full replacements ----------
RULES.append(('full', '2018-06-4mb1-01r--exam-questions', 18, 0,
    "$\\overrightarrow{OA} = \\binom{4}{-2}$ and $\\overrightarrow{OB} = \\binom{-2}{6}$\n\nFind $\\overrightarrow{AB}$ as a column vector."))
RULES.append(('full', '2018-06-4mb1-01r--exam-questions', 18, 1,
    "$\\overrightarrow{OA} = \\binom{4}{-2}$ and $\\overrightarrow{OB} = \\binom{-2}{6}$\n\nCalculate the modulus of $\\overrightarrow{AB}$."))
RULES.append(('full', '2018-06-4mb1-01r--exam-questions', 19, 0,
    "Write $(3x+2) \\div \\left(\\dfrac{3x^2-7x-6}{5}\\right) - \\dfrac{5}{x+3}$ as a single fraction in its simplest form.\n\nShow clear algebraic working."))
RULES.append(('full', '2018-06-4mb1-01r--exam-questions', 26, 0,
    "$A = \\begin{pmatrix} 4 & 3 \\\\ -2 & 1 \\end{pmatrix} \\quad B = \\begin{pmatrix} 2 & -3 \\\\ 1 & 4 \\end{pmatrix} \\quad C = \\begin{pmatrix} 5 & 2 \\end{pmatrix}$\n\nFind $3\\mathbf{A} + 2\\mathbf{B}$"))
RULES.append(('full', '2018-06-4mb1-01r--exam-questions', 26, 1,
    "$A = \\begin{pmatrix} 4 & 3 \\\\ -2 & 1 \\end{pmatrix} \\quad B = \\begin{pmatrix} 2 & -3 \\\\ 1 & 4 \\end{pmatrix} \\quad C = \\begin{pmatrix} 5 & 2 \\end{pmatrix}$\n\nFind $\\mathbf{AB}$"))
RULES.append(('full', '2018-06-4mb1-01r--exam-questions', 26, 2,
    "$A = \\begin{pmatrix} 4 & 3 \\\\ -2 & 1 \\end{pmatrix} \\quad B = \\begin{pmatrix} 2 & -3 \\\\ 1 & 4 \\end{pmatrix} \\quad C = \\begin{pmatrix} 5 & 2 \\end{pmatrix}$\n\nFind $\\mathbf{CB}$"))
RULES.append(('full', '2018-06-4mb1-02--exam-questions', 3, 0,
    "$A = \\begin{pmatrix} a & 3 \\\\ 4 & -1 \\end{pmatrix} \\quad B = \\begin{pmatrix} 13 & 3 \\\\ 4 & 10 \\end{pmatrix}$\n\nGiven that $A^2 - B = \\lambda I$ where $\\lambda$ is an integer and $I = \\begin{pmatrix} 1 & 0 \\\\ 0 & 1 \\end{pmatrix}$\n\nfind the value of $a$ and the value of $\\lambda$"))
RULES.append(('full', '2018-06-4mb1-02--exam-questions', 5, 4,
    "$f$ and $g$ are two functions such that\n\n$f : x \\mapsto 3 + 5x$ where $x < 0$\n\n$g : x \\mapsto \\dfrac{5 - 4x}{3x - 2}$\n\nExpress the inverse function $g^{-1}$ in the form $g^{-1} : x \\mapsto \\ldots$\n\n$\\left[\\text{Solutions of } ax^2 + bx + c = 0 \\text{ are } x = \\dfrac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}\\right]$"))
RULES.append(('full', '2018-06-4mb1-02r--exam-questions', 4, 3,
    "The functions $f$ and $g$ are defined as\n\n$f : x \\mapsto 3x + 4$\n\n$g : x \\mapsto \\dfrac{5}{x - 3}$\n\nThe function $h$ is defined as $h : x \\mapsto x^2 - 6x - 8$ where $x \\ge 3$\n\nExpress the inverse function $h^{-1}$ in the form $h^{-1} : x \\mapsto \\ldots$\n\n$\\left[\\text{The solutions of } ax^2 + bx + c = 0 \\text{ where } a \\ne 0 \\text{ are given by } x = \\dfrac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}\\right]$"))
RULES.append(('full', '2019-06-4mb1-01--exam-questions', 26, 0,
    "$A = \\begin{pmatrix} 2 & 3 \\\\ -5 & 1 \\end{pmatrix} \\quad B = \\begin{pmatrix} 4 & k \\\\ 1 & -1 \\end{pmatrix}$\n\nThe determinant of the matrix $A^2 - AB$ is equal to $3k + 28$\n\nFind the value of $k$.\n\n$k = .......................................................$"))
RULES.append(('full', '2019-06-4mb1-01r--exam-questions', 14, 0,
    "$A = \\begin{pmatrix} 4 & 3 \\\\ 2 & -1 \\end{pmatrix} \\quad B = \\begin{pmatrix} 4 & x \\\\ 2y & 7 \\end{pmatrix}$\n\nGiven that $5A + nB = \\begin{pmatrix} 8 & 27 \\\\ 1 & -26 \\end{pmatrix}$ where $n$ is an integer,\n\nfind the value of $n$, the value of $x$ and the value of $y$.\n\n$n = ......................................................$\n\n$x = ......................................................$\n\n$y = ......................................................$"))

VEC_HEAD = ("$\\mathbf{p} = \\binom{2x-1}{y} \\quad \\mathbf{q} = \\binom{y+3}{-y}$\n\n"
            "The vectors $\\mathbf{p}$ and $\\mathbf{q}$ are such that $|\\mathbf{p}| = \\sqrt{98}$ and $\\mathbf{p} + \\mathbf{q} = \\binom{7}{0}$")
RULES.append(('full', '2019-06-4mb1-02--exam-questions', 9, 0, VEC_HEAD + "\n\nShow that $x^2 - 3x - 9 = 0$\n\nGiven that $x > 0$"))
RULES.append(('full', '2019-06-4mb1-02--exam-questions', 9, 1, VEC_HEAD + "\n\nfind the exact value of $x$,"))
RULES.append(('full', '2019-06-4mb1-02--exam-questions', 9, 2, VEC_HEAD + "\n\nshow that $y = 2 - 3\\sqrt{5}$"))
RULES.append(('full', '2019-06-4mb1-02--exam-questions', 9, 3, VEC_HEAD + "\n\nFind the exact value of $|\\mathbf{q}|^2$\n\nShow your working clearly.\n\n$\\left[\\text{Solutions of } ax^2 + bx + c = 0 \\text{ are } x = \\dfrac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}\\right]$"))

# ---------- T2 splice / token replacements (slug, qi, pi, old, new) exact-substring rules ----------
SPLICE = [
    # 2018-06-01 q4 translation vector
    ('2018-06-4mb1-01--exam-questions', 4, 0,
     '⎠⎟\n\n⎝⎜\n\n−\n\n5', '$\\binom{2}{-5}$'),
    # 2018-06-01 q7 fraction calc
    ('2018-06-4mb1-01--exam-questions', 7, 0,
     '2 1\n\n7\n\n1\n\n⎛\n\n⎞\n\n−\n\n×\n\n⎝⎜\n\n⎠⎟\n\n4\n\n8\n\n3',
     '$\\frac{7}{8}\\left(\\frac{1}{3} \\times 2\\frac{4}{5}\\right)$'),
    # 2018-06-01 q10 determinant
    ('2018-06-4mb1-01--exam-questions', 10, 0,
     'The determinant of the matrix 2\n\n1\n\n⎛\n\n⎞\n\n⎠⎟ is equal to 9\n\n⎝⎜\n\nx\n\n5\n\n4',
     'The determinant of the matrix $\\begin{pmatrix} 2x & 1 \\\\ 3x & 4 \\end{pmatrix}$ is equal to 9'),
    # 2018-06-01 q14 a = binom + |a|
    ('2018-06-4mb1-01--exam-questions', 14, 0,
     'x\n\n2\n\n1\n\n−\n\n⎛\n\n⎞\n\na =\n\n⎠⎟\n\n⎝⎜\n\n3\n\n−\n\nGiven that a = 5',
     '$\\mathbf{a} = \\binom{2x-1}{-3}$\n\nGiven that $|\\mathbf{a}| = 5$'),
    # 2018-06-02 q2 volume box + p√q
    ('2018-06-4mb1-02--exam-questions', 2, 0,
     '1\n\n⎡\n\n⎤\n\nVolume of pyramid =\n\nbase area\n\nheight\n\n3 ×\n\n×\n\n⎣⎢\n\n⎦⎥',
     '$\\left[\\text{Volume of pyramid} = \\tfrac{1}{3} \\times \\text{base area} \\times \\text{height}\\right]$'),
    ('2018-06-4mb1-02--exam-questions', 2, 0,
     'Give your answer in the form p q cm³ where p and q are integers.',
     'Give your answer in the form $p\\sqrt{q}$ cm³ where $p$ and $q$ are integers.'),
    # 2018-06-02 q7 translation + M + inverse box + M^-1
    ('2018-06-4mb1-02--exam-questions', 7, 1,
     '1\n\n⎛\n\n⎞\n\nTriangle B is transformed to triangle C under the translation\n\n⎝⎜\n\n⎠⎟\n\n3\n\n−',
     'Triangle B is transformed to triangle C under the translation $\\binom{1}{-3}$'),
    ('2018-06-4mb1-02--exam-questions', 7, 2,
     '2\n\n0\n\nM = −\n\n⎛\n\n⎞\n\n⎝⎜\n\n⎠⎟\n\n0\n\n2\n\n−',
     'Triangle C is transformed to triangle D under the transformation with matrix $\\mathbf{M}$ where\n\n$\\mathbf{M} = \\begin{pmatrix} -2 & 0 \\\\ 0 & -2 \\end{pmatrix}$'),
    ('2018-06-4mb1-02--exam-questions', 7, 5,
     'a\n\nb\n\nd\n\nb\n\n⎡\n\n−\n\n⎤\n\n1\n\n⎛\n\n⎞\n\n⎛\n\n⎞\n\nThe inverse of matrix\n\nis\n\n⎥\n\n⎢\n\n⎝⎜\n\n⎠⎟\n\n⎝⎜\n\n⎠⎟\n\nc\n\nd\n\nc\n\na\n\nad\n\nbc\n\n−\n\n−\n\n⎦\n\n⎣',
     '$\\left[\\text{The inverse of matrix } \\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix} \\text{ is } \\tfrac{1}{ad-bc}\\begin{pmatrix} d & -b \\\\ -c & a \\end{pmatrix}\\right]$'),
    ('2018-06-4mb1-02--exam-questions', 7, 5,
     'Describe fully the single transformation represented by the matrix M–1',
     'Describe fully the single transformation represented by the matrix $\\mathbf{M}^{-1}$'),
    # 2018-06-02 q9 trapezium box
    ('2018-06-4mb1-02--exam-questions', 9, 4,
     'Area of trapezium = 1\n\n⎡\n\n⎤\n\n2 (\n\na\n\nb h\n\n)\n\n+\n\n⎣⎢\n\n⎦⎥',
     '$\\left[\\text{Area of trapezium} = \\tfrac{1}{2}(a+b)h\\right]$'),
    # 2018-06-02R q3 cylinder box
    ('2018-06-4mb1-02r--exam-questions', 3, 1,
     '3\n\n⎛\n\n⎞\n\n=\n\n1 m\n\n1000 litres\n\n⎜\n\n⎟\n\n2\n\n$\\pi$r h\n\n⎝\n\n⎠\n\nVolume of cylinder =',
     '$\\left[1\\text{ m}^3 = 1000 \\text{ litres} \\quad \\text{Volume of cylinder} = \\pi r^2 h\\right]$'),
    # 2018-06-02R q8 P and Q matrices (p0 two blocks, p1 P block, p2 P block)
    ('2018-06-4mb1-02r--exam-questions', 8, 0,
     '−\n\n2\n\n1\n\n⎛\n\n⎞\n\n⎜\n\n⎟\n\nP =\n\n3\n\n1\n\n⎜⎜\n\n⎟⎟\n\n−\n\n⎝\n\n⎠\n\n2\n\n2',
     '$\\mathbf{P} = \\begin{pmatrix} 2 & -1 \\\\ \\tfrac{3}{2} & \\tfrac{1}{2} \\end{pmatrix}$'),
    ('2018-06-4mb1-02r--exam-questions', 8, 0,
     '−\n\n3\n\n4\n\n⎛\n\n⎞\n\nQ =\n\n⎜\n\n⎟\n\n−\n\n⎝\n\n⎠\n\n1\n\n2',
     '$\\mathbf{Q} = \\begin{pmatrix} 3 & -4 \\\\ 1 & -2 \\end{pmatrix}$'),
    ('2018-06-4mb1-02r--exam-questions', 8, 1,
     '−\n\n2\n\n1\n\n⎛\n\n⎞\n\n⎜\n\n⎟\n\nP =\n\n3\n\n1\n\n⎜⎜\n\n⎟⎟\n\n−\n\n⎝\n\n⎠\n\n2\n\n2',
     '$\\mathbf{P} = \\begin{pmatrix} 2 & -1 \\\\ \\tfrac{3}{2} & \\tfrac{1}{2} \\end{pmatrix}$'),
    ('2018-06-4mb1-02r--exam-questions', 8, 2,
     '−\n\n2\n\n1\n\n⎛\n\n⎞\n\n⎜\n\n⎟\n\nP =\n\n3\n\n1\n\n⎜⎜\n\n⎟⎟\n\n−\n\n⎝\n\n⎠\n\n2\n\n2',
     '$\\mathbf{P} = \\begin{pmatrix} 2 & -1 \\\\ \\tfrac{3}{2} & \\tfrac{1}{2} \\end{pmatrix}$'),
    # 2019-06-02 q4 Caesar-shifted line + M + inverse box
    ('2019-06-4mb1-02--exam-questions', 4, 2,
     'REGEX:\x03\n\n7KH\x03SRLQWV\x03[^\n]*',
     'The points (1, 2), (3, −2) and (1, 4) are the vertices of triangle B.'),
    ('2019-06-4mb1-02--exam-questions', 4, 4,
     'REGEX:\x03\n\n7KH\x03SRLQWV\x03[^\n]*',
     'The points (1, 2), (3, −2) and (1, 4) are the vertices of triangle B.'),
    ('2019-06-4mb1-02--exam-questions', 4, 2,
     '1\n\n⎛\n\n⎞\n\n−\n\n0\n\n⎜\n\n⎟\n\n2\n\nM =\n\n⎜\n\n⎟\n\n1\n\n⎜\n\n⎟\n\n−\n\n1\n\n⎝\n\n⎠\n\n2',
     '$\\mathbf{M} = \\begin{pmatrix} -\\tfrac{1}{2} & 0 \\\\ \\tfrac{1}{2} & -1 \\end{pmatrix}$'),
    ('2019-06-4mb1-02--exam-questions', 4, 4,
     'a\n\nb\n\nd\n\nb\n\n⎡\n\n−\n\n⎤\n\n⎛\n\n⎞\n\n⎛\n\n⎞\n\n1\n\nThe inverse of matrix\n\nis\n\n⎥\n\n⎢\n\n⎝⎜\n\n⎠⎟\n\n⎝⎜\n\n⎠⎟\n\nc\n\nd\n\nc\n\na\n\nad\n\nbc\n\n−\n\n−\n\n⎦\n\n⎣',
     '$\\left[\\text{The inverse of matrix } \\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix} \\text{ is } \\tfrac{1}{ad-bc}\\begin{pmatrix} d & -b \\\\ -c & a \\end{pmatrix}\\right]$'),
    # 2019-06-02 q5 angle glyphs + 3-rule box
    ('2019-06-4mb1-02--exam-questions', 5, 2,
     'The triangles are similar with ·ABE = ·ACD.',
     'The triangles are similar with $\\angle ABE = \\angle ACD$.'),
    ('2019-06-4mb1-02--exam-questions', 5, 2,
     'AB = 8 cm AE = 5 cm ·BAE = 30°',
     'AB = 8 cm  AE = 5 cm  $\\angle BAE = 30°$'),
    ('2019-06-4mb1-02--exam-questions', 5, 2,
     '⎤\n\n⎡\n\na\n\nb\n\nc\n\nbc\n\nA\n\n:\n\ncos\n\nCosine rule\n\n=\n\n+\n\n−\n\n2\n\n2\n\n2\n\n2\n\n⎢\n\n⎥\n\n⎢\n\n⎥\n\na\n\nb\n\nc\n\n⎢\n\n⎥\n\nSine rule\n\n: sin\n\n=\n\n=\n\nA\n\nB\n\nC\n\nsin\n\nsin\n\n⎢\n\n⎥\n\n⎢\n\n⎥\n\n1\n\n2 ab\n\nC\n\n⎢\n\n⎥\n\nsin\n\nAre\n\na of triangle =\n\n⎢\n\n⎥\n\n⎣\n\n⎦',
     '$\\left[\\begin{gathered} \\text{Cosine rule: } a^2 = b^2 + c^2 - 2bc\\cos A \\\\ \\text{Sine rule: } \\frac{a}{\\sin A} = \\frac{b}{\\sin B} = \\frac{c}{\\sin C} \\\\ \\text{Area of triangle} = \\frac{1}{2}ab\\sin C \\end{gathered}\\right]$'),
    # 2019-06-02 q8 trapezium box
    ('2019-06-4mb1-02--exam-questions', 8, 2,
     'Area of trapezium = 1\n\n⎡\n\n⎤\n\na\n\nb h\n\n2 (\n\n+\n\n)\n\n⎣⎢\n\n⎦⎥',
     '$\\left[\\text{Area of trapezium} = \\tfrac{1}{2}(a+b)h\\right]$'),
    # 2019-06-02 q11 toy: V show-that + cone/sphere boxes
    ('2019-06-4mb1-02--exam-questions', 11, 1,
     'REGEX:Show that V = 1\n\n3 ʌU\u0bd82[^\n]*',
     'Show that $V = \\tfrac{1}{3}\\pi r^2(15 - 4r)$'),
    ('2019-06-4mb1-02--exam-questions', 11, 1,
     '1\n\n⎡\n\n⎤\n\n$\\pi$r h\n\nVolume of cone\n\n=\n\n2\n\n⎢\n\n⎥\n\n3\n\n⎢\n\n⎥\n\n4\n\n⎢\n\n⎥\n\n$\\pi$r\n\n=\n\nVolume of sphere\n\n3\n\n⎢\n\n⎥\n\n3\n\n⎣\n\n⎦',
     '$\\left[\\begin{gathered} \\text{Volume of cone} = \\tfrac{1}{3}\\pi r^2 h \\\\ \\text{Volume of sphere} = \\tfrac{4}{3}\\pi r^3 \\end{gathered}\\right]$'),
    # 2018-06-02R q12 cosine rule + area boxes
    ('2018-06-4mb1-02r--exam-questions', 12, 1,
     '2\n\n2\n\n2\n\n⎛\n\n⎞\n\na\n\n=\n\nb\n\n+\n\nc\n\n−\n\nbc\n\nA\n\ncos\n\nCosine rule:\n\n2\n\n⎜\n\n⎟\n\n⎜\n\n⎟\n\n1\n\nab\n\nC\n\nsin\n\nArea of triangle =\n\n⎜\n\n⎟\n\n⎝\n\n⎠\n\n2',
     '$\\left[\\text{Cosine rule: } a^2 = b^2 + c^2 - 2bc\\cos A \\quad \\text{Area of triangle} = \\tfrac{1}{2}ab\\sin C\\right]$'),
]

# λ/μ glyph tokens (2018-06-02 q9 p4)
LAMBDA = [('2018-06-4mb1-02--exam-questions', 9, 4)]

fails = []
print('=== DRY RUN ===')
for mode, slug, qi, pi, *rest in RULES:
    try:
        p = part(slug, qi, pi)
    except Exception as e:
        fails.append((slug, qi, pi, 'PART-NOT-FOUND', str(e))); continue
    new = rest[0]
    old = p['problemMd']
    if old == new:
        fails.append((slug, qi, pi, mode, 'OLD==NEW')); continue
    if mode == 'full':
        if not re.search(r'[⎛⎜⎝⎡⎣⎢⎤⎦⎥Ȝȝ]', old):
            fails.append((slug, qi, pi, mode, 'no-debris-in-part')); continue
    print(f"OK-full {slug} q{qi} p{pi}")
for slug, qi, pi, old, new in SPLICE:
    try:
        p = part(slug, qi, pi)
    except Exception as e:
        fails.append((slug, qi, pi, 'PART-NOT-FOUND', str(e))); continue
    if old.startswith('REGEX:'):
        pat = re.compile(old[6:], re.S)
        n = len(pat.findall(p['problemMd']))
    else:
        n = p['problemMd'].count(old)
    if n != 1:
        fails.append((slug, qi, pi, 'splice', f'hit={n} old={old[:60]!r}'))
    else:
        print(f"OK-splice {slug} q{qi} p{pi} :: {new[:60]}")

# NNq fleet census
nnq = []
for s in d:
    for qi, q in enumerate(s['questions']):
        for pi, pp in enumerate(q.get('parts', [])):
            if re.search(r'\b\d{2,3}q\b', pp.get('problemMd', '')):
                nnq.append((s['slug'], qi + 1, pi))
print('NNq parts:', nnq)
if len(nnq) != 6:
    fails.append(('FLEET', 'NNq', 0, 'count', f'{len(nnq)} != 6'))

print(f"\nRULES full={sum(1 for r in RULES)} splice={len(SPLICE)} nnq={len(nnq)}")
if fails:
    print('FAILURES:')
    for f in fails: print(' ', f)
    sys.exit(1)
if not APPLY:
    print('DRY-RUN PASS — rerun with --apply to write')
    sys.exit(0)

# ---------- APPLY ----------
for mode, slug, qi, pi, *rest in RULES:
    p = part(slug, qi, pi)
    p['problemMd'] = rest[0]
for slug, qi, pi, old, new in SPLICE:
    p = part(slug, qi, pi)
    if old.startswith('REGEX:'):
        p['problemMd'] = re.compile(old[6:], re.S).sub(lambda m: new, p['problemMd'])
    else:
        p['problemMd'] = p['problemMd'].replace(old, new)
for slug, qi, pi in LAMBDA:
    p = part(slug, qi, pi)
    t = p['problemMd'].replace('Ȝ', '$\\lambda$').replace('ȝ', '$\\mu$')
    p['problemMd'] = t
cnt = 0
for s in d:
    for q in s['questions']:
        for pp in q.get('parts', []):
            t = pp.get('problemMd', '')
            t2 = re.sub(r'\b(\d{2,3})q\b', '\\1°', t)
            if t2 != t:
                pp['problemMd'] = t2; cnt += 1
print('NNq fixed parts:', cnt)
# strip Question-N-continued meta lines in touched parts
touched = {(r[1], r[2], r[3]) for r in RULES} | {(s[0], s[1], s[2]) for s in SPLICE} | set(LAMBDA)
stripped = 0
for slug, qi, pi in touched:
    p = part(slug, qi, pi)
    t = p['problemMd']
    t2 = re.sub(r'\n*Question \d+ continued[^\n]*\n?', '\n', t).strip()
    t2 = re.sub(r'\n{3,}', '\n\n', t2)
    if t2 != t:
        p['problemMd'] = t2; stripped += 1
print('meta-stripped parts:', stripped)
json.dump(d, open(B, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('APPLIED + SAVED')

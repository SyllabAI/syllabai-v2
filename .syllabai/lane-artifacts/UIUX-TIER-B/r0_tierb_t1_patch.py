#!/usr/bin/env python3
"""UIUX-TIER-B T1: close the 38 soft-skipped figure-rules (33 groups) — embed the
committed assets (re-crops @65c4ba9, existing @7576c78f) at verified targets.
Fail-closed: every anchor/strip must hit exactly once per part. Skips disclosed:
2022-01-01R 001 (duplicate of embedded q6 figure), 2020-06+11-02R q7 spare copies."""
import json, re, sys

B = '/home/z/my-project/ws/syllabai-v2/apps/hub/content/igcse-maths-b-16/questions.json'
APPLY = '--apply' in sys.argv
PIN_NEW = '65c4ba923d7b3303dd9a89a87b6edf74c174eafa'
PIN_OLD = '7576c78fa6315f613dfa5821e0afd2ed47761f78'
BASE = 'https://raw.githubusercontent.com/SyllabAI/syllabai-resources/{pin}/SME-ExamQuestion/igcse-maths-b-16/past-papers/{pap}/assets/{file}'

def url(pap, file, pin=PIN_OLD):
    return BASE.format(pin=pin, pap=pap, file=file)

d = json.load(open(B, encoding='utf-8'))
byidx = {s['slug']: i for i, s in enumerate(d)}

def parts(slug, qn):
    return d[byidx[slug]]['questions'][qn - 1]['parts']

# rule: (slug, qn, pi, anchor_regex, asset_url, alt, strip_regex or None)
R = []
def E(slug, qn, pi, anchor, pap, file, alt, pin=PIN_OLD, strip=None):
    R.append((slug, qn, pi, anchor, url(pap, file, pin), alt, strip))

# --- 2018-06-01R q17 circle tangent (re-crop 009) ---
E('2018-06-4mb1-01r--exam-questions', 17, 0, r'CAO is a straight line\.', '2018-06/01R', '009-q17-circle-centre-o-a-and-b-on-circumference-tan.png', 'circle centre O with tangent CBD at B and angle ABC 38 degrees', PIN_NEW, strip=r'\A\n\nO\n\nD\n\nA\n\nB\n\n38°\n\nC\n\n')
# --- histogram groups: embed after referencing prose; strip Frequency/density block where present ---
E('2019-06-4mb1-01--exam-questions', 20, 0, r'the homework\.', '2019-06/01', '001-q20-q20-censused-figure.png', 'incomplete histogram: time taken to complete homework', strip=r'Frequency\n\ndensity\n\n0\n\n30\n\n10\n\n20\n\n50\n\n60\n\n70\n\n40\n\nTime taken \(t minutes\)\n\n')
E('2019-06-4mb1-01r--exam-questions', 28, 1, r'that 132 cars were parked in the car park on Monday\.', '2019-06/01R', '010-q28-q28-censused-figure.png', 'incomplete histogram: lengths of time cars parked on Monday')
E('2020-01-4mb1-01r--exam-questions', 21, 0, r'give information about these passengers\.', '2020-01/01R', '002-q21-q21-censused-figure.png', 'incomplete histogram: weights of passengers')
E('2020-01-4mb1-01r--exam-questions', 21, 1, r'give information about these passengers\.', '2020-01/01R', '002-q21-q21-censused-figure.png', 'incomplete histogram: weights of passengers', strip=r'Frequency\n\ndensity\n\n0\n\n50\n\n60\n\n70\n\n80\n\n90\n\n100\n\n110\n\n120\n\n')
E('2020-06-4mb1-01--exam-questions', 17, 0, r'shows information about the age of each person on a plane\.', '2020-06/01', '009-q17-histogram.png', 'histogram: ages of people on a plane', PIN_NEW, strip=r'Frequency\n\ndensity\n\n0 0\n\n5\n\n10\n\n15\n\n20\n\n25\n\n30\n\n35\n\n40\n\n45\n\n50\n\n55\n\n60\n\n65\n\n70\n\n75\n\n80\n\nAge \(years\)\n\n')
E('2020-11-4mb1-01--exam-questions', 17, 0, r'shows information about the age of each person on a plane\.', '2020-11/01', '007-q17-histogram.png', 'histogram: ages of people on a plane', PIN_NEW, strip=r'Frequency\n\ndensity\n\n0 0\n\n5\n\n10\n\n15\n\n20\n\n25\n\n30\n\n35\n\n40\n\n45\n\n50\n\n55\n\n60\n\n65\n\n70\n\n75\n\n80\n\nAge \(years\)\n\n')
E('2020-06-4mb1-01--exam-questions', 24, 0, r'ABCD is a quadrilateral\.', '2020-06/01', '010-q24-quadrilateral-abcd-for-locus-construction.png', 'quadrilateral ABCD for locus construction', PIN_NEW, strip=r'\AA\n\nB\n\nD\n\nC\n\n')
E('2020-06-4mb1-01--exam-questions', 24, 1, r'ABCD is a quadrilateral\.', '2020-06/01', '010-q24-quadrilateral-abcd-for-locus-construction.png', 'quadrilateral ABCD for locus construction', PIN_NEW, strip=r'\AA\n\nB\n\nD\n\nC\n\n')
E('2020-06-4mb1-01--exam-questions', 24, 2, r'ABCD is a quadrilateral\.', '2020-06/01', '010-q24-quadrilateral-abcd-for-locus-construction.png', 'quadrilateral ABCD for locus construction', PIN_NEW, strip=r'\AA\n\nB\n\nD\n\nC\n\n')
E('2020-06-4mb1-01--exam-questions', 24, 3, r'ABCD is a quadrilateral\.', '2020-06/01', '010-q24-quadrilateral-abcd-for-locus-construction.png', 'quadrilateral ABCD for locus construction', PIN_NEW, strip=r'\AA\n\nB\n\nD\n\nC\n\n')
E('2020-06-4mb1-01--exam-questions', 27, 0, r'Aarya has a biased 5-sided spinner\.', '2020-06/01', '007-q27-q27-censused-figure.png', 'biased 5-sided spinner: pink orange green blue yellow', strip=r'pink\n\norange\n\ngreen\n\nblue\n\nyellow\n\n')
E('2020-06-4mb1-01--exam-questions', 27, 1, r'Aarya has a biased 5-sided spinner\.', '2020-06/01', '007-q27-q27-censused-figure.png', 'biased 5-sided spinner: pink orange green blue yellow', strip=r'pink\n\norange\n\ngreen\n\nblue\n\nyellow\n\n')
E('2020-11-4mb1-01--exam-questions', 27, 0, r'Aarya has a biased 5-sided spinner\.', '2020-11/01', '006-q27-q27-censused-figure.png', 'biased 5-sided spinner: pink orange green blue yellow', strip=r'pink\n\norange\n\ngreen\n\nblue\n\nyellow\n\n')
E('2020-11-4mb1-01--exam-questions', 27, 1, r'Aarya has a biased 5-sided spinner\.', '2020-11/01', '006-q27-q27-censused-figure.png', 'biased 5-sided spinner: pink orange green blue yellow', strip=r'pink\n\norange\n\ngreen\n\nblue\n\nyellow\n\n')
E('2020-06-4mb1-02r--exam-questions', 7, 1, r'35 birds spent on Ali’s bird table on Tuesday\.', '2020-06/02R', '002-q7-q7-censused-figure.png', 'incomplete histogram: time birds spent on bird table', strip=r'Frequency\n\ndensity\n\n0\n\n0\n\n10\n\n20\n\n30\n\n40\n\nLength of time \(seconds\)\n\n')
E('2020-06-4mb1-02r--exam-questions', 7, 2, r'Use this information to complete the histogram\.', '2020-06/02R', '002-q7-q7-censused-figure.png', 'incomplete histogram: time birds spent on bird table')
E('2020-11-4mb1-02r--exam-questions', 7, 1, r'35 birds spent on Ali’s bird table on Tuesday\.', '2020-11/02R', '002-q7-q7-censused-figure.png', 'incomplete histogram: time birds spent on bird table', strip=r'Frequency\n\ndensity\n\n0\n\n0\n\n10\n\n20\n\n30\n\n40\n\nLength of time \(seconds\)\n\n')
E('2020-11-4mb1-02r--exam-questions', 7, 2, r'Use this information to complete the histogram\.', '2020-11/02R', '002-q7-q7-censused-figure.png', 'incomplete histogram: time birds spent on bird table')
E('2021-01-4mb1-01--exam-questions', 7, 0, r'Here is hexagon ABCDEF\.', '2021-01/01', '007-q7-hexagon-abcdef-right-angles-sides-8cm-14cm-9.png', 'hexagon ABCDEF with right angles, sides 8cm 9cm 12cm 14cm', PIN_NEW, strip=r'8 cm\n\nA\n\nB\n\n9 cm\n\n14 cm\n\n12 cm\n\nC\n\nD\n\nF\n\nE\n\n')
E('2021-01-4mb1-01--exam-questions', 23, 0, r'mean temperature for 184 days measured at Heathrow\.', '2021-01/01', '005-q23-q23-censused-figure.png', 'incomplete histogram: daily mean temperature at Heathrow', strip=r'Frequency\n\ndensity\n\n0\n\n0\n\n5\n\n10\n\n15\n\n20\n\n25\n\n30\n\nDaily mean temperature \(T °C\)\n\n')
E('2022-06-4mb1-01r--exam-questions', 20, 0, r'that each of 105 runners took to complete a half marathon\.', '2022-06/01R', '011-q20-q20-censused-figure.png', 'incomplete histogram: half marathon times')
E('2022-06-4mb1-01r--exam-questions', 20, 1, r'Use the information in the table to complete the histogram\.', '2022-06/01R', '011-q20-q20-censused-figure.png', 'incomplete histogram: half marathon times')
E('2023-01-4mb1-01r--exam-questions', 26, 0, r'of kilometres each of the 40 people had travelled to get to the shop\.', '2023-01/01R', '010-q26-q26-censused-figure.png', 'incomplete histogram: distances travelled to the shop', strip=r'Frequency\n\ndensity\n\n0\n\n0\n\n10\n\n20\n\n30\n\n40\n\n50\n\n60\n\nDistance \(k kilometres\)$')
E('2023-01-4mb1-01r--exam-questions', 26, 1, r'The table below shows information about the results\.', '2023-01/01R', '010-q26-q26-censused-figure.png', 'incomplete histogram: distances travelled to the shop')
# 2023-06-01R q4: 002=squares, 001=triangles (verified by render)
E('2023-06-4mb1-01r--exam-questions', 4, 0, r'The shape above is made from four squares\. Two of the squares are shaded\.', '2023-06/01R', '002-q4-q4-censused-figure.png', 'shape made from four squares, two shaded')
E('2023-06-4mb1-01r--exam-questions', 4, 0, r'are half shaded\.', '2023-06/01R', '001-q4-q4-censused-figure.png', 'shape made from four equilateral triangles, three half shaded')
E('2023-06-4mb1-01r--exam-questions', 4, 1, r'The shape above is made from four squares\. Two of the squares are shaded\.', '2023-06/01R', '002-q4-q4-censused-figure.png', 'shape made from four squares, two shaded')
E('2023-06-4mb1-01r--exam-questions', 11, 0, r'Angle AOC is 120°', '2023-06/01R', '003-q11-q11-censused-figure.png', 'sector OABC of circle centre O, angle AOC 120 degrees', strip=r'\AB\n\nC\n\nA\n\n120°\n\nO\n\n')
E('2023-11-4mb1-01--exam-questions', 4, 0, r'bisector of angle FGH', '2023-11/01', '010-q4-angle-fgh-for-ruler-and-compasses-bisector-c.png', 'angle FGH for construction', PIN_NEW, strip=r'H\n\nF\n\nG\Z')
E('2023-11-4mb1-01--exam-questions', 16, 0, r'Here is hexagon ABCDEF', '2023-11/01', '011-q16-hexagon-abcdef-with-sides-(2x+1)cm-(3x+4)cm-.png', 'hexagon ABCDEF with sides (2x+1)cm, (3x+4)cm, 2x cm, 5x cm', PIN_NEW, strip=r'\(\n\n\)\n\n2\n\n1 cm\n\nx \+\n\n\(\n\n\)\n\n3\n\n4 cm\n\nx \+\n\nAB\n\nx\n\n1 cm\n\nAF\n\nx\n\n2\n\n3\n\n4\n\nDE\n\nx\n\nFE\n\n= 5 cm\n\nx\n\n= 2 cm\n\n')
E('2024-06-4mb1-02r--exam-questions', 8, 1, r'delivery van on Friday\.', '2024-06/02R', '005-q8-q8-censused-figure.png', 'incomplete histogram: weights of parcels', strip=r'Frequency\n\ndensity\n\n0\n\n2\n\n4\n\n6\n\n8\n\n10\n\n12\n\n0\n\nWeight \(kg\)\n\n')
E('2024-06-4mb1-02r--exam-questions', 8, 2, r'\AAalia delivers letters and parcels\.', '2024-06/02R', '005-q8-q8-censused-figure.png', 'incomplete histogram: weights of parcels')
E('2024-11-4mb1-01--exam-questions', 2, 0, r'A pattern is made with white squares and shaded squares\.', '2024-11/01', '001-q2-q2-censused-figure.png', 'pattern of white and shaded squares')
E('2024-11-4mb1-01--exam-questions', 2, 0, r'Here is a different pattern made from white squares and shaded squares\.', '2024-11/01', '002-q2-q2-censused-figure.png', 'different pattern of white and shaded squares')
E('2024-11-4mb1-01--exam-questions', 2, 1, r'\A(A pattern is made with white squares and shaded squares\.\n\n)', '2024-11/01', '002-q2-q2-censused-figure.png', 'different pattern of white and shaded squares')
E('2025-06-4mb1-01--exam-questions', 18, 0, r'of minutes that 900 flights arrived late at an airport\.', '2025-06/01', '005-q18-q18-censused-figure.png', 'incomplete histogram: flight delays', strip=r'Frequency\n\ndensity\n\n0\n\n60\n\n120\n\n180\n\n240\n\n300\n\n0\n\nNumber of minutes late \(t minutes\)\n\n')
E('2025-06-4mb1-01--exam-questions', 18, 1, r'of minutes that 900 flights arrived late at an airport\.', '2025-06/01', '005-q18-q18-censused-figure.png', 'incomplete histogram: flight delays', strip=r'Frequency\n\ndensity\n\n0\n\n60\n\n120\n\n180\n\n240\n\n300\n\n0\n\nNumber of minutes late \(t minutes\)\n\n')
E('2025-06-4mb1-01r--exam-questions', 22, 0, r'weight, in grams, of each tomato harvested last month\.', '2025-06/01R', '003-q22-q22-censused-figure.png', 'incomplete histogram: tomato weights', strip=r'Frequency\n\ndensity\n\n0\n\n10\n\n5\n\n15\n\n20\n\n25\n\n30\n\n35\n\n40\n\n45\n\n50\n\n55\n\n60\n\n65\n\n0\n\nWeight \(w grams\)\n\n')
E('2025-06-4mb1-01r--exam-questions', 22, 1, r'weight, in grams, of each tomato harvested last month\.', '2025-06/01R', '003-q22-q22-censused-figure.png', 'incomplete histogram: tomato weights', strip=r'Frequency\n\ndensity\n\n0\n\n10\n\n5\n\n15\n\n20\n\n25\n\n30\n\n35\n\n40\n\n45\n\n50\n\n55\n\n60\n\n65\n\n0\n\nWeight \(w grams\)\n\n')
E('2025-06-4mb1-02--exam-questions', 2, 0, r"The trapezium PQRS is a scale drawing of Abdul’s garden\.", '2025-06/02', '010-q2-trapezium-pqrs-scale-drawing-of-garden-scale.png', 'trapezium PQRS scale drawing, 1cm represents 2 metres', PIN_NEW, strip=r'\AQ\n\nP\n\nScale: 1 cm represents 2 metres\n\nS\n\nR\n\n')
E('2025-06-4mb1-02--exam-questions', 2, 1, r"The trapezium PQRS is a scale drawing of Abdul’s garden\.", '2025-06/02', '010-q2-trapezium-pqrs-scale-drawing-of-garden-scale.png', 'trapezium PQRS scale drawing, 1cm represents 2 metres', PIN_NEW)
E('2025-06-4mb1-02--exam-questions', 2, 2, r"The trapezium PQRS is a scale drawing of Abdul’s garden\.", '2025-06/02', '010-q2-trapezium-pqrs-scale-drawing-of-garden-scale.png', 'trapezium PQRS scale drawing, 1cm represents 2 metres', PIN_NEW)
E('2025-06-4mb1-02--exam-questions', 2, 3, r"The trapezium PQRS is a scale drawing of Abdul’s garden\.", '2025-06/02', '010-q2-trapezium-pqrs-scale-drawing-of-garden-scale.png', 'trapezium PQRS scale drawing, 1cm represents 2 metres', PIN_NEW)
E('2025-10-4mb1-01--exam-questions', 4, 0, r'A shape is made from a regular hexagon and a square\.', '2025-10/01', '001-q4-q4-censused-figure.png', 'regular hexagon with square on its sides')
E('2025-10-4mb1-01--exam-questions', 4, 1, r'\A(For this shape, write down the number of lines of symmetry\.)', '2025-10/01', '001-q4-q4-censused-figure.png', 'regular hexagon with square on its sides')
E('2026-06-4mb1-01r--exam-questions', 12, 0, r'that each of 100 students worked in a library\.', '2026-06/01R', '003-q12-q12-censused-figure.png', 'incomplete histogram: time worked in a library', strip=r'Frequency\n\ndensity\n\n0\n\n40\n\n80\n\n120\n\n160\n\n200\n\n0\n\nTime \(t minutes\)$')
E('2018-06-4mb1-02r--exam-questions', 3, 0, r'Figure 2 shows an empty tank in the shape of a right circular cylinder\.', '2018-06/02R', '002-q5-figure-2-cylinder-on-hemisphere.png', 'Figure 2: tank in the shape of a right circular cylinder, radius 2.5m', strip=r'\ADiagram NOT\n\n2\.5 m\n\naccurately drawn\n\n')
E('2018-06-4mb1-02r--exam-questions', 3, 1, r'Figure 2 shows an empty tank in the shape of a right circular cylinder\.', '2018-06/02R', '002-q5-figure-2-cylinder-on-hemisphere.png', 'Figure 2: tank in the shape of a right circular cylinder, radius 2.5m', strip=r'\ADiagram NOT\n\n2\.5 m\n\naccurately drawn\n\n')
E('2021-06-4mb1-02--exam-questions', 4, 0, r'In Figure 1, OACB is a quadrilateral in which OA', '2021-06/02', '005-q4-figure-1.png', 'Figure 1: quadrilateral OACB with vectors 2a and 5b, P on OC', PIN_NEW)
E('2021-06-4mb1-02--exam-questions', 4, 1, r'\A(C\n\nDiagram NOT\n\naccurately drawn\n\nB\n\nP\n\n5b\n\nO\n\n2a\n\nA\n\nFigure 1\n\n)', '2021-06/02', '005-q4-figure-1.png', 'Figure 1: quadrilateral OACB with vectors 2a and 5b, P on OC', PIN_NEW)
E('2021-06-4mb1-02--exam-questions', 4, 2, r'\A(C\n\nDiagram NOT\n\naccurately drawn\n\nB\n\nP\n\n5b\n\nO\n\n2a\n\nA\n\nFigure 1\n\n)', '2021-06/02', '005-q4-figure-1.png', 'Figure 1: quadrilateral OACB with vectors 2a and 5b, P on OC', PIN_NEW)
E('2022-06-4mb1-02r--exam-questions', 9, 0, r'of the circle\.', '2022-06/02R', '007-q9-figure-3.png', 'Figure 3: circle centre O, points A B C, D on AC, E on CE/BD extended', PIN_NEW)
E('2022-06-4mb1-02r--exam-questions', 9, 1, r'of the circle\.', '2022-06/02R', '007-q9-figure-3.png', 'Figure 3: circle centre O, points A B C, D on AC, E on CE/BD extended', PIN_NEW)
E('2022-06-4mb1-02r--exam-questions', 9, 2, r'of the circle\.', '2022-06/02R', '007-q9-figure-3.png', 'Figure 3: circle centre O, points A B C, D on AC, E on CE/BD extended', PIN_NEW)
E('2022-06-4mb1-02r--exam-questions', 9, 3, r'of the circle\.', '2022-06/02R', '007-q9-figure-3.png', 'Figure 3: circle centre O, points A B C, D on AC, E on CE/BD extended', PIN_NEW)
E('2022-06-4mb1-02r--exam-questions', 9, 4, r'of the circle\.', '2022-06/02R', '007-q9-figure-3.png', 'Figure 3: circle centre O, points A B C, D on AC, E on CE/BD extended', PIN_NEW)
# 2024-11-01 q16: strip label head + embed after the given block
E('2024-11-4mb1-01--exam-questions', 16, 0, r'ABC is parallel to DEF', '2024-11/01', '008-q16-parallel-lines-ab-and-de-isosceles-triangle-.png', 'parallel lines ABC and DEF, isosceles triangle BGE, angles 113 and 94 degrees', PIN_NEW, strip=r'\AB\n\nDiagram NOT\n\nA\n\nC\n\naccurately drawn\n\n94°\n\nH\n\nG\n\n113°\n\nF\n\nD\n\nE\n\n')
# 2019-06-01R q24 scale drawing (3 parts)
E('2019-06-4mb1-01r--exam-questions', 24, 0, r'The scale drawing shows the positions of two posts, A and B\.', '2019-06/01R', '011-q24-scale-drawing.png', 'scale drawing: posts A and B with north arrows, 1cm represents 50 metres', PIN_NEW, strip=r'\n\nN\n\nN\n\nA\n\nB\n\nScale: 1 cm represents 50 metres\n\n')
E('2019-06-4mb1-01r--exam-questions', 24, 1, r'The scale drawing shows the positions of two posts, A and B\.', '2019-06/01R', '011-q24-scale-drawing.png', 'scale drawing: posts A and B with north arrows, 1cm represents 50 metres', PIN_NEW, strip=r'\n\nN\n\nN\n\nA\n\nB\n\nScale: 1 cm represents 50 metres\n\n')
E('2019-06-4mb1-01r--exam-questions', 24, 2, r'The scale drawing shows the positions of two posts, A and B\.', '2019-06/01R', '011-q24-scale-drawing.png', 'scale drawing: posts A and B with north arrows, 1cm represents 50 metres', PIN_NEW, strip=r'\n\nN\n\nN\n\nA\n\nB\n\nScale: 1 cm represents 50 metres\n\n')

fails, emb_count = [], 0
print('=== DRY RUN ===')
for slug, qn, pi, anchor, u, alt, strip in R:
    try:
        p = parts(slug, qn)[pi]
    except Exception as e:
        fails.append((slug, qn, pi, 'PART', str(e))); continue
    t = p['problemMd']
    if '![' in t:
        fails.append((slug, qn, pi, 'already-has-embed', '')); continue
    am = re.findall(anchor, t)
    if len(am) != 1:
        fails.append((slug, qn, pi, 'anchor', f'{len(am)} hits for {anchor[:50]!r}')); continue
    if strip:
        if not re.search(strip, t, re.S):
            fails.append((slug, qn, pi, 'strip', f'no hit {strip[:50]!r}')); continue
    emb_count += 1
    print(f"OK {slug} q{qn} p{pi} <- {u.rsplit('/',1)[1][:44]}")
print(f"\nrules={len(R)} embeds={emb_count}")
if fails:
    print('FAILURES:')
    for f in fails: print(' ', f)
    sys.exit(1)
if not APPLY:
    print('DRY-RUN PASS — rerun with --apply')
    sys.exit(0)

for slug, qn, pi, anchor, u, alt, strip in R:
    p = parts(slug, qn)[pi]
    t = p['problemMd']
    if strip:
        t = re.sub(strip, '', t, count=1, flags=re.S)
    emb = f"\n\n![{alt}]({u})"
    i = re.search(anchor, t, re.S).end()
    t = t[:i] + emb + t[i:]
    t = re.sub(r'\n{3,}', '\n\n', t).strip()
    t = re.sub(r'\n*Question \d+ continued[^\n]*\n?', '\n', t).strip()
    t = re.sub(r'\n{3,}', '\n\n', t)
    p['problemMd'] = t
json.dump(d, open(B, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('APPLIED + SAVED:', emb_count, 'embed instances')

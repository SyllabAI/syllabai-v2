#!/usr/bin/env python3
"""UIUX-ARTWORK-3 bundle patch — embed the 20 residual figures into the 3 uncovered sets.
Fail-closed: every rule must hit its expected parts; structure + math-segment laws asserted;
single-line compact JSON law; manifest note append only."""
import json, re, sys

BPATH = '/home/z/my-project/ws/syllabai-v2/apps/hub/content/igcse-maths-b-16/questions.json'
MPATH = '/home/z/my-project/ws/syllabai-v2/apps/hub/content/igcse-maths-b-16/manifest.json'

SHA_NEW = 'e33d4805f97af6d18a71f87d8d994e143ab66126'   # UIUX-ARTWORK-3 resources commit
SHA_ART2 = '7576c78fa6315f613dfa5821e0afd2ed47761f78'  # q19 asset of record (ARTWORK-2)

def u(sha, sess, paper, f):
    return f'https://raw.githubusercontent.com/SyllabAI/syllabai-resources/{sha}/SME-ExamQuestion/igcse-maths-b-16/past-papers/{sess}/{paper}/assets/{f}'

S1 = '2023-01-4mb1-01--exam-questions'
S2 = '2021-01-4mb1-02--exam-questions'
S3 = '2021-01-4mb1-02r--exam-questions'

# (set, q_number, anchor_line, [(alt, url), ...], expected_part_hits)
RULES = [
 (S1, 9,  'Quadrilateral A and quadrilateral B are drawn on a grid.',
   [('quadrilaterals A and B on a grid', u(SHA_NEW,'2023-01','01','002-q9-quadrilaterals-a-and-b-on-a-grid.png'))], 1),
 (S1, 12, 'Angle BDF = 75°',
   [('circle ABCD with tangent EDF and angle BDF 75 degrees', u(SHA_NEW,'2023-01','01','003-q12-circle-abcd-tangent-edf-75-degrees.png'))], 1),
 (S1, 14, 'regular n-sided polygon.',
   [('regular pentagon ABCDE with sides FE EG GH of a regular n-sided polygon', u(SHA_NEW,'2023-01','01','004-q14-pentagon-abcde-sides-fe-eg-gh.png'))], 1),
 (S1, 15, 'radius r cm and vertical height 20 cm.',
   [('sphere of radius r cm', u(SHA_NEW,'2023-01','01','005-q15-sphere-radius-r.png')),
    ('right circular cone with base radius r cm and vertical height 20 cm', u(SHA_NEW,'2023-01','01','006-q15-cone-radius-r-height-20cm.png'))], 1),
 (S1, 18, 'The diagram shows two mathematically similar solids A and B',
   [('mathematically similar solids A and B', u(SHA_NEW,'2023-01','01','007-q18-mathematically-similar-solids-a-and-b.png'))], 1),
 (S1, 19, 'The quadrilateral ABCD is a scale drawing of Simon’s garden.',
   [('quadrilateral ABCD scale drawing with points X and Y, scale 1cm represents 2m', u(SHA_ART2,'2023-01','01','001-q19-quadrilateral-abcd-with-x-f-scale-1cm-2m.png'))], 4),
 (S1, 21, 'a straight horizontal road.',
   [('speed-time graph of the cyclist, u at t=0 rising to 10 m/s then constant to 6 s', u(SHA_NEW,'2023-01','01','008-q21-speed-time-graph-cyclist.png'))], 2),
 (S1, 22, 'month for each of 30 students in a class.',
   [('bar chart of the number of pieces of music downloaded by 30 students', u(SHA_NEW,'2023-01','01','009-q22-bar-chart-music-downloads.png'))], 2),
 (S1, 26, 'The diagram shows a pyramid ABCD with a horizontal triangular base ABC',
   [('pyramid ABCD with horizontal triangular base, DC 5√3 cm, DB 10√3 cm, angle BDC 60°', u(SHA_NEW,'2023-01','01','010-q26-pyramid-abcd-triangular-base.png'))], 2),
 (S2, 3,  'Figure 1 shows circle QRST with centre O.',
   [('circle QRST with centre O, chords 50 mm, 40 mm and 60 mm', u(SHA_NEW,'2021-01','02','001-q3-circle-qrst-50mm-40mm-60mm.png'))], 1),
 (S2, 4,  ('Complete the probability tree diagram below.', 'on a randomly chosen day in a week of seven days.'),
   [('incomplete probability tree diagram, Day against Alan’s result', u(SHA_NEW,'2021-01','02','002-q4-probability-tree-alan-games.png'))], 2),
 (S2, 5,  ('each appropriate subset, in terms of x or y.', 'n\u2009(\u200aA\u200a\' ∩ B\u200a\' ∩ C\u200a\'\u200a) = y'),
   [('three-set Venn diagram for sets A, B and C', u(SHA_NEW,'2021-01','02','003-q5-venn-diagram-abc.png'))], 4),
 (S2, 8,  'AEC and BED are straight lines.',
   [('kite ABCD with AB 6 cm, BC 8 cm, diagonals meeting at E', u(SHA_NEW,'2021-01','02','004-q8-kite-abcd-6cm-8cm.png'))], 4),
 (S2, 10, 'M is the midpoint of OA and N is the midpoint of AB.',
   [('triangle OAB with M the midpoint of OA and N the midpoint of AB', u(SHA_NEW,'2021-01','02','005-q10-triangle-oab-midpoints.png'))], 4),
 (S3, 1,  'The Venn diagram on the opposite page can be used to show these sets.',
   [('three-set Venn diagram for sets A, B and C', u(SHA_NEW,'2021-01','02R','001-q1-venn-diagram-abc.png'))], 6),
 (S3, 5,  'AB = 9.2\u2009cm AD = 10.6\u2009cm ∠BAD = 65° ∠CBD = 34°',
   [('circle ABCDE with AB 9.2 cm, AD 10.6 cm, angle BAD 65°, angle CBD 34°', u(SHA_NEW,'2021-01','02R','002-q5-circle-abcde-9-2cm-10-6cm.png'))], 4),
 (S3, 8,  'a solid right triangular prism ABCDEF onto a solid cuboid ACDFGHJK.',
   [('solid right pentagonal prism ABCDEFGHJK', u(SHA_NEW,'2021-01','02R','003-q8-pentagonal-prism-abcdefghjk.png'))], 4),
 (S3, 10, 'F is the midpoint of CB and D is the point on AB such that AD\u2009:\u2009DB = 2\u2009:\u20093',
   [('rectangle OABC with F the midpoint of CB and D on AB', u(SHA_NEW,'2021-01','02R','004-q10-rectangle-oabc-vectors.png'))], 4),
 (S3, 11, 'Figure 4 shows six identical circles inside a rectangle.',
   [('six identical circles inside a rectangle', u(SHA_NEW,'2021-01','02R','005-q11-six-circles-in-rectangle.png'))], 1),
]

raw = open(BPATH, newline='').read()
bundle = json.loads(raw)
mraw = open(MPATH, newline='').read()
manifest = json.loads(mraw)

# ---- law baselines ----
IMG = re.compile(r'!\[[^\]]*\]\((https://raw\.githubusercontent\.com/SyllabAI/syllabai-resources/([0-9a-f]{40})/[^)]+)\)')
MATH = re.compile(r'\$[^$]+\$')
n_sets = len(bundle)
n_q = sum(len(s['questions']) for s in bundle)
n_p = sum(len(q['parts']) for s in bundle for q in s['questions'])
n_marks = sum(p['marks'] for s in bundle for q in s['questions'] for p in q['parts'])
n_img = len(IMG.findall(raw))
n_math = len(MATH.findall(raw))
print(f'baseline: sets={n_sets} q={n_q} parts={n_p} marks={n_marks} imgs={n_img} mathsegs={n_math}')
assert (n_sets, n_q, n_p, n_marks) == (65, 1270, 2412, 6500), 'STRUCTURE LAW MISMATCH'
assert n_img == 632, f'IMG baseline {n_img} != 632'

sets_by_slug = {s['slug']: s for s in bundle}
DRY = '--dry' in sys.argv
total_inserts = 0
total_img_instances = 0
report = []
misses = []
for slug, qn, anchors, images, expect in RULES:
    if isinstance(anchors, str):
        anchors = (anchors,)
    s = sets_by_slug[slug]
    q = s['questions'][qn - 1]   # questions array is paper-ordered
    hits = 0
    for p in q['parts']:
        pm = p.get('problemMd') or ''
        if any(url in pm for _, url in images):
            continue  # idempotence: already embedded (not expected on this run)
        lines = pm.split('\n')
        anchor = next((a for a in anchors if a in lines), None)
        if anchor is not None:
            if DRY:
                hits += 1
                total_img_instances += len(images)
                continue
            i = lines.index(anchor)
            elems = []
            for alt, url2 in images:
                elems += ['', f'![{alt}]({url2})']   # own-paragraph law: blank line before each image
            lines[i + 1:i + 1] = elems
            p['problemMd'] = '\n'.join(lines)
            hits += 1
            total_img_instances += len(images)
    if hits != expect:
        misses.append((slug, qn, hits, expect))
    total_inserts += hits
    report.append((slug, qn, hits, len(images)))

for r in report:
    print('  rule:', r)
print(f'rules={len(RULES)} part-inserts={total_inserts} img-instances={total_img_instances}')
if misses:
    print('MISSES:', misses)
if DRY:
    print('DRY RUN — no writes')
    sys.exit(0)
assert not misses, 'ANCHOR MISSES — aborting (fail-closed)'

# ---- post gates ----
out = json.dumps(bundle, ensure_ascii=False, separators=(',', ':'))
n_sets2 = len(bundle)
n_q2 = sum(len(s['questions']) for s in bundle)
n_p2 = sum(len(q['parts']) for s in bundle for q in s['questions'])
n_marks2 = sum(p['marks'] for s in bundle for q in s['questions'] for p in q['parts'])
n_img2 = len(IMG.findall(out))
n_math2 = len(MATH.findall(out))
print(f'post: sets={n_sets2} q={n_q2} parts={n_p2} marks={n_marks2} imgs={n_img2} mathsegs={n_math2}')
assert (n_sets2, n_q2, n_p2, n_marks2) == (65, 1270, 2412, 6500), 'STRUCTURE LAW BROKEN'
assert n_img2 == n_img + 50, f'IMG post {n_img2} != {n_img+50}'
assert n_math2 == n_math, f'MATH segments changed {n_math} -> {n_math2}'
assert '\n' not in out, 'SINGLE-LINE LAW BROKEN'
# every new URL well-formed + pinned to the two shas of record
for m in IMG.finditer(out):
    sha = m.group(2)
    assert sha in (SHA_NEW, SHA_ART2, 'e9b4447da68d281b00d7eac2a3fa27e0d7ff8582'), f'UNEXPECTED SHA {sha}'

# ---- manifest note append ----
note = ("UIUX-ARTWORK-3 (2026-10-23, operator trace 1a1680c3f9d1f07d continuation 1a168b585e947695): lane (1) artwork residual completion — the 3 papers the scale run left uncovered (2021-01-02, 2021-01-02R, 2023-01-01 remainder) closed end-to-end: 19 information-bearing figures committed to syllabai-resources e33d4805f97af6d18a71f87d8d994e143ab66126 past-papers/<session>/<paper>/assets (150dpi grayscale, visually adjudicated, text-label-inclusive clips) and hotlinked into part problemMd fields after referencing lines (50 embed instances / 49 part-inserts across 19 rules; q19's ARTWORK-2 asset e9b4447d.. wait — q19 asset sha 7576c78f now embedded — 4 parts; skips disclosed per pilot law: 2021-01-02 q6 3 empty number lines + q9/q11 empty plotting grids, 2021-01-02R q3/q7 empty plotting grids — empty working surfaces, Tier-B candidates, tables likewise); coverage now 65/65 sets with artwork; structure law 65/1270/2412/6500 unchanged, math-segment law unchanged, single-line compact JSON law kept")
# fix the garbled self-correction in the note text above before writing
note = ("UIUX-ARTWORK-3 (2026-10-23, operator trace 1a1680c3f9d1f07d continuation 1a168b585e947695): lane (1) artwork residual completion — the 3 papers the ARTWORK-2 scale run left uncovered (2021-01-02, 2021-01-02R, 2023-01-01 remainder) closed end-to-end: 19 information-bearing figures committed to syllabai-resources e33d4805f97af6d18a71f87d8d994e143ab66126 past-papers/<session>/<paper>/assets (150dpi grayscale, visually adjudicated, text-label-inclusive clips) and hotlinked into part problemMd fields after referencing lines (50 embed instances across 19 rules, per-part repeats per pilot law; 2023-01-01 q19 embeds its existing ARTWORK-2 asset pinned 7576c78f — the asset was committed in ARTWORK-2 but its embed soft-skipped); skips disclosed per pilot law: 2021-01-02 q6 three empty number lines + q9/q11 empty plotting grids, 2021-01-02R q3/q7 empty plotting grids — empty working surfaces, Tier-B candidates, tables likewise; 4MB1 artwork coverage now 65/65 sets; structure law 65/1270/2412/6500 unchanged, math-segment law unchanged, single-line compact JSON law kept")
assert 'note' in manifest, 'manifest note field missing'
assert 'UIUX-ARTWORK-3' not in manifest['note'], 'note already contains ARTWORK-3'
manifest['note'] = manifest['note'] + ' || ' + note
mout = json.dumps(manifest, ensure_ascii=False, separators=(',', ':'))
assert '\n' not in mout, 'manifest single-line law broken'

open(BPATH, 'w', newline='').write(out)
open(MPATH, 'w', newline='').write(mout)
print('WROTE bundle + manifest')
for r in report:
    print('  rule:', r)

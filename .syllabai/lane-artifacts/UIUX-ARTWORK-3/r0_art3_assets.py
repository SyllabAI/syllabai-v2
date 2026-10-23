#!/usr/bin/env python3
"""UIUX-ARTWORK-3 — render FINAL assets at visually-adjudicated rects (150dpi grayscale).
Outputs to resources-staging dir mirroring past-papers/<session>/<paper>/assets/."""
import os, json
import fitz

QPS = '/home/z/my-project/scripts/uiux-mathsb/qps'
STAGE = '/home/z/my-project/scripts/artwork-scale/resources-staging/SME-ExamQuestion/igcse-maths-b-16/past-papers'
os.makedirs(STAGE, exist_ok=True)

# (pdf, session, paper, [(file, question, page, rect, desc)])
PLAN = {
  '2023-01/01': ('2023-01__4MB1-01__qp.pdf', '2023-01', '01', [
    ('002-q9-quadrilaterals-a-and-b-on-a-grid.png', 9, 5, [65, 76, 530, 355], 'transformation grid, quadrilaterals A and B, axes -7..6 / 1..7'),
    ('003-q12-circle-abcd-tangent-edf-75-degrees.png', 12, 7, [178, 76, 400, 252], 'circle with inscribed quadrilateral ABCD, tangent EDF, angle BDF 75 degrees'),
    ('004-q14-pentagon-abcde-sides-fe-eg-gh.png', 14, 9, [148, 72, 340, 306], 'regular pentagon ABCDE with sides FE EG GH of n-sided polygon, angle 69 degrees at E'),
    ('005-q15-sphere-radius-r.png', 15, 10, [66, 112, 216, 262], 'sphere of radius r cm'),
    ('006-q15-cone-radius-r-height-20cm.png', 15, 10, [228, 88, 426, 272], 'right circular cone, base radius r cm, vertical height 20 cm'),
    ('007-q18-mathematically-similar-solids-a-and-b.png', 18, 13, [112, 74, 370, 258], 'two mathematically similar vase-shaped solids A and B'),
    ('008-q21-speed-time-graph-cyclist.png', 21, 16, [95, 82, 410, 248], 'speed-time graph trapezium, u at t=0, 10 m/s plateau 4..6 s, ends 8 s'),
    ('009-q22-bar-chart-music-downloads.png', 22, 17, [112, 90, 480, 350], 'bar chart, number of pieces of music downloaded by 30 students'),
    ('010-q26-pyramid-abcd-triangular-base.png', 26, 21, [88, 72, 420, 344], 'pyramid ABCD horizontal triangular base, DC 5√3, DB 10√3, angle BDC 60 degrees'),
  ]),
  '2021-01/02': ('2021-01__4MB1-02__qp.pdf', '2021-01', '02', [
    ('001-q3-circle-qrst-50mm-40mm-60mm.png', 3, 5, [216, 60, 380, 242], 'circle QRST centre O, chords 50mm 40mm 60mm (Figure 1)'),
    ('002-q4-probability-tree-alan-games.png', 4, 7, [100, 226, 495, 480], 'incomplete probability tree, Day / Alan wins / Alan does not win, Sunday / Not Sunday'),
    ('003-q5-venn-diagram-abc.png', 5, 9, [140, 205, 455, 478], 'three-set Venn diagram A B C in universal set box'),
    ('004-q8-kite-abcd-6cm-8cm.png', 8, 15, [158, 60, 436, 288], 'kite ABCD, AB 6cm BC 8cm, right angle at B, diagonals meeting at E (Figure 2)'),
    ('005-q10-triangle-oab-midpoints.png', 10, 21, [156, 60, 440, 271], 'triangle OAB, M midpoint OA, N midpoint AB, P on BM (Figure 3)'),
  ]),
  '2021-01/02R': ('2021-01__4MB1-02R__qp.pdf', '2021-01', '02R', [
    ('001-q1-venn-diagram-abc.png', 1, 2, [118, 80, 478, 396], 'three-set Venn diagram A B C in universal set box'),
    ('002-q5-circle-abcde-9-2cm-10-6cm.png', 5, 15, [205, 60, 388, 270], 'circle ABCDE with chords 9.2cm 10.6cm, angles 65 and 34 degrees (Figure 1)'),
    ('003-q8-pentagonal-prism-abcdefghjk.png', 8, 27, [172, 60, 422, 296], 'right pentagonal prism ABCDEFGHJK, x cm 3x cm 2x cm (x-2) cm (Figure 2)'),
    ('004-q10-rectangle-oabc-vectors.png', 10, 33, [210, 60, 384, 282], 'rectangle OABC, F midpoint CB, D on AB, vectors a and c (Figure 3)'),
    ('005-q11-six-circles-in-rectangle.png', 11, 37, [180, 64, 415, 305], 'six identical circles in rectangle, 3-2-1 pattern (Figure 4)'),
  ]),
}

SRC = "official Edexcel 4MB1 QP PDF of record (PMT-hosted via syllabai-pastpapers mirror) — 150dpi grayscale vector-render crops, PyMuPDF clip rects, visually adjudicated (census + contact-sheet review + targeted probe rounds)"
LANE = "UIUX-ARTWORK-3 (r0 residual lane completing the 64-paper scale order, operator trace 1a1680c3f9d1f07d, continuation 1a168b585e947695)"

index_report = {}
for pdir, (pdf, sess, paper, figs) in PLAN.items():
    doc = fitz.open(f'{QPS}/{pdf}')
    adir = f'{STAGE}/{sess}/{paper}/assets'
    os.makedirs(adir, exist_ok=True)
    entries = []
    for fname, q, pno, rect, desc in figs:
        x0, y0, x1, y1 = rect
        clip = fitz.Rect(max(0, x0-4), max(0, y0-4), min(doc[pno].rect.x1, x1+4), min(doc[pno].rect.y1, y1+4))
        pix = doc[pno].get_pixmap(dpi=150, clip=clip, colorspace=fitz.csGRAY)
        pix.save(f'{adir}/{fname}')
        entries.append({'file': fname, 'question': q, 'page': pno, 'rect': rect, 'desc': desc, 'px': [pix.width, pix.height], 'bytes': os.path.getsize(f'{adir}/{fname}')})
    # assets-index.json merges with existing if present (2023-01/01 has q19 entry of record)
    idx_path = f'{STAGE}/{sess}/{paper}/assets-index.json'
    existing = {'assets': []}
    if sess == '2023-01' and paper == '01':
        existing = {"lane": "UIUX-ARTWORK-2 (r0 scale run, operator-authorized, trace 1a1680c3f9d1f07d)",
                    "paper": "4MB1/01", "session": "2023-01", "source": SRC,
                    "assets": [{"file": "001-q19-quadrilateral-abcd-with-x-f-scale-1cm-2m.png", "question": 19, "page": 14, "rect": [100, 100, 475, 435], "desc": "quadrilateral ABCD with X F, scale 1cm=2m loci"}]}
    merged = {"lane": LANE, "paper": f"4MB1/{paper}", "session": sess, "source": SRC, "assets": existing.get('assets', []) + [{k: e[k] for k in ('file', 'question', 'page', 'rect', 'desc')} for e in entries]}
    with open(idx_path, 'w') as f:
        json.dump(merged, f, indent=1, ensure_ascii=False)
        f.write('\n')
    index_report[pdir] = entries
    print(f"{pdir}: {len(entries)} assets -> {adir}")

json.dump(index_report, open('/home/z/my-project/scripts/artwork-scale/resources-staging/art3-index-report.json', 'w'), indent=1)
print('staging complete')

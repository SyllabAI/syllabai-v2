#!/usr/bin/env python3
"""TIER-B resources staging: copy 12 re-crops as new numbered assets + append
assets-index entries (old entries preserved verbatim = provenance)."""
import json, os, shutil, hashlib

WS = '/home/z/my-project/ws/syllabai-resources-art3/SME-ExamQuestion/igcse-maths-b-16/past-papers'
SRC = '/home/z/my-project/scripts/artwork-scale/tierb_recrops'

STAGE = [
    # (src file, paper dir, new desc, question)
    ('fin_A_q24_2019-06_01R.png',   '2019-06/01R', 'scale drawing: two posts A and B with north arrows, scale 1cm=50m', 24),
    ('fin_R01_q17_2018-06_01R.png', '2018-06/01R', 'circle centre O, A and B on circumference, tangent CBD at B, angle ABC 38 degrees', 17),
    ('fin_R05_q17_2020-06_01.png',  '2020-06/01',  'histogram: ages of people on a plane, frequency density vs age (years)', 17),
    ('fin_R06_q24_2020-06_01.png',  '2020-06/01',  'quadrilateral ABCD for locus construction', 24),
    ('fin_R08_q17_2020-11_01.png',  '2020-11/01',  'histogram: ages of people on a plane, frequency density vs age (years)', 17),
    ('fin_R11_q7_2021-01_01.png',   '2021-01/01',  'hexagon ABCDEF right angles, sides 8cm 14cm 9cm 12cm', 7),
    ('fin_G_q4_2021-06_02.png',     '2021-06/02',  'Figure 1: quadrilateral OACB with vectors 2a and 5b, P on OC', 4),
    ('fin_C_q9_2022-06_02R.png',    '2022-06/02R', 'Figure 3: three points A B C on circle centre O, D on AC, E on BD extended', 9),
    ('fin_R17_q4_2023-11_01.png',   '2023-11/01',  'angle FGH for ruler-and-compasses bisector construction', 4),
    ('fin_R18_q16_2023-11_01.png',  '2023-11/01',  'hexagon ABCDEF with sides (2x+1)cm (3x+4)cm 2x cm 5x cm, right angles', 16),
    ('fin_R28_q16_2024-11_01.png',  '2024-11/01',  'parallel lines AB and DE, isosceles triangle BGE, angles 113 and 94 degrees', 16),
    ('fin_R23_q2_2025-06_02.png',   '2025-06/02',  'trapezium PQRS scale drawing of garden, scale 1cm represents 2 metres', 2),
]

LANE = 'UIUX-TIER-B (r0 re-transcription lane, operator trace 1a16943085ba99ad) re-crops'
placed = []
for src, pap, desc, qn in STAGE:
    pdir = os.path.join(WS, pap)
    adir = os.path.join(pdir, 'assets')
    existing = sorted(f for f in os.listdir(adir) if f.endswith('.png'))
    nxt = len(existing) + 1
    # derive short slug from desc
    slug = desc.split(':')[0].lower().replace(' ', '-').replace(',', '')[:44]
    newname = f"{nxt:03d}-q{qn}-{slug}.png"
    shutil.copyfile(os.path.join(SRC, src), os.path.join(adir, newname))
    # page/rect: re-crop provenance (page numbers from the QP probe rounds)
    page_map = {'2019-06/01R': 17, '2018-06/01R': 12, '2020-06/01': 12, '2020-11/01': 12,
                '2021-01/01': 5, '2021-06/02': 8, '2022-06/02R': 22, '2023-11/01': 3,
                '2024-11/01': 11, '2025-06/02': 3}
    idx_path = os.path.join(pdir, 'assets-index.json')
    ai = json.load(open(idx_path))
    if ai.get('lane', '').startswith('UIUX-TIER-B'):
        ai['assets'].append({'file': newname, 'question': qn, 'page': page_map[pap], 'desc': desc, 'recrop': True})
    else:
        # minimal-diff append: entries only, original top-level provenance untouched
        ai.setdefault('assets', []).append({'file': newname, 'question': qn, 'page': page_map[pap], 'desc': desc, 'recrop': True})
        ai['tierb_recrops'] = LANE
    json.dump(ai, open(idx_path, 'w'), indent=1, ensure_ascii=False)
    placed.append((pap, newname, qn))

for p in placed:
    print(p)

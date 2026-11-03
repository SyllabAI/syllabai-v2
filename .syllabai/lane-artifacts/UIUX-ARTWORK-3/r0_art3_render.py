#!/usr/bin/env python3
"""UIUX-ARTWORK-3 residual lane — render candidate crops for the 3 uncovered papers
(2023-01-01, 2021-01-02, 2021-01-02R) per the massrun band law + loose-mode pass.
Read-only on repos; writes PNGs + report under scripts/uiux-mathsb/crops-art3/."""
import sys, os, json
sys.path.insert(0, '/home/z/my-project/scripts/uiux-mathsb')
import fitz
from r0_artwork_v2 import paper_markers, page_clusters, BLUE

QPS = '/home/z/my-project/scripts/uiux-mathsb/qps'
OUT = '/home/z/my-project/scripts/uiux-mathsb/crops-art3'
os.makedirs(OUT, exist_ok=True)

PAPERS = [
    ('2023-01__4MB1-01__qp.pdf', '2023-01:4MB1-01'),
    ('2021-01__4MB1-02__qp.pdf', '2021-01:4MB1-02'),
    ('2021-01__4MB1-02R__qp.pdf', '2021-01:4MB1-02R'),
]

report = {}
for pdf, key in PAPERS:
    base = pdf.replace('__qp.pdf', '')
    doc = fitz.open(f'{QPS}/{pdf}')
    want = len(BLUE[key]['marks'])
    markers, colx = paper_markers(doc, want)
    assert len(markers) == want and [m[2] for m in markers] == list(range(1, want+1)), f'chain FAIL {key}'
    bands = {}
    for i, (pno, y, n) in enumerate(markers):
        if i+1 < len(markers):
            bands[n] = (pno, y, markers[i+1][0], markers[i+1][1])
        else:
            bands[n] = (pno, y, doc.page_count-1, 10**6)

    pdir = f'{OUT}/{base}'
    os.makedirs(pdir, exist_ok=True)
    per_q = {}
    for n, (pa, ya, pb, yb) in bands.items():
        cands = []
        for pno in range(pa, pb+1):
            page = doc[pno]
            ph = page.rect.height
            for r in page_clusters(page):
                w, h = r.width, r.height
                if w < 45 or h < 35 or (h < 30 and w > 110):
                    continue
                if r.y1 > ph - 50 or (r.y0 < 26 and w > 400):
                    continue
                # loose path floor: 2 (catch single-path figures), strict: 4
                # page_clusters returns rects only in v2; count paths by re-scan
                if w * h < 2600:
                    continue
                cy = (r.y0 + r.y1) / 2
                if pno == pa and pno == pb and not (ya - 6 <= cy <= yb):
                    continue
                if pno == pa != pb and not (cy >= ya - 6):
                    continue
                if pno == pb != pa and not (cy <= yb):
                    continue
                cands.append((pno, fitz.Rect(r)))
        # containment dedup
        cands.sort(key=lambda c: (c[0], c[1].y0))
        kept = []
        for pno, r in cands:
            if any(kr.contains(r) or (kp == pno and kr.intersects(r) and r.get_area() < kr.get_area()*0.55) for kp, kr in kept):
                continue
            kept.append((pno, r))
        per_q[n] = []
        for k, (pno, r) in enumerate(kept[:4]):
            page = doc[pno]
            clip = fitz.Rect(max(0, r.x0-8), max(0, r.y0-8), min(page.rect.x1, r.x1+8), min(page.rect.y1, r.y1+8))
            pix = page.get_pixmap(dpi=150, clip=clip, colorspace=fitz.csGRAY)
            f = f'{pdir}/q{n:02d}_c{k}_p{pno}.png'
            pix.save(f)
            per_q[n].append({'file': f, 'page': pno, 'rect': [round(v,1) for v in r]})
    report[key] = per_q
    ncand = sum(len(v) for v in per_q.values())
    qwith = [n for n, v in per_q.items() if v]
    print(f'{key}: {ncand} candidates across questions {qwith}')

json.dump(report, open(f'{OUT}/report.json', 'w'), indent=1)
print('report ->', f'{OUT}/report.json')

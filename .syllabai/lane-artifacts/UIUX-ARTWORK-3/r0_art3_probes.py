#!/usr/bin/env python3
"""UIUX-ARTWORK-3 probe render: wide crops (labels-inclusive) for adjudication.
Rects = cluster unions +30pt margin; user reviews, then final rects get locked."""
import sys, os, json
sys.path.insert(0, '/home/z/my-project/scripts/uiux-mathsb')
import fitz
from r0_artwork_v2 import BLUE

QPS = '/home/z/my-project/scripts/uiux-mathsb/qps'
OUT = '/home/z/my-project/scripts/uiux-mathsb/crops-art3/probes'
os.makedirs(OUT, exist_ok=True)

# provisional figure rects (from census unions / bar-chart probe)
FIGS = {
  '2023-01__4MB1-01': [
    ('q09-grid',   5, [75.4, 84.0, 501.0, 301.3]),   # union of 3 clusters (transformation grid)
    ('q12-circle', 7, [216.2, 87.5, 360.1, 231.4]),
    ('q14-pentagon', 9, [170.0, 84.8, 322.9, 233.7]),
    ('q15-cone',   10, [241.4, 101.0, 365.8, 258.6]),
    ('q15-sphere', 10, [78.9, 124.7, 203.4, 249.2]),
    ('q18-solids', 13, [121.5, 83.4, 359.6, 230.4]),
    ('q21-speedtime', 16, [182.1, 118.1, 395.6, 206.1]),
    ('q22-barchart', 17, [150.0, 80.0, 510.0, 345.0]),  # manual: bars + axes + labels
    ('q26-pyramid', 21, [110.0, 98.3, 366.7, 319.2]),
  ],
  '2021-01__4MB1-02': [
    ('q03-circle', 5, [237.7, 77.5, 368.6, 208.4]),
    ('q04-tree',   7, [110.0, 268.1, 393.1, 474.2]),   # union of 3 branch clusters
    ('q05-venn',   9, [148.5, 212.0, 446.8, 471.5]),
    ('q08-kite',   15, [179.7, 85.2, 414.1, 242.3]),
    ('q10-vectors', 21, [177.5, 84.7, 420.4, 225.0]),
  ],
  '2021-01__4MB1-02R': [
    ('q01-venn',   2, [125.4, 87.3, 469.9, 387.8]),
    ('q05-circle', 15, [226.7, 84.6, 370.0, 227.8]),
    ('q08-prism',  27, [209.7, 84.3, 387.6, 237.4]),   # union of 3 clusters
    ('q10-rectvec', 33, [231.8, 85.2, 364.9, 234.3]),
    ('q11-circles', 37, [188.5, 73.3, 406.8, 272.3]),
  ],
}

M = 30  # probe margin
report = {}
for pdf, figs in FIGS.items():
    doc = fitz.open(f'{QPS}/{pdf}__qp.pdf')
    for name, pno, (x0, y0, x1, y1) in figs:
        page = doc[pno]
        clip = fitz.Rect(max(0, x0-M), max(0, y0-M), min(page.rect.x1, x1+M), min(page.rect.y1, y1+M))
        pix = page.get_pixmap(dpi=150, clip=clip, colorspace=fitz.csGRAY)
        f = f'{OUT}/{pdf}__{name}.png'
        pix.save(f)
        report.setdefault(pdf, []).append({'name': name, 'page': pno, 'probe_clip': [round(v,1) for v in clip], 'file': f})
        print(f'{pdf} {name}: clip={clip} -> {pix.width}x{pix.height}px')

json.dump(report, open(f'{OUT}/probes.json', 'w'), indent=1)

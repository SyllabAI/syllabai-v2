#!/usr/bin/env python3
"""run-005: render the target QP pages as page images for human eyes-on reads."""
import fitz, os

BASE = 'past-papers/pearson-edexcel/international-gcse/physics/4ph1/past-papers'
OUT = '/tmp/render'
os.makedirs(OUT, exist_ok=True)

pages = [
    ('2022-06/4PH1-1P/qp.pdf', 13, 'pp-2022-06-1p-p13'),
    ('2023-06/4PH1-1P/qp.pdf', 22, 'pp-2023-06-1p-p22'),
    ('2023-06/4PH1-1P/qp.pdf', 23, 'pp-2023-06-1p-p23'),
    ('2026-06/4PH1-1P/qp.pdf', 18, 'pp-2026-06-1p-p18'),
    ('2025-06/4PH1-2PR/qp.pdf', 14, 'pp-2025-06-2pr-p14'),
]
for pdf, pno, name in pages:
    doc = fitz.open(f'{BASE}/{pdf}')
    pg = doc[pno - 1]
    pix = pg.get_pixmap(matrix=fitz.Matrix(2.0, 2.0))  # ~144 dpi
    path = f'{OUT}/{name}.png'
    pix.save(path)
    print(name, pix.width, 'x', pix.height, os.path.getsize(path), 'bytes')

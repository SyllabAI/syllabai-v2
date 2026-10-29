#!/usr/bin/env python3
r"""run-020 tranche-1: page-location of the 5 target parts in the fetched QP/MS PDFs."""
import json, subprocess, os

PP = '/home/z/my-project/scratch/pp_4mb1_t1'
F = json.load(open('/home/z/my-project/repos/syllabai-v2/.syllabai/lane-artifacts/T-OEQ-MATHSB-SERVE-1/run-020/t1_fields.json'))

# needles chosen from distinctive strings in the dumped fields
PDFMAP = {
    '2023-06-02-qp': ['A and B are two points'],
    '2023-06-02-ms': ['using Pythagoras'],
    '2021-06-02-qp': ['Calculate the length of AD'],
    '2021-06-02-ms': ['cosine rule'],
    '2022-06-01R-qp': ['cuboid ABCDEFGH'],
    '2022-06-01R-ms': ['need not be simplified'],
    '2026-06-01R-qp': ['Calculate the length, in cm to 2 significant figures, of BC'],
    '2026-06-01R-ms': ['radians'],
    '2025-06-02-qp': ['solid right pyramid'],
    '2025-06-02-ms': ['seeing any of these angles'],
}

for pdf, needles in PDFMAP.items():
    path = f'{PP}/{pdf}.pdf'
    if not os.path.exists(path):
        print(f'!! missing {path}')
        continue
    txt = subprocess.run(['pdftotext', '-layout', path, '-'], capture_output=True, text=True).stdout
    pages = txt.split('\f')
    print(f'{pdf}: {len(pages)-1} pages')
    for needle in needles:
        hits = [i + 1 for i, pg in enumerate(pages) if needle.lower() in pg.lower()]
        print(f'   "{needle[:50]}" -> pages {hits[:6]}')

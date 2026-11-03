#!/usr/bin/env python3
"""run-005: span-geometry corroboration for the eyes-on verdicts.
Dumps PyMuPDF spans (text, size, baseline origin) for the equation regions
the human read adjudicated. Output: /tmp/run005_spans.json
"""
import fitz, json

BASE = 'past-papers/pearson-edexcel/international-gcse/physics/4ph1/past-papers'

def spans_in_band(pdf, pno, y0, y1):
    doc = fitz.open(f'{BASE}/{pdf}')
    pg = doc[pno - 1]
    d = pg.get_text('dict')
    out = []
    for blk in d['blocks']:
        if blk.get('type') != 0:
            continue
        for line in blk['lines']:
            for sp in line['spans']:
                x0, sy0, x1, sy1 = sp['bbox']
                if y0 <= sy0 <= y1:
                    out.append({
                        'text': sp['text'],
                        'size': round(sp['size'], 2),
                        'origin_y': round(sp['origin'][1], 2),
                        'origin_x': round(sp['origin'][0], 1),
                    })
    return out

ev = {}

# 2022-06 1P p13: display equation band (y 320-345) + prose parentheticals (y 60-115)
ev['2022-06-1p-p13-equation'] = spans_in_band('2022-06/4PH1-1P/qp.pdf', 13, 313, 350)
ev['2022-06-1p-p13-prose-parentheticals'] = spans_in_band('2022-06/4PH1-1P/qp.pdf', 13, 60, 115)

# 2026-06 1P p18: two equation bands
ev['2026-06-1p-p18-eq1'] = spans_in_band('2026-06/4PH1-1P/qp.pdf', 18, 333, 365)
ev['2026-06-1p-p18-eq2'] = spans_in_band('2026-06/4PH1-1P/qp.pdf', 18, 401, 432)

# 2025-06 2PR p14: formula band (y 495-532) + prose/diagram h-instances
ev['2025-06-2pr-p14-formula'] = spans_in_band('2025-06/4PH1-2PR/qp.pdf', 14, 495, 532)
ev['2025-06-2pr-p14-prose-h'] = spans_in_band('2025-06/4PH1-2PR/qp.pdf', 14, 118, 178)

# 2023-06 1P p22: formula + density band (page-flat confirmation)
ev['2023-06-1p-p22-formula'] = spans_in_band('2023-06/4PH1-1P/qp.pdf', 22, 385, 500)

print(json.dumps(ev, indent=1, ensure_ascii=False))
with open('/tmp/run005_spans.json', 'w') as f:
    json.dump(ev, f, indent=1, ensure_ascii=False)

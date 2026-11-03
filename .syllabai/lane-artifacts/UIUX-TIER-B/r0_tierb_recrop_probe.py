#!/usr/bin/env python3
"""TIER-B re-crop probe: locate + render candidate crops for the figures needing
re-cuts. 150dpi grayscale, word-extent-aware clip rects (ARTWORK-3 law).
Targets: QP path, page hint (search terms), label words that MUST be inside."""
import fitz, os, json

QPS = '/home/z/my-project/scripts/uiux-mathsb/qps'
OUT = '/home/z/my-project/scripts/artwork-scale/tierb_recrops'
os.makedirs(OUT, exist_ok=True)

# target: id, qp file, search words (page locator), required labels (clip inclusion)
TARGETS = [
    dict(id='A_2019-06_01R_q24', qp='2019-06__4MB1-01R__qp.pdf',
         page_words=['scale drawing'], req=['A', 'B', 'N', 'Scale']),
    dict(id='C_2022-06_02R_q9', qp='2022-06__4MB1-02R__qp.pdf',
         page_words=['Figure 3'], req=['O', 'A', 'B', 'D', 'E']),
    dict(id='G_2021-06_02_q4', qp='2021-06__4MB1-02__qp.pdf',
         page_words=['Figure 1'], req=['O', 'A', 'B', 'C', '5b']),
    dict(id='R01_2018-06_01R_q17', qp='2018-06__4MB1-01R__qp.pdf',
         page_words=['38'], req=['O', 'A', 'B', 'C', 'D', '38']),
    dict(id='R05_2020-06_01_q17', qp='2020-06__4MB1-01__qp.pdf',
         page_words=['Age (years)'], req=['Age', 'Frequency']),
    dict(id='R08_2020-11_01_q17', qp='2020-11__4MB1-01__qp.pdf',
         page_words=['Age (years)'], req=['Age', 'Frequency']),
    dict(id='R06_2020-06_01_q24', qp='2020-06__4MB1-01__qp.pdf',
         page_words=['quadrilateral'], req=['A', 'B', 'C', 'D']),
    dict(id='R11_2021-01_01_q7', qp='2021-01__4MB1-01__qp.pdf',
         page_words=['hexagon'], req=['A', 'B', 'C', 'D', 'E', 'F', '8', '9', '12', '14']),
    dict(id='R17_2023-11_01_q4', qp='2023-11__4MB1-01__qp.pdf',
         page_words=['bisector of angle FGH'], req=['F', 'G', 'H']),
    dict(id='R18_2023-11_01_q16', qp='2023-11__4MB1-01__qp.pdf',
         page_words=['hexagon ABCDEF'], req=['A', 'B', 'C', 'D', 'E', 'F']),
    dict(id='R23_2025-06_02_q2', qp='2025-06__4MB1-02__qp.pdf',
         page_words=['Abdul'], req=['P', 'Q', 'R', 'S', 'Scale']),
    dict(id='R28_2024-11_01_q16', qp='2024-11__4MB1-01__qp.pdf',
         page_words=['113'], req=['A', 'B', 'D', 'E', 'G', '113', '94']),
]

report = []
for t in TARGETS:
    doc = fitz.open(os.path.join(QPS, t['qp']))
    pages = []
    for pno in range(len(doc)):
        text = doc[pno].get_text()
        if all(w.lower() in text.lower() for w in t['page_words']):
            pages.append(pno)
    entry = dict(id=t['id'], pages=pages)
    if pages:
        page = doc[pages[0]]
        words = page.get_text('words')  # x0,y0,x1,y1,word,block,line,word_no
        # locate all required labels on that page
        pos = {}
        for w in words:
            x0, y0, x1, y1, txt = w[0], w[1], w[2], w[3], w[4]
            for req in t['req']:
                if txt == req or (req.isdigit() and req in txt and len(txt) <= 6):
                    pos.setdefault(req, []).append((x0, y0, x1, y1))
        entry['label_hits'] = {k: [round(v[0][0]), round(v[0][1])] for k, v in pos.items()}
        entry['missing'] = [r for r in t['req'] if r not in pos]
        # provisional clip: union of label rects + padding
        if pos:
            xs0 = min(v[0] for r in pos for v in pos[r]); ys0 = min(v[1] for r in pos for v in pos[r])
            xs1 = max(v[2] for r in pos for v in pos[r]); ys1 = max(v[3] for r in pos for v in pos[r])
            entry['provisional_rect_pt'] = [round(xs0 - 18), round(ys0 - 18), round(xs1 + 18), round(ys1 + 18)]
            mat = fitz.Matrix(150 / 72, 150 / 72)
            clip = fitz.Rect(max(0, xs0 - 18), max(0, ys0 - 18), min(page.rect.x1, xs1 + 18), min(page.rect.y1, ys1 + 18))
            pix = page.get_pixmap(matrix=mat, clip=clip, colorspace=fitz.csGRAY)
            fp = os.path.join(OUT, f"{t['id']}_p{pages[0]+1}.png")
            pix.save(fp)
            entry['probe'] = fp
    report.append(entry)
    doc.close()

print(json.dumps(report, indent=1))

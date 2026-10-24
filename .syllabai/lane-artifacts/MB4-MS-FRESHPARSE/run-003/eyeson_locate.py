#!/usr/bin/env python3
"""run-003 eyes-on leg 1 — locate Q8(d) in the 2021-01 4MB1/02 MS of record,
dump the word-level geometry (x0 = code column evidence) and render high-zoom
crops for visual adjudication of the 'M1 for showing 1 pair of angles...' line."""
import fitz, sys

PDF = "/home/z/my-project/scripts/pp-4mb1/2021-01-4MB1-02/ms.pdf"
OUT = "/home/z/my-project/scripts/pp-4mb1/2021-01-4MB1-02"

doc = fitz.open(PDF)
print(f"pages: {len(doc)}")

# locate pages mentioning the Q8(d) anchors
anchors = ["1 pair of angles", "pairs of corresponding sides", "dep on M2", "Method 2"]
hits = {}
for pno in range(len(doc)):
    text = doc[pno].get_text("text")
    for a in anchors:
        if a in text:
            hits.setdefault(a, []).append(pno)
for a, pages in hits.items():
    print(f"anchor {a!r}: pages {[p+1 for p in pages]}")

# Q8 boundaries: find '(d)' near 'M1 for showing 1 pair' and print the region
target = None
for pno in range(len(doc)):
    page = doc[pno]
    for r in page.search_for("M1 for showing 1 pair of angles"):
        target = (pno, r)
        print(f"\n'M1 for showing 1 pair of angles' on page {pno+1} at {r}")
if target:
    pno, r = target
    page = doc[pno]
    # dump all words with y within +/- 160pt of the anchor line
    words = page.get_text("words")  # x0,y0,x1,y1,word,block,line,word_no
    y_lo, y_hi = r.y0 - 170, r.y1 + 240
    sel = [w for w in words if y_lo <= w[1] <= y_hi]
    # group by line (y rounded)
    lines = {}
    for w in sel:
        key = round(w[1] / 3) * 3
        lines.setdefault(key, []).append(w)
    print("\n--- word geometry (grouped by line, x0 of first token) ---")
    for key in sorted(lines):
        ws = sorted(lines[key], key=lambda w: w[0])
        x0 = ws[0][0]
        txt = " ".join(w[4] for w in ws)
        print(f"y~{ws[0][1]:7.1f} x0={x0:6.1f} | {txt[:110]}")
    # high-zoom crops: (a) the M1 line + surroundings, (b) top of the (d) block
    clip = fitz.Rect(0, max(0, r.y0 - 200), page.rect.width, min(page.rect.height, r.y1 + 260))
    pix = page.get_pixmap(matrix=fitz.Matrix(3.2, 3.2), clip=clip)
    p1 = f"{OUT}/q8d-region-zoom.png"
    pix.save(p1)
    print(f"\ncrop saved: {p1} ({pix.width}x{pix.height})")

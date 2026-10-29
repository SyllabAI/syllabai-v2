#!/usr/bin/env python3
"""run-016 crops v2: measure grid rect from pdftotext -bbox tick labels.
Grid bbox = union of the outermost axis tick labels; pad for arrows/labels.
Renders at 200dpi for crispness (existing assets are ~150-200dpi class).
"""
import re, subprocess, os
from PIL import Image

PDFS = "/home/z/my-project/download/t-oeq-mathsb/run016/pdfs"
EV = "/home/z/my-project/download/t-oeq-mathsb/run016/evidence"
OUT = "/home/z/my-project/download/t-oeq-mathsb/run016/crops"
os.makedirs(OUT, exist_ok=True)

# (pdf, page, out_name, left_label, right_label, top_label, bottom_label, pad_pts(l,t,r,b))
JOBS = [
    ("2020-06_02", 21, "asset_8_d_grid.png",  ["\u20137", "\u2013 7"], ["7"], ["9"], ["\u20137"], (16, 12, 18, 4)),
    ("2020-11_02", 21, "asset_8_d_grid.png",  ["\u20137", "\u2013 7"], ["7"], ["9"], ["\u20137"], (16, 12, 18, 4)),
    ("2024-11_02", 33, "asset_11_e_grid.png", ["\u20135"], ["7"], ["11"], ["\u20139"], (16, 12, 18, 4)),
    ("2023-11_02", 17, "asset_8_d_grid.png",  ["\u20132"], ["5"], ["8"], ["\u20139"], (16, 12, 18, 4)),
]

DPI = 200

def bbox_words(pdf, page):
    xml = subprocess.run(["pdftotext", "-bbox", "-f", str(page), "-l", str(page), pdf, "-"],
                         capture_output=True, text=True).stdout
    words = []
    for m in re.finditer(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)</word>', xml):
        x0, y0, x1, y1, w = float(m.group(1)), float(m.group(2)), float(m.group(3)), float(m.group(4)), m.group(5)
        words.append((w, x0, y0, x1, y1))
    return words

def norm_label(s):
    return s.replace("\u2212", "-").replace("\u2013", "-").replace("\u2014", "-").replace(" ", "")

for pdf, page, out, lefts, rights, tops, bots, pad in JOBS:
    words = bbox_words(f"{PDFS}/{pdf}.pdf", page)
    def find(cands, axis, lo, hi):
        # axis 'x': use x0 for left labels / x1 for right; 'y': y0 top / y1 bottom
        cand_n = {norm_label(c) for c in cands}
        best = None
        for w, x0, y0, x1, y1 in words:
            wn = norm_label(w)
            if wn not in cand_n:
                continue
            cy = (y0 + y1) / 2
            cx = (x0 + x1) / 2
            if axis == "x":
                if not (lo < cy < hi):
                    continue
                v = x0 if cands is lefts else x1
            else:
                if not (lo < cx < hi):
                    continue
                v = y0 if cands is tops else y1
            if best is None or (v < best if cands in (lefts, tops) else v > best):
                best = v
        return best
    pw = 595.0
    ph = 842.0
    L = find(lefts, "x", 100, 750)
    R = find(rights, "x", 100, 750)
    T = find(tops, "y", 0, 842)
    B = find(bots, "y", 0, 842)
    assert None not in (L, R, T, B), (pdf, L, R, T, B)
    pl, pt, pr, pb = pad
    box = (L - pl, T - pt, R + pr, B + pb)
    png = f"{EV}/measure_{pdf}_p{page}.png"
    subprocess.run(["pdftoppm", "-f", str(page), "-l", str(page), "-r", str(DPI), "-png", "-singlefile",
                    f"{PDFS}/{pdf}.pdf", png[:-4]], check=True)
    im = Image.open(png)
    sx = im.width / pw
    sy = im.height / ph
    px = (int(box[0] * sx), int(box[1] * sy), int(box[2] * sx), int(box[3] * sy))
    crop = im.crop(px).convert("RGB")
    dest = f"{OUT}/{pdf}_{out}"
    crop.save(dest, optimize=True)
    print(f"{pdf} p{page} -> {pdf}_{out}: {crop.size[0]}x{crop.size[1]} {os.path.getsize(dest)}B  pdfbox={tuple(round(v,1) for v in box)}")

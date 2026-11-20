#!/usr/bin/env python3
"""
T-MG-MP-RECT-2 run-002 — the spot-check crops (sandbox-local, never committed).

Renders the region rects of record onto their QP pages (a red outline for
question-grain rects, blue for parts) for a representative sample, at a
readable resolution — the human-review instrument of the lane acceptance.
"""
import json
import sys
from pathlib import Path

import fitz

BASE = Path("/tmp/rect2-slice")
OUT = BASE / "crops"
OUT.mkdir(exist_ok=True)

SAMPLES = [
    "gcse-maths-2025-june-1ma1-2f",          # the modern layout, F tier
    "gcse-edexcel-maths-2024-june-paper-2-calculator-1ma1-2h-47695e7fb8",  # the page-spanning law
    "gcse-edexcel-maths-2023-november-paper-1-non-calculator-1ma1-1f-840cf6049c",  # the oldest session
    "gcse-edexcel-maths-2024-november-paper-3-calculator-1ma1-3h-1fbda5a1f9",  # H tier, Nov
]


def slug_to_code(slug):
    import re
    m = re.search(r"(\d{4})-(june|november|sample).*?1ma1-(\d)([fh])", slug)
    year, session, num, tier = m.groups()
    return f"1MA1/{num}{tier.upper()}", {"june": "June", "november": "November"}[session] + " " + year


def main():
    for slug in SAMPLES:
        d = BASE / slug
        code, session = slug_to_code(slug)
        man = json.load(open(BASE / "out" / f"manifest-{slug}.json"))
        doc = fitz.open(d / "qp.pdf")
        # the first two pages that carry rects
        pages = sorted({r["page"] for r in man["rects"]})[:2]
        for p1 in pages:
            page = doc[p1 - 1]
            pw, ph = page.rect.width, page.rect.height
            pix = page.get_pixmap(dpi=100)
            img = fitz.Pixmap(pix)  # keep a copy
            for r in man["rects"]:
                if r["page"] != p1:
                    continue
                part = "." in r["regionKey"].split("-", 1)[1]
                color = (0.0, 0.3, 0.9) if part else (0.9, 0.1, 0.1)
                page.draw_rect(fitz.Rect(r["x"] * pw, r["y"] * ph,
                                         (r["x"] + r["width"]) * pw,
                                         (r["y"] + r["height"]) * ph),
                               color=color, width=0.7)
            name = f"{code.replace('/', '-')}-{session.replace(' ', '-')}-p{p1}.png"
            page.get_pixmap(dpi=100).save(OUT / name)
            print("crop:", name)
    print("done →", OUT)


if __name__ == "__main__":
    sys.exit(main())

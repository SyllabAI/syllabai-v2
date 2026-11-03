#!/usr/bin/env python3
"""run-016: create the 4 crop-required grid PNGs from the mirror QP pages.
Auto-trim to ink bounding box inside a hand-measured ROI, pad, save.
Crops are VIEWED by the agent before any push (eyes-on law).
"""
from PIL import Image
import os

EV = "/home/z/my-project/download/t-oeq-mathsb/run016/evidence"
OUT = "/home/z/my-project/download/t-oeq-mathsb/run016/crops"
os.makedirs(OUT, exist_ok=True)

# (src_render, out_name, roi(l,t,r,b))
JOBS = [
    (f"{EV}/offp_2020-06_02_8-d_p21.png",          "asset_8_d_grid__2020-06.png", (195, 165, 940, 1075)),
    (f"{EV}/offp_2020-11_02_8-d_p21.png",          "asset_8_d_grid__2020-11.png", (195, 165, 940, 1075)),
    (f"{EV}/offp_2024-11_02_11-e_p33_gridpage.png", "asset_11_e_grid__2024-11.png", (230, 180, 955, 1370)),
    (f"{EV}/offp_2023-11_02_8-d_p17_gridpage.png",  "asset_8_d_grid__2023-11.png", (350, 175, 830, 1135)),
]

for src, out, roi in JOBS:
    im = Image.open(src).convert("L")
    l, t, r, b = roi
    region = im.crop(roi)
    # ink bbox: pixels darker than 235
    mask = region.point(lambda p: 255 if p < 235 else 0)
    bbox = mask.getbbox()
    assert bbox, f"no ink in ROI for {out}"
    pad = 14
    l2 = max(0, bbox[0] - pad); t2 = max(0, bbox[1] - pad)
    r2 = min(region.width, bbox[2] + pad); b2 = min(region.height, bbox[3] + pad)
    crop = region.crop((l2, t2, r2, b2))
    # back to RGB for consistency with existing assets
    crop = crop.convert("RGB")
    dest = f"{OUT}/{out}"
    crop.save(dest, optimize=True)
    print(f"{out}: {crop.size[0]}x{crop.size[1]} {os.path.getsize(dest)}B (roi bbox {bbox})")
print("done — view crops next")

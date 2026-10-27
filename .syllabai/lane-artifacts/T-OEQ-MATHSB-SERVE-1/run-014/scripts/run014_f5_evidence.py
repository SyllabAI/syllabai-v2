#!/usr/bin/env python3
"""run-014 F5 evidence gatherer: locate + render MS/QP pages for each furniture lead."""
import os, subprocess, re, json

BASE = "https://raw.githubusercontent.com/SyllabAI/syllabai-pastpapers/main/past-papers/pearson-edexcel/international-gcse/mathematics-b/4mb1/past-papers"
OUT = "/home/z/my-project/download/t-oeq-mathsb/run014/evidence"
os.makedirs(OUT, exist_ok=True)

# (label, series, paper, kind, needles)
LEADS = [
    ("2021-06_02_ms_q1c", "2021-06", "4MB1-02", "ms", ["Total 5 marks", "2.59"]),
    ("2022-01_01_ms_q25", "2022-01", "4MB1-01", "ms", ["completes the square", "maximum of 5 marks"]),
    ("2023-06_02_ms_q3",  "2023-06", "4MB1-02", "ms", ["UBsin172", "Total 8 marks"]),
    ("2024-06_01_ms_q19", "2024-06", "4MB1-01", "ms", ["3.375", "Total 3 marks"]),
    ("2018-06_01_ms_q27", "2018-06", "4MB1-01", "ms", ["Sine rule", "27.8"]),
    ("2019-01_01_ms_q10", "2019-01", "4MB1-01", "ms", ["0.4 × 10", "4 × 10"]),
    ("2019-06_02_qp_p9",  "2019-06", "4MB1-02", "qp", ["The inverse of matrix", "spare grid"]),
]

manifest = {}
for label, series, paper, kind, needles in LEADS:
    pdf = f"{OUT}/{label}.pdf"
    if not os.path.exists(pdf):
        url = f"{BASE}/{series}/{paper}/{kind}.pdf"
        r = subprocess.run(["curl", "-s", "-o", pdf, "-w", "%{http_code}", url], capture_output=True, text=True)
        assert r.stdout.strip() == "200", f"{url} -> {r.stdout}"
    txt = pdf.replace(".pdf", ".txt")
    subprocess.run(["pdftotext", "-layout", pdf, txt], check=True)
    pages = open(txt).read().split("\f")
    hits = []
    for i, pg in enumerate(pages, 1):
        score = sum(1 for n in needles if n in pg)
        if score:
            hits.append((score, i))
    hits.sort(reverse=True)
    best = hits[0][1] if hits else None
    manifest[label] = {"pdf": pdf, "best_page": best, "hits": hits}
    if best:
        subprocess.run(["pdftoppm", "-f", str(best), "-l", str(best), "-r", "150", "-png", pdf, f"{OUT}/pg_{label}"], check=True)
    print(f"{label}: best page {best} (hits {hits})")
json.dump(manifest, open(f"{OUT}/f5_page_manifest.json", "w"), indent=1)

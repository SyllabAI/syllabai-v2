#!/usr/bin/env python3
"""run-005: fetch QP/MS PDFs (anonymous mirror) + render ANNEX QP pages + locate pages by text."""
import os, re, urllib.request, concurrent.futures as cf, fitz

BASE = ("https://raw.githubusercontent.com/SyllabAI/syllabai-pastpapers/main/"
        "past-papers/pearson-edexcel/international-gcse/mathematics-b/4mb1/past-papers")
OUT = os.path.expanduser("~/my-project/scripts/run005/pdf")
REN = os.path.expanduser("~/my-project/scripts/run005/render")
os.makedirs(OUT, exist_ok=True); os.makedirs(REN, exist_ok=True)

needed = {
 ("2025-11","02"), ("2019-01","01R"), ("2018-06","01"), ("2019-06","02"),
}
# also MS of every R4-A set (for zoom crops beyond committed pages)
r4a_slugs = """2019-06-4mb1-01 2021-01-4mb1-01 2021-01-4mb1-01r 2021-01-4mb1-02r 2021-06-4mb1-01
2021-06-4mb1-02 2021-11-4mb1-01 2022-01-4mb1-01 2022-01-4mb1-02r 2022-06-4mb1-01 2022-06-4mb1-02
2023-01-4mb1-01 2023-01-4mb1-01r 2023-01-4mb1-02r 2023-06-4mb1-01 2023-06-4mb1-02r 2023-11-4mb1-02
2024-06-4mb1-01 2024-06-4mb1-01r 2024-06-4mb1-02 2024-06-4mb1-02r 2024-11-4mb1-01 2025-06-4mb1-01
2025-06-4mb1-02 2025-06-4mb1-02r 2025-10-4mb1-01 2025-11-4mb1-02 2026-06-4mb1-01 2026-06-4mb1-01r
2026-06-4mb1-02r""".split()
for s in r4a_slugs:
    m = re.match(r"(\d{4}-\d{2})-4mb1-(\d{2}r?)", s)
    needed.add((m.group(1), m.group(2).upper()))

jobs = []
for sess, pap in sorted(needed):
    for doc in ("ms", "qp"):
        dest = os.path.join(OUT, f"{sess}-4MB1-{pap}-{doc}.pdf")
        if os.path.isfile(dest) and os.path.getsize(dest) > 10000:
            continue
        jobs.append((f"{BASE}/{sess}/4MB1-{pap}/{doc}.pdf", dest))

def fetch(job):
    u, dest = job
    try:
        data = urllib.request.urlopen(u, timeout=60).read()
        with open(dest, "wb") as f: f.write(data)
        return (os.path.basename(dest), len(data))
    except Exception as e:
        return (os.path.basename(dest), f"FAIL {e}")

with cf.ThreadPoolExecutor(6) as ex:
    res = list(ex.map(fetch, jobs))
ok = [r for r in res if isinstance(r[1], int)]
bad = [r for r in res if not isinstance(r[1], int)]
print(f"fetched {len(ok)}/{len(res)} ({sum(r[1] for r in ok)//1024} KB); fails: {bad}")

# locate ANNEX pages via pdftotext-style search
def find_pages(pdf, needles):
    d = fitz.open(pdf); hits = {}
    for i in range(d.page_count):
        t = d[i].get_text()
        for n in needles:
            if n in t: hits.setdefault(n, []).append(i+1)
    d.close(); return hits

print("2025-11-02 QP q5/q8/q9/q11/q12 pages:",
      find_pages(f"{OUT}/2025-11-4MB1-02-qp.pdf",
                 ["Solve the simultaneous", "draw and label triangle C", "Complete the table of values",
                  "The function f has domain", "A bag contains n sweets"]))
print("2019-01-01R QP q13 page:", find_pages(f"{OUT}/2019-01-4MB1-01R-qp.pdf", ["605"]))
print("2018-06-01 QP q7 page:", find_pages(f"{OUT}/2018-06-4MB1-01-qp.pdf", ["1 3 2 4 5".replace(' ',''), "Calculate"]))

#!/usr/bin/env python3
"""UIUX-TIER-B run-004: anonymous fetch of QP/MS corpus from syllabai-pastpapers raw mirror.
No credentials. Papers = R4-A sets ∪ R4-B (2019-06 02R) ∪ R4-C named."""
import json, os, re, urllib.request, concurrent.futures as cf

BASE = ("https://raw.githubusercontent.com/SyllabAI/syllabai-pastpapers/main/"
        "past-papers/pearson-edexcel/international-gcse/mathematics-b/4mb1/past-papers")
OUT = os.path.expanduser("~/my-project/scripts/run-tierb-run004/pdf")
os.makedirs(OUT, exist_ok=True)

c = json.load(open(os.path.join(os.path.dirname(__file__), "r4a-census-001.json")))
needed = set()
for s in set(x[0] for x in c):
    m = re.match(r"(\d{4}-\d{2})-4mb1-(\d{2}r?)", s)
    needed.add((m.group(1), m.group(2).upper()))
needed |= {("2019-06", "02R"), ("2025-06", "01"), ("2025-11", "02"),
           ("2019-01", "01R"), ("2018-06", "01")}

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
        with open(dest, "wb") as f:
            f.write(data)
        return (dest.split("/")[-1], len(data))
    except Exception as e:
        return (dest.split("/")[-1], f"FAIL {e}")

with cf.ThreadPoolExecutor(6) as ex:
    res = list(ex.map(fetch, jobs))
ok = [r for r in res if isinstance(r[1], int)]
bad = [r for r in res if not isinstance(r[1], int)]
print(f"fetched {len(ok)} / {len(res)} | total {sum(r[1] for r in ok)//1024} KB")
for b in bad: print("FAIL:", b)

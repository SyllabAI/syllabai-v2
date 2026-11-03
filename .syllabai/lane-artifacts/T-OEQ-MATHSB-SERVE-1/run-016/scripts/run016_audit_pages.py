#!/usr/bin/env python3
"""run-016 Phase B2: audit page-finds — verify each top-1 render contains the
part's question (qnum at line start + distinctive tokens). Re-find misses with
full-stem tokens + fused-junk tokens (kite/triangle/parallelogram/curve nouns)."""
import json, os, re, subprocess

ROOT = "/home/z/my-project/repos/syllabai-v2"
PDFS = "/home/z/my-project/download/t-oeq-mathsb/run016/pdfs"
PNGS = "/home/z/my-project/download/t-oeq-mathsb/run016/evidence"
ART = f"{ROOT}/.syllabai/lane-artifacts/T-OEQ-MATHSB-SERVE-1/run-016"

cl = json.load(open(f"{ART}/sparegrid_classification.json"))
man = {m["pid"]: m for m in json.load(open(f"{ART}/page_manifest.json"))}
plane = json.load(open(f"{ROOT}/apps/hub/content/igcse-maths-b-16/official-papers.json"))
idx = {}
for s in plane:
    for q in s["questions"]:
        for p in q["parts"]:
            idx[p["id"]] = p

STOP = set("this that with from your grid need only spare must into each them than more less make sure shown diagram accurately figure value using find draw label drawn transformed under where these those which another single paper turn over page area write blank revision".split())

def qnum_of(pid):
    m = re.search(r"_(\d+)", pid.split("_")[-1])
    return m.group(1) if m else None

pages_cache = {}
def pages_of(key):
    if key not in pages_cache:
        txt = subprocess.run(["pdftotext", "-layout", f"{PDFS}/{key}.pdf", "-"],
                             capture_output=True, text=True).stdout
        pages_cache[key] = txt.split("\f")
    return pages_cache[key]

audit = []
for o in cl:
    pid = o["pid"]
    m = man[pid]
    key = m["paper"]
    pages = pages_of(key)
    pg1 = m["pageCandidates"][0] - 1
    ptxt = pages[pg1].lower() if pg1 < len(pages) else ""
    qnum = qnum_of(pid)
    # verification: qnum header on page + stem token overlap
    stem_toks = [t.lower() for t in re.findall(r"[A-Za-z]{5,}", o["stem"] or "") if t.lower() not in STOP]
    hit = sum(1 for t in set(stem_toks) if t in ptxt)
    qnum_ok = bool(qnum and re.search(rf"^\s*{qnum}\b", pages[pg1], re.M))
    verdict = "OK" if (hit >= 2 and qnum_ok) else "MISS"
    audit.append({"pid": pid, "page": pg1 + 1, "tokHits": hit, "toks": len(set(stem_toks)), "qnumOnPage": qnum_ok, "verdict": verdict})

misses = [a for a in audit if a["verdict"] == "MISS"]
print(f"audit: {len(audit)} parts, OK {len(audit)-len(misses)}, MISS {len(misses)}")
for a in misses:
    print(f"  MISS {a['pid']} page={a['page']} toks {a['tokHits']}/{a['toks']} qnum={a['qnumOnPage']}")

# re-find misses with full-stem + noun tokens
def refind(pid):
    o = next(x for x in cl if x["pid"] == pid)
    m = man[pid]
    key = m["paper"]
    pages = pages_of(key)
    p = idx[pid]
    full = (o["stem"] or "") + " " + p.get("problemMd", "")[:200]
    toks = [t.lower() for t in re.findall(r"[A-Za-z]{5,}", full) if t.lower() not in STOP]
    toks = list(dict.fromkeys(toks))[:14]
    qnum = qnum_of(pid)
    scored = []
    for i, ptxt in enumerate(pages):
        low = ptxt.lower()
        sc = sum(1 for t in set(toks) if t in low)
        if qnum and re.search(rf"^\s*{qnum}\b", ptxt, re.M):
            sc += 3
        scored.append((sc, i))
    scored.sort(key=lambda x: (-x[0], x[1]))
    return scored[:3]

for a in misses:
    pid = a["pid"]
    top = refind(pid)
    print(f"  refind {pid}: {[(s, i+1) for s, i in top]}")
    # re-render best
    s, i = top[0]
    png = f"{PNGS}/{pid}_p{i+1:02d}.png"
    key = man[pid]["paper"]
    subprocess.run(["pdftoppm", "-f", str(i + 1), "-l", str(i + 1), "-r", "150", "-png", "-singlefile",
                    f"{PDFS}/{key}.pdf", png[:-4]], check=True)
    a["page"] = i + 1
    a["refind"] = [(s, i + 1) for s, i in top]

json.dump(audit, open(f"{ART}/page_audit.json", "w"), indent=1)
print("\nwrote page_audit.json")

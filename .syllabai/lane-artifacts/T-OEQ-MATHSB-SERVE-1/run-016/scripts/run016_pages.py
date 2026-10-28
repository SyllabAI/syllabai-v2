#!/usr/bin/env python3
"""run-016 Phase B: fetch 29 mirror QP PDFs, page-find the 53 parts, render evidence.
Top-2 pages per part (question page + next page for the spare-grid layout).
"""
import json, os, re, subprocess, sys, urllib.request

ROOT = "/home/z/my-project/repos/syllabai-v2"
CL = f"{ROOT}/.syllabai/lane-artifacts/T-OEQ-MATHSB-SERVE-1/run-016/sparegrid_classification.json"
PDFS = "/home/z/my-project/download/t-oeq-mathsb/run016/pdfs"
PNGS = "/home/z/my-project/download/t-oeq-mathsb/run016/evidence"
os.makedirs(PDFS, exist_ok=True)
os.makedirs(PNGS, exist_ok=True)

MIRROR = "https://raw.githubusercontent.com/SyllabAI/syllabai-pastpapers/main/past-papers/pearson-edexcel/international-gcse/mathematics-b/4mb1/past-papers/{series}/4MB1-{paper}/qp.pdf"

cl = json.load(open(CL))
plane = json.load(open(f"{ROOT}/apps/hub/content/igcse-maths-b-16/official-papers.json"))
idx = {}
for s in plane:
    for q in s["questions"]:
        for p in q["parts"]:
            idx[p["id"]] = p

def paper_of(pid):
    parts = pid.split("_")
    return parts[1], parts[2].upper()  # series, 02R

def fetch(url, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 10000:
        return True
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "r7a-lane"})
            with urllib.request.urlopen(req, timeout=90) as r, open(dest, "wb") as f:
                f.write(r.read())
            return True
        except Exception as e:
            if attempt == 2:
                print(f"  FETCH FAIL {url}: {e}")
    return False

def page_texts(pdf):
    txt = subprocess.run(["pdftotext", "-layout", pdf, "-"], capture_output=True, text=True).stdout
    pages = txt.split("\f")
    return pages

def stem_tokens(stem, qnum):
    # rare-ish alnum tokens from the stem head; drop math/grid noise
    head = stem[:160]
    toks = re.findall(r"[A-Za-z]{4,}", head)
    stop = {"this", "that", "with", "from", "your", "grid", "need", "only", "spare", "must", "into", "each", "them", "than", "more", "less", "make", "sure", "shown", "diagram", "accurately", "figure"}
    toks = [t.lower() for t in toks if t.lower() not in stop]
    return toks[:10], str(qnum)

def qnum_of(pid):
    m = re.search(r"_(\d+)[a-z]*(?:-ii)?$", pid)
    return m.group(1) if m else None

jobs = {}
for o in cl:
    pid = o["pid"]
    series, paper = paper_of(pid)
    jobs.setdefault(f"{series}_{paper}", {"series": series, "paper": paper, "parts": []})["parts"].append(o)

manifest = []
for key in sorted(jobs):
    j = jobs[key]
    series, paper = j["series"], j["paper"]
    pdf = f"{PDFS}/{series}_{paper}.pdf"
    ok = fetch(MIRROR.format(series=series, paper=paper), pdf)
    if not ok:
        manifest.append({"paper": key, "error": "fetch-fail"})
        continue
    pages = page_texts(pdf)
    for o in j["parts"]:
        pid = o["pid"]
        pm = idx[pid].get("problemMd", "")
        toks, qnum = stem_tokens(o["stem"], qnum_of(pid))
        scores = []
        for i, ptxt in enumerate(pages):
            low = ptxt.lower()
            sc = sum(low.count(t) for t in toks)
            if qnum and re.search(rf"^{qnum}\b", ptxt.strip(), re.M):
                sc += 2
            if "spare grid" in low or "redraw" in low:
                sc += 1
            if sc > 0:
                scores.append((sc, i))
        scores.sort(key=lambda x: (-x[0], x[1]))
        top = [i for _, i in scores[:2]]
        if not top and scores:
            top = [scores[0][1]]
        renders = []
        for i in top[:2]:
            png = f"{PNGS}/{pid}_p{i+1:02d}.png"
            if not os.path.exists(png):
                subprocess.run(["pdftoppm", "-f", str(i + 1), "-l", str(i + 1), "-r", "150", "-png", "-singlefile", pdf, png[:-4]], check=True)
            renders.append(png)
        manifest.append({
            "pid": pid, "paper": key, "pageCandidates": [i + 1 for i in top],
            "topScores": [s for s, _ in scores[:2]], "renders": renders,
        })
        print(f"{pid}: pages {[i+1 for i in top]} scores {[s for s,_ in scores[:2]]} renders={len(renders)}")

json.dump(manifest, open(f"{ROOT}/.syllabai/lane-artifacts/T-OEQ-MATHSB-SERVE-1/run-016/page_manifest.json", "w"), indent=1)
print(f"\nmanifest: {len(manifest)} entries; PNGs in {PNGS}")

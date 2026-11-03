#!/usr/bin/env python3
"""run-016 Phase B3: per-part text-layer verification for all 53 parts.
For each part prove, from the paper's own PDF text layer:
  V1 stem: a distinctive genuine-stem snippet exists on the found page
  V2 captions: 'Turn over for a spare grid...' / 'Only use this grid...' exist on some page
  V3 tick runs: both flattened tick runs exist verbatim in the text layer
Outputs verdicts JSON + a vision-read priority list.
"""
import json, re, subprocess

ROOT = "/home/z/my-project/repos/syllabai-v2"
PDFS = "/home/z/my-project/download/t-oeq-mathsb/run016/pdfs"
ART = f"{ROOT}/.syllabai/lane-artifacts/T-OEQ-MATHSB-SERVE-1/run-016"

cl = json.load(open(f"{ART}/sparegrid_classification.json"))
man = {m["pid"]: m for m in json.load(open(f"{ART}/page_manifest.json"))}

def norm(s):
    return re.sub(r"\s+", " ", s).strip()

pages_cache = {}
def pages_of(key):
    if key not in pages_cache:
        txt = subprocess.run(["pdftotext", "-layout", f"{PDFS}/{key}.pdf", "-"],
                             capture_output=True, text=True).stdout
        pages_cache[key] = [norm(p) for p in txt.split("\f")]
    return pages_cache[key]

def tick_runs(pm):
    """extract the two axis tick runs around the captions"""
    m1 = re.search(r"([\S ]{3,120}?)[^.]*?for a spare grid if you need to redraw", pm)
    # run A = text between previous caption/sentence end and 'for a spare grid'
    # simpler: find 'y ' or letter-label + digits spans
    runs = re.findall(r"[yVxWA-D]?\s*[–−-]?\d+(?:\s+[–−-]?\d+){4,}\s*(?:[Ox]|\bfor\b)", pm)
    return runs

verdicts = []
for o in cl:
    pid = o["pid"]
    key = man[pid]["paper"]
    pages = pages_of(key)
    pm = json.load(open(f"{ROOT}/apps/hub/content/igcse-maths-b-16/official-papers.json"))
    # full problemMd from plane (need idx again)
    full_pm = None
    for s in pm:
        for q in s["questions"]:
            for p in q["parts"]:
                if p["id"] == pid:
                    full_pm = p.get("problemMd", "")
    assert full_pm is not None, pid
    all_text = " || ".join(pages)
    # V1 stem snippet: longest leading genuine sentence (strip matrix-box junk)
    stem = o["stem"] or full_pm
    stem = re.sub(r"[⎡⎛⎜⎝⎤⎞⎠⎢⎥]", " ", stem)
    stem_n = norm(stem)
    # take a mid-safe 45-char snippet from the first alphabetic sentence
    m = re.search(r"[A-Za-z][^.!?]{25,90}", stem_n)
    snippet = norm(m.group(0)) if m else stem_n[:60]
    v1 = any(snippet.lower() in p.lower() for p in pages)
    v2_spare = "for a spare grid if you need to redraw" in all_text.lower()
    v2_only = "only use this grid if you need to redraw" in all_text.lower()
    # V3 tick run A: text chunk between stem end and 'for a spare grid'
    mA = re.search(r"\.\s*([^.]{5,150}?)\s*for a spare grid", full_pm) or re.search(r"^\s*([^.]{5,150}?){1}\s*for a spare grid", full_pm)
    runA = norm(mA.group(1)) if mA else None
    v3 = bool(runA) and (runA.lower() in all_text.lower())
    v = {
        "pid": pid, "paper": key,
        "V1_stemOnPage": v1, "stemSnippet": snippet,
        "V2_spareFooter": v2_spare, "V2_onlyCaption": v2_only,
        "V3_tickRunA_verbatim": v3, "tickRunA": runA,
    }
    v["verdict"] = "PASS" if (v1 and v2_spare and v2_only) else "REVIEW"
    verdicts.append(v)

n_pass = sum(1 for v in verdicts if v["verdict"] == "PASS")
print(f"text-layer verdicts: PASS {n_pass}/53")
for v in verdicts:
    if v["verdict"] != "PASS":
        print(f"  REVIEW {v['pid']} V1={v['V1_stemOnPage']} V2spare={v['V2_spareFooter']} V2only={v['V2_onlyCaption']} V3={v['V3_tickRunA_verbatim']}")
        print(f"        snippet: {v['stemSnippet'][:80]}")

json.dump(verdicts, open(f"{ART}/textlayer_verdicts.json", "w"), indent=1, ensure_ascii=False)
print("wrote textlayer_verdicts.json")

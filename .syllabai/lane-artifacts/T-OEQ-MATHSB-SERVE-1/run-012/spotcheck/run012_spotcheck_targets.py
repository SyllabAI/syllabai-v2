#!/usr/bin/env python3
"""run-012 live spot-check target list (read-only).

Resolves the receipt-named fixed parts by pid, extracts probe strings,
live player URLs and 3 sample figure-crop assets from the 64 newly attached.
"""
import json, re

PLANE = "/home/z/my-project/repos/syllabai-v2/apps/hub/content/igcse-maths-b-16/official-papers.json"
FIGMAN = "/home/z/my-project/repos/syllabai-v2/.syllabai/lane-artifacts/T-OEQ-MATHSB-SERVE-1/run-012/figure_manifest.json"

def slugify(s):
    return re.sub(r"[^a-z0-9]+", "-", (s or "").lower()).strip("-")

# pid -> (category, what-to-verify)
TARGETS = {
    "offp_2019-01_01_10-a":  ("tierD", "3.4 ×10⁸ spaced standard-form flatten (solutionMd)"),
    "offp_2025-11_02_1-a":   ("tierD", "×10N flatten in problemMd"),
    "offp_2021-06_02_1-c":   ("tierD", "2 spaced flattens"),
    "offp_2018-06_01_27":    ("matrix", "A/B 2x2 matrices rebuilt from print"),
    "offp_2018-06_01r_26":   ("matrix", "A/B 2x2 matrices rebuilt from print"),
    "offp_2019-06_02_4-d":   ("matrix", "pmatrix product rows (KaTeX)"),
    "offp_2019-06_02_4-e":   ("matrix", "pmatrix product rows (KaTeX)"),
    "offp_2020-01_01_18":    ("moduli", "|p|² moduli row + x = −21/5"),
    "offp_2021-01r_26":      ("surd", "√(20a²) family"),
    "offp_2022-01_01r_15":   ("surd", "(√5−2)(√5+2) rationalising rows"),
    "offp_2023-01_02r_10-b": ("surd", "(∛81)⁴ = 3^(16/3) fractional indices"),
    "offp_2020-06_01_13-b":  ("surd", "(125p⁹w³)^(2/3)"),
    "offp_2024-06_02r_2-b":  ("text", "(2n−4) right angles + '=' restored"),
    "offp_2020-06_01r_17-b": ("leak", "©/Ⓒ part-label strip; clean B1 row; 2.40×10⁵ span"),
    "offp_2020-06_01r_17-c": ("leak", "17-c rows moved home with mark codes"),
    "offp_2022-01_01_25":    ("leak", "'7 M1 ... AM' foreign tail stripped"),
    "offp_2024-06_01_19":    ("leak", "Q20 row leak stripped; (4√3)² class"),
}

def main():
    plane = json.load(open(PLANE))
    out = []
    for t in plane:
        for q in t["questions"]:
            for p in q["parts"]:
                pid = p["id"]
                if pid not in TARGETS:
                    continue
                sp = p.get("sourcePaper") or {}
                key = f"{slugify(str(sp.get('date','')))}-{slugify(str(sp.get('number','')))}"
                cat, verify = TARGETS[pid]
                # crop assets on this part (newly attached set has review:true + run-012 note)
                crops = [a for a in (p.get("assets") or []) if isinstance(a, dict) and a.get("kind") == "crop"]
                out.append({
                    "pid": pid, "category": cat, "verify": verify,
                    "set": t.get("setName"), "paperKey": key,
                    "url": f"/courses/igcse-maths-b-16/past-papers/{key}",
                    "problemMd": (p.get("problemMd") or "")[:600],
                    "solutionMd": (p.get("solutionMd") or "")[:900],
                    "crops": [{"rawUrl": c.get("rawUrl"), "review": c.get("review"),
                               "mention": c.get("mention")} for c in crops],
                })
    found = {o["pid"] for o in out}
    missing = set(TARGETS) - found
    # sample 3 newly attached crops from the figure manifest
    fig_sample = []
    try:
        man = json.load(open(FIGMAN))
        entries = man if isinstance(man, list) else man.get("entries") or man.get("figures") or []
        for e in entries:
            if isinstance(e, dict) and e.get("rawUrl"):
                fig_sample.append({k: e.get(k) for k in ("pid","rawUrl","series","paper","question","mode")})
        fig_sample = fig_sample[:3]
    except Exception as ex:
        fig_sample = [{"error": str(ex)}]
    print(json.dumps({"targets": out, "missingPids": sorted(missing), "figureSample": fig_sample},
                     ensure_ascii=False, indent=1))

if __name__ == "__main__":
    main()

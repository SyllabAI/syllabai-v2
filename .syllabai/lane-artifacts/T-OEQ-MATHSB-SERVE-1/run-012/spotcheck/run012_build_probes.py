#!/usr/bin/env python3
"""run-012 live-probe builder (read-only).

Diffs each target part's fields between the pre-run-012 plane (d829a526) and
the plane at tip, and emits Unicode-safe probe windows:
  - presence: a window of the NEW text that is absent from OLD (must appear live)
  - absence:  a window of the OLD text that is absent from NEW (must NOT appear live)
Windows are taken within a single line and exclude chars that RSC/HTML escaping
would mangle (backslash, quotes, <, >, &, newline).
"""
import json, re, subprocess

REPO = "/home/z/my-project/repos/syllabai-v2"
PATH = "apps/hub/content/igcse-maths-b-16/official-papers.json"
PIN = "d829a526"

TARGETS = [
    "offp_2018-06_01_27", "offp_2018-06_01r_26-a", "offp_2019-01_01_10-a",
    "offp_2019-01_01_7", "offp_2019-01_01_21-a",
    "offp_2019-06_02_4-d", "offp_2019-06_02_4-e", "offp_2020-01_01_18",
    "offp_2020-06_01_13-b", "offp_2020-06_01r_17-b", "offp_2020-06_01r_17-c",
    "offp_2021-01_01r_26", "offp_2021-06_02_1-c", "offp_2022-01_01_25",
    "offp_2022-01_01r_15", "offp_2023-01_02r_10-b", "offp_2024-06_01_19",
    "offp_2024-06_02r_2-b", "offp_2025-11_02_1-a",
]
# paper page -> absence probes that must hold page-wide
PAGE_ABSENCE = {
    "june-2020-4mb1-01r": ["©", "Question Working Answer Mark Notes"],
}

def load(rev):
    raw = subprocess.run(["git", "-C", REPO, "show", f"{rev}:{PATH}"],
                         capture_output=True, text=True, check=True).stdout
    return json.loads(raw)

def parts(plane):
    out = {}
    for t in plane:
        for q in t["questions"]:
            for p in q["parts"]:
                out[p["id"]] = p
    return out

BAD = set('\\<>&"\'')

def usable(w):
    return w and not (set(w) & BAD)

def windows(line, other, sizes=(64, 48, 36, 28, 20)):
    seg = re.sub(r"\s+", " ", line).strip()
    hits = []
    for L in sizes:
        if len(seg) <= L:
            break
        for i in range(0, len(seg) - L + 1, 5):
            w = seg[i:i + L]
            if w not in other and usable(w):
                hits.append(w)
        if hits:
            break
    if not hits and len(seg) >= 12 and usable(seg) and seg not in other:
        hits.append(seg[:64])
    return hits

def changed_windows(old, new):
    """presence windows from new (not in old), absence windows from old (not in new)."""
    pres, abs_ = [], []
    o_lines = set(re.sub(r"\s+", " ", l).strip() for l in old.splitlines())
    n_lines = set(re.sub(r"\s+", " ", l).strip() for l in new.splitlines())
    for nl in new.splitlines():
        if re.sub(r"\s+", " ", nl).strip() in o_lines:
            continue
        pres += windows(nl, old)
    for ol in old.splitlines():
        if re.sub(r"\s+", " ", ol).strip() in n_lines:
            continue
        abs_ += windows(ol, new)
    return pres[:3], abs_[:3]

def main():
    old_p, new_p = parts(load(PIN)), parts(load("HEAD"))
    out = {}
    for pid in TARGETS:
        po, pn = old_p.get(pid), new_p.get(pid)
        if not po or not pn:
            out[pid] = {"error": "missing part", "old": bool(po), "new": bool(pn)}
            continue
        sp = pn.get("sourcePaper") or {}
        key = f"{re.sub(r'[^a-z0-9]+','-',str(sp.get('date','')).lower()).strip('-')}-{re.sub(r'[^a-z0-9]+','-',str(sp.get('number','')).lower()).strip('-')}"
        entry = {"paperKey": key, "changed": [], "unchangedFields": []}
        for f in ("problemMd", "solutionMd"):
            fo, fn = po.get(f) or "", pn.get(f) or ""
            if fo == fn:
                if fn:
                    entry["unchangedFields"].append(f)
                continue
            pres, abs_ = changed_windows(fo, fn)
            entry["changed"].append({"field": f, "presence": pres, "absence": abs_})
        if not entry["changed"]:
            entry["note"] = "NO TEXT DELTA vs d829a526 for any field"
        out[pid] = entry
    print(json.dumps({"probes": out, "pageAbsence": PAGE_ABSENCE}, ensure_ascii=False, indent=1))

if __name__ == "__main__":
    main()

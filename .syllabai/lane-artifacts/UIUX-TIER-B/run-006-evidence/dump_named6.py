#!/usr/bin/env python3
"""run-006 step 1: dump the 6 named disclosed-remainder parts from the tip bundle."""
import json, sys

BUNDLE = "/home/z/my-project/ws/syllabai-v2/apps/hub/content/igcse-maths-b-16/questions.json"

NAMED = [
    ("2024-06-4mb1-02r", 8, 2, "P10"),   # with-replacement product line
    ("2023-11-4mb1-02",  6, 3, "P8"),    # orphan D/A/B/C note lines
    ("2023-06-4mb1-01", 28, 0, "P9-P23"),# scheme 2/3/4 rows flatten debris
    ("2025-06-4mb1-02r", 9, 0, "P4"),    # surface-area sum line
    ("2026-06-4mb1-01r", 21, 0, "P1"),   # matrix-attempt row
    ("2026-06-4mb1-01r", 24, 0, "P1"),   # Pythagoras row (18-r)^2=12^2+r^2
]

d = json.load(open(BUNDLE))
sets = d if isinstance(d, list) else d.get("sets", d)
by_slug = {}
for s in sets:
    by_slug.setdefault(s["slug"].split("--")[0], []).append(s)

out = {}
for slug, qo, po, tag in NAMED:
    hits = by_slug.get(slug, [])
    if not hits:
        print(f"!! set not found: {slug}", file=sys.stderr); continue
    s = hits[0]
    qs = [q for q in s["questions"] if q["order"] == qo]
    if not qs:
        print(f"!! question order {qo} not in {slug}", file=sys.stderr); continue
    q = qs[0]
    ps = [p for p in q["parts"] if p["order"] == po]
    if not ps:
        print(f"!! part order {po} not in {slug} q{qo}", file=sys.stderr); continue
    p = ps[0]
    key = f"{slug}|q{qo}p{po}|{tag}"
    out[key] = {
        "marks": p["marks"], "commandWord": p.get("commandWord"),
        "problemMd": p["problemMd"],
        "solutionMd": p["solutionMd"],
    }

with open("/home/z/my-project/scripts/run006/work/named6-current.json", "w") as f:
    json.dump(out, f, indent=1, ensure_ascii=False)

for k, v in out.items():
    sol = v["solutionMd"] or ""
    print(f"\n{'='*90}\n{k}  (part marks {v['marks']}, solutionMd {len(sol)} chars)")
    print("-- problemMd (first 300):")
    print((v["problemMd"] or "")[:300].replace("\n", " | "))
    print("-- solutionMd named-tag region:")
    lines = sol.split("\n")
    tagtok = k.split("|")[2]
    if "P9-P23" in tagtok:
        print(sol[:2500])
    else:
        start = tagtok.split("-")[0].replace("P", "")
        idxs = [i for i, L in enumerate(lines) if f"**{start}**" in L]
        if idxs:
            lo = max(0, idxs[0] - 2)
            print("\n".join(lines[lo:lo + 14]))
        else:
            print(sol[-1200:])

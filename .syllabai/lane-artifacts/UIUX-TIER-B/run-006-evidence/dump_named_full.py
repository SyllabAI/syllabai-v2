#!/usr/bin/env python3
"""run-006: full dump of the 6 located named parts."""
import json

BUNDLE = "/home/z/my-project/ws/syllabai-v2/apps/hub/content/igcse-maths-b-16/questions.json"
d = json.load(open(BUNDLE))
sets = d if isinstance(d, list) else d.get("sets", d)

TARGETS = [
    ("2024-06-4mb1-02r", 7, 2),
    ("2023-11-4mb1-02",  5, 3),
    ("2023-06-4mb1-01", 27, 0),
    ("2025-06-4mb1-02r", 8, 0),
    ("2026-06-4mb1-01r", 23, 0),
    ("2026-06-4mb1-01r", 20, 0),
]

out = {}
for slug, qo, po in TARGETS:
    s = next(x for x in sets if x["slug"].split("--")[0] == slug)
    q = next(q for q in s["questions"] if q["order"] == qo)
    p = next(p for p in q["parts"] if p["order"] == po)
    key = f"{slug}|q{qo}p{po}"
    out[key] = {"marks": p["marks"], "commandWord": p.get("commandWord"),
                "problemMd": p["problemMd"], "solutionMd": p["solutionMd"]}
    print(f"\n{'#'*95}\n## {key}  marks={p['marks']} cw={p.get('commandWord')}")
    print("### problemMd:")
    print(p["problemMd"])
    print("### solutionMd:")
    print(p["solutionMd"])

json.dump(out, open("/home/z/my-project/scripts/run006/work/named6-full.json", "w"),
          indent=1, ensure_ascii=False)

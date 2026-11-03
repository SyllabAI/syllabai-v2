#!/usr/bin/env python3
"""run-006: locate the 6 named debris parts by signature search (not guessed coords)."""
import json, re

BUNDLE = "/home/z/my-project/ws/syllabai-v2/apps/hub/content/igcse-maths-b-16/questions.json"
d = json.load(open(BUNDLE))
sets = d if isinstance(d, list) else d.get("sets", d)

def find(slug_sub):
    for s in sets:
        if s["slug"].split("--")[0] == slug_sub:
            return s
    return None

JOBS = [
    ("2024-06-4mb1-02r", lambda sol, pro: "145" in sol and ("90" in sol or "replacement" in sol.lower() or "product" in sol.lower())),
    ("2023-11-4mb1-02",  lambda sol, pro: bool(re.search(r"- Note: [ABCD]\s*$", sol, re.M))),
    ("2023-06-4mb1-01",  lambda sol, pro: "**P23**" in sol),
    ("2025-06-4mb1-02r", lambda sol, pro: "314.159" in sol or "78.539" in sol),
    ("2026-06-4mb1-01r", lambda sol, pro: "18" in sol and "r" in sol and re.search(r"\(18", sol)),
    ("2026-06-4mb1-01r", lambda sol, pro: bool(re.search(r"matrix|M\s*=\s*\(", sol, re.I)) and "P1" in sol and "attempt" in sol.lower()),
]

for slug, pred in JOBS:
    s = find(slug)
    if not s:
        print(f"!! set missing {slug}"); continue
    print(f"\n{'='*80}\n### {slug} — signature hits:")
    for q in s["questions"]:
        for p in q["parts"]:
            sol = p.get("solutionMd") or ""
            pro = p.get("problemMd") or ""
            if pred(sol, pro):
                head = (pro or "").replace("\n", " ")[:110]
                print(f"  q(order={q['order']:>2}, total {q['totalMarks']:>2}) p(order={p['order']}, marks={p['marks']}) | {head}")

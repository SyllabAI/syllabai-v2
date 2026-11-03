#!/usr/bin/env python3
"""Re-derive UIUX-LATEX-1 pairs from the sibling commit's before/after."""
import json, subprocess, sys, collections

REPO = "/home/z/my-project/syllabai-v2"
F = "apps/hub/content/igcse-maths-b-16/questions.json"

def solutions_at(rev):
    raw = subprocess.run(["git", "-C", REPO, "show", f"{rev}:{F}"],
                         capture_output=True).stdout.decode("utf8")
    hub = json.loads(raw)
    out = {}
    for t in hub:
        slug = t.get("topicSlug") or t.get("slug")
        for qi, q in enumerate(t["questions"]):
            for pi, p in enumerate(q["parts"]):
                sol = p.get("solutionMd")
                if sol:
                    out[(slug, qi, pi)] = sol
    return out

before = solutions_at("6bedab62^")
after = solutions_at("6bedab62")
print(f"solved before={len(before)} after={len(after)}")

pairs = []
for k in sorted(set(before) & set(after)):
    if before[k] != after[k]:
        pairs.append((k, before[k], after[k]))
print(f"CHANGED pairs: {len(pairs)}")

json.dump([{"key": list(k), "before": b, "after": a} for k, b, a in pairs],
          open("/home/z/my-project/scripts/mb4_latex1_pairs.json", "w", encoding="utf8"),
          ensure_ascii=False)
print("pairs saved -> mb4_latex1_pairs.json")

#!/usr/bin/env python3
"""RN-DEBRIS-11 run-002 prep: dump the run-001 adjudication inventories
for pattern study. Read-only over the ledger artifacts."""
import json
import sys
from collections import Counter

REPO = "/home/z/my-project/work/sv2-rn9"
ADJ = f"{REPO}/.syllabai/lane-artifacts/RN-DEBRIS-11/rn11_adjudication.json"
CC = f"{REPO}/.syllabai/lane-artifacts/RN-DEBRIS-11/rn11_census_c_slim.json"

d = json.load(open(ADJ))
out = []

# ---- R1 groups: distinct texts + per-file planes ----
r1 = d["R1_interleaved_runs"]
groups = r1["groups"]
keeps = r1["legitKeeps"]
cand = [g for g in groups if g["verdict"].startswith("interleaved")]
out.append(f"R1: groups={len(groups)} candidates={len(cand)} keeps={len(keeps)}")
by_text = {}
for g in cand:
    by_text.setdefault(g["full"], []).append(g)
out.append(f"R1 distinct texts: {len(by_text)}")
for i, (t, gs) in enumerate(sorted(by_text.items(), key=lambda kv: -len(kv[1]))):
    files = Counter(x["file"] for x in gs)
    out.append(f"\n--- R1 TEXT {i+1} (groups={len(gs)}) ---")
    out.append("files: " + "; ".join(f"{f.split('/')[-2]}/{f.split('/')[-1]} x{n}" for f, n in files.items()))
    paths = "; ".join(sorted({x["path"] for x in gs}))
    out.append("paths: " + paths[:200])
    out.append(f"len={len(t)}")
    out.append("FULL: " + json.dumps(t, ensure_ascii=False))

# ---- R2a: the of-record corrupt-brace segs from census C ----
cc = json.load(open(CC))
r2a = [x for x in cc["braceStructural"]
       if "V_{i} n" in x["seg"] or "R_{2 =" in x["seg"]
       or "lambda_{m a x}" in x["seg"].replace("\\lambda", "lambda")]
out.append("\n\n==== R2a corrupt-brace of-record segs ====")
for x in r2a:
    out.append(json.dumps(x, ensure_ascii=False)[:600])

# spacecraf
out.append("\n==== R2c spacecraf seg search in braceStructural/other ====")
for fam in ("braceStructural", "missingArg", "undefCmd"):
    for x in cc[fam]:
        if "spacecraf" in x["seg"] or "p a c e c r a f t" in x["seg"]:
            out.append(f"[{fam}] " + json.dumps(x, ensure_ascii=False)[:800])

# ---- R3b: paren-brace swap items ----
out.append("\n\n==== R3b paren-brace-swap items ====")
for x in cc["braceStructural"]:
    if x not in r2a and ("^{" in x["seg"] and ")}" in x["seg"].replace(")}", ")}")):
        pass  # filter applied below via the ledger itself
adj = json.load(open(ADJ))["R3b_paren_brace_swap"]["items"]
for x in adj:
    out.append(f"count={x['count']} files={x['files'][:2]} seg={json.dumps(x['seg'], ensure_ascii=False)[:300]}")

# ---- R3c: gathered-& items ----
out.append("\n\n==== R3c gathered-& items ====")
agg = json.load(open(ADJ))["R3c_gathered_amp"]["items"]
for x in agg:
    out.append(f"count={x['count']} files={x['files'][:2]} seg={json.dumps(x['seg'], ensure_ascii=False)[:300]}")

# ---- R3a: 95 fire candidates summary ----
out.append("\n\n==== R3a fire-candidate summary (content -> n, files, cls) ====")
r3a = d["R3a_subfloor_siblings"]["items"]
fire = [i for i in r3a if i["verdict"].startswith("FIRE")]
out.append(f"fire={len(fire)} keeps={len(r3a)-len(fire)}")
per = Counter(i["content"] for i in fire)
out.append("per content: " + json.dumps(dict(per), ensure_ascii=False))
percls = Counter(i["cls"] for i in fire)
out.append("per cls: " + json.dumps(dict(percls), ensure_ascii=False))
perfile = Counter(i["file"] for i in fire)
out.append("per file: " + json.dumps(dict(perfile), ensure_ascii=False, indent=0))

open("/tmp/rn11_inventory.txt", "w", encoding="utf-8").write("\n".join(out))
print("\n".join(out[:6]))
print("... full dump at /tmp/rn11_inventory.txt, lines:", len(out))

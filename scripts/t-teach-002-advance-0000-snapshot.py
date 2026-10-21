#!/usr/bin/env python3
"""T-TEACH-002: advance the LIVING baseline snapshot (0000_snapshot.json) with
the two v2-native tables of ADR-CLASS-0001, byte-identical to the 0006 craft.

Context of record: drizzle-kit generate is unusable on this repo (the
PRE-EXISTING 0000/0005 snapshot-id collision + dangling 0001.prevId — see the
T-TEACH-001 receipt), and the live `rebaseline pull` needs a Neon branch the
migration has not been applied to yet. The repo's own practice keeps
0000_snapshot.json as the CURRENT end-state of record (it already carries the
0002/0004/0005 v2-native families); this script follows that practice. The
next live `db:pull` rebaseline is the standing confirmation step.
"""
import json, copy, os

BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "packages", "db", "drizzle", "meta")

snap0000 = json.load(open(os.path.join(BASE, "0000_snapshot.json")))
snap0006 = json.load(open(os.path.join(BASE, "0006_snapshot.json")))

added = []
for t in ["public.class_features", "public.course_registry"]:
    if t not in snap0000["tables"]:
        snap0000["tables"][t] = copy.deepcopy(snap0006["tables"][t])
        added.append(t)

json.dump(snap0000, open(os.path.join(BASE, "0000_snapshot.json"), "w"), indent=1)
print("added to 0000_snapshot:", added)

# recompute the inventory the test pins
cols = sum(len(v["columns"]) for v in snap0000["tables"].values())
idx = sum(len(v.get("indexes", {})) for v in snap0000["tables"].values())
fks = sum(len(v.get("foreignKeys", {})) for v in snap0000["tables"].values())
cks = sum(len(v.get("checkConstraints", {})) for v in snap0000["tables"].values())
print(f"new inventory: tables {len(snap0000['tables'])} / cols {cols} / idx {idx} / fks {fks} / checks {cks}")

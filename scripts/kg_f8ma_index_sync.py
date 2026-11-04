#!/usr/bin/env python3
"""kg_f8ma_index_sync.py — P5 index sync repair (general form, the
batch-three precedent).

Reconciles EVERY index.json row whose edges count drifted from the served
spine (the shared-index revert class: `git checkout -- index.json` after
per-course startups restores stale rows for already-started courses).
Refuses to touch rows already in sync; serialization format preserved.
"""
import json
from pathlib import Path

REPO = Path("/home/z/my-project/work/syllabai-v2")
DATA = REPO / "apps" / "hub" / "public" / "kg" / "data"

raw = (DATA / "index.json").read_text()
compact = "\n" not in raw.rstrip("\n")
index = json.loads(raw)
fixed = 0
for row in index["courses"]:
    slug = row["slug"]
    spine = json.loads((DATA / f"{slug}.json").read_text())
    served = len(spine["edges"])
    if row["counts"]["edges"] != served:
        print(f"sync {slug}: index {row['counts']['edges']} -> served {served}")
        row["counts"]["edges"] = served
        fixed += 1
if compact:
    (DATA / "index.json").write_text(
        json.dumps(index, separators=(",", ":"), ensure_ascii=False)
    )
else:
    (DATA / "index.json").write_text(
        json.dumps(index, indent=2, ensure_ascii=False) + "\n"
    )
print(f"index written ({fixed} rows repaired)")

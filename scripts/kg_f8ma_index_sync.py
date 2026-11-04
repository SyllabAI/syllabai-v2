#!/usr/bin/env python3
"""kg_f8ma_index_sync.py — P5 index sync repair (the batch-three precedent).

Restores index.json rows to the served edge counts for named slugs only.
Refuses any other mutation; serialization format preserved.
"""
import json
import sys
from pathlib import Path

REPO = Path("/home/z/my-project/work/syllabai-v2")
DATA = REPO / "apps" / "hub" / "public" / "kg" / "data"

SLUGS = [
    "cie-as-accounting-21",
    "cie-a-level-accounting-21",
    "igcse-accounting-17-financial-statements",
    "igcse-accounting-17-introduction-to-bookkeeping-and-accounting",
]

raw = (DATA / "index.json").read_text()
compact = "\n" not in raw.rstrip("\n")
index = json.loads(raw)
rows = {r.get("slug"): r for r in index["courses"]}
for slug in SLUGS:
    served = json.loads((DATA / f"{slug}.json").read_text())
    n = len(served["edges"])
    row = rows.get(slug)
    assert row is not None, f"{slug}: not in index"
    if row["counts"]["edges"] != n:
        print(f"sync {slug}: index {row['counts']['edges']} -> served {n}")
        row["counts"]["edges"] = n
    else:
        print(f"ok   {slug}: index already {n}")
if compact:
    (DATA / "index.json").write_text(
        json.dumps(index, separators=(",", ":"), ensure_ascii=False)
    )
else:
    (DATA / "index.json").write_text(
        json.dumps(index, indent=2, ensure_ascii=False) + "\n"
    )
print("index written")

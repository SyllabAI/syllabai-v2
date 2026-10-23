#!/usr/bin/env python3
"""T-RULE-T3-SME-COVERAGE-1 run-003b — cross_lane_join lineage restoration.

The of-record harvester's doc_out (cie_spcpt_index_harvest.py) predates the
① cross-lane join round enrichment (a separate post-harvest lane,
2026-10-19T10:00:00Z), so run-003's re-derived index files for the 5 grown
lanes dropped that lineage block. All 5 committed blocks carried
resolved={} (the round cured nothing on these lanes), so the semantic loss
is nil — but the block is a lineage artifact of record and the bundle
builder reads cross_lane_join.resolved.

This patcher RE-RECORDS the block at the run-003 vintage: same schema, the
lane's CURRENT dangling ids (from the post-rekey census), resolved={},
directive stamped as the run-003 re-record. The 39 untouched lanes keep
their ① blocks byte-stable.
"""
from __future__ import annotations

import json
from pathlib import Path

WT = Path("/home/z/my-project/lane-t3r3/resources")
LANES = ["cie-a-level-computer-science-19", "cie-igcse-business-25",
         "cie-igcse-economics-20", "cie-igcse-economics-25",
         "cie-igcse-english-literature-21"]
T3R3_STAMP = "2026-10-23T19:10:00Z"

census = json.load(open("/home/z/my-project/scripts/recon/t3r3_census_after.json"))
dangling = {r["lane"]: r["dangling_ids"] for r in census["rows"]}

for lane in LANES:
    p = WT / "SME-ExamQuestion" / lane / "spec_point_index.json"
    doc = json.loads(p.read_text(encoding="utf-8"))
    ids = sorted(dangling.get(lane) or [])
    doc["cross_lane_join"] = {
        "schema": "syllabai.sme-cross-lane-join/1.0",
        "generated_utc": T3R3_STAMP,
        "directive": "\u2461 run-003 re-record (tranche-3 re-harvest vintage; "
                     "supersedes the \u2460 2026-10-19 round record dropped by "
                     "the re-derivation — restored additively, resolved {} "
                     "then and now)",
        "gateway_trace": "1a169db74ca578c9",
        "fires": "T-RULE-T3-SME-COVERAGE-1 run-003 lineage restoration",
        "dangling_total": len(ids),
        "resolved": {},
        "ambiguous": [],
        "unresolved_ids": ids,
        "resolved_count": 0,
        "ambiguous_count": 0,
        "unresolved_count": len(ids),
    }
    p.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n",
                 encoding="utf-8")
    print(f"[{lane}] cross_lane_join re-recorded (dangling {len(ids)})")
print("done")

#!/usr/bin/env python3
"""T-RULE-T3-SME-COVERAGE-1 run-003 — spec_point_index re-derivation for the
5 grown lanes at the re-harvest commit (run of the OF-RECORD harvester
cie_spcpt_index_harvest.py at commit-1 HEAD, worktree REPO-patched).

- harvest_lane runs for ALL 44 cie lanes as a fail-closed battery (sidecar
  universe reconciliation included); only the 5 re-derived lanes are
  WRITTEN, each stamped with the run-003 fixed stamp (the other 39 index
  files stay byte-untouched — byte-stability convention).
- the patched sidecars (uncommitted worktree state) are the reconciliation
  counterparts for the 5 lanes.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

WT = Path("/home/z/my-project/lane-t3r3/resources")
OUT = Path("/home/z/my-project/scripts/recon")
LANES_WRITE = {"cie-a-level-computer-science-19", "cie-igcse-business-25",
               "cie-igcse-economics-20", "cie-igcse-economics-25",
               "cie-igcse-english-literature-21"}
T3R3_STAMP = "2026-10-23T18:00:00Z"

sys.path.insert(0, str(WT / "scripts"))
import cie_spcpt_index_harvest as ih  # noqa: E402

# REPO is __file__-relative in the of-record harvester: imported from the
# worktree scripts dir it already resolves to the lane worktree — assert,
# don't patch.
assert str(ih.REPO) == str(WT), f"unexpected harvester REPO: {ih.REPO}"
assert ih.FIXED_STAMP == "2026-10-19T09:00:00Z"
ih.FIXED_STAMP = T3R3_STAMP  # exactly-one-replacement
ih.STATS_OUT = OUT / "t3r3_index_harvest_summary.json"


def main() -> int:
    ls = ih.lanes()
    print(f"CIE lanes: {len(ls)}")
    all_targets = {lane: ih.list_targets(lane) for lane in ls}
    flat = [t for v in all_targets.values() for t in v]
    print(f"total blobs to read: {len(flat)}")
    blobs = ih.read_blobs(flat)

    rows = []
    for lane in ls:
        content, stats, missing = ih.harvest_lane(lane, all_targets[lane],
                                                  blobs)
        if lane in LANES_WRITE:
            doc = json.loads(content.decode("utf-8"))
            doc["generated_utc"] = T3R3_STAMP
            fp = WT / "SME-ExamQuestion" / lane / "spec_point_index.json"
            fp.write_text(json.dumps(doc, ensure_ascii=False, indent=1)
                          + "\n", encoding="utf-8")
            action = "WRITTEN"
        else:
            action = "battery-only"
        rows.append({"lane": lane, "action": action, **stats})
        print(f"[{lane}] {action}: universe {stats['universe_ids']} "
              f"covered {stats['covered_by_index']} "
              f"missing {stats['missing_from_index']}", flush=True)

    summary = {"schema": "syllabai.t3r3-index-rederive/1.0",
               "stamp": T3R3_STAMP,
               "written_lanes": sorted(LANES_WRITE),
               "rows": rows}
    ih.STATS_OUT.write_text(json.dumps(summary, indent=1) + "\n",
                            encoding="utf-8")
    print("\nindex re-derivation complete")
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""T-RULE-T3-SME-COVERAGE-1 run-001 — fresh per-bank census of the tranche-3
surface (the SME-side coverage-gap class) at the resources tip of record.

Reads (all read-only, from the scratch sparse checkout @ FETCH_HEAD 4b119e71):
  - SME-ExamQuestion/<lane>/**/topic.json  (source bank parts + declared refs)
  - SME-ExamQuestion/<lane>/spec_point_index.json (the corpus index of record)
  - spec-links/<lane>.json (the sidecar of record: items/totals/review_state)

Classes (source-side definitions, disclosed):
  parts_raw          all question parts in the bank
  parts_with_refs    parts carrying >=1 declared spec_point_ids
  parts_no_refs      parts_raw - parts_with_refs  (the no-declaration class)
  refs_unique        unique declared spcpt_* ids
  refs_dangling      declared ids missing from the bank's index universe
  universe           index spec_points entities

Cross-foots against the of-record census receipt (cie-anchor-gap-census-r0,
2026-10-21): smeCoverageGap per-bank figures (economics-25 585 / economics-20
119 / geography-20 114 / intl-maths-23-extended 82; class total 1,203).
"""
import json
import os
import sys
from pathlib import Path

SCRATCH = Path("/home/z/my-project/scripts/tmp/t3_scratch")
OUT = Path("/home/z/my-project/scripts/tmp/t3_census_fresh.json")
LANES = [l.strip() for l in
         open("/home/z/my-project/scripts/tmp/cie_lanes.txt") if l.strip()]

OF_RECORD = {  # census receipt 2026-10-21 (smeCoverageGap per-bank, named rows)
    "cie-igcse-economics-25": 585,
    "cie-igcse-economics-20": 119,
    "cie-igcse-geography-20": 114,
    "cie-igcse-maths-international-maths-23-extended": 82,
}
OF_RECORD_CLASS_TOTAL = 1203


def load_json(p: Path):
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None


rows = []
for lane in LANES:
    bank = SCRATCH / "SME-ExamQuestion" / lane
    parts_raw = parts_ref = 0
    refs = set()
    for root, _dirs, files in os.walk(bank):
        if "topic.json" not in files:
            continue
        doc = load_json(Path(root) / "topic.json")
        if not doc:
            continue
        for q in doc.get("questions", []) or []:
            for part in q.get("parts", []) or []:
                parts_raw += 1
                rp = part.get("spec_point_ids") or []
                if rp:
                    parts_ref += 1
                    refs.update(rp)
    idx = load_json(bank / "spec_point_index.json") or {}
    universe = set((idx.get("spec_points") or {}).keys())
    missing = sorted(r for r in refs if r not in universe)
    sc = load_json(SCRATCH / "spec-links" / f"{lane}.json") or {}
    tot = sc.get("totals", {}) or {}
    rs = (sc.get("review_state") or {}).get("state")
    rows.append({
        "lane": lane,
        "review_state": rs,
        "parts_raw": parts_raw,
        "parts_with_refs": parts_ref,
        "parts_no_refs": parts_raw - parts_ref,
        "refs_unique": len(refs),
        "universe": len(universe),
        "refs_dangling": len(missing),
        "sidecar_items": tot.get("items"),
        "sidecar_items_with_codes": tot.get("items_with_codes"),
        "sidecar_question_parts": (tot.get("by_kind") or {}).get("question_parts"),
        "of_record_gap": OF_RECORD.get(lane),
    })

total = {
    "parts_raw": sum(r["parts_raw"] for r in rows),
    "parts_with_refs": sum(r["parts_with_refs"] for r in rows),
    "parts_no_refs": sum(r["parts_no_refs"] for r in rows),
    "refs_dangling": sum(r["refs_dangling"] for r in rows),
}
gap_rows = [r for r in rows if r["parts_no_refs"] > 0]
cross = {
    "class_total_fresh_no_ref_parts": total["parts_no_refs"],
    "of_record_class_total": OF_RECORD_CLASS_TOTAL,
    "delta_vs_of_record": total["parts_no_refs"] - OF_RECORD_CLASS_TOTAL,
    "named_rows_fresh": {r["lane"]: r["parts_no_refs"] for r in rows
                         if r["of_record_gap"] is not None},
    "named_rows_of_record": OF_RECORD,
    "lanes_with_zero_gap": sum(1 for r in rows if r["parts_no_refs"] == 0),
    "lanes_with_gap": len(gap_rows),
}
out = {
    "schema": "syllabai.cie-tranche3-census/1.0",
    "computed_at_tip": "resources FETCH_HEAD 4b119e71023b091fa545b400fe8006831f914b2e",
    "method": "source-side fresh computation over the committed banks of record; "
              "classes disclosed as source-side definitions (census receipt used "
              "bundle/sidecar-side units at e4533d7-era); cross-foot disclosed",
    "totals": total,
    "crossfoot_vs_of_record": cross,
    "rows": sorted(rows, key=lambda r: -r["parts_no_refs"]),
}
OUT.write_text(json.dumps(out, indent=1) + "\n", encoding="utf-8")

print(f"TOTAL raw={total['parts_raw']} with_refs={total['parts_with_refs']} "
      f"no_refs={total['parts_no_refs']} dangling={total['refs_dangling']}")
print(f"crossfoot: fresh {cross['class_total_fresh_no_ref_parts']} vs "
      f"of-record {cross['of_record_class_total']} "
      f"(delta {cross['delta_vs_of_record']})")
print("named rows (fresh vs of-record):")
for lane, ofv in OF_RECORD.items():
    fr = next(r for r in rows if r["lane"] == lane)
    print(f"  {lane}: fresh={fr['parts_no_refs']} of_record={ofv} "
          f"(raw={fr['parts_raw']}, dangling={fr['refs_dangling']}, "
          f"universe={fr['universe']})")
print("top-12 gap lanes:")
for r in rows[:12]:
    print(f"  {r['lane']}: no_refs={r['parts_no_refs']} raw={r['parts_raw']} "
          f"dangling={r['refs_dangling']} universe={r['universe']} "
          f"sidecar_parts={r['sidecar_question_parts']}")

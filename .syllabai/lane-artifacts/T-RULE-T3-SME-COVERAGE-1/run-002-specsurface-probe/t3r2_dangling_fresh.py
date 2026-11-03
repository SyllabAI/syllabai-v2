#!/usr/bin/env python3
"""T-RULE-T3-SME-COVERAGE-1 run-002 step 1 — fresh dangling-ref computation
for the class-B banks (declared-but-dangling spec refs) at the CURRENT
resources tip e33d4805f97af6d18a71f87d8d994e143ab66126.

Method identical to the of-record census (t3_census_fresh.py, run-001):
  parts_raw / parts_with_refs / parts_no_refs / refs_unique / universe /
  refs_dangling, computed from the committed banks (read-only).

run-002 additions:
  - the dangling ID SET per bank (the probe target list)
  - per-id part-usage counts (how many parts reference each dangling id)
  - the bank manifest.json source_url fields (probe URL derivation input)

Cross-foots the class-B rows against the of-record census table
(census-fresh-4b119e71.json, mirrored at origin/main). Zero writes outside
the lane artifact path. Read-only on the checkout.
"""
import json
import os
import sys
from pathlib import Path

RES = Path("/home/z/my-project/scripts/tmp/t3r2/resources")
OUT = Path("/home/z/my-project/scripts/tmp/t3r2/classB_dangling_fresh_e33d4805.json")

# The 14 class-B rows of the of-record 44-row census table @ 4b119e71
# (dangling > 0), transcribed verbatim from the mirrored lane artifact.
OF_RECORD_4B119E71 = {
    "cie-igcse-business-25": 198,
    "cie-igcse-economics-25": 43,
    "cie-igcse-maths-25-core": 26,
    "cie-igcse-economics-20": 20,
    "cie-a-level-maths-20-probability-and-statistics-2": 16,
    "cie-igcse-chemistry-23": 8,
    "cie-igcse-maths-25-extended": 2,
    "cie-igcse-science-co-ordinated-sciences-double-award-23-chemistry": 2,
    "cie-igcse-history-18": 2,
    "cie-igcse-maths-international-maths-23-extended": 1,
    "cie-a-level-computer-science-19": 1,
    "cie-a-level-chemistry-25": 1,
    "cie-igcse-business-23": 1,
    "cie-a-level-maths-20-pure-1": 1,
}
OF_RECORD_CLASS_B_TOTAL = 322


def load_json(p: Path):
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError) as e:
        print(f"WARN unreadable {p}: {e}", file=sys.stderr)
        return None


def main():
    rows = []
    total_dangling = 0
    for lane, of_dangling in OF_RECORD_4B119E71.items():
        bank = RES / "SME-ExamQuestion" / lane
        parts_raw = parts_ref = 0
        refs = set()
        id_usage = {}  # sid -> number of parts declaring it
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
                        for sid in rp:
                            id_usage[sid] = id_usage.get(sid, 0) + 1
        idx = load_json(bank / "spec_point_index.json") or {}
        universe = set((idx.get("spec_points") or {}).keys())
        missing = sorted(r for r in refs if r not in universe)
        total_dangling += len(missing)
        sc = load_json(RES / "spec-links" / f"{lane}.json") or {}
        tot = sc.get("totals", {}) or {}
        rs = (sc.get("review_state") or {}).get("state")
        man = load_json(bank / "manifest.json") or {}
        src_urls = []
        for k, v in man.items():
            if "url" in k.lower() and isinstance(v, str):
                src_urls.append({k: v})
        rows.append({
            "lane": lane,
            "review_state": rs,
            "parts_raw": parts_raw,
            "parts_with_refs": parts_ref,
            "parts_no_refs": parts_raw - parts_ref,
            "refs_unique": len(refs),
            "universe": len(universe),
            "refs_dangling": len(missing),
            "of_record_dangling_4b119e71": of_dangling,
            "dangling_delta_vs_of_record": len(missing) - of_dangling,
            "dangling_ids": missing,
            "dangling_id_usage": {k: id_usage[k] for k in missing},
            "sidecar_question_parts": tot.get("question_parts"),
            "manifest_url_fields": src_urls,
        })

    doc = {
        "run": "T-RULE-T3-SME-COVERAGE-1 run-002 step 1",
        "pin": "resources e33d4805f97af6d18a71f87d8d994e143ab66126 (origin/main tip at probe time)",
        "class": "B (declared-but-dangling spec refs) — the option_4 probe target set",
        "class_b_total_dangling_fresh": total_dangling,
        "of_record_class_b_total_4b119e71": OF_RECORD_CLASS_B_TOTAL,
        "rows": rows,
    }
    OUT.write_text(json.dumps(doc, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    print(f"class-B dangling total fresh = {total_dangling} (of record 4b119e71: {OF_RECORD_CLASS_B_TOTAL})")
    for r in rows:
        d = r["refs_dangling"]
        print(f"  {r['lane']:66s} dangl={d:4d} (of_rec {r['of_record_dangling_4b119e71']:4d}, delta {r['dangling_delta_vs_of_record']:+d}) ids_listed={len(r['dangling_ids'])} urlfields={len(r['manifest_url_fields'])}")
    print(f"written: {OUT}")


if __name__ == "__main__":
    main()

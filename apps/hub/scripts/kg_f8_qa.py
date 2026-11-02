#!/usr/bin/env python3
"""kg_f8_qa.py — F8 pilot-fit: score the AI concept-web pipeline against the
pilot's operator-validated ground truth (145 pre edges) BEFORE shipping it
to 105 courses.

Runs the real generator (kg_f8_generate.process) against a TEMP content root
holding a copy of the pilot bundle, projects the result through the real
exporter (kg_export.load_prerequisites path via export_course), and compares:

  precision = |AI pre pairs ∩ published pre pairs| / |AI pre pairs|
  recall    = |AI pre pairs ∩ published pre pairs| / |published pre pairs|
  reversed-miss = AI pairs whose opposite direction is in the published set
"""
from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path


import kg_f8_generate as gen  # noqa: E402
import kg_export  # noqa: E402

HUB = Path(__file__).resolve().parent.parent
PILOT = "igcse-chemistry-19"
TMP = Path("/tmp/kg-f8-qa")


def main() -> int:
    # fresh temp content root with ONLY the pilot bundle
    if TMP.exists():
        shutil.rmtree(TMP)
    (TMP / PILOT).mkdir(parents=True)
    for f in ["curriculum.json", "courses.json"]:
        src = HUB / "content" / f
        shutil.copy(src, TMP / f) if f == "courses.json" and src.exists() else None
    shutil.copy(HUB / "content" / PILOT / "curriculum.json", TMP / PILOT / "curriculum.json")

    gen.CONTENT = TMP
    gen.WORK = TMP / "_work"
    gen.RAW = TMP / "_work" / "raw"
    gen.LEDGER = TMP / "_work" / "ledger.json"
    gen.RAW.mkdir(parents=True, exist_ok=True)

    print("generating AI web for the pilot (2 LLM passes)…")
    gen.process(PILOT, force=True)
    snap_path = TMP / PILOT / "prerequisites.json"
    if not snap_path.exists():
        print("QA FAIL: generator produced no snapshot")
        return 1

    # project through the real exporter
    kg_export.CONTENT = TMP
    reg = {PILOT: {"slug": PILOT, "subject": "Chemistry", "level": "IGCSE", "code": "4CH1"}}
    payload = kg_export.export_course(PILOT, reg)
    ai_pre = {(e[0], e[1]) for e in payload["edges"] if e[2] == "pre"}

    published = json.loads((HUB / "public/kg/data" / f"{PILOT}.json").read_text())
    gt_pre = {(e[0], e[1]) for e in published["edges"] if e[2] == "pre"}
    gt_reversed = {(b, a) for a, b in gt_pre}

    inter = ai_pre & gt_pre
    precision = len(inter) / len(ai_pre) if ai_pre else 0.0
    recall = len(inter) / len(gt_pre) if gt_pre else 0.0
    reversed_miss = len(ai_pre & gt_reversed)

    snap = json.loads(snap_path.read_text())
    print("\n=== pilot-fit results ===")
    print(f"snap counts: {json.dumps(snap['counts'])}")
    print(f"AI pre pairs (post-governance): {len(ai_pre)}")
    print(f"published pre pairs (ground truth): {len(gt_pre)}")
    print(f"precision {precision:.2%} | recall {recall:.2%} | reversed-miss {reversed_miss}")
    print("\nexact hits:", sorted(inter)[:12])
    misses = sorted(ai_pre - gt_pre)[:12]
    print("AI-only sample:", misses)
    return 0


if __name__ == "__main__":
    sys.exit(main())

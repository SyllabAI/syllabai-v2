#!/usr/bin/env python3
"""Zero-core-routing pre-census (the decommission baseline).

Walks the CORE_ONLY stay-core pins of record (apps/hub/src/lib/api.v2-surface.test.ts)
plus the two known hub hardwires, and for each entry greps the hub source for
LIVE call-sites (outside lib definitions and tests). Output: the remaining-core
inventory with LIVE / dormant / UNMAPPED classification - the baseline the
docs/DECOMMISSION-BANDS-PLAN.md bands retire until the list is empty, at which
point the census flips from report to CI gate (the SS 6.2 Render-disable pre-gate).

Read-only. Exit 0 always (report, not gate). Run from the repo root:
    python3 scripts/preflight_zero_core_census.py
"""

import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
HUB_SRC = REPO / "apps" / "hub" / "src"
TEST_FILE = HUB_SRC / "lib" / "api.v2-surface.test.ts"

# path pin -> candidate emitter identifiers (function/property names or route fragments)
EMITTER_HINTS = {
    "/api/v1/teacher/curriculum/versions": ["curriculum/versions", "curriculumVersions"],
    "/api/v1/teacher/marking/answers": ["markingAnswer", "marking/answers", "smartMark", "smart-mark"],
    "/api/v1/teacher/assignments": ["teacherAssignments"],
    "/api/v1/questions?q=photosynthesis": ["questions("],
    "/api/v1/questions/families": ["families("],
    "/api/v1/exam-papers?subjectId=sub-1": ["examPapers"],
    "/api/v1/exam-papers/ep-1": ["examPapers"],
    "/api/v1/learners/me/answer-input/transcribe": ["transcribe"],
    "/api/v1/learners/me/intervention-runs": ["intervention-runs", "interventionRuns"],
    "/api/v1/subjects": ["subjects("],
    "/api/v1/tree?includeMisconceptions=true": ["tree("],
}
HARDWIRES = {
    "hub route /api/ai/chat (SSE -> coreStreamAuthorized)": ["api/ai/chat"],
}


def core_only_paths() -> list[str]:
    """Extract the CORE_ONLY_PATHS string literals from the surface test."""
    src = TEST_FILE.read_text()
    m = re.search(r"const CORE_ONLY_PATHS[^=]*=\s*\[(.*?)\n\];", src, re.S)
    if not m:
        raise SystemExit("FATAL: CORE_ONLY_PATHS block not found in the surface test")
    body = "\n".join(ln.split("//", 1)[0] for ln in m.group(1).splitlines())
    return re.findall(r'"([^"]+)"', body)


def grep_call_sites(pattern: str) -> list[str]:
    """LIVE call-sites = matches outside lib/api.ts + lib/core-proxy.ts + *.test.ts."""
    out = subprocess.run(
        ["grep", "-rn", "-F", "--include=*.ts", "--include=*.tsx", pattern, str(HUB_SRC)],
        capture_output=True, text=True,
    ).stdout
    hits = []
    for line in out.splitlines():
        p = line.split(":", 1)[0]
        if "/lib/api.ts" in p or "/lib/core-proxy" in p or ".test." in p or "/api/ai/chat/route.ts" in p and pattern != "api/ai/chat":
            continue
        hits.append(line.replace(str(REPO) + "/", ""))
    return hits


def classify(paths: list[str]) -> list[dict]:
    rows = []
    for p in paths:
        hints = EMITTER_HINTS.get(p, [])
        sites: list[str] = []
        for h in hints:
            for hit in grep_call_sites(h):
                if hit not in sites:
                    sites.append(hit)
        # a bare base path also captures deeper emitters; note them via substring hints
        rows.append({
            "core_only_path": p,
            "emitter_hints": hints,
            "live_call_sites": sites,
            "classification": "LIVE" if sites else ("DORMANT" if hints else "UNMAPPED"),
        })
    return rows


def main() -> None:
    pins = core_only_paths()
    rows = classify(pins)
    hardwire_rows = [
        {"core_only_path": k, "emitter_hints": hints,
         "live_call_sites": grep_call_sites(h),
         "classification": "HARDWIRE-LIVE" if grep_call_sites(h) else "dormant"}
        for k, hints in HARDWIRES.items() for h in hints
    ]
    live = [r for r in rows + hardwire_rows if r["classification"] in ("LIVE", "HARDWIRE-LIVE")]
    dormant = [r for r in rows + hardwire_rows if r["classification"] == "DORMANT"]
    unmapped = [r for r in rows if r["classification"] == "UNMAPPED"]
    report = {
        "instrument": "preflight_zero_core_census.py",
        "generated_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source_of_record": "apps/hub/src/lib/api.v2-surface.test.ts CORE_ONLY_PATHS (+ hardwires)",
        "core_only_pins_total": len(pins),
        "live": live,
        "dormant": dormant,
        "unmapped_needs_manual_review": unmapped,
        "gate_law": "the SS 6.2 Render-disable pre-gate: this list must reach ZERO live entries, "
                    "then hold green for the census-soak, before the operator disable",
    }
    out = REPO / ".syllabai" / "receipts" / "W7-CUTOVER" / "zero-core-census-baseline.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=1) + "\n")
    print(f"pins={len(pins)}  LIVE={len(live)}  dormant={len(dormant)}  unmapped={len(unmapped)}")
    print(f"written: {out.relative_to(REPO)}")
    for r in live:
        print(f"  LIVE     {r['core_only_path']}")
        for s in r["live_call_sites"][:4]:
            print(f"             {s}")
    for r in dormant:
        print(f"  DORMANT  {r['core_only_path']}")
    for r in unmapped:
        print(f"  UNMAPPED {r['core_only_path']}")
    return None if sys.argv[-1] != "--json" else print(json.dumps(report, indent=1))


if __name__ == "__main__":
    main()

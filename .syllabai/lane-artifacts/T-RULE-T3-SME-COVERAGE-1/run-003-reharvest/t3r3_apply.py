#!/usr/bin/env python3
"""T-RULE-T3-SME-COVERAGE-1 run-004 apply — byte-exact staging apply per the
CIE-REFRESH-1 apply mode: every copy byte-compared, staged maps pin/stamp
asserted pre-replace."""
from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path

STG = Path("/home/z/my-project/lane-t3r3/staging")
HUB = Path("/home/z/my-project/lane-t3r3/v2/apps/hub")
PIN = "3dd9bb982834743f0b8c81123c8f15003c74c06a"
STAMP = "2026-10-23T19:30:00Z"


def sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def main() -> int:
    report = json.load(open(STG / "_report_cie_consume.json"))
    changed = report["changedCourses"]
    assert len(changed) == 43, len(changed)
    n_files = 0
    for slug in changed:
        src = STG / slug
        dst = HUB / "content" / slug
        assert dst.is_dir(), f"missing bundle dir {slug}"
        for f in sorted(src.iterdir()):
            if not f.is_file():
                continue
            target = dst / f.name
            before = sha(target) if target.exists() else None
            shutil.copy2(f, target)
            assert sha(target) == sha(f), f"copy mismatch {slug}/{f.name}"
            n_files += 1
        staged_map = HUB / "content-maps" / f"{slug}.json.staged"
        final = HUB / "content-maps" / f"{slug}.json"
        if staged_map.exists():
            m = json.loads(staged_map.read_text(encoding="utf-8"))
            assert m.get("resourcesSha") == PIN, f"map pin {slug}"
            assert m.get("generatedUtc") == STAMP, f"map stamp {slug}"
            shutil.move(str(staged_map), str(final))
        else:
            # idempotent resume: the map was applied by an interrupted run
            m = json.loads(final.read_text(encoding="utf-8"))
            assert m.get("resourcesSha") == PIN, f"map pin (resumed) {slug}"
            assert m.get("generatedUtc") == STAMP, \
                f"map stamp (resumed) {slug}"
        # bundle manifest pin spot-assertion (officialSpine lives here)
        bman = dst / "manifest.json"
        if bman.exists():
            bm = json.loads(bman.read_text(encoding="utf-8"))
            os_block = (bm.get("officialSpine") or {})
            assert os_block.get("resourcesSha") == PIN, \
                f"bundle officialSpine pin {slug}"
        n_files += 1
    print(f"applied {n_files} files across {len(changed)} lanes "
          f"(bundles + maps, byte-exact, pin {PIN[:8]} stamp {STAMP})")
    return 0


if __name__ == "__main__":
    main()

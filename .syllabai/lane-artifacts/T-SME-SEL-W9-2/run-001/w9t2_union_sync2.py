#!/usr/bin/env python3
"""T-SME-SEL-W9-2 run-001 race-guard sync #2 — main advanced 70f1af92 -> a8748f6d
(PR #1003 teach-genie worklog re-file) while the lane awaited push. Overlap:
.syllabai/worklog.md ONLY (their run-003 re-file entry appended upstream; the
root worklog.md untouched). Union law (theirs-verbatim-first, the run-023
rule): main's ledger kept byte-verbatim, the lane suffix re-appended exactly
once at the tail; prefix byte-identity asserted; zero per-line conflict
markers."""
import re, subprocess, sys

REPO = "/home/z/my-project/repos/syllabai-v2"
BASE = "70f1af92"          # lane branch point
MINE = "t-sme-sel-w9-2/run-001"   # lane head 76f77348
THEIRS = "origin/main"     # a8748f6d

def git(args):
    return subprocess.run(["git", "-C", REPO, *args], capture_output=True, text=True, check=True).stdout

fail = 0
for f in [".syllabai/worklog.md", "worklog.md"]:
    base = git(["show", f"{BASE}:{f}"])
    mine = git(["show", f"{MINE}:{f}"])
    theirs = git(["show", f"{THEIRS}:{f}"])
    assert mine.startswith(base), f"{f}: lane version not base-suffixed (unexpected)"
    suffix = mine[len(base):]
    if theirs == base:
        print(f"{f}: no upstream change — lane suffix already correct, no union needed")
        continue
    if not theirs.startswith(base):
        print(f"{f}: WARNING theirs rewrote base — aborting auto-union")
        sys.exit(1)
    merged = theirs + suffix
    markers = [i for i, l in enumerate(merged.split("\n"))
               if re.match(r"^(<{7}|={7}$|>{7} )", l)]
    assert not markers, f"{f}: per-line conflict markers at {markers[:3]}"
    assert merged.count(suffix) == 1, f"{f}: lane suffix not exactly once"
    assert merged.endswith(suffix), f"{f}: lane suffix not at tail"
    open(f"{REPO}/{f}", "w", encoding="utf-8").write(merged)
    print(f"{f}: union ok — theirs +{len(theirs)-len(base)}B upstream (theirs-verbatim) + lane suffix {len(suffix)}B re-appended at tail")
print("SYNC #2 UNION OK" if fail == 0 else "FAILED")

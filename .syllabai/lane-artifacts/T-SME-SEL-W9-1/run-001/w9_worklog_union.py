#!/usr/bin/env python3
"""W9 run-001 race-guard union: merge origin/main's ledger appends
(theirs-verbatim-first) then re-append the lane suffix byte-exact at tail.
Asserts: prefix byte-identity, suffix exactly once, zero conflict markers."""
import subprocess, sys

REPO = "/home/z/my-project/repos/syllabai-v2"
BASE = "ca4f2266"          # merge-base of record (lane opened here)
MINE = "HEAD"              # lane head c118f32a
THEIRS = "origin/main"     # 18d9670f
FILES = ["worklog.md", ".syllabai/worklog.md"]

def git(args):
    return subprocess.run(["git", "-C", REPO, *args], capture_output=True, text=True, check=True).stdout

fail = 0
for f in FILES:
    base = git(["show", f"{BASE}:{f}"])
    mine = git(["show", f"{MINE}:{f}"])
    theirs = git(["show", f"{THEIRS}:{f}"])
    assert mine.startswith(base), f"{f}: my version not base-suffixed (unexpected)"
    suffix = mine[len(base):]
    # theirs must also be base-suffixed (append-only upstream)
    if not theirs.startswith(base):
        print(f"{f}: WARNING theirs rewrote base — aborting auto-union")
        sys.exit(1)
    merged = theirs + suffix
    # marker law (per-line, the tqvm1-corrected law — the ledger legitimately
    # QUOTES marker-shaped strings in prose; only per-line markers are unlawful)
    import re
    markers = [i for i, l in enumerate(merged.split("\n"))
               if re.match(r"^(<{7}|={7}$|>{7} )", l)]
    assert not markers, f"{f}: per-line conflict markers at {markers[:3]}"
    # my entry exactly once in merged, and at the tail
    assert merged.count(suffix) == 1, f"{f}: lane suffix not exactly once"
    assert merged.endswith(suffix), f"{f}: lane suffix not at tail"
    open(f"{REPO}/{f}", "w", encoding="utf-8").write(merged)
    print(f"{f}: union ok — theirs {len(theirs)-len(base)}B upstream + lane suffix {len(suffix)}B at tail")
print("UNION OK" if fail == 0 else "FAILED")

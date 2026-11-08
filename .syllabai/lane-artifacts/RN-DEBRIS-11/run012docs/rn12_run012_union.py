#!/usr/bin/env python3
"""RN-DEBRIS-11 run-012 — union-resolve .syllabai/worklog.md for the origin/main
advance merge (append-only law: main's appends byte-verbatim first, the lane's
run-012 section byte-exact re-appended at tail; any non-ledger conflict aborts)."""
import subprocess
import sys
from pathlib import Path

REPO = Path("/home/z/my-project/work/syllabai-v2")
WL = ".syllabai/worklog.md"


def git(*args, binary=False):
    r = subprocess.run(["git", "-C", str(REPO), *args], capture_output=True)
    if r.returncode != 0:
        print(f"FAIL: git {' '.join(args)}: {r.stderr.decode()[:300]}")
        sys.exit(2)
    return r.stdout if binary else r.stdout.decode()


base_sha = git("merge-base", "HEAD", "origin/main").strip()
base = git("show", f"{base_sha}:{WL}", binary=True)
main_wl = git("show", f"origin/main:{WL}", binary=True)
mine = git("show", f"HEAD:{WL}", binary=True)

assert main_wl.startswith(base), "main worklog not a pure tail-append of base"
assert mine.startswith(base), "lane worklog not a pure tail-append of base"
M = main_wl[len(base):]
L = mine[len(base):]
union = base + M + L
print(f"base {base_sha} {len(base)}B + main +{len(M)}B + lane +{len(L)}B -> union {len(union)}B")
assert union.endswith(L), "lane section not at tail"
assert base + M == main_wl, "main append law broken"

(REPO / WL).write_bytes(union)
check = (REPO / WL).read_bytes()
assert check == union, "rewrite drifted"
assert check.count(b"\n") == base.count(b"\n") + M.count(b"\n") + L.count(b"\n"), "line law"
assert check.count(b"<<<<<<<") == base.count(b"<<<<<<<") and \
       check.count(b">>>>>>>") == base.count(b">>>>>>>"), \
       "NEW conflict markers introduced (the base's pre-existing line-772 " \
       "stale marker is of-record, flagged R0)"
assert b"run-012: the run-009-queued follow-ups" in check, "lane section lost"
assert b"run-008" in check, "main's run-008 appends lost"
print("UNION OK: main's appends byte-verbatim, lane section re-appended at tail, zero markers")

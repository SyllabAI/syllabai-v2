#!/usr/bin/env python3
"""T-SME-SEL-W9-5 run-001 — REFILE: replace the lane suffix in both worklogs.
The lane commit c334da25 baked a TWENTY-FOURTH reminder; the .syllabai ledger
on main already carries TWENTY-FOURTH/TWENTY-FIFTH (the intervening register
lanes filed unevenly), so the repo-wide next number is TWENTY-SIXTH. Strips
the baked suffix byte-exactly from both ledgers (identified by the entry's
line-start sentinel), re-appends the corrected suffix (divergence note +
TWENTY-SIXTH reminder), syncs the lane tooling, amends the lane commit once."""
import subprocess, sys, shutil

REPO = "/home/z/my-project/repos/syllabai-v2"
SENTINEL = "- T-SME-SEL-W9-5 run-001"
OLD_ORD = "TWENTY-FOURTH"
NEW_ORD = "TWENTY-SIXTH"
NOTE = ("STANDING-REMINDER FILING LAW NOTE: the dual ledgers' reminder filings DIVERGED "
        "upstream (root ledger through TWENTY-THIRD, .syllabai ledger through TWENTY-FIFTH "
        "— the intervening register lanes filed unevenly); this tranche files the repo-wide "
        "next number TWENTY-SIXTH on BOTH ledgers. ")
ANCHOR = "Census engines: rn_selector_census.ts (untouched) + w9_sme_census.ts (read-only). "

def sh(cmd, input_=None):
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True, cwd=REPO, input=input_)
    if r.returncode != 0:
        print(f"!! rc={r.returncode}: {cmd}\n{r.stdout[-500:]}{r.stderr[-800:]}")
        sys.exit(1)
    return r.stdout

sh("git checkout -q t-sme-sel-w9-5/run-001")
head = sh("git rev-parse HEAD").strip()
print(f"lane head before refile: {head[:16]}")
assert head.startswith("c334da25"), f"unexpected lane head {head[:8]}"

new_suffixes = []
for f in ["worklog.md", ".syllabai/worklog.md"]:
    p = f"{REPO}/{f}"
    data = open(p, encoding="utf-8").read()
    idx = data.find(SENTINEL)
    assert idx != -1 and data.find(SENTINEL, idx + 1) == -1, f"{f}: sentinel not unique"
    old_suffix = data[idx:]
    assert f"Standing reminder ({OLD_ORD} filing)" in old_suffix and old_suffix.endswith("\n"), f"{f}: old suffix shape"
    assert NOTE not in old_suffix and NEW_ORD not in old_suffix, f"{f}: already refiled?"
    entry = old_suffix
    assert ANCHOR in entry, f"{f}: anchor missing"
    new_suffix = entry.replace(ANCHOR, ANCHOR + NOTE)
    new_suffix = new_suffix.replace(f"Standing reminder ({OLD_ORD} filing)", f"Standing reminder ({NEW_ORD} filing)")
    assert OLD_ORD not in new_suffix and NOTE in new_suffix and new_suffix.count(NEW_ORD) == 2  # note + reminder
    out = data[:idx] + new_suffix
    assert out.startswith(data[:idx]) and out.count(new_suffix) == 1
    open(p, "w", encoding="utf-8").write(out)
    new_suffixes.append(new_suffix)
    print(f"{f}: suffix rebuilt ({len(old_suffix)}B -> {len(new_suffix)}B, {NEW_ORD})")

assert new_suffixes[0] == new_suffixes[1], "suffixes differ between ledgers"

# sync the lane tooling (the re-ordinaled append script + this refile script)
LANE = f"{REPO}/.syllabai/lane-artifacts/T-SME-SEL-W9-5/run-001"
shutil.copy("/home/z/my-project/scripts/w9t5_worklog_append.py", f"{LANE}/w9t5_worklog_append.py")
shutil.copy("/home/z/my-project/scripts/w9t5_refile.py", f"{LANE}/w9t5_refile.py")
print("lane tooling synced (append script re-ordinaled + refile script added)")

sh("git add worklog.md .syllabai/worklog.md .syllabai/lane-artifacts/T-SME-SEL-W9-5/run-001/")
sh("git commit -q --amend --no-edit")
new_head = sh("git rev-parse HEAD").strip()
msg = sh(f"git log -1 --format=%s {new_head}")
assert msg.startswith("T-SME-SEL-W9-5 run-001"), f"amended subject wrong: {msg[:60]}"
print(f"lane head after refile: {new_head[:16]}")
print("REFILE + AMEND COMPLETE")

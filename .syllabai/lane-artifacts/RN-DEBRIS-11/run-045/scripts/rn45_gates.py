#!/usr/bin/env python3
"""RN-DEBRIS-11 run-045 gates — the receipts-ride battery, re-runnable at any commit
vs its own first parent (no self-referential sha). G1-G6; every check fail-loud.
"""
import json, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[5]
M1179 = "028052c85a30be5ba60bc944a0785d17f68b785b"
PIN = "ae0b7348313b9a0ad003797d7ec99bd508552f2d"
TIP_PRE = "791bbd81125c42c9c1aec9ee295bb99bfd66a11b"
MAP_REL = "apps/hub/content-maps/cie-igcse-computer-science-23.json"
FC_REL = "apps/hub/content/cie-igcse-computer-science-23/flashcards.json"
RCPT44 = ".syllabai/receipts/RN-DEBRIS-11/run-044-merge-record-ride.json"

DECLARED = sorted([
    "worklog.md",
    ".syllabai/worklog.md",
    RCPT44,
    ".syllabai/receipts/RN-DEBRIS-11/run-045-merge-record-ride.json",
    ".syllabai/receipts/RN-DEBRIS-11/run-045-postReview.json",
    ".syllabai/lane-artifacts/RN-DEBRIS-11/run-045/scripts/rn45_gates.py",
    ".syllabai/lane-artifacts/RN-DEBRIS-11/run-045/gates_r0.json",
])

FAILS = []
def check(name, ok, detail=""):
    if not ok:
        FAILS.append(f"{name}: {detail}")
    print(("PASS " if ok else "FAIL ") + name + ((" - " + detail) if detail else ""))

def git(args):
    return subprocess.run(["git", "-C", str(ROOT)] + args, capture_output=True, text=True, timeout=300)

head = git(["rev-parse", "HEAD"]).stdout.strip()
base = git(["rev-parse", "HEAD^"]).stdout.strip()
check("G0-two-commits-context", len(base) == 40, f"head {head[:8]} base {base[:8]}")

# G1 worklog union law (both worklogs)
for wl in ("worklog.md", ".syllabai/worklog.md"):
    t = git(["show", f"{base}:{wl}"]).stdout
    h = git(["show", f"{head}:{wl}"]).stdout
    check(f"G1-prefix-{wl}", h.startswith(t), f"{wl} append-only")
    appended = h[len(t):]
    check(f"G1-ride-sha-{wl}", "028052c8" in appended and "run-044 merge record" in appended,
          "the run-044 merge record entry present with the merge sha (the house worklog sha form)")
    check(f"G1-entry-once-{wl}",
          h.count("run-044 merge record — PR #1179 merged of record (2026-11-25") == 1 and
          h.count("run-045 — the run-044 merge record ride receipts (2026-11-26)") == 1, "each entry exactly once")
    for m in ("<<<<<<<", ">>>>>>>", "======="):
        check(f"G1-marks-{wl}-{m[:3]}", t.count(m) == h.count(m), f"{m} count unchanged vs base")

# G2 run-044 receipt merged block (additive edit: exactly one replaced line)
d = git(["diff", f"{base}..{head}", "--", RCPT44]).stdout
minus = [l for l in d.splitlines() if l.startswith("-") and not l.startswith("---")]
plus = [l for l in d.splitlines() if l.startswith("+") and not l.startswith("+++")]
check("G2-diff-shape", len(minus) == 1 and minus[0][1:].strip().startswith('"mergePlan"') and
      len(plus) == 11 and plus[0][1:].strip().startswith('"mergePlan"'),
      f"-{len(minus)}/+{len(plus)} (the comma replace + the merged block additions)")
r44 = json.loads(git(["show", f"{head}:{RCPT44}"]).stdout)
mb = r44.get("merged", {})
check("G2-merged-block", mb.get("sha") == M1179 and mb.get("mergedAt") == "2026-11-25T17:22:03Z" and
      mb.get("shaPinnedTo") == PIN and "2-parent" in mb.get("mergeMethod", "") and
      "791bbd81" in mb.get("mainTipAfter", ""), "merged block fields of record")

# G3 run-045 receipts
r45 = json.loads(git(["show", f"{head}:.syllabai/receipts/RN-DEBRIS-11/run-045-merge-record-ride.json"]).stdout)
check("G3-ride-receipt", r45["mergedRecordRode"]["sha"] == M1179 and r45["mergedRecordRode"]["pr"] == 1179 and
      r45["landedStateVerification"]["census"]["codedMapItems"] == 876 and
      "forty-first filing" in r45["standingReminder"], "ride receipt + census + 41st reminder")
pr_ = json.loads(git(["show", f"{head}:.syllabai/receipts/RN-DEBRIS-11/run-045-postReview.json"]).stdout)
check("G3-postReview", pr_["receipt"] == "run-045-postReview" and "7 declared" in pr_["review"]["netDiff"],
      "postReview receipt")

# G4 scope == exactly the declared set
names = sorted(l for l in git(["diff", "--name-only", f"{base}..{head}"]).stdout.splitlines() if l.strip())
check("G4-scope-7", names == DECLARED, f"{len(names)} paths == the declared set")

# G5 zero content bytes
for rel in (MAP_REL, FC_REL):
    a = git(["show", f"{base}:{rel}"])
    b = git(["show", f"{head}:{rel}"])
    check(f"G5-byte-identity-{rel.rsplit('/', 1)[-1]}", a.returncode == 0 and b.returncode == 0 and
          a.stdout == b.stdout, f"{rel} byte-identical vs base")

# G6 gates_r0.json of record
g0 = json.loads(git(["show", f"{head}:.syllabai/lane-artifacts/RN-DEBRIS-11/run-045/gates_r0.json"]).stdout)
check("G6-gates-r0", g0.get("allOk") is True and len(g0.get("gates", [])) >= 6, "build-time gates all ok")

print("BATTERY VERDICT:", "ALL OK" if not FAILS else f"FAILURES: {FAILS}")
sys.exit(1 if FAILS else 0)

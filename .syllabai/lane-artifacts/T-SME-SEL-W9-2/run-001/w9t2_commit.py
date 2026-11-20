#!/usr/bin/env python3
"""T-SME-SEL-W9-2 run-001 — branch, commit (message from the lane ENTRY via
ast), and stage. Push handled by the shell (PAT-embedded URL, then restore)."""
import ast, subprocess, sys

REPO = "/home/z/my-project/repos/syllabai-v2"
LANE = f"{REPO}/.syllabai/lane-artifacts/T-SME-SEL-W9-2/run-001"

src = open(f"{LANE}/w9t2_worklog_append.py", encoding="utf-8").read()
tree = ast.parse(src)
entry = None
for node in ast.walk(tree):
    if isinstance(node, ast.Assign) and any(getattr(t, "id", None) == "ENTRY" for t in node.targets):
        entry = ast.literal_eval(node.value)
assert entry, "ENTRY not found"

msg = entry.replace(
    "(PR of record opened for the integrator; branch t-sme-sel-w9-2/run-001 from origin/main 70f1af92)",
    "(#PR-pending)",
)
msg += "\n\nauthor does not self-merge — awaiting the integrator's audit-and-merge order; task card T-SME-SEL-W9-2.yaml IN_REVIEW; no DB contact; no deploy; fetch-first race-guard at push; no force\n"

def git(*args, **kw):
    return subprocess.run(["git", "-C", REPO, *args], capture_output=True, text=True, **kw)

r = git("checkout", "-b", "t-sme-sel-w9-2/run-001")
print(r.stdout.strip() or r.stderr.strip())
r = git("add", "-A")
r = git("commit", "-F", "-", input=msg)
print(r.stdout.strip() or r.stderr.strip())
r = git("log", "-1", "--format=%H %s")
print(r.stdout.strip()[:160])
open("/tmp/w9t2_commit_sha.txt", "w").write(git("rev-parse", "HEAD").stdout.strip())

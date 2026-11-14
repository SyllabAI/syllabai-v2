#!/usr/bin/env python3
"""§2 claim-protocol guard (T-LAW-ENFORCE-1, operator directive 2026-11-13, zai-web trace 1a1d545c404c9a2d).

Fails a PR when ANOTHER open PR already claims the same task id
(branch 't-<task>/run-*' and/or title 'T-<task> ...' and/or 'fix(T-...)' /
'diag(T-...)' / 'receipts(T-...)' style titles). One open PR per task id;
sequential re-runs (run-001 merged before run-002 opens) pass cleanly.
Unattributed heads (no task id anywhere) are noticed, not failed.
"""
import json
import os
import re
import sys
import urllib.request

token = os.environ["GH_TOKEN"]
repo = os.environ["REPO"]
pr_number = int(os.environ["PR_NUMBER"])


def api(path):
    req = urllib.request.Request(
        "https://api.github.com" + path,
        headers={
            "Authorization": "Bearer " + token,
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "coordination-guard",
        },
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def task_ids(pr):
    ids = set()
    ref = ((pr.get("head") or {}).get("ref") or "").lower()
    m = re.match(r"^t-([a-z0-9][a-z0-9-]*)/run-\d+", ref)
    if m:
        ids.add(m.group(1))
    title = pr.get("title") or ""
    m2 = re.match(r"T-([A-Za-z0-9][A-Za-z0-9-]*)", title)
    if m2:
        ids.add(m2.group(1).lower())
    m3 = re.search(r"\(T-([A-Za-z0-9][A-Za-z0-9-]*)\)", title)
    if m3:
        ids.add(m3.group(1).lower())
    return ids


me = api(f"/repos/{repo}/pulls/{pr_number}")
mine = task_ids(me)
head_ref = ((me.get("head") or {}).get("ref") or "")

if not mine:
    print(f"NOTICE: PR #{pr_number} (head '{head_ref}') matches no task id — unattributed, duplicate check skipped.")
    print("  §2 rule 2 expects branches 't-<task>/run-<n>'; unattributed lanes stay R0-visible, not CI-blocked.")
    sys.exit(0)

opens = api(f"/repos/{repo}/pulls?state=open&per_page=100")
dups = []
for p in opens:
    if p.get("number") == pr_number:
        continue
    shared = mine & task_ids(p)
    if shared:
        dups.append((p.get("number"), ((p.get("head") or {}).get("ref") or "")[:40], (p.get("title") or "")[:56], sorted(shared)))

if dups:
    print(f"FAIL: task id(s) {sorted(mine)} of PR #{pr_number} are already claimed by other OPEN PR(s):")
    for n, ref, title, shared in dups:
        print(f"  - PR #{n} head='{ref}' shared={shared} title='{title}'")
    print("  §2 claim protocol: earliest claim wins; ONE open PR per task id.")
    print("  Resolution: close/merge the superseded PR first, or continue as a new run id under a fresh claim.")
    sys.exit(1)

print(f"PASS: no other open PR claims task id(s) {sorted(mine)}.")

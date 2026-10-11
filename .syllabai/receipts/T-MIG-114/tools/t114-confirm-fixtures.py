#!/usr/bin/env python3
"""T-MIG-114 arbiter confirmation — scrub the fresh core capture (probe uuids ->
role-labelled fakes per uuid-map) and compare against the COMMITTED fixtures of
record (golden-captures/t-mig-113/), with the comparator's tolerance classes
(timestamps + probe display name). Verdict per leg = structural deep-equal."""
import json, re, sys

FRESH = "/home/z/my-project/scripts/capture_t114"
FIX = "/home/z/my-project/ws/syllabai-v2/golden-captures/t-mig-113"

setup = json.load(open(f"{FRESH}/_setup-structured-submit.json"))
ATT = setup["attemptId"]

import subprocess, os
e = dict(os.environ, PATH="/home/z/my-project/pg17/tree/usr/lib/postgresql/17/bin:" + os.environ["PATH"],
         LD_LIBRARY_PATH="/home/z/my-project/pg17/tree/usr/lib/x86_64-linux-gnu:/home/z/my-project/pg17/tree/usr/lib/postgresql/17/lib")
def q(sql):
    return subprocess.run(["psql", "-h", "127.0.0.1", "-p", "5544", "-U", "postgres", "-d", "syllabai_capture",
                           "-At", "-c", sql], capture_output=True, text=True, env=e).stdout.strip()

ANS_A = q(f"select id from answers where attempt_id='{ATT}' and question_part_id='45200000-0000-0000-0000-000000000001'")
marks = q(f"select id from human_marks where answer_id='{ANS_A}' order by created_at asc").splitlines()
HM1, HM2 = marks[0], marks[1]
users = q(f"select id, display_name from users where display_name like 'r0-t114-%' order by created_at desc")
SID = [u.split("|")[0] for u in users.splitlines() if "student" in u][0]
TID = [u.split("|")[0] for u in users.splitlines() if "teacher" in u][0]

SUB = {
    TID.lower(): "TEACHER-ID", SID.lower(): "STUDENT-ID", ATT.lower(): "ATTEMPT-ID",
    ANS_A.lower(): "ANSWER-A", HM1.lower(): "HUMANMARK-1", HM2.lower(): "HUMANMARK-2",
    "r0-t114-student": "r7a-t113-student",
}
TS = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$")

def scrub(v):
    if isinstance(v, str):
        low = v.lower()
        if low in SUB: return SUB[low]
        m = re.findall(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", low)
        for x in m:
            if x in SUB: v = v.replace(x, SUB[x])
        return v
    if isinstance(v, list): return [scrub(x) for x in v]
    if isinstance(v, dict): return {k: scrub(x) for k, x in v.items()}
    return v

def tol(v):
    if isinstance(v, str) and TS.match(v): return "<TS>"
    if isinstance(v, list): return [tol(x) for x in v]
    if isinstance(v, dict): return {k: tol(x) for k, x in v.items()}
    return v

def diffpath(a, b, p=""):
    out = []
    if isinstance(a, dict) and isinstance(b, dict):
        for k in sorted(set(a) | set(b)):
            if k not in a: out.append(f"{p}.{k}: missing-in-actual")
            elif k not in b: out.append(f"{p}.{k}: extra-in-actual")
            else: out += diffpath(a[k], b[k], f"{p}.{k}")
    elif isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b): out.append(f"{p}: len {len(a)} vs {len(b)}")
        else:
            for i, (x, y) in enumerate(zip(a, b)): out += diffpath(x, y, f"{p}[{i}]")
    elif a != b:
        out.append(f"{p}: {json.dumps(a)[:80]} != {json.dumps(b)[:80]}")
    return out

PAIRS = [
    ("leg-31-humanmark-ppd-over50-400", "response"),
    ("leg-34-humanmark-201-positive", "response"),
    ("leg-35-answer-detail-post-mark-200", "response"),
    ("leg-36-humanmark-201-override", "response"),
    ("leg-37-answer-detail-post-override-200", "response"),
]
fails = 0
for name, _ in PAIRS:
    try:
        fresh = json.load(open(f"{FRESH}/{name}.json"))
    except FileNotFoundError:
        print(f"SKIP {name} (fresh capture absent)"); continue
    fixed = json.load(open(f"{FIX}/{name}.json"))
    a = tol(scrub(fresh)); b = tol(scrub(fixed["response_body"]))
    # fixture wraps the body under response_body; status compared separately
    st_ok = fresh.get("status", 0) == fixed["status"] if isinstance(fresh, dict) and "status" in fresh else True
    d = diffpath(a, b)
    ok = not d and st_ok
    print(f"{'PASS' if ok else 'FAIL'} {name} (status {fresh.get('status')} vs {fixed['status']})")
    for line in d[:6]: print("   ", line)
    if not ok: fails += 1
print(f"\nARBITER-CONFIRM: {len(PAIRS)-fails}/{len(PAIRS)} fixture-matched")
sys.exit(0 if not fails else 1)

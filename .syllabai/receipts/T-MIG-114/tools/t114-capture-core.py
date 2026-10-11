#!/usr/bin/env python3
"""T-MIG-114 arbiter capture — FIRST-HAND re-capture of the disputed leg triad
(leg-31 / leg-34 / leg-35 / leg-36 / leg-37) from the LIVE local core boot
(6cad6ef, 127.0.0.1:8090, scratch db syllabai_capture).

Ground-truth discipline (the corruption-incident class): raw response bytes are
written to disk UNSCRUBBED, comparisons happen against disk files, the transcript
carries only statuses + the arbiter fields. Tokens/passwords live in process
memory ONLY (read from the boot process env via /proc; never printed; never
persisted). All writes land on the local scratch db — zero prod contact.
"""
import json, os, random, re, string, subprocess, sys, urllib.request

BASE = "http://127.0.0.1:8090"
OUT = "/home/z/my-project/scripts/capture_t114"
os.makedirs(OUT, exist_ok=True)
Q = "45000000-0000-0000-0000-000000000001"
PA = "45200000-0000-0000-0000-000000000001"  # part (a), marks 2
PB = "45200000-0000-0000-0000-000000000002"  # part (b), marks 1
P1 = "45990000-0000-0000-0000-000000000001"  # capture's synthetic point fake
P2 = "45990000-0000-0000-0000-000000000002"

def http(method, path, token=None, body=None):
    req = urllib.request.Request(BASE + path, method=method)
    req.add_header("accept", "application/json")
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        req.add_header("content-type", "application/json")
    if token:
        req.add_header("authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req, data=data) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()

def rand_pw():
    return "".join(random.SystemRandom().choice(string.ascii_letters + string.digits) for _ in range(24))

# join code from the boot process env (memory-only)
pid = None
for p in os.listdir("/proc"):
    if p.isdigit():
        try:
            cmd = open(f"/proc/{p}/cmdline", "rb").read().decode(errors="ignore")
        except Exception:
            continue
        if "syllabai-core" in cmd and "java" in cmd:
            pid = p
            break
if not pid:
    print("FATAL: core process not found"); sys.exit(2)
env = dict(re.findall(r"([A-Z_]+)=([^\x00]*)", open(f"/proc/{pid}/environ", "rb").read().decode(errors="ignore")))
JOIN = env["SYLLABAI_TEACHER_JOIN_CODE"]

suffix = "".join(random.SystemRandom().choice(string.hexdigits.lower()) for _ in range(8))
t_email = f"r0-t114-teacher-{suffix}@example.invalid"
s_email = f"r0-t114-student-{suffix}@example.invalid"
t_pw, s_pw = rand_pw(), rand_pw()

st, body = http("POST", "/api/v1/auth/register",
                body={"email": t_email, "password": t_pw, "displayName": "r0-t114-teacher", "role": "TEACHER", "joinCode": JOIN})
print("register teacher:", st, sorted(json.loads(body).keys()) if st < 500 else body[:120])
TOK_T = json.loads(body).get("token") or json.loads(body).get("accessToken")
st, body = http("POST", "/api/v1/auth/register",
                body={"email": s_email, "password": s_pw, "displayName": "r0-t114-student"})
print("register student:", st, sorted(json.loads(body).keys()) if st < 500 else body[:120])
TOK_S = json.loads(body).get("token") or json.loads(body).get("accessToken")
if not TOK_T or not TOK_S:
    print("FATAL: no bearer resolved"); sys.exit(2)

# structured submit (student) -> attempt + answers
st, body = http("POST", "/api/v1/attempts/structured", TOK_S, {
    "questionId": Q, "responseTimeMs": 45000, "confidence": 3,
    "selfDoubtFlag": False, "timedCondition": False,
    "partAnswers": [
        {"partId": PA, "answerText": "probe answer part a \u2014 rig fixture"},
        {"partId": PB, "answerText": "probe answer part b \u2014 rig fixture"},
    ]})
print("structured submit:", st)
open(f"{OUT}/_setup-structured-submit.json", "w").write(body)
view = json.loads(body)
ATT = view["attemptId"]

def psql_scalar(sql):
    e = dict(os.environ, PATH="/home/z/my-project/pg17/tree/usr/lib/postgresql/17/bin:" + os.environ["PATH"],
             LD_LIBRARY_PATH="/home/z/my-project/pg17/tree/usr/lib/x86_64-linux-gnu:/home/z/my-project/pg17/tree/usr/lib/postgresql/17/lib")
    return subprocess.run(["psql", "-h", "127.0.0.1", "-p", "5544", "-U", "postgres", "-d", "syllabai_capture",
                           "-At", "-c", sql], capture_output=True, text=True, env=e).stdout.strip()

ANS_A = psql_scalar(f"select id from answers where attempt_id='{ATT}' and question_part_id='{PA}'")
ANS_B = psql_scalar(f"select id from answers where attempt_id='{ATT}' and question_part_id='{PB}'")
print("answers resolved:", bool(ANS_A), bool(ANS_B))

# leg-31 shape: 51-entry ppd map -> 400 (before any write)
st, body = http("POST", f"/api/v1/teacher/marking/answers/{ANS_A}/human-mark", TOK_T,
                {"marksAwarded": 1, "perPointDecisions": {f"p{i}": 1 for i in range(51)}})
print("leg-31 ppd-over50:", st, json.loads(body).get("message", "")[:80])
open(f"{OUT}/leg-31-humanmark-ppd-over50-400.json", "w").write(body)

# leg-34: the positive mark (map + comments)
st, body = http("POST", f"/api/v1/teacher/marking/answers/{ANS_A}/human-mark", TOK_T,
                {"marksAwarded": 2, "perPointDecisions": {P1: 1, P2: 0}, "comments": "probe mark: full credit part (a)"})
print("leg-34 human-mark:", st)
open(f"{OUT}/leg-34-humanmark-201-positive.json", "w").write(body)

# leg-35: THE ARBITER — detail read after the mapped mark
st, body = http("GET", f"/api/v1/teacher/marking/answers/{ANS_A}", TOK_T)
print("leg-35 detail:", st)
open(f"{OUT}/leg-35-answer-detail-post-mark-200.json", "w").write(body)
d = json.loads(body)
lhm = d.get("latestHumanMark") or {}
print(">>> ARBITER leg-35 latestHumanMark.perPointDecisions =", json.dumps(lhm.get("perPointDecisions")))

# leg-36: re-mark without a map
st, body = http("POST", f"/api/v1/teacher/marking/answers/{ANS_A}/human-mark", TOK_T,
                {"marksAwarded": 1, "comments": "revised: 1 mark"})
print("leg-36 re-mark:", st)
open(f"{OUT}/leg-36-humanmark-201-override.json", "w").write(body)

# leg-37: detail read after the override
st, body = http("GET", f"/api/v1/teacher/marking/answers/{ANS_A}", TOK_T)
print("leg-37 detail:", st)
open(f"{OUT}/leg-37-answer-detail-post-override-200.json", "w").write(body)
d2 = json.loads(body)
lhm2 = (d2.get("latestHumanMark") or {})
print(">>> leg-37 latestHumanMark.perPointDecisions =", json.dumps(lhm2.get("perPointDecisions")),
      "| markingState =", d2.get("markingState"), "| marksAwarded =", d2.get("marksAwarded"))

print("emails(fake-for-receipt):", "r0-t114-teacher-*/student-*", "| tokens: memory-only, never persisted")

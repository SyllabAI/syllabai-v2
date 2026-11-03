#!/usr/bin/env python3
"""t116_capture.py — B1 (T-MIG-116) rig capture: the marking SMART-MARK tails'
keyless laws from the LIVE LOCAL boot of the frozen core 6cad6ef — the STAGED
gate of the claim, executable now that the rig is rebuilt (the 107/113/114
recipe, docker-free).

The tails: POST /api/v1/teacher/marking/answers/{id}/smart-mark (:255-259) and
POST /api/v1/teacher/marking/smart-mark-batch (:231-235) + the detail GET that
shares the mid-path row grammar. The captured law classes (ALL keyless — the
dormant-generator posture means no LLM call fires):
  - the no-scheme 404 (SmartMarkService :112 -> refuseUnvalidatedScheme's
    orElseThrow: "mark scheme {versionId} not found")
  - the SCHEME_NOT_VALIDATED refusal (a non-VALIDATED newest scheme:
    refuseUnvalidatedScheme :306-322 — the SmartMarkResult row + the wire view)
  - the batch validation laws (@NotNull @NotEmpty @Size(max=50) — the verbatim
    jakarta strings) + the per-item outcome view (requested/marked/skipped/
    failed/items) + the dedup law (order-preserving, :237)
  - the unknown-answer 404 (the identity "%s %s not found" law)
Zero prod contact; every write on the local scratch db; zero LLM calls.
"""
import json, os, random, string, subprocess, sys, urllib.request, urllib.error

# T-MIG-122 re-derivation disclosure: the psql helper now FAILS LOUDLY (the
# of-record run swallowed a silent mark_schemes seed failure — the receipt's
# "SCHEME-PERSISTENCE artifact" class); the mark_points seed uses the REAL
# columns (ref/text — the of-record receipt's own column disclosure); the
# scheme row is ASSERTED before the band-T legs.

BASE = "http://127.0.0.1:8090"
REPO = "/home/z/my-project/repos/syllabai-v2"
OUT = f"{REPO}/golden-captures/t-mig-116"
os.makedirs(OUT, exist_ok=True)

PSQL_ENV = dict(os.environ,
    PATH="/home/z/my-project/toolchain/build/pg/usr/lib/postgresql/17/bin:" + os.environ["PATH"],
    LD_LIBRARY_PATH="/home/z/my-project/toolchain/build/pg/usr/lib/x86_64-linux-gnu:/home/z/my-project/toolchain/build/pg/usr/lib/postgresql/17/lib")

def psql(sql, db="syllabai_capture"):
    r = subprocess.run(["psql", "-h", "127.0.0.1", "-p", "5544", "-U", "postgres", "-d", db,
                        "-At", "-c", sql], capture_output=True, text=True, env=PSQL_ENV)
    if r.returncode != 0:
        print(f"  !! psql FAILED rc={r.returncode}: {r.stderr.strip()[:300]}", flush=True)
        raise SystemExit(2)
    out = r.stdout.strip()
    # THE SCHEME-PERSISTENCE ROOT CAUSE (the of-record artifact, explained):
    # psql -At appends the command tag ("INSERT 0 1") on its OWN LINE after
    # RETURNING rows — the of-record VID carried the tag, poisoning every
    # later uuid interpolation (the mark_schemes seed got
    # '45100000-...\nINSERT 0 1' -> silent uuid-syntax error -> no scheme ->
    # t01 404). The FIRST line is the row; the tag is never a row value.
    return out.splitlines()[0].strip() if out else ""

legs = []

def leg(name, method, path, token=None, body=None, raw_body=None, expect=None):
    req = urllib.request.Request(BASE + path, method=method)
    req.add_header("accept", "application/json")
    data = None
    if raw_body is not None:
        data = raw_body if isinstance(raw_body, bytes) else raw_body.encode()
        req.add_header("content-type", "application/json")
    elif body is not None:
        data = json.dumps(body).encode()
        req.add_header("content-type", "application/json")
    if token:
        req.add_header("authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req, data=data) as r:
            status, raw = r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        status, raw = e.code, e.read().decode()
    except Exception as e:
        status, raw = -1, str(e)[:200]
    safe = re.sub(r"[^a-z0-9._-]", "_", name.lower())
    with open(f"{OUT}/{safe}.json", "w") as f:
        f.write(raw)
    try:
        js = json.loads(raw)
    except Exception:
        js = raw[:300]
    verdict = "PASS" if (expect is None or status == expect) else "FAIL"
    hint = ""
    if isinstance(js, dict):
        hint = str(js.get("message", js.get("detail", "")))[:80]
    legs.append({"leg": name, "status": status, "verdict": verdict})
    print(f"  {name}: {status} (expect {expect}) {verdict} {('| ' + hint) if hint else ''}", flush=True)
    return status, js

import re

def rand_pw():
    return "".join(random.SystemRandom().choice(string.ascii_letters + string.digits) for _ in range(24))

print("== SUBSTRATE: the 113-class structured seed (fake-uuid law) ==", flush=True)
# the structured question + version + parts (the 113 rig-seed law, recreated)
psql("""
insert into questions (id, external_ref, question_type, stem, marks, difficulty, expected_time_seconds, command_word, primary_topic_node_id, provenance, active, version, created_at, exam_paper_id, difficulty_source)
values ('45000000-0000-0000-0000-000000000001', 'RIG-T116-SEED', 'STRUCTURED',
        'B1 rig seed question (smart-mark tail capture substrate)', 3, 2, 90, 'Explain',
        '20000000-0000-0000-0000-000000000011', 'SEED_DEMO', true, 1, now(), NULL, NULL)
on conflict (id) do nothing;""")
VID = psql("""
insert into question_versions (id, question_id, version, stem, marks, difficulty, expected_time_seconds, command_word, validation_state, created_at)
values ('45100000-0000-0000-0000-000000000001', '45000000-0000-0000-0000-000000000001', 1,
        'B1 rig seed question (smart-mark tail capture substrate)', 3, 2, 90, 'Explain', 'VALIDATED', now())
on conflict (id) do update set stem = excluded.stem, validation_state = 'VALIDATED' returning id;""")
if not VID:
    VID = psql("select id from question_versions where question_id='45000000-0000-0000-0000-000000000001' order by version desc limit 1")
# the ServableQuestionSpec law: a STRUCTURED question serves only when its
# CURRENT (highest) version is VALIDATED (the 113 seed's 'version VALIDATED' law)
psql("update question_versions set validation_state='VALIDATED' where id='" + VID + "'")
psql("""
insert into question_parts (id, question_version_id, label, prompt, command_word, marks, ordering, created_at) values
 ('45200000-0000-0000-0000-000000000001', '45100000-0000-0000-0000-000000000001', '(a)', 'seed part a', 'Explain', 2, 1, now()),
 ('45200000-0000-0000-0000-000000000002', '45100000-0000-0000-0000-000000000001', '(b)', 'seed part b', 'Explain', 1, 2, now())
on conflict (id) do nothing;""")
print(f"  question/version/parts seeded (vid={VID[:8]}..)", flush=True)

print("== SETUP: identities + the structured submit (the attempt + answers) ==", flush=True)
import uuid as _uuid
SALT = _uuid.uuid4().hex[:8]
T_EMAIL = f"t116-teacher-{SALT}@example.invalid"
S_EMAIL = f"t116-student-{SALT}@example.invalid"
TEACHER_PW = "Xx9!t116-teacher-rig"
STUDENT_PW = "Xx9!t116-student-rig"
st, b = leg("setup-register-teacher", "POST", "/api/v1/auth/register",
    body={"email": T_EMAIL, "password": TEACHER_PW,
          "displayName": "T116 Teacher", "role": "TEACHER", "joinCode": "rig-join-b124"}, expect=201)
TOK_T = b.get("token") or b.get("accessToken")
st, b = leg("setup-register-student", "POST", "/api/v1/auth/register",
    body={"email": S_EMAIL, "password": STUDENT_PW,
          "displayName": "T116 Student"}, expect=201)
TOK_S = b.get("token") or b.get("accessToken")
st, b = leg("setup-structured-submit", "POST", "/api/v1/attempts/structured", token=TOK_S,
    body={"questionId": "45000000-0000-0000-0000-000000000001", "responseTimeMs": 45000,
          "confidence": 3, "selfDoubtFlag": False, "timedCondition": False,
          "partAnswers": [
              {"partId": "45200000-0000-0000-0000-000000000001", "answerText": "B1 rig seed answer part a"},
              {"partId": "45200000-0000-0000-0000-000000000002", "answerText": "B1 rig seed answer part b"}]},
    expect=201)
ATT = b.get("attemptId")
ANS_A = psql(f"select id from answers where attempt_id='{ATT}' and question_part_id='45200000-0000-0000-0000-000000000001'")
ANS_B = psql(f"select id from answers where attempt_id='{ATT}' and question_part_id='45200000-0000-0000-0000-000000000002'")
print(f"  attempt {ATT[:8]}.. answers A={ANS_A[:8]}.. B={ANS_B[:8]}..", flush=True)

print("== BAND S: the smart-mark tail laws (no scheme -> the mark-scheme 404) ==", flush=True)
leg("s01-smartmark-unknown-answer", "POST", "/api/v1/teacher/marking/answers/11700000-0000-4000-8000-0000000000ff/smart-mark",
    token=TOK_T, body={}, expect=404)
leg("s02b-smartmark-no-scheme-404", "POST", f"/api/v1/teacher/marking/answers/{ANS_A}/smart-mark",
    token=TOK_T, body={}, expect=404)
leg("s03b-batch-no-scheme-items", "POST", "/api/v1/teacher/marking/smart-mark-batch",
    token=TOK_T, body={"answerIds": [ANS_A, ANS_B]}, expect=200)
leg("s04-batch-empty", "POST", "/api/v1/teacher/marking/smart-mark-batch",
    token=TOK_T, body={"answerIds": []}, expect=400)
leg("s05-batch-absent", "POST", "/api/v1/teacher/marking/smart-mark-batch",
    token=TOK_T, body={}, expect=400)
leg("s06-batch-51", "POST", "/api/v1/teacher/marking/smart-mark-batch",
    token=TOK_T, body={"answerIds": [ANS_A] * 51}, expect=400)
leg("s07-batch-dedup", "POST", "/api/v1/teacher/marking/smart-mark-batch",
    token=TOK_T, body={"answerIds": [ANS_A, ANS_A, ANS_B]}, expect=200)
leg("s08-batch-wrong-type", "POST", "/api/v1/teacher/marking/smart-mark-batch",
    token=TOK_T, body={"answerIds": "not-a-list"}, expect=400)
leg("s09-batch-bad-uuid", "POST", "/api/v1/teacher/marking/smart-mark-batch",
    token=TOK_T, body={"answerIds": ["not-a-uuid"]}, expect=400)
leg("s10-detail-unknown", "GET", "/api/v1/teacher/marking/answers/11700000-0000-4000-8000-0000000000ff",
    token=TOK_T, expect=404)

print("== BAND T: the SCHEME_NOT_VALIDATED refusal law (a SUGGESTED newest scheme) ==", flush=True)
psql(f"""
insert into mark_schemes (id, question_version_id, validation_state, created_at)
values ('45300000-0000-0000-0000-000000000001', '{VID}', 'SUGGESTED', now())
on conflict (id) do nothing;""")
psql("""
insert into mark_points (id, mark_scheme_id, question_part_id, ref, text, marks, ordering, created_at) values
 ('45400000-0000-0000-0000-000000000001', '45300000-0000-0000-0000-000000000001', '45200000-0000-0000-0000-000000000001', 'P1', 'seed point a1', 1, 1, now()),
 ('45400000-0000-0000-0000-000000000002', '45300000-0000-0000-0000-000000000001', '45200000-0000-0000-0000-000000000001', 'P2', 'seed point a2', 1, 2, now()),
 ('45400000-0000-0000-0000-000000000003', '45300000-0000-0000-0000-000000000001', '45200000-0000-0000-0000-000000000002', 'P3', 'seed point b1', 1, 3, now())
on conflict (id) do nothing;""")
SCHEME_N = psql("select count(*) from mark_schemes where id='45300000-0000-0000-0000-000000000001'")
if SCHEME_N != "1":
    print(f"  !! SCHEME-PERSISTENCE ASSERTION FAILED (count={SCHEME_N}) — aborting before the band-T legs", flush=True)
    raise SystemExit(2)
print("  scheme row asserted (the band-T substrate)", flush=True)
st, b = leg("t01-smartmark-scheme-not-validated", "POST", f"/api/v1/teacher/marking/answers/{ANS_A}/smart-mark",
    token=TOK_T, body={}, expect=200)
print(f"    (the refusal wire: {json.dumps(b)[:220]})", flush=True)
st, b = leg("t02-batch-scheme-not-validated", "POST", "/api/v1/teacher/marking/smart-mark-batch",
    token=TOK_T, body={"answerIds": [ANS_A, ANS_B]}, expect=200)
print(f"    (the batch wire: {json.dumps(b)[:260]})", flush=True)

passed = sum(1 for l in legs if l["verdict"] == "PASS")
failed = [l["leg"] for l in legs if l["verdict"] == "FAIL"]
print(f"\nB1 CAPTURE VERDICT: {passed}/{len(legs)} legs at expected statuses; failures: {failed or 'none'}", flush=True)
with open(f"{OUT}/capture_manifest.json", "w") as f:
    json.dump({"legs": legs, "attempt": ATT, "answer_a": ANS_A, "answer_b": ANS_B,
               "version": VID, "teacher_email": T_EMAIL, "student_email": S_EMAIL}, f, indent=1)
print(f"fixtures: {OUT}; manifest written", flush=True)

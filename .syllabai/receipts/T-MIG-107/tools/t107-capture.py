#!/usr/bin/env python3
"""
T-MIG-107 golden-verify leg — CAPTURE driver (run-001-capture-r0).

Captures the 17 content write surfaces from the LOCAL boot of the frozen
Java core 6cad6ef, per the T-MIG-088 capture recipe of record (GOLDEN_MASTER
§2: write surfaces are captured from a local boot, never prod Neon):
  - core jar: /home/z/build/core/target/syllabai-core-0.1.0-SNAPSHOT.jar
    (mvn -DskipTests package BUILD SUCCESS, JDK 25.0.4.1, Maven 3.9.9)
  - db: local PG 17.11 + pgvector 0.8.0 user-tree @ 127.0.0.1:5544,
    db syllabai_capture (Flyway V1..V63 applied at boot)
  - SYLLABAI_LLM_MODE=test; zero LLM keys; zero prod/Neon contact

Scrub discipline (the 088 pattern): tokens never persisted; emails masked;
real uuids mapped to stable fakes 00000000-0000-4000-8000-0000000000NN via
the emitted uuid-map.json (role-labelled); unknown uuids hashed
deterministically. Evidence: golden-captures/t-mig-107/leg-NN-*.json.
"""
import json, subprocess, hashlib, re, sys, os

BASE = "http://127.0.0.1:8090"
OUT = "/home/z/my-project/syllabai-v2/golden-captures/t-mig-107"
PGBIN = "/home/z/build/toolchain/pg/usr/lib/postgresql/17/bin"
PGENV = dict(os.environ, PGHOST="127.0.0.1", PGPORT="5544", PGUSER="postgres", PGDATABASE="syllabai_capture")
UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)
EMBED_RE = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.I)

os.makedirs(OUT, exist_ok=True)

def q(sql):
    r = subprocess.run([f"{PGBIN}/psql", "-tA", "-c", sql], env=PGENV, capture_output=True, text=True)
    if r.returncode != 0: sys.exit(f"sql failed: {r.stderr}")
    return r.stdout.strip()

# ── identity seed via the honest API (tokens in-memory ONLY) ──
def post(path, token=None, raw=None, body=None):
    headers = {"accept": "application/json", "content-type": "application/json"}
    if token: headers["authorization"] = f"Bearer {token}"
    data = raw if raw is not None else (json.dumps(body) if body is not None else None)
    import urllib.request
    req = urllib.request.Request(BASE + path, data=data.encode() if data else None, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        try: return e.code, json.loads(e.read().decode() or "{}")
        except Exception: return e.code, {}

TEACHER = LEARNER = ADMIN = None
s, b = post("/api/v1/auth/register", body={"email": "cap_teacher@example.invalid", "password": "capture-pass-2026x", "displayName": "Capture Teacher", "role": "TEACHER", "joinCode": "CAPTURE-CLASS-JOIN-2026"})
assert s == 201, f"teacher register {s} {b}"
TEACHER = b["accessToken"]
s, b = post("/api/v1/auth/register", body={"email": "cap_learner@example.invalid", "password": "capture-pass-2026x", "displayName": "Capture Learner", "role": "STUDENT"})
assert s == 201, f"learner register {s} {b}"
LEARNER = b["accessToken"]
s, b = post("/api/v1/auth/bootstrap-admin", body={"email": "cap_admin@example.invalid", "password": "capture-pass-2026x", "displayName": "Capture Admin"})
assert s in (200, 201), f"bootstrap-admin {s} {b}"
ADMIN = b.get("accessToken") or b.get("token")
print(f"identities seeded: teacher/learner/admin ({s} for admin)")

# ── scrub machinery ──
FAKE_BASE = 0
UUID_MAP = {}   # real uuid -> fake
ROLE_OF = {}    # fake -> role label

def map_uuid(real, role=None):
    global FAKE_BASE
    if real in UUID_MAP:
        if role: ROLE_OF[UUID_MAP[real]] = role
        return UUID_MAP[real]
    FAKE_BASE += 1
    fake = f"00000000-0000-4000-8000-{FAKE_BASE:012d}"
    UUID_MAP[real] = fake
    ROLE_OF[fake] = role or f"uuid-{FAKE_BASE}"
    return fake

def scrub_value(v, role_hint=None):
    """walk a JSON value; uuids -> stable fakes; nothing else touched"""
    if isinstance(v, str) and UUID_RE.match(v):
        return map_uuid(v.lower(), role_hint)
    if isinstance(v, list): return [scrub_value(x) for x in v]
    if isinstance(v, dict): return {k: scrub_value(x, role_hint if role_hint is None else f"{role_hint}.{k}") for k, x in v.items()}
    return v

def scrub_text(t):
    """scrub uuids embedded in strings (paths/messages)"""
    def rep(m):
        u = m.group(0).lower()
        return UUID_MAP.get(u) or map_uuid(u, "embedded")
    return EMBED_RE.sub(rep, t)

def scrub_deep(v):
    if isinstance(v, str): return scrub_text(v)
    if isinstance(v, list): return [scrub_deep(x) for x in v]
    if isinstance(v, dict): return {k: scrub_deep(x) for k, x in v.items()}
    return v

# ── request definitions of record ──
CANONICAL_OK = {
    "schemaVersion": "1.0", "documentId": "7e2298bb-c091-5188-a9df-ff94312908ea", "version": 1, "pageCount": 1,
    "textBlocks": [{"element_id": "t1", "element_type": "TEXT_BLOCK", "page_number": 1,
                    "reading_order": 0, "text": "capture document body",
                    "source_engine": "glm", "source_engine_version": "1"}],
    "provenance": {"engine": "glm", "engineVersion": "1"},
    "source": {"uri": "gs://capture/f.pdf", "mimeType": "application/pdf", "checksum": "capture-checksum-1"},
}
# NOTE: documentId is NOT arbitrary — the core's CanonicalDocumentValidator derives it
# (uuidv5 over checksum+engine+engineVersion, the V33 identity law) and rejects a
# mismatching documentId with 400 invalid_document. The value above is the derivation
# the core itself named in the first boot's rejection message — deterministic.
DRAFT = lambda code, with_scheme=True: {
    "schemaVersion": "1.0",
    "paper": {"board": "CIE", "qualification": "A Level", "subject": "9706", "unit": None,
              "sessionLabel": f"June 2014 {code}", "paperCode": code,
              "questionPaperDocumentId": None, "markSchemeDocumentId": None},
    "questions": [{"externalRef": None, "questionNumber": "1", "prompt": "stem", "commandWord": None,
                   "marks": 2, "questionType": "STRUCTURED", "pageNumber": 2, "confidence": 0.9,
                   "parts": [{"label": "(a)", "prompt": "part text", "commandWord": None, "marks": 2, "confidence": 0.9}]}],
    **({"markScheme": {"version": "1", "sourceDocumentId": None,
                       "points": [{"questionRef": "1", "order": 1, "text": "pt", "marks": 2, "acceptance": None, "confidence": 0.8}],
                       "generalGuidance": None}} if with_scheme else {}),
    "extractionMethod": "glm-ocr", "reviewRequired": False,
}
BAD_DRAFT = {**DRAFT("9706/99"), "schemaVersion": "9.9"}

LEDGER = []   # capture records
def capture(leg, method, path, token, raw=None, body=None, role_hint=None):
    import urllib.request, urllib.error
    headers = {"accept": "application/json", "content-type": "application/json"}
    if token: headers["authorization"] = f"Bearer {token}"
    data = raw if raw is not None else (json.dumps(body) if body is not None else None)
    req = urllib.request.Request(BASE + path, data=data.encode() if data else None, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as r:
            status, text = r.code, r.read().decode()
    except urllib.error.HTTPError as e:
        status, text = e.code, e.read().decode()
    try: body_json = json.loads(text or "{}")
    except Exception: body_json = {"__unparsed": text[:400]}
    scrubbed = scrub_deep(body_json)
    LEDGER.append({"leg": leg, "method": method, "path": scrub_text(path), "status": status, "body": scrubbed})
    print(f"  {leg}: {status} {scrub_text(path)[:90]}")
    return status, body_json

# substrate id resolvers (SQL, post-ingestion)
def resolve(sql):
    v = q(sql)
    assert v, f"resolver empty: {sql}"
    return v

print("── phase 1: documents ──")
capture("leg-01-documents-no-token-401", "POST", "/api/v1/teacher/content/documents", None, body=CANONICAL_OK)
capture("leg-02-documents-learner-403", "POST", "/api/v1/teacher/content/documents", LEARNER, body=CANONICAL_OK)
s, b = capture("leg-03-documents-201", "POST", "/api/v1/teacher/content/documents", TEACHER, body=CANONICAL_OK)
capture("leg-04-documents-parse-fail-400", "POST", "/api/v1/teacher/content/documents", TEACHER, raw="{not-json")
s, b = capture("leg-05-documents-dedup-201", "POST", "/api/v1/teacher/content/documents", TEACHER, body=CANONICAL_OK)
capture("leg-06-documents-kind-conflict-409", "POST", "/api/v1/teacher/content/documents?kind=QUESTION_PAPER", TEACHER, body=CANONICAL_OK)

print("── phase 2: past-papers ──")
s, b = capture("leg-07-past-papers-201", "POST", "/api/v1/teacher/content/past-papers", TEACHER, body=DRAFT("9706/11"))
P1 = resolve("select id from exam_papers where paper_code='9706/11'"); map_uuid(P1, "paper1")
capture("leg-08-past-papers-p2-201", "POST", "/api/v1/teacher/content/past-papers", TEACHER, body=DRAFT("9706/12"))
P2 = resolve("select id from exam_papers where paper_code='9706/12'"); map_uuid(P2, "paper2")
capture("leg-09-past-papers-p3-noscheme-201", "POST", "/api/v1/teacher/content/past-papers", TEACHER, body=DRAFT("9706/13", with_scheme=False))
P3 = resolve("select id from exam_papers where paper_code='9706/13'"); map_uuid(P3, "paper3")
capture("leg-10-past-papers-schema-409", "POST", "/api/v1/teacher/content/past-papers", TEACHER, body=BAD_DRAFT)

print("── phase 3: exam-paper writes ──")
capture("leg-11-validate-all-p1-200", "POST", f"/api/v1/teacher/content/exam-papers/{P1}/validate-all", TEACHER)
capture("leg-12-validate-p1-200", "POST", f"/api/v1/teacher/content/exam-papers/{P1}/validate", TEACHER)
capture("leg-13-validate-p2-unvalidated-409", "POST", f"/api/v1/teacher/content/exam-papers/{P2}/validate", TEACHER)
capture("leg-14-validate-all-p3-schemeless-409", "POST", f"/api/v1/teacher/content/exam-papers/{P3}/validate-all", TEACHER)
SUBJECT = resolve("select id from subjects order by created_at limit 1")
map_uuid(SUBJECT, "subject1")
capture("leg-15-place-p1-unknown-subject-404", "POST", f"/api/v1/teacher/content/exam-papers/{P1}/place", TEACHER, body={"subjectId": "00000000-0000-4000-8000-0000000000ff"})
capture("leg-16-place-p1-200", "POST", f"/api/v1/teacher/content/exam-papers/{P1}/place", TEACHER, body={"subjectId": SUBJECT})
capture("leg-17-place-p1-again-200", "POST", f"/api/v1/teacher/content/exam-papers/{P1}/place", TEACHER, body={"subjectId": SUBJECT})
capture("leg-18-place-no-token-401", "POST", f"/api/v1/teacher/content/exam-papers/{P1}/place", None, body={"subjectId": SUBJECT})
capture("leg-19-flag-p1-200", "POST", f"/api/v1/teacher/content/exam-papers/{P1}/flag", TEACHER)
capture("leg-20-flag-p1-flagged-500", "POST", f"/api/v1/teacher/content/exam-papers/{P1}/flag", TEACHER)
capture("leg-21-unflag-p1-200", "POST", f"/api/v1/teacher/content/exam-papers/{P1}/unflag", TEACHER)
capture("leg-22-reject-p1-200", "POST", f"/api/v1/teacher/content/exam-papers/{P1}/reject", TEACHER)
capture("leg-23-flag-p1-rejected-500", "POST", f"/api/v1/teacher/content/exam-papers/{P1}/flag", TEACHER)
capture("leg-24-validate-all-p1-rejected-409", "POST", f"/api/v1/teacher/content/exam-papers/{P1}/validate-all", TEACHER)
capture("leg-25-unflag-p2-notflagged-500", "POST", f"/api/v1/teacher/content/exam-papers/{P2}/unflag", TEACHER)
capture("leg-26-validate-unknown-paper-404", "POST", "/api/v1/teacher/content/exam-papers/00000000-0000-4000-8000-0000000000fe/validate", TEACHER)

print("── phase 4: question-version writes ──")
PVSQL = "select v.id from question_versions v join questions q on q.id=v.question_id where q.exam_paper_id='%s' order by v.created_at limit 1"
PV1 = resolve(PVSQL % P1); PV2 = resolve(PVSQL % P2); PV3 = resolve(PVSQL % P3)
map_uuid(PV1, "version1"); map_uuid(PV2, "version2"); map_uuid(PV3, "version3")
capture("leg-27-validate-unknown-version-404", "POST", "/api/v1/teacher/content/question-versions/00000000-0000-4000-8000-0000000000fd/validate", TEACHER)
capture("leg-28-validate-pv2-200", "POST", f"/api/v1/teacher/content/question-versions/{PV2}/validate", TEACHER)
capture("leg-29-validate-pv2-again-200", "POST", f"/api/v1/teacher/content/question-versions/{PV2}/validate", TEACHER)
capture("leg-30-reject-pv3-200", "POST", f"/api/v1/teacher/content/question-versions/{PV3}/reject", TEACHER)
capture("leg-31-flag-pv2-200", "POST", f"/api/v1/teacher/content/question-versions/{PV2}/flag", TEACHER)
capture("leg-32-unflag-pv2-200", "POST", f"/api/v1/teacher/content/question-versions/{PV2}/unflag", TEACHER)
capture("leg-33-unflag-pv2-again-500", "POST", f"/api/v1/teacher/content/question-versions/{PV2}/unflag", TEACHER)
capture("leg-34-flag-pv3-rejected-500", "POST", f"/api/v1/teacher/content/question-versions/{PV3}/flag", TEACHER)

print("── phase 5: mark-scheme writes ──")
S1 = resolve("select ms.id from mark_schemes ms join question_versions v on v.id=ms.question_version_id join questions q on q.id=v.question_id where q.exam_paper_id='%s' limit 1" % P1)
S2 = resolve("select ms.id from mark_schemes ms join question_versions v on v.id=ms.question_version_id join questions q on q.id=v.question_id where q.exam_paper_id='%s' limit 1" % P2)
map_uuid(S1, "scheme1"); map_uuid(S2, "scheme2")
MP1 = resolve("select id from mark_points where mark_scheme_id='%s' order by ordering limit 1" % S1)
map_uuid(MP1, "markpoint1")
capture("leg-35-validate-scheme-s2-200", "POST", f"/api/v1/teacher/content/mark-schemes/{S2}/validate", TEACHER)
capture("leg-36-validate-scheme-s1-criteria-200", "POST", f"/api/v1/teacher/content/mark-schemes/{S1}/validate", TEACHER, body={"criteria": [{"markPointId": MP1, "acceptanceCriteria": ["names the provision"]}]}
        )
capture("leg-37-validate-scheme-unknown-point-404", "POST", f"/api/v1/teacher/content/mark-schemes/{S1}/validate", TEACHER, body={"criteria": [{"markPointId": "00000000-0000-4000-8000-0000000000fc", "acceptanceCriteria": ["x"]}]}
        )
capture("leg-38-validate-scheme-null-point-404", "POST", f"/api/v1/teacher/content/mark-schemes/{S1}/validate", TEACHER, body={"criteria": [{"markPointId": None, "acceptanceCriteria": ["x"]}]}
        )
capture("leg-39-validate-unknown-scheme-404", "POST", "/api/v1/teacher/content/mark-schemes/00000000-0000-4000-8000-0000000000fb/validate", TEACHER)
capture("leg-40-reject-scheme-s1-core-defect-500", "POST", f"/api/v1/teacher/content/mark-schemes/{S1}/reject", TEACHER)
capture("leg-41-flag-scheme-s2-core-defect-500", "POST", f"/api/v1/teacher/content/mark-schemes/{S2}/flag", TEACHER)
capture("leg-42-unflag-scheme-s2-postdefect-500", "POST", f"/api/v1/teacher/content/mark-schemes/{S2}/unflag", TEACHER)
capture("leg-43-unflag-scheme-s2-again-500", "POST", f"/api/v1/teacher/content/mark-schemes/{S2}/unflag", TEACHER)
capture("leg-44-flag-scheme-s1-rejected-500", "POST", f"/api/v1/teacher/content/mark-schemes/{S1}/flag", TEACHER)

print("── phase 6: topics ──")
QV7 = resolve("select id from questions order by created_at limit 1")
map_uuid(QV7, "question1")
TOPIC = resolve("select id from knowledge_nodes where node_type='TOPIC' and code not like 'ING-%' order by code limit 1")
map_uuid(TOPIC, "topic1")
ANCHOR = resolve("select n.id from knowledge_nodes n where n.code like 'ING-%' order by n.code limit 1")
map_uuid(ANCHOR, "anchor1")
capture("leg-45-topics-no-token-401", "GET", f"/api/v1/teacher/content/questions/{QV7}/topics", None)
capture("leg-46-topics-post-rnd-q-404", "POST", f"/api/v1/teacher/content/questions/00000000-0000-4000-8000-0000000000fa/topics", TEACHER, body={"primaryNodeId": "00000000-0000-4000-8000-000000000001", "secondaryNodeIds": []})
capture("leg-47-topics-post-bad-body-400", "POST", f"/api/v1/teacher/content/questions/{QV7}/topics", TEACHER, body={"unexpected": True})
capture("leg-48-topics-unknown-primary-404", "POST", f"/api/v1/teacher/content/questions/{QV7}/topics", TEACHER, body={"primaryNodeId": "00000000-0000-4000-8000-0000000000f9", "secondaryNodeIds": []})
capture("leg-49-topics-anchor-primary-409", "POST", f"/api/v1/teacher/content/questions/{QV7}/topics", TEACHER, body={"primaryNodeId": ANCHOR, "secondaryNodeIds": []})
capture("leg-50-topics-200", "POST", f"/api/v1/teacher/content/questions/{QV7}/topics", TEACHER, body={"primaryNodeId": TOPIC, "secondaryNodeIds": []})
capture("leg-51-topics-rewrite-200", "POST", f"/api/v1/teacher/content/questions/{QV7}/topics", TEACHER, body={"primaryNodeId": TOPIC, "secondaryNodeIds": []})
capture("leg-52-topics-anchor-secondary-409", "POST", f"/api/v1/teacher/content/questions/{QV7}/topics", TEACHER, body={"primaryNodeId": TOPIC, "secondaryNodeIds": [ANCHOR]})
capture("leg-53-topics-learner-403", "POST", f"/api/v1/teacher/content/questions/{QV7}/topics", LEARNER, body={"primaryNodeId": TOPIC, "secondaryNodeIds": []})

# ── emit ──
for rec in LEDGER:
    with open(f"{OUT}/{rec['leg']}.json", "w") as f:
        json.dump({**rec, "body_encoding": "json", "captured_at_utc": "2026-10-09T00:00:00Z",
                   "source": ("LOCAL boot of frozen Java core 6cad6ef (mvn -DskipTests package BUILD SUCCESS, JDK 25.0.4.1 "
                              "+ Maven 3.9.9, Flyway V1..V63 at boot) on LOCAL scratch PostgreSQL 17.11 + pgvector 0.8.0 "
                              "user-tree (trixie debs dpkg -x), port 5544, db syllabai_capture, server.port 8090; "
                              "SYLLABAI_LLM_MODE=test fail-closed; GROQ/GEMINI/OPENROUTER absent; synthetic join code; "
                              "identities via the honest register/bootstrap-admin path; tokens scrubbed from evidence; "
                              "uuids mapped to stable fakes via uuid-map.json (role-labelled); zero prod/Neon contact; "
                              "R0-integrator, operator trace 1a11f7bc1d47fa31")},
                  f, indent=1, sort_keys=True)
with open(f"{OUT}/uuid-map.json", "w") as f:
    json.dump({"version": 1, "note": "role-labelled fake uuid map — the verify driver resolves the SAME roles on the verify substrate; fakes are 00000000-0000-4000-8000-<seq>", "roles": ROLE_OF, "map": UUID_MAP}, f, indent=1, sort_keys=True)
print(f"EMITTED {len(LEDGER)} legs + uuid-map ({len(UUID_MAP)} uuids mapped) -> {OUT}")

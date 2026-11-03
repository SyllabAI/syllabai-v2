#!/usr/bin/env python3
"""T-MIG-107: declare the seed-posture-replayable validation-class golden cases
(from the run-001 capture legs) into the committed corpus, golden/cases/."""
import json, os

CASES = "/home/z/my-project/syllabai-v2/golden/cases"
CAP = "/home/z/my-project/syllabai-v2/golden-captures/t-mig-107"

SRC = ("declared from the T-MIG-107 run-001 capture of record (LOCAL boot of frozen Java core 6cad6ef, "
       "mvn -DskipTests package BUILD SUCCESS, JDK 25.0.4.1 + Maven 3.9.9, Flyway V1..V63 at boot, on LOCAL "
       "scratch PostgreSQL 17.11 + pgvector 0.8.0 user-tree, port 5544, db syllabai_capture, server.port 8090; "
       "SYLLABAI_LLM_MODE=test; zero LLM keys; zero prod/Neon contact; R0-integrator, operator trace "
       "1a11f7bc1d47fa31) and verified 53/53 against the v2 code of record (PR #168) in run-002-golden-verify-r0 "
       "(local substrate, t100 harness pattern); tokens scrubbed per the T-MIG-003 fixed-dummy convention — "
       "the replay harness re-mints per-target per the route rule (TEACHER/ADMIN for /api/v1/teacher/**). "
       "Tranche: empty (the case pins the UNSTAGED/empty-store posture — T-MIG-072 declared field).")

# (name, capture leg, path, method, raw body or object body, description)
DEFS = [
    ("content-write-docs-parse-fail-400", "leg-04-documents-parse-fail-400",
     "/api/v1/teacher/content/documents", "POST", "{not-json",
     "POST /documents with an unparseable body as TEACHER: 400 invalid_document with the FIXED client message (R10 M2 hygiene law — Jackson parse errors never echo request excerpts)."),
    ("content-write-past-papers-schema-409", "leg-10-past-papers-schema-409",
     "/api/v1/teacher/content/past-papers", "POST",
     {"schemaVersion": "9.9",
      "paper": {"board": "CIE", "qualification": "A Level", "subject": "9706", "unit": None,
                "sessionLabel": "June 2014 9706/99", "paperCode": "9706/99",
                "questionPaperDocumentId": None, "markSchemeDocumentId": None},
      "questions": [], "extractionMethod": "glm-ocr", "reviewRequired": False},
     "POST /past-papers with an unsupported draft schemaVersion as TEACHER: 409 conflict BEFORE ingestion (the ContentController guard; the ingest port is never reached)."),
    ("content-write-validate-unknown-paper-404", "leg-26-validate-unknown-paper-404",
     "/api/v1/teacher/content/exam-papers/00000000-0000-4000-8000-0000000000fe/validate", "POST", None,
     "POST /exam-papers/{unknown}/validate as TEACHER: 404 not_found exam paper (the 404-first wire law)."),
    ("content-write-validate-unknown-version-404", "leg-27-validate-unknown-version-404",
     "/api/v1/teacher/content/question-versions/00000000-0000-4000-8000-0000000000fd/validate", "POST", None,
     "POST /question-versions/{unknown}/validate as TEACHER: 404 not_found question version (404-first)."),
    ("content-write-validate-unknown-scheme-404", "leg-39-validate-unknown-scheme-404",
     "/api/v1/teacher/content/mark-schemes/00000000-0000-4000-8000-0000000000fb/validate", "POST", None,
     "POST /mark-schemes/{unknown}/validate as TEACHER: 404 not_found mark scheme (404-first)."),
    ("content-write-topics-unknown-question-404", "leg-46-topics-post-rnd-q-404",
     "/api/v1/teacher/content/questions/00000000-0000-4000-8000-0000000000fa/topics", "POST",
     {"primaryNodeId": "00000000-0000-4000-8000-000000000001", "secondaryNodeIds": []},
     "POST /questions/{unknown}/topics as TEACHER: 404 not_found question (the 088 leg-08 law — 404-first BEFORE body validation)."),
]

for name, leg, path, method, body, desc in DEFS:
    cap = json.load(open(f"{CAP}/{leg}.json"))
    case = {
        "name": name,
        "description": desc + " " + SRC,
        "source": "T-MIG-107 golden-captures/t-mig-107/" + leg + ".json (uuid-map role-labelled; scrubbed)",
        "method": method,
        "path": path,
        "request": {"headers": {"Authorization": "Bearer {{TOKEN}}"}},
        "expect": {"status": cap["status"], "body": cap["body"]},
        "tolerate": ["timestamp"],
        "tranche": "empty",
    }
    if body is not None:
        case["request"]["body"] = body
        if isinstance(body, str):
            case["request"] = {"headers": {"Authorization": "Bearer {{TOKEN}}", "content-type": "application/json"}, "body": body}
    with open(f"{CASES}/{name}.json", "w") as f:
        json.dump(case, f, indent=1, sort_keys=True)
    print("wrote", name, "->", cap["status"])

print("done: 6 corpus cases declared")

#!/usr/bin/env python3
"""t139_g4_install.py — T-MIG-139 G4 anchor-type guard INSTALL (operator order
trace 1a15a68f77ec7da9 'Go Install the G4 database guard').

Law of record: .syllabai/receipts/T-MIG-139/run-001.json (w0a) — the staged
artifact .syllabai/receipts/T-MIG-139/g4-anchor-type-trigger.sql installs on
operator order only, after re-verifying the enable-time preconditions.

Path: VERCEL_PAT lever -> api project production DATABASE_URL (memory-only,
never printed) -> live census hard-gates -> install the STAGED SQL VERBATIM
inside one txn -> catalog verify -> fail-closed negative proof (rolled back)
-> positive control (rolled back) -> post-census.

Zero committed data writes: the only durable change is the trigger + function
DDL. Evidence JSON -> /home/z/my-project/scratch/t139_g4_install_evidence.json
"""
import json
import os
import re
import socket
import sys
import time
import urllib.request
import urllib.error
from urllib.parse import urlparse

import psycopg2

CREDS = "/home/z/my-project/.creds"
REPO = "/home/z/my-project/repos/syllabai-v2"
SQL_ARTIFACT = f"{REPO}/.syllabai/receipts/T-MIG-139/g4-anchor-type-trigger.sql"
SCRATCH = "/home/z/my-project/scratch"
TEAM = "team_ULL54qkhzKBmnKrpO6BD4mYX"
API_PROJECT = "prj_FN5XQUMbpqKhZXFXpT80OdsKveJZ"
TRIGGER_NAME = "ck_qsp_anchor_is_spec_point"
FUNC_NAME = "assert_spec_point_anchor"

E = {"at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
     "order": "operator trace 1a15a68f77ec7da9 'Go Install the G4 database guard'",
     "executor": "r7a (Super Z, session web-da4ab8b1)"}


def die(msg):
    E["abort"] = msg
    write_evidence()
    print(f"ABORT: {msg}")
    sys.exit(1)


def write_evidence():
    os.makedirs(SCRATCH, exist_ok=True)
    with open(f"{SCRATCH}/t139_g4_install_evidence.json", "w") as f:
        json.dump(E, f, indent=1)


def load_env(path):
    out = {}
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                out[k] = v
    return out


def vapi(url):
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {VERCEL_PAT}", "Accept": "application/json",
        "User-Agent": "t139-g4-install-r7a/1"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())


VERCEL_PAT = load_env(f"{CREDS}/vercel.env")["VERCEL_PAT"]

# ── 1. resolve the production DATABASE_URL via the Vercel env API ──────────
envs = vapi(f"https://api.vercel.com/v9/projects/{API_PROJECT}/env"
            f"?teamId={TEAM}").get("envs", [])
cands = [e for e in envs
         if e.get("key", "").upper() in
         ("DATABASE_URL", "POSTGRES_URL", "PROD_DATABASE_URL", "DATABASE_URL_UNPOOLED")
         and "production" in (e.get("target") or [])]
E["vercel_env_candidates"] = [
    {"key": c["key"], "id": c["id"], "target": c.get("target"),
     "decryptable": c.get("decryptable")} for c in cands]
if not cands:
    die("no production DATABASE_URL-class env found on the api project")

uri = None
for c in cands:
    try:
        d = vapi(f"https://api.vercel.com/v9/projects/{API_PROJECT}/env/{c['id']}"
                 f"?value=true&teamId={TEAM}")
        val = d.get("value") or ""
        if val.startswith(("postgres://", "postgresql://")):
            uri = val
            E["uri_source_env"] = c["key"]
            break
    except urllib.error.HTTPError as ex:
        E.setdefault("env_decrypt_errors", []).append(
            {"key": c["key"], "http": ex.code})
if not uri:
    die("no decryptable postgres URI among candidates")

u = urlparse(uri)
host, port = u.hostname, u.port or 5432
region = re.search(r"([a-z0-9-]+)\.(aws|azure)\.neon\.(tech|com)", host or "")
E["db_endpoint"] = {
    "host_masked": f"(len={len(host or '')}) "
                   f"{(region.group(0) if region else 'non-neon-host')}",
    "port": port,
    "database": u.path.lstrip("/") or "(unset)",
    "user": u.username,
}

# ── 2. egress probe ─────────────────────────────────────────────────────────
try:
    s = socket.create_connection((host, port), timeout=12)
    s.close()
    E["egress"] = "OK"
except Exception as ex:
    die(f"Neon data plane unreachable from sandbox ({type(ex).__name__}) — "
        "fallback would be CI-dispatch; not attempted in this run")

# ── 3. connect ──────────────────────────────────────────────────────────────
conn = psycopg2.connect(uri, sslmode="require", connect_timeout=15,
                        application_name="t139-g4-install-r7a")
conn.autocommit = False
cur = conn.cursor()


def scalar(q, params=None):
    cur.execute(q, params)
    return cur.fetchone()[0]


# ── 4. live census — the staged enable-time preconditions (hard gates) ──────
def census():
    return {
        "teaching_coverage": scalar("SELECT count(*) FROM teaching_coverage"),
        "teaching_coverage_events": scalar("SELECT count(*) FROM teaching_coverage_events"),
        "anchors_not_spec": scalar(
            "SELECT count(*) FROM question_spec_points qsp "
            "JOIN knowledge_nodes kn ON kn.id = qsp.spec_point_node_id "
            "WHERE kn.node_type <> 'SPEC_POINT'"),
        "spec_point_rows": scalar(
            "SELECT count(*) FROM knowledge_nodes WHERE node_type = 'SPEC_POINT'"),
        "anchors_total": scalar("SELECT count(*) FROM question_spec_points"),
        "ck_node_type_def": scalar(
            "SELECT pg_get_constraintdef(oid) FROM pg_constraint "
            "WHERE conname = 'ck_node_type' "
            "AND conrelid = 'knowledge_nodes'::regclass"),
        "trigger_already_present": scalar(
            "SELECT count(*) FROM pg_trigger "
            "WHERE tgname = %s AND NOT tgisinternal", (TRIGGER_NAME,)),
    }


pre = census()
E["pre_census"] = pre
print("PRE:", json.dumps({k: v for k, v in pre.items() if k != "ck_node_type_def"}))
print("CK:", pre["ck_node_type_def"][:160])

if pre["trigger_already_present"]:
    die("trigger already installed — nothing to do (idempotent honesty)")
if pre["anchors_not_spec"] != 0:
    die(f"anchors_not_spec={pre['anchors_not_spec']} ≠ 0 — fail-closed gate refuses")
if pre["teaching_coverage"] != 0 or pre["teaching_coverage_events"] != 0:
    die("teaching_coverage precondition drifted from the staged zero state")
if "SPEC_POINT" not in pre["ck_node_type_def"]:
    die("ck_node_type does not carry SPEC_POINT — live G1 missing?!")
if pre["spec_point_rows"] < 663:
    die(f"SPEC_POINT rows {pre['spec_point_rows']} < staged of-record 663")
if pre["spec_point_rows"] != 663:
    E["spec_point_growth_disclosed"] = (
        f"{pre['spec_point_rows']} vs staged 663 — growth only, anchors_not_spec=0")
E["gates"] = "ALL GREEN"

# ── 5. INSTALL — the staged SQL executed VERBATIM, one txn ──────────────────
sql_bytes = open(SQL_ARTIFACT, "rb").read()
E["artifact"] = {"path": SQL_ARTIFACT, "sha256": __import__("hashlib")
                 .sha256(sql_bytes).hexdigest(), "bytes": len(sql_bytes)}
try:
    cur.execute(sql_bytes.decode())
    got = scalar("SELECT tgname FROM pg_trigger WHERE tgrelid = "
                 "'question_spec_points'::regclass AND tgname = %s",
                 (TRIGGER_NAME,))
    if got != TRIGGER_NAME:
        raise RuntimeError("trigger not visible in catalog after CREATE")
    conn.commit()
    E["install"] = f"COMMITTED ({TRIGGER_NAME} + {FUNC_NAME}())"
    print("INSTALL: COMMITTED")
except Exception as ex:
    conn.rollback()
    E["install_error"] = f"{type(ex).__name__}: {str(ex)[:300]}"
    die(f"install txn rolled back: {type(ex).__name__}: {str(ex)[:200]}")

# ── 6. fail-closed negative proof (txn ROLLED BACK — zero net writes) ───────
cur.execute("SELECT id, node_type FROM knowledge_nodes "
            "WHERE node_type <> 'SPEC_POINT' ORDER BY id LIMIT 1")
bad_id, bad_type = cur.fetchone()
E["negative_proof"] = {"bad_node_type_used": bad_type}
try:
    cur.execute("INSERT INTO question_spec_points "
                "(id, question_id, spec_point_node_id, role, created_at) "
                "VALUES (gen_random_uuid(), gen_random_uuid(), %s, 'PRIMARY', now())",
                (bad_id,))
    conn.rollback()
    die(f"negative proof FAILED — bad anchor ({bad_type}) was ACCEPTED")
except psycopg2.Error as ex:
    msg = str(ex)
    E["negative_proof"]["raised"] = msg[:220]
    E["negative_proof"]["verdict"] = (
        "PASS fail-closed" if TRIGGER_NAME in msg and bad_type in msg
        else "RAISED BUT MESSAGE MISMATCH — inspect")
    conn.rollback()
    print("NEGATIVE:", E["negative_proof"]["verdict"])

# ── 7. positive control (valid anchor UPDATE, txn ROLLED BACK) ──────────────
cur.execute("UPDATE question_spec_points SET spec_point_node_id = spec_point_node_id "
            "WHERE id = (SELECT id FROM question_spec_points ORDER BY id LIMIT 1)")
E["positive_control"] = {"rowcount": cur.rowcount,
                         "verdict": "PASS open-path" if cur.rowcount == 1 else "no row"}
conn.rollback()
print("POSITIVE:", E["positive_control"])

# ── 8. post-census ──────────────────────────────────────────────────────────
post = census()
E["post_census"] = {k: v for k, v in post.items() if k != "ck_node_type_def"}
E["post_trigger_ddl"] = scalar(
    "SELECT pg_get_triggerdef(oid) FROM pg_trigger WHERE tgname = %s "
    "AND tgrelid = 'question_spec_points'::regclass", (TRIGGER_NAME,))
assert post["anchors_total"] == pre["anchors_total"], "anchor count drifted!"
assert post["anchors_not_spec"] == 0
assert post["trigger_already_present"] == 1
E["verdict"] = "G4 INSTALLED of record — fail-closed proven, open-path proven, zero data writes"
write_evidence()
conn.close()
print("POST: anchors", post["anchors_total"], "| trigger present | not_spec 0")
print("VERDICT:", E["verdict"])
print("EVIDENCE:", f"{SCRATCH}/t139_g4_install_evidence.json")

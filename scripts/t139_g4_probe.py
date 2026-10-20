#!/usr/bin/env python3
"""t139_g4_probe.py — read-only: which relation carries the G4-named trigger,
its full definition, the function source, and a fail-closed spot probe."""
import json
import re
import urllib.request
from urllib.parse import urlparse

import psycopg2

CREDS = "/home/z/my-project/.creds"
TEAM = "team_ULL54qkhzKBmnKrpO6BD4mYX"
API_PROJECT = "prj_FN5XQUMbpqKhZXFXpT80OdsKveJZ"


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
        "Authorization": f"Bearer {load_env(f'{CREDS}/vercel.env')['VERCEL_PAT']}",
        "Accept": "application/json", "User-Agent": "t139-g4-probe-r7a/1"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())


envs = vapi(f"https://api.vercel.com/v9/projects/{API_PROJECT}/env?teamId={TEAM}")["envs"]
uri = None
for c in [e for e in envs if e["key"].upper() in ("DATABASE_URL", "POSTGRES_URL")
          and "production" in (e.get("target") or [])]:
    d = vapi(f"https://api.vercel.com/v9/projects/{API_PROJECT}/env/{c['id']}?value=true&teamId={TEAM}")
    if (d.get("value") or "").startswith(("postgres://", "postgresql://")):
        uri = d["value"]
        break

conn = psycopg2.connect(uri, sslmode="require", connect_timeout=15,
                        application_name="t139-g4-probe-r7a")
conn.autocommit = True
cur = conn.cursor()

cur.execute("""
SELECT n.nspname AS schema, c.relname AS table_name, t.tgenabled,
       pg_get_triggerdef(t.oid) AS def
FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE t.tgname = 'ck_qsp_anchor_is_spec_point'""")
rows = cur.fetchall()
print("TRIGGER ROWS:", json.dumps([
    {"schema": r[0], "table": r[1], "enabled": r[2], "def": r[3]} for r in rows], indent=1))

cur.execute("""SELECT n.nspname, p.proname, left(p.prosrc, 120)
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname = 'assert_spec_point_anchor'""")
for r in cur.fetchall():
    print("FUNCTION:", f"{r[0]}.{r[1]}", "| body head:", (r[2] or "").replace("\n", " "))

# fail-closed spot probe in a rolled-back txn
conn.autocommit = False
cur.execute("SELECT id, node_type FROM knowledge_nodes WHERE node_type <> 'SPEC_POINT' ORDER BY id LIMIT 1")
bad_id, bad_type = cur.fetchone()
try:
    cur.execute("INSERT INTO question_spec_points (id, question_id, spec_point_node_id, role, created_at) "
                "VALUES (gen_random_uuid(), gen_random_uuid(), %s, 'PRIMARY', now())", (bad_id,))
    print(f"PROBE: bad anchor ({bad_type}) ACCEPTED — trigger NOT enforcing!")
except Exception as ex:
    print(f"PROBE: raised as expected (anchor used: {bad_type}):", str(ex)[:200])
finally:
    conn.rollback()

conn.autocommit = True
cur.execute("SELECT count(*) FROM question_spec_points")
print("anchors_total:", cur.fetchone()[0])
conn.close()

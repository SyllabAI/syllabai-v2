#!/usr/bin/env python3
"""t139_g4_identity.py — byte-identity check: LIVE function source vs the
STAGED artifact body (the dispositive provenance signal available)."""
import json
import re
import urllib.request

import psycopg2

CREDS = "/home/z/my-project/.creds"
TEAM = "team_ULL54qkhzKBmnKrpO6BD4mYX"
API_PROJECT = "prj_FN5XQUMbpqKhZXFXpT80OdsKveJZ"
ARTIFACT = ("/home/z/my-project/repos/syllabai-v2"
            "/.syllabai/receipts/T-MIG-139/g4-anchor-type-trigger.sql")


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
        "Accept": "application/json", "User-Agent": "t139-g4-id-r7a/1"})
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
                        application_name="t139-g4-id-r7a")
cur = conn.cursor()
cur.execute("SELECT prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace "
            "WHERE p.proname = 'assert_spec_point_anchor' AND n.nspname = 'public'")
live = cur.fetchone()[0]
conn.close()

staged = open(ARTIFACT, encoding="utf-8").read()
m = re.search(r"\$body\$(.*?)\$body\$", staged, re.S)
staged_body = m.group(1)


def norm(s):
    return "\n".join(line.rstrip() for line in s.strip().replace("\r\n", "\n").split("\n"))


identical = norm(live) == norm(staged_body)
print("LIVE body sha-ish len:", len(live), "| STAGED body len:", len(staged_body))
print("BYTE-IDENTICAL (whitespace-normalized):", identical)
if not identical:
    import difflib
    for line in difflib.unified_diff(norm(staged_body).splitlines(),
                                     norm(live).splitlines(), "staged", "live", lineterm=""):
        print(line)

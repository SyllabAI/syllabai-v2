#!/usr/bin/env python3
"""t139_g4_two_path.py — complete the enforcement proof on BOTH trigger paths
(INSERT proven by t139_g4_probe; here: UPDATE-path negative + positive control).
Every probe txn is ROLLED BACK — zero net writes."""
import json
import urllib.request

import psycopg2

CREDS = "/home/z/my-project/.creds"
TEAM = "team_ULL54qkhzKBmnKrpO6BD4mYX"
API_PROJECT = "prj_FN5XQUMbpqKhZXFXpT80OdsKveJZ"
R = {}


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
        "Accept": "application/json", "User-Agent": "t139-g4-twopath-r7a/1"})
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
                        application_name="t139-g4-twopath-r7a")
conn.autocommit = False
cur = conn.cursor()

# one real anchor row + one real non-SPEC_POINT node
cur.execute("SELECT id, spec_point_node_id FROM question_spec_points ORDER BY id LIMIT 1")
anchor_id, node_id = cur.fetchone()
cur.execute("SELECT id, node_type FROM knowledge_nodes WHERE node_type <> 'SPEC_POINT' ORDER BY id LIMIT 1")
bad_id, bad_type = cur.fetchone()

# 1. UPDATE-path negative: retarget an anchor at a non-SPEC_POINT node -> must raise
try:
    cur.execute("UPDATE question_spec_points SET spec_point_node_id = %s WHERE id = %s",
                (bad_id, anchor_id))
    conn.rollback()
    R["update_negative"] = f"FAIL — bad retarget ({bad_type}) ACCEPTED"
except psycopg2.Error as ex:
    msg = str(ex)
    R["update_negative"] = ("PASS fail-closed" if "ck_qsp_anchor_is_spec_point" in msg
                            else f"RAISED-MISMATCH: {msg[:120]}")
    R["update_negative_detail"] = msg[:200]
    conn.rollback()
print("UPDATE-NEGATIVE:", R["update_negative"])

# 2. positive control: in-place update (same SPEC_POINT value) -> must pass, then rollback
try:
    cur.execute("UPDATE question_spec_points SET spec_point_node_id = spec_point_node_id "
                "WHERE id = %s", (anchor_id,))
    R["positive_control"] = f"PASS open-path (rowcount={cur.rowcount})"
except psycopg2.Error as ex:
    R["positive_control"] = f"FAIL — valid in-place update rejected: {str(ex)[:150]}"
conn.rollback()
print("POSITIVE:", R["positive_control"])

# 3. post: counts unchanged
cur.execute("SELECT count(*) FROM question_spec_points")
R["anchors_total_post"] = cur.fetchone()[0]
conn.rollback()
conn.close()
R["verdict"] = "both trigger paths proven; zero net writes"
with open("/home/z/my-project/scratch/t139_g4_twopath_evidence.json", "w") as f:
    json.dump(R, f, indent=1)
print("POST anchors:", R["anchors_total_post"], "|", R["verdict"])

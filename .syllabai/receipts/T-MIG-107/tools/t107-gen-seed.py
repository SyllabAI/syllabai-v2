#!/usr/bin/env python3
"""Generate filtered INSERT statements for the verify substrate (V6/V7 rows only)."""
import subprocess, json, os

PGBIN = "/home/z/build/toolchain/pg/usr/lib/postgresql/17/bin"
ENV = dict(os.environ, PGHOST="127.0.0.1", PGPORT="5544", PGUSER="postgres", PGDATABASE="syllabai_capture")
TABLES = {
    "curriculum_versions": None,
    "subjects": None,
    "knowledge_nodes": "code not like 'ING-%'",
    "questions": "exam_paper_id is null",
    "question_options": None,   # filter via parent question ids
    "question_topics": None,
}

def rows(table, where):
    sql = f"select coalesce(json_agg(t), '[]'::json) from {table} t" + (f" where {where}" if where else "")
    r = subprocess.run([f"{PGBIN}/psql", "-tA", "-c", sql], env=ENV, capture_output=True, text=True)
    return json.loads(r.stdout.strip())

def lit(v):
    if v is None: return "NULL"
    if isinstance(v, bool): return "true" if v else "false"
    if isinstance(v, (int, float)): return str(v)
    if isinstance(v, dict): return "'" + json.dumps(v).replace("'", "''") + "'::jsonb"
    return "'" + str(v).replace("'", "''") + "'"

out = []
qids = [r["id"] for r in rows("questions", "exam_paper_id is null")]
for table, where in TABLES.items():
    data = rows(table, where)
    if table == "question_options":
        data = [r for r in data if r["question_id"] in qids]
    if table == "question_topics":
        data = [r for r in data if r["question_id"] in qids]
    for r in data:
        cols = ", ".join(r.keys())
        vals = ", ".join(lit(v) for v in r.values())
        out.append(f"INSERT INTO {table} ({cols}) VALUES ({vals}) ON CONFLICT DO NOTHING;")
    print(f"{table}: {len(data)} rows")

with open("/home/z/build/seed-dump/v6v7-seed.sql", "w") as f:
    f.write("\n".join(out) + "\n")
print(f"-> v6v7-seed.sql ({len(out)} inserts)")

#!/usr/bin/env python3
"""
ADR-040 ruling-A production apply ceremony — migration 0016
(mark_schemes.question_part_id). Law of record = adr040-prod-apply-r0:
backup -> pre-flight -> apply (ONE transaction, stop-on-error) -> post-verify.
psycopg2 on the manual-ceremony estate. READ-ONLY except the apply block.
"""
import psycopg2, os, sys, json

DSN = os.environ["DATABASE_URL"].strip().strip("'")
SQL_0016 = open("/home/z/my-project/repo/packages/db/drizzle/0016_adr040-scheme-part-binding.sql").read()
STATEMENTS = [s.strip() for s in SQL_0016.split("--> statement-breakpoint") if s.strip()]
TRIPWIRES = {
    "schemes": "select count(*) from mark_schemes",
    "levels": "select count(*) from mark_schemes where scheme_kind='LEVELS'",
    "bands": "select count(*) from mark_bands",
    "evals": "select count(*) from smart_mark_agreement_evaluations",
    "sme_eq_active": "select count(*) from questions where active and external_ref like 'sme-eq%'",
}

def q(cur, sql, params=None):
    if params:
        cur.execute(sql, params)
    else:
        cur.execute(sql)  # no-args: '%' in LIKE patterns must not hit paramstyle
    return cur.fetchall()

cn = psycopg2.connect(DSN)
cn.autocommit = False
report = {"ceremony": "adr040-scheme-part-binding-r0-apply", "statements": len(STATEMENTS)}

# ── 1. BACKUP (pre-state of record) ──────────────────────────────────────────
cur = cn.cursor()
cols = q(cur, """select column_name, data_type, is_nullable from information_schema.columns
                 where table_name='mark_schemes' order by ordinal_position""")
fks = q(cur, """select conname from pg_constraint where conrelid = 'mark_schemes'::regclass and contype='f' order by conname""")
idxs = q(cur, "select indexname from pg_indexes where tablename='mark_schemes' order by indexname")
counts = {k: q(cur, v)[0][0] for k, v in TRIPWIRES.items()}
report["backup"] = {"columns": [c[0] for c in cols], "fks": [f[0] for f in fks],
                    "indexes": [i[0] for i in idxs], "tripwires": counts}
assert "question_part_id" not in [c[0] for c in cols], "0016 already applied — refusing"
print("BACKUP OK:", json.dumps(report["backup"]["tripwires"]), "| fks:", report["backup"]["fks"])

# ── 2. APPLY (one transaction, chronological, stop-on-error) ─────────────────
try:
    for i, stmt in enumerate(STATEMENTS, 1):
        cur.execute(stmt)
        print(f"APPLY stmt {i}/{len(STATEMENTS)} OK:", stmt[:72].replace("\n", " "), "...")
    cn.commit()
    report["apply"] = "COMMITTED"
except Exception as e:
    cn.rollback()
    report["apply"] = f"ROLLED BACK: {e}"
    print("APPLY FAILED — rolled back:", e)
    json.dump(report, open("/home/z/my-project/tmp/apply_0016.json", "w"), indent=1)
    sys.exit(1)

# ── 3. POST-VERIFY ───────────────────────────────────────────────────────────
cols = [c[0] for c in q(cur, """select column_name from information_schema.columns
                                 where table_name='mark_schemes' order by ordinal_position""")]
fks = [f[0] for f in q(cur, """select conname from pg_constraint where conrelid='mark_schemes'::regclass and contype='f' order by conname""")]
idxs = [i[0] for i in q(cur, "select indexname from pg_indexes where tablename='mark_schemes' order by indexname")]
post = {k: q(cur, v)[0][0] for k, v in TRIPWIRES.items()}
report["post"] = {"columns_ok": "question_part_id" in cols, "fks": fks,
                  "ix_ok": "ix_mark_schemes_part" in idxs, "tripwires": post}
ok = (report["post"]["columns_ok"] and "mark_schemes_question_part_id_fkey" in fks
      and report["post"]["ix_ok"] and post == counts)
report["verdict"] = "GREEN" if ok else "DRIFT"
print("POST:", json.dumps(report["post"]))
print("VERDICT:", report["verdict"])
cn.close()
json.dump(report, open("/home/z/my-project/tmp/apply_0016.json", "w"), indent=1)
sys.exit(0 if ok else 2)

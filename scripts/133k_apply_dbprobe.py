#!/usr/bin/env python3
"""T-MIG-133 band 133k — read-only DB identity probe (pre-apply gate).

Verifies the staged DSN points at the production book registry of record:
  1. current_user + server fingerprint (no credential values emitted)
  2. book_chapters rows for the chemistry document (expect 29)
  3. join refs total (expect 145) + covered spine codes (expect 143)
     — the exact live baseline the apply's own guard also re-verifies
  4. write capability of the current role on the two target tables
     (has_table_privilege — a SELECT, not a write)
Zero writes anywhere.
"""
import json
from pathlib import Path

import psycopg

DSN = Path("/home/z/.secrets/neon_dsn.txt").read_text().strip()
DOC_ID = "e6c0db50-0f84-55de-b50c-e4d49285cd6d"

with psycopg.connect(DSN, connect_timeout=30) as conn:
    who = conn.execute("select current_user, current_database(), version()").fetchone()
    print("current_user:", who[0], "| db:", who[1])
    print("server:", who[2].split(",")[0])
    n = conn.execute(
        "select count(*)::int from book_chapters where document_id = %s", (DOC_ID,)
    ).fetchone()[0]
    print("book_chapters rows:", n)
    refs, covered = conn.execute(
        "select coalesce(sum(jsonb_array_length(spec_codes)),0)::int, "
        "       count(distinct code)::int from book_chapters, "
        "LATERAL jsonb_array_elements(spec_codes) code where document_id = %s",
        (DOC_ID,),
    ).fetchone()
    print("join refs:", refs, "| distinct covered codes:", covered)
    upd = conn.execute(
        "select has_table_privilege(current_user,'book_chapters','UPDATE'), "
        "       has_table_privilege(current_user,'document_chunks','UPDATE')"
    ).fetchone()
    print("UPDATE privilege book_chapters:", upd[0], "| document_chunks:", upd[1])
    docs = conn.execute(
        "select count(*)::int from documents where document_id = %s", (DOC_ID,)
    ).fetchone()[0]
    print("documents rows for DOC_ID:", docs)
print("probe complete — zero writes")

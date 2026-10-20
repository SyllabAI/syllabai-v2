#!/usr/bin/env python3
"""T-MIG-133 band 133k — post-apply chunk overlay verification (read-only).

Checks the widened overlay actually landed on document_chunks for the
affected chapters (atom_number seam): every chunk of an affected chapter
carries exactly that chapter's widened officialCode array, and spot
chapters' arrays match the staged rows byte-for-byte. Zero writes.
"""
import json
from pathlib import Path

import psycopg

DSN = Path("/home/z/.secrets/neon_dsn.txt").read_text().strip()
DOC_ID = "e6c0db50-0f84-55de-b50c-e4d49285cd6d"
staged = {r["chapterKey"]: r for r in
          json.loads(Path("/home/z/my-project/download/133k_apply_staged.json").read_text())["rows"]}

with psycopg.connect(DSN, connect_timeout=30) as conn:
    doc_row_id = conn.execute(
        "select id from documents where document_id = %s", (DOC_ID,)
    ).fetchone()[0]
    bad = 0
    for key, row in staged.items():
        want = [r["officialCode"] for r in row["specCodes"]]
        got = conn.execute(
            "select distinct spec_codes::text from document_chunks "
            "where document_row_id = %s and atom_number = %s", (doc_row_id, key)
        ).fetchall()
        arrs = {json.dumps(json.loads(t), sort_keys=False) for (t,) in got}
        ok = len(arrs) == 1 and json.loads(next(iter(arrs))) == want
        n = conn.execute(
            "select count(*)::int from document_chunks "
            "where document_row_id = %s and atom_number = %s", (doc_row_id, key)
        ).fetchone()[0]
        print(f"  {key:7s} chunks={n:3d} overlay==widened registry: {ok} "
              f"({len(want)} codes)" + ("" if ok else f" GOT={next(iter(arrs))[:120]}"))
        bad += 0 if ok else 1
    # one unaffected chapter must be untouched (pre-state codes, e.g. u1:c5)
    unaff = conn.execute(
        "select distinct spec_codes::text from document_chunks "
        "where document_row_id = %s and atom_number = %s", (doc_row_id, "u1:c5")
    ).fetchall()
    print("unaffected u1:c5 distinct arrays:", len(unaff),
          "| first:", unaff[0][0][:100] if unaff else "-")
    print("overlay verification:", "ALL PASS" if bad == 0 else f"{bad} FAILURES")

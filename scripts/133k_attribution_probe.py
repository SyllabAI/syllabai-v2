#!/usr/bin/env python3
"""T-MIG-133 band 133k — atom_number attribution census + chunk spec_codes shape.

Gates the corrected overlay law:
  1. atom_number coverage over all 823 chunks (nulls? non-chapter values?)
  2. per-chapterKey chunk counts for the 15 affected chapters
  3. existing chunk spec_codes SHAPE (strings vs objects) + consistency:
     do chunks of an affected chapter carry exactly the chapter's LO codes?
Zero writes.
"""
import json
import urllib.request
from pathlib import Path

import psycopg

DSN = Path("/home/z/.secrets/neon_dsn.txt").read_text().strip()
DOC_ID = "e6c0db50-0f84-55de-b50c-e4d49285cd6d"
CHAPTERS_URL = f"https://syllabai-v2.vercel.app/api/v1/content/books/{DOC_ID}/chapters"

with urllib.request.urlopen(CHAPTERS_URL, timeout=30) as r:
    live = json.loads(r.read().decode("utf-8"))
ch_codes = {c["chapterKey"]: [x["officialCode"] for x in c["specCodes"]] for c in live}

with psycopg.connect(DSN, connect_timeout=30) as conn:
    doc_row_id = conn.execute(
        "select id from documents where document_id = %s", (DOC_ID,)
    ).fetchone()[0]
    rows = conn.execute(
        "select atom_number, count(*)::int, count(*) filter (where spec_codes is null)::int "
        "from document_chunks where document_row_id = %s "
        "group by atom_number order by atom_number", (doc_row_id,)
    ).fetchall()
    print("distinct atom_number values:", len(rows))
    nulls = conn.execute(
        "select count(*)::int from document_chunks where document_row_id = %s "
        "and atom_number is null", (doc_row_id,)
    ).fetchone()[0]
    print("chunks with atom_number null:", nulls)
    affected = ["u1:c1","u1:c2","u1:c3","u1:c7","u1:c8","u1:c10","u2:c12","u2:c14",
                "u2:c15","u2:c17","u2:c18","u3:c19","u3:c21","u4:c24","u4:c26"]
    amap = {r[0]: (r[1], r[2]) for r in rows}
    for a in affected:
        print(f"  {a:7s} chunks={amap.get(a, ('MISSING',))[0]} without_codes={amap.get(a, (0,'-'))[1]}")
    # shape + consistency probe on one affected chapter
    probe = "u1:c1"
    sample = conn.execute(
        "select spec_codes from document_chunks where document_row_id = %s "
        "and atom_number = %s and spec_codes is not null limit 1", (doc_row_id, probe)
    ).fetchone()[0]
    print(f"chunk spec_codes sample ({probe}):", json.dumps(sample)[:160])
    mism = 0
    checked = 0
    for key in affected:
        if key not in amap:
            continue
        got = conn.execute(
            "select distinct spec_codes::text from document_chunks "
            "where document_row_id = %s and atom_number = %s and spec_codes is not null",
            (doc_row_id, key),
        ).fetchall()
        for (txt,) in got:
            arr = json.loads(txt)
            codes = [x if isinstance(x, str) else x.get("officialCode") for x in arr]
            checked += 1
            if sorted(codes) != sorted(ch_codes[key]):
                mism += 1
                if mism <= 3:
                    print(f"  MISMATCH {key}: chunk={codes} vs registry={ch_codes[key]}")
    print(f"distinct chunk spec_codes arrays checked: {checked} | mismatches vs registry: {mism}")

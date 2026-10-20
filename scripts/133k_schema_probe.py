#!/usr/bin/env python3
"""T-MIG-133 band 133k — post-abort verification + schema fetch (read-only).

The apply aborted on document_chunks.header (UndefinedColumn). Verify:
  1. the transaction rolled back: book_chapters still the 145-ref baseline
  2. document_chunks actual columns (information_schema)
  3. where the 'Q<unit>:c<N>' header grammar actually lives
Zero writes.
"""
import json
from pathlib import Path

import psycopg

DSN = Path("/home/z/.secrets/neon_dsn.txt").read_text().strip()
DOC_ID = "e6c0db50-0f84-55de-b50c-e4d49285cd6d"

with psycopg.connect(DSN, connect_timeout=30) as conn:
    refs = conn.execute(
        "select coalesce(sum(jsonb_array_length(spec_codes)),0)::int "
        "from book_chapters where document_id = %s", (DOC_ID,)
    ).fetchone()[0]
    print("book_chapters join refs (expect 145 baseline):", refs)
    cols = conn.execute(
        "select column_name, data_type from information_schema.columns "
        "where table_name = 'document_chunks' order by ordinal_position"
    ).fetchall()
    print("document_chunks columns:")
    for c in cols:
        print(f"   {c[0]:28s} {c[1]}")

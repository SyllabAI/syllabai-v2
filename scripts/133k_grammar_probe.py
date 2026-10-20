#!/usr/bin/env python3
"""T-MIG-133 band 133k — locate the chapter-attribution seam in document_chunks.

The apply's overlay law needs the frozen header grammar '... | Q<unit>:c<N> | ...'.
No `header` column exists — find where the grammar actually lives:
content prefix? kind? atom_number? Sample + regex census. Zero writes.
"""
import json
import re
from pathlib import Path

import psycopg

DSN = Path("/home/z/.secrets/neon_dsn.txt").read_text().strip()
DOC_ID = "e6c0db50-0f84-55de-b50c-e4d49285cd6d"

with psycopg.connect(DSN, connect_timeout=30) as conn:
    doc = conn.execute(
        "select id from documents where document_id = %s", (DOC_ID,)
    ).fetchone()
    doc_row_id = doc[0]
    n_chunks = conn.execute(
        "select count(*)::int from document_chunks where document_row_id = %s",
        (doc_row_id,),
    ).fetchone()[0]
    n_codes = conn.execute(
        "select count(*)::int from document_chunks where document_row_id = %s "
        "and spec_codes is not null", (doc_row_id,)
    ).fetchone()[0]
    print(f"chunks: {n_chunks} | chunks with spec_codes not null: {n_codes}")
    kinds = conn.execute(
        "select kind, count(*)::int from document_chunks "
        "where document_row_id = %s group by kind order by 2 desc", (doc_row_id,)
    ).fetchall()
    print("kind census:", kinds)
    rows = conn.execute(
        "select chunk_index, kind, content, spec_codes, atom_number "
        "from document_chunks where document_row_id = %s order by chunk_index limit 6",
        (doc_row_id,),
    ).fetchall()
    for r in rows:
        head = (r[2] or "")[:110].replace("\n", "\\n")
        print(f"  [{r[0]}] kind={r[1]} atom={r[4]!r} codes={'Y' if r[3] else '-'} head={head!r}")
    # regex census for the Q<unit>:c<N> grammar in content
    pat = re.compile(r"Q(\d+):c(\d+)\b")
    hits = conn.execute(
        "select chunk_index, content from document_chunks where document_row_id = %s",
        (doc_row_id,),
    ).fetchall()
    qhits = {}
    sample = None
    for idx, content in hits:
        m = pat.search(content or "")
        if m:
            key = f"u{m.group(1)}:c{m.group(2)}"
            qhits[key] = qhits.get(key, 0) + 1
            if sample is None and key == "u1:c1":
                i = (content or "").find(m.group(0))
                sample = (idx, (content[max(0, i - 40): i + 30] or "").replace("\n", "\\n"))
    print("Q-grammar hits per chapterKey:", len(qhits), "chapters |",
          sum(qhits.values()), "chunks")
    print("sample u1:c1 hit:", sample)

#!/usr/bin/env python3
"""T-MIG-133 band 133k — spec_codes shape audit (read-only).

The live endpoint serves 145 join refs / 29 chapters; the DB column sums
867 elements. Before the apply writes anything, pin the actual DB shape
per chapter vs the endpoint shape for the same chapter.
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
print("endpoint chapters:", len(live), "| endpoint total refs:",
      sum(len(c["specCodes"]) for c in live))
ep0 = live[0]
print("endpoint sample:", ep0["chapterKey"], "refs:", len(ep0["specCodes"]))
print("endpoint ref[0]:", json.dumps(ep0["specCodes"][0])[:200])

with psycopg.connect(DSN, connect_timeout=30) as conn:
    rows = conn.execute(
        "select chapter_key, jsonb_array_length(spec_codes) n, spec_codes "
        "from book_chapters where document_id = %s order by chapter_key",
        (DOC_ID,),
    ).fetchall()
    total = sum(r[1] for r in rows)
    print("db chapters:", len(rows), "| db total elements:", total)
    db0 = rows[0]
    print("db sample:", db0[0], "elements:", db0[1])
    print("db elem[0]:", json.dumps(db0[2][0])[:300])
    print("db elem[-1]:", json.dumps(db0[2][-1])[:300])
    # distinct keys per element to fingerprint the schema
    keys = {}
    for r in rows:
        for el in r[2]:
            if isinstance(el, dict):
                for k in el:
                    keys[k] = keys.get(k, 0) + 1
    print("db element keys census:", keys)
    # per-chapter delta vs endpoint
    ep_by_key = {c["chapterKey"]: len(c["specCodes"]) for c in live}
    deltas = [(r[0], r[1], ep_by_key.get(r[0])) for r in rows
              if r[1] != ep_by_key.get(r[0])]
    print("per-chapter count deltas (db vs ep):", len(deltas))
    for d in deltas[:8]:
        print("  ", d)

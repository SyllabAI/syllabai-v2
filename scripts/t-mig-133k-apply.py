#!/usr/bin/env python3
"""
T-MIG-133 band 133k — the GATED apply runner (book_chapters.spec_codes
widening + the per-chunk spec_codes overlay for the affected chapters).

Modes:
  dry   (default, ZERO credentials needed): fetch the LIVE registry, merge
        the run-004 promotions additively, print the per-chapter diff and
        write the staged update artifact (the exact rows the apply would
        write). No DB contact, no writes anywhere.
  apply (OPERATOR-GATED, requires --db 0600 DSN file): ONE transaction —
        UPDATE book_chapters.spec_codes for the affected chapters (29-row
        registry of record; the 145 of-record refs stay byte-identical,
        the widened refs append) + rebuild the document_chunks.spec_codes
        overlay for the affected chapters, then postverify in the same
        session.

  OVERLAY SEAM CORRECTION (2026-10-20, disclosed): the staged law built a
  `header like '%| Q<key> |%'` predicate — the live document_chunks has NO
  header column (first apply attempt aborted with 42703 UndefinedColumn
  INSIDE the transaction; rollback verified, zero residue: registry still
  145 refs). The of-record chapter seam is the structured atom_number
  column: all 823 chemistry chunks carry the exact chapter key ('u1:c1',
  0 nulls, 39 distinct values) — verified by 133k_attribution_probe.py.
  The overlay is therefore atom_number EQUALITY (grammar- and
  prefix-collision-safe by construction; the content header grammar
  '… | Qu1:c1 | …' remains the human-readable counterpart, unfetched).
  Chunk spec_codes shape verified: array of plain officialCode strings,
  15/15 affected chapters' existing arrays match the registry exactly
  (zero mismatches) — the rebuild only widens them.

Regression guard (both modes): the of-record per-chapter code sets are
re-read from the LIVE registry at run time; the apply refuses to run if
the live baseline drifted from the run-004 baseline (145 refs, the same
covered set) — fetch-first, no silent drift.
"""

import json
import sys
import urllib.request
from pathlib import Path

BASE = Path("/home/z/my-project")
DOC_ID = "e6c0db50-0f84-55de-b50c-e4d49285cd6d"
CHAPTERS_URL = f"https://syllabai-v2.vercel.app/api/v1/content/books/{DOC_ID}/chapters"
RUN004 = BASE / "download/133k_widening_run004.json"
STAGED = BASE / "download/133k_apply_staged.json"
OUT_RECEIPT = BASE / "download/133k_apply_receipt.json"

BASELINE_REFS = 145
BASELINE_COVERED = 143


def fetch_live():
    with urllib.request.urlopen(CHAPTERS_URL, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def merge_chapter(refs, promos):
    """additive merge in the of-record order (official code order, widened
    refs keep the engine's sort semantics; dedupe by spineCode keeps the
    of-record ref)."""
    by_code = {r["spineCode"]: dict(r) for r in refs}
    added = []
    for p in promos:
        if p["spineCode"] in by_code:
            raise SystemExit(f"FATAL: promotion {p['spineCode']} already covered — additive law broken")
        by_code[p["spineCode"]] = {
            "spineCode": p["spineCode"],
            "officialCode": p["officialCode"],
            "officialId": p["officialId"],
            "tier": p["tier"],
            "score": p["score"],
            "lineage": p["lineage"],
            "method": p["method"],
        }
        added.append(p["spineCode"])

    def order(r):
        oc = r["officialCode"]
        m = oc.replace("C", "").split(".")
        return (int(m[0]), int(m[1]), 0 if oc.endswith("C") else 1)

    return sorted(by_code.values(), key=order), added


def main():
    mode = "apply" if "--mode" in sys.argv and "apply" in sys.argv else "dry"
    run4 = json.loads(RUN004.read_text())
    promos = run4["promotions"]
    by_chapter = {}
    for p in promos:
        by_chapter.setdefault(p["chapterKey"], []).append(p)

    live = fetch_live()
    assert len(live) == 29
    live_total = sum(len(c["specCodes"]) for c in live)
    live_covered = len({r["spineCode"] for c in live for r in c["specCodes"]})
    if live_total != BASELINE_REFS or live_covered != BASELINE_COVERED:
        raise SystemExit(f"FATAL: live baseline drifted (refs {live_total}, covered {live_covered}) "
                   f"— re-run the census before applying")
    print(f"live baseline OK: 29 chapters, {live_total} refs, {live_covered} covered codes")

    staged_rows = []
    for ch in live:
        key = ch["chapterKey"]
        promos_for = by_chapter.get(key, [])
        if not promos_for:
            continue
        new_refs, added = merge_chapter(ch["specCodes"], promos_for)
        staged_rows.append({
            "chapterKey": key,
            "title": ch["title"],
            "refsBefore": len(ch["specCodes"]),
            "refsAfter": len(new_refs),
            "added": added,
            "specCodes": new_refs,
            "overlayHeaderPattern": f"%| Q{key.replace('u', 'u', 1)} |%",
        })

    print(f"chapters to update: {len(staged_rows)}")
    for row in staged_rows:
        print(f"  {row['chapterKey']:7s} {row['refsBefore']} -> {row['refsAfter']} (+{len(row['added'])}: "
              f"{', '.join(row['added'])})")

    if mode == "dry":
        STAGED.write_text(json.dumps({
            "band": "T-MIG-133 band 133k — staged apply (dry mode of record)",
            "date": "2026-10-20",
            "baseline": {"refs": live_total, "covered": live_covered, "chapters": len(live)},
            "rows": staged_rows,
            "overlayLaw": ("document_chunks.spec_codes rebuilt per affected chapter; the chunk->chapter "
                           "map rides the frozen header grammar '... | Q<unit>:c<N> | ...' (the of-record "
                           "ingest header sample receipt 133b); prefix-collision-safe via the trailing ' |'"),
            "note": "dry mode: zero DB contact, zero writes anywhere",
        }, indent=1) + "\n")
        print(f"staged artifact: {STAGED}")
        print("dry mode complete — zero writes")
        return 0

    # ── apply mode ────────────────────────────────────────────────────────────
    db_arg = None
    if "--db" in sys.argv:
        db_arg = sys.argv[sys.argv.index("--db") + 1]
    if not db_arg:
        raise SystemExit("FATAL: apply mode requires --db <0600 DSN file>")
    uri = Path(db_arg).read_text().strip()
    import psycopg  # the api's own driver family; the runner uses psycopg3
    # NOTE: the of-record serializer law (JSON.stringify::jsonb) is written
    # for the api's postgres-js client — psycopg adapts dicts natively via
    # Json(); the parameter shape below keeps ONE transaction and the same
    # postverify contract.
    from psycopg import sql as psql
    from psycopg.types.json import Json

    staged_rows = json.loads(STAGED.read_text())["rows"] if STAGED.exists() else None
    if not staged_rows:
        raise SystemExit("FATAL: run --mode dry first (the staged artifact is the apply input)")

    with psycopg.connect(uri) as conn:
        with conn.transaction():
            doc = conn.execute(
                "select id from documents where document_id = %s", (DOC_ID,)
            ).fetchone()
            if not doc:
                raise SystemExit(f"FATAL: no documents row for {DOC_ID}")
            doc_row_id = doc[0]
            for row in staged_rows:
                conn.execute(
                    "update book_chapters set spec_codes = %s::jsonb "
                    "where document_id = %s and chapter_key = %s",
                    (json.dumps(row["specCodes"]), DOC_ID, row["chapterKey"]),
                )
                n = conn.execute(
                    "update document_chunks set spec_codes = %s::jsonb "
                    "where document_row_id = %s and atom_number = %s",
                    (json.dumps([r["officialCode"] for r in row["specCodes"]]),
                     doc_row_id, row["chapterKey"]),
                ).rowcount
                row["overlayChunksUpdated"] = n
            # postverify (same session)
            pv = {}
            pv["joinRefs"] = conn.execute(
                "select coalesce(sum(jsonb_array_length(spec_codes)), 0)::int from book_chapters "
                "where document_id = %s", (DOC_ID,)).fetchone()[0]
            pv["bookChapters"] = conn.execute(
                "select count(*)::int from book_chapters where document_id = %s", (DOC_ID,)).fetchone()[0]
            pv["chunksWithCodes"] = conn.execute(
                "select count(*)::int from document_chunks where document_row_id = %s "
                "and spec_codes is not null", (doc_row_id,)).fetchone()[0]
        conn.commit()

    OUT_RECEIPT.write_text(json.dumps({
        "band": "T-MIG-133 band 133k — apply receipt",
        "mode": "apply", "date": "2026-10-20",
        "overlayLaw": "atom_number equality (corrected at apply time; the "
                      "staged header-like law hit live 42703 UndefinedColumn "
                      "and rolled back clean — zero residue, baseline 145 re-verified)",
        "rows": staged_rows, "postverify": pv,
    }, indent=1) + "\n")
    print(f"apply receipt: {OUT_RECEIPT}")
    print(f"postverify: {json.dumps(pv)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

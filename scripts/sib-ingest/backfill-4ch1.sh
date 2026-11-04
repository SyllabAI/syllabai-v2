#!/usr/bin/env bash
# T-SIB-INGEST-001 — Gate B driver: run the FROZEN embeddings backfill executor
# (scripts/t-mig-133d-backfill-exec.ts, gemini-embedding-001 768-dim) over every
# SIB 4CH1 serving-eligible document row. GAP family EXCLUDED by enumeration law
# (sib-row-ids.ts) — never pointed at GAP rows.
#
# REGION LAW (133d run-001, reconfirmed 2026-11-03): Gemini embedding API is
# IP-region-gated; this driver runs from SUPPORTED EGRESS ONLY (GitHub Actions
# runner / operator machine) — never from the HK-egress sandbox (400
# FAILED_PRECONDITION "User location is not supported").
#
# Usage:
#   export SYLLABAI_EMBEDDING_GEMINI_API_KEY=<key>        # never echoed, never logged
#   bash scripts/sib-ingest/backfill-4ch1.sh <0600 db uri file> [outdir]
#
# Behaviour: resume-safe (a row whose chunks already carry embedding_model is
# skipped), continue-on-fail (failures logged, final census decides the exit
# code), one result file per row under outdir (default /tmp/sib-backfill-$$).
set -euo pipefail

DB_FILE="${1:?usage: backfill-4ch1.sh <0600 db uri file> [outdir]}"
OUTDIR="${2:-/tmp/sib-backfill-$$}"
[ -f "$DB_FILE" ] || { echo "db file missing"; exit 2; }
PERM=$(stat -c "%a" "$DB_FILE")
[ "$PERM" = "600" ] || { echo "db file must be 0600 (got $PERM) — abort"; exit 2; }
: "${SYLLABAI_EMBEDDING_GEMINI_API_KEY:?SYLLABAI_EMBEDDING_GEMINI_API_KEY must be set (never echoed)}"
mkdir -p "$OUTDIR"

DB_URL=$(tr -d ' \n' < "$DB_FILE")
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

echo "[1/3] enumerating SIB 4CH1 backfill rows (GAP excluded by law)..."
ROW_IDS=$(bun scripts/sib-ingest/sib-row-ids.ts "$DB_URL")
N=$(printf '%s\n' "$ROW_IDS" | grep -c . || true)
echo "      rows: $N (expected 87 = 95 - 8 GAP)"
if [ "$N" != "87" ]; then
  echo "      REFUSING: census mismatch — apply ran? GAP excluded? abort"
  exit 3
fi

echo "[2/3] backfilling via the frozen executor (resume-safe)..."
ok=0; fail=0; skip=0; failed_ids=""
for id in $ROW_IDS; do
  already=$(bun -e "
    import postgres from 'postgres';
    const sql = postgres(process.argv[1], { max: 1 });
    const r = await sql\`select count(*)::int n from document_chunks c
      join documents d on d.id = c.document_row_id
      where d.id = \${process.argv[2]} and c.embedding is not null\`;
    console.log(r[0].n); await sql.end();" "$DB_URL" "$id")
  if [ "${already:-0}" != "0" ]; then skip=$((skip+1)); continue; fi
  if bun scripts/t-mig-133d-backfill-exec.ts "$DB_URL" "$id" > "$OUTDIR/$id.log" 2>&1; then
    ok=$((ok+1)); echo "      ok  $id"
  else
    fail=$((fail+1)); failed_ids="$failed_ids $id"; echo "      FAIL $id (log: $OUTDIR/$id.log)"
  fi
done

echo "[3/3] census..."
bun -e "
  import postgres from 'postgres';
  const sql = postgres(process.argv[1], { max: 1 });
  const r = await sql\`select
    (select count(*)::int from documents where document_id like 'SIB-4CH1-%') docs,
    (select count(*)::int from document_chunks c join documents d on d.id=c.document_row_id
       where d.document_id like 'SIB-4CH1-%' and c.embedding is not null) embedded,
    (select count(*)::int from document_chunks c join documents d on d.id=c.document_row_id
       where d.document_id like 'SIB-4CH1-GAP-%' and c.embedding is not null) gap_embedded\`;
  console.log('docs=', r[0].docs, 'embedded_chunks=', r[0].embedded, 'gap_embedded(must be 0)=', r[0].gap_embedded);
  if (Number(r[0].gap_embedded) !== 0) { console.error('LAW VIOLATION: GAP rows embedded'); process.exit(1); }
  await sql.end();" "$DB_URL"

echo "backfill done: ok=$ok skip=$skip fail=$fail"
[ "$fail" = "0" ] || { echo "failed ids:$failed_ids"; exit 1; }

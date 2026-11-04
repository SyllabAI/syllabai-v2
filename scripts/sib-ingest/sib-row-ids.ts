/**
 * T-SIB-INGEST-001 — enumerate the SIB 4CH1 document rows eligible for the
 * embeddings backfill: document_id LIKE 'SIB-4CH1-%' EXCLUDING the GAP family
 * (SIB-4CH1-GAP-* stays NULL-vector by the operator-approved serving-held-internal
 * ruling — the executor is never pointed at GAP rows).
 *
 * Usage: bun scripts/sib-ingest/sib-row-ids.ts "<DATABASE_URL>"   (print ids, one per line)
 */
import postgres from "postgres";

const [dbUrl] = process.argv.slice(2);
if (!dbUrl) {
  console.error("usage: bun scripts/sib-ingest/sib-row-ids.ts <DATABASE_URL>");
  process.exit(2);
}
const sql = postgres(dbUrl, { max: 1 });
const rows = await sql`
  select id, document_id
  from documents
  where document_id like 'SIB-4CH1-%'
    and document_id not like 'SIB-4CH1-GAP-%'
  order by document_id`;
for (const r of rows) console.log(String(r.id));
await sql.end();

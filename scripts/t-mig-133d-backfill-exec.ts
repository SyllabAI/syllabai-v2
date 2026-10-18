/**
 * T-MIG-133 band 133d — the embeddings backfill EXECUTOR (the frozen path).
 *
 * Imports the OF-RECORD mechanism (services/content/retrieval.embedDocument —
 * the DocumentEmbeddingService port: embed + validate EVERYTHING first, a
 * provider outage stores nothing, then the row updates) + the Gemini
 * provider of record (gemini-embedding-001, 768-dim). The band adds ZERO new
 * write logic — this file only wires the frozen function to the target
 * database and the staged key (never printed).
 *
 * Region law (the run-001 finding of record): the Gemini embedding API is
 * IP-region-gated (FAILED_PRECONDITION "User location is not supported" from
 * the operator-sandbox egress) — the executor runs where the egress is
 * supported (GitHub Actions runners / Vercel), never from the sandbox.
 *
 * Usage: bun scripts/t-mig-133d-backfill-exec.ts <DATABASE_URL> <row_id>
 * Env: SYLLABAI_EMBEDDING_GEMINI_API_KEY (staged; never printed).
 * Out: BACKFILL_RESULT_PATH (default ./backfill-last-result.json).
 */
import { writeFileSync } from "node:fs";

import postgres from "postgres";

import { embedDocument, GeminiEmbeddingProvider } from "../apps/api/src/services/content/retrieval";

const [dbUrl, rowId] = process.argv.slice(2);
if (!dbUrl || !rowId) {
  console.error("usage: bun scripts/t-mig-133d-backfill-exec.ts <DATABASE_URL> <row_id>");
  process.exit(2);
}
const apiKey = process.env.SYLLABAI_EMBEDDING_GEMINI_API_KEY ?? "";
if (!apiKey.trim()) {
  console.error("SYLLABAI_EMBEDDING_GEMINI_API_KEY is blank — abort");
  process.exit(2);
}

const sql = postgres(dbUrl, { ssl: "require", max: 1, prepare: false, idle_timeout: 30 });

const pre = await sql`
  select count(*)::int as total,
         count(embedding)::int as already,
         min(embed_rev) as rev
  from document_chunks where document_row_id = ${rowId}::uuid`;
console.log("PRE:", JSON.stringify(pre[0]));

const provider = new GeminiEmbeddingProvider(apiKey);
const t0 = Date.now();
const result = await embedDocument(
  sql,
  rowId,
  provider,
  async (id: string) => {
    const rows = await sql`select document_id from documents where id = ${id}::uuid`;
    return (rows[0] as { document_id: string } | undefined) ?? null;
  },
);
const secs = ((Date.now() - t0) / 1000).toFixed(1);

const post = await sql`
  select count(*)::int as total,
         count(embedding)::int as embedded,
         count(distinct embedding_model) as models,
         min(array_length(embedding::real[], 1)) as dim_min,
         max(array_length(embedding::real[], 1)) as dim_max,
         min(embed_rev) as rev
  from document_chunks where document_row_id = ${rowId}::uuid`;
console.log("POST:", JSON.stringify(post[0]));
console.log("RESULT:", JSON.stringify(result), `in ${secs}s`);

// verify gate: every chunk embedded, 768 dims, ONE model of record, rev 2
const p = post[0] as Record<string, unknown>;
const ok =
  Number(p.total) === Number(result.totalChunks) &&
  Number(p.embedded) === result.embedded &&
  result.embedded === result.totalChunks &&
  Number(p.dim_min) === 768 &&
  Number(p.dim_max) === 768 &&
  Number(p.models) === 1 &&
  String(p.rev) === "2";
console.log("VERIFY:", ok ? "ALL GREEN" : "RED");
writeFileSync(
  process.env.BACKFILL_RESULT_PATH ?? "./backfill-last-result.json",
  JSON.stringify({ pre: pre[0], post: post[0], result, secs, ok }, null, 1),
);
await sql.end();
process.exit(ok ? 0 : 1);

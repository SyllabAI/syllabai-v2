/**
 * T-MIG-099 proof leg — scratch substrate completion (evidence-only tool).
 *
 * Applies the OF-RECORD baseline emission (packages/db/drizzle/0000_organic_
 * mauler.sql, byte-verbatim) statement-by-statement to the local scratch PG
 * (127.0.0.1:5433, db syllabai_v2_verify, user-tree postgres 17.11 — the
 * 083-rider recipe), continuing past per-statement failures and recording
 * every rejection.
 *
 * WHY not `drizzle-kit push` (the recipe the card names): push was ATTEMPTED
 * first-hand of record and is IMPOSSIBLE as-written on any real PG — the
 * drizzle-of-record .op() opclass layer is systematically scrambled (093-class
 * drizzle artifact oddity, wider than the F6 single-index watchlist note):
 *   attempt-1 died 42804 ResolveOpClass: int4_ops does not accept uuid
 *     (the ix_mark_points_scheme band — F6's own example);
 *   attempt-2 died 42804: uuid_ops does not accept timestamptz
 *     (the ix_smart_mark_results_answer band).
 * This tool lands 100% of-record DDL and lets PG arbitrate: the ONLY
 * statements expected to fail are the mis-opclassed CREATE INDEX lines.
 * The tool ASSERTS that (any other rejection aborts the leg — fail-closed).
 *
 * ZERO prod/Neon contact: DATABASE_URL below is the local scratch only.
 */
import postgres from "postgres";
import { readFileSync } from "node:fs";

const SCRATCH = process.env.SCRATCH_URL!;
if (!SCRATCH || !SCRATCH.includes("127.0.0.1:5433")) {
  console.error("apply-baseline: SCRATCH_URL must be the local scratch (127.0.0.1:5433) — refusing");
  process.exit(2);
}
const BASELINE = process.env.BASELINE_SQL!;

const raw0 = readFileSync(BASELINE, "utf8");
// OF-RECORD STRUCTURE (first-hand, this leg): 0000_organic_mauler.sql opens
// with two `--` header lines ("generated after introspecting the database /
// uncomment this code before executing migrations") and wraps its ENTIRE
// body in ONE block comment (line 3 `/*` ... line 1033 `*/`). The baseline
// was never an executable migration — it is the introspected Neon end-state
// reference emission. This tool follows the file's own instruction: unwrap
// the single top-level block comment, apply the DDL byte-verbatim. Nothing
// else is rewritten.
const unwrapped = (() => {
  const m = raw0.match(/^--[^\n]*\n--[^\n]*\n\/\*([\s\S]*)\*\/\s*$/);
  if (!m) return null;
  return m[1]!;
})();
if (unwrapped === null) {
  console.error("apply-baseline: baseline does not match the of-record commented-emission shape — refusing");
  process.exit(2);
}
console.log("apply-baseline: of-record commented emission unwrapped per its own header instruction");
const statements = unwrapped
  .split("--> statement-breakpoint")
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

const sql = postgres(SCRATCH, { max: 1, connect_timeout: 30 });

// precondition: pgvector must be pre-created (document_chunks vector(768) + hnsw)
const ext = await sql`select extname from pg_extension where extname='vector'`;
if (ext.length === 0) {
  console.error("apply-baseline: extension vector missing on scratch — create it before applying");
  await sql.end({ timeout: 5 });
  process.exit(2);
}

let applied = 0;
const rejected: { sql: string; code: string; message: string }[] = [];

for (const [i, stmt] of statements.entries()) {
  try {
    await sql.unsafe(stmt);
    applied++;
  } catch (e: any) {
    // psql-style continuation: record and keep going (0000 has no transaction wrapper)
    rejected.push({ sql: stmt, code: e?.code ?? "?", message: String(e?.message ?? e) });
    console.log(`[${i}] REJECTED ${e?.code}: ${stmt.slice(0, 110).replace(/\n/g, " ")}`);
  }
}

// ── the fail-closed assertion: rejections must be the opclass class ONLY ──
const bad = rejected.filter((r) => r.code !== "42804");
if (bad.length > 0) {
  console.error("apply-baseline: NON-opclass rejections — substrate NOT clean:", bad);
  await sql.end({ timeout: 5 });
  process.exit(3);
}

// ── post-apply census ──
const tables = await sql`select count(*)::int as n from information_schema.tables where table_schema='public'`;
const mpCols = await sql`
  select column_name, data_type from information_schema.columns
  where table_name='mark_points' order by ordinal_position`;
const mpIdx = await sql`
  select indexname, indexdef from pg_indexes where tablename='mark_points' order by indexname`;
const idxTotal = await sql`select count(*)::int as n from pg_indexes where schemaname='public'`;

console.log(JSON.stringify({
  statements_total: statements.length,
  applied,
  rejected_count: rejected.length,
  rejected_all_opclass_42804: bad.length === 0,
  tables_public: tables[0]!.n,
  indexes_public: idxTotal[0]!.n,
  mark_points_columns: mpCols,
  mark_points_indexes: mpIdx,
}, null, 2));

await sql.end({ timeout: 5 });
if (rejected.length === 0) {
  console.error("apply-baseline: expected the opclass-class rejections, got NONE — baseline drifted? aborting");
  process.exit(3);
}
console.log("APPLY DONE (of-record baseline; opclass-class rejections recorded = the widened F6 finding)");
// drift guard: the of-record introspected end-state census = 62 public tables
// (flyway_schema_history included per the T-MIG-002 keep-discipline; the
// earlier "63 objects" drop-notice figure counts the vector extension too)
if (tables[0]!.n !== 62) {
  console.error(`apply-baseline: expected 62 public tables (the of-record end-state census), got ${tables[0]!.n}`);
  process.exit(3);
}

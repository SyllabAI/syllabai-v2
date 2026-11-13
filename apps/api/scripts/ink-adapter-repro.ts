/**
 * T-HUB-INK-BRK run-004 — the ADAPTER-TYPE repro (READ-ONLY, zero prod
 * rows read for the primary probe).
 *
 * The live incident (2026-11-13, the user-visible "ink sometimes fails to
 * save — toolbar error + Retry sync"): Addendum 15 captured the wedged
 * pdf-drawings row and it was VALID per the DB constraints and the
 * contracts — yet GET and PUT both 500'd across three api builds, while a
 * nonexistent row served 200. All the application-layer parses are clean
 * against that captured shape, which leaves ONE unexamined boundary: the
 * DRIVER. The production path is NeonWsClient (@neondatabase/serverless
 * WebSocket, identity/users.ts) — whatever type parsers that driver runs
 * for timestamptz/int4/jsonb decide what `served()` actually receives.
 * This script makes that boundary PRINT ITSELF:
 *
 *   1. a SELECT OF LITERALS shaped exactly like the captured row (no
 *      learner data read), through the REAL createSql adapter;
 *   2. every field's runtime typeof/constructor (Date vs string is THE
 *      question — servedPdfDrawingSchema requires updatedAt: z.string());
 *   3. the REAL contracts parse of that row (the exact served() call);
 *   4. the three newest REAL rows — TYPES ONLY (revision/updated_at
 *      runtime types + jsonb_typeof + size; NO doc content, NO urls —
 *      the privacy law holds) — what the driver does to REAL rows.
 *
 * Exit 0 = the boundary is clean (the 500 lives elsewhere); exit 2 = the
 * parse failed (the poison is the adapter types — the fix follows).
 */
import { createSql } from "../src/services/identity/users";
import { servedPdfDrawingSchema } from "@syllabai/contracts";

const url = process.env.T138_PROD_DATABASE_URL;
if (!url) {
  console.error("ABORT: T138_PROD_DATABASE_URL missing");
  process.exit(1);
}

const describe = (v: unknown): string => {
  const t = typeof v;
  const ctor = (v as object | null)?.constructor?.name ?? "n/a";
  const json = JSON.stringify(v) ?? "undefined";
  return `typeof=${t} ctor=${ctor} json=${json.slice(0, 60)}`;
};

const sql = createSql(url);

try {
  console.log("=== 1) LITERAL-ROW probe (the exact Addendum-15 captured shape) ===");
  const rows = (await sql`
    select 'paper_asset'::text as document_ref_type,
           null::uuid as document_ref_id,
           'https://raw.githubusercontent.com/SyllabAI/syllabai-pastpapers/main/past-papers/pearson-edexcel/international-gcse/chemistry/4ch1/past-papers/2026-06/4CH1-1C/qp.pdf'::text as source_url,
           '{"schema": "syllabai-ink/1", "shapes": []}'::jsonb as doc,
           1000000::int as revision,
           '2026-11-13T06:12:54.456Z'::timestamptz as updated_at
  `) as Array<Record<string, unknown>>;
  const row = rows[0]!;
  for (const [k, v] of Object.entries(row)) console.log(`  ${k}: ${describe(v)}`);

  console.log("=== 2) THE REAL SERVE PARSE (servedPdfDrawingSchema) ===");
  const parsed = servedPdfDrawingSchema.safeParse({
    documentRefType: row.document_ref_type,
    documentRefId: row.document_ref_id,
    sourceUrl: row.source_url,
    doc: row.doc,
    revision: row.revision,
    updatedAt: row.updated_at,
  });
  if (parsed.success) {
    console.log("  VERDICT: PASS — the adapter types are clean; the 500 lives elsewhere");
  } else {
    console.log("  VERDICT: FAIL — the adapter types poison the serve parse:");
    for (const issue of parsed.error.issues) {
      console.log(`    ISSUE path=${issue.path.join(".")} code=${issue.code} message=${issue.message}`);
    }
  }

  console.log("=== 3) REAL ROWS — types only (no doc content, no urls) ===");
  const real = (await sql`
    select revision, updated_at, jsonb_typeof(doc) as doc_type,
           octet_length(doc::text) as doc_bytes,
           source_url is not null as keyed_by_url
    from learner_pdf_drawings
    order by updated_at desc
    limit 3
  `) as Array<Record<string, unknown>>;
  console.log(`  newest ${real.length} row(s):`);
  for (const r of real) {
    console.log(`    revision=${String(r.revision)} (${describe(r.revision)})`);
    console.log(`    updated_at (${describe(r.updated_at)})`);
    console.log(`    doc=${String(r.doc_type)}/${String(r.doc_bytes)}B urlKeyed=${String(r.keyed_by_url)}`);
  }

  console.log("REPRO COMPLETE");
  await sql.end?.();
  process.exit(parsed.success ? 0 : 2);
} catch (e) {
  console.error("REPRO FAILED:", String(e).slice(0, 500));
  try {
    await sql.end?.();
  } catch {
    /* already closed */
  }
  process.exit(1);
}

/**
 * T-BOOK-020 — the u4 S4 spot-check (the T-BOOK-011/012 laws verbatim,
 * adapted from the proven session vehicle spotcheck-u23-r1.ts):
 *   L1 zod book.block/1 (DB row shape)
 *   L2 canonical compare: DB row == authored staging file (content jsonb,
 *      refs, ord, anchor) — KEY-ORDER-INSENSITIVE (the jsonb law)
 *   L3 page-true: anchor within the chapter DB range (manifest, DB truth)
 *      AND inside the sha-pinned parse census span (digest, parse truth)
 *   L4 payload laws: bank resolution, sim allowlist, glossary slugs resolve
 * Cheap laws over ALL 46: identity, range, monotonic, state, version;
 * u1+u2+u3 of-record untouched (131 VALIDATED); glossary states preserved.
 *
 * Usage: DATABASE_URL=... bun apps/api/scripts/books-u4-s34/spotcheck.ts <stagingDir> <manifest> <digest> [expectedGlossaryValidated]
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { Client } from "@neondatabase/serverless";
import { bookBlockSchema } from "@syllabai/contracts";
import yaml from "js-yaml";

const [stagingDir, manifestPath, digestPath] = process.argv.slice(2, 5);
const glossArgIdx = process.argv.length - 1;
const expectedGlossaryValidated = Number(process.argv[glossArgIdx]) || 88;
if (stagingDir == null || manifestPath == null || digestPath == null) {
  console.error("usage: spotcheck.ts <stagingDir> <manifest> <digest> [expectedGlossaryValidated]");
  process.exit(1);
}
const c = new Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const DOC = "e6c0db50-0f84-55de-b50c-e4d49285cd6d";
const U4 = ["u4:c22", "u4:c23", "u4:c24", "u4:c25", "u4:c26", "u4:c27", "u4:c28", "u4:c29"];
const U4_CHAP: Record<string, string> = { "u4:c22": "c22", "u4:c23": "c23", "u4:c24": "c24", "u4:c25": "c25", "u4:c26": "c26", "u4:c27": "c27", "u4:c28": "c28", "u4:c29": "c29" };
const fail: string[] = [];

// authored index (id -> authored block) + chapter ranges from the manifest + parse spans
const authored = new Map<string, any>();
for (const p of readdirSync(join(stagingDir, "packs"))) {
  for (const f of readdirSync(join(stagingDir, "packs", p, "blocks"))) {
    if (!f.endsWith(".json")) continue;
    const b = JSON.parse(readFileSync(join(stagingDir, "packs", p, "blocks", f), "utf8"));
    authored.set(b.id, b);
  }
}
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const rangeBy = new Map<string, [number, number]>(
  manifest.slices.filter((s: any) => U4.includes(s.chapterKey)).map((s: any) => [s.chapterKey, s.pdfRange]),
);
const digest = JSON.parse(readFileSync(digestPath, "utf8"));
const spanBy = new Map<string, [number, number]>();
for (const [ck, ck2] of Object.entries(U4_CHAP)) {
  const d = (digest as any)[ck2];
  if (d == null) { fail.push(`digest: missing chapter ${ck2}`); continue; }
  spanBy.set(ck, [d.pdf_range[0], d.pdf_range[1]]);
}
const glossarySlugs = new Set<string>();
for (const f of readdirSync(join(stagingDir, "glossary"))) {
  if (!f.endsWith(".yaml") || f.startsWith("seed-")) continue;
  const doc = yaml.load(readFileSync(join(stagingDir, "glossary", f), "utf8")) as any;
  for (const t of doc?.terms ?? []) glossarySlugs.add(t.slug);
}

// DB rows for the 46 new blocks
const rows = await c.query(
  `select id, chapter_key, ord, type, pdf_page_anchor, content, check_refs, glossary_refs, spec_point_refs, validation_state, version
   from book_blocks where document_id = $1 and doc_version = 1 and chapter_key = any($2) order by chapter_key, ord`,
  [DOC, U4],
);
if (rows.rowCount !== 46) fail.push(`expected 46 new rows, got ${rows.rowCount}`);

// deterministic 20%+ sample: every 5th row (0,5,...,45) = 10 rows = 21.7%
const sampleIdx = new Set(Array.from({ length: 46 }, (_, i) => i).filter((i) => i % 5 === 0));
const sampledTypes = new Set<string>();
const sampledChaps = new Set<string>();

// canonical jsonb compare — KEY-ORDER-INSENSITIVE (the jsonb law): Postgres
// jsonb sorts object keys, authored JSON keeps insertion order; compare a
// recursively key-sorted stable stringify (array order stays significant).
const stable = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(stable);
  if (v != null && typeof v === "object") {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, val]) => [k, stable(val)]));
  }
  return v;
};
const canon = (v: unknown) => JSON.stringify(stable(v ?? null));

let idx = -1;
for (const row of rows.rows) {
  idx += 1;
  const a = authored.get(row.id);
  if (a == null) { fail.push(`L2 ${row.id}: no authored counterpart`); continue; }
  // cheap laws (ALL 46)
  if (row.ord !== a.ord) fail.push(`identity ${row.id}: ord ${row.ord} != authored ${a.ord}`);
  const [r0, r1] = rangeBy.get(row.chapter_key)!;
  if (row.pdf_page_anchor < r0 || row.pdf_page_anchor > r1) fail.push(`range ${row.id}: ${row.pdf_page_anchor} outside ${r0}-${r1}`);
  if (row.validation_state !== "SUGGESTED") fail.push(`negative-control ${row.id}: state ${row.validation_state} pre-flip`);
  if (row.version !== 1) fail.push(`identity ${row.id}: version ${row.version} != 1 pre-flip`);
  if (idx > 0 && row.chapter_key === rows.rows[idx - 1].chapter_key && row.pdf_page_anchor < rows.rows[idx - 1].pdf_page_anchor) {
    fail.push(`monotonic ${row.id}: anchor ${row.pdf_page_anchor} < prev ${rows.rows[idx - 1].pdf_page_anchor}`);
  }
  // spot-check laws
  if (sampleIdx.has(idx)) {
    sampledTypes.add(row.type);
    sampledChaps.add(row.chapter_key);
    // L1 zod
    const shape = {
      id: row.id, documentId: DOC, docVersion: 1, chapterKey: row.chapter_key, ord: row.ord,
      type: row.type, pdfPageAnchor: row.pdf_page_anchor, content: row.content,
      checkRefs: row.check_refs, glossaryRefs: row.glossary_refs, specPointRefs: row.spec_point_refs,
      validationState: row.validation_state, version: row.version,
    };
    const l1 = bookBlockSchema.safeParse(shape);
    if (!l1.success) fail.push(`L1 ${row.id}: ${l1.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
    // L2 canonical (key-order-insensitive jsonb compare)
    const l2 = row.type === a.type && row.ord === a.ord && row.pdf_page_anchor === a.pdfPageAnchor
      && canon(row.content) === canon(a.content)
      && canon(row.check_refs) === canon(a.checkRefs ?? [])
      && canon(row.glossary_refs) === canon(a.glossaryRefs ?? [])
      && canon(row.spec_point_refs) === canon(a.specPointRefs ?? []);
    if (!l2) fail.push(`L2 ${row.id}: DB != authored canonical`);
    // L3 page-true vs the sha-pinned parse census
    const [s0, s1] = spanBy.get(row.chapter_key)!;
    if (row.pdf_page_anchor < s0 || row.pdf_page_anchor > s1) fail.push(`L3 ${row.id}: anchor outside parse census span ${s0}-${s1}`);
    // L4 payload laws
    if ((row.check_refs as string[]).length > 0) {
      const bank = await c.query(
        `select count(*)::int as n from questions where external_ref = any($1) and active and question_type = 'MCQ_SINGLE'`,
        [row.check_refs],
      );
      if (Number(bank.rows[0].n) === 0) fail.push(`L4 ${row.id}: checkRefs unresolved`);
    }
    for (const s of row.glossary_refs as string[]) {
      if (!glossarySlugs.has(s)) fail.push(`L4 ${row.id}: glossaryRef ${s} unresolved`);
    }
    if (row.type === "sim-embed") {
      const PHET = new Set(["states-of-matter-basics", "states-of-matter", "build-an-atom", "isotopes-and-atomic-mass", "balancing-chemical-equations", "build-a-molecule", "acid-base-solutions", "concentration", "molarity", "ph-scale", "reactants-products-and-leftovers", "salts-and-solubility", "atom-viewer"]);
      if (!PHET.has((row.content as any).simId)) fail.push(`L4 ${row.id}: simId off-allowlist`);
    }
  }
}

// u1+u2+u3 of-record untouched (60 + 52 + 19 = 131)
const served = await c.query(
  `select chapter_key like 'u4:%' as is_u4, validation_state, count(*)::int as n from book_blocks
   where document_id = $1 and doc_version = 1 group by 1, 2`,
  [DOC],
);
const servedMap = Object.fromEntries(served.rows.map((r) => [`${r.is_u4 ? "u4" : "u123"}:${r.validation_state}`, Number(r.n)]));
if (Number(servedMap["u123:VALIDATED"] ?? 0) !== 131) fail.push(`u1+u2+u3 of-record drift: ${JSON.stringify(servedMap)}`);
if (Number(servedMap["u4:VALIDATED"] ?? 0) !== 0) fail.push(`u4 VALIDATED rows pre-flip: ${servedMap["u4:VALIDATED"]}`);

// glossary state law: the ingest must not touch states
const gloss = await c.query(`select validation_state, count(*)::int as n from book_glossary_terms where subject_code = '4ch1' group by 1`);
const gmap = Object.fromEntries(gloss.rows.map((r) => [r.validation_state, Number(r.n)]));
if (Number(gmap["VALIDATED"] ?? 0) !== expectedGlossaryValidated) fail.push(`glossary VALIDATED != ${expectedGlossaryValidated}: ${JSON.stringify(gmap)}`);

await c.end();
console.log(`spot-check sample: ${sampleIdx.size}/46 rows = ${((sampleIdx.size / 46) * 100).toFixed(1)}% across ${sampledChaps.size} chapters / ${sampledTypes.size} types (${[...sampledTypes].sort().join(",")})`);
console.log(`cheap laws: identity+range+monotonic+state x46; u1+u2+u3 131 VALIDATED untouched; glossary ${JSON.stringify(gmap)}`);
if (fail.length > 0) {
  console.error(`SPOT-CHECK FAILURES (${fail.length}):`);
  for (const f of fail) console.error(`  ${f}`);
  process.exit(1);
}
console.log("SPOT-CHECK GREEN (L1 zod / L2 canonical / L3 page-true / L4 payload on the sample; cheap laws full-set)");

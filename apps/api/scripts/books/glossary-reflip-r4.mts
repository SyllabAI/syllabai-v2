/**
 * T-BOOK-068 — glossary re-flip r4 (TRACKED of record).
 *
 * RULING OF RECORD (operator, 2026-10-28, trace 1a17e7f85630ad0d):
 *   "flipping the vehicle into the warehouse" — this tracked copy supersedes the
 *   session-side script (apps/api/scripts/session/, untracked scratch) so that
 *   sandbox rollbacks can no longer eat the tool (it was lost TWICE before).
 *
 * Lineage: r3 flipped 112/112 VALIDATED 2026-10-21T20:02Z; the NEON-DB-LOSS
 * restore (dump predating the flip) regressed them to SUGGESTED — the ingest
 * upsert never resets validation_state, so the restore is the only
 * self-consistent vector (root cause of record in the r0 receipt, carried in
 * .syllabai/receipts/T-BOOK-068/reflip-r4-rebuild-r1.json).
 *
 * EXECUTION STATUS: BLOCKED on Neon MAIN quota (2026-10-28, first-hand probes,
 * receipt .syllabai/receipts/T-BOOK-068/reflip-r4-check-r1.json) — the proxy
 * refuses ALL new connections ("Your account or project has exceeded the
 * quota"), which also 500s the production books plane. ZERO writes have ever
 * been executed by r4. Re-run the recipe below once the quota is raised/reset.
 *
 * TOPOLOGY / SESSION LAWS (operator, standing):
 *   - Render is RETIRED; syllabai-v2 is the sole substrate of record.
 *   - Credentials are env-only, NEVER persisted (DATABASE_URL = Neon MAIN
 *     pooler of record, handed per-run).
 *   - W1 (ep-calm-queen) is warehouse-corpus only — it has NO book tables
 *     (proven first-hand 2026-10-28); MAIN is the only valid target.
 *
 * Modes:
 *   --check       authored-layer V-laws + read-only DB census + serve proof
 *   --commit      guarded single-statement flip (see guards below)
 *   --idempotence re-flip expecting 0 rows
 *
 * Guards (abort before/without any bad write):
 *   1. authored layer must yield exactly EXPECTED_TERMS=112 terms passing
 *      V1 (kebab slug) / V3 (ms layer >=1 accepts & >=1 avoids) / V4
 *      (definition >= 40 chars, no duplicate slugs).
 *   2. pre-flip census MUST be exactly {SUGGESTED: 112, VALIDATED: 0} for
 *      subject 4ch1 (the regressed world) — anything else aborts.
 *   3. book_blocks census MUST total 178 (the b6b5dec4 world) — the flip
 *      touches ONLY book_glossary_terms; any block drift aborts.
 *   4. rowcount of the UPDATE must be exactly 112.
 *   5. post census MUST read {SUGGESTED: 0, VALIDATED: 112}.
 *
 * Dependency note: js-yaml is imported per the repo's tracked-script
 * convention (books-ingest-rail.ts, books-u4-s34/spotcheck.ts import the
 * hoisted js-yaml 4.1.1) — no package.json change.
 *
 * Usage (env-only credential, never persisted):
 *   DATABASE_URL=<Neon MAIN pooler> bun apps/api/scripts/books/glossary-reflip-r4.mts --check
 *   DATABASE_URL=... bun apps/api/scripts/books/glossary-reflip-r4.mts --commit
 *   DATABASE_URL=... bun apps/api/scripts/books/glossary-reflip-r4.mts --idempotence
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import yaml from "js-yaml";

const SUBJECT = "4ch1";
const EXPECTED_TERMS = 112;
const GLOSSARY_DIR = join(import.meta.dir, "..", "..", "..", "..", "books", "4ch1", "glossary");
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type AuthoredTerm = {
  term: string;
  slug: string;
  definition: string;
  ms_accepts: string[];
  ms_avoids: string[];
  aliases: string[];
};

function loadAuthored(): AuthoredTerm[] {
  const files = readdirSync(GLOSSARY_DIR).filter((f) => f.endsWith(".yaml") && !f.startsWith("seed-")).sort();
  const terms: AuthoredTerm[] = [];
  for (const f of files) {
    const raw = readFileSync(join(GLOSSARY_DIR, f), "utf8");
    if (!raw.includes("subject_code:") || !raw.includes("terms:")) throw new Error(`${f}: not a glossary pack`);
    const doc = yaml.load(raw) as { subject_code: string; terms: AuthoredTerm[] };
    if (doc.subject_code !== SUBJECT) throw new Error(`${f}: subject_code ${doc.subject_code} != ${SUBJECT}`);
    for (const t of doc.terms) terms.push(t);
  }
  return terms;
}

function validateAuthored(terms: AuthoredTerm[]) {
  const problems: string[] = [];
  const seen = new Map<string, number>();
  if (terms.length !== EXPECTED_TERMS) problems.push(`term count ${terms.length} != ${EXPECTED_TERMS}`);
  for (const t of terms) {
    if (!KEBAB.test(t.slug)) problems.push(`V1 slug not kebab: ${t.slug}`);
    seen.set(t.slug, (seen.get(t.slug) ?? 0) + 1);
    if ((t.definition ?? "").length < 40) problems.push(`V4 definition <40 chars: ${t.slug}`);
    if (!t.ms_accepts?.length) problems.push(`V3 ms_accepts empty: ${t.slug}`);
    if (!t.ms_avoids?.length) problems.push(`V3 ms_avoids empty: ${t.slug}`);
  }
  for (const [slug, n] of seen) if (n > 1) problems.push(`V4 duplicate slug: ${slug} ×${n}`);
  return problems;
}

function connect() {
  const url = process.env.DATABASE_URL;
  if (!url || url.includes("custom.db") || url.startsWith("file:")) {
    throw new Error("DATABASE_URL is not the Neon MAIN pooler of record (missing or a local placeholder) — credential hand required (env-only, never persisted)");
  }
  return postgres(url, { ssl: "require", max: 1, prepare: false });
}

async function census(sql: postgres.Sql) {
  const g = (await sql`SELECT validation_state, count(*)::int AS n FROM book_glossary_terms WHERE subject_code = ${SUBJECT} GROUP BY 1`) as Array<{ validation_state: string; n: number }>;
  const b = (await sql`SELECT validation_state, count(*)::int AS n FROM book_blocks WHERE document_id = 'e6c0db50-0f84-55de-b50c-e4d49285cd6d' GROUP BY 1`) as Array<{ validation_state: string; n: number }>;
  const gMap = Object.fromEntries(g.map((r) => [r.validation_state, r.n]));
  const bMap = Object.fromEntries(b.map((r) => [r.validation_state, r.n]));
  const blocksTotal = Object.values(bMap).reduce((a, b) => a + Number(b), 0);
  return { glossary: gMap, blocks: bMap, blocksTotal };
}

async function main() {
  const mode = process.argv[2] ?? "--check";
  const terms = loadAuthored();
  const problems = validateAuthored(terms);
  console.log(`[reflip-r4] authored layer: ${terms.length} terms from books/4ch1/glossary (seed- excluded)`);
  console.log(`[reflip-r4] authored V-law problems: ${problems.length}`);
  for (const p of problems) console.log(`  - ${p}`);

  if (problems.length > 0 && (mode === "--check" || mode === "--commit")) {
    console.log("[reflip-r4] authored layer RED — fix packs before any flip");
    process.exit(1);
  }

  const sql = connect();
  try {
    const c0 = await census(sql);
    console.log(`[reflip-r4] census: glossary=${JSON.stringify(c0.glossary)} blocks=${JSON.stringify(c0.blocks)} (total ${c0.blocksTotal})`);
    if (c0.blocksTotal !== 178) {
      console.log(`[reflip-r4] ABORT: blocks total ${c0.blocksTotal} != 178 (the b6b5dec4 world) — the ground moved; re-derive before flipping`);
      process.exit(1);
    }
    if (mode === "--check") {
      const serve = (await sql`SELECT count(*)::int AS n FROM book_glossary_terms WHERE subject_code = ${SUBJECT} AND validation_state = 'VALIDATED'`) as Array<{ n: number }>;
      console.log(`[reflip-r4] CHECK: serve-proof VALIDATED count for students today: ${serve[0].n}`);
      console.log(`[reflip-r4] CHECK ${c0.glossary.SUGGESTED === EXPECTED_TERMS ? "GREEN — the regressed world is present, ready for --commit" : "RED — world is not {SUGGESTED:112}; see census above"}`);
      return;
    }
    if (mode === "--commit") {
      if (c0.glossary.SUGGESTED !== EXPECTED_TERMS || (c0.glossary.VALIDATED ?? 0) !== 0) {
        throw new Error(`pre-flip world is not the regressed {SUGGESTED:112,VALIDATED:0}: ${JSON.stringify(c0.glossary)} — abort`);
      }
      const slugs = terms.map((t) => t.slug);
      const flipped = await sql`
        UPDATE book_glossary_terms
        SET validation_state = 'VALIDATED'
        WHERE validation_state = 'SUGGESTED' AND subject_code = ${SUBJECT} AND slug = ANY(${slugs})
      `;
      const n = flipped.count ?? 0;
      if (n !== EXPECTED_TERMS) throw new Error(`rowcount ${n} != ${EXPECTED_TERMS} — abort (rollback the tx / re-derive)`);
      const c1 = await census(sql);
      if ((c1.glossary.SUGGESTED ?? 0) !== 0 || c1.glossary.VALIDATED !== EXPECTED_TERMS) {
        throw new Error(`post-census ${JSON.stringify(c1.glossary)} != {SUGGESTED:0,VALIDATED:112} — abort`);
      }
      console.log(`[reflip-r4] COMMIT: ${n} terms flipped VALIDATED; post-census ${JSON.stringify(c1.glossary)}`);
      return;
    }
    if (mode === "--idempotence") {
      const slugs = terms.map((t) => t.slug);
      const again = await sql`
        UPDATE book_glossary_terms SET validation_state = 'VALIDATED'
        WHERE validation_state = 'SUGGESTED' AND subject_code = ${SUBJECT} AND slug = ANY(${slugs})
      `;
      const n = again.count ?? 0;
      console.log(`[reflip-r4] IDEMPOTENCE: re-flip touched ${n} rows (expect 0)`);
      if (n !== 0) process.exit(1);
      return;
    }
    throw new Error(`unknown mode ${mode}`);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(`[reflip-r4] FAILED: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});

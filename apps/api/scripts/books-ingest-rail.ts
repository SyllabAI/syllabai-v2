/**
 * T-BOOK-010 S3 — the rail INGEST script: packs (L2 authoring) →
 * book_blocks + book_glossary_terms (L3 runtime, Neon).
 *
 * THE LAWS:
 *  - the DB is the binding law at ingest: chapter_key must exist in
 *    book_chapters (the composite-FK no-orphan-packs law — the INSERT fails
 *    loudly otherwise), specPointRefs must ⊆ the chapter's join set (the
 *    offline lint checked subsection membership; the DB set is of record),
 *    checkRefs must resolve to ACTIVE MCQ_SINGLE bank rows.
 *  - write posture: rows land as validation_state='SUGGESTED' — the pack
 *    flip is the OPERATOR's S4 lever, never a script's.
 *  - idempotent by identity: uq_book_blocks_identity
 *    (document_id, doc_version, chapter_key, ord) — a re-run UPSERTS.
 *  - requires DATABASE_URL (Neon edge string). WITHOUT it the script
 *    refuses with --dry-run available for the DB-free shape check.
 *
 * Usage:
 *   DATABASE_URL=postgres://... bun apps/api/scripts/books-ingest-rail.ts <booksDir> <manifest.json> [--dry-run]
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { Client } from "@neondatabase/serverless";
import { isNeonUrl } from "@syllabai/db";
import { bookBlockSchema } from "@syllabai/contracts";

import yaml from "js-yaml";

const args = process.argv.slice(2);
const booksDir = args[0];
const manifestPath = args[1];
const dryRun = args.includes("--dry-run");
if (booksDir == null || manifestPath == null) {
  console.error("usage: books-ingest-rail.ts <booksDir> <manifest.json> [--dry-run]");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const documentId = manifest.book.documentId;
const docVersion = manifest.book.docVersion ?? 1;

const book = yaml.load(readFileSync(join(booksDir, "meta", "book.yaml"), "utf8"));
const qual = String(book.qual ?? "4ch1");

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith(".json")) out.push(p);
  }
  return out;
}

// ── load packs ───────────────────────────────────────────────────────────────
const blocks = [];
for (const packDir of readdirSync(join(booksDir, "packs"), { withFileTypes: true }).filter((e) => e.isDirectory())) {
  const dir = join(booksDir, "packs", packDir.name);
  if (!statSync(join(dir, "pack.yaml")).isFile()) continue;
  for (const f of walk(dir)) {
    const authored = JSON.parse(readFileSync(f, "utf8"));
    const serving = bookBlockSchema.parse({
      id: authored.id,
      documentId,
      docVersion,
      chapterKey: authored.chapterKey,
      ord: authored.ord,
      type: authored.type,
      pdfPageAnchor: authored.pdfPageAnchor ?? null,
      content: authored.content ?? {},
      checkRefs: authored.checkRefs ?? [],
      glossaryRefs: authored.glossaryRefs ?? [],
      specPointRefs: authored.specPointRefs ?? [],
      validationState: "SUGGESTED", // the S4 flip is the operator's, never a script's
      version: authored.version ?? 1,
    });
    blocks.push(serving);
  }
}
blocks.sort((a, b) => a.chapterKey.localeCompare(b.chapterKey) || a.ord - b.ord);

// ── load the authored glossary (seeds are floors, never ingested) ────────────
const terms = [];
for (const f of readdirSync(join(booksDir, "glossary")).filter((n) => n.endsWith(".yaml") && !n.startsWith("seed-"))) {
  const doc = yaml.load(readFileSync(join(booksDir, "glossary", f), "utf8"));
  for (const t of doc?.terms ?? []) {
    terms.push({ subjectCode: String(doc.subject_code ?? qual), ...t });
  }
}

console.log(`ingest: ${blocks.length} blocks across ${new Set(blocks.map((b) => b.chapterKey)).size} chapters, ${terms.length} glossary terms → ${documentId} v${docVersion}${dryRun ? " (DRY RUN)" : ""}`);

if (dryRun) {
  for (const b of blocks) {
    console.log(`  ${b.chapterKey} #${b.ord} ${b.type} p.${b.pdfPageAnchor ?? "-"} refs=${b.specPointRefs.join(",")} checks=${b.checkRefs.join(",") || "-"}`);
  }
  process.exit(0);
}

// ── the DB lane ──────────────────────────────────────────────────────────────
const databaseUrl = process.env.DATABASE_URL ?? process.env.NEON_KEY;
if (databaseUrl == null || !isNeonUrl(databaseUrl)) {
  console.error("ingest: DATABASE_URL (Neon edge) required — or pass --dry-run");
  process.exit(1);
}
const client = new Client({ connectionString: databaseUrl });
await client.connect();

let ingested = 0;
let skippedChapters = 0;
let skippedRefs = 0;
try {
  await client.query("begin");
  for (const b of blocks) {
    // the DB binding laws, checked BEFORE the insert (fail loudly, land nothing partial)
    const chapter = await client.query(
      `select spec_codes from book_chapters
       where document_id = $1 and doc_version = $2 and chapter_key = $3 and validation_state = 'VALIDATED' limit 1`,
      [documentId, docVersion, b.chapterKey],
    );
    if (chapter.rowCount === 0) {
      console.error(`  SKIP ${b.chapterKey} #${b.ord}: chapter row absent or not VALIDATED (no-orphan-packs law)`);
      skippedChapters += 1;
      continue;
    }
    const joinSet = new Set(
      ((chapter.rows[0]?.spec_codes ?? []) as Array<{ officialCode?: string }>).map((r) => r.officialCode).filter(Boolean),
    );
    const outside = b.specPointRefs.filter((r) => !joinSet.has(r));
    if (outside.length > 0) {
      console.error(`  SKIP ${b.chapterKey} #${b.ord}: spec refs outside the chapter join set: ${outside.join(",")}`);
      skippedRefs += 1;
      continue;
    }
    if (b.checkRefs.length > 0) {
      const bank = await client.query(
        `select count(*)::int as n from questions
         where external_ref = any($1) and active and question_type = 'MCQ_SINGLE'`,
        [b.checkRefs],
      );
      if ((bank.rows[0]?.n ?? 0) === 0) {
        console.error(`  SKIP ${b.chapterKey} #${b.ord}: no checkRefs resolve in the bank (${b.checkRefs.join(",")})`);
        skippedRefs += 1;
        continue;
      }
    }
    await client.query(
      `insert into book_blocks
         (id, document_id, doc_version, chapter_key, ord, type, pdf_page_anchor,
          content, check_refs, glossary_refs, spec_point_refs, validation_state, version,
          created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,'SUGGESTED',$12,now(),now())
       on conflict (document_id, doc_version, chapter_key, ord) do update set
         type = excluded.type, pdf_page_anchor = excluded.pdf_page_anchor,
         content = excluded.content, check_refs = excluded.check_refs,
         glossary_refs = excluded.glossary_refs, spec_point_refs = excluded.spec_point_refs,
         validation_state = 'SUGGESTED', version = excluded.version, updated_at = now()`,
      [b.id, b.documentId, b.docVersion, b.chapterKey, b.ord, b.type, b.pdfPageAnchor,
       JSON.stringify(b.content), JSON.stringify(b.checkRefs), JSON.stringify(b.glossaryRefs),
       JSON.stringify(b.specPointRefs), b.version],
    );
    ingested += 1;
  }
  for (const t of terms) {
    await client.query(
      `insert into book_glossary_terms
         (id, subject_code, term, slug, definition, ms_accepts, ms_avoids, aliases,
          audio_url, translations, validation_state, created_at, updated_at)
       values (gen_random_uuid(), $1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, null, null, 'SUGGESTED', now(), now())
       on conflict (subject_code, slug) do update set
         term = excluded.term, definition = excluded.definition,
         ms_accepts = excluded.ms_accepts, ms_avoids = excluded.ms_avoids,
         aliases = excluded.aliases, updated_at = now()`,
      [t.subjectCode, t.term, t.slug, t.definition,
       JSON.stringify(t.ms_accepts ?? []), JSON.stringify(t.ms_avoids ?? []), JSON.stringify(t.aliases ?? [])],
    );
  }
  if (skippedChapters > 0 || skippedRefs > 0) {
    // a partial landing is a finding, not a success — the honest red
    throw new Error(`ingest incomplete: ${skippedChapters} chapter skips, ${skippedRefs} ref skips`);
  }
  await client.query("commit");
  console.log(`ingest COMMIT: ${ingested} blocks + ${terms.length} glossary terms, all SUGGESTED (the S4 flip is the operator's)`);
} catch (e) {
  await client.query("rollback");
  console.error(`ingest ROLLBACK: ${e.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}

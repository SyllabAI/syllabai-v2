/**
 * T-MIG-133 band 133b (r0) — the Student Books ingestion pilot runner
 * (ONE book: Edexcel IGCSE Chemistry, the intake receipt's parse of
 * record). Deterministic-first, the fig46 shape: validate → derive TOC →
 * join LOs against the spine (review lane, never silent) → synthesize the
 * canonical document → chunk via the FROZEN ChunkingService → apply in
 * ONE transaction (documents + document_chunks via the frozen
 * ingestCanonicalDocument + book_chapters rows + the per-chunk spec_codes
 * overlay) → postverify → receipt.
 *
 * The DB write is the caller's transaction exactly like the content route
 * (content/index.ts:173) — no partial state: either the whole book lands
 * or nothing does.
 *
 * Embeddings are NOT written here (the zero-API-keys content law — the
 * corpus lands with embed_rev=2 and NULL vectors; the vector arm joins
 * when the operator stages SYLLABAI_EMBEDDING_GEMINI_API_KEY and the
 * existing embed path backfills).
 *
 * Usage:
 *   bun apps/api/scripts/books-ingest-133b.ts --mode dry --jsonl <path> \
 *     --pdf <pdf> --pages 383 --receipt <out.json>
 *   bun apps/api/scripts/books-ingest-133b.ts --mode apply --jsonl <path> \
 *     --pdf <pdf> --pages 383 --db <uri-file> --receipt <out.json>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  bookChunkSchema,
  derivedDocumentId,
  type BookChunk,
  type SpecCodeRef,
} from "@syllabai/contracts";
import { createSql } from "../src/services/identity/users";
import { ingestCanonicalDocument } from "../src/services/ingestion/canonical";
import { chunkCanonicalDocument, specCodeOrder } from "../src/services/ingestion/chunking";
import { deriveToc, type ChapterAgg } from "../src/services/ingestion/books/toc";
import { buildCanonicalDocument } from "../src/services/ingestion/books/canonical-doc";
import { joinChapterLearningObjectives, type SpinePoint } from "../src/services/ingestion/books/spine-join";
import { loadConceptGraphSnapshot } from "../src/services/teacher/snapshot";

const ENGINE = "ibm-docling";
const ENGINE_VERSION = "v3";
const COURSE_ID = "igcse-chemistry-19";
const SUBJECT_TITLE = "Chemistry";
const SUBJECT_CODE = "CHM";
const LABEL = "Edexcel IGCSE Student Book";
const PARSE_REF = "download/rag_chemistry/edexcel_igcse_chemistry_chunks_v3.jsonl";

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : null;
}

function fail(msg: string): never {
  console.error(`FATAL: ${msg}`);
  process.exit(1);
}

// ── load + validate the parse of record ──────────────────────────────────────

const jsonlPath = arg("jsonl") ?? fail("--jsonl required");
const pdfPath = arg("pdf") ?? fail("--pdf required");
const pages = Number(arg("pages") ?? fail("--pages required"));
const mode = arg("mode") ?? "dry";
if (mode !== "dry" && mode !== "apply") fail("--mode must be dry|apply");
if (!Number.isInteger(pages) || pages < 1) fail("--pages must be a positive integer");

const pdfBytes = readFileSync(pdfPath);
const hasher = new Bun.CryptoHasher("sha256");
hasher.update(pdfBytes);
const checksum = hasher.digest("hex");

const rawLines = readFileSync(jsonlPath, "utf8").split("\n").filter((l) => l.trim() !== "");
const rows: BookChunk[] = rawLines.map((line, i) => {
  const parsed = bookChunkSchema.safeParse(JSON.parse(line) as unknown);
  if (!parsed.success) fail(`v3 row ${i + 1} failed the bookChunk grammar: ${parsed.error.message}`);
  return parsed.data;
});
const seenIds = new Set<string>();
for (const r of rows) {
  if (seenIds.has(r.id)) fail(`duplicate v3 chunk id ${r.id}`);
  seenIds.add(r.id);
}
const bookTitle = rows[0]?.book_title ?? "";
const author = rows[0]?.author ?? "";

// ── spine + TOC + joins ──────────────────────────────────────────────────────

const snapshot = loadConceptGraphSnapshot(join(import.meta.dir, "../src/services/teacher"));
if (snapshot.specPoints.length !== 182) {
  fail(`spine of record must carry 182 spec points (was ${snapshot.specPoints.length})`);
}
const spine: SpinePoint[] = snapshot.specPoints.map((sp) => ({
  code: sp.code,
  officialCode: sp.officialCode,
  wording: sp.wording,
  globalOrder: sp.globalOrder,
}));

const documentId = derivedDocumentId(checksum, ENGINE, ENGINE_VERSION);
const tocBuild = deriveToc(rows, {
  bookId: documentId,
  pdfSha256: checksum,
  pageCount: pages,
  parseRef: PARSE_REF,
});

interface ChapterJoinRow {
  chapterKey: string;
  title: string;
  refs: SpecCodeRef[];
  matchedBullets: number;
  review: Array<{ text: string; nearOfficialCode: string | null; nearScore: number | null }>;
}
const chapterJoins = new Map<string, ChapterJoinRow>();
let totalReview = 0;
for (const ch of tocBuild.chapters) {
  const joined = joinChapterLearningObjectives(
    ch.learningObjective ?? "",
    ch.firstLoChunkId ?? "lo:none",
    spine,
  );
  totalReview += joined.review.length;
  chapterJoins.set(ch.chapterKey, {
    chapterKey: ch.chapterKey,
    title: ch.title,
    refs: joined.refs,
    matchedBullets: joined.matchedBullets,
    review: joined.review,
  });
}

// ── canonical document + chunk preview ───────────────────────────────────────

const build = buildCanonicalDocument({
  rows: tocBuild.included,
  checksum,
  uri: `archive:books/${COURSE_ID}/chemistry_book.pdf`,
  fileName: pdfPath.split("/").pop() ?? "chemistry_book.pdf",
  pageCount: pages,
  subjectTitle: SUBJECT_TITLE,
  subjectCode: SUBJECT_CODE,
  label: LABEL,
  engine: ENGINE,
  engineVersion: ENGINE_VERSION,
});
const drafts = chunkCanonicalDocument(build.doc, "TEXTBOOK");

// chunk_index → chapter official codes (the overlay map; structural groups
// stay null — consistent with the papers' retrieval.specCodes=null law)
const overlayRows: Array<{ chunkIndex: number; codes: string[] }> = [];
drafts.forEach((draft, i) => {
  const gk = draft.elementIds.length > 0 ? build.groupByElementId.get(draft.elementIds[0]!) : undefined;
  if (gk === undefined) return;
  const join = chapterJoins.get(gk);
  if (join === undefined) return;
  const codes = [...new Set(join.refs.map((r) => r.officialCode))].sort(specCodeOrder);
  if (codes.length > 0) overlayRows.push({ chunkIndex: i, codes });
});

// ── report ───────────────────────────────────────────────────────────────────

const tierCensus: Record<string, number> = {};
for (const j of chapterJoins.values()) {
  for (const r of j.refs) tierCensus[r.method] = (tierCensus[r.method] ?? 0) + 1;
}
const report = {
  task: "T-MIG-133 band 133b run-001 — Student Books ingestion pilot (r0)",
  mode,
  book: {
    documentId,
    title: bookTitle,
    author,
    checksum,
    pages,
    course: COURSE_ID,
    subjectCode: SUBJECT_CODE,
    parseRef: PARSE_REF,
    engine: `${ENGINE}@${ENGINE_VERSION}`,
  },
  parse: { rows: rows.length, included: tocBuild.included.length, excluded: tocBuild.excluded },
  toc: {
    units: tocBuild.toc.units.map((u) => ({ index: u.index, title: u.title, chapters: u.chapters.length })),
    chapters: tocBuild.chapters.map((c: ChapterAgg) => ({
      key: c.chapterKey,
      title: c.title,
      pdfPages: c.pdfPages,
      bookPages: c.bookPages,
      loChars: c.learningObjective?.length ?? 0,
      refs: chapterJoins.get(c.chapterKey)?.refs ?? [],
      matchedBullets: chapterJoins.get(c.chapterKey)?.matchedBullets ?? 0,
      droppedCaptions: chapterJoins.get(c.chapterKey)?.droppedCaptions ?? 0,
      review: chapterJoins.get(c.chapterKey)?.review ?? [],
    })),
  },
  join: {
    chapters: chapterJoins.size,
    refs: [...chapterJoins.values()].reduce((a, j) => a + j.refs.length, 0),
    tierCensus,
    reviewItems: totalReview,
  },
  chunks: { count: drafts.length, overlaidWithCodes: overlayRows.length },
  headerSample: drafts[0]?.header ?? null,
};

if (mode === "dry") {
  console.log(JSON.stringify({ ...report, toc: { ...report.toc, chapters: report.toc.chapters.length + " (see receipt)" } }, null, 1));
  const out = arg("receipt");
  if (out) {
    writeFileSync(out, JSON.stringify(report, null, 1) + "\n");
    console.log(`receipt written: ${out}`);
  }
  process.exit(0);
}

// ── apply: ONE transaction ───────────────────────────────────────────────────

const dbUriFile = arg("db") ?? fail("--db required (0600 uri file)");
const uri = readFileSync(dbUriFile, "utf8").trim();
// Driver of record: createSql (the api's own client — the frozen
// ingestCanonicalDocument JSON.stringify::jsonb patterns are written for
// THIS serializer; postgres.js double-encodes plain string params into
// ::jsonb as scalars — the COW run-001 defect, disclosed in the worklog).
const sql = createSql(uri);

try {
  const result = await sql.transaction(async (tx) => {
    const ingested = await ingestCanonicalDocument(
      tx as unknown as Parameters<typeof ingestCanonicalDocument>[0],
      build.doc,
      JSON.stringify(tocBuild.toc),
      "TEXTBOOK",
      null,
      new Date(),
    );
    if (ingested.totalChunks !== drafts.length) {
      throw new Error(
        `chunk-count divergence: frozen service stored ${ingested.totalChunks}, preview computed ${drafts.length}`,
      );
    }
    // book_chapters — the chapter registry AND the spec join of record
    // (the JSON.stringify::jsonb pattern = the frozen canonical.ts law
    // under the of-record serializer)
    for (const ch of tocBuild.chapters) {
      await tx`
        insert into book_chapters (
          id, document_id, doc_version, course_id, unit_index, unit_title,
          chapter_index, chapter_key, title, book_page_start, book_page_end,
          pdf_page_start, pdf_page_end, learning_objective, spec_codes,
          validation_state, created_at
        ) values (
          ${crypto.randomUUID()}::uuid, ${documentId}, 1, ${COURSE_ID},
          ${ch.unitIndex}, ${ch.unitTitle}, ${ch.chapterIndex}, ${ch.chapterKey},
          ${ch.title}, ${ch.bookPages?.[0] ?? null}, ${ch.bookPages?.[1] ?? null},
          ${ch.pdfPages[0]}, ${ch.pdfPages[1]}, ${ch.learningObjective},
          ${JSON.stringify(chapterJoins.get(ch.chapterKey)?.refs ?? [])}::jsonb,
          'SUGGESTED', ${new Date().toISOString()}
        )`;
    }
    // per-chunk spec_codes overlay (chapter-scoped; the tutor's spec-scoped
    // boost in 133d reads this column — same shape as the papers' corpus)
    for (const o of overlayRows) {
      await tx`
        update document_chunks set spec_codes = ${JSON.stringify(o.codes)}::jsonb
        where document_row_id = ${ingested.id}::uuid and chunk_index = ${o.chunkIndex}`;
    }
    return ingested;
  });
  console.log(`applied: document_row_id=${result.id} documentId=${result.documentId} chunks=${result.totalChunks}`);

  // ── postverify (read-only, same connection) ────────────────────────────────
  const pv: Record<string, unknown> = {};
  pv.documents = (await sql`select count(*)::int as n from documents where checksum = ${checksum}`)[0]?.n;
  pv.chunks = (await sql`select count(*)::int as n from document_chunks where document_row_id = ${result.id}::uuid`)[0]?.n;
  pv.chunksWithCodes = (await sql`select count(*)::int as n from document_chunks where document_row_id = ${result.id}::uuid and spec_codes is not null`)[0]?.n;
  pv.bookChapters = (await sql`select count(*)::int as n from book_chapters where document_id = ${documentId}`)[0]?.n;
  pv.joinRefs = (await sql`
    select coalesce(sum(jsonb_array_length(spec_codes)), 0)::int as n
    from book_chapters where document_id = ${documentId}`)[0]?.n;
  pv.ftsSanity = (await sql`
    select count(*)::int as n from document_chunks
    where document_row_id = ${result.id}::uuid and content_tsv @@ to_tsquery('english', 'electrolysis')`)[0]?.n;
  pv.sampleHeader = (await sql`
    select substring(content from 1 for 120) as h from document_chunks
    where document_row_id = ${result.id}::uuid order by chunk_index limit 1`)[0]?.h;
  console.log("postverify:", JSON.stringify(pv, null, 1));

  const receipt = {
    ...report,
    applied: {
      documentRowId: result.id,
      documentId: result.documentId,
      duplicate: result.duplicate,
      chunks: result.totalChunks,
      postverify: pv,
      embeddings: "NOT written (zero-API-keys law; embed_rev=2 rows with NULL vectors — backfill via the existing embed path once SYLLABAI_EMBEDDING_GEMINI_API_KEY is staged)",
      appliedAt: new Date().toISOString(),
    },
  };
  const out = arg("receipt");
  if (out) {
    writeFileSync(out, JSON.stringify(receipt, null, 1) + "\n");
    console.log(`receipt written: ${out}`);
  }
} finally {
  // createSql's ws client has no pooled end(); the process exit closes it
}

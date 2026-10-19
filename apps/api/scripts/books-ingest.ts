/**
 * T-MIG-133 band 133f (r7a) — the MULTI-BOOK ingestion driver (the roll
 * instrument; the Maths A 4MA1 slice is the first consumer of record).
 *
 * The 133b pilot runner (books-ingest-133b.ts) stays FROZEN of record —
 * the chemistry constants and the pinned-snapshot spine are its receipt's
 * identity. This driver is the SAME deterministic pipeline (validate →
 * derive TOC → join LOs against the spine → synthesize the canonical
 * document → chunk via the FROZEN ChunkingService → apply in ONE
 * transaction → postverify → receipt) with every subject constant turned
 * into a flag and the spine injected from a HUB CONTENT BUNDLE via
 * bundle-spine.ts (the second-subject spine source of record — zero DB
 * dependency, zero forks).
 *
 * Subject-code law (the 133d lesson of record): --subject-code MUST be the
 * OFFICIAL spec code (e.g. 4MA1), never a mnemonic — the 133b ingest's
 * "CHM" binding was the defect 133d had to correct (CHM/ARCHIVED ->
 * 4CH1/ACTIVE, one pre-guarded UPDATE). The binding rides this value.
 *
 * Embeddings are NOT written here (the zero-API-keys content law — rows
 * land embed_rev=2 with NULL vectors; the book-agnostic 133d CI-egress
 * runner backfills: scripts/t-mig-133d-backfill-exec.ts <DATABASE_URL>
 * <row_id> — row-keyed, subject-blind).
 *
 * Usage (dry — no DB, full deterministic pipeline + receipt):
 *   bun apps/api/scripts/books-ingest.ts --mode dry \
 *     --jsonl <v3.jsonl> --pdf <pdf> --pages <n> \
 *     --course <slug> --subject-code <SPEC> --subject-title "<Subject>" \
 *     --spine-bundle <curriculum.json> --parse-ref "<provenance>" \
 *     [--qualification "<...>"] [--label "<...>"] [--spine-expected <n>] \
 *     --receipt <out.json>
 * Usage (apply — ONE transaction on the target DB; REQUIRES the operator
 * prod-DB write order per the 093/133b law, COW-proof first):
 *   ... --mode apply --db <0600 uri file> --probe-word <word> ...
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
import { buildBundleSpine } from "../src/services/ingestion/books/bundle-spine";
import {
  joinChapterLearningObjectives,
  type SpinePoint,
} from "../src/services/ingestion/books/spine-join";

const ENGINE = "ibm-docling";
const ENGINE_VERSION = "v3";
const LABEL_DEFAULT = "Edexcel IGCSE Student Book";

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : null;
}

function fail(msg: string): never {
  console.error(`FATAL: ${msg}`);
  process.exit(1);
}

// ── flags of record ──────────────────────────────────────────────────────────

const jsonlPath = arg("jsonl") ?? fail("--jsonl required");
const pdfPath = arg("pdf") ?? fail("--pdf required");
const pages = Number(arg("pages") ?? fail("--pages required"));
const mode = arg("mode") ?? "dry";
if (mode !== "dry" && mode !== "apply") fail("--mode must be dry|apply");
if (!Number.isInteger(pages) || pages < 1) fail("--pages must be a positive integer");

const courseId = arg("course") ?? fail("--course required (the course slug of record)");
const subjectCode = (arg("subject-code") ?? fail("--subject-code required (OFFICIAL spec code, e.g. 4MA1)")).trim();
if (!/^[A-Z0-9]+$/.test(subjectCode)) {
  fail(`--subject-code must be the official spec code (got "${subjectCode}") — the 133d binding law`);
}
const subjectTitle = arg("subject-title") ?? fail("--subject-title required");
const qualification =
  arg("qualification") ?? `Pearson Edexcel International GCSE (9-1) ${subjectTitle}`;
const label = arg("label") ?? LABEL_DEFAULT;
const spineBundlePath = arg("spine-bundle") ?? fail("--spine-bundle required (hub content bundle curriculum.json)");
const parseRef = arg("parse-ref") ?? fail("--parse-ref required (the intake provenance of record)");
const spineExpected = arg("spine-expected") ? Number(arg("spine-expected")) : null;
if (spineExpected !== null && (!Number.isInteger(spineExpected) || spineExpected < 1)) {
  fail("--spine-expected must be a positive integer");
}

// ── load + validate the parse of record ──────────────────────────────────────

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

// ── spine (bundle-injected) + TOC + joins ────────────────────────────────────

const bundleBytes = readFileSync(spineBundlePath, "utf8");
const bundleJson = JSON.parse(bundleBytes) as Parameters<typeof buildBundleSpine>[0];
const bundleSpine = buildBundleSpine(bundleJson);
if (spineExpected !== null && bundleSpine.census.specPoints !== spineExpected) {
  fail(
    `spine census mismatch: bundle carries ${bundleSpine.census.specPoints} spec points, --spine-expected ${spineExpected} — fail-closed (the pinned-bundle law)`,
  );
}
const spine: SpinePoint[] = bundleSpine.spine;

const documentId = derivedDocumentId(checksum, ENGINE, ENGINE_VERSION);
const tocBuild = deriveToc(rows, {
  bookId: documentId,
  pdfSha256: checksum,
  pageCount: pages,
  parseRef: parseRef,
  qualification,
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
  uri: `archive:books/${courseId}/${pdfPath.split("/").pop() ?? "student-book.pdf"}`,
  fileName: pdfPath.split("/").pop() ?? "student-book.pdf",
  pageCount: pages,
  subjectTitle,
  subjectCode,
  label,
  engine: ENGINE,
  engineVersion: ENGINE_VERSION,
});
const drafts = chunkCanonicalDocument(build.doc, "TEXTBOOK");

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
  task: "T-MIG-133 band 133f (r7a) — multi-book ingestion driver (second-subject roll)",
  mode,
  driver: "apps/api/scripts/books-ingest.ts (band 133f; the 133b pilot runner stays frozen of record)",
  book: {
    documentId,
    title: bookTitle,
    author,
    checksum,
    pages,
    course: courseId,
    subjectCode,
    subjectTitle,
    qualification,
    parseRef: parseRef,
    engine: `${ENGINE}@${ENGINE_VERSION}`,
  },
  spine: {
    source: spineBundlePath,
    law: "bundle-injected via bundle-spine.ts (the second-subject source of record; the 133b pinned-snapshot spine stays the chemistry pilot's)",
    census: bundleSpine.census,
    expected: spineExpected,
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
const probeWord = arg("probe-word") ?? fail("--probe-word required in apply mode (the postverify ftsSanity token)");
if (!/^[A-Za-z0-9][A-Za-z0-9'-]*$/.test(probeWord)) {
  fail(
    `--probe-word must be a single plain word (got "${probeWord}") — the ftsSanity probe law, fail-closed BEFORE any DB contact (a phrase or tsquery-syntax probe would crash the postverify after COMMIT and lose the apply receipt of record)`,
  );
}
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
    for (const ch of tocBuild.chapters) {
      await tx`
        insert into book_chapters (
          id, document_id, doc_version, course_id, unit_index, unit_title,
          chapter_index, chapter_key, title, book_page_start, book_page_end,
          pdf_page_start, pdf_page_end, learning_objective, spec_codes,
          validation_state, created_at
        ) values (
          ${crypto.randomUUID()}::uuid, ${documentId}, 1, ${courseId},
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
  // GUARDED per the receipt-chain law: every postverify leg is independently
  // caught, so a postverify failure can NEVER abandon the receipt of record on
  // an ALREADY-COMMITTED apply (the run-001 finding: this block sat uncaught
  // between COMMIT and the receipt write, and the operator-supplied
  // --probe-word rode raw into to_tsquery — a phrase probe crashed ftsSanity
  // post-commit and lost the receipt). The probe now rides plainto_tsquery —
  // the identical truth value for the law's single plain word, syntax-proof
  // for any operator input — and --probe-word is pre-flighted to a single
  // plain word above (fail-closed, pre-DB).
  const pv: Record<string, unknown> = {};
  let pvFailed = 0;
  const pvLeg = async (name: string, q: () => Promise<unknown>): Promise<void> => {
    try {
      pv[name] = await q();
    } catch (e) {
      pv[name] = { error: e instanceof Error ? e.message : String(e) };
      pvFailed += 1;
    }
  };
  await pvLeg("documents", async () => (await sql`select count(*)::int as n from documents where checksum = ${checksum}`)[0]?.n);
  await pvLeg("chunks", async () => (await sql`select count(*)::int as n from document_chunks where document_row_id = ${result.id}::uuid`)[0]?.n);
  await pvLeg("chunksWithCodes", async () => (await sql`select count(*)::int as n from document_chunks where document_row_id = ${result.id}::uuid and spec_codes is not null`)[0]?.n);
  await pvLeg("bookChapters", async () => (await sql`select count(*)::int as n from book_chapters where document_id = ${documentId}`)[0]?.n);
  await pvLeg("joinRefs", async () =>
    (
      await sql`
      select coalesce(sum(jsonb_array_length(spec_codes)), 0)::int as n
      from book_chapters where document_id = ${documentId}`
    )[0]?.n);
  await pvLeg("ftsSanity", async () =>
    (
      await sql`
      select count(*)::int as n from document_chunks
      where document_row_id = ${result.id}::uuid and content_tsv @@ plainto_tsquery('english', ${probeWord})`
    )[0]?.n);
  await pvLeg("sampleHeader", async () =>
    (
      await sql`
      select substring(content from 1 for 120) as h from document_chunks
      where document_row_id = ${result.id}::uuid order by chunk_index limit 1`
    )[0]?.h);
  console.log("postverify:", JSON.stringify(pv, null, 1));

  const receipt = {
    ...report,
    applied: {
      documentRowId: result.id,
      documentId: result.documentId,
      duplicate: result.duplicate,
      chunks: result.totalChunks,
      postverify: pv,
      postverifyStatus: pvFailed === 0 ? "PASS" : `FAILED(${pvFailed} leg(s))`,
      embeddings: "NOT written (zero-API-keys law; embed_rev=2 rows with NULL vectors — backfill via the book-agnostic 133d runner scripts/t-mig-133d-backfill-exec.ts on CI egress)",
      appliedAt: new Date().toISOString(),
    },
  };
  const out = arg("receipt");
  if (out) {
    writeFileSync(out, JSON.stringify(receipt, null, 1) + "\n");
    console.log(`receipt written: ${out}`);
  }
  if (pvFailed > 0) {
    fail(
      `postverify failed on ${pvFailed} leg(s) — the apply is COMMITTED and the receipt of record carries postverifyStatus; inspect the target DB before any re-run (a re-run is idempotent-safe: the same checksum rides the frozen dedupe law)`,
    );
  }
} finally {
  // createSql's ws client has no pooled end(); the process exit closes it
}

/**
 * T-MIG-133 band 133a (r0) — the Student Books wire: the Edexcel
 * student-book corpus-package grammar + the book-chapter registry/join
 * shapes.
 *
 * Sources of record (package intake run-001, 2026-10-18, operator trace
 * 1a14f8bf97b983f1 "I have rights on hosting" + the rag package):
 *   - edexcel_igcse_chemistry_chunks_v3.jsonl — 1234 IBM-Docling chunks;
 *     the key/type grammar below is CENSUSED against ALL rows (15 keys,
 *     17 content_type values, unit_no 1-4). v3 is the parse of record
 *     (v1/v2 = the superseded Tesseract corpora, disclosed noisy).
 *   - packages/db documents.kind ALREADY carries 'TEXTBOOK' (the schema of
 *     record anticipated books); book chunks/embeddings ride the existing
 *     document_chunks (pgvector 768, tsvector, doc_version) + ChunkingService.
 *   - the spec-join grammar mirrors the content-maps code law
 *     {spineCode, tier, score, lineage, method} (apps/hub/content-maps).
 *   - join feasibility of record: the book prints NO spec codes; the LO
 *     box texts are verbatim-class matches of the spine's official_wording
 *     (probe: spec 1.2 / 1.8 / chromatogram wording vs ch1/ch2 LO bullets).
 *
 * Binding precedent (sme-question-package / revision-notes): PACKAGE
 * (ingest-input) schemas are .passthrough() (ignoreUnknown); SERVING shapes
 * are strict. Statement-text law: verbatim from the parse, whitespace-
 * normalised only — no notation repair at the contract layer (the v3 text
 * carries native Unicode chemistry: H₂O, ⇌; it is preserved as-is).
 */
import { z } from "zod";

import { validationStateSchema, type ValidationState } from "./content.js";

// ── primitives ───────────────────────────────────────────────────────────────

/** Inclusive 1-based page range [start, end] — book_pages AND pdf_pages.
 *  The book has TWO page numberings of record; the PDF numbering is the
 *  viewer's coordinate system (corpus-pdf/pdf.js), the book numbering is
 *  the citation system ("SB Chemistry p.42"). */
export const pageRangeSchema = z
  .tuple([z.number().int().min(1), z.number().int().min(1)])
  .refine(([a, b]) => a <= b, { message: "page range must be [start, end] with start <= end" });
export type PageRange = z.infer<typeof pageRangeSchema>;

/** The 17 content_type values censused across all 1234 v3 chunks
 *  (parse_report_v3.json content_types agrees: body 493, key_point 140,
 *  table_data 113, exam_hint 113, answers 83, learning_objectives 81,
 *  chapter_questions 50, safety 44, appendix 27, unit_questions 21,
 *  glossary 21, did_you_know 17, front_matter 12, index 11, divider 6,
 *  skills 1, activity 1). */
export const BOOK_CONTENT_TYPES = [
  "body",
  "key_point",
  "table_data",
  "exam_hint",
  "answers",
  "learning_objectives",
  "chapter_questions",
  "safety",
  "appendix",
  "unit_questions",
  "glossary",
  "did_you_know",
  "front_matter",
  "index",
  "divider",
  "skills",
  "activity",
] as const;
export const bookContentTypeSchema = z.enum(BOOK_CONTENT_TYPES);
export type BookContentType = (typeof BOOK_CONTENT_TYPES)[number];

/** Reused from content.ts (the REUSE-not-redeclare law): the four-state ck
 *  constraint shared by the content tables — book_chapters joins the SAME
 *  validation law (SUGGESTED/VALIDATED/REJECTED/FLAGGED). */
export { validationStateSchema, type ValidationState };

// ── the corpus package (ingest input — passthrough) ─────────────────────────

/** One v3 JSONL row, censused grammar. `text_original` + `llm_repaired`
 *  ride the 87 LLM-polished chunks (originals preserved by the producer's
 *  law); they are OPTIONAL here so pre-polish generations also parse. */
export const bookChunkSchema = z
  .object({
    id: z.string().min(1),
    book_title: z.string().min(1),
    author: z.string(),
    unit_no: z.number().int().nullable(),
    unit_name: z.string().nullable(),
    chapter_no: z.number().int().nullable(),
    chapter_title: z.string(),
    section: z.string().nullable(),
    content_type: bookContentTypeSchema,
    book_pages: pageRangeSchema.nullable(),
    pdf_pages: pageRangeSchema,
    char_count: z.number().int().min(0),
    text: z.string(),
    text_original: z.string().optional(),
    llm_repaired: z.boolean().optional(),
  })
  .passthrough();
export type BookChunk = z.infer<typeof bookChunkSchema>;

/** The spec-join reference — the content-maps code grammar (kind-agnostic
 *  reuse; books drop the maps' `unit` field into passthrough-optional
 *  territory). tier/score/lineage/method carry the matching provenance;
 *  weak/absent matches go to REVIEW_REQUIRED, never silent (fig46 law). */
export const specCodeRefSchema = z
  .object({
    spineCode: z.string().min(1),
    officialCode: z.string().min(1),
    officialId: z.string().optional(),
    tier: z.string().min(1),
    score: z.number().optional(),
    lineage: z.string().min(1),
    method: z.string().min(1),
  })
  .passthrough();
export type SpecCodeRef = z.infer<typeof specCodeRefSchema>;

/** documents.canonicalJson shape for a TEXTBOOK document (the derived TOC
 *  of record: units -> chapters with page ranges in BOTH numberings + the
 *  verbatim LO text). Spec JOINS are NOT here — they live in the
 *  book_chapters table (queryable back-refs). */
export const bookTocCanonicalSchema = z
  .object({
    schemaVersion: z.literal("book-toc-v1"),
    bookId: z.string().min(1),
    title: z.string().min(1),
    author: z.string(),
    qualification: z.string().optional(),
    pdfSha256: z.string().length(64),
    pageCount: z.number().int().min(1),
    parseRef: z.string().min(1),
    units: z
      .array(
        z
          .object({
            index: z.number().int().min(1),
            title: z.string().min(1),
            chapters: z.array(
              z.object({
                key: z.string().min(1),
                index: z.number().int().min(1),
                title: z.string().min(1),
                bookPages: pageRangeSchema.nullable(),
                pdfPages: pageRangeSchema,
                learningObjective: z.string().nullable(),
              }),
            ),
          })
          .passthrough(),
      )
      .min(1),
  })
  .passthrough();
export type BookTocCanonical = z.infer<typeof bookTocCanonicalSchema>;

// ── the serving shape (strict) ───────────────────────────────────────────────

/** One book_chapters row as the api serves it — the chapter registry AND
 *  the spec join of record. chapterKey grammar: "u<unit>:c<chapter>"
 *  (sections generalise it to "u<unit>:c<chapter>:s<section>" WITHOUT a
 *  migration — the column is a varchar, not an ordinal triplet). */
export const bookChapterSchema = z.object({
  documentId: z.string().min(1),
  docVersion: z.number().int().min(1),
  courseId: z.string().min(1),
  unitIndex: z.number().int().min(1).nullable(),
  unitTitle: z.string().nullable(),
  chapterIndex: z.number().int().min(1),
  chapterKey: z.string().min(1),
  title: z.string().min(1),
  bookPageStart: z.number().int().min(1).nullable(),
  bookPageEnd: z.number().int().min(1).nullable(),
  pdfPageStart: z.number().int().min(1).nullable(),
  pdfPageEnd: z.number().int().min(1).nullable(),
  learningObjective: z.string().nullable(),
  specCodes: z.array(specCodeRefSchema),
  validationState: validationStateSchema,
});
export type BookChapter = z.infer<typeof bookChapterSchema>;

// ── 133c: the shelf + archive coordinates (strict serving) ──────────────────

/**
 * One TEXTBOOK document as the /api/v1/content/books shelf serves it.
 *
 * T-C20 no-state-leak law: the student shelf serves VALIDATED books only,
 * so validationState is deliberately ABSENT from this shape — a book that
 * has not passed the human gate is simply not on the shelf (honest empty
 * state), and its state never leaks through this surface. The operator's
 * validation flip is the serving lever (never auto-VALIDATED).
 *
 * title/author derive from documents.canonical_json (book-toc-v1); pages =
 * documents.page_count (the pdf.js document length of record);
 * checksum = documents.checksum (the PDF bytes' sha-256 — the same digest
 * the archive host's student-book.pdf carries, band-133c receipt).
 */
export const bookShelfEntrySchema = z.object({
  documentId: z.string().min(1),
  docVersion: z.number().int().min(1),
  courseId: z.string().min(1),
  title: z.string().min(1),
  author: z.string(),
  pages: z.number().int().min(1),
  checksum: z.string().min(1),
});
export type BookShelfEntry = z.infer<typeof bookShelfEntrySchema>;

/**
 * The archive-host coordinates of a book (133c corpus-pdf grammar
 * books/<specKey>/): the corpus-relative path of the PDF the viewer pane
 * streams, plus the byte size for honest load hints. specKey is the
 * course's primary corpus specKey (same grammar as the past-papers
 * archive; the books root lives on the syllabai-resources archive host).
 * Served by the client only as a path — bytes ride /api/corpus-pdf.
 */
export const bookArchiveRefSchema = z.object({
  corpusPath: z.string().min(1),
  bytes: z.number().int().min(1),
});
export type BookArchiveRef = z.infer<typeof bookArchiveRefSchema>;

// ── 133d: the tutor citation target (strict serving) ─────────────────────────

/**
 * The page-true landing for a tutor book citation (band 133d): the book
 * meta the deep link /api/v1/content/books/{documentId}?page=N resolves to,
 * plus the chapter the page lands in under the F-022 nearest-chapter law
 * (pdf-range containment, else the nearest chapter starting at or before
 * the page, else null for front-matter pages — the 133c viewer's
 * pickChapter, verbatim on both planes).
 *
 * T-C20 no-state-leak law: served through the same VALIDATED-only gate as
 * the shelf/chapters (unknown == unvalidated == 404 upstream), so
 * validationState is deliberately ABSENT here too.
 */
export const bookCitationTargetSchema = z.object({
  documentId: z.string().min(1),
  docVersion: z.number().int().min(1),
  courseId: z.string().min(1),
  /** the ?page request coordinate (pdf-true), null when absent */
  page: z.number().int().min(1).nullable(),
  /** the resolved landing chapter (null for front-matter pages / no page) */
  chapter: bookChapterSchema.nullable(),
});
export type BookCitationTarget = z.infer<typeof bookCitationTargetSchema>;

// ── T-BOOK-002: the interactive rail — block/pack grammar, glossary, progress ──
//
// ADR-BOOK-0001 (docs/adr/ADR-BOOK-0001-interactive-rail-over-student-book-spine.md)
// + doctrine: docs/books/{BOOKS-START-HERE,BOOK-PACK-SPEC,BOOK-BUILD-PLAYBOOK}.md.
// The rail is the interactive layer over the page-true spine — never a parallel
// content body. Laws encoded here:
//   - 11 frozen block types (PLAN-4CH1 §3.2); a 12th type is an ADR, not a PR.
//   - Pack/block review state REUSES the content 4-state law
//     (validationStateSchema) — REUSE-not-redeclare; serving gate = VALIDATED
//     book AND VALIDATED pack (T-C20 symmetry).
//   - mcq-embed carries checkRefs ONLY (bank law: checks come from the bank,
//     never authored question text).
//   - sim-embed = PhET CC-BY-4.0 only, fallback link mandatory; media-embed
//     requires an explicit licenseRef (licensing-as-serving-law).
// The attempts discriminator for rail checks is APP-LEVEL on the existing
// free-varchar attempts.provenance (constant below) — attempts is Flyway-owned:
// zero DDL (ADR-BOOK-0001 §12, F-BOOK-0002).

/** The rail block types of record — 9 v1.0 types + sim-embed/media-embed
 *  (Kognity parity leapfrog). Payload field-level grammar evolves with the
 *  widget lanes (T-BOOK-004/005) through the versioned lint/contracts lane;
 *  the envelope law is stable. */
export const BOOK_BLOCK_TYPES = [
  "prose",
  "figure",
  "callout",
  "mcq-embed",
  "sort-match",
  "drag-label",
  "table-fill",
  "num-stepper",
  "eq-builder",
  "sim-embed",
  "media-embed",
] as const;
export const bookBlockTypeSchema = z.enum(BOOK_BLOCK_TYPES);
export type BookBlockType = (typeof BOOK_BLOCK_TYPES)[number];

/** Grammar id of record for the block envelope + payload laws below. */
export const BOOK_BLOCK_GRAMMAR = "book.block/1" as const;

/** App-level attempts.provenance value for rail check attempts
 *  (surface='book_check' in the plan's wording). The column is a free
 *  varchar(40) by design; the frozen-core law forbids DDL on attempts. */
export const ATTEMPT_PROVENANCE_BOOK_CHECK = "BOOK_CHECK" as const;

/** Per-type payload laws — minimal known fields + passthrough (the envelope
 *  is strict-shaped; payloads stay evolvable). Every law here encodes a
 *  doctrine rule, not styling: bank-law checkRefs, PhET-only sims with
 *  mandatory fallback + attribution, media licensing row, figure page-true
 *  anchoring. */
export const bookBlockPayloadLaws = {
  prose: z.object({ text: z.string().min(1) }).passthrough(),
  /** page-true region pointer — figures live in the mounted PDF, never here */
  figure: z.object({ page: z.number().int().min(1) }).passthrough(),
  callout: z.object({ body: z.string().min(1) }).passthrough(),
  /** question text comes from the bank via checkRefs — nothing else needed */
  "mcq-embed": z.object({}).passthrough(),
  "sort-match": z
    .object({
      items: z
        .array(z.object({ id: z.string().min(1), text: z.string().min(1) }).passthrough())
        .min(2),
    })
    .passthrough(),
  "drag-label": z.object({ labels: z.array(z.string().min(1)).min(1) }).passthrough(),
  "table-fill": z.object({ columns: z.array(z.string().min(1)).min(1) }).passthrough(),
  "num-stepper": z
    .object({
      steps: z
        .array(
          z
            .object({
              prompt: z.string().min(1),
              answer: z.union([z.string().min(1), z.number()]),
            })
            .passthrough(),
        )
        .min(1),
    })
    .passthrough(),
  "eq-builder": z.object({ target: z.string().min(1) }).passthrough(),
  /** PhET only (CC-BY 4.0), attribution in-card, CSP fallback mandatory */
  "sim-embed": z
    .object({
      provider: z.literal("phet"),
      simId: z.string().min(1),
      title: z.string().min(1),
      attribution: z.literal("CC-BY-4.0"),
      fallbackUrl: z.string().url(),
    })
    .passthrough(),
  /** poster + link card; no licensing row, no card (honest-empty) */
  "media-embed": z
    .object({ title: z.string().min(1), url: z.string().url(), licenseRef: z.string().min(1) })
    .passthrough(),
} as const;

/** The authored rail block (serving shape; the DB row mirrors it — see
 *  bookBlocks in packages/db). `id` is the authored block id of record
 *  ("<pack>/b<NN>", stable across re-ingests). Binding coordinates ride the
 *  envelope; per-type payload law is enforced by superRefine. */
export const bookBlockSchema = z
  .object({
    id: z.string().min(1),
    documentId: z.string().min(1),
    docVersion: z.number().int().min(1),
    /** chapterKey grammar: "u<unit>:c<chapter>" (bookChapterSchema law) */
    chapterKey: z.string().min(1),
    ord: z.number().int().min(1),
    type: bookBlockTypeSchema,
    /** page anchor in the PDF of record — "see p.42" precision; monotonic
     *  within a pack is the lint's job (G1), presence here is the contract's */
    pdfPageAnchor: z.number().int().min(1).nullable(),
    content: z.record(z.unknown()),
    /** question-bank ids (bank law) — mcq-embed requires >= 1 (superRefine) */
    checkRefs: z.array(z.string().min(1)),
    /** glossary slugs — must resolve in the book's glossary (lint) */
    glossaryRefs: z.array(z.string().min(1)),
    /** official spec point codes — must be inside the chapter's join set (lint) */
    specPointRefs: z.array(z.string().min(1)),
    /** REUSE of the content 4-state law: the pack flip IS this column */
    validationState: validationStateSchema,
    version: z.number().int().min(1),
  })
  .superRefine((b, ctx) => {
    const law = bookBlockPayloadLaws[b.type];
    const parsed = law.safeParse(b.content);
    if (!parsed.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["content"],
        message: `${b.type} payload law (${BOOK_BLOCK_GRAMMAR}) failed: ${parsed.error.issues
          .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
          .join("; ")}`,
      });
    }
    if (b.type === "mcq-embed" && b.checkRefs.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["checkRefs"],
        message: "mcq-embed requires non-empty checkRefs (bank law: checks come from the bank)",
      });
    }
  });
export type BookBlock = z.infer<typeof bookBlockSchema>;

/** One book_glossary_terms row — the mark-scheme language layer
 *  (ms_accepts/ms_avoids) seeded from the book's glossary chunks + authored
 *  accept/avoid lines. Slug is the join key for block glossaryRefs. */
export const bookGlossaryTermSchema = z.object({
  subjectCode: z.string().min(1),
  term: z.string().min(1),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "kebab-case slug (^[a-z0-9]+(?:-[a-z0-9]+)*$)"),
  definition: z.string().min(1),
  msAccepts: z.array(z.string().min(1)),
  msAvoids: z.array(z.string().min(1)),
  aliases: z.array(z.string().min(1)),
  audioUrl: z.string().url().nullable(),
  translations: z.record(z.string()).nullable(),
});
export type BookGlossaryTerm = z.infer<typeof bookGlossaryTermSchema>;

/** One chapter_progress row — the ONLY new persisted user signal of the rail
 *  (ADR-BOOK-0001 §8; coverage is a fact, mastery stays computed, ADR-031). */
export const chapterProgressSchema = z.object({
  userId: z.string().uuid(),
  documentId: z.string().min(1),
  chapterKey: z.string().min(1),
  railScrolledPct: z.number().int().min(0).max(100),
  lastOrd: z.number().int().min(1).nullable(),
  updatedAt: z.string(),
});
export type ChapterProgress = z.infer<typeof chapterProgressSchema>;

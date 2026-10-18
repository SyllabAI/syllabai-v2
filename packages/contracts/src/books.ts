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

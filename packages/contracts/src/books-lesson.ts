/**
 * @syllabai/contracts — the LESSON wire (T-BOOK-030, r0).
 *
 * Operator directive ("both", trace 1a1611a346d9725d): the interactive
 * book ships as TWO renderers over ONE substrate —
 *   - rail   (live): page-true PDF companion layer;
 *   - lesson (new):  Kognity-style HTML reading surface, the student's
 *                    PRIMARY year-round learning mode.
 * The PDF of record is untouched; lesson renders SB-derived prose under
 * the same operator hosting-rights assertion as the PDF slices (same
 * content, different renderer).
 *
 * Pack law (mirrors BOOK-PACK-SPEC + books.ts precedents):
 *   - packs live at books/<qual>/packs/<packId>/ (L2, content-as-code);
 *   - every pack lands SUGGESTED (status "draft"); the VALIDATED flip is
 *     an explicit operator command, never automatic (T-C20 posture);
 *   - cross-links to revision notes / flashcards / exam questions / past
 *     papers are DERIVED at serve time from specRefs via the existing
 *     spine-join bridges (books-notes.ts law) — a pack NEVER authors a
 *     link (never a fabricated link, never a fuzzy title match);
 *   - chunkRefs are provenance pointers into the L1 parse of record
 *     (chunks_v3) — the prose is served from the corpus, not duplicated.
 */
import { z } from "zod";

// ── the section spine (one chapter → ~17 sections) ──────────────────────────

/** One lesson section: a readable run of SB prose plus the interactive
 *  blocks interleaved into it. Prose itself is NOT in the pack — chunkRefs
 *  point at the L1 parse of record so binaries/text stay append-only in
 *  the corpus repo (3-layer storage law). */
export const lessonSectionSchema = z.object({
  /** Section key; grammar "u<unit>:c<NN>:s<NN>" — the generalisation the
   *  books.ts chapterKey comment already reserves. */
  id: z.string().min(1),
  title: z.string().min(1),
  /** Page anchor of record in the PDF of record (1-based); nullable only
   *  for divider/appendix-derived sections. Monotonic within a pack. */
  bookPage: z.number().int().min(1).nullable(),
  /** Provenance into chunks_v3 (chunk ids of record). >=1: a section with
   *  zero prose provenance is not a lesson section (honest-empty law). */
  chunkRefs: z.array(z.string().min(1)).min(1),
  /** VALIDATED block ids interleaved here, in rail `ord` order. Must
   *  resolve to book_blocks rows for the same chapter (lint G2). */
  blockIds: z.array(z.string().min(1)),
  /** Glossary slugs shown as inline chips; must resolve in
   *  books/<qual>/glossary/ (same lint as packs). */
  glossarySlugs: z.array(z.string().min(1)),
  /** Official spec point codes this section teaches; must be a subset of
   *  the chapter's join set (specCodes[].officialCode in book_chapters). */
  specRefs: z.array(z.string().min(1)).min(1),
});
export type LessonSection = z.infer<typeof lessonSectionSchema>;

// ── the pack (one chapter = one lesson pack) ─────────────────────────────────

export const lessonPackStatusSchema = z.enum([
  "draft", // SUGGESTED — authoring output, not served
  "reviewed", // lint+human pass, awaiting operator VALIDATE
  "published", // operator-VALIDATED flip of record; serves on the lesson shelf
]);
export type LessonPackStatus = z.infer<typeof lessonPackStatusSchema>;

export const lessonPackSchema = z.object({
  /** Matches the packs dir name: "c<NN>-<slug>" (PACK-SPEC §1 naming). */
  packId: z.string().min(1),
  /** Chapter key of record: "u<unit>:c<NN>" — must exist in book_chapters. */
  chapterKey: z.string().min(1),
  courseId: z.string().min(1),
  title: z.string().min(1),
  /** Verbatim from book_chapters.learning_objective (no paraphrase). */
  learningObjective: z.string().nullable(),
  /** Paper-route axis: "core" (1C/2C) or "chemistry-only" (P2 "C" band). */
  paperRoute: z.enum(["core", "chemistry-only"]),
  sections: z.array(lessonSectionSchema).min(1),
  status: lessonPackStatusSchema,
  version: z.number().int().min(1),
  /** Provenance of record (sha256 pins, BOOK-NEW-SUBJECT-CHECKLIST law). */
  sources: z.object({
    bookOfRecord: z.string().min(1), // L1 PDF path + sha
    parseOfRecord: z.string().min(1), // L1 chunks_v3 path + sha
    blockPackReceipt: z.string().nullable(), // rail pack receipt this lesson reuses
  }),
  lintPack: z.string().min(1), // e.g. "chem@1.0.0"
});
export type LessonPack = z.infer<typeof lessonPackSchema>;

// ── the serving shape (strict, shelf-law mirror) ─────────────────────────────

/** One lesson as the hub serves it (T-C20 no-state-leak: status ABSENT —
 *  a lesson that has not been operator-VALIDATED simply is not on the
 *  lesson shelf). Cross-links are derived server-side from specRefs via
 *  the spine-join bridges; they are deliberately not part of this shape. */
export const lessonShelfEntrySchema = z.object({
  packId: z.string().min(1),
  chapterKey: z.string().min(1),
  courseId: z.string().min(1),
  title: z.string().min(1),
  learningObjective: z.string().nullable(),
  paperRoute: z.enum(["core", "chemistry-only"]),
  sectionCount: z.number().int().min(1),
  blockCount: z.number().int().min(0),
  version: z.number().int().min(1),
});
export type LessonShelfEntry = z.infer<typeof lessonShelfEntrySchema>;

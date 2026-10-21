/**
 * T-MIG-133 band 133c (r0) — the Student Books READ surface: the per-course
 * shelf and the chapter registry/join of record, served from the Neon edge.
 *
 * SECURITY POSTURE (documented deviation, disclosed of record): the frozen
 * ContentReaderController is isAuthenticated — but that surface serves the
 * WORKBENCH's document store. The books shelf is the STUDENT corpus family:
 * the same posture as the past-papers archive pages (public, read-only,
 * zero PII), gated by the T-C20 corpus law instead of auth — nothing serves
 * without human validation, and non-VALIDATED books are indistinguishable
 * from unknown ones (honest empty shelf / 404, no state leak). The operator
 * validation flip is the serving lever (never auto-VALIDATED); this route
 * merely reflects the flip.
 *
 * Serving shapes are the STRICT 133a/133c contracts (bookShelfEntrySchema /
 * bookChapterSchema) — rows are parsed at the boundary, so a malformed row
 * is an honest 500 (a data defect surfaced), never a silently-shaped 200.
 *
 * Query laws:
 *  - shelf: latest docVersion per document (DISTINCT ON), joined through
 *    book_chapters for the course binding (course_id lives ONLY there —
 *    the soft-reference law: no cross-fence FK).
 *  - chapters: the latest docVersion of the book, unit-ordered
 *    (unit_index NULLS FIRST — front/appendix matter rows have no unit),
 *    chapter_index as the intra-unit order.
 *  - the VALIDATED gate rides the JOIN: an unvalidated book yields zero
 *    rows → the route answers 404 (no state leak).
 *
 * T-BOOK-003 (r0) — the INTERACTIVE RAIL serving layer (ADR-BOOK-0001 §3):
 *  - railBlocksForChapter: the per-chapter VALIDATED block stream. DOUBLE
 *    gate — parent book VALIDATED (the join) AND pack rows VALIDATED (the
 *    where) — anything else degrades honestly: unknown/unvalidated book ⇒
 *    null (route 404s, T-C20), known book without a flipped pack ⇒ [] (the
 *    viewer renders the unchanged 133c page, byte-for-byte).
 *  - chapter_progress GET/PUT: the ONLY new persisted user signal of the
 *    rail (ADR-BOOK-0001 §8 — coverage is a fact, mastery stays computed,
 *    ADR-031 law intact). This surface is AUTH-gated (a user signal, PII —
 *    the deliberate counter-posture to the public-read corpus family above);
 *    userId comes from the requireAuth context, never the wire.
 */
import { z } from "zod";

import { requireDatabaseUrl } from "@syllabai/db";
import {
  bookChapterSchema,
  bookShelfEntrySchema,
  bookCitationTargetSchema,
  bookBlockSchema,
  chapterProgressSchema,
  railCheckBlockSchema,
  railCheckSubmitResultSchema,
  bookGlossaryTermSchema,
  ATTEMPT_PROVENANCE_BOOK_CHECK,
  type BookChapter,
  type BookCitationTarget,
  type BookShelfEntry,
  type BookBlock,
  type ChapterProgress,
  type RailCheckBlock,
  type RailCheckSubmitResult,
  type BookGlossaryTerm,
} from "@syllabai/contracts";

import { createSql, type SqlFn } from "./identity/users";
import { NotFoundException } from "./identity/errors";

export interface BooksReadApp {
  /** VALIDATED TEXTBOOK documents bound to the course (latest version each). */
  shelfForCourse(courseId: string): Promise<BookShelfEntry[]>;
  /** Chapters of a book's latest version; empty when the book is unknown
   *  OR not VALIDATED (the caller cannot distinguish — no state leak). */
  chaptersForBook(documentId: string): Promise<BookChapter[]>;
  /** T-MIG-133 band 133d: the citation-target resolution — the page-true
   *  landing for a tutor book citation. Same T-C20 gate as chaptersForBook
   *  (empty ⇒ unknown, the caller 404s). page=null skips the resolution
   *  (the book meta only). */
  citationTarget(documentId: string, page: number | null): Promise<BookCitationTarget | null>;
  /** T-BOOK-003: the chapter's VALIDATED rail blocks, ord-ordered. null when
   *  the book is unknown/unvalidated (caller 404s); [] when the book serves
   *  but this chapter has no flipped pack (honest-empty, viewer unchanged). */
  railBlocksForChapter(documentId: string, chapterKey: string): Promise<BookBlock[] | null>;
  /** T-BOOK-003: the caller's progress row for one chapter, or null (no row
   *  yet — first open). Auth-gated upstream; userId is server-derived. */
  chapterProgressFor(userId: string, documentId: string, chapterKey: string): Promise<ChapterProgress | null>;
  /** T-BOOK-003: upsert (the uq_chapter_progress_identity key) and return
   *  the row of record. lastOrd null = scrolled, no block reached yet. */
  upsertChapterProgress(
    userId: string,
    documentId: string,
    chapterKey: string,
    railScrolledPct: number,
    lastOrd: number | null,
  ): Promise<ChapterProgress>;
  /** T-BOOK-008: the chapter's mcq-embed blocks resolved against the bank.
   *  null = unknown/unvalidated book (caller 404s); [] = no check blocks;
   *  a block whose refs resolve to nothing carries question:null honestly. */
  railChecksForChapter(documentId: string, chapterKey: string): Promise<RailCheckBlock[] | null>;
  /** T-BOOK-008: the check submit — the MCQ submit law (rail-scoped) with
   *  provenance='BOOK_CHECK' (ATTEMPT_PROVENANCE_BOOK_CHECK); returns the
   *  reveal. Throws NotFound for unknown question/option (fail-closed). */
  submitRailCheck(
    userId: string,
    input: {
      blockId: string;
      questionId: string;
      chosenOptionId: string;
      responseTimeMs: number;
    },
  ): Promise<RailCheckSubmitResult>;
  /** T-BOOK-007: the subject glossary (VALIDATED rows only, T-C20), the
   *  slugs filter optional — the popover layer's resolution surface. */
  glossaryTerms(subjectCode: string, slugs: string[] | null): Promise<BookGlossaryTerm[]>;
}

interface ShelfRow {
  document_id: string;
  doc_version: number;
  course_id: string;
  title: string | null;
  author: string | null;
  pages: number;
  checksum: string;
}

interface ChapterRow {
  document_id: string;
  doc_version: number;
  course_id: string;
  unit_index: number | null;
  unit_title: string | null;
  chapter_index: number;
  chapter_key: string;
  title: string;
  book_page_start: number | null;
  book_page_end: number | null;
  pdf_page_start: number | null;
  pdf_page_end: number | null;
  learning_objective: string | null;
  spec_codes: unknown;
  validation_state: string;
}

function toShelfEntry(row: ShelfRow): BookShelfEntry {
  return bookShelfEntrySchema.parse({
    documentId: row.document_id,
    docVersion: row.doc_version,
    courseId: row.course_id,
    // canonical_json (book-toc-v1) carries the verbatim title/author of the
    // parse of record; a NULL title on a TEXTBOOK row is a data defect and
    // fails the strict schema honestly (500), never a fabricated label.
    title: row.title,
    author: row.author ?? "",
    pages: row.pages,
    checksum: row.checksum,
  });
}

function toChapter(row: ChapterRow): BookChapter {
  return bookChapterSchema.parse({
    documentId: row.document_id,
    docVersion: row.doc_version,
    courseId: row.course_id,
    unitIndex: row.unit_index,
    unitTitle: row.unit_title,
    chapterIndex: row.chapter_index,
    chapterKey: row.chapter_key,
    title: row.title,
    bookPageStart: row.book_page_start,
    bookPageEnd: row.book_page_end,
    pdfPageStart: row.pdf_page_start,
    pdfPageEnd: row.pdf_page_end,
    learningObjective: row.learning_objective,
    specCodes: row.spec_codes,
    validationState: row.validation_state,
  });
}

/** Exported for the unit gates (the mapper IS the strict-contract wall). */
export const booksRowMappers = { toShelfEntry, toChapter };

export class BooksReadRepository {
  constructor(private readonly sql: SqlFn) {}

  async shelfForCourse(courseId: string): Promise<BookShelfEntry[]> {
    const rows = (await this.sql`
      select distinct on (d.document_id)
             d.document_id, d.doc_version, bc.course_id,
             d.canonical_json->>'title' as title,
             d.canonical_json->>'author' as author,
             d.page_count as pages, d.checksum
      from documents d
      join book_chapters bc
        on bc.document_id = d.document_id and bc.doc_version = d.doc_version
      where d.kind = 'TEXTBOOK'
        and d.validation_state = 'VALIDATED'
        and bc.course_id = ${courseId}
      order by d.document_id, d.doc_version desc`) as unknown as ShelfRow[];
    return rows.map(toShelfEntry);
  }

  async chaptersForBook(documentId: string): Promise<BookChapter[]> {
    const rows = (await this.sql`
      with latest as (
        select max(d.doc_version) as v
        from documents d
        where d.document_id = ${documentId}
          and d.kind = 'TEXTBOOK'
          and d.validation_state = 'VALIDATED'
      )
      select bc.document_id, bc.doc_version, bc.course_id,
             bc.unit_index, bc.unit_title, bc.chapter_index, bc.chapter_key,
             bc.title, bc.book_page_start, bc.book_page_end,
             bc.pdf_page_start, bc.pdf_page_end,
             bc.learning_objective, bc.spec_codes, bc.validation_state
      from book_chapters bc, latest
      where bc.document_id = ${documentId}
        and bc.doc_version = latest.v
      order by bc.unit_index asc nulls first, bc.chapter_index asc`) as unknown as ChapterRow[];
    return rows.map(toChapter);
  }

  /**
   * T-MIG-133 band 133d — the citation-target resolution (the page-true
   * landing for a tutor book citation). The F-022 nearest-chapter law
   * VERBATIM (the 133c viewer's pickChapter): a page inside a chapter's pdf
   * range resolves that chapter; otherwise the nearest chapter STARTING at
   * or before the page; a page before every chapter (front matter) resolves
   * null chapter honestly — the book meta still serves. Unknown/unvalidated
   * book ⇒ null (the route 404s — the T-C20 no-state-leak law).
   */
  async citationTarget(
    documentId: string,
    page: number | null,
  ): Promise<BookCitationTarget | null> {
    const chapters = await this.chaptersForBook(documentId);
    if (chapters.length === 0) return null;
    let chapter: BookChapter | null = null;
    if (page != null) {
      chapter =
        chapters.find(
          (c) =>
            c.pdfPageStart != null &&
            c.pdfPageEnd != null &&
            page >= c.pdfPageStart &&
            page <= c.pdfPageEnd,
        ) ??
        [...chapters].reverse().find((c) => c.pdfPageStart != null && c.pdfPageStart <= page) ??
        null;
    }
    return bookCitationTargetSchema.parse({
      documentId: chapters[0]!.documentId,
      docVersion: chapters[0]!.docVersion,
      courseId: chapters[0]!.courseId,
      page,
      chapter,
    });
  }

  /**
   * T-BOOK-003 — the chapter's rail blocks under the DOUBLE gate (ADR
   * §3): the parent book must be VALIDATED (latest version, the same join
   * law chaptersForBook uses) AND the block rows themselves must be
   * VALIDATED (the pack flip is book_blocks.validation_state — the 4-state
   * law, REUSE-not-redeclare). Rows parse at the boundary through
   * bookBlockSchema (book.block/1): a malformed row is an honest 500, a
   * silently-shaped 200 never ships.
   */
  async railBlocksForChapter(
    documentId: string,
    chapterKey: string,
  ): Promise<BookBlock[] | null> {
    const chapters = await this.chaptersForBook(documentId);
    if (chapters.length === 0) return null; // unknown OR unvalidated → T-C20 404 upstream
    const rows = (await this.sql`
      select bb.id, bb.document_id, bb.doc_version, bb.chapter_key, bb.ord,
             bb.type, bb.pdf_page_anchor, bb.content,
             bb.check_refs, bb.glossary_refs, bb.spec_point_refs,
             bb.validation_state, bb.version
      from book_blocks bb
      where bb.document_id = ${documentId}
        and bb.doc_version = ${chapters[0]!.docVersion}
        and bb.chapter_key = ${chapterKey}
        and bb.validation_state = 'VALIDATED'
      order by bb.ord asc`) as unknown as RailBlockRow[];
    return rows.map(railRowMappers.toRailBlock);
  }

  /** T-BOOK-003 — the caller's chapter_progress row (null = first open).
   *  The uuid cast is the DB's own law; a non-uuid user never reaches here
   *  (requireAuth context), so any mismatch is a 22P02 → honest 500. */
  async chapterProgressFor(
    userId: string,
    documentId: string,
    chapterKey: string,
  ): Promise<ChapterProgress | null> {
    const rows = (await this.sql`
      select user_id, document_id, chapter_key,
             rail_scrolled_pct, last_ord, updated_at
      from chapter_progress
      where user_id = ${userId}::uuid
        and document_id = ${documentId}
        and chapter_key = ${chapterKey}
      limit 1`) as unknown as ChapterProgressRow[];
    return rows.length === 0 ? null : railRowMappers.toChapterProgress(rows[0]!);
  }

  /** T-BOOK-003 — the upsert on uq_chapter_progress_identity. Returns the
   *  row of record AFTER the write (re-select free: RETURNING carries it). */
  async upsertChapterProgress(
    userId: string,
    documentId: string,
    chapterKey: string,
    railScrolledPct: number,
    lastOrd: number | null,
  ): Promise<ChapterProgress> {
    const rows = (await this.sql`
      insert into chapter_progress
        (user_id, document_id, chapter_key, rail_scrolled_pct, last_ord, updated_at)
      values (${userId}::uuid, ${documentId}, ${chapterKey}, ${railScrolledPct}, ${lastOrd}, now())
      on conflict (user_id, document_id, chapter_key)
      do update set rail_scrolled_pct = excluded.rail_scrolled_pct,
                    last_ord = excluded.last_ord,
                    updated_at = now()
      returning user_id, document_id, chapter_key,
                rail_scrolled_pct, last_ord, updated_at`) as unknown as ChapterProgressRow[];
    return railRowMappers.toChapterProgress(rows[0]!);
  }

  /**
   * T-BOOK-008 — resolve the chapter's mcq-embed checkRefs against the BANK
   * (ADR §7: checks come from the bank, never authored). Serving laws:
   *   - only ACTIVE, MCQ_SINGLE questions resolve;
   *   - the paper-block law rides the LEFT JOIN (a question pinned to a
   *     REJECTED/FLAGGED exam paper does not serve — the assessment
     *     submit law's assertPaperAllowsServing, verbatim posture);
   *   - the CURRENT question_version carries stem/commandWord;
   *   - an unresolved ref serves question:null honestly (the player's
   *     anchor card) — never a fabricated question.
   */
  async railChecksForChapter(
    documentId: string,
    chapterKey: string,
  ): Promise<RailCheckBlock[] | null> {
    const blocks = await this.railBlocksForChapter(documentId, chapterKey);
    if (blocks == null) return null;
    const mcq = blocks.filter((b) => b.type === "mcq-embed" && b.checkRefs.length > 0);
    if (mcq.length === 0) return [];
    const refs = [...new Set(mcq.flatMap((b) => b.checkRefs))];

    const rows = (await this.sql`
      with latest as (
        select qv.question_id, max(qv.version) as v
        from question_versions qv
        where qv.question_id in (
          select id from questions where external_ref = any(${refs})
        )
        group by qv.question_id
      )
      select q.id as question_id, lv.stem as stem, q.marks as marks,
             lv.command_word as command_word,
             (select coalesce(json_agg(o order by o.ordering), '[]'::json) from (
                select id, label, option_text, ordering
                from question_options
                where question_id = q.id
                order by ordering asc
             ) o) as options
      from questions q
      join latest on latest.question_id = q.id
      join question_versions lv on lv.question_id = latest.question_id and lv.version = latest.v
      left join exam_papers ep on ep.id = q.exam_paper_id
      where q.active
        and q.question_type = 'MCQ_SINGLE'
        and (q.exam_paper_id is null or ep.validation_state not in ('REJECTED', 'FLAGGED'))`) as unknown as Array<{
      question_id: string;
      stem: string;
      marks: number;
      command_word: string | null;
      options: Array<{ id: string; label: string; option_text: string }>;
    }>;
    const byRef = new Map<string, (typeof rows)[number]>();
    for (const r of rows) byRef.set(r.question_id, r);

    // resolve per-block on the FIRST ref that resolves (one check = one
    // question in the pilot; extra refs are fallbacks, never a quiz)
    return mcq.map((b) => {
      let row: CheckRow | null = null;
      for (const ref of b.checkRefs) {
        const found = byRef.get(ref);
        if (found != null) {
          row = {
            question_id: found.question_id,
            stem: found.stem,
            marks: found.marks,
            command_word: found.command_word,
            options: (found.options ?? []).map((o) => ({
              id: o.id,
              label: o.label,
              text: o.option_text,
            })),
          };
          break;
        }
      }
      return toCheckBlock(b.id, b.checkRefs, row);
    });
  }

  /**
   * T-BOOK-008 — the check submit. The MCQ submit law (assessment/submit
   * :77-120), rail-scoped: find active question (404 fail-closed) → chosen
   * option belongs (404) → correct/marks from the row → INSERT attempt with
   * provenance='BOOK_CHECK' (the app-level discriminator, ADR §12: attempts
   * is Flyway-owned, ZERO DDL). Evidence emission deliberately OFF in the
   * pilot (the rail verdict is immediate feedback; learner-model evidence
   * from rail checks is a post-pilot surface — disclosed in the task yaml).
   */
  async submitRailCheck(
    userId: string,
    input: {
      blockId: string;
      questionId: string;
      chosenOptionId: string;
      responseTimeMs: number;
    },
  ): Promise<RailCheckSubmitResult> {
    const qRows = (await this.sql`
      select id, marks from questions
      where id = ${input.questionId}::uuid and active and question_type = 'MCQ_SINGLE'
      limit 1`) as unknown as Array<{ id: string; marks: number }>;
    if (qRows.length === 0) {
      throw new NotFoundException("question", input.questionId);
    }
    const oRows = (await this.sql`
      select id, is_correct from question_options
      where id = ${input.chosenOptionId}::uuid and question_id = ${input.questionId}::uuid
      limit 1`) as unknown as Array<{ id: string; is_correct: boolean }>;
    if (oRows.length === 0) {
      throw new NotFoundException("option", input.chosenOptionId);
    }
    const correct = oRows[0]!.is_correct;
    const marksAwarded = correct ? qRows[0]!.marks : 0;
    const attemptId = crypto.randomUUID();
    const now = new Date();
    await this.sql`
      insert into attempts
        (id, learner_id, question_id, chosen_option_id, correct, marks_awarded,
         response_time_ms, confidence_level, self_doubt_flag, timed_condition,
         provenance, marking_state, evidence_emitted, created_at)
      values (${attemptId}::uuid, ${userId}::uuid, ${input.questionId}::uuid,
              ${input.chosenOptionId}::uuid, ${correct}, ${marksAwarded},
              ${input.responseTimeMs}, null, false, false,
              ${ATTEMPT_PROVENANCE_BOOK_CHECK}, 'AUTO_GRADED', false, ${now.toISOString()})`;
    const correctRows = (await this.sql`
      select id from question_options
      where question_id = ${input.questionId}::uuid and is_correct
      limit 1`) as unknown as Array<{ id: string }>;
    return railCheckSubmitResultSchema.parse({
      correct,
      correctOptionId: correctRows[0]?.id ?? null,
      marksAwarded,
    });
  }

  /** T-BOOK-007 — the subject glossary, VALIDATED rows only (T-C20: a term
   *  that has not passed the human gate is indistinguishable from absent). */
  async glossaryTerms(subjectCode: string, slugs: string[] | null): Promise<BookGlossaryTerm[]> {
    const rows =
      slugs != null && slugs.length > 0
        ? ((await this.sql`
             select subject_code, term, slug, definition,
                    ms_accepts, ms_avoids, aliases, audio_url, translations
             from book_glossary_terms
             where subject_code = ${subjectCode}
               and validation_state = 'VALIDATED'
               and slug = any(${slugs})
             order by term asc`) as unknown as GlossaryRow[])
        : ((await this.sql`
             select subject_code, term, slug, definition,
                    ms_accepts, ms_avoids, aliases, audio_url, translations
             from book_glossary_terms
             where subject_code = ${subjectCode}
               and validation_state = 'VALIDATED'
             order by term asc`) as unknown as GlossaryRow[]);
    return rows.map(toGlossaryTerm);
  }
}

interface RailBlockRow {
  id: string;
  document_id: string;
  doc_version: number;
  chapter_key: string;
  ord: number;
  type: string;
  pdf_page_anchor: number | null;
  content: unknown;
  check_refs: unknown;
  glossary_refs: unknown;
  spec_point_refs: unknown;
  validation_state: string;
  version: number;
}

interface ChapterProgressRow {
  user_id: string;
  document_id: string;
  chapter_key: string;
  rail_scrolled_pct: number;
  last_ord: number | null;
  updated_at: Date | string;
}

function toRailBlock(row: RailBlockRow): BookBlock {
  return bookBlockSchema.parse({
    id: row.id,
    documentId: row.document_id,
    docVersion: row.doc_version,
    chapterKey: row.chapter_key,
    ord: row.ord,
    type: row.type,
    pdfPageAnchor: row.pdf_page_anchor,
    content: row.content,
    checkRefs: row.check_refs,
    glossaryRefs: row.glossary_refs,
    specPointRefs: row.spec_point_refs,
    validationState: row.validation_state,
    version: row.version,
  });
}

function toChapterProgress(row: ChapterProgressRow): ChapterProgress {
  return chapterProgressSchema.parse({
    userId: row.user_id,
    documentId: row.document_id,
    chapterKey: row.chapter_key,
    railScrolledPct: row.rail_scrolled_pct,
    lastOrd: row.last_ord,
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at),
  });
}

/** Exported next to the 133c mappers (the strict-contract wall, rail side). */
export const railRowMappers = { toRailBlock, toChapterProgress };

interface CheckRow {
  question_id: string;
  stem: string;
  marks: number;
  command_word: string | null;
  options: unknown;
}

interface GlossaryRow {
  subject_code: string;
  term: string;
  slug: string;
  definition: string;
  ms_accepts: unknown;
  ms_avoids: unknown;
  aliases: unknown;
  audio_url: string | null;
  translations: unknown;
}

function toCheckBlock(blockId: string, checkRefs: string[], row: CheckRow | null): RailCheckBlock {
  return railCheckBlockSchema.parse({
    blockId,
    checkRefs,
    question:
      row == null
        ? null
        : {
            questionId: row.question_id,
            stem: row.stem,
            marks: row.marks,
            commandWord: row.command_word,
            options: row.options,
          },
  });
}

function toGlossaryTerm(row: GlossaryRow): BookGlossaryTerm {
  return bookGlossaryTermSchema.parse({
    subjectCode: row.subject_code,
    term: row.term,
    slug: row.slug,
    definition: row.definition,
    msAccepts: row.ms_accepts,
    msAvoids: row.ms_avoids,
    aliases: row.aliases,
    audioUrl: row.audio_url,
    translations: row.translations,
  });
}

/** Route-level factory dependency (mirrors buildContentApp's env law). */
export function buildBooksApp(env: Record<string, string | undefined> = process.env): {
  app: BooksReadApp;
} {
  const databaseUrl = requireDatabaseUrl(env as { DATABASE_URL?: string });
  const sql = createSql(databaseUrl) as SqlFn;
  return { app: new BooksReadRepository(sql) };
}

/** Zod re-export for route-level guards (typecheck convenience). */
export const booksSchemas = {
  bookShelfEntrySchema,
  bookChapterSchema,
  bookCitationTargetSchema,
  bookBlockSchema,
  chapterProgressSchema,
};

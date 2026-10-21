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
  type BookChapter,
  type BookCitationTarget,
  type BookShelfEntry,
  type BookBlock,
  type ChapterProgress,
} from "@syllabai/contracts";

import { createSql, type SqlFn } from "./identity/users";

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

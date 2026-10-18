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
 */
import { z } from "zod";

import { requireDatabaseUrl } from "@syllabai/db";
import {
  bookChapterSchema,
  bookShelfEntrySchema,
  type BookChapter,
  type BookShelfEntry,
} from "@syllabai/contracts";

import { createSql, type SqlFn } from "./identity/users";

export interface BooksReadApp {
  /** VALIDATED TEXTBOOK documents bound to the course (latest version each). */
  shelfForCourse(courseId: string): Promise<BookShelfEntry[]>;
  /** Chapters of a book's latest version; empty when the book is unknown
   *  OR not VALIDATED (the caller cannot distinguish — no state leak). */
  chaptersForBook(documentId: string): Promise<BookChapter[]>;
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
export const booksSchemas = { bookShelfEntrySchema, bookChapterSchema };

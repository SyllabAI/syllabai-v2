/**
 * T-MIG-133 band 133c (r0) — the Student Books READ routes' observable HTTP
 * contract, over an IN-MEMORY fake app (no database — the Neon-branch
 * integration tier stays receipted, not unit-tested; the 133b law), plus the
 * row-mapper unit gates (the mapper IS the strict-contract wall).
 *
 * Pinned here:
 *   - the strict serving contracts round-trip the wire (bookShelfEntrySchema
 *     / bookChapterSchema parse the RESPONSE bodies)
 *   - the T-C20 no-state-leak law (validationState absent from the shelf
 *     payload; unknown and unvalidated books are the SAME 404)
 *   - the error shapes (400 missing courseId, 404 unknown/unvalidated book,
 *     throw on a row that fails the strict contract)
 */
import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { z } from "zod";

import { createBooksRouter } from "../../src/routes/books";
import { booksRowMappers } from "../../src/services/books";
import type { BooksReadApp } from "../../src/services/books";
import { toErrorResponse, apiError } from "../../src/services/identity/errors";
import {
  bookChapterSchema,
  bookShelfEntrySchema,
  type BookChapter,
  type BookShelfEntry,
} from "@syllabai/contracts";

const PILOT_DOC = "e6c0db50-0f84-55de-b50c-e4d49285cd6d";
const UNKNOWN_DOC = "00000000-0000-4000-8000-0000000000d1";
const COURSE = "igcse-chemistry-19";

const SHELF_ENTRY: BookShelfEntry = {
  documentId: PILOT_DOC,
  docVersion: 1,
  courseId: COURSE,
  title: "Edexcel International GCSE (9-1) Chemistry Student Book",
  author: "Jim Clark",
  pages: 383,
  checksum: "d48020e0cc0b5545b330bb59b242472198210e424525e4381cd5d2a58a58cc04",
};

const CHAPTER: BookChapter = {
  documentId: PILOT_DOC,
  docVersion: 1,
  courseId: COURSE,
  unitIndex: 1,
  unitTitle: "Principles of Chemistry",
  chapterIndex: 1,
  chapterKey: "u1:c1",
  title: "States of matter",
  bookPageStart: 3,
  bookPageEnd: 13,
  pdfPageStart: 12,
  pdfPageEnd: 22,
  learningObjective: "Investigate the physical properties of solids, liquids and gases",
  specCodes: [
    {
      spineCode: "4CH1-1.1",
      officialCode: "1.1",
      officialId: "4CH1-1.1",
      tier: "1",
      score: 1,
      lineage: "chem_v3_u1_c1_pdf012_0023#b1",
      method: "verbatim",
    },
  ],
  validationState: "SUGGESTED",
};

function fakeApp(overrides: Partial<BooksReadApp> = {}): BooksReadApp {
  return {
    shelfForCourse: async (courseId: string) =>
      courseId === COURSE ? [SHELF_ENTRY] : [],
    chaptersForBook: async (documentId: string) =>
      documentId === PILOT_DOC ? [CHAPTER] : [],
    ...overrides,
  };
}

function router(app: BooksReadApp): Hono {
  return new Hono()
    .onError((err, c) => {
      // the global error law of apps/api/src/index.ts, mirrored for the
      // bare test app (NotFoundException → 404 not_found, etc.)
      const mapped = toErrorResponse(err);
      if (mapped) return c.json(mapped.body, mapped.status as 404);
      return c.json(apiError(500, "internal_error", "an internal error occurred"), 500);
    })
    .route("/api/v1/content/books", createBooksRouter(app));
}

describe("GET /api/v1/content/books (shelf)", () => {
  test("200 — VALIDATED book for the course, strict contract round-trip", async () => {
    const res = await router(fakeApp()).request(
      `/api/v1/content/books?courseId=${COURSE}`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    const parsed = z.array(bookShelfEntrySchema).parse(body);
    expect(parsed).toEqual([SHELF_ENTRY]);
  });

  test("200 — honest empty shelf for a course with no validated books", async () => {
    const res = await router(fakeApp()).request(
      "/api/v1/content/books?courseId=ial-physics-19",
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  test("400 — courseId absent (validation_failed, content-routes message law)", async () => {
    const res = await router(fakeApp()).request("/api/v1/content/books");
    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    // apiError carries a timestamp — pin the identity fields, not the instant
    expect(body.status).toBe(400);
    expect(body.error).toBe("validation_failed");
    expect(body.message).toBe("missing required parameter: courseId");
  });

  test("T-C20 no-state-leak — the shelf payload carries NO validationState", async () => {
    const res = await router(fakeApp()).request(
      `/api/v1/content/books?courseId=${COURSE}`,
    );
    const body = (await res.json()) as Array<Record<string, unknown>>;
    expect(body).toHaveLength(1);
    const entry = body[0] ?? {};
    expect(Object.keys(entry).sort()).toEqual(
      ["author", "checksum", "courseId", "docVersion", "documentId", "pages", "title"],
    );
    expect(entry).not.toHaveProperty("validationState");
  });
});

describe("GET /api/v1/content/books/:documentId/chapters", () => {
  test("200 — chapter registry with the spec join, strict contract round-trip", async () => {
    const res = await router(fakeApp()).request(
      `/api/v1/content/books/${PILOT_DOC}/chapters`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    const parsed = z.array(bookChapterSchema).parse(body);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.chapterKey).toBe("u1:c1");
    expect(parsed[0]?.pdfPageStart).toBe(12);
    expect(parsed[0]?.pdfPageEnd).toBe(22);
    expect(parsed[0]?.bookPageStart).toBe(3);
    expect(parsed[0]?.bookPageEnd).toBe(13);
    expect(parsed[0]?.specCodes[0]?.spineCode).toBe("4CH1-1.1");
  });

  test("404 — unknown book (not_found, NotFoundException message law)", async () => {
    const res = await router(fakeApp()).request(
      `/api/v1/content/books/${UNKNOWN_DOC}/chapters`,
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.status).toBe(404);
    expect(body.error).toBe("not_found");
    expect(body.message).toBe(`Book ${UNKNOWN_DOC} not found`);
  });

  test("T-C20 — an UNVALIDATED book is the SAME 404 (repository gate rides the JOIN)", async () => {
    // the repository returns zero rows for unvalidated books; the route
    // cannot distinguish unknown from unvalidated — assert the equivalence
    const app = fakeApp({ chaptersForBook: async () => [] });
    const unknown = await router(app).request(
      `/api/v1/content/books/${UNKNOWN_DOC}/chapters`,
    );
    const unvalidated = await router(app).request(
      `/api/v1/content/books/${PILOT_DOC}/chapters`,
    );
    // T-C20: the same answer SHAPE both ways — 404 not_found, "Book <id>
    // not found" with the REQUESTED id (request-derived message law); an
    // outside observer cannot tell a SUGGESTED book from a missing one
    for (const [res, id] of [
      [unknown, UNKNOWN_DOC],
      [unvalidated, PILOT_DOC],
    ] as const) {
      const body = (await res.json()) as Record<string, unknown>;
      expect(res.status).toBe(404);
      expect(body.error).toBe("not_found");
      expect(body.message).toBe(`Book ${id} not found`);
    }
  });
});

describe("row mappers — the strict-contract wall (services/books)", () => {
  test("a well-formed chapter row parses to the strict serving shape", () => {
    const row = {
      document_id: PILOT_DOC,
      doc_version: 1,
      course_id: COURSE,
      unit_index: 1,
      unit_title: "Principles of Chemistry",
      chapter_index: 1,
      chapter_key: "u1:c1",
      title: "States of matter",
      book_page_start: 3,
      book_page_end: 13,
      pdf_page_start: 12,
      pdf_page_end: 22,
      learning_objective: null,
      spec_codes: [
        {
          spineCode: "4CH1-1.1",
          officialCode: "1.1",
          officialId: "4CH1-1.1",
          tier: "1",
          score: 1,
          lineage: "chem_v3_u1_c1_pdf012_0023#b1",
          method: "verbatim",
        },
      ],
      validation_state: "SUGGESTED",
    };
    const parsed = booksRowMappers.toChapter(row);
    expect(parsed.chapterKey).toBe("u1:c1");
    expect(parsed.validationState).toBe("SUGGESTED"); // schema .default fill
  });

  test("a row that fails the strict contract THROWS (honest 500 upstream)", () => {
    expect(() =>
      booksRowMappers.toChapter({
        document_id: PILOT_DOC,
        doc_version: 1,
        course_id: COURSE,
        unit_index: 1,
        unit_title: null,
        chapter_index: 1,
        chapter_key: "u1:c1",
        title: "", // a fabricated empty title would be a silent lie
        book_page_start: null,
        book_page_end: null,
        pdf_page_start: 12,
        pdf_page_end: 22,
        learning_objective: null,
        spec_codes: [],
        validation_state: "SUGGESTED",
      }),
    ).toThrow();
  });

  test("shelf mapper: NULL title (missing canonical TOC) throws; NULL author degrades to empty string", () => {
    const base = {
      document_id: PILOT_DOC,
      doc_version: 1,
      course_id: COURSE,
      title: null as string | null,
      author: null as string | null,
      pages: 383,
      checksum: "d48020e0cc0b5545b330bb59b242472198210e424525e4381cd5d2a58a58cc04",
    };
    expect(() => booksRowMappers.toShelfEntry(base)).toThrow();
    const ok = booksRowMappers.toShelfEntry({ ...base, title: "Edexcel International GCSE (9-1) Chemistry Student Book" });
    expect(ok.author).toBe("");
  });
});

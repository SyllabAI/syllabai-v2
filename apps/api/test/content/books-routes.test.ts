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
import { booksRowMappers, railRowMappers } from "../../src/services/books";
import type { BooksReadApp } from "../../src/services/books";
import { toErrorResponse, apiError } from "../../src/services/identity/errors";
import type { AuthContext } from "../../src/middleware/auth";
import {
  bookChapterSchema,
  bookCitationTargetSchema,
  bookShelfEntrySchema,
  bookBlockSchema,
  chapterProgressSchema,
  type BookChapter,
  type BookShelfEntry,
  type BookBlock,
  type ChapterProgress,
} from "@syllabai/contracts";

const PILOT_DOC = "e6c0db50-0f84-55de-b50c-e4d49285cd6d";
const UNKNOWN_DOC = "00000000-0000-4000-8000-0000000000d1";
const COURSE = "igcse-chemistry-19";
const LEARNER_ID = "aa645313-5930-4381-91ed-caff67a2f836";
const STUDENT: AuthContext = {
  email: "student@example.edu",
  userId: LEARNER_ID,
  roles: ["STUDENT"],
  tokenVersion: 1,
};

/** T-BOOK-003 fixture — one authored rail block (book.block/1 strict shape).
 *  Real chemistry, page-true anchor (the chapter's first PDF page). */
const RAIL_BLOCK: BookBlock = {
  id: "c01-states-and-solutions/b01",
  documentId: PILOT_DOC,
  docVersion: 1,
  chapterKey: "u1:c1",
  ord: 1,
  type: "prose",
  pdfPageAnchor: 12,
  content: {
    text: "Particle theory in one pass: the three states differ in how close the particles are and how much they move — not in what the particles are.",
  },
  checkRefs: [],
  glossaryRefs: ["states-of-matter"],
  specPointRefs: ["1.1"],
  validationState: "VALIDATED",
  version: 1,
};

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
    citationTarget: async (documentId: string, page: number | null) => {
      if (documentId !== PILOT_DOC) return null;
      const chapters = [CHAPTER];
      const chapter =
        page == null
          ? null
          : (chapters.find(
                (c) =>
                  c.pdfPageStart != null &&
                  c.pdfPageEnd != null &&
                  page >= c.pdfPageStart &&
                  page <= c.pdfPageEnd,
              ) ??
            [...chapters].reverse().find((c) => c.pdfPageStart != null && c.pdfPageStart <= page) ??
            null);
      return {
        documentId: PILOT_DOC,
        docVersion: 1,
        courseId: CHAPTER.courseId,
        page,
        chapter,
      };
    },
    // T-BOOK-003 rail defaults — BEFORE the overrides spread, so a test's
    // override wins cleanly (spread-last law, no ?? guards needed).
    railBlocksForChapter: async (documentId, chapterKey) => {
      if (documentId !== PILOT_DOC) return null; // unknown/unvalidated book
      return chapterKey === "u1:c1" ? [RAIL_BLOCK] : []; // flipped pack vs honest-empty
    },
    chapterProgressFor: async (userId, documentId, chapterKey) =>
      userId === LEARNER_ID && documentId === PILOT_DOC && chapterKey === "u1:c1"
        ? {
            userId,
            documentId,
            chapterKey,
            railScrolledPct: 42,
            lastOrd: 2,
            updatedAt: "2026-10-21T09:30:00.000Z",
          }
        : null,
    upsertChapterProgress: async (userId, documentId, chapterKey, railScrolledPct, lastOrd) => ({
      userId,
      documentId,
      chapterKey,
      railScrolledPct,
      lastOrd,
      updatedAt: "2026-10-21T09:45:00.000Z",
    }),
    ...overrides,
  };
}

function router(app: BooksReadApp, auth: AuthContext | null = null): Hono {
  const root = new Hono();
  if (auth != null) {
    // the answer-input routes test law: seed the auth context directly (the
    // JWT filter's observable OUTCOME, not its cryptography)
    root.use("*", async (c, next) => {
      c.set("syllabai.auth" as never, auth as never);
      await next();
    });
  }
  return root
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

// ── T-MIG-133 band 133d: the citation-target route (the page-true landing) ───

describe("GET /api/v1/content/books/:documentId?page=N (133d citation target)", () => {
  test("200 — a page inside a chapter's pdf range resolves THAT chapter (F-022)", async () => {
    // u1:c1 spans pdf 12–22 (the fixture law); page 15 lands inside it
    const res = await router(fakeApp()).request(
      `/api/v1/content/books/${PILOT_DOC}?page=15`,
    );
    expect(res.status).toBe(200);
    const body = bookCitationTargetSchema.parse(await res.json());
    expect(body.documentId).toBe(PILOT_DOC);
    expect(body.courseId).toBe(COURSE);
    expect(body.page).toBe(15);
    expect(body.chapter?.chapterKey).toBe("u1:c1");
    // the T-C20 no-state-leak law rides this surface at the TARGET level —
    // the embedded chapter is the 133c BookChapter contract of record
    // (which carries the chapter's own validationState, exactly as the
    // chapters route serves it)
    expect(body).not.toHaveProperty("validationState");
  });

  test("200 — a page before every chapter resolves the honest null chapter", async () => {
    // pdf 5 is before every chapter start (u1:c1 starts at pdf 12)
    const res = await router(fakeApp()).request(
      `/api/v1/content/books/${PILOT_DOC}?page=5`,
    );
    expect(res.status).toBe(200);
    const body = bookCitationTargetSchema.parse(await res.json());
    expect(body.page).toBe(5);
    expect(body.chapter).toBeNull();
  });

  test("200 — absent/malformed ?page resolves the book meta only (positiveInt law)", async () => {
    for (const qs of ["", "?page=abc", "?page=0", "?page=-3"]) {
      const res = await router(fakeApp()).request(
        `/api/v1/content/books/${PILOT_DOC}${qs}`,
      );
      expect(res.status).toBe(200);
      const body = bookCitationTargetSchema.parse(await res.json());
      expect(body.page).toBeNull();
      expect(body.chapter).toBeNull();
    }
  });

  test("404 — unknown book (the T-C20 no-state-leak law, same as chapters)", async () => {
    const res = await router(fakeApp()).request(
      `/api/v1/content/books/${UNKNOWN_DOC}?page=15`,
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.status).toBe(404);
    expect(body.error).toBe("not_found");
  });
});

// ── T-BOOK-003: the interactive rail (blocks + chapter_progress) ─────────────

describe("GET /api/v1/content/books/:documentId/blocks", () => {
  test("200 — VALIDATED pack stream, book.block/1 strict round-trip, ord-ordered", async () => {
    const res = await router(fakeApp()).request(
      `/api/v1/content/books/${PILOT_DOC}/blocks?chapter=u1:c1`,
    );
    expect(res.status).toBe(200);
    const parsed = z.array(bookBlockSchema).parse(await res.json());
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.type).toBe("prose");
    expect(parsed[0]?.pdfPageAnchor).toBe(12);
    expect(parsed[0]?.specPointRefs).toEqual(["1.1"]);
  });

  test("200 [] — known book, chapter with NO flipped pack (honest-empty, not 404)", async () => {
    const res = await router(fakeApp()).request(
      `/api/v1/content/books/${PILOT_DOC}/blocks?chapter=u1:c2`,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  test("404 — unknown/unvalidated book (T-C20, same answer as the chapters route)", async () => {
    for (const app of [
      fakeApp(), // unknown doc → repository null
      fakeApp({
        railBlocksForChapter: async () => null, // unvalidated-book shape
      }),
    ]) {
      const res = await router(app).request(
        `/api/v1/content/books/${UNKNOWN_DOC}/blocks?chapter=u1:c1`,
      );
      expect(res.status).toBe(404);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.error).toBe("not_found");
      expect(body.message).toBe(`Book ${UNKNOWN_DOC} not found`);
    }
  });

  test("400 — chapter parameter absent (validation_failed, message law)", async () => {
    const res = await router(fakeApp()).request(
      `/api/v1/content/books/${PILOT_DOC}/blocks`,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("validation_failed");
    expect(body.message).toBe("missing required parameter: chapter");
  });

  test("400 — chapter parameter malformed (the u<unit>:c<chapter> grammar)", async () => {
    for (const bad of ["1:1", "u1c1", "u1:xexam", "u:n", "u1:c"]) {
      const res = await router(fakeApp()).request(
        `/api/v1/content/books/${PILOT_DOC}/blocks?chapter=${encodeURIComponent(bad)}`,
      );
      expect(res.status).toBe(400);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.error).toBe("validation_failed");
    }
  });

  test("a block row that fails book.block/1 THROWS at the mapper (honest 500 upstream)", () => {
    expect(() =>
      railRowMappers.toRailBlock({
        id: "c01/bad",
        document_id: PILOT_DOC,
        doc_version: 1,
        chapter_key: "u1:c1",
        ord: 1,
        type: "mcq-embed", // bank law: mcq-embed REQUIRES non-empty checkRefs
        pdf_page_anchor: null,
        content: {},
        check_refs: [],
        glossary_refs: [],
        spec_point_refs: [],
        validation_state: "VALIDATED",
        version: 1,
      }),
    ).toThrow();
  });
});

describe("GET/PUT /api/v1/content/books/:documentId/progress", () => {
  test("401 — unauthenticated GET (the auth-gated posture; Boot 401 body)", async () => {
    const res = await router(fakeApp(), null).request(
      `/api/v1/content/books/${PILOT_DOC}/progress?chapter=u1:c1`,
    );
    expect(res.status).toBe(401);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("Unauthorized");
  });

  test("401 — unauthenticated PUT (the user signal never rides an anonymous request)", async () => {
    const res = await router(fakeApp(), null).request(
      `/api/v1/content/books/${PILOT_DOC}/progress?chapter=u1:c1`,
      { method: "PUT", body: JSON.stringify({ railScrolledPct: 50 }) },
    );
    expect(res.status).toBe(401);
  });

  test("200 GET — the caller's row, chapterProgressSchema round-trip", async () => {
    const res = await router(fakeApp(), STUDENT).request(
      `/api/v1/content/books/${PILOT_DOC}/progress?chapter=u1:c1`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { progress: unknown };
    const parsed = chapterProgressSchema.parse(body.progress);
    expect(parsed.railScrolledPct).toBe(42);
    expect(parsed.lastOrd).toBe(2);
    expect(parsed.userId).toBe(LEARNER_ID);
  });

  test("200 GET — no row yet answers {progress: null} (first open, not an error)", async () => {
    const res = await router(fakeApp(), STUDENT).request(
      `/api/v1/content/books/${PILOT_DOC}/progress?chapter=u1:c2`,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ progress: null });
  });

  test("200 PUT — the upsert round-trips the row of record", async () => {
    const res = await router(fakeApp(), STUDENT).request(
      `/api/v1/content/books/${PILOT_DOC}/progress?chapter=u1:c1`,
      { method: "PUT", body: JSON.stringify({ railScrolledPct: 88, lastOrd: 5 }) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { progress: unknown };
    const parsed = chapterProgressSchema.parse(body.progress);
    expect(parsed.railScrolledPct).toBe(88);
    expect(parsed.lastOrd).toBe(5);
  });

  test("400 PUT — pct out of range / non-integer / missing (fixed malformed-request body)", async () => {
    for (const body of [
      { railScrolledPct: 101 },
      { railScrolledPct: -1 },
      { railScrolledPct: 12.5 },
      { lastOrd: 3 },
      "not-an-object",
    ]) {
      const res = await router(fakeApp(), STUDENT).request(
        `/api/v1/content/books/${PILOT_DOC}/progress?chapter=u1:c1`,
        { method: "PUT", body: JSON.stringify(body) },
      );
      expect(res.status).toBe(400);
      const parsed = (await res.json()) as Record<string, unknown>;
      expect(parsed.error).toBe("bad_request");
      expect(parsed.message).toBe("malformed request");
    }
  });

  test("400 — progress routes reject a malformed chapter key (shared chapterKeyOr400 gate)", async () => {
    const res = await router(fakeApp(), STUDENT).request(
      `/api/v1/content/books/${PILOT_DOC}/progress?chapter=nonsense`,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("validation_failed");
  });
});

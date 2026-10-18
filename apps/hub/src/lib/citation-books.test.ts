/**
 * T-MIG-133 band 133d (r0) — the citation-map's TEXTBOOK link translation
 * gates (the hub leg of the page-true book citations).
 *
 * The tutor's TEXTBOOK citations deep-link the books serving surface of
 * record: /api/v1/content/books/{docId}?page={pdf}&course={courseId}. The
 * hub maps that link to its in-app 133c viewer route
 * (/courses/{course}/books/{docId}?page={pdf}) — which resolves ?page via
 * the F-022 nearest-chapter law, the SAME law the API's citation-target
 * route serves. The translation keys on the LINK (the wire truth), not the
 * sourceType enum (the run-010 law).
 *
 * Run: bun test apps/hub/src/lib/citation-books.test.ts
 */
import { describe, expect, test, mock } from "bun:test";

// citation-map is a server module (import "server-only"); the package is a
// Next.js build-time stub absent from the bun-test module graph — shim it
// BEFORE the module under test loads (the answer-format.test.ts law: hub
// unit tests stay pure-module; this shim keeps that true for a server file).
mock.module("server-only", () => ({}));

const { mapCitation } = await import("./citation-map");
type CoreCitation = Parameters<typeof mapCitation>[0];

const bookCitation = (deepLink: string | null, over: Partial<CoreCitation> = {}): CoreCitation => ({
  index: 1,
  label: "Textbook \u2014 pp3\u20134",
  sourceType: "TEXTBOOK",
  documentId: "e6c0db50-0f84-55de-b50c-e4d49285cd6d",
  page: 3, // book-true label coordinate
  nodeId: null,
  deepLink,
  ...over,
});

describe("133d citation-map — the books link shape (the wire truth)", () => {
  test("the books deep link maps to the in-app viewer at the cited page", () => {
    const mapped = mapCitation(
      bookCitation(
        "/api/v1/content/books/e6c0db50-0f84-55de-b50c-e4d49285cd6d?page=12&course=igcse-chemistry-19",
      ),
      0,
    );
    expect(mapped.url).toBe(
      "/courses/igcse-chemistry-19/books/e6c0db50-0f84-55de-b50c-e4d49285cd6d?page=12",
    );
    // the label stays the api's book-true rendering, untouched
    expect(mapped.label).toBe("Textbook \u2014 pp3\u20134");
  });

  test("the link's own course binding wins over the ask's course context", () => {
    const mapped = mapCitation(
      bookCitation("/api/v1/content/books/doc-x?page=5&course=igcse-chemistry-19"),
      0,
      { courseSlug: "igcse-physics-19" },
    );
    expect(mapped.url).toBe("/courses/igcse-chemistry-19/books/doc-x?page=5");
  });

  test("no course in the link → the ask's course context backs it (the surface law)", () => {
    const mapped = mapCitation(bookCitation("/api/v1/content/books/doc-x?page=5"), 0, {
      courseSlug: "igcse-chemistry-19",
    });
    expect(mapped.url).toBe("/courses/igcse-chemistry-19/books/doc-x?page=5");
  });

  test("neither course source → the honest null (never a fabricated path)", () => {
    const mapped = mapCitation(bookCitation("/api/v1/content/books/doc-x?page=5"), 0);
    expect(mapped.url).toBeNull();
  });

  test("a link outside the expected shape stays an honest null", () => {
    const mapped = mapCitation(bookCitation("/api/v1/content/books/"), 0);
    expect(mapped.url).toBeNull();
  });

  test("a paper citation is untouched by the books branch (the documents-route law)", () => {
    const mapped = mapCitation(
      bookCitation("/api/v1/content/documents/row-9?page=11", {
        sourceType: "QUESTION_PAPER",
        label: "Question paper — p11",
      }),
      0,
      { courseSlug: "igcse-chemistry-19" },
    );
    expect(mapped.url).toBe("/sources/row-9?page=11&course=igcse-chemistry-19");
  });
});

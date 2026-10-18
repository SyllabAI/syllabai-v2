/**
 * T-MIG-133 band 133c (r0) — the Student Books read routes.
 *
 *   GET /api/v1/content/books?courseId=<hub-slug>       → BookShelfEntry[]
 *   GET /api/v1/content/books/:documentId/chapters      → BookChapter[]
 *
 * PUBLIC-READ corpus family (the full rationale lives in services/books.ts):
 * read-only, zero PII, student archive posture — and T-C20-gated instead of
 * auth-gated: only VALIDATED books serve, unvalidated books are
 * indistinguishable from unknown ones (404, no state leak). The operator's
 * validation flip is the serving lever; this router reflects it, never
 * bypasses it.
 *
 * Error shapes (the content routes' conventions, ported verbatim):
 *   - courseId ABSENT            → 400 validation_failed
 *                                  "missing required parameter: courseId"
 *   - unknown / unvalidated book → 404 not_found "Book {id} not found"
 *   - row that fails the strict serving contract → 500 internal_error
 *     (a data defect surfaced honestly, never a silently-shaped 200)
 */
import { Hono } from "hono";

import type { BooksReadApp } from "../services/books";
import { apiError, NotFoundException } from "../services/identity/errors";

export function createBooksRouter(app: BooksReadApp): Hono {
  return new Hono()
    .get("/", async (c) => {
      const courseId = c.req.query("courseId");
      if (!courseId) {
        return c.json(
          apiError(400, "validation_failed", "missing required parameter: courseId"),
          400,
        );
      }
      return c.json(await app.shelfForCourse(courseId));
    })
    .get("/:documentId/chapters", async (c) => {
      const documentId = c.req.param("documentId");
      const chapters = await app.chaptersForBook(documentId);
      if (chapters.length === 0) {
        // T-C20: unknown and not-yet-validated are the SAME answer — the
        // shelf's honest empty state and this 404 are the two faces of the
        // same law (no state leak, byte-identical bodies either way).
        throw new NotFoundException("Book", documentId);
      }
      return c.json(chapters);
    });
}

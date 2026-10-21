/**
 * T-MIG-133 band 133c (r0) — the Student Books read routes.
 *
 *   GET /api/v1/content/books?courseId=<hub-slug>       → BookShelfEntry[]
 *   GET /api/v1/content/books/:documentId/chapters      → BookChapter[]
 *   GET /api/v1/content/books/:documentId?page=N        → BookCitationTarget
 *     (T-MIG-133 band 133d: the tutor citation's page-true landing — the
 *     F-022 nearest-chapter resolution on the API plane, the same law the
 *     hub viewer applies; the deep link the tutor citations emit resolves
 *     here honestly, and the hub maps the same link to its in-app viewer.)
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
import { getAuth, requireAuth } from "../middleware/auth";

/** T-BOOK-003: the chapterKey request grammar ("u<unit>:c<chapter>") — the
 *  same law bookChapterSchema documents; the rail only reads, never invents,
 *  keys, so a malformed key is a 400 before any DB round trip. */
const CHAPTER_KEY_RE = /^u\d+:c\d+$/;

function chapterKeyOr400(c: { req: { query(name: string): string | undefined } }):
  | { ok: true; chapterKey: string }
  | { ok: false; response: Response } {
  const raw = c.req.query("chapter");
  if (raw == null || raw.trim() === "") {
    return {
      ok: false,
      response: Response.json(
        apiError(400, "validation_failed", "missing required parameter: chapter"),
        { status: 400 },
      ),
    };
  }
  if (!CHAPTER_KEY_RE.test(raw.trim())) {
    return {
      ok: false,
      response: Response.json(
        apiError(400, "validation_failed", "malformed parameter: chapter (expected u<unit>:c<chapter>)"),
        { status: 400 },
      ),
    };
  }
  return { ok: true, chapterKey: raw.trim() };
}

/** T-BOOK-003: the progress PUT body law — pct 0..100 int, lastOrd ≥1 int
 *  or absent; anything else is the fixed 400 "malformed request" body (the
 *  assessment routes' convention — detail never echoes to the client). */
function parseProgressBody(
  body: unknown,
): { ok: true; pct: number; lastOrd: number | null } | { ok: false } {
  if (typeof body !== "object" || body == null) return { ok: false };
  const { railScrolledPct, lastOrd } = body as {
    railScrolledPct?: unknown;
    lastOrd?: unknown;
  };
  if (typeof railScrolledPct !== "number" || !Number.isInteger(railScrolledPct) || railScrolledPct < 0 || railScrolledPct > 100) {
    return { ok: false };
  }
  if (lastOrd == null) return { ok: true, pct: railScrolledPct, lastOrd: null };
  if (typeof lastOrd !== "number" || !Number.isInteger(lastOrd) || lastOrd < 1) {
    return { ok: false };
  }
  return { ok: true, pct: railScrolledPct, lastOrd };
}

async function readJsonBody(c: { req: { json(): Promise<unknown> } }): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

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
    })
    // ── T-BOOK-003: the interactive rail ────────────────────────────────────
    // GET /:documentId/blocks?chapter=u<n>:c<n> → BookBlock[] (VALIDATED only).
    // PUBLIC-READ posture (same family as the shelf/chapters): the block
    // stream is corpus content, zero PII — the DOUBLE gate (book AND pack
    // VALIDATED) is the serving law, auth is not. Unknown/unvalidated book
    // ⇒ 404 (T-C20); a known book with no flipped pack ⇒ 200 [] — the
    // honest-empty the viewer's unchanged-133c law consumes.
    .get("/:documentId/blocks", async (c) => {
      const gate = chapterKeyOr400(c);
      if (!gate.ok) return gate.response;
      const documentId = c.req.param("documentId");
      const blocks = await app.railBlocksForChapter(documentId, gate.chapterKey);
      if (blocks == null) throw new NotFoundException("Book", documentId);
      return c.json(blocks);
    })
    // GET/PUT /:documentId/progress — the ONE new user signal (ADR §8).
    // AUTH-GATED (user signal, PII — the counter-posture to the public-read
    // corpus family above): requireAuth is the shell; userId rides the
    // verified JWT context, never the wire.
    .use("/:documentId/progress", async (c, next) => {
      const redirect = requireAuth(c);
      if (redirect instanceof Response) return redirect;
      await next();
    })
    .use("/:documentId/progress", async (c, next) => {
      const gate = chapterKeyOr400(c);
      if (!gate.ok) return gate.response;
      await next();
    })
    .get("/:documentId/progress", async (c) => {
      const auth = getAuth(c)!;
      const progress = await app.chapterProgressFor(
        auth.userId,
        c.req.param("documentId"),
        c.req.query("chapter")!.trim(),
      );
      return c.json({ progress });
    })
    .put("/:documentId/progress", async (c) => {
      const auth = getAuth(c)!;
      const parsed = parseProgressBody(await readJsonBody(c));
      if (!parsed.ok) {
        return c.json(apiError(400, "bad_request", "malformed request"), 400);
      }
      const progress = await app.upsertChapterProgress(
        auth.userId,
        c.req.param("documentId"),
        c.req.query("chapter")!.trim(),
        parsed.pct,
        parsed.lastOrd,
      );
      return c.json({ progress });
    })
    .get("/:documentId", async (c) => {
      // band 133d: the citation-target resolution. ?page parses to a positive
      // integer or is ABSENT (a malformed value is treated as absent — the
      // viewer's positiveInt law); anything else about the book is governed
      // by the same T-C20 gate as the chapters route above.
      const documentId = c.req.param("documentId");
      const pageParam = c.req.query("page");
      const parsed = pageParam == null ? NaN : Number.parseInt(pageParam, 10);
      const page = Number.isInteger(parsed) && parsed > 0 ? parsed : null;
      const target = await app.citationTarget(documentId, page);
      if (target == null) {
        throw new NotFoundException("Book", documentId);
      }
      return c.json(target);
    });
}

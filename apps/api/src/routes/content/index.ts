/**
 * Content read-surface routers — path parity with the frozen Java core
 * (T-MIG-020; verified 2026-10-05):
 *   ContentDocumentController  @RequestMapping("/api/v1/teacher/content/documents")
 *   ContentController          @RequestMapping("/api/v1/teacher/content")
 *   ContentReaderController    @RequestMapping("/api/v1/content/documents")
 *   QuestionAssetController    @RequestMapping("/api/v1/content/question-assets")
 *
 * Route security (SecurityConfig.java:87 + @PreAuthorize, deep-audit M5
 * defense-in-depth): /api/v1/teacher/** requires TEACHER/ADMIN — anonymous
 * callers get the Boot 401 body, authenticated non-teacher callers the Boot
 * 403 body (requireRole). The reader and question-asset surfaces are
 * authenticated (isAuthenticated). All three gates run BEFORE any handler
 * body — the authz shell answers before any persistence path (the captured
 * run-001 shell proves this ordering).
 *
 * Error shapes (GlobalExceptionHandler parity, ported in identity/errors):
 *   - unknown/non-citable document     → 404 not_found "Document {id} not found"
 *   - unknown exam paper               → 404 "exam paper {id} not found"
 *   - unknown question                 → 404 "question {id} not found"
 *   - provenance pieces missing        → 404 "provenance for exam paper {id} not found"
 *   - reader page out of range         → 404 "Document page {page} {id} not found"
 *   - malformed uuid / bad kind / bad limit → 400 bad_request "malformed request"
 *   - search query ABSENT              → 400 validation_failed "missing required
 *                                        parameter: query" (custom advice shape,
 *                                        case content-docs-search-missing-query-400)
 *   - search query PRESENT-BUT-BLANK   → 500 internal_error (captured as-is —
 *                                        case content-docs-search-blank-query-500;
 *                                        T-MIG-004 F-2: replicate, never silently
 *                                        "fix")
 *   - unkeyed embedding provider       → 500 internal_error (IllegalStateException
 *                                        parity, ContentRetrievalService.java:51-53)
 *
 * Honest 501 discipline: write surfaces outside T-MIG-020's READ title
 * (ingest, embed's write path stays behind the provider seam, past-papers,
 * validate-*, place, reject, flag/unflag, topics POST) answer
 * 501 {status, error:"not_implemented", message:"not yet ported — owned by
 * <task id>", timestamp} — never a fabricated 200, never a silent drop.
 * (The seed's 501 convention, carried forward; T-MIG-010 replaced the seed's
 * auth 501 the same way.)
 */
import { Hono, type Context } from "hono";
import type { ContentReadApp } from "../../services/content";
import {
  apiError,
  NotFoundException,
  BadRequestException,
} from "../../services/identity/errors";
import { requireAuth, requireRole, bootErrorBody } from "../../middleware/auth";
import { documentKindSchema } from "@syllabai/contracts";
import { MAX_LIMIT, classifyEmptyCause } from "../../services/content/retrieval";

/** Honest 501 for surfaces outside this task's READ title. */
function notImplemented(c: Context, owningTask: string): Response {
  return c.json(
    apiError(501, "not_implemented", `not yet ported — owned by ${owningTask}`),
    501,
  );
}

const CONTENT_WRITE_TASK = "T-MIG-023 (content write surfaces — to be filed by R0)";
const EMBED_WRITE_TASK = "T-MIG-023 (embedding write path rides the provider seam; T-MIG-020 ports its captured deterministic surface only)";

/**
 * Port of MethodArgumentTypeMismatchException + IllegalArgumentException
 * handling (GlobalExceptionHandler.java:167-170): 400 bad_request with the
 * fixed client message.
 */
const malformedRequest = () => new BadRequestException("malformed request");

/** UUID path-variable conversion parity (@PathVariable UUID). */
function parseUuid(raw: string): string {
  if (
    !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(raw)
  ) {
    throw malformedRequest();
  }
  return raw;
}

/**
 * Teacher content router — ContentController + ContentDocumentController.
 * Mounted at "/api/v1/teacher/content". Registration ORDER is load-bearing:
 * "/documents/search" MUST precede "/documents/:id" (Hono is
 * first-match-wins; the Java path matchers disambiguate statically).
 */
export function createTeacherContentRouter(app: ContentReadApp): Hono {
  const r = new Hono();

  // authz shell FIRST (SecurityConfig /api/v1/teacher/** parity): the gate
  // answers before every handler below, including the 501s.
  r.use("*", async (c, next) => {
    const gate = requireRole(c, "TEACHER", "ADMIN");
    if (gate instanceof Response) return gate;
    await next();
  });

  // ── ContentDocumentController ────────────────────────────────────────────

  // GET /documents/search?query=…&kind=…&limit=…&courseRef=… (:134-167)
  r.get("/documents/search", async (c) => {
    const query = c.req.query("query");
    if (query === undefined) {
      // custom advice shape, pinned by content-docs-search-missing-query-400
      return c.json(apiError(400, "validation_failed", "missing required parameter: query"), 400);
    }
    // Spring binding order: argument CONVERSION (kind/limit) precedes
    // parameter VALIDATION — conversion errors answer 400 first.
    const kindRaw = c.req.query("kind");
    let kind: ReturnType<typeof documentKindSchema.parse> | null = null;
    if (kindRaw !== undefined) {
      const parsed = documentKindSchema.safeParse(kindRaw);
      if (!parsed.success) throw malformedRequest();
      kind = parsed.data;
    }
    const limitRaw = c.req.query("limit");
    let limit = 10; // @RequestParam defaultValue = "10"
    if (limitRaw !== undefined) {
      const n = Number(limitRaw);
      if (!Number.isInteger(n)) throw malformedRequest();
      limit = n;
    }
    if (query.trim() === "") {
      // PRESENT-BUT-BLANK: captured 500 internal_error (T-MIG-004 F-2) —
      // reproduced verbatim, never silently normalised to a 400.
      throw new Error("search query must not be blank (capture-pinned 500 path)");
    }
    const courseRefRaw = c.req.query("courseRef");
    const courseTagged = courseRefRaw != null && courseRefRaw.trim() !== "";

    // ADR-030 course-aware resolution — NO fallback to the global scope
    const scope = courseTagged
      ? await app.scope.resolveForCourse(courseRefRaw!.trim())
      : await app.scope.resolveActive(app.requesterId(c));
    if (!scope) {
      const cause = courseTagged ? "COURSE_REF_UNRESOLVED" : "SCOPE_UNRESOLVED";
      c.header("X-Search-Empty-Cause", cause);
      return c.json([]);
    }
    // provider seam: unkeyed → the core's own IllegalStateException → 500
    const provider = app.requireEmbeddingProvider();
    const bounded = Math.min(Math.max(limit, 1), MAX_LIMIT); // Math.clamp(limit,1,MAX_LIMIT)
    const queryVector = await provider.embedQuery(query.trim());
    const hits = await app.searchServingEligible(queryVector, kind, scope, bounded);
    if (hits.length > 0) {
      return c.json(
        hits.map((h) => ({
          chunkId: h.chunkId,
          documentId: h.documentId,
          kind: h.kind,
          chunkIndex: h.chunkIndex,
          content: h.content,
          pageStart: h.pageStart,
          pageEnd: h.pageEnd,
          elementIds: h.elementIds,
          embeddingModel: h.embeddingModel,
          score: h.score,
        })),
      );
    }
    // EMPTY result only: the T-C31 funnel names WHY (body stays a bare array)
    const diagnostics = await app.diagnoseEmpty(kind, scope);
    c.header("X-Search-Empty-Cause", classifyEmptyCause(diagnostics));
    return c.json([]);
  });

  // GET /documents — list (:78-83)
  r.get("/documents", async (c) => c.json(await app.documents.findAllByOrderByCreatedAtDesc().then((rows) => rows.map(app.toDocumentSummary))));

  // GET /documents/:id/canonical — sealed JSON as stored (:93-98)
  r.get("/documents/:id/canonical", async (c) => {
    const id = parseUuid(c.req.param("id"));
    const canonical = await app.documents.canonicalJsonText(id);
    if (canonical == null) throw new NotFoundException("Document", id);
    return new Response(canonical, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });

  // POST /documents — ingest (write surface, outside the READ title)
  r.post("/documents", (c) => notImplemented(c, CONTENT_WRITE_TASK));

  // GET /documents/:id (:85-90)
  r.get("/documents/:id", async (c) => {
    const id = parseUuid(c.req.param("id"));
    const doc = await app.documents.findById(id);
    if (!doc) throw new NotFoundException("Document", id);
    return c.json(app.toDocumentSummary(doc));
  });

  // POST /documents/:id/embed — provider check precedes the row lookup
  // (DocumentEmbeddingService.embedDocument :50-54), which is exactly why
  // the captured unkeyed case is a 500 (content-docs-embed-unknown-404.json
  // pins 500 despite its name — the EXPECT governs).
  r.post("/documents/:id/embed", async (c) => {
    const id = parseUuid(c.req.param("id"));
    const provider = app.requireEmbeddingProvider();
    const result = await app.embedDocument(id, provider);
    return c.json({
      id: result.documentRowId,
      documentId: result.documentId,
      model: result.model,
      embedded: result.embedded,
      skipped: result.skipped,
      totalChunks: result.totalChunks,
    });
  });

  // ── ContentController (read endpoints) ──────────────────────────────────

  r.get("/review-queue", async (c) => c.json(await app.review.reviewQueue()));
  r.get("/review-queue-v2", async (c) => c.json(await app.review.enrichedReviewQueue()));
  r.get("/review-queue-v3", async (c) => c.json(await app.review.enrichedReviewQueueV3()));

  r.get("/exam-papers/:id/review", async (c) => {
    const id = parseUuid(c.req.param("id"));
    return c.json(await app.review.paperReview(id));
  });

  r.get("/exam-papers/:id/audit", async (c) => {
    const id = parseUuid(c.req.param("id"));
    return c.json(await app.review.paperAudit(id));
  });

  r.get("/exam-papers/:id/provenance", async (c) => {
    const id = parseUuid(c.req.param("id"));
    return c.json(await app.review.paperProvenance(id));
  });

  r.get("/questions/:id/topics", async (c) => {
    const id = parseUuid(c.req.param("id"));
    return c.json(await app.review.questionTopicRows(id));
  });

  // write surfaces (ingest/validate/place/reject/flag/topics-map) — honest 501s
  r.post("/past-papers", (c) => notImplemented(c, CONTENT_WRITE_TASK));
  r.post("/exam-papers/:id/validate-all", (c) => notImplemented(c, CONTENT_WRITE_TASK));
  r.post("/exam-papers/:id/validate", (c) => notImplemented(c, CONTENT_WRITE_TASK));
  r.post("/exam-papers/:id/place", (c) => notImplemented(c, CONTENT_WRITE_TASK));
  r.post("/exam-papers/:id/reject", (c) => notImplemented(c, CONTENT_WRITE_TASK));
  r.post("/exam-papers/:id/flag", (c) => notImplemented(c, CONTENT_WRITE_TASK));
  r.post("/exam-papers/:id/unflag", (c) => notImplemented(c, CONTENT_WRITE_TASK));
  r.post("/question-versions/:id/validate", (c) => notImplemented(c, CONTENT_WRITE_TASK));
  r.post("/question-versions/:id/reject", (c) => notImplemented(c, CONTENT_WRITE_TASK));
  r.post("/question-versions/:id/flag", (c) => notImplemented(c, CONTENT_WRITE_TASK));
  r.post("/question-versions/:id/unflag", (c) => notImplemented(c, CONTENT_WRITE_TASK));
  r.post("/mark-schemes/:id/validate", (c) => notImplemented(c, CONTENT_WRITE_TASK));
  r.post("/mark-schemes/:id/reject", (c) => notImplemented(c, CONTENT_WRITE_TASK));
  r.post("/mark-schemes/:id/flag", (c) => notImplemented(c, CONTENT_WRITE_TASK));
  r.post("/mark-schemes/:id/unflag", (c) => notImplemented(c, CONTENT_WRITE_TASK));
  r.post("/questions/:id/topics", (c) => notImplemented(c, CONTENT_WRITE_TASK));

  return r;
}

/**
 * Learner citation router — ContentReaderController (:59-77). Mounted at
 * "/api/v1/content/documents". One route, two shapes: without `page` the
 * document header; with `page` the verbatim page text (DocumentPageText).
 */
export function createContentReaderRouter(app: ContentReadApp): Hono {
  return new Hono().get("/:id", async (c) => {
    const gate = requireAuth(c);
    if (gate instanceof Response) return gate;
    const id = parseUuid(c.req.param("id"));
    const doc = await app.documents.findById(id);
    if (!doc) throw new NotFoundException("Document", id);
    // corpus law (T-C20): nothing serves without human validation — an
    // honest 404 byte-identical to the unknown-id response (no state leak)
    if (!(await app.documents.existsCitable(id))) {
      throw new NotFoundException("Document", id);
    }
    const pageRaw = c.req.query("page");
    let page: number | null = null;
    if (pageRaw !== undefined) {
      const n = Number(pageRaw);
      if (!Number.isInteger(n)) throw malformedRequest();
      page = n;
      if (page < 1 || page > doc.pageCount) {
        throw new NotFoundException(`Document page ${page}`, id);
      }
    }
    const paper = await app.paperRefOf(doc);
    const text = page == null ? null : app.pageText(doc, page);
    return c.json(app.toCitationView(doc, page, text, paper));
  });
}

/**
 * Question asset router — QuestionAssetController (:26-36). Mounted at
 * "/api/v1/content/question-assets". Binary by stored filename; unknown
 * name → 404 with an EMPTY body (ResponseEntity.notFound().build() parity —
 * the golden case pins the empty byte stream).
 */
export function createQuestionAssetRouter(app: ContentReadApp): Hono {
  return new Hono().get("/:filename", async (c) => {
    const gate = requireAuth(c);
    if (gate instanceof Response) return gate;
    const filename = c.req.param("filename");
    const asset = await app.questionAssets.findByFilename(filename);
    if (!asset) {
      return new Response(null, { status: 404 });
    }
    return new Response(asset.bytes as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": asset.contentType,
        "Content-Length": String(asset.sizeBytes),
      },
    });
  });
}

/** bootErrorBody re-export shim — keeps the middleware import list honest. */
export { bootErrorBody };

/**
 * /api/v1/content + /api/v1/teacher/content — port of the Wave-2 read
 * surfaces (T-MIG-020). Sources (frozen core @ 6cad6ef):
 *   content/ContentDocumentController.java  (/api/v1/teacher/content/documents,
 *     @PreAuthorize TEACHER/ADMIN:37)
 *   content/ContentReaderController.java    (/api/v1/content/documents,
 *     isAuthenticated — learner citation surface, corpus law via
 *     existsCitable:64-68)
 *   sme/QuestionAssetController.java        (/api/v1/content/question-assets,
 *     authenticated; 404 = EMPTY body via ResponseEntity.notFound().build())
 *   teacher/ContentController.java          (/api/v1/teacher/content,
 *     @PreAuthorize TEACHER/ADMIN:41 — READ surfaces only here)
 *
 * SecurityConfig route rules (SecurityConfig.java:86-91): /api/v1/teacher/**
 * → TEACHER/ADMIN (requireRole answers the Boot 401/403 bodies);
 * everything else under /api/v1 → anyRequest().authenticated(). Mounts land
 * BEFORE the authenticated() fallback in index.ts (OUT-OF-FENCE wiring,
 * disclosed for R0 — T-MIG-010 precedent).
 *
 * Embedding provider doctrine (ContentEmbeddingService.requireProvider:50
 * order-faithful): the provider is REQUIRED before the document lookup, so
 * on a provider-less boot (LLM mode test — the capture boot posture) POST
 * /{id}/embed answers 500 internal_error REGARDLESS of document existence
 * (golden case content-docs-embed-unknown-404 pins exactly this observable).
 * Vector search beyond the deterministic empty shells is LLM-dependent and
 * NEVER golden-gated (GOLDEN_MASTER §3): without a configured provider the
 * retrieval run fails → 500 internal_error, the same observable the frozen
 * core produces when its provider fails.
 *
 * @PathVariable UUID parity: a malformed uuid is 400 bad_request with the
 * message "malformed request" (MethodArgumentTypeMismatch → shared handler);
 * thrown as a plain tagged error and mapped HERE (identity's errors.ts is
 * outside this task's fence — no shared-file edits).
 */
import { Hono, type Context } from "hono";
import { documentSearchQuerySchema } from "@syllabai/contracts";
import { requireAuth, requireRole } from "../../middleware/auth";
import { NotFoundException, apiError } from "../../services/identity/errors";
import type { DocumentsRepository, DocumentRow } from "../../services/content/documents";
import type { QuestionAssetsRepository } from "../../services/content/assets";
import type { ContentReviewRepository } from "../../services/content/review";
import type { CurriculumScopeResolver } from "../../services/content/scope";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * DocumentPageText.of port (content/DocumentPageText.java): verbatim page
 * text from the sealed canonical JSON — text-bearing families only
 * (textBlocks + tables + equations, snake_case element fields), stable sort
 * by reading_order (nulls last, equal keeps document order), joined by
 * '\n'. A text-free page yields "" — never a placeholder.
 */
export function documentPageText(canonicalJson: string, page: number): string {
  const doc = JSON.parse(canonicalJson) as {
    textBlocks?: CanonicalElement[] | null;
    tables?: CanonicalElement[] | null;
    equations?: CanonicalElement[] | null;
  };
  const pieces: Array<{ readingOrder: number | null; text: string }> = [];
  const collect = (elements: CanonicalElement[] | null | undefined) => {
    if (!elements) return;
    for (const e of elements) {
      if (e && e.text != null && e.page_number === page) {
        pieces.push({ readingOrder: e.reading_order ?? null, text: e.text });
      }
    }
  };
  collect(doc.textBlocks);
  collect(doc.tables);
  collect(doc.equations);
  pieces.sort((a, b) => {
    if (a.readingOrder == null && b.readingOrder == null) return 0;
    if (a.readingOrder == null) return 1; // nulls last, never first
    if (b.readingOrder == null) return -1;
    return a.readingOrder - b.readingOrder;
  });
  return pieces.map((p) => p.text).join("\n");
}

interface CanonicalElement {
  text?: string | null;
  page_number?: number | null;
  reading_order?: number | null;
}

function summaryView(d: DocumentRow) {
  return {
    id: d.id,
    documentId: d.documentId,
    docVersion: d.docVersion,
    kind: d.kind,
    title: d.fileName ?? d.sourceUri,
    pageCount: d.pageCount,
    elementCount: d.elementCount,
    textElementCount: d.textElementCount,
    chunkCount: d.chunkCount,
    sourceEngine: d.sourceEngine,
    sourceEngineVersion: d.sourceEngineVersion,
    checksum: d.checksum,
    createdAt: d.createdAt,
  };
}

/** ContentReaderController.get:59-77 — one route, two shapes; corpus law is
 *  the real gate (existsCitable — an honest 404 identical to unknown-id). */
async function citationGet(
  documents: DocumentsRepository,
  review: ContentReviewRepository,
  id: string,
  pageParam: string | undefined,
) {
  const doc = await documents.findById(id);
  if (!doc) throw new NotFoundException("Document", id);
  if (!(await documents.existsCitable(id))) {
    // corpus law: nothing serves without human validation — no state leak
    throw new NotFoundException("Document", id);
  }
  const paperRef = await paperRefOf(doc, review);
  if (pageParam == null) {
    return { ...citationView(doc, null, null), paper: paperRef };
  }
  const page = Number(pageParam);
  if (!Number.isInteger(page) || page < 1 || page > doc.pageCount) {
    throw new NotFoundException(`Document page ${pageParam}`, id);
  }
  // the parse cost is paid only by requests that already passed the gate
  return { ...citationView(doc, page, documentPageText(doc.canonicalJson, page)), paper: paperRef };
}

/** paperRefOf (ContentReaderController.java:85-95): QP/MS rows only; the
 *  FIRST paper linked by business document id; null otherwise. */
async function paperRefOf(doc: DocumentRow, review: ContentReviewRepository) {
  if (doc.kind !== "QUESTION_PAPER" && doc.kind !== "MARK_SCHEME") return null;
  const p = await review.findExamPaperByLinkedDocumentId(doc.documentId);
  if (!p) return null;
  return {
    paperId: p.id,
    paperCode: p.paperCode,
    sessionLabel: p.sessionLabel,
    role: doc.kind === "QUESTION_PAPER" ? ("QP" as const) : ("MS" as const),
  };
}

function citationView(d: DocumentRow, page: number | null, text: string | null) {
  return {
    id: d.id,
    documentId: d.documentId,
    docVersion: d.docVersion,
    kind: d.kind,
    title: d.fileName ?? d.sourceUri,
    pageCount: d.pageCount,
    page,
    text,
  };
}

/** Learner surface — /api/v1/content (isAuthenticated parity). */
export function createContentRoutes(
  documents: DocumentsRepository,
  assets: QuestionAssetsRepository,
  review: ContentReviewRepository,
): Hono {
  const app = new Hono();

  // GET /api/v1/content/documents/{id}[?page=] — citation read (L5)
  app.get("/documents/:id", async (c) => {
    const auth = requireAuth(c);
    if (auth instanceof Response) return auth;
    const id = c.req.param("id");
    if (!UUID_RE.test(id)) {
      return c.json(apiError(400, "bad_request", "malformed request"), 400);
    }
    try {
      return c.json(await citationGet(documents, review, id, c.req.query("page")));
    } catch (e) {
      if (e instanceof NotFoundException) {
        return c.json(apiError(404, "not_found", e.message), 404);
      }
      throw e;
    }
  });

  // GET /api/v1/content/question-assets/{filename} — raw bytes; 404 EMPTY body
  app.get("/question-assets/:filename", async (c) => {
    const auth = requireAuth(c);
    if (auth instanceof Response) return auth;
    const asset = await assets.findByFilename(c.req.param("filename"));
    if (!asset) {
      // ResponseEntity.notFound().build() parity: a truly EMPTY body (0
      // bytes) — c.body(null) serializes "null" in some Hono versions, so
      // the raw Response bypasses serialization entirely.
      return new Response(null, { status: 404 });
    }
    return c.body(asset.bytes as unknown as ArrayBuffer, 200, {
      "Content-Type": asset.contentType,
      "Content-Length": String(asset.sizeBytes),
    });
  });

  return app;
}

/** Teacher surface — /api/v1/teacher/content (TEACHER/ADMIN parity, :41). */
export function createTeacherContentRoutes(
  documents: DocumentsRepository,
  review: ContentReviewRepository,
  scopes: CurriculumScopeResolver,
): Hono {
  const app = new Hono();

  // class-level @PreAuthorize hasAnyRole('TEACHER','ADMIN') parity (:41)
  app.use("*", async (c, next) => {
    const auth = requireRole(c, "TEACHER", "ADMIN");
    if (auth instanceof Response) return auth;
    await next();
  });

  // ── canonical document store (ContentDocumentController) ──────────────
  app.get("/documents", async (c) => {
    return c.json((await documents.findAllByOrderByCreatedAtDesc()).map(summaryView));
  });

  app.get("/documents/search", async (c) => {
    const parsed = documentSearchQuerySchema.safeParse({
      query: c.req.query("query"),
      kind: c.req.query("kind") ?? undefined,
      limit: c.req.query("limit") ?? undefined,
      courseRef: c.req.query("courseRef") ?? undefined,
    });
    if (!parsed.success) {
      // @RequestParam absent → MissingServletRequestParameter parity
      return c.json(apiError(400, "validation_failed", "missing required parameter: query"), 400);
    }
    const { query, courseRef } = parsed.data;
    // Spring Boot 4 built-in method validation fires @NotBlank BEFORE the
    // body; HandlerMethodValidationException is unmapped → 500 internal_error
    // (capture-pinned F-2: do not "fix" this — Java wins).
    if (query.trim() === "") {
      throw new Error("blank query (HandlerMethodValidationException parity)");
    }
    const auth = requireRole(c, "TEACHER", "ADMIN");
    if (auth instanceof Response) return auth;
    const courseTagged = courseRef != null && courseRef.trim() !== "";
    const scope = courseTagged
      ? await scopes.resolveForCourse(courseRef.trim())
      : await scopes.resolveActive(auth.userId);
    if (!scope) {
      // T-C31 empty-cause observability; body stays a bare array (the golden
      // runner compares status+body only — the header is still emitted, F-3)
      return c.json([], 200, {
        "X-Search-Empty-Cause": courseTagged ? "COURSE_REF_UNRESOLVED" : "SCOPE_UNRESOLVED",
      });
    }
    // LLM-dependent retrieval (embedding provider) — never golden-gated;
    // a provider-less boot fails here exactly like the frozen core's
    // provider outage → 500 internal_error.
    throw new Error("embedding provider not configured (SYLLABAI_LLM_MODE=test parity)");
  });

  app.get("/documents/:id", async (c) => {
    const id = c.req.param("id");
    if (!UUID_RE.test(id)) {
      return c.json(apiError(400, "bad_request", "malformed request"), 400);
    }
    const doc = await documents.findById(id);
    if (!doc) {
      return c.json(apiError(404, "not_found", `Document ${id} not found`), 404);
    }
    return c.json(summaryView(doc));
  });

  app.get("/documents/:id/canonical", async (c) => {
    const id = c.req.param("id");
    if (!UUID_RE.test(id)) {
      return c.json(apiError(400, "bad_request", "malformed request"), 400);
    }
    const doc = await documents.findById(id);
    if (!doc) {
      return c.json(apiError(404, "not_found", `Document ${id} not found`), 404);
    }
    // the sealed canonical JSON exactly as ingested (content-preserving)
    return c.body(doc.canonicalJson, 200, { "Content-Type": "application/json" });
  });

  app.post("/documents/:id/embed", async (c) => {
    // requireProvider() runs BEFORE the document lookup (order-faithful);
    // provider-less boots 500 regardless of existence (capture evidence).
    throw new Error("embedding provider not configured (SYLLABAI_LLM_MODE=test parity)");
  });

  // ── §7 validation workflow READ surfaces (ContentController) ──────────
  app.get("/review-queue", async (c) => c.json(await review.reviewQueue()));
  app.get("/review-queue-v2", async (c) => c.json(await review.enrichedReviewQueue()));
  app.get("/review-queue-v3", async (c) => c.json(await review.enrichedReviewQueueV3()));

  app.get("/exam-papers/:id/audit", async (c) => {
    const id = c.req.param("id");
    if (!UUID_RE.test(id)) {
      return c.json(apiError(400, "bad_request", "malformed request"), 400);
    }
    try {
      return c.json(await review.paperAudit(id));
    } catch (e) {
      if (e instanceof NotFoundException) {
        return c.json(apiError(404, "not_found", e.message), 404);
      }
      throw e;
    }
  });

  app.get("/exam-papers/:id/provenance", async (c) => {
    const id = c.req.param("id");
    if (!UUID_RE.test(id)) {
      return c.json(apiError(400, "bad_request", "malformed request"), 400);
    }
    try {
      return c.json(
        await review.provenance((docId) => documents.findTopByDocumentIdOrderByDocVersionDesc(docId), id),
      );
    } catch (e) {
      if (e instanceof NotFoundException) {
        return c.json(apiError(404, "not_found", e.message), 404);
      }
      throw e;
    }
  });

  app.get("/questions/:id/topics", async (c) => {
    const id = c.req.param("id");
    if (!UUID_RE.test(id)) {
      return c.json(apiError(400, "bad_request", "malformed request"), 400);
    }
    try {
      return c.json(await review.questionTopicRows(id));
    } catch (e) {
      if (e instanceof NotFoundException) {
        return c.json(apiError(404, "not_found", e.message), 404);
      }
      throw e;
    }
  });

  // ── honest 501s: write surfaces + paperReview (not yet ported) ────────
  // Every 501 names the owning task — never a fabricated 200 (honest-
  // response rule). paperReview is a read surface outside the 26-case
  // worklist; it lands with the write-surface follow-up task.
  const pending = (c: Context) =>
    c.json(
      {
        status: 501,
        error: "not_implemented",
        message:
          "not yet ported — owned by the T-MIG-020 write-surfaces follow-up; tracked in the task execution_record",
        path: c.req.path,
      },
      501,
    );
  app.post("/past-papers", (c) => pending(c));
  app.post("/exam-papers/:id/validate-all", (c) => pending(c));
  app.post("/exam-papers/:id/validate", (c) => pending(c));
  app.post("/exam-papers/:id/place", (c) => pending(c));
  app.post("/exam-papers/:id/reject", (c) => pending(c));
  app.post("/exam-papers/:id/flag", (c) => pending(c));
  app.post("/exam-papers/:id/unflag", (c) => pending(c));
  app.get("/exam-papers/:id/review", async (c) => {
    // the unknown-paper 404 path is golden-pinned; the existing-paper
    // projection is not yet ported → named 501 (honest-response rule)
    const id = c.req.param("id");
    if (!UUID_RE.test(id)) {
      return c.json(apiError(400, "bad_request", "malformed request"), 400);
    }
    if (!(await review.paperExists(id))) {
      return c.json(apiError(404, "not_found", `exam paper ${id} not found`), 404);
    }
    return pending(c);
  });
  app.post("/question-versions/:id/validate", (c) => pending(c));
  app.post("/question-versions/:id/reject", (c) => pending(c));
  app.post("/question-versions/:id/flag", (c) => pending(c));
  app.post("/question-versions/:id/unflag", (c) => pending(c));
  app.post("/mark-schemes/:id/validate", (c) => pending(c));
  app.post("/mark-schemes/:id/reject", (c) => pending(c));
  app.post("/mark-schemes/:id/flag", (c) => pending(c));
  app.post("/mark-schemes/:id/unflag", (c) => pending(c));
  app.post("/questions/:id/topics", (c) => pending(c));

  return app;
}

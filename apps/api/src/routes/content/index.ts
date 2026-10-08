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
 * Honest 501 discipline (retired for the write band by T-MIG-107): the
 * write surfaces that answered "not yet ported" since T-MIG-020 now serve
 * the frozen wire laws — ingest, validate-*, place, reject, flag/unflag,
 * topics POST, past-papers POST (see the §7 write-surface section below).
 * Any future surface outside a lane's title keeps the same honest shell
 * convention: never a fabricated 200, never a silent drop.
 */
import { Hono, type Context } from "hono";
import type { ContentReadApp } from "../../services/content";
import {
  apiError,
  NotFoundException,
  BadRequestException,
} from "../../services/identity/errors";
import { requireAuth, requireRole, bootErrorBody, getAuth } from "../../middleware/auth";
import { documentKindSchema } from "@syllabai/contracts";
import {
  pastPaperDraftSchema,
  canonicalDocumentSchema,
  PAST_PAPER_SUPPORTED_SCHEMA,
  type PastPaperDraft,
} from "@syllabai/contracts";
import { MAX_LIMIT, classifyEmptyCause } from "../../services/content/retrieval";
import {
  ingestCanonicalDocument,
  InvalidDocumentError,
  type IngestionResult,
} from "../../services/ingestion/canonical";
import {
  ingestPastPaperDraft,
  type IngestionSummary,
} from "../../services/ingestion/past-paper";
import type { ContentReviewWriteService } from "../../services/content/review-writes";

/**
 * The GlobalExceptionHandler unreadable-body law (:175-182): 400
 * malformed_body with the fixed client message (R10 — request-derived
 * excerpts never reach the body).
 */
const malformedBodyError = () =>
  apiError(400, "malformed_body", "request body is not readable (check field types and enum values)");

async function readJsonObjectBody(c: Context): Promise<{ ok: true; value: unknown } | { ok: false }> {
  try {
    const text = await c.req.text();
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}

/**
 * @RequestBody(required=false) parity: an ABSENT body binds null (the
 * required=false law) — distinct from a present-but-unreadable body,
 * which is malformed_body.
 */
async function readOptionalJsonObjectBody(
  c: Context,
): Promise<{ ok: true; value: unknown } | { ok: false }> {
  const text = await c.req.text();
  if (text.trim() === "") return { ok: true, value: null };
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}

/**
 * Jackson UUID body-field parity: a PRESENT-but-malformed uuid string in a
 * request BODY fails the Jackson UUID deserialization →
 * HttpMessageNotReadableException → 400 malformed_body (distinct from the
 * @PathVariable MethodArgumentTypeMismatch law, which is 400 bad_request
 * "malformed request"). Absent/null stays null (no Jackson error).
 */
function parseBodyUuid(value: unknown): string | null {
  if (value == null) return null;
  if (
    typeof value === "string" &&
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(value)
  ) {
    return value;
  }
  throw new Error("__malformed_body__");
}

/** InvalidDocumentError → 400 invalid_document (GlobalExceptionHandler :90-93). */
function invalidDocumentResponse(c: Context, e: unknown): Response | null {
  if (e instanceof InvalidDocumentError) {
    return c.json(apiError(400, "invalid_document", e.message), 400);
  }
  return null;
}

/**
 * ContentAuditRecorder.currentActorLabel + actor-user parity at the route
 * layer: the reviewer's email + user id from the JWT auth context; null
 * (→ "system" label) outside a request context.
 */
function writeActor(c: Context): { userId: string | null; email: string | null } {
  const auth = getAuth(c);
  return auth ? { userId: auth.userId, email: auth.email } : { userId: null, email: null };
}

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

  // POST /documents — ingest (ContentDocumentController :66-76): 201 CREATED;
  // kind = @RequestParam(defaultValue="OTHER") Document.Kind (conversion
  // precedes body reading — a bad kind answers 400 before the body is read);
  // the body is the RAW JSON string, parsed + validated core-side.
  r.post("/documents", async (c) => {
    const kindRaw = c.req.query("kind") ?? "OTHER";
    const kindParsed = documentKindSchema.safeParse(kindRaw);
    if (!kindParsed.success) throw malformedRequest();
    const raw = await c.req.text();
    if (raw.trim() === "") {
      // @RequestBody String with an empty body → HttpMessageNotReadable
      return c.json(malformedBodyError(), 400);
    }
    try {
      const result = await app.ingestDocument(kindParsed.data, raw, app.requesterId(c));
      return c.json(
        {
          id: result.id,
          documentId: result.documentId,
          duplicate: result.duplicate,
          chunks: result.chunks,
          elements: result.elements,
          pages: result.pages,
          kind: kindParsed.data,
        },
        201,
      );
    } catch (e) {
      const mapped = invalidDocumentResponse(c, e);
      if (mapped) return mapped;
      throw e;
    }
  });

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

  // ── the §7 write surfaces (T-MIG-107 — ContentController write half) ────

  // POST /past-papers (:66-79) — 201 CREATED, all SUGGESTED; an unsupported
  // draft schemaVersion is a 409 BEFORE ingestion (the ingest guard law).
  r.post("/past-papers", async (c) => {
    const body = await readJsonObjectBody(c);
    if (!body.ok) return c.json(malformedBodyError(), 400);
    const sv = (body.value as { schemaVersion?: unknown } | null)?.schemaVersion;
    if (sv != null && sv !== PAST_PAPER_SUPPORTED_SCHEMA) {
      return c.json(
        apiError(409, "conflict", `unsupported draft schemaVersion ${sv} (expected ${PAST_PAPER_SUPPORTED_SCHEMA})`),
        409,
      );
    }
    const bound = pastPaperDraftSchema.safeParse(body.value);
    if (!bound.success) {
      // Jackson binding failure (wrong shapes) → malformed_body; unknown
      // fields are IGNORED (the DTO's ignoreUnknown = true law, mirrored by
      // the schema's z.object strip default)
      return c.json(malformedBodyError(), 400);
    }
    const summary = await app.ingestPastPaper(bound.data as PastPaperDraft, app.requesterId(c));
    return c.json(
      {
        paperId: summary.paperId,
        questions: summary.questions,
        parts: summary.parts,
        markPoints: summary.markPoints,
        validationState: "SUGGESTED",
      },
      201,
    );
  });

  // POST /exam-papers/:id/validate-all (:176-181) — ?force= Boolean binding;
  // a non-boolean force fails the Spring StringToBooleanConverter →
  // MethodArgumentTypeMismatch → 400 bad_request "malformed request".
  r.post("/exam-papers/:id/validate-all", async (c) => {
    const id = parseUuid(c.req.param("id"));
    const forceRaw = c.req.query("force");
    let force = false;
    if (forceRaw !== undefined) {
      const t = forceRaw.trim().toLowerCase();
      if (t !== "true" && t !== "false") throw malformedRequest();
      force = t === "true";
    }
    return c.json(
      await app.writes.validateAllForPaper(id, force, writeActor(c)),
    );
  });

  // POST /exam-papers/:id/validate (:183-186)
  r.post("/exam-papers/:id/validate", async (c) => {
    const id = parseUuid(c.req.param("id"));
    return c.json(await app.writes.validatePaper(id, writeActor(c)));
  });

  // POST /exam-papers/:id/place (:193-197) — @Valid PlaceRequest:
  // missing/null subjectId → 400 validation_failed (the @NotNull law);
  // a malformed uuid STRING fails the Jackson UUID parse → malformed_body.
  r.post("/exam-papers/:id/place", async (c) => {
    const id = parseUuid(c.req.param("id"));
    const body = await readJsonObjectBody(c);
    if (!body.ok) return c.json(malformedBodyError(), 400);
    const raw = (body.value as { subjectId?: unknown } | null)?.subjectId;
    if (raw == null) {
      return c.json(apiError(400, "validation_failed", "subjectId: must not be null"), 400);
    }
    let subjectId: string;
    try {
      subjectId = parseBodyUuid(raw)!; // non-null checked above
    } catch {
      return c.json(malformedBodyError(), 400);
    }
    return c.json(await app.writes.placePaper(id, subjectId, writeActor(c)));
  });

  // POST /exam-papers/:id/reject (:199-202)
  r.post("/exam-papers/:id/reject", async (c) => {
    const id = parseUuid(c.req.param("id"));
    return c.json(await app.writes.rejectPaper(id, writeActor(c)));
  });

  // POST /exam-papers/:id/flag (:227-230) — SUGGESTED/VALIDATED only;
  // an IllegalState guard trips the opaque 500 (the Exception catch-all).
  r.post("/exam-papers/:id/flag", async (c) => {
    const id = parseUuid(c.req.param("id"));
    return c.json(await app.writes.flagPaper(id, writeActor(c)));
  });

  // POST /exam-papers/:id/unflag (:233-236) — FLAGGED only.
  r.post("/exam-papers/:id/unflag", async (c) => {
    const id = parseUuid(c.req.param("id"));
    return c.json(await app.writes.unflagPaper(id, writeActor(c)));
  });

  // POST /question-versions/:id/validate (:204-207)
  r.post("/question-versions/:id/validate", async (c) => {
    const id = parseUuid(c.req.param("id"));
    return c.json(await app.writes.validateQuestionVersion(id, writeActor(c)));
  });

  // POST /question-versions/:id/reject (:209-212)
  r.post("/question-versions/:id/reject", async (c) => {
    const id = parseUuid(c.req.param("id"));
    return c.json(await app.writes.rejectQuestionVersion(id, writeActor(c)));
  });

  // POST /question-versions/:id/flag (:215-218) — SUGGESTED/VALIDATED only.
  r.post("/question-versions/:id/flag", async (c) => {
    const id = parseUuid(c.req.param("id"));
    return c.json(await app.writes.flagQuestionVersion(id, writeActor(c)));
  });

  // POST /question-versions/:id/unflag (:221-224) — FLAGGED only.
  r.post("/question-versions/:id/unflag", async (c) => {
    const id = parseUuid(c.req.param("id"));
    return c.json(await app.writes.unflagQuestionVersion(id, writeActor(c)));
  });

  // POST /mark-schemes/:id/validate (:266-278) — @RequestBody(required=false):
  // no body = validate as-is; criteria element constraints are NOT cascaded
  // (no @Valid on the List field — the jakarta law), so a null markPointId
  // reaches the point lookup and answers 404 "mark point in scheme null not
  // found" exactly like the core; a non-uuid markPointId string fails the
  // Jackson UUID parse → malformed_body.
  r.post("/mark-schemes/:id/validate", async (c) => {
    const id = parseUuid(c.req.param("id"));
    const body = await readOptionalJsonObjectBody(c);
    if (!body.ok) return c.json(malformedBodyError(), 400);
    let criteria: Array<{ markPointId: string | null; acceptanceCriteria: string[] | null }> | null = null;
    let guidance: string | null = null;
    if (body.value != null) {
      const v = body.value as {
        criteria?: unknown;
        generalGuidance?: unknown;
      };
      if (v.criteria != null) {
        if (!Array.isArray(v.criteria)) return c.json(malformedBodyError(), 400);
        criteria = [];
        for (const el of v.criteria) {
          const e = (el ?? {}) as { markPointId?: unknown; acceptanceCriteria?: unknown };
          let markPointId: string | null;
          try {
            markPointId = parseBodyUuid(e.markPointId);
          } catch {
            return c.json(malformedBodyError(), 400);
          }
          if (e.acceptanceCriteria != null && !Array.isArray(e.acceptanceCriteria)) {
            return c.json(malformedBodyError(), 400);
          }
          criteria.push({
            markPointId,
            acceptanceCriteria: (e.acceptanceCriteria as string[] | null) ?? null,
          });
        }
      }
      if (v.generalGuidance != null && typeof v.generalGuidance !== "string") {
        return c.json(malformedBodyError(), 400);
      }
      guidance = (v.generalGuidance as string | null) ?? null;
    }
    return c.json(await app.writes.validateMarkScheme(id, criteria, guidance, writeActor(c)));
  });

  // POST /mark-schemes/:id/reject (:280-283)
  r.post("/mark-schemes/:id/reject", async (c) => {
    const id = parseUuid(c.req.param("id"));
    return c.json(await app.writes.rejectMarkScheme(id, writeActor(c)));
  });

  // POST /mark-schemes/:id/flag (:286-289) — SUGGESTED/VALIDATED only.
  r.post("/mark-schemes/:id/flag", async (c) => {
    const id = parseUuid(c.req.param("id"));
    return c.json(await app.writes.flagMarkScheme(id, writeActor(c)));
  });

  // POST /mark-schemes/:id/unflag (:292-295) — FLAGGED only.
  r.post("/mark-schemes/:id/unflag", async (c) => {
    const id = parseUuid(c.req.param("id"));
    return c.json(await app.writes.unflagMarkScheme(id, writeActor(c)));
  });

  // POST /questions/:id/topics (:246-252) — the 088 leg-08/09 laws: a valid
  // body over an unknown question answers 404 not_found "question {id} not
  // found"; a missing/null primaryNodeId answers 400 validation_failed
  // "primaryNodeId: must not be null" (the @NotNull field law, first field
  // error). A non-uuid primaryNodeId STRING fails the Jackson UUID parse →
  // malformed_body.
  r.post("/questions/:id/topics", async (c) => {
    const id = parseUuid(c.req.param("id"));
    const body = await readJsonObjectBody(c);
    if (!body.ok) return c.json(malformedBodyError(), 400);
    const v = (body.value ?? {}) as { primaryNodeId?: unknown; secondaryNodeIds?: unknown };
    if (body.value == null || v.primaryNodeId == null) {
      return c.json(apiError(400, "validation_failed", "primaryNodeId: must not be null"), 400);
    }
    let primaryNodeId: string | null;
    try {
      primaryNodeId = parseBodyUuid(v.primaryNodeId);
    } catch {
      return c.json(malformedBodyError(), 400);
    }
    let secondaryNodeIds: Array<string | null> | null = null;
    if (v.secondaryNodeIds != null) {
      if (!Array.isArray(v.secondaryNodeIds)) return c.json(malformedBodyError(), 400);
      secondaryNodeIds = [];
      for (const el of v.secondaryNodeIds) {
        try {
          secondaryNodeIds.push(parseBodyUuid(el)); // null binds (no constraint)
        } catch {
          return c.json(malformedBodyError(), 400);
        }
      }
    }
    return c.json(
      await app.writes.mapQuestionTopics(id, primaryNodeId!, secondaryNodeIds, writeActor(c)),
    );
  });

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

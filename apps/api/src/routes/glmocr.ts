/**
 * GLM-OCR bridge route — path parity with the frozen Java core (T-MIG-089;
 * verified 2026-10-09):
 *   GlmOcrIngestionController  @RequestMapping("/api/v1/teacher/content/glm-ocr")
 *     POST /pairs                  (@ResponseStatus CREATED — 201)
 *     GET  /papers/{paperId}/findings
 *
 * MOUNT (sibling of the T-MIG-020 teacher content router): this router is
 * mounted at the SAME "/api/v1/teacher/content" base with the DISJOINT
 * "/glm-ocr/**" subpaths — the content.teacherRoute subpaths never collide
 * (the selfmark/smartmark twin-mount precedent, index.ts:258-259). The
 * exact proposed mount line for apps/api/src/index.ts (NOT applied by this
 * card — index.ts is out of fence):
 *     app.route("/api/v1/teacher/content", glmocr.glmOcrRoute);
 *
 * Route security (SecurityConfig.java:87 /api/v1/teacher/** +
 * @PreAuthorize("hasAnyRole('TEACHER','ADMIN')") deep-audit M5 defense in
 * depth): anonymous callers get the Boot 401 body, authenticated
 * non-teacher callers the Boot 403 body (requireRole). The gate runs
 * BEFORE every handler body.
 *
 * Error shapes (GlobalExceptionHandler parity, ported in identity/errors):
 *   - unknown paper (no bridge record) → 404 not_found "glm-ocr bridge
 *     record for paper {id} not found" (NotFoundException(resource, id))
 *   - existing record with an EMPTY findings list → 200 [] (record
 *     existence and finding count are different questions — a clean pair
 *     has zero findings and is still reviewable)
 *   - malformed uuid path variable → 400 bad_request "malformed request"
 *     (MethodArgumentTypeMismatch parity)
 *   - unparseable body / bad field types → 400 malformed_body "request
 *     body is not readable (check field types and enum values)"
 *     (HttpMessageNotReadableException :175-180)
 *   - a MISSING bundle subtree → Objects.requireNonNull NPE parity → 500
 *     internal_error (validateBundle :186-197)
 *   - a bundle that MIXES documents / reconciliation mismatch → 409
 *     conflict with the verbatim ConflictException messages
 *     (validateBundle :199-220)
 *   - unwired T-013/T-011 write band → 501 not_implemented (honest seam,
 *     owned by the content-write band; never a fabricated 200)
 */
import { Hono, type Context } from "hono";
import {
  buildGlmOcrModule,
  GlmOcrWritePathNotPortedError,
  type GlmOcrModule,
  type PairResult,
} from "../services/glmocr";
import { requireDatabaseUrl } from "@syllabai/db";
import { createSql } from "../services/identity/users";
import {
  apiError,
  NotFoundException,
  BadRequestException,
} from "../services/identity/errors";
import { getAuth, requireRole } from "../middleware/auth";
import {
  glmOcrPairRequestSchema,
  glmOcrPairResultViewSchema,
  type GlmOcrPairResultView,
} from "@syllabai/contracts";

const GLM_OCR_WRITE_TASK =
  "T-MIG-023 (the content write band — POST /pairs needs the T-013 " +
  "ContentIngestionService and T-011 PastPaperIngestionService ports; the " +
  "deterministic bridge plumbing is ported and test-gated, the flip is a wire-up)";

/**
 * Port of MethodArgumentTypeMismatchException handling
 * (GlobalExceptionHandler.java:167-170): 400 bad_request with the fixed
 * client message.
 */
const malformedRequest = () => new BadRequestException("malformed request");

/** HttpMessageNotReadableException parity (GlobalExceptionHandler:175-180). */
const malformedBody = () =>
  apiError(400, "malformed_body", "request body is not readable (check field types and enum values)");

/** UUID path-variable conversion parity (@PathVariable UUID). */
function parseUuid(raw: string): string {
  if (
    !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(raw)
  ) {
    throw malformedRequest();
  }
  return raw;
}

// ── view mappings (controller records :108-164, declaration order) ──────────

/** DocumentStatusView.from — INGESTED (new) or DUPLICATE (idempotent rerun). */
function documentStatusView(s: PairResult["qpDocument"]): GlmOcrPairResultView["qpDocument"] {
  return {
    status: s.duplicate ? ("DUPLICATE" as const) : ("INGESTED" as const),
    documentId: s.documentId,
    chunks: s.chunks,
  };
}

/** PaperStatusView.from. */
function paperStatusView(s: PairResult["examPaper"]): GlmOcrPairResultView["examPaper"] {
  return {
    status: s.duplicate ? ("DUPLICATE" as const) : ("INGESTED" as const),
    paperId: s.paperId,
    title: s.title,
  };
}

/** ReconciliationView.from — the parser reconciliation relayed verbatim. */
function reconciliationView(s: PairResult["reconciliation"]) {
  return {
    status: s.status,
    mismatchCount: s.mismatchCount,
    paperTotalConflict: s.paperTotalConflict,
    qpPaperTotal: s.qpPaperTotal,
    msPaperTotal: s.msPaperTotal,
  };
}

/** PairResultView.from (:152-164). */
function toPairResultView(r: PairResult): GlmOcrPairResultView {
  return {
    qpDocument: documentStatusView(r.qpDocument),
    msDocument: documentStatusView(r.msDocument),
    examPaper: paperStatusView(r.examPaper),
    questions: r.questions,
    parts: r.parts,
    markSchemes: r.markSchemes,
    markPoints: r.markPoints,
    qpChunks: r.qpChunks,
    msChunks: r.msChunks,
    reconciliation: reconciliationView(r.reconciliation),
    reviewFindings: r.reviewFindings,
    embeddingSkipped: r.embeddingSkipped,
  };
}

/** Honest 501 for the unwired T-013/T-011 write band — never a fabricated 200. */
function notImplemented(c: Context): Response {
  return c.json(
    apiError(501, "not_implemented", `not yet ported — owned by ${GLM_OCR_WRITE_TASK}`),
    501,
  );
}

/**
 * GLM-OCR bridge router — GlmOcrIngestionController. Mounted at
 * "/api/v1/teacher/content" (the content.teacherRoute base; disjoint
 * /glm-ocr/** subpaths). TEACHER/ADMIN.
 */
export function createGlmOcrRouter(module: GlmOcrModule): Hono {
  const r = new Hono();

  // authz shell FIRST (SecurityConfig /api/v1/teacher/** + @PreAuthorize
  // parity): the gate answers before every handler below, including the 501.
  r.use("*", async (c, next) => {
    const gate = requireRole(c, "TEACHER", "ADMIN");
    if (gate instanceof Response) return gate;
    await next();
  });

  // POST /glm-ocr/pairs — ingest(:62-68), @ResponseStatus CREATED.
  // The WEB-layer binding of the five raw JSON subtrees runs first (the
  // frozen Jackson-3 HttpMessageConversionException posture: a body that
  // cannot bind dies BEFORE the service) — then the deterministic bundle
  // validation, then the write path (501 seam while T-013/T-011 are
  // unported; the 201-backed port flips on wire-up, zero route changes).
  r.post("/glm-ocr/pairs", async (c) => {
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json(malformedBody(), 400);
    }
    const parsed = glmOcrPairRequestSchema.safeParse(raw);
    if (!parsed.success) return c.json(malformedBody(), 400);
    const ingestedBy = getAuth(c)?.userId ?? null; // @CurrentUserId
    let result: PairResult;
    try {
      result = await module.ingestPair(parsed.data, ingestedBy);
    } catch (e) {
      if (e instanceof GlmOcrWritePathNotPortedError) {
        return notImplemented(c);
      }
      throw e;
    }
    const body = toPairResultView(result);
    // response-pinned against the canonical PairResultView contract
    glmOcrPairResultViewSchema.parse(body);
    return c.json(body, 201);
  });

  // GET /glm-ocr/papers/:paperId/findings — findings(:77-82). A MISSING
  // bridge record is 404; an existing record with an empty findings list is
  // a clean 200 [] (record existence and finding count are different
  // questions).
  r.get("/glm-ocr/papers/:paperId/findings", async (c) => {
    const id = parseUuid(c.req.param("paperId"));
    const findings = await module.findingsForPaper(id);
    if (findings == null) {
      throw new NotFoundException("glm-ocr bridge record for paper", id);
    }
    return c.json(findings);
  });

  return r;
}

/**
 * Module + routers composition for the app root (the index.ts mount lane) —
 * mirrors buildCurriculumRouters (env → requireDatabaseUrl → createSql from
 * the identity module's tagged-template seam):
 *     const glmocr = buildGlmOcrRouters();
 *     app.route("/api/v1/teacher/content", glmocr.glmOcrRoute);
 */
export function buildGlmOcrRouters(env: Record<string, string | undefined> = process.env) {
  const databaseUrl = requireDatabaseUrl(env as { DATABASE_URL?: string });
  const sql = createSql(databaseUrl);
  return { glmOcrRoute: createGlmOcrRouter(buildGlmOcrModule(sql)) };
}

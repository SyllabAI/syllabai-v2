/**
 * Tranche-B ingestion routers — T-MIG-082 tranche B (R0 mount band).
 * Path parity with the frozen Java core (syllabai-core @ 6cad6ef):
 *
 *   RoutingController           @RequestMapping("/api/v1/teacher/content")
 *     (:39-159) — GET /fetch (:65-72), GET /enumerate (:79-86),
 *     GET /enumerate/structured (:92-107); ADR-030 course-aware: every
 *     endpoint takes an OPTIONAL courseRef (present → resolveForCourse
 *     fail-closed, absent/blank → resolveActive; NO fallback).
 *   GlmOcrIngestionController   @RequestMapping("/api/v1/teacher/content/glm-ocr")
 *     (:44-101) — POST /pairs (201, :62-68), GET /papers/{paperId}/findings
 *     (:77-82; MISSING bridge record 404, empty findings clean 200 []).
 *   TeacherExamSeriesImportController @RequestMapping("/api/v1/teacher/curriculum")
 *     (:21-37) — POST /exam-series (the T-C79 ADR-035 D1 import path).
 *
 * Route security (SecurityConfig parity): all three controllers sit under
 * /api/v1/teacher/** (TEACHER/ADMIN) + the M5 @PreAuthorize defense in
 * depth — the routers own their authz internally via requireRole
 * (the classroom.ts/content router precedent) BEFORE any handler work.
 * The exam-series router mounts at the FULL path
 * /api/v1/teacher/curriculum/exam-series so its shell cannot bleed onto
 * the sibling T-MIG-021 teacher-curriculum routes (the 052 roster
 * precedent) — the curriculum router's own shell still fires first for
 * the shared prefix (identical TEACHER/ADMIN gate; double-gated by
 * design, never differently).
 *
 * Query binding laws (the frozen GlobalExceptionHandler mappings, ported
 * in services/identity/errors + mirrored locally):
 *   - missing required param   → 400 validation_failed "missing required
 *                                parameter: {name}" (MissingServletRequest-
 *                                ParameterException :205-210);
 *   - @NotBlank query PRESENT-BLANK → HandlerMethodValidationException is
 *                                UNHANDLED by the frozen handler → the
 *                                catch-all → 500 internal_error (the
 *                                search endpoint's capture-pinned sibling;
 *                                replicated, never silently "fixed");
 *   - Integer param conversion → 400 bad_request "malformed request"
 *                                (MethodArgumentTypeMismatchException
 *                                :167-170) — CONVERSION precedes
 *                                VALIDATION, and params resolve in
 *                                declaration order (nodeCode first);
 *   - malformed JSON body      → 400 malformed_body "request body is not
 *                                readable (check field types and enum
 *                                values)" (HttpMessageNotReadableException
 *                                :212-216);
 *   - a subtree that BINDS but does not parse (the glm drafts) → the
 *                                frozen treeToValue runtime failure → the
 *                                catch-all 500 — binding is JsonNode-wide,
 *                                parsing is where shapes die;
 *   - unknown EXAM-SERIES ROW fields → 400 malformed_body (the DTO's
 *                                @JsonIgnoreProperties(ignoreUnknown =
 *                                FALSE); top-level unknowns stay stripped
 *                                (the Boot default)).
 *
 * Honest-scope laws: golden/** untouched (the capture pass owns golden
 * truth — r4-api-b, trace 1a1151442250feb1); V2_SURFACE_PREFIXES widening
 * is the filed RIDER (the band card) — hub api.ts is NOT touched here.
 *
 * Determinism (ADR-031): writes stamp the ONE injected clock anchor;
 * production keeps the fresh per-request clock.
 */
import { Hono, type Context } from "hono";
import { z } from "zod";
import { requireRole } from "../middleware/auth";
import {
  apiError,
  NotFoundException,
  BadRequestException,
} from "../services/identity/errors";
import { requireDatabaseUrl } from "@syllabai/db";
import { createSql } from "../services/identity/users";
import type { SqlFn } from "../services/assessment/sql";
import {
  canonicalDocumentSchema,
  glmPaperDraftSchema,
  glmMarkSchemeDraftSchema,
  glmReconciliationSchema,
  glmPairRequestEnvelopeSchema,
  examSeriesDatasetSchema,
  type GlmPairRequest,
  type GlmFindingView,
  type FetchView,
  type EnumerateView,
  type FetchPaperView,
} from "@syllabai/contracts";
import {
  fetchQuery,
  enumerateQuery,
  enumerateStructured,
  type FetchResult,
  type EnumerateResult,
} from "../services/ingestion/content-routing";
import { parsedIsEmpty } from "../services/ingestion/fetch-parser";
import { CurriculumScopeResolver, type CurriculumScope } from "../services/content/scope";
import { getAuth } from "../middleware/auth";
import { ingestGlmOcrPair, reviewFindingsForPaper } from "../services/ingestion/glm-ocr";
import { importExamSeriesDataset } from "../services/ingestion/exam-series";

/** the driver-agnostic sql seam + the transaction (per-module declared) */
export type TxSqlFn = SqlFn & {
  transaction: <T>(body: (tx: SqlFn) => Promise<T>) => Promise<T>;
};

export interface IngestionDeps {
  sql: TxSqlFn;
  clock: { now: () => Date };
  /** the shared scope resolver + caller identity (the 020 app-handle law) */
  app: IngestionApp;
}

/** UUID path-variable conversion parity (@PathVariable UUID — the 020 precedent). */
function parseUuid(raw: string): string {
  if (
    !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(raw)
  ) {
    throw new BadRequestException("malformed request");
  }
  return raw;
}

/** @RequestParam Integer conversion (MethodArgumentTypeMismatch parity). */
function parseIntParam(raw: string | undefined, name: string): number | null {
  if (raw === undefined) return null;
  if (!/^[-+]?\d+$/.test(raw)) throw new BadRequestException("malformed request");
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n > 2147483647 || n < -2147483648) {
    throw new BadRequestException("malformed request");
  }
  void name;
  return n;
}

/**
 * The malformed-body shape (HttpMessageNotReadableException :212-216),
 * returned (not thrown — the identity error boundary is a ratified
 * surface, out of this band's fence) so every write handler can answer it
 * as its FIRST decision, exactly where the frozen argument resolver dies.
 */
const malformedBody = () =>
  apiError(400, "malformed_body", "request body is not readable (check field types and enum values)");

async function readJsonObjectBody(c: Context): Promise<{ ok: true; value: unknown } | { ok: false }> {
  try {
    const text = await c.req.text();
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}

// ── RoutingController router (:39-159) ──────────────────────────────────────

export function createContentRoutingRouter(deps: IngestionDeps): Hono {
  const r = new Hono();

  // authz shell FIRST (SecurityConfig /api/v1/teacher/** + @PreAuthorize M5)
  r.use("*", async (c, next) => {
    const gate = requireRole(c, "TEACHER", "ADMIN");
    if (gate instanceof Response) return gate;
    await next();
  });

  // GET /fetch?query=…&courseRef=… (:65-72)
  r.get("/fetch", async (c) => {
    const query = c.req.query("query");
    if (query === undefined) {
      return c.json(apiError(400, "validation_failed", "missing required parameter: query"), 400);
    }
    if (query.trim() === "") {
      // @NotBlank → HandlerMethodValidationException → unhandled → catch-all
      throw new Error("query must not be blank (HandlerMethodValidationException parity)");
    }
    const view = await resolveAndRun(deps, c, (scope): FetchView | Promise<FetchView> => {
      if (scope === null) return fetchViewEmpty();
      return fetchQuery(deps.sql, query, scope).then(mapFetchResult);
    });
    return c.json(view);
  });

  // GET /enumerate?query=…&courseRef=… (:79-86)
  r.get("/enumerate", async (c) => {
    const query = c.req.query("query");
    if (query === undefined) {
      return c.json(apiError(400, "validation_failed", "missing required parameter: query"), 400);
    }
    if (query.trim() === "") {
      throw new Error("query must not be blank (HandlerMethodValidationException parity)");
    }
    const view = await resolveAndRun(deps, c, (scope): EnumerateView | Promise<EnumerateView> => {
      if (scope === null) return enumerateViewEmpty();
      return enumerateQuery(deps.sql, query, scope).then(mapEnumerateResult);
    });
    return c.json(view);
  });

  // GET /enumerate/structured?nodeCode=…&nodeTitle=…&yearFrom=…&yearTo=…&marks=…&questionType=…&axis=…&courseRef=… (:92-107)
  r.get("/enumerate/structured", async (c) => {
    const nodeCode = c.req.query("nodeCode");
    if (nodeCode === undefined) {
      return c.json(apiError(400, "validation_failed", "missing required parameter: nodeCode"), 400);
    }
    // conversion in declaration order (MethodArgumentTypeMismatch parity)
    const yearFrom = parseIntParam(c.req.query("yearFrom"), "yearFrom");
    const yearTo = parseIntParam(c.req.query("yearTo"), "yearTo");
    const marks = parseIntParam(c.req.query("marks"), "marks");
    const axis = c.req.query("axis") ?? "topic"; // @RequestParam defaultValue = "topic"
    const nodeTitle = c.req.query("nodeTitle") ?? null;
    const questionType = c.req.query("questionType") ?? null;
    const specAxis = axis.toLowerCase() === "spec"; // "spec".equalsIgnoreCase(axis)
    const view = await resolveAndRun(deps, c, (scope): EnumerateView | Promise<EnumerateView> => {
      if (scope === null) return enumerateViewEmpty();
      return enumerateStructured(
        deps.sql, nodeCode, nodeTitle, yearFrom, yearTo, marks,
        questionType, specAxis, scope,
      ).then(mapEnumerateResult);
    });
    return c.json(view);
  });

  return r;
}

/** the shared app pieces the routers resolve scopes through */
interface IngestionApp {
  scope: CurriculumScopeResolver;
  requesterId(c: Context): string | null;
}

/** Shared resolution tail of the ADR-030 follow-through (:109-118). */
async function resolveAndRun<T>(
  deps: { app: IngestionApp },
  c: Context,
  run: (scope: CurriculumScope | null) => T | Promise<T>,
): Promise<T> {
  const courseRefRaw = c.req.query("courseRef");
  const courseTagged = courseRefRaw != null && courseRefRaw.trim() !== "";
  const scope = courseTagged
    ? await deps.app.scope.resolveForCourse(courseRefRaw.trim())
    : await deps.app.scope.resolveActive(deps.app.requesterId(c));
  return run(scope);
}

// ── wire-view mappers (the frozen record serialization) ─────────────────────

function fetchViewEmpty(): FetchView {
  // FetchView.empty() (:154-156): parsed null, ambiguous false,
  // parseDefect false, papers []
  return { parsed: null, ambiguous: false, parseDefect: false, papers: [] };
}

function mapFetchResult(result: FetchResult): FetchView {
  return {
    // T-MIG-100 CLASS A (the capture law, golden-captures legs 05/06): the
    // frozen wire serializes the raw ParsedFetchQuery record, and Jackson
    // merges the derived isEmpty() boolean getter as an ALWAYS-PRESENT
    // "empty" property. Derived here at the view boundary — the internal
    // parser/service shapes stay the untouched 9-field port.
    parsed: { ...result.parsed, empty: parsedIsEmpty(result.parsed) },
    ambiguous: result.ambiguous,
    parseDefect: result.parseDefect,
    papers: result.papers.map(
      (p): FetchPaperView => ({
        paperId: p.paperId,
        paperCode: p.paperCode,
        sessionLabel: p.sessionLabel,
        series: p.series,
        year: p.year,
        validationState: p.validationState,
        qpDocumentId: p.qpDocumentId,
        msDocumentId: p.msDocumentId,
        question:
          p.question === null
            ? null
            : {
                questionId: p.question.questionId,
                externalRef: p.question.externalRef,
                stem: p.question.stem,
                marks: p.question.marks,
                questionType: p.question.questionType,
                commandWord: p.question.commandWord,
                parts: p.question.parts,
                markPoints: p.question.markPoints,
              },
      }),
    ),
  };
}

function enumerateViewEmpty(): EnumerateView {
  // EnumerateView.empty() (:165-168): mode "unscoped"
  return {
    result: {
      mode: "unscoped", resolvedNodeCode: null, resolvedNodeTitle: null,
      yearFrom: null, yearTo: null, ambiguous: false, questions: [],
    },
  };
}

function mapEnumerateResult(result: EnumerateResult): EnumerateView {
  // the record WRAPS the result one level down (:159-162)
  return { result };
}

// ── GlmOcrIngestionController router (:44-101) ──────────────────────────────

export function createGlmOcrRouter(deps: IngestionDeps): Hono {
  const r = new Hono();

  r.use("*", async (c, next) => {
    const gate = requireRole(c, "TEACHER", "ADMIN");
    if (gate instanceof Response) return gate;
    await next();
  });

  // POST /pairs (:62-68) — 201 CREATED, the verbatim parser contract
  r.post("/pairs", async (c) => {
    const body = await readJsonObjectBody(c);
    if (!body.ok) return c.json(malformedBody(), 400);
    const envelope = glmPairRequestEnvelopeSchema.safeParse(body.value);
    if (!envelope.success) return c.json(malformedBody(), 400); // non-object body

    // subtree parsing (the frozen treeToValue step): a shape-mismatched
    // subtree dies HERE with the catch-all 500, never a guessed 400
    const qpCanonical = parseSubtree(envelope.data.qpCanonical, canonicalDocumentSchema);
    const msCanonical = parseSubtree(envelope.data.msCanonical, canonicalDocumentSchema);
    const qpDraft = parseSubtree(envelope.data.qpDraft, glmPaperDraftSchema);
    const msDraft = parseSubtree(envelope.data.msDraft, glmMarkSchemeDraftSchema);
    const reconciliation = parseSubtree(envelope.data.reconciliation, glmReconciliationSchema);

    const request: GlmPairRequest = {
      qpCanonical,
      qpCanonicalJson: JSON.stringify(envelope.data.qpCanonical ?? null),
      msCanonical,
      msCanonicalJson: JSON.stringify(envelope.data.msCanonical ?? null),
      qpDraft,
      msDraft,
      reconciliation,
    };
    const ingestedBy = deps.app.requesterId(c);
    const result = await deps.sql.transaction((tx) =>
      ingestGlmOcrPair(tx, request, ingestedBy, deps.clock.now()),
    );
    // PairResultView.from (:152-164): status DUPLICATE | INGESTED
    return c.json(
      {
        qpDocument: {
          status: result.qpDocument.duplicate ? "DUPLICATE" : "INGESTED",
          documentId: result.qpDocument.documentId,
          chunks: result.qpDocument.chunks,
        },
        msDocument: {
          status: result.msDocument.duplicate ? "DUPLICATE" : "INGESTED",
          documentId: result.msDocument.documentId,
          chunks: result.msDocument.chunks,
        },
        examPaper: {
          status: result.examPaper.duplicate ? "DUPLICATE" : "INGESTED",
          paperId: result.examPaper.paperId,
          title: result.examPaper.title,
        },
        questions: result.questions,
        parts: result.parts,
        markSchemes: result.markSchemes,
        markPoints: result.markPoints,
        qpChunks: result.qpChunks,
        msChunks: result.msChunks,
        reconciliation: result.reconciliation,
        reviewFindings: result.reviewFindings.map(
          (f): GlmFindingView => ({
            source: f.source,
            severity: f.severity,
            questionNumber: f.questionNumber,
            qpMarks: f.qpMarks,
            msMarks: f.msMarks,
            detail: f.detail,
          }),
        ),
        embeddingSkipped: result.embeddingSkipped,
      },
      201,
    );
  });

  // GET /papers/:paperId/findings (:77-82)
  r.get("/papers/:paperId/findings", async (c) => {
    const paperId = parseUuid(c.req.param("paperId"));
    const findings = await reviewFindingsForPaper(deps.sql, paperId);
    if (findings === null) {
      // NotFoundException(resource, id) → "%s %s not found"
      throw new NotFoundException("glm-ocr bridge record for paper", paperId);
    }
    return c.json(findings);
  });

  return r;
}

/** the treeToValue step: parse failure = runtime Jackson failure → 500. */
function parseSubtree<S extends z.ZodTypeAny>(value: unknown, schema: S): z.infer<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new Error("subtree does not bind to its contract (treeToValue parity)");
  }
  return parsed.data;
}

// ── TeacherExamSeriesImportController router (:21-37) ───────────────────────

export function createExamSeriesImportRouter(deps: IngestionDeps): Hono {
  const r = new Hono();

  r.use("*", async (c, next) => {
    const gate = requireRole(c, "TEACHER", "ADMIN");
    if (gate instanceof Response) return gate;
    await next();
  });

  // POST /exam-series (:32-36) — 200 (no @ResponseStatus)
  r.post("/", async (c) => {
    const body = await readJsonObjectBody(c);
    if (!body.ok) return c.json(malformedBody(), 400);
    const parsed = examSeriesDatasetSchema.safeParse(body.value);
    if (!parsed.success) {
      // binding failure: a non-object body, a bad enum/date shape, or an
      // unknown ROW field (SeriesRow's ignoreUnknown = FALSE law)
      return c.json(malformedBody(), 400);
    }
    const summary = await deps.sql.transaction((tx) =>
      importExamSeriesDataset(tx, parsed.data, deps.clock.now()),
    );
    return c.json(summary);
  });

  return r;
}

// ── composition root (the 020/revision-notes precedent) ─────────────────────

export interface IngestionRouters {
  contentRoutingRoute: Hono;
  glmOcrRoute: Hono;
  examSeriesImportRoute: Hono;
  /** the scope resolver shared with the content read module (REUSE-not-redeclare) */
  scope: import("../services/content/scope").CurriculumScopeResolver;
  requesterId(c: Context): string | null;
}

export function buildIngestionRouters(
  env: Record<string, string | undefined> = process.env,
  opts: { now?: () => Date } = {},
): IngestionRouters {
  const databaseUrl = requireDatabaseUrl(env as { DATABASE_URL?: string });
  const sql = createSql(databaseUrl) as TxSqlFn;
  const clock = { now: opts.now ?? (() => new Date()) };
  // the scope resolver is the T-MIG-020 port (services/content/scope) —
  // one resolver, zero redeclaration (the r4b tranche-1 REUSE law)
  const scope = new CurriculumScopeResolver(sql);
  const requesterId = (c: Context): string | null => getAuth(c)?.userId ?? null;
  const deps: { sql: TxSqlFn; clock: { now: () => Date }; app: IngestionApp } = {
    sql,
    clock,
    app: { scope, requesterId },
  };
  return {
    contentRoutingRoute: createContentRoutingRouter(deps),
    glmOcrRoute: createGlmOcrRouter(deps),
    examSeriesImportRoute: createExamSeriesImportRouter(deps),
    scope,
    requesterId,
  };
}

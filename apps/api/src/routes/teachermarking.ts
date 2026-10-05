/**
 * Teacher marking router — path parity with the frozen core (T-MIG-033
 * tranche 2): TeacherMarkingController @RequestMapping("/api/v1/teacher
 * /marking"), nine endpoints (:46-328 @ 6cad6ef):
 *   GET  /answers?state=&page=&size=       → list | AnswerMarkingPageView (:148-176)
 *   GET  /queue-v2?state=&page=&size=      → MarkingQueueView | page view (:204-213)
 *   GET  /throughput                       → ThroughputView (:220-223)
 *   POST /smart-mark-batch                 → SmartMarkBatchView (:231-235)
 *   GET  /answers/{id}                     → AnswerMarkingView | 404 (:243-252)
 *   POST /answers/{id}/smart-mark          → SmartMarkView (:255-259)
 *   POST /answers/{id}/human-mark          → 201 HumanMarkView (:261-270)
 *   POST /kappa/evaluate                   → 201 KappaEvaluationView (:273-280)
 *   GET  /kappa/latest?paperId=            → KappaEvaluationView | 404 (:282-293)
 *
 * Route security (SecurityConfig /api/v1/teacher/** + @PreAuthorize
 * "hasAnyRole('TEACHER','ADMIN')" :52-55 defense-in-depth): the shell answers
 * before every handler (TEACHER/ADMIN; anonymous → Boot 401 body, authenticated
 * non-teacher → Boot 403 body via requireRole — the captured
 * w3-teacher-marking-*-unauthed-401 postures).
 *
 * Dual-shape G-5 law (/answers and /queue-v2): WITHOUT page/size the response
 * is the plain view — the unchanged contract; WITH page and/or size present
 * the response is the page envelope under the TOTAL order (createdAt asc,
 * id asc), sliced by the database's own count. Bounds live where Java put
 * them: /answers bounds in the controller (:156-163 — page >= 0, size 1..200
 * default 50), /queue-v2 bounds in the service (unit-pinned there, 1..100
 * default 5 paper groups).
 *
 * C-9 (:178-187): an unknown state filter is a malformed request (400) with
 * the verbatim hint text — 404 is reserved for real not-found lookups. The
 * hint names the four original states even though the executed five-state
 * MARKING_STATES includes SELF_MARKED (R0 #50 F-33-1 execution kept the
 * message quirk verbatim).
 *
 * Error envelopes (GlobalExceptionHandler parity): NotFound/BadRequest →
 * 404/400 with the detail message (shared exception parity); request-body
 * validation via @syllabai/contracts teacher-marking schemas (the #58
 * contracts: G-5 constants 50/200/5/100/50, HumanMarkRequest
 * marksAwarded 0..99 + perPointDecisions ≤50 + comments ≤4000,
 * SmartMarkBatchRequest 1..50 answer ids deduplicated order-preserving).
 *
 * LLM seams: the live factory wires the DORMANT generator (refuses with
 * CANDIDATE_GENERATION_UNAVAILABLE) and a noop publisher — identical to the
 * 032 router posture; the κ gate and evidence contract are untouched.
 */
import { Hono, type Context } from "hono";
import {
  buildTeacherMarkingModule,
  parseMarkingState,
  type TeacherMarkingModule,
} from "../services/teachermarking";
import type { MarkingCandidateGenerator } from "../services/smartmark";
import {
  BadRequestError,
  NotFoundError,
  ConflictError,
  type GradedEvidencePublisher,
  type SubmitClock,
} from "../services/selfmark";
import { requireDatabaseUrl } from "@syllabai/db";
import { createSql } from "../services/identity/users";
import { apiError } from "../services/identity/errors";
import { requireRole, getAuth } from "../middleware/auth";
import {
  humanMarkRequestSchema,
  smartMarkBatchRequestSchema,
  kappaScopeRequestSchema,
} from "@syllabai/contracts";
import { dormantCandidateGenerator } from "./smartmark";

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** @PathVariable UUID conversion parity (MethodArgumentTypeMismatch → 400). */
function parseUuid(raw: string): string {
  if (!UUID_RE.test(raw)) {
    throw new BadRequestError("malformed request");
  }
  return raw;
}

/**
 * Query-param binding parity (@RequestParam Integer page/size): absent →
 * null; present-but-non-integer → 400 (type-mismatch class). Values are NOT
 * validated here beyond integrality — the bounds checks are verbatim below
 * / in the service (Java validates bounds after conversion, :156-163).
 */
function intParam(c: Context, name: string): number | null {
  const raw = c.req.query(name);
  if (raw === undefined) return null;
  const n = Number(raw);
  if (!Number.isInteger(n)) throw new BadRequestError("malformed request");
  return n;
}

/** KappaEvaluationView record (:318-327) — built from the service's evaluation. */
export type KappaEvaluationView = {
  id: string;
  scope: string;
  paperId: string | null;
  sampleSize: number;
  kappa: number;
  observedAgreement: number;
  threshold: number;
  passed: boolean;
  computedAt: string;
};

export function createTeacherMarkingRouter(
  module: TeacherMarkingModule,
  latestKappa: (paperId: string | null) => Promise<KappaEvaluationView | null>,
): Hono {
  const r = new Hono();

  // Domain-error mapping (GlobalExceptionHandler parity, the 032 router
  // pattern): NotFound/BadRequest/Conflict → 404/400/409 with the detail
  // message; everything else falls through to the app boundary (500).
  r.onError((err, c) => {
    if (err instanceof NotFoundError) return c.json(apiError(404, "not_found", err.message), 404);
    if (err instanceof BadRequestError) return c.json(apiError(400, "bad_request", err.message), 400);
    if (err instanceof ConflictError) return c.json(apiError(409, "conflict", err.message), 409);
    console.error("[teachermarking] unhandled error:", err);
    return c.json(apiError(500, "internal_error", "an internal error occurred"), 500);
  });

  // authz shell FIRST (SecurityConfig /api/v1/teacher/** parity)
  r.use("*", async (c, next) => {
    const gate = requireRole(c, "TEACHER", "ADMIN");
    if (gate instanceof Response) return gate;
    await next();
  });

  // GET /answers?state=&page=&size= (:148-176) — dual-shape G-5 surface
  r.get("/answers", async (c) => {
    const state = parseMarkingState(c.req.query("state") ?? "PENDING");
    const page = intParam(c, "page");
    const size = intParam(c, "size");
    if (page === null && size === null) {
      // the unchanged contract — the plain AnswerMarkingView list (:153-155)
      return c.json(await module.queue.answersList(state));
    }
    // bounds verbatim (:156-163); defaults 0 / 50 (DEFAULT_ANSWER_PAGE_SIZE)
    const p = page ?? 0;
    const s = size ?? 50;
    if (p < 0) throw new BadRequestError("page must be >= 0");
    if (s < 1 || s > 200) {
      throw new BadRequestError("size must be between 1 and 200");
    }
    return c.json(await module.queue.answersPaged(state, p, s));
  });

  // GET /queue-v2?state=&page=&size= (:204-213) — dual-shape; bounds in the
  // service (unit-pinned there per the controller javadoc :201-203)
  r.get("/queue-v2", async (c) => {
    const state = parseMarkingState(c.req.query("state") ?? "PENDING");
    const page = intParam(c, "page");
    const size = intParam(c, "size");
    return c.json(await module.queue.markingQueuePaged(state, page, size));
  });

  // GET /throughput (:220-223) — counts of what happened, never estimates
  r.get("/throughput", async (c) => c.json(await module.queue.throughput()));

  // POST /smart-mark-batch (:231-235) — 1..50 ids, deduplicated
  // order-preserving; idempotent; each item its own transaction (partial
  // success preserved)
  r.post("/smart-mark-batch", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      body = undefined; // HttpMessageNotReadable parity → validation 400 below
    }
    const parsed = smartMarkBatchRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestError("validation failed");
    }
    return c.json(await module.queue.smartMarkBatch(parsed.data.answerIds));
  });

  // GET /answers/{id} (:243-252) — the rich single view (smart + human runs)
  r.get("/answers/:id", async (c) => {
    const id = parseUuid(c.req.param("id"));
    const view = await module.queue.answerById(id);
    if (view === null) {
      throw new NotFoundError("answer", id);
    }
    return c.json(view);
  });

  // POST /answers/{id}/smart-mark (:255-259) — append-only history
  r.post("/answers/:id/smart-mark", async (c) => {
    const id = parseUuid(c.req.param("id"));
    const view = await module.teacherSmartMark.markAnswer(id);
    return c.json(view);
  });

  // POST /answers/{id}/human-mark (:261-270) — 201, @CurrentUserId from the
  // JWT filter identity
  r.post("/answers/:id/human-mark", async (c) => {
    const auth = getAuth(c)!; // shell invariant
    const id = parseUuid(c.req.param("id"));
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      body = undefined;
    }
    const parsed = humanMarkRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestError("validation failed");
    }
    const view = await module.marking.recordHumanMark(
      id,
      auth.userId,
      parsed.data.marksAwarded,
      parsed.data.perPointDecisions ?? null,
      parsed.data.comments ?? null,
    );
    return c.json(view, 201);
  });

  // POST /kappa/evaluate (:273-280) — 201; @RequestBody(required=false): an
  // absent body means scope ALL; null paperId in a present body means ALL too
  r.post("/kappa/evaluate", async (c) => {
    const auth = getAuth(c)!; // shell invariant
    let body: unknown = undefined;
    const raw = await c.req.text();
    if (raw.trim() !== "") {
      try {
        body = JSON.parse(raw);
      } catch {
        body = undefined;
      }
    }
    let paperId: string | null = null;
    if (body !== undefined) {
      const parsed = kappaScopeRequestSchema.safeParse(body);
      if (!parsed.success) throw new BadRequestError("malformed request");
      // the WHOLE BODY is nullable in the contract (absent binds null → ALL)
      paperId = (parsed.data && parsed.data.paperId) || null;
    }
    const evaluation = await module.marking.evaluateAgreement(paperId, auth.userId);
    return c.json(evaluation satisfies KappaEvaluationView, 201);
  });

  // GET /kappa/latest?paperId= (:282-293) — newest by scope; 404 when none
  r.get("/kappa/latest", async (c) => {
    const raw = c.req.query("paperId");
    let paperId: string | null = null;
    if (raw !== undefined) {
      if (!UUID_RE.test(raw)) throw new BadRequestError("malformed request");
      paperId = raw;
    }
    const evaluation = await latestKappa(paperId);
    if (evaluation === null) {
      // NotFoundException("kappa evaluation", paperId ?? "ALL") parity :289-291
      throw new NotFoundError("kappa evaluation", paperId ?? "ALL");
    }
    return c.json(evaluation);
  });

  return r;
}

/**
 * Live factory — dormant LLM seams (disclosed, the 032 posture): the teacher
 * per-answer pipeline composes the ONE shared SmartMarkService (never forks
 * it); the graded-evidence publisher stays noop until the evidence wave owns
 * it; clock defaults to the wall clock (queue waiting-age reads).
 */
export function buildTeacherMarkingRouters(
  env: Record<string, string | undefined> = process.env,
  seams: {
    generator?: MarkingCandidateGenerator;
    publisher?: GradedEvidencePublisher;
    clock?: SubmitClock;
  } = {},
) {
  const databaseUrl = requireDatabaseUrl(env as { DATABASE_URL?: string });
  const sql = createSql(databaseUrl);
  const module = buildTeacherMarkingModule(
    sql,
    seams.generator ?? dormantCandidateGenerator,
    seams.publisher ?? { publishGraded: async () => true },
    seams.clock ?? { newId: () => crypto.randomUUID(), now: () => new Date() },
  );
  // kappa/latest read (:282-293) — newest evaluation per scope, straight read
  const latestKappa = async (paperId: string | null): Promise<KappaEvaluationView | null> =>
    module.marking.latestEvaluation(paperId);
  return { module, teacherRoute: createTeacherMarkingRouter(module, latestKappa) };
}

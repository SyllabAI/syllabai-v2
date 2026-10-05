/**
 * Student Smart Mark router — path parity with the frozen core (T-MIG-032
 * tranche 2): StudentSmartMarkController @RequestMapping("/api/v1/learners/me
 * /attempts"), three button-driven POSTs (NO request bodies — the grounding
 * is resolved server-side from opaque ids; controller javadoc):
 *   POST /{attemptId}/smart-mark                          → 200 AttemptSmartMarkView (:39-44)
 *   POST /{attemptId}/parts/{partId}/feedback-explanation → 200 FeedbackExplanationView (:46-52)
 *   POST /{attemptId}/parts/{partId}/improvement-plan     → 200 ImprovementPlanView (:54-59)
 *
 * Route security: anyRequest().authenticated() fall-through parity (shell
 * first; captured w3-smartmark-unauthed-401 / w3-smartmark-feedback-unauthed-401).
 *
 * Error envelopes (frozen handler law):
 *   NotFound/BadRequest/Conflict → 404/400/409 with the detail message
 *   (shared exception parity :37-58);
 *   SmartFeedbackGenerationException → 503 smart_feedback_unavailable with
 *   the FIXED client message, detail log-only (GlobalExceptionHandler
 *   :107-117 — deep-audit 09-28 M2 posture);
 *   response schemas are NOT yet in @syllabai/contracts (R1 top-up requested
 *   at tranche-2) — the local service view types are returned directly.
 *
 * LLM seams: the live factory wires DORMANT defaults (generator refuses with
 * CANDIDATE_GENERATION_UNAVAILABLE; feedback llm.available() = false → honest
 * 503) — the LlmProvider infra is the wave-3 LLM-chain lane's surface;
 * GOLDEN_MASTER §3 keeps these lifecycle-gated, not golden-gated.
 */
import { Hono } from "hono";
import {
  buildSmartMarkModule,
  SmartFeedbackGenerationError,
  type MarkingCandidateGenerator,
  type FeedbackLlm,
} from "../../services/smartmark";
import {
  buildSelfMarkModule,
  NotFoundError,
  BadRequestError,
  ConflictError,
  type GradedEvidencePublisher,
  type SubmitClock,
} from "../../services/selfmark";
import { requireDatabaseUrl } from "@syllabai/db";
import { createSql } from "../../services/identity/users";
import { apiError } from "../../services/identity/errors";
import { requireAuth, getAuth } from "../../middleware/auth";

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const malformedRequest = () => apiError(400, "bad_request", "malformed request");

/** Dormant live seams (disclosed): the LLM chain lands with its own lane. */
export const dormantCandidateGenerator: MarkingCandidateGenerator = {
  proposeAll: async () => {
    const { CandidateGenerationError } = await import("../../services/smartmark");
    throw new CandidateGenerationError("CANDIDATE_GENERATION_UNAVAILABLE");
  },
  propose: async () => {
    const { CandidateGenerationError } = await import("../../services/smartmark");
    throw new CandidateGenerationError("CANDIDATE_GENERATION_UNAVAILABLE");
  },
};
export const dormantFeedbackLlm: FeedbackLlm = {
  available: () => false,
  generate: async () => "",
};

function errorResponse(c: { json(body: unknown, status: number): Response }, e: unknown): Response | null {
  if (e instanceof NotFoundError) return c.json(apiError(404, "not_found", e.message), 404);
  if (e instanceof BadRequestError) return c.json(apiError(400, "bad_request", e.message), 400);
  if (e instanceof ConflictError) return c.json(apiError(409, "conflict", e.message), 409);
  if (e instanceof SmartFeedbackGenerationError) {
    // 503 with the FIXED body — detail suppressed (GlobalExceptionHandler:107-117)
    return c.json(
      apiError(503, "smart_feedback_unavailable", "the marking feedback engine is temporarily unavailable — try again shortly"),
      503,
    );
  }
  return null;
}

export function createStudentSmartMarkRouter(module: ReturnType<typeof buildSmartMarkModule>): Hono {
  const r = new Hono();

  // authz shell FIRST (SecurityConfig.java:91 fall-through parity)
  r.use("*", async (c, next) => {
    const gate = requireAuth(c);
    if (gate instanceof Response) return gate;
    await next();
  });

  // POST /:attemptId/smart-mark — StudentSmartMarkController.smartMark (:39-44)
  r.post("/:attemptId/smart-mark", async (c) => {
    const auth = getAuth(c)!;
    const attemptId = c.req.param("attemptId");
    if (!UUID_RE.test(attemptId)) return c.json(malformedRequest(), 400);
    try {
      return c.json(await module.student.smartMarkAttempt(auth.userId, attemptId), 200);
    } catch (e) {
      const mapped = errorResponse(c, e);
      if (mapped) return mapped;
      throw e;
    }
  });

  // POST /:attemptId/parts/:partId/feedback-explanation (:46-52)
  r.post("/:attemptId/parts/:partId/feedback-explanation", async (c) => {
    const auth = getAuth(c)!;
    const attemptId = c.req.param("attemptId");
    const partId = c.req.param("partId");
    if (!UUID_RE.test(attemptId) || !UUID_RE.test(partId)) return c.json(malformedRequest(), 400);
    try {
      return c.json(await module.student.explainFeedback(auth.userId, attemptId, partId), 200);
    } catch (e) {
      const mapped = errorResponse(c, e);
      if (mapped) return mapped;
      throw e;
    }
  });

  // POST /:attemptId/parts/:partId/improvement-plan (:54-59)
  r.post("/:attemptId/parts/:partId/improvement-plan", async (c) => {
    const auth = getAuth(c)!;
    const attemptId = c.req.param("attemptId");
    const partId = c.req.param("partId");
    if (!UUID_RE.test(attemptId) || !UUID_RE.test(partId)) return c.json(malformedRequest(), 400);
    try {
      return c.json(await module.student.improvementPlan(auth.userId, attemptId, partId), 200);
    } catch (e) {
      const mapped = errorResponse(c, e);
      if (mapped) return mapped;
      throw e;
    }
  });

  return r;
}

/**
 * Composition root — the smartmark module needs its seams; the live defaults
 * are the dormant pair above (disclosed). The graded-evidence publisher and
 * clock follow the T-MIG-030 conventions (claim + guarded flip on the live
 * wiring parity: the E-2 frozenParity posture applies to publishGraded too —
 * claims are domain law; the 032 publisher default here is the claiming
 * frozen-parity double).
 */
export function buildSmartMarkRouters(
  env: Record<string, string | undefined> = process.env,
  seams: {
    generator?: MarkingCandidateGenerator;
    llm?: FeedbackLlm;
    publisher?: GradedEvidencePublisher;
    clock?: SubmitClock;
  } = {},
) {
  const databaseUrl = requireDatabaseUrl(env as { DATABASE_URL?: string });
  const sql = createSql(databaseUrl);
  const selfMarkModule = buildSelfMarkModule(sql, seams.publisher, seams.clock);
  const module = buildSmartMarkModule(
    sql,
    seams.generator ?? dormantCandidateGenerator,
    seams.publisher ?? { publishGraded: async () => true },
    seams.clock ?? { newId: () => crypto.randomUUID(), now: () => new Date() },
    seams.llm ?? dormantFeedbackLlm,
  );
  return { module, selfMarkModule, studentRoute: createStudentSmartMarkRouter(module) };
}

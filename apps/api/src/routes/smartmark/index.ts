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
  EntitlementError,
  SmartFeedbackGenerationError,
  type MarkingCandidateGenerator,
  type BandMarkingCandidateGenerator,
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
import { createGradedEvidencePublisher } from "../assessment";
import { apiError } from "../../services/identity/errors";
import { requireAuth, getAuth } from "../../middleware/auth";
import {
  buildLlmChain,
  chainAsCandidateGenerator,
  chainAsBandCandidateGenerator,
  chainAsFeedbackLlm,
  type FailoverLlmChain,
} from "../../services/llmchain";

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
  if (e instanceof EntitlementError) {
    // DC-3 402 of record: the count and the reason ride the body — the gate
    // never hides what it metered (silent metering reads as breakage)
    return c.json({ ...apiError(402, "entitlement_required", e.message), detail: e.detail }, 402);
  }
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
 *
 * LLM SEAM OF RECORD (ADR-MIG-0002, operator directive ① trace
 * 1a117913519cd141): when seams.generator/llm are absent the §26.1 chain
 * rides the chainAsCandidateGenerator / chainAsFeedbackLlm bridges — the
 * LlmMarkingCandidateGenerator port (prompt v3 + v4 batch envelope, budget
 * formula, truncation refusals, deterministic-validator downstream). A
 * zero-key boot (or SYLLABAI_LLM_MODE=test) keeps EXACTLY the dormant-pair
 * behaviour (the chain refuses → CandidateGenerationError → the pipeline's
 * fail-closed rejection decisions; feedback llm.available() = false → the
 * honest 503), so the golden pins and the dormant constants above stay the
 * rig contract; keyed boots mark and explain for real with failover. The
 * explicit seams still win when provided (the capture/replay proxy of
 * ADR-MIG-0001 rides this unchanged).
 */
export function buildSmartMarkRouters(
  env: Record<string, string | undefined> = process.env,
  seams: {
    generator?: MarkingCandidateGenerator;
    bandGenerator?: BandMarkingCandidateGenerator;
    llm?: FeedbackLlm;
    publisher?: GradedEvidencePublisher;
    clock?: SubmitClock;
    chain?: FailoverLlmChain;
  } = {},
) {
  const databaseUrl = requireDatabaseUrl(env as { DATABASE_URL?: string });
  const sql = createSql(databaseUrl);
  const chain = seams.chain ?? buildLlmChain(env);
  // T-MIG-137 (D1/D3): the LIVE graded-evidence publisher is the default for
  // BOTH the smart-mark module and the self-mark module — the claiming stub
  // retires to the frozenParityGradedEvidencePublisher test double (the
  // pre-137 posture, claims true and emits nothing); the selfmark noop
  // asymmetry retires with it (self-marked attempts regain their E-1 flip).
  const gradedPublisher =
    seams.publisher ?? createGradedEvidencePublisher(sql);
  const selfMarkModule = buildSelfMarkModule(sql, gradedPublisher, seams.clock);
  const module = buildSmartMarkModule(
    sql,
    seams.generator ?? chainAsCandidateGenerator(chain),
    gradedPublisher,
    seams.clock ?? { newId: () => crypto.randomUUID(), now: () => new Date() },
    seams.llm ?? chainAsFeedbackLlm(chain),
    "VALIDATED_ONLY",
    // DC-3: the entitlement envelope's transaction runner — the production
    // adapter's own begin/commit/rollback (single serialized session)
    sql.transaction,
    // ADR-040 §5.4: the band dispatch seam rides the ONE chain (the same
    // seam law as the point generator — keyed boots mark bands for real,
    // zero-key/TEST refuse fail-closed PROVIDER_UNAVAILABLE per part).
    seams.bandGenerator ?? chainAsBandCandidateGenerator(chain),
  );
  return { module, selfMarkModule, studentRoute: createStudentSmartMarkRouter(module) };
}

/**
 * Intervention-run router — T-MIG-061 tranche 2. Path parity with the frozen
 * core (syllabai-core @ 6cad6ef): InterventionRunController
 * @RequestMapping("/api/v1/learners/me/intervention-runs"), nine endpoints
 * (:46-239), every operation ownership-checked (another learner's run is an
 * INDISTINGUISHABLE 404 — no existence oracle):
 *
 *   POST   /                    createFromRecommendation (:62-68) → 201 CREATED
 *                               — @RequestParam UUID rootId (a QUERY param, not
 *                               a body field) + @ResponseStatus(CREATED); the
 *                               E2 first scenario (measured weakness → NBA
 *                               PRACTICE → run), composed on the module
 *   GET    /{runId}             get (:71-75) → 200 RunView, full reconstruction
 *   POST   /{runId}/activate    (:77-81) → 200
 *   POST   /{runId}/pause       (:83-87) → 200
 *   POST   /{runId}/resume      (:90-98) → 200 — ResumeRequest body
 *   POST   /{runId}/steps       (:101-116) → 200 — StepRequest body
 *   POST   /{runId}/evidence    (:119-129) → 200 — EvidenceRequest body
 *   POST   /{runId}/complete    (:131-137) → 200 — CompleteRequest body
 *   POST   /{runId}/cancel      (:139-143) → 200
 *
 * Route security: /api/v1/learners/me/** falls under anyRequest()
 * .authenticated() (SecurityConfig.java:91) — the requireAuth shell runs
 * FIRST and every router owns its authz internally (the anonymous request
 * gets the Boot 401 body before any handler work).
 *
 * ERROR→STATUS LAW (GlobalExceptionHandler parity — the module throws typed
 * errors, this router owns the mapping per the tranche-1 service header):
 *   InterventionIllegalArgumentError → 400 bad_request with the FIXED body
 *     "malformed request" (:167-170 — the IllegalArgumentException handler
 *     never echoes the detail, so "Unknown intervention run: …" and the
 *     hash-identity guard never reach the client)
 *   InterventionBadRequestError      → 400 bad_request, message verbatim
 *     (the controller requireText laws — "{field} is required" :234-238)
 *   InterventionNotFoundError        → 404 not_found, message verbatim
 *     (the shared NotFoundException (resource, id) format)
 *   InterventionConflictError        → 409 conflict, message verbatim
 *     (the state-machine texts, translated at the frozen controller boundary
 *     inStateConflictTerms :164-172)
 *   InterventionVersionMismatchError → 409 intervention_version_mismatch,
 *     message verbatim (:71-77 — the NAMED conflict; the client must start
 *     a new run, not retry)
 *   path @PathVariable UUID mismatch → 400 bad_request "malformed request"
 *     (:167-170, MethodArgumentTypeMismatchException — the learnerme t2 law)
 *   required @RequestParam absent    → 400 validation_failed "missing
 *     required parameter: rootId" (:185-190 — the session-56 law)
 *   unreadable / non-object body     → 400 malformed_body "request body is
 *     not readable (check field types and enum values)"
 *     (HttpMessageNotReadableException parity)
 *
 * BINDING LAW (F-061-B, disclosed): the four request records bind with BARE
 * @RequestBody — no @Valid, no bean validation — so the zod .nullish() pins
 * pass every successfully-bound object through and the module's requireText
 * laws are the only field gate. A wrong-TYPE field (e.g. a JSON number where
 * the record wants a string) is treated as a binding failure → malformed_body
 * per the ratified learnerme classifier convention (Jackson's scalar→String
 * coercion is deliberately NOT reproduced; the F-0/F-1 binding-class register
 * family tracks the divergence).
 *
 * THE COMPLETE-ENDPOINT CONTROLLER LAW (route-owned, the :131-137 ordering):
 * the frozen controller checks the BODY (requireText(request.terminalOutcome(),
 * "terminalOutcome") → 400 bad_request "terminalOutcome is required") AFTER
 * ownedRun and BEFORE the state machine. The module's complete() carries only
 * the ENTITY law (the ACTIVE gate → "outcome is required", the entity's own
 * field name — reachable by direct module callers, dead on this wire path).
 * This router reproduces the frozen wire order exactly: module.getRun (the
 * :167 class for an unknown id), the learner gate (the indistinguishable
 * 404), the requireText, THEN module.complete (which re-derives ownedRun —
 * correctness over round-trips).
 */
import { Hono } from "hono";
import {
  interventionCompleteRequestSchema,
  interventionEvidenceRequestSchema,
  interventionResumeRequestSchema,
  interventionStepRequestSchema,
} from "@syllabai/contracts";
import {
  buildInterventionModule,
  InterventionBadRequestError,
  InterventionConflictError,
  InterventionIllegalArgumentError,
  InterventionNotFoundError,
  InterventionVersionMismatchError,
  type InterventionModule,
} from "../services/intervention";
import { defaultClock } from "../services/selfmark";
import { buildNbaEngine } from "../services/learner-me/nba";
import { requireDatabaseUrl } from "@syllabai/db";
import { createSql } from "../services/identity/users";
import { apiError } from "../services/identity/errors";
import { requireAuth, getAuth } from "../middleware/auth";

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const MALFORMED_REQUEST = "malformed request";
const malformedBody = () =>
  apiError(400, "malformed_body", "request body is not readable (check field types and enum values)");

/** The fixed prototype bad_request body (:167-170 — never echoes the detail). */
const fixedBadRequest = (c: { json: (b: unknown, s: 400) => Response }) =>
  c.json(apiError(400, "bad_request", MALFORMED_REQUEST), 400);

async function readJsonBody(c: { req: { json(): Promise<unknown> } }): Promise<Record<string, unknown> | null> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return null;
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

/** The controller requireText law (:234-238) for the route-owned checks —
 *  null, undefined or whitespace-only fails with "{field} is required". */
function requireText(value: string | null | undefined, field: string): string {
  if (value === null || value === undefined || value.trim().length === 0) {
    throw new InterventionBadRequestError(`${field} is required`);
  }
  return value;
}

/**
 * The typed-error mapping (GlobalExceptionHandler parity — see the header).
 * Unhandled errors rethrow to the app boundary (the opaque 500).
 */
function mapInterventionErrors(
  e: unknown,
  c: { json: (b: unknown, s: number) => Response },
): Response | null {
  if (e instanceof InterventionVersionMismatchError) {
    return c.json(apiError(409, "intervention_version_mismatch", e.message), 409);
  }
  if (e instanceof InterventionIllegalArgumentError) {
    return c.json(apiError(400, "bad_request", MALFORMED_REQUEST), 400);
  }
  if (e instanceof InterventionBadRequestError) {
    return c.json(apiError(400, "bad_request", e.message), 400);
  }
  if (e instanceof InterventionNotFoundError) {
    return c.json(apiError(404, "not_found", e.message), 404);
  }
  if (e instanceof InterventionConflictError) {
    return c.json(apiError(409, "conflict", e.message), 409);
  }
  return null;
}

export function createInterventionRouter(module: InterventionModule): Hono {
  const r = new Hono();

  // authz shell FIRST (SecurityConfig.java:91 — anyRequest().authenticated())
  r.use("*", async (c, next) => {
    const gate = requireAuth(c);
    if (gate instanceof Response) return gate;
    await next();
  });

  r.onError((err, c) => {
    const mapped = mapInterventionErrors(err, c);
    if (mapped) return mapped;
    console.error("[intervention] unhandled error:", err);
    return c.json(apiError(500, "internal_error", "an internal error occurred"), 500);
  });

  // POST / — createFromRecommendation (:62-68): @RequestParam UUID rootId +
  // @ResponseStatus(CREATED). Missing param → validation_failed :185-190;
  // a malformed uuid → the :167 bad_request; the scenario 404s fail closed.
  r.post("/", async (c) => {
    const auth = getAuth(c)!; // shell invariant
    const rawRootId = c.req.query("rootId");
    if (rawRootId === undefined) {
      return c.json(apiError(400, "validation_failed", "missing required parameter: rootId"), 400);
    }
    if (!UUID_RE.test(rawRootId)) return fixedBadRequest(c);
    const view = await module.createFromRecommendation(auth.userId, rawRootId);
    return c.json(view, 201);
  });

  // GET /{runId} (:71-75) — the full reconstruction (steps + evidence).
  r.get("/:runId", async (c) => {
    const auth = getAuth(c)!;
    const rawId = c.req.param("runId");
    if (!UUID_RE.test(rawId)) return fixedBadRequest(c);
    const view = await module.runView(auth.userId, rawId);
    return c.json(view, 200);
  });

  // POST /{runId}/activate (:77-81) — no body; the state machine laws.
  r.post("/:runId/activate", async (c) => {
    const auth = getAuth(c)!;
    const rawId = c.req.param("runId");
    if (!UUID_RE.test(rawId)) return fixedBadRequest(c);
    const view = await module.activate(auth.userId, rawId);
    return c.json(view, 200);
  });

  // POST /{runId}/pause (:83-87) — no body.
  r.post("/:runId/pause", async (c) => {
    const auth = getAuth(c)!;
    const rawId = c.req.param("runId");
    if (!UUID_RE.test(rawId)) return fixedBadRequest(c);
    const view = await module.pause(auth.userId, rawId);
    return c.json(view, 200);
  });

  // POST /{runId}/resume (:90-98) — ResumeRequest; the module carries the
  // requireText pair + the EXACT-identity NAMED 409 + the state machine.
  r.post("/:runId/resume", async (c) => {
    const auth = getAuth(c)!;
    const rawId = c.req.param("runId");
    if (!UUID_RE.test(rawId)) return fixedBadRequest(c);
    const body = await readJsonBody(c);
    if (body === null) return c.json(malformedBody(), 400);
    const parsed = interventionResumeRequestSchema.safeParse(body);
    if (!parsed.success) return c.json(malformedBody(), 400);
    const view = await module.resume(
      auth.userId,
      rawId,
      parsed.data.interventionVersion,
      parsed.data.interventionHash,
    );
    return c.json(view, 200);
  });

  // POST /{runId}/steps (:101-116) — StepRequest; the sequence is
  // SERVER-ASSIGNED (next = current+1). The module carries the requireText
  // pair (observationType verbatim; the status default "DONE" neutralizes the
  // VALIDATION pass only — the RAW null status reaches the entity law and
  // surfaces as the :167 FIXED body), the state machine and the insert order.
  r.post("/:runId/steps", async (c) => {
    const auth = getAuth(c)!;
    const rawId = c.req.param("runId");
    if (!UUID_RE.test(rawId)) return fixedBadRequest(c);
    const body = await readJsonBody(c);
    if (body === null) return c.json(malformedBody(), 400);
    const parsed = interventionStepRequestSchema.safeParse(body);
    if (!parsed.success) return c.json(malformedBody(), 400);
    const view = await module.recordStep(auth.userId, rawId, {
      status: parsed.data.status,
      observationType: parsed.data.observationType,
      inputEvidenceRef: parsed.data.inputEvidenceRef,
      outputEvidenceRef: parsed.data.outputEvidenceRef,
      blockedReason: parsed.data.blockedReason,
    });
    return c.json(view, 200);
  });

  // POST /{runId}/evidence (:119-129) — EvidenceRequest; a REFERENCE is
  // attached, the canonical record is never copied (E2 criterion 5). The
  // "ATTEMPT_EVIDENCE" role default neutralizes the VALIDATION pass only —
  // the RAW null role reaches the entity law (the :167 FIXED body).
  r.post("/:runId/evidence", async (c) => {
    const auth = getAuth(c)!;
    const rawId = c.req.param("runId");
    if (!UUID_RE.test(rawId)) return fixedBadRequest(c);
    const body = await readJsonBody(c);
    if (body === null) return c.json(malformedBody(), 400);
    const parsed = interventionEvidenceRequestSchema.safeParse(body);
    if (!parsed.success) return c.json(malformedBody(), 400);
    const view = await module.attachEvidence(
      auth.userId,
      rawId,
      parsed.data.evidenceRef,
      parsed.data.role,
    );
    return c.json(view, 200);
  });

  // POST /{runId}/complete (:131-137) — CompleteRequest; the CONTROLLER
  // requireText is route-owned (see the header): ownedRun → "terminalOutcome
  // is required" → the state machine (the module re-derives ownedRun).
  r.post("/:runId/complete", async (c) => {
    const auth = getAuth(c)!;
    const rawId = c.req.param("runId");
    if (!UUID_RE.test(rawId)) return fixedBadRequest(c);
    const body = await readJsonBody(c);
    if (body === null) return c.json(malformedBody(), 400);
    const parsed = interventionCompleteRequestSchema.safeParse(body);
    if (!parsed.success) return c.json(malformedBody(), 400);
    const run = await module.getRun(rawId); // unknown → the :167 class (400 FIXED)
    if (run.learner_id !== auth.userId) {
      // ownedRun :147-154 — the indistinguishable 404, no existence oracle
      throw new InterventionNotFoundError(`intervention run ${rawId} not found`);
    }
    requireText(parsed.data.terminalOutcome, "terminalOutcome"); // :135 — BEFORE the state machine
    const view = await module.complete(auth.userId, rawId, parsed.data.terminalOutcome);
    return c.json(view, 200);
  });

  // POST /{runId}/cancel (:139-143) — no body; F-061-A: the frozen write
  // carries NO terminal_outcome (the V26 terminal-ck live-DB 500 class,
  // disclosed on the module + pinned by the service tests).
  r.post("/:runId/cancel", async (c) => {
    const auth = getAuth(c)!;
    const rawId = c.req.param("runId");
    if (!UUID_RE.test(rawId)) return fixedBadRequest(c);
    const view = await module.cancel(auth.userId, rawId);
    return c.json(view, 200);
  });

  return r;
}

/**
 * Live factory — the real sql client, the shared wall clock and the NBA
 * engine port (buildNbaEngine over the SAME sql + clock — the identical
 * deterministic engine the /api/v1/learners/me/recommendations surface
 * serves; the scenario service composes it, never reinterprets it).
 */
export function buildInterventionRouters(
  env: Record<string, string | undefined> = process.env,
) {
  const databaseUrl = requireDatabaseUrl(env as { DATABASE_URL?: string });
  const sql = createSql(databaseUrl);
  const clock = defaultClock;
  const module = buildInterventionModule({
    sql,
    clock,
    nextBestActions: buildNbaEngine(sql, clock),
  });
  return { module, interventionRoute: createInterventionRouter(module) };
}

/**
 * Assessment route factories — path parity with the frozen Java core
 * (T-MIG-030 tranche 2; verified 2026-10-05):
 *   AttemptController          @RequestMapping("/api/v1/attempts")     (:24)
 *   AttemptHistoryController   @RequestMapping("/api/v1/learners/me")  (:30)
 *
 * Route security (SecurityConfig.java:87-91): neither prefix has a specific
 * matcher — both fall through to anyRequest().authenticated(). The captured
 * unauthenticated cases pin the Boot 401 body BEFORE any handler work
 * (w3-attempts-post-unauthed-401 was captured with an empty request body —
 * the filter chain rejects before body parsing), so the authz shell runs
 * before every handler below.
 *
 * Body binding law — capture + frozen handler parity:
 *   - truly empty / non-JSON body, or non-object JSON (array/scalar) → 400
 *     malformed_body "request body is not readable (check field types and
 *     enum values)" (HttpMessageNotReadableException :172-179; captured
 *     w3-attempt-missing-fields-400 "empty body" and
 *     w3-attempt-structured-missing-fields-400)
 *   - UUID-typed fields are binding-fail-fast: Jackson's UUID parse fails
 *     for ANY non-UUID value (wrong scalar type or bad format) → malformed_body
 *     (captured w3-attempt-bad-uuid-400)
 *   - Long-typed fields: numeric strings coerce (Jackson lenient scalars);
 *     non-numeric strings and non-integer floats fail binding → malformed_body
 *   - boolean-typed fields: "true"/"false" strings coerce; null/absent are
 *     VALID → false (FAIL_ON_NULL_FOR_PRIMITIVES disabled — header fact in
 *     the contracts); other scalars fail binding → malformed_body
 *   - String-typed fields: numbers/booleans coerce (Jackson scalar→String);
 *     arrays/objects fail binding → malformed_body
 *   - constraint violations that SURVIVE binding (@NotNull / @Min / @Max /
 *     @NotEmpty / @Size) → 400 validation_failed "field: message" — first
 *     field error (MethodArgumentNotValidException :158-165). UNCAPTURED for
 *     this surface (the captures only exercise empty-body and bad-uuid) —
 *     rendered from the frozen handler law, DISCLOSED AS INFERRED in the
 *     tranche-2 receipt. Each pinned violation message is tested with a
 *     single-field violation so the multi-field Hibernate traversal order
 *     (observed-not-assumed per T-MIG-017) can never flip a pin.
 *
 * Query binding law: `?limit=` on the history surface is advisory
 * (AttemptHistoryController javadoc) — no @Min/@Max, the service clamps
 * (null/<1 → 50, cap 100). Unparseable text ("abc", "1.5", overflow) fails
 * Spring's Integer conversion → 400 bad_request "malformed request"
 * (MethodArgumentTypeMismatchException :167-170); an EMPTY value binds as
 * null (Spring treats "" as absent for non-String types) → service default.
 */
import { Hono } from "hono";
import type { ZodError } from "zod";
import {
  buildAssessmentModule,
  type AssessmentModule,
} from "../../services/assessment";
import type { EvidencePublisher } from "../../services/assessment/submit";
import { requireDatabaseUrl } from "@syllabai/db";
import { createSql } from "../../services/identity/users";
import { apiError, BadRequestException } from "../../services/identity/errors";
import { requireAuth, getAuth } from "../../middleware/auth";
import {
  submitAnswerRequestSchema,
  structuredSubmitRequestSchema,
  attemptHistoryParamsSchema,
} from "@syllabai/contracts";

/** HttpMessageNotReadableException handler body (:172-179) — verbatim. */
const malformedBody = () =>
  apiError(400, "malformed_body", "request body is not readable (check field types and enum values)");

/** Port of MethodArgumentTypeMismatchException handling (:167-170). */
const malformedRequest = () => new BadRequestException("malformed request");

async function readJsonBody(c: { req: { json(): Promise<unknown> } }): Promise<Record<string, unknown> | null> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return null; // syntax error / empty body → unreadable (captured)
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

/**
 * Jackson lenient-scalar parity shim (routes/auth coerceStringFields
 * precedent, extended to the scalar types this surface binds):
 *   - Long/Integer fields: numeric strings coerce via Number (Jackson's
 *     Long parse accepts "25000"); non-numeric strings stay strings so the
 *     schema rejects them as binding failures
 *   - primitive-boolean fields: "true"/"false" coerce; other strings stay
 *     (binding failure); null/absent already preprocess to false in the
 *     contract schemas
 *   - String-typed list-element fields (answerText): numbers/booleans coerce
 *     to String (Jackson scalar→String); arrays/objects stay (binding failure)
 * Unknown properties carry through (Jackson ignores them; zod strips).
 */
function coerceScalars(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...body };
  for (const k of ["responseTimeMs", "confidence"]) {
    const v = out[k];
    if (typeof v === "string" && /^[+-]?\d+$/.test(v.trim())) out[k] = Number(v.trim());
  }
  for (const k of ["selfDoubtFlag", "timedCondition"]) {
    if (out[k] === "true") out[k] = true;
    else if (out[k] === "false") out[k] = false;
  }
  if (Array.isArray(out.partAnswers)) {
    out.partAnswers = (out.partAnswers as unknown[]).map((p) => {
      if (p === null || typeof p !== "object" || Array.isArray(p)) return p;
      const q = { ...(p as Record<string, unknown>) };
      if (typeof q.answerText === "number" || typeof q.answerText === "boolean") {
        q.answerText = String(q.answerText);
      }
      return q;
    });
  }
  return out;
}

/**
 * Classify a failed body safeParse into the frozen core's two distinct 400
 * envelopes. Jackson binds the ENTIRE document before @Valid runs, so any
 * binding failure anywhere beats every constraint violation:
 *   - binding failure (invalid uuid string; wrong scalar shape where no
 *     coercion applies) → malformed_body (HttpMessageNotReadableException)
 *   - otherwise the FIRST constraint issue in DTO param order renders
 *     "field: message" (validation_failed, :158-165). zod's issue order
 *     follows the schema field order, which mirrors the record's parameter
 *     order (questionId → chosenOptionId → partAnswers → responseTimeMs →
 *     confidence) — the multi-field traversal order is unverified for this
 *     surface, so every pinned message is exercised single-field.
 */
type BodyError =
  | { kind: "malformed" }
  | { kind: "validation"; message: string };

function classifyBodyError(error: ZodError): BodyError {
  const isBinding = (i: ZodError["issues"][number]): boolean => {
    if (i.code === "invalid_string") return true; // uuid parse (Jackson UUID)
    if (i.code === "invalid_type") {
      const received = (i as { received?: string }).received;
      // null/undefined BIND fine for object types in Jackson (nulls handed
      // to the record); their rejection is @NotNull/@NotEmpty — a constraint
      return received !== "undefined" && received !== "null";
    }
    return false;
  };
  if (error.issues.some(isBinding)) return { kind: "malformed" };
  const first = error.issues[0];
  if (!first) return { kind: "malformed" };
  // jakarta field-path rendering: ["partAnswers",0,"answerText"] →
  // "partAnswers[0].answerText" (list-element path style, inferred).
  const field = first.path.reduce<string>(
    (acc, seg) => (typeof seg === "number" ? `${acc}[${seg}]` : (acc ? `${acc}.${seg}` : String(seg))),
    "",
  );
  if (first.code === "invalid_type") {
    // null/undefined on a required field: partAnswers carries @NotEmpty,
    // everything else @NotNull (confidence has neither — absent is valid)
    if (first.path[0] === "partAnswers") {
      return { kind: "validation", message: "partAnswers: must not be empty" };
    }
    return { kind: "validation", message: `${field}: must not be null` };
  }
  if (first.code === "too_small" && first.path[0] === "partAnswers") {
    return { kind: "validation", message: "partAnswers: must not be empty" };
  }
  if (first.code === "too_small") {
    const minimum = (first as { minimum?: number }).minimum;
    return {
      kind: "validation",
      message: `${field}: must be greater than or equal to ${minimum ?? 0}`,
    };
  }
  if (first.code === "too_big") {
    if (field.endsWith("answerText")) {
      // @Size(max = 4000) — jakarta's default message (min is 0)
      return { kind: "validation", message: `${field}: size must be between 0 and 4000` };
    }
    const maximum = (first as { maximum?: number }).maximum;
    return {
      kind: "validation",
      message: `${field}: must be less than or equal to ${maximum ?? 5}`,
    };
  }
  return { kind: "validation", message: `${field}: request invalid` };
}

function bodyErrorResponse(c: { json(body: unknown, status: number): Response }, error: ZodError): Response {
  const verdict = classifyBodyError(error);
  if (verdict.kind === "malformed") return c.json(malformedBody(), 400);
  return c.json(apiError(400, "validation_failed", verdict.message), 400);
}

/**
 * Learner attempt router — AttemptController (:25-41). Mounted at
 * "/api/v1/attempts". Authenticated (anyRequest() fall-through parity):
 * the shell answers 401 before every handler below, including body reads.
 * Returns the service view directly — 201 CREATED (@ResponseStatus parity).
 */
export function createAttemptRouter(module: AssessmentModule): Hono {
  const r = new Hono();

  // authz shell FIRST (SecurityConfig.java:91 fall-through parity)
  r.use("*", async (c, next) => {
    const gate = requireAuth(c);
    if (gate instanceof Response) return gate;
    await next();
  });

  // POST /api/v1/attempts — submit(:31-35), MCQ auto-grade
  r.post("/", async (c) => {
    const auth = getAuth(c)!; // shell invariant: authenticated
    const body = await readJsonBody(c);
    if (body === null) return c.json(malformedBody(), 400);
    const parsed = submitAnswerRequestSchema.safeParse(coerceScalars(body));
    if (!parsed.success) return bodyErrorResponse(c, parsed.error);
    const view = await module.submitter.submit(auth.userId, {
      ...parsed.data,
      confidence: parsed.data.confidence ?? null,
    });
    return c.json(view, 201);
  });

  // POST /api/v1/attempts/structured — submitStructured(:37-41), PENDING marking
  r.post("/structured", async (c) => {
    const auth = getAuth(c)!; // shell invariant: authenticated
    const body = await readJsonBody(c);
    if (body === null) return c.json(malformedBody(), 400);
    const parsed = structuredSubmitRequestSchema.safeParse(coerceScalars(body));
    if (!parsed.success) return bodyErrorResponse(c, parsed.error);
    const view = await module.submitter.submitStructured(auth.userId, {
      ...parsed.data,
      partAnswers: parsed.data.partAnswers.map((p) => ({ ...p, answerText: p.answerText ?? null })),
      confidence: parsed.data.confidence ?? null,
    });
    return c.json(view, 201);
  });

  return r;
}

/**
 * Learner attempt-history router — AttemptHistoryController (:29-39, GET
 * /attempts only). Mounted at "/api/v1/learners/me" (the /api/v1/learners/me/*
 * learner-owned convention; the identity comes from the JWT, never a
 * request parameter — controller javadoc). Read-only; authenticated (any
 * role). Other /api/v1/learners/me/* surfaces (recommendations, states, …)
 * are OTHER controllers in the frozen core — not mounted here; the /api/v1/*
 * fallback keeps serving them 401/404 per the SecurityConfig parity.
 */
export function createAttemptHistoryRouter(module: AssessmentModule): Hono {
  const r = new Hono();

  // authz shell FIRST (SecurityConfig.java:91 fall-through parity)
  r.use("*", async (c, next) => {
    const gate = requireAuth(c);
    if (gate instanceof Response) return gate;
    await next();
  });

  // GET /api/v1/learners/me/attempts?limit=… (:35-38) — advisory limit,
  // service clamps (default 50 / max 100); the query binding law is in the
  // file header (unparseable → 400 malformed request; "" binds null).
  r.get("/attempts", async (c) => {
    const auth = getAuth(c)!; // shell invariant: authenticated
    const raw = c.req.query("limit");
    let limit: number | null | undefined;
    if (raw !== undefined && raw !== "") {
      const parsed = attemptHistoryParamsSchema.safeParse({ limit: raw });
      if (!parsed.success) throw malformedRequest(); // Integer conversion parity
      limit = parsed.data.limit;
    }
    return c.json(await module.history.historyFor(auth.userId, limit));
  });

  return r;
}

/**
 * E-2 (R0, T-MIG-030 DONE-with-conditions, fix sketch on the yaml): the LIVE
 * route factory must wire a publisher whose claim is TRUE — the MCQ evidence
 * flip is Attempt.java:159-161 domain law (publishMcq always fires at MCQ
 * submit; the managed entity lands evidence_emitted=true at commit), so the
 * captured w3-history-after-submit-200 pins attempts[0].evidenceEmitted=true.
 * The noop default claimed false, suppressing the guarded flip on the live
 * surface. This publisher claims true while emitting NOTHING — the event
 * pipeline stays dormant (disclosed since tranche-1; the Observer contract is
 * not golden-gated). noopEvidencePublisher remains the 032/033 publishGraded
 * suppression TEST double — never the live wiring.
 */
export const frozenParityEvidencePublisher: EvidencePublisher = {
  publishMcq: async () => true,
};

/**
 * Module + routers composition for the app root — mirrors
 * buildCurriculumRouters' shape exactly (env → requireDatabaseUrl →
 * createSql adapter from the identity module's tagged-template seam; the
 * structural SqlFn keeps the assessment repositories driver-agnostic
 * through the T-MIG-014 dispatch).
 */
export function buildAssessmentRouters(env: Record<string, string | undefined> = process.env) {
  const databaseUrl = requireDatabaseUrl(env as { DATABASE_URL?: string });
  const sql = createSql(databaseUrl);
  // E-2: the live wiring claims evidence (Attempt.java domain law); unit
  // tests inject their own doubles (spy claims / noop suppression).
  const module = buildAssessmentModule(sql, frozenParityEvidencePublisher);
  return {
    module,
    attemptRoute: createAttemptRouter(module),
    historyRoute: createAttemptHistoryRouter(module),
  };
}

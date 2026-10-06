/**
 * Learner-me router — T-MIG-043 tranche 2. Path parity with the frozen core
 * (syllabai-core @ 6cad6ef), all under @RequestMapping("/api/v1/learners/me"):
 *
 *   LearnerAgendaController          GET    /agenda (optional rootId)
 *   LearnerRecommendationController  GET    /recommendations (required rootId)
 *   FlashcardRatingController        POST   /flashcard-ratings → 201
 *   FlashcardRatingTrailController   GET    /flashcard-rating-trail
 *   FlashcardReviewScheduleController GET   /flashcard-review-schedule
 *   NoteVoteController               POST   /note-votes → 201
 *   LearnerExamSeriesController      GET    /exam-series
 *                                    PUT    /courses/{courseSlug}/target-series
 *                                    DELETE /courses/{courseSlug}/target-series → 204
 *   LearnerAssignmentController      GET    /assignments
 *                                    POST   /assignments/{id}/submissions → 201
 *
 * Route security: /api/v1/learners/me/** falls under
 * anyRequest().authenticated() (SecurityConfig.java:87-91; the captured
 * w4-*-unauthed-401 shells pin the Boot 401 before any handler work) — the
 * authz shell runs FIRST and every router owns its authz internally.
 *
 * Exception law (GlobalExceptionHandler parity, verbatim):
 *   LearnerMeNotFoundError      → 404 not_found, e.message verbatim
 *                                 ("unknown subtopic anchor: X", "knowledge
 *                                 node X not found", …)
 *   LearnerMeForbiddenError     → 403 forbidden (the class-gate)
 *   LearnerMeNotImplementedError→ 501 not_implemented (the no-engine safety
 *                                 net; the tranche-2 engine is the default)
 *   BadRequestError             → 400 bad_request (tolerant-parse 400s,
 *                                 slug law, trail limit law)
 *   ConflictError               → 409 conflict (assignment closed)
 *   path/query UUID mismatch    → 400 bad_request "malformed request"
 *                                 (MethodArgumentTypeMismatchException :167-170)
 *   missing required query param→ 400 validation_failed "missing required
 *                                 parameter: {name}" (:185-190 — the
 *                                 recommendations pilot-readiness finding)
 *   constraint violations       → 400 validation_failed "field: message"
 *                                 (first field error, :158-165; jakarta
 *                                 default messages mapped in the classifier)
 *   body binding failures       → 400 malformed_body (HttpMessageNotReadable
 *                                 parity — Jackson binds before @Valid)
 *
 * The agenda's honest-501 posture (rootId without an engine) is retained by
 * the service; the tranche-2 engine is the DEFAULT provider so the route is
 * live — the 501 remains the no-provider safety net, never a fake 200.
 */
import { Hono } from "hono";
import type { ZodError } from "zod";
import {
  flashcardRatingRequestSchema,
  noteVoteRequestSchema,
  setTargetRequestSchema,
  assignmentSubmissionRequestSchema,
} from "@syllabai/contracts";
import { buildLearnerMeModule, type LearnerMeModule } from "../services/learner-me";
import {
  LearnerMeForbiddenError,
  LearnerMeNotImplementedError,
  LearnerMeNotFoundError,
} from "../services/learner-me/errors";
import { BadRequestError, ConflictError, defaultClock } from "../services/selfmark";
import { requireDatabaseUrl } from "@syllabai/db";
import { createSql } from "../services/identity/users";
import { apiError } from "../services/identity/errors";
import { requireAuth, getAuth } from "../middleware/auth";

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const malformedBody = () =>
  apiError(400, "malformed_body", "request body is not readable (check field types and enum values)");

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

/**
 * Two-envelope classifier — the learner-me edition of the ratified
 * assessment/selfmark/teachermarking law (R-1). Jackson binds the whole
 * document before @Valid: any binding failure anywhere beats every
 * constraint. The learner-me nuance the earlier classifiers did not need:
 * @Pattern regex failures are CONSTRAINT violations (validation_failed with
 * the annotation's message — custom or the jakarta default), while a
 * malformed uuid (zod uuid format) is a Jackson BINDING failure
 * (malformed_body) — the record's UUID fields deserialize before validation.
 */
function classifyBodyError(
  error: ZodError,
  jakartaDefaults: Record<string, Record<string, string>>,
): { kind: "malformed" } | { kind: "validation"; message: string } {
  const first = error.issues[0];
  if (!first) return { kind: "malformed" };
  const field = first.path.reduce<string>(
    (acc, seg) => (typeof seg === "number" ? `${acc}[${seg}]` : acc ? `${acc}.${seg}` : String(seg)),
    "",
  );
  if (first.code === "invalid_type") {
    const received = (first as { received?: string }).received;
    // a present-but-wrong JSON type cannot reach bean validation
    if (received !== "undefined" && received !== "null") return { kind: "malformed" };
    // an absent field: @NotNull → "must not be null", @NotBlank → "must not be blank"
    return { kind: "validation", message: `${field}: ${jakartaDefaults[field]?.absent ?? "must not be null"}` };
  }
  if (first.code === "invalid_string") {
    const validation = (first as { validation?: string }).validation;
    if (validation === "regex") {
      const custom = first.message;
      const fallback = jakartaDefaults[field]?.pattern;
      const message = custom && custom !== "Invalid" ? custom : (fallback ?? custom);
      return { kind: "validation", message: `${field}: ${message}` };
    }
    // uuid/email-style FORMAT checks are @NotNull UUID binding law in the core
    return { kind: "malformed" };
  }
  if (first.code === "too_small" || first.code === "too_big") {
    const min = (first as { minimum?: number }).minimum;
    const max = (first as { maximum?: number }).maximum;
    const value = (first as { input?: unknown }).input;
    // @NotBlank on an empty/whitespace string fires before @Size
    if (first.code === "too_small" && typeof value === "string" && value.trim().length === 0) {
      return { kind: "validation", message: `${field}: must not be blank` };
    }
    if (jakartaDefaults[field]?.size) {
      return { kind: "validation", message: `${field}: ${jakartaDefaults[field].size}` };
    }
    if (first.code === "too_small") {
      return { kind: "validation", message: `${field}: must be greater than or equal to ${min ?? 0}` };
    }
    return { kind: "validation", message: `${field}: must be less than or equal to ${max ?? 0}` };
  }
  return { kind: "validation", message: `${field}: request invalid` };
}

/** The jakarta annotation defaults the captured 400s pin (verbatim). */
const RATING_DEFAULTS: Record<string, Record<string, string>> = {
  cardId: { absent: "must not be blank", size: "size must be between 3 and 64" },
  rating: { absent: "must not be blank" },
  subtopicCode: { absent: "must not be blank", size: "size must be between 2 and 64", pattern: 'must match "^[A-Za-z0-9-]+$"' },
};
const VOTE_DEFAULTS: Record<string, Record<string, string>> = {
  noteId: { absent: "must not be blank", size: "size must be between 3 and 64" },
  vote: { absent: "must not be blank" },
  subtopicCode: { absent: "must not be blank", size: "size must be between 2 and 64", pattern: 'must match "^[A-Za-z0-9-]+$"' },
};
const TARGET_DEFAULTS: Record<string, Record<string, string>> = {
  seriesId: { absent: "must not be null" },
};
const SUBMISSION_DEFAULTS: Record<string, Record<string, string>> = {
  questionsCompleted: { absent: "must not be null" },
  score: { absent: "must not be null" },
};

/** The shared error mapping for every learner-me route (the frozen handler). */
function mapErrors(
  e: unknown,
  c: { json: (b: unknown, s: number) => Response },
): Response | null {
  if (e instanceof BadRequestError) return c.json(apiError(400, "bad_request", e.message), 400);
  if (e instanceof ConflictError) return c.json(apiError(409, "conflict", e.message), 409);
  if (e instanceof LearnerMeNotFoundError) return c.json(apiError(404, "not_found", e.message), 404);
  if (e instanceof LearnerMeForbiddenError) return c.json(apiError(403, "forbidden", e.message), 403);
  if (e instanceof LearnerMeNotImplementedError) {
    return c.json(apiError(501, "not_implemented", e.message), 501);
  }
  return null;
}

export function createLearnerMeRouter(module: LearnerMeModule): Hono {
  const r = new Hono();

  // authz shell FIRST (SecurityConfig.java:91 fall-through parity)
  r.use("*", async (c, next) => {
    const gate = requireAuth(c);
    if (gate instanceof Response) return gate;
    await next();
  });

  // GET /agenda?rootId= — LearnerAgendaController.agenda (:97-154)
  r.get("/agenda", async (c) => {
    const auth = getAuth(c)!; // shell invariant
    const rawRootId = c.req.query("rootId");
    if (rawRootId !== undefined && !UUID_RE.test(rawRootId)) {
      return c.json(apiError(400, "bad_request", "malformed request"), 400);
    }
    try {
      const view = await module.buildAgenda(auth.userId, rawRootId);
      return c.json(view, 200);
    } catch (e) {
      const mapped = mapErrors(e, c);
      if (mapped) return mapped;
      throw e;
    }
  });

  // GET /recommendations?rootId= — LearnerRecommendationController (:46-56);
  // rootId is REQUIRED (missing → 400 validation_failed, the session-56
  // pilot-readiness finding; malformed → 400 bad_request)
  r.get("/recommendations", async (c) => {
    const auth = getAuth(c)!;
    const rawRootId = c.req.query("rootId");
    if (rawRootId === undefined) {
      return c.json(apiError(400, "validation_failed", "missing required parameter: rootId"), 400);
    }
    if (!UUID_RE.test(rawRootId)) {
      return c.json(apiError(400, "bad_request", "malformed request"), 400);
    }
    try {
      // the recommendations endpoint runs the engine ONLY — none of the
      // agenda's other composition (LearnerRecommendationController is a
      // one-call controller over NextBestActionService.actionsFor)
      const view = await module.nextBestActions(auth.userId, rawRootId);
      return c.json(view, 200);
    } catch (e) {
      const mapped = mapErrors(e, c);
      if (mapped) return mapped;
      throw e;
    }
  });

  // POST /flashcard-ratings — FlashcardRatingController.record (:84-115) → 201
  r.post("/flashcard-ratings", async (c) => {
    const auth = getAuth(c)!;
    const body = await readJsonBody(c);
    if (body === null) return c.json(malformedBody(), 400);
    const parsed = flashcardRatingRequestSchema.safeParse(body);
    if (!parsed.success) {
      const verdict = classifyBodyError(parsed.error, RATING_DEFAULTS);
      if (verdict.kind === "malformed") return c.json(malformedBody(), 400);
      return c.json(apiError(400, "validation_failed", verdict.message), 400);
    }
    try {
      const view = await module.recordFlashcardRating(auth.userId, parsed.data);
      return c.json(view, 201);
    } catch (e) {
      const mapped = mapErrors(e, c);
      if (mapped) return mapped;
      throw e;
    }
  });

  // GET /flashcard-rating-trail — FlashcardRatingTrailController (:90-140);
  // limit is an @RequestParam Integer: a non-integer string fails binding
  r.get("/flashcard-rating-trail", async (c) => {
    const auth = getAuth(c)!;
    const rawLimit = c.req.query("limit");
    let limit: number | undefined;
    if (rawLimit !== undefined) {
      if (!/^\d+$/.test(rawLimit)) return c.json(apiError(400, "bad_request", "malformed request"), 400);
      limit = Number(rawLimit);
    }
    const cursor = c.req.query("cursor");
    try {
      const view = await module.flashcardTrailPage(auth.userId, { limit, cursor });
      return c.json(view, 200);
    } catch (e) {
      const mapped = mapErrors(e, c);
      if (mapped) return mapped;
      throw e;
    }
  });

  // GET /flashcard-review-schedule — FlashcardReviewScheduleController (:79-125)
  r.get("/flashcard-review-schedule", async (c) => {
    const auth = getAuth(c)!;
    try {
      const view = await module.flashcardReviewSchedule(auth.userId);
      return c.json(view, 200);
    } catch (e) {
      const mapped = mapErrors(e, c);
      if (mapped) return mapped;
      throw e;
    }
  });

  // POST /note-votes — NoteVoteController.record (:67-100) → 201
  r.post("/note-votes", async (c) => {
    const auth = getAuth(c)!;
    const body = await readJsonBody(c);
    if (body === null) return c.json(malformedBody(), 400);
    const parsed = noteVoteRequestSchema.safeParse(body);
    if (!parsed.success) {
      const verdict = classifyBodyError(parsed.error, VOTE_DEFAULTS);
      if (verdict.kind === "malformed") return c.json(malformedBody(), 400);
      return c.json(apiError(400, "validation_failed", verdict.message), 400);
    }
    try {
      const view = await module.recordNoteVote(auth.userId, parsed.data);
      return c.json(view, 201);
    } catch (e) {
      const mapped = mapErrors(e, c);
      if (mapped) return mapped;
      throw e;
    }
  });

  // GET /exam-series?qualification= — LearnerExamSeriesController (:59-69)
  r.get("/exam-series", async (c) => {
    const auth = getAuth(c)!;
    try {
      const view = await module.examSeriesCalendar(c.req.query("qualification"));
      return c.json(view, 200);
    } catch (e) {
      const mapped = mapErrors(e, c);
      if (mapped) return mapped;
      throw e;
    }
  });

  // PUT /courses/{courseSlug}/target-series — setTarget (:71-90) → 200
  r.put("/courses/:courseSlug/target-series", async (c) => {
    const auth = getAuth(c)!;
    const body = await readJsonBody(c);
    if (body === null) return c.json(malformedBody(), 400);
    const parsed = setTargetRequestSchema.safeParse(body);
    if (!parsed.success) {
      const verdict = classifyBodyError(parsed.error, TARGET_DEFAULTS);
      if (verdict.kind === "malformed") return c.json(malformedBody(), 400);
      return c.json(apiError(400, "validation_failed", verdict.message), 400);
    }
    try {
      const view = await module.setTargetSeries(auth.userId, c.req.param("courseSlug"), parsed.data);
      return c.json(view, 200);
    } catch (e) {
      const mapped = mapErrors(e, c);
      if (mapped) return mapped;
      throw e;
    }
  });

  // DELETE /courses/{courseSlug}/target-series — clear (:92-105) → 204 always
  r.delete("/courses/:courseSlug/target-series", async (c) => {
    const auth = getAuth(c)!;
    try {
      await module.clearTargetSeries(auth.userId, c.req.param("courseSlug"));
      return c.body(null, 204);
    } catch (e) {
      const mapped = mapErrors(e, c);
      if (mapped) return mapped;
      throw e;
    }
  });

  // GET /assignments — LearnerAssignmentController.list (:69-87)
  r.get("/assignments", async (c) => {
    const auth = getAuth(c)!;
    try {
      const view = await module.learnerAssignments(auth.userId);
      return c.json(view, 200);
    } catch (e) {
      const mapped = mapErrors(e, c);
      if (mapped) return mapped;
      throw e;
    }
  });

  // POST /assignments/{id}/submissions — submit (:89-117) → 201; the path
  // variable is a @PathVariable UUID → malformed → 400 bad_request
  r.post("/assignments/:assignmentId/submissions", async (c) => {
    const auth = getAuth(c)!;
    const rawId = c.req.param("assignmentId");
    if (!UUID_RE.test(rawId)) {
      return c.json(apiError(400, "bad_request", "malformed request"), 400);
    }
    const body = await readJsonBody(c);
    if (body === null) return c.json(malformedBody(), 400);
    const parsed = assignmentSubmissionRequestSchema.safeParse(body);
    if (!parsed.success) {
      const verdict = classifyBodyError(parsed.error, SUBMISSION_DEFAULTS);
      if (verdict.kind === "malformed") return c.json(malformedBody(), 400);
      return c.json(apiError(400, "validation_failed", verdict.message), 400);
    }
    try {
      const view = await module.submitAssignment(auth.userId, rawId, parsed.data);
      return c.json(view, 201);
    } catch (e) {
      const mapped = mapErrors(e, c);
      if (mapped) return mapped;
      throw e;
    }
  });

  return r;
}

export function buildLearnerMeRouters(env: Record<string, string | undefined> = process.env) {
  const databaseUrl = requireDatabaseUrl(env as { DATABASE_URL?: string });
  const sql = createSql(databaseUrl);
  const module = buildLearnerMeModule(sql, defaultClock);
  return { module, learnerMeRoute: createLearnerMeRouter(module) };
}

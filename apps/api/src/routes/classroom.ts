/**
 * Classroom/teacher foundation routers — path parity with the frozen core
 * (T-MIG-052 tranche 2; frozen sources @ 6cad6ef):
 *   TeacherClassController     @RequestMapping("/api/v1/teacher/classes")
 *                              :55-292 — the 8 lifecycle/membership/
 *                              announcement endpoints
 *   LearnerClassroomController @RequestMapping("/api/v1/learners/me/classroom")
 *                              :46-177 — the 3 student overlay endpoints
 *   TeacherRosterController    @RequestMapping("/api/v1/teacher")
 *                              @GetMapping("/learners") :23-43 — the V49
 *                              ruling surface (this router owns EXACTLY
 *                              /api/v1/teacher/learners; mounted at the
 *                              full path so the shell middleware cannot
 *                              bleed onto the sibling /api/v1/teacher/*
 *                              routers — the marking/content/curriculum/
 *                              tests mounts keep their own gates).
 *
 * Route security (SecurityConfig parity):
 *   - /api/v1/teacher/** → hasAnyRole('TEACHER','ADMIN') (SecurityConfig
 *     :87) — the shell answers the Boot 401 body for anonymous callers and
 *     the Boot 403 body for authenticated non-teachers BEFORE every handler
 *     (the M5 method-level @PreAuthorize on the frozen controllers is
 *     defense in depth; the route matchers stay authoritative).
 *   - /api/v1/learners/me/classroom → anyRequest().authenticated()
 *     (SecurityConfig :91 has no specific matcher for the prefix) — the
 *     shell answers the Boot 401 body first; every read then derives from
 *     membership rows ONLY (the independent-student rule lives in the
 *     tranche-1 services: no membership rows → the honest empty read).
 *
 * HTTP status law (frozen controllers, read line-against-line):
 *   POST /api/v1/teacher/classes                          → 201 (:80-81)
 *   GET  /api/v1/teacher/classes                          → 200 (:101)
 *   GET  /api/v1/teacher/classes/{id}                     → 200 (:111)
 *   POST /api/v1/teacher/classes/{id}/status              → 200 (:135)
 *   POST /api/v1/teacher/classes/{id}/members             → 201 (:150-151;
 *        the idempotent re-enroll returns the SAME 201 detail — Java has no
 *        200 branch, `detail()` is unconditional)
 *   DELETE /api/v1/teacher/classes/{id}/members/{studentId} → 200 (:177)
 *   POST /api/v1/teacher/classes/{id}/announcements       → 201 (:191-192)
 *   GET  /api/v1/teacher/classes/{id}/announcements       → 200 (:216)
 *   GET  /api/v1/learners/me/classroom                    → 200 (:70)
 *   GET  /api/v1/learners/me/classroom/announcements      → 200 (:88)
 *   POST /api/v1/learners/me/classroom/announcements/{id}/read → 200 (:103)
 *   GET  /api/v1/teacher/learners                         → 200 (:37)
 *
 * Error envelopes (GlobalExceptionHandler parity):
 *   - ClassroomNotFoundError / BadRequestError / ConflictError /
 *     ClassroomForbiddenError → 404/400/409/403 with the detail message
 *     verbatim ("class not found", "this class belongs to another teacher",
 *     "no account with that email — the student registers first, then you
 *     enroll", "category must be general, homework, notice, exam-reminder
 *     or resource", …). The tranche-1 services own those messages; this
 *     layer maps classes to statuses only.
 *   - @PathVariable UUID type mismatch (MethodArgumentTypeMismatch) →
 *     400 bad_request "malformed request" (:169-172 — the teachermarking
 *     parseUuid parity).
 *   - Request bodies follow the TWO-ENVELOPE law (the selfmark/assessment/
 *     teachermarking convention, R0 intake fix R-1): unreadable body →
 *     400 malformed_body "request body is not readable (check field types
 *     and enum values)" (:175-179 verbatim); a well-formed body failing a
 *     jakarta constraint → 400 validation_failed "field: message" with the
 *     FIRST field error (:158-165) — @NotBlank renders "must not be blank",
 *     @Size(max=N) renders "size must be between 0 and N" (jakarta default
 *     messages). Schemas from @syllabai/contracts classroom (T-MIG-052
 *     tranche 1: constraints copied exactly; the service-level parse laws —
 *     status tolerance, category vocabulary — stay in services/classroom).
 *     T-MIG-056 amendment: the schemas carry the @NotBlank-exact notBlank
 *     refine (whitespace-only bodies answer validation_failed BEFORE the
 *     controller law — the refine reports as a `custom` issue whose verbatim
 *     jakarta message this classifier surfaces) and `category` is nullish
 *     (explicit JSON null binds like absent → the service parses GENERAL →
 *     the frozen 201).
 *
 * Scope honesty: the learner router owns EXACTLY the three paths under
 * /api/v1/learners/me/classroom — the rest of the learner-me band stays
 * T-MIG-043's (w0a). Unknown paths under each base fall through to the
 * app-level 404-after-auth fallback (anyRequest().authenticated() parity:
 * anonymous callers get the shell 401 first — pinned in the route tests).
 * KG / coverage / analytics / notes / revision / smart-lesson stay OUT
 * (their own W5 tranches); NO LLM path touches this module (§9).
 */
import { Hono, type Context } from "hono";
import type { ZodError } from "zod";
import {
  buildClassroomModule,
  ClassroomForbiddenError,
  ClassroomNotFoundError,
  type ClassroomModule,
} from "../services/classroom";
import { BadRequestError, ConflictError, type SubmitClock } from "../services/selfmark";
import { requireDatabaseUrl } from "@syllabai/db";
import { createSql } from "../services/identity/users";
import { apiError } from "../services/identity/errors";
import { getAuth, requireAuth, requireRole } from "../middleware/auth";
import {
  classCreateRequestSchema,
  classEnrollRequestSchema,
  classPublishRequestSchema,
  classStatusRequestSchema,
} from "@syllabai/contracts";

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** @PathVariable UUID conversion parity (MethodArgumentTypeMismatch → 400
 *  bad_request "malformed request", GlobalExceptionHandler :169-172). */
function parseUuid(raw: string): string {
  if (!UUID_RE.test(raw)) {
    throw new BadRequestError("malformed request");
  }
  return raw;
}

// ── two-envelope body law (R0 intake fix R-1, the fleet convention) ─────────
/*
 * GlobalExceptionHandler parity: Jackson binds the WHOLE document BEFORE
 * @Valid runs, so a binding failure anywhere beats every constraint
 * violation, and the two classes answer with DIFFERENT 400 envelopes:
 *   - unreadable body / binding-type failure → 400 malformed_body
 *     "request body is not readable (check field types and enum values)"
 *     (:175-179 — verbatim)
 *   - well-formed body failing a constraint → 400 validation_failed
 *     "field: message" (:158-165 — FIRST field error, jakarta defaults:
 *     @NotBlank → "must not be blank", @Size(max=N) → "size must be
 *     between 0 and N")
 */
const malformedBody = () =>
  apiError(400, "malformed_body", "request body is not readable (check field types and enum values)");

async function readJsonBody(c: Context): Promise<{ ok: true; value: unknown } | { ok: false }> {
  try {
    return { ok: true, value: await c.req.json() };
  } catch {
    return { ok: false }; // syntax error / empty body → HttpMessageNotReadable
  }
}

/** First-field-error jakarta rendering (:158-165). Zod issues are ordered by
 *  schema field order — the same "first" Spring's BindingResult surfaces. */
function validationMessage(error: ZodError): string {
  const first = error.issues[0];
  if (!first) return "request invalid";
  const field = first.path.reduce<string>(
    (acc, seg) => (typeof seg === "number" ? `${acc}[${seg}]` : acc ? `${acc}.${seg}` : String(seg)),
    "",
  );
  if (first.code === "too_small") {
    // defensive — no bare min() remains on the classroom schemas (the
    // T-MIG-056 notBlank refine owns blank detection); kept for drift
    return `${field}: must not be blank`;
  }
  if (first.code === "custom") {
    // the @NotBlank refine reports as a `custom` issue carrying its own
    // jakarta default message — surface it verbatim (first-field law,
    // :158-165 renders getDefaultMessage())
    return `${field}: ${first.message ?? "request invalid"}`;
  }
  if (first.code === "too_big") {
    const maximum = (first as { maximum: number }).maximum;
    return `${field}: size must be between 0 and ${maximum}`;
  }
  return `${field}: request invalid`;
}

function bodyErrorResponse(c: Context, error: ZodError): Response {
  return c.json(apiError(400, "validation_failed", validationMessage(error)), 400);
}

/** Shared domain-error mapping (the 032/033 router pattern): the tranche-1
 *  classes carry verbatim frozen messages; everything else falls through to
 *  the app boundary (500). */
function classroomOnError(err: unknown, c: Context): Response {
  if (err instanceof ClassroomNotFoundError) {
    return c.json(apiError(404, "not_found", err.message), 404);
  }
  if (err instanceof ClassroomForbiddenError) {
    return c.json(apiError(403, "forbidden", err.message), 403);
  }
  if (err instanceof BadRequestError) {
    return c.json(apiError(400, "bad_request", err.message), 400);
  }
  if (err instanceof ConflictError) {
    return c.json(apiError(409, "conflict", err.message), 409);
  }
  console.error("[classroom] unhandled error:", err);
  return c.json(apiError(500, "internal_error", "an internal error occurred"), 500);
}

// ── teacher classes (TeacherClassController :55-292) ────────────────────────

/**
 * Teacher class management router — mounted at "/api/v1/teacher/classes".
 * TEACHER/ADMIN shell (:54 class-level @PreAuthorize + SecurityConfig :87);
 * the per-object §17 ownership gate lives in the services (404/403 verbatim).
 */
export function createTeacherClassesRouter(module: ClassroomModule): Hono {
  const r = new Hono();

  r.onError((err, c) => classroomOnError(err, c));

  // Authz shell (SecurityConfig :87 parity): the gate answers the Boot body
  // BEFORE every handler — and before the fall-through of paths this router
  // does not own (anonymous callers get 401, never 404).
  r.use("*", async (c, next) => {
    const gate = requireRole(c, "TEACHER", "ADMIN");
    if (gate instanceof Response) return gate;
    await next();
  });

  // POST / (:80-98) → 201 — trim/blank 400 and the case-insensitive clash
  // 409 are service law (unit-pinned in tranche-1); this layer binds the
  // CreateRequest constraints only.
  r.post("/", async (c) => {
    const auth = getAuth(c)!; // shell invariant: authenticated
    const raw = await readJsonBody(c);
    if (!raw.ok) return c.json(malformedBody(), 400);
    const parsed = classCreateRequestSchema.safeParse(raw.value);
    if (!parsed.success) return bodyErrorResponse(c, parsed.error);
    return c.json(await module.createClass(auth.userId, parsed.data), 201);
  });

  // GET / (:101-109) → 200 — LIMIT 100 newest-first + ONE grouped count
  r.get("/", async (c) => {
    const auth = getAuth(c)!;
    return c.json(await module.listTeacherClasses(auth.userId));
  });

  // GET /:id (:111-133) → 200 — the detail projection with the honesty rows
  r.get("/:id", async (c) => {
    const auth = getAuth(c)!;
    const id = parseUuid(c.req.param("id"));
    return c.json(await module.teacherClassDetail(auth.userId, id));
  });

  // POST /:id/status (:135-146) → 200 — tolerant parse law is service-side
  // ("status must be 'active' or 'archived'" verbatim on unknown)
  r.post("/:id/status", async (c) => {
    const auth = getAuth(c)!;
    const id = parseUuid(c.req.param("id"));
    const raw = await readJsonBody(c);
    if (!raw.ok) return c.json(malformedBody(), 400);
    const parsed = classStatusRequestSchema.safeParse(raw.value);
    if (!parsed.success) return bodyErrorResponse(c, parsed.error);
    return c.json(await module.setClassStatus(auth.userId, id, parsed.data));
  });

  // POST /:id/members (:150-175) → 201 — the enroll law chain (archived 409
  // → email law → unknown 404 → disabled 409 → non-STUDENT 409) is service
  // law; the idempotent re-enroll is the SAME 201 detail (no 200 branch).
  r.post("/:id/members", async (c) => {
    const auth = getAuth(c)!;
    const id = parseUuid(c.req.param("id"));
    const raw = await readJsonBody(c);
    if (!raw.ok) return c.json(malformedBody(), 400);
    const parsed = classEnrollRequestSchema.safeParse(raw.value);
    if (!parsed.success) return bodyErrorResponse(c, parsed.error);
    return c.json(await module.enrollStudent(auth.userId, id, parsed.data), 201);
  });

  // DELETE /:id/members/:studentId (:177-187) → 200 — remove (if present)
  // then the fresh detail; an unknown studentId is NOT a 404 (Java filters
  // and deletes matching rows, unconditional detail return).
  r.delete("/:id/members/:studentId", async (c) => {
    const auth = getAuth(c)!;
    const id = parseUuid(c.req.param("id"));
    const studentId = parseUuid(c.req.param("studentId"));
    return c.json(await module.removeMember(auth.userId, id, studentId));
  });

  // POST /:id/announcements (:191-214) → 201 — the publish law chain
  // (archived 409 → category 400 verbatim → trimmed-blank 400) is service
  // law; the fresh row serves readCount 0.
  r.post("/:id/announcements", async (c) => {
    const auth = getAuth(c)!;
    const id = parseUuid(c.req.param("id"));
    const raw = await readJsonBody(c);
    if (!raw.ok) return c.json(malformedBody(), 400);
    const parsed = classPublishRequestSchema.safeParse(raw.value);
    if (!parsed.success) return bodyErrorResponse(c, parsed.error);
    return c.json(await module.publishAnnouncement(auth.userId, id, parsed.data), 201);
  });

  // GET /:id/announcements (:216-231) → 200 — LIMIT 100 newest-first +
  // batched read counts over the roster
  r.get("/:id/announcements", async (c) => {
    const auth = getAuth(c)!;
    const id = parseUuid(c.req.param("id"));
    return c.json(await module.teacherAnnouncements(auth.userId, id));
  });

  return r;
}

// ── learner classroom (LearnerClassroomController :46-177) ──────────────────

/**
 * The classroom student overlay router — mounted at
 * "/api/v1/learners/me/classroom". Authenticated shell (SecurityConfig :91
 * anyRequest().authenticated() parity — no specific matcher for the prefix);
 * the independent-student rule and the §17 membership gate live in the
 * tranche-1 services (the empty read IS the honest state; 403 "this
 * announcement is not in your classroom").
 */
export function createLearnerClassroomRouter(module: ClassroomModule): Hono {
  const r = new Hono();

  r.onError((err, c) => classroomOnError(err, c));

  // Authz shell (SecurityConfig :91 anyRequest().authenticated() parity):
  // anonymous callers get the Boot 401 body first.
  r.use("*", async (c, next) => {
    const gate = requireAuth(c);
    if (gate instanceof Response) return gate;
    await next();
  });

  // GET / (:70-84) → 200 — my classes + MY unread + the flattened badge
  r.get("/", async (c) => {
    const auth = getAuth(c)!; // shell invariant: authenticated
    return c.json(await module.learnerOverview(auth.userId));
  });

  // GET /announcements (:88-100) → 200 — across ALL my live classes,
  // newest first, MY read flag beside each
  r.get("/announcements", async (c) => {
    const auth = getAuth(c)!;
    return c.json(await module.learnerAnnouncements(auth.userId));
  });

  // POST /announcements/:id/read (:103-116) → 200 — ReadResult {id, read:
  // true}; 404 "announcement not found" / 403 membership gate / the
  // idempotent no-op are service law (the append-only AnnouncementRead row
  // never mutates the announcement).
  r.post("/announcements/:id/read", async (c) => {
    const auth = getAuth(c)!;
    const id = parseUuid(c.req.param("id"));
    return c.json(await module.markAnnouncementRead(auth.userId, id));
  });

  return r;
}

// ── teacher roster (TeacherRosterController :23-43) ─────────────────────────

/**
 * The V49 ruling surface router — mounted at "/api/v1/teacher/learners"
 * (the frozen @RequestMapping("/api/v1/teacher") + @GetMapping("/learners")
 * split, mounted at the FULL path so the TEACHER/ADMIN shell middleware
 * cannot bleed onto the sibling /api/v1/teacher/* routers). TEACHER/ADMIN
 * shell (SecurityConfig :87); the enabled-STUDENT cohort read (displayName
 * asc, email asc, identity projection only) is tranche-1 service law.
 */
export function createTeacherRosterRouter(module: ClassroomModule): Hono {
  const r = new Hono();

  r.onError((err, c) => classroomOnError(err, c));

  // Authz shell (SecurityConfig :87 parity) — scoped to this router only.
  r.use("*", async (c, next) => {
    const gate = requireRole(c, "TEACHER", "ADMIN");
    if (gate instanceof Response) return gate;
    await next();
  });

  // GET /learners (:37-42) → 200 — every enabled learner in the cohort
  r.get("/", async (c) => c.json(await module.rosterLearners()));

  return r;
}

// ── composition root ────────────────────────────────────────────────────────

/**
 * Module + router composition for the app root — the buildTeacherMarkingRouters
 * shape (env → requireDatabaseUrl → createSql adapter; the structural SqlFn
 * keeps the classroom services driver-agnostic through the T-MIG-014
 * dispatch). `seams.clock` injects the SubmitClock (determinism law;
 * production default is the wall clock).
 */
export function buildClassroomRouters(
  env: Record<string, string | undefined> = process.env,
  seams: { clock?: SubmitClock } = {},
) {
  const databaseUrl = requireDatabaseUrl(env as { DATABASE_URL?: string });
  const sql = createSql(databaseUrl);
  const module = buildClassroomModule(
    sql,
    seams.clock ?? { newId: () => crypto.randomUUID(), now: () => new Date() },
  );
  return {
    module,
    teacherClassesRoute: createTeacherClassesRouter(module),
    learnerClassroomRoute: createLearnerClassroomRouter(module),
    teacherRosterRoute: createTeacherRosterRouter(module),
  };
}

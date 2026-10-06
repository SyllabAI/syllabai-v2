/**
 * Classroom/teacher routers — path parity with the frozen Java core
 * (T-MIG-052 tranche 2; frozen sources @ 6cad6ef, syllabai-core):
 *   TeacherClassController     @RequestMapping("/api/v1/teacher/classes")        (:57-292)
 *   LearnerClassroomController @RequestMapping("/api/v1/learners/me/classroom") (:46-177)
 *   TeacherRosterController    @RequestMapping("/api/v1/teacher")
 *                              + @GetMapping("/learners")                        (:23-43)
 *
 * Route security (SecurityConfig parity):
 *   - /api/v1/teacher/** requires TEACHER or ADMIN (SecurityConfig route
 *     rule) — the classes and roster routers answer the shell BEFORE every
 *     handler (requireRole; anonymous → Boot 401 body, authenticated
 *     non-teacher → Boot 403 body, the captured w3 postures). The frozen
 *     controllers add a class-level @PreAuthorize mirror (deep-audit M5
 *     defense in depth) — the ported shell IS that gate; the per-object
 *     §17 ownership gate lives in the service (ownedClass, t1-pinned).
 *   - /api/v1/learners/me/classroom falls under the frozen
 *     anyRequest().authenticated() rule (SecurityConfig.java:87-91 — no
 *     specific matcher): requireAuth shell, every read derived from
 *     membership rows ONLY (the independent-student rule: no membership
 *     → the honest empty, never an error).
 *
 * Mount regions (index.ts, OUT-OF-FENCE COMMIT disclosed there): the two
 * controllers mount at their exact @RequestMapping prefixes; the roster
 * mounts at "/api/v1/teacher" (the frozen class mapping) with the single
 * GET /learners method mapping INSIDE this file, registered LAST — the
 * marking/content/curriculum/tests routers own their paths first
 * (first-match-wins), and the roster shell only sees what they decline.
 * The t1 mount-region question is resolved: /api/v1/teacher/learners is
 * served by NO earlier router (grep census + the 404-after-auth fallback).
 *
 * Principal parity (@CurrentUserId UUID): getAuth(c).userId — the JWT
 * principal's user id (the learner router precedent, capture-pinned).
 *
 * Wire shapes: the t1 service returns the contracts-shaped camelCase views
 * (Instant fields already ISO strings); the routers add NO key mapping —
 * the zod pins in the route tests validate against the canonical
 * @syllabai/contracts schemas (classroom.ts).
 *
 * Envelope laws (GlobalExceptionHandler parity):
 *   - Domain errors → router onError: ClassroomNotFoundError → 404
 *     "not_found" detail; ClassroomForbiddenError → 403 "forbidden";
 *     BadRequestError → 400 "bad_request"; ConflictError → 409 "conflict";
 *     everything else falls through to the app boundary (500 opaque —
 *     :224-230). The t1 service raises the two custom classroom classes
 *     for its 404/403 laws (class not found / belongs to another teacher /
 *     announcement not found / not in your classroom) — they are NOT the
 *     shared identity exceptions, so the mapping lives HERE.
 *   - @PathVariable UUID conversion (MethodArgumentTypeMismatch → 400
 *     "malformed request", :167-173): parseUuid on every {id}/{studentId}.
 *   - Request bodies follow the TWO-ENVELOPE law (R0 intake fix R-1, the
 *     assessment/selfmark/teachermarking convention): unreadable body or
 *     binding-type failure → 400 malformed_body (verbatim :175-179); a
 *     well-formed body failing a constraint → 400 validation_failed
 *     "field: message" with the jakarta default messages (:158-165 —
 *     @NotBlank "must not be blank", @Size "size must be between 0 and N").
 *     The classroom schemas carry the @NotBlank-exact notBlank refine (the
 *     tranche-2 amendment, disclosed): whitespace-only bodies fail @Valid
 *     exactly as jakarta does, BEFORE any controller/service law runs.
 *
 * NO LLM seam, NO dormant provider: the classroom band writes no
 * learner-model state and calls no generator (the V47/V48/V49/V51 honesty
 * pin) — nothing here 503s; every endpoint answers from the t1 module.
 */
import { Hono, type Context } from "hono";
import type { ZodError } from "zod";
import {
  buildClassroomModule,
  ClassroomForbiddenError,
  ClassroomNotFoundError,
  type ClassroomModule,
} from "../../services/classroom";
import { BadRequestError, ConflictError, type SubmitClock } from "../../services/selfmark";
import { requireDatabaseUrl } from "@syllabai/db";
import { createSql } from "../../services/identity/users";
import { apiError } from "../../services/identity/errors";
import { requireAuth, requireRole, getAuth } from "../../middleware/auth";
import {
  classCreateRequestSchema,
  classEnrollRequestSchema,
  classPublishRequestSchema,
  classStatusRequestSchema,
} from "@syllabai/contracts";

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** @PathVariable UUID conversion parity (MethodArgumentTypeMismatch → 400). */
function parseUuid(raw: string): string {
  if (!UUID_RE.test(raw)) {
    throw new BadRequestError("malformed request");
  }
  return raw;
}

// ── two-envelope body law (R0 intake fix R-1; the router-family convention) ──

const malformedBody = () =>
  apiError(400, "malformed_body", "request body is not readable (check field types and enum values)");

async function readJsonBody(c: Context): Promise<{ ok: true; value: unknown } | { ok: false }> {
  try {
    return { ok: true, value: await c.req.json() };
  } catch {
    return { ok: false }; // syntax error / empty body → HttpMessageNotReadable
  }
}

type BodyError = { kind: "malformed" } | { kind: "validation"; message: string };

/**
 * Classroom jakarta mapping — the constraint messages are the DEFAULTS the
 * frozen DTOs carry: @NotBlank → "must not be blank" (also on a null/
 * absent field), @Size → "size must be between 0 and N". A binding-type
 * failure (wrong JSON type) beats every constraint (Jackson binds the
 * whole document first). The notBlank refine reports as a `custom` issue
 * carrying its own "must not be blank" message.
 */
function classifyBodyError(error: ZodError): BodyError {
  const isBinding = (i: ZodError["issues"][number]): boolean => {
    if (i.code === "invalid_string") return true; // format parse (Jackson InvalidFormat)
    if (i.code === "invalid_type") {
      const received = (i as { received?: string }).received;
      // null/undefined BIND fine (nulls handed to the record) — their
      // rejection is @NotBlank, a constraint
      return received !== "undefined" && received !== "null";
    }
    return false;
  };
  if (error.issues.some(isBinding)) return { kind: "malformed" };
  const first = error.issues[0];
  if (!first) return { kind: "malformed" };
  const field = first.path.reduce<string>(
    (acc, seg) => (typeof seg === "number" ? `${acc}[${seg}]` : acc ? `${acc}.${seg}` : String(seg)),
    "",
  );
  if (first.code === "invalid_type") {
    return { kind: "validation", message: `${field}: must not be blank` }; // @NotBlank(null)
  }
  if (first.code === "too_small") {
    return { kind: "validation", message: `${field}: must not be blank` }; // defensive: no bare min() remains
  }
  if (first.code === "too_big") {
    const maximum = (first as { maximum?: number }).maximum;
    return { kind: "validation", message: `${field}: size must be between 0 and ${maximum ?? 0}` };
  }
  if (first.code === "custom") {
    const message = (first as { message?: string }).message;
    return { kind: "validation", message: `${field}: ${message ?? "request invalid"}` };
  }
  return { kind: "validation", message: `${field}: request invalid` };
}

function bodyErrorResponse(c: Context, error: ZodError): Response {
  const verdict = classifyBodyError(error);
  if (verdict.kind === "malformed") return c.json(malformedBody(), 400);
  return c.json(apiError(400, "validation_failed", verdict.message), 400);
}

/** Parse a JSON body through a contracts schema; on failure the returned
 *  Response IS the law (malformed_body / validation_failed). */
async function parseBody<T>(
  c: Context,
  schema: {
    safeParse(value: unknown): { success: true; data: T } | { success: false; error: ZodError };
  },
): Promise<{ ok: true; data: T } | { ok: false; response: Response }> {
  const raw = await readJsonBody(c);
  if (!raw.ok) return { ok: false, response: c.json(malformedBody(), 400) };
  const parsed = schema.safeParse(raw.value);
  if (!parsed.success) return { ok: false, response: bodyErrorResponse(c, parsed.error) };
  return { ok: true, data: parsed.data };
}

// ── shared error mapping (router-level GlobalExceptionHandler parity) ────────

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

// ── TeacherClassController (:57-292) — mounted at /api/v1/teacher/classes ────

/**
 * Teacher class management (TFA-01, V51): create/list/detail/status +
 * membership + announcements. TEACHER/ADMIN shell (SecurityConfig
 * /api/v1/teacher/** parity); the §17 ownership gate answers from the
 * service (404 "class not found" / 403 "this class belongs to another
 * teacher"). Status codes are the frozen @ResponseStatus mappings: 201 on
 * create/enroll/publish, 200 everywhere else.
 */
export function createTeacherClassesRouter(module: ClassroomModule): Hono {
  const r = new Hono();

  r.onError((err, c) => classroomOnError(err, c));

  // authz shell FIRST (SecurityConfig /api/v1/teacher/** + class-level
  // @PreAuthorize hasAnyRole('TEACHER','ADMIN') parity)
  r.use("*", async (c, next) => {
    const gate = requireRole(c, "TEACHER", "ADMIN");
    if (gate instanceof Response) return gate;
    await next();
  });

  // POST /api/v1/teacher/classes (:79-98) → 201 — trim/blank 400 is the
  // service law; the case-insensitive clash → 409 (the partial unique
  // index ux_class_teacher_course_name is the storage twin)
  r.post("/", async (c) => {
    const auth = getAuth(c)!; // shell invariant: authenticated teacher/admin
    const body = await parseBody(c, classCreateRequestSchema);
    if (!body.ok) return body.response;
    return c.json(await module.createClass(auth.userId, body.data), 201);
  });

  // GET /api/v1/teacher/classes (:100-108) — LIMIT 100 newest-first,
  // member counts ONE grouped query
  r.get("/", async (c) => {
    const auth = getAuth(c)!;
    return c.json(await module.listTeacherClasses(auth.userId));
  });

  // GET /api/v1/teacher/classes/{id} (:110-135) — the roster detail with
  // the honesty rows ("(removed account)" / "(unavailable)")
  r.get("/:id", async (c) => {
    const auth = getAuth(c)!;
    const id = parseUuid(c.req.param("id"));
    return c.json(await module.teacherClassDetail(auth.userId, id));
  });

  // POST /api/v1/teacher/classes/{id}/status (:137-150) — tolerant parse
  // else the verbatim 400 (service law)
  r.post("/:id/status", async (c) => {
    const auth = getAuth(c)!;
    const id = parseUuid(c.req.param("id"));
    const body = await parseBody(c, classStatusRequestSchema);
    if (!body.ok) return body.response;
    return c.json(await module.setClassStatus(auth.userId, id, body.data));
  });

  // POST /api/v1/teacher/classes/{id}/members (:152-186) → 201 — the
  // enroll law chain ends in the roster detail; re-enroll is the
  // idempotent no-op (no INSERT when the member row exists)
  r.post("/:id/members", async (c) => {
    const auth = getAuth(c)!;
    const id = parseUuid(c.req.param("id"));
    const body = await parseBody(c, classEnrollRequestSchema);
    if (!body.ok) return body.response;
    return c.json(await module.enrollStudent(auth.userId, id, body.data), 201);
  });

  // DELETE /api/v1/teacher/classes/{id}/members/{studentId} (:188-198) —
  // @Transactional remove then the refreshed detail
  r.delete("/:id/members/:studentId", async (c) => {
    const auth = getAuth(c)!;
    const id = parseUuid(c.req.param("id"));
    const studentId = parseUuid(c.req.param("studentId"));
    return c.json(await module.removeMember(auth.userId, id, studentId));
  });

  // POST /api/v1/teacher/classes/{id}/announcements (:200-225) → 201 —
  // archived gate, category parse law (absent/null/blank → GENERAL),
  // trimmed-blank law; the fresh row serves readCount 0
  r.post("/:id/announcements", async (c) => {
    const auth = getAuth(c)!;
    const id = parseUuid(c.req.param("id"));
    const body = await parseBody(c, classPublishRequestSchema);
    if (!body.ok) return body.response;
    return c.json(await module.publishAnnouncement(auth.userId, id, body.data), 201);
  });

  // GET /api/v1/teacher/classes/{id}/announcements (:227-244) — newest-
  // first LIMIT 100 + batched read counts over the live roster
  r.get("/:id/announcements", async (c) => {
    const auth = getAuth(c)!;
    const id = parseUuid(c.req.param("id"));
    return c.json(await module.teacherAnnouncements(auth.userId, id));
  });

  return r;
}

// ── LearnerClassroomController (:46-177) — /api/v1/learners/me/classroom ────

/**
 * The classroom student capability layer (TFA-02, V51): class-enrolled
 * students read their classes and announcements from HERE and only from
 * here — membership rows are the single source of visibility. THE
 * INDEPENDENT-STUDENT RULE: no membership rows → empty reads, the honest
 * zero (never an error); these reads never gate the independent features.
 */
export function createLearnerClassroomRouter(module: ClassroomModule): Hono {
  const r = new Hono();

  r.onError((err, c) => classroomOnError(err, c));

  // authz shell FIRST (SecurityConfig anyRequest().authenticated() parity
  // — the frozen controller's @PreAuthorize("isAuthenticated()") mirror)
  r.use("*", async (c, next) => {
    const gate = requireAuth(c);
    if (gate instanceof Response) return gate;
    await next();
  });

  // GET /api/v1/learners/me/classroom (:85-104) — the overlay root: my
  // live classes with MY unread counts + the flattened totalUnread badge;
  // archived classes DROP OUT; empty for the independent student
  r.get("/", async (c) => {
    const auth = getAuth(c)!; // shell invariant: authenticated
    return c.json(await module.learnerOverview(auth.userId));
  });

  // GET /api/v1/learners/me/classroom/announcements (:106-121) — the feed
  // across ALL my live classes, newest first, MY read flag beside each
  r.get("/announcements", async (c) => {
    const auth = getAuth(c)!;
    return c.json(await module.learnerAnnouncements(auth.userId));
  });

  // POST /api/v1/learners/me/classroom/announcements/{id}/read (:123-141)
  // — 404 "announcement not found"; the §17 membership gate 403 "this
  // announcement is not in your classroom"; idempotent no-op; the
  // append-only receipt { id, read: true } — the announcement row NEVER
  // mutates. NO request body (the frozen handler takes none).
  r.post("/announcements/:id/read", async (c) => {
    const auth = getAuth(c)!;
    const id = parseUuid(c.req.param("id"));
    return c.json(await module.markAnnouncementRead(auth.userId, id));
  });

  return r;
}

// ── TeacherRosterController (:23-43) — mounted at /api/v1/teacher ───────────

/**
 * The V49/V51 ruling surface: GET /api/v1/teacher/learners — the enabled
 * STUDENT cohort ordered displayName asc, email asc (UserRepository :25-28),
 * identity projection ONLY (no learning data — the marking queue and /state
 * carry that). The V51 explicit roster REPLACES the V49 cohort shortcut
 * behind an UNCHANGED endpoint shape (the t1 card note). TEACHER/ADMIN
 * shell (SecurityConfig /api/v1/teacher/** + the class-level @PreAuthorize
 * mirror). Registered LAST at /api/v1/teacher: marking/content/curriculum/
 * tests own their prefixes first, the fallback 404-after-auth still sees
 * everything no router claimed.
 */
export function createTeacherRosterRouter(module: ClassroomModule): Hono {
  const r = new Hono();

  r.onError((err, c) => classroomOnError(err, c));

  // authz shell FIRST (SecurityConfig /api/v1/teacher/** parity)
  r.use("*", async (c, next) => {
    const gate = requireRole(c, "TEACHER", "ADMIN");
    if (gate instanceof Response) return gate;
    await next();
  });

  // GET /api/v1/teacher/learners (:36-41) — the honest "class list" of the
  // pilot: every enabled learner, identity projection only
  r.get("/learners", async (c) => {
    return c.json(await module.rosterLearners());
  });

  return r;
}

// ── composition root ─────────────────────────────────────────────────────────

/**
 * Module + router composition for the app root — the
 * buildTeacherMarkingRouters shape (env → requireDatabaseUrl → createSql
 * adapter; the structural SqlFn keeps the classroom services driver-agnostic
 * through the T-MIG-014 dispatch, the per-module structural-seam doctrine).
 * The clock defaults to the wall clock (create/enroll/publish/receipt
 * timestamps).
 */
export function buildClassroomRouters(
  env: Record<string, string | undefined> = process.env,
  seams: { clock?: SubmitClock } = {},
) {
  const databaseUrl = requireDatabaseUrl(env as { DATABASE_URL?: string });
  const sql = createSql(databaseUrl);
  const clock: SubmitClock = seams.clock ?? {
    newId: () => crypto.randomUUID(),
    now: () => new Date(),
  };
  const module = buildClassroomModule(sql, clock);
  return {
    module,
    teacherClassesRoute: createTeacherClassesRouter(module),
    learnerClassroomRoute: createLearnerClassroomRouter(module),
    teacherRosterRoute: createTeacherRosterRouter(module),
  };
}

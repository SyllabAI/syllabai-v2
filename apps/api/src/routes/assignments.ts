/**
 * Teacher assignments router — path parity with the frozen core (the B2
 * decommission band T-MIG-117): TeacherAssignmentController
 * @RequestMapping("/api/v1/teacher/assignments") (:71-76 @ 6cad6ef):
 *   POST /            → 201 AssignmentView (:102-103)
 *   GET  /            → 200 List<AssignmentSummaryView> (:134)
 *   GET  /:id         → 200 AssignmentRosterView | 404 (:151-152)
 *   POST /:id/status  → 200 AssignmentView | 404 (:205-206)
 *
 * Route security (SecurityConfig /api/v1/teacher/** + @PreAuthorize
 * "hasAnyRole('TEACHER','ADMIN')" :75 defense-in-depth): the shell answers
 * before every handler (anonymous → Boot 401 body, authenticated
 * non-teacher → Boot 403 body via requireRole — the captured a01-a08
 * postures).
 *
 * Error envelopes (GlobalExceptionHandler parity): the service's
 * AssignmentNotFoundError / BadRequestError / ConflictError /
 * ClassroomForbiddenError → 404/400/409/403 with the detail message
 * verbatim (the captured c03-d08 laws). @PathVariable UUID type mismatch →
 * 400 bad_request "malformed request" (the teachermarking/classroom
 * parseUuid parity; captured e08). Request bodies follow the TWO-ENVELOPE
 * law (the fleet convention) PLUS the Jackson scalar-coercion layer the
 * captures pinned (g07/g14/g15/g17-g22): strings accept number/boolean
 * coercion, ints accept numeric strings/decimals but NOT booleans, UUIDs
 * stay strict — binding-class failures answer 400 malformed_body
 * "request body is not readable (check field types and enum values)"
 * (:175-179 verbatim); constraint failures answer 400 validation_failed
 * "field: message" with the FIRST field error and the verbatim jakarta
 * strings the schemas carry ("title: must not be blank",
 * "specRefs: size must be between 1 and 60",
 * "specRefs[1]: spec refs are curriculum codes",
 * "marksTotal: must be greater than or equal to 1", …).
 *
 * LLM seams: NONE — the assignments family touches no LLM path (§9; the
 * V49/V51 honesty law: workflow state only, never mastery, never AI).
 */
import { Hono, type Context } from "hono";
import type { ZodError } from "zod";
import {
  AssignmentNotFoundError,
  BadRequestError,
  ClassroomForbiddenError,
  ConflictError,
  buildTeacherAssignmentsModule,
  type TeacherAssignmentsModule,
} from "../services/teacher-assignments";
import type { SubmitClock } from "../services/selfmark";
import { JACKSON_BINDING } from "@syllabai/contracts";
import { requireDatabaseUrl } from "@syllabai/db";
import { createSql } from "../services/identity/users";
import { apiError } from "../services/identity/errors";
import { getAuth, requireRole } from "../middleware/auth";
import {
  assignmentCreateRequestSchema,
  assignmentStatusRequestSchema,
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

// ── two-envelope body law + the Jackson coercion layer ──────────────────────

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

/** The @NotBlank/@NotNull null-law map (the null/undefined BINDS render —
 *  jakarta evaluates the constraint after Jackson binds null: g03/g04
 *  "must not be blank" on the String fields, g01/g02/g05 "must not be
 *  null" on the int/list fields; classId binds null fine — the V49
 *  default — so it has NO null law). */
const NULL_LAW: Record<string, string> = {
  title: "must not be blank",
  courseSlug: "must not be blank",
  courseLabel: "must not be blank",
  specRefs: "must not be null",
  marksTotal: "must not be null",
  questionCount: "must not be null",
  dueAt: "must not be blank",
  status: "must not be blank",
};

/** The classifier (the classroom T-MIG-059 shape + the assignments
 *  coercion captures): union failures dig the RECEIVED — null/undefined is
 *  the bind (constraint law), anything else is the binding class; the
 *  binding sentinel (non-coercible scalar), classId-format failures and
 *  nested invalid_types answer malformed_body; constraint issues render
 *  their verbatim schema messages first-field. */
function classifyBodyError(error: ZodError): BodyError {
  const first = error.issues[0];
  if (!first) return { kind: "validation", message: "request invalid" };
  // the Jackson binding SENTINEL rides a custom-code refine issue (the
  // jacksonInt numeric-string law) — binding beats every constraint
  if (first.message === JACKSON_BINDING) return { kind: "malformed" };
  const field = first.path.reduce<string>(
    (acc, seg) => (typeof seg === "number" ? `${acc}[${seg}]` : acc ? `${acc}.${seg}` : String(seg)),
    "",
  );
  if (first.code === "invalid_union") {
    // dig the received out of the union members' own issues
    const received = digReceived(first as unknown as { unionErrors?: ZodError[] });
    if (received === "null" || received === "undefined") {
      const nullMsg = NULL_LAW[field];
      return { kind: "validation", message: nullMsg ? `${field}: ${nullMsg}` : "request invalid" };
    }
    return { kind: "malformed" };
  }
  if (first.code === "invalid_string") {
    // the binding sentinel (jacksonInt's numeric-string refine) — or a
    // classId-uuid format failure — is the BINDING class; every other
    // invalid_string carries its verbatim jakarta message (the @Pattern
    // constraints — b05/b09)
    if (first.message === JACKSON_BINDING) return { kind: "malformed" };
    if (field === "classId") return { kind: "malformed" };
    return { kind: "validation", message: `${field}: ${first.message ?? "request invalid"}` };
  }
  if (first.code === "invalid_type") {
    const received = (first as { received?: string }).received;
    if (received === "null" || received === "undefined") {
      const nullMsg = NULL_LAW[field];
      return { kind: "validation", message: nullMsg ? `${field}: ${nullMsg}` : "request invalid" };
    }
    return { kind: "malformed" };
  }
  // too_big / too_small / custom (the notBlank refine) — the schemas carry
  // the verbatim jakarta strings (constraint law, first-field rendering)
  return { kind: "validation", message: `${field}: ${first.message ?? "request invalid"}` };
}

function digReceived(unionError: { unionErrors?: ZodError[] }): string | undefined {
  for (const ue of unionError.unionErrors ?? []) {
    const i = ue.issues[0] as { received?: string } | undefined;
    if (i?.received) return i.received;
  }
  return undefined;
}

function bodyErrorResponse(c: Context, error: ZodError): Response {
  const verdict = classifyBodyError(error);
  if (verdict.kind === "malformed") return c.json(malformedBody(), 400);
  return c.json(apiError(400, "validation_failed", verdict.message), 400);
}

/** Shared domain-error mapping (the 032/033 router pattern): the module
 *  classes carry verbatim frozen messages; everything else falls through
 *  to the app boundary (500). */
function assignmentsOnError(err: unknown, c: Context): Response {
  if (err instanceof AssignmentNotFoundError) {
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
  console.error("[teacher-assignments] unhandled error:", err);
  return c.json(apiError(500, "internal_error", "an internal error occurred"), 500);
}

/**
 * Teacher assignments router — mounted at "/api/v1/teacher/assignments".
 * TEACHER/ADMIN shell (:75 class-level @PreAuthorize + SecurityConfig :87);
 * the per-object gates live in the services (404/403/409/400 verbatim).
 */
export function createTeacherAssignmentsRouter(module: TeacherAssignmentsModule): Hono {
  const r = new Hono();

  r.onError((err, c) => assignmentsOnError(err, c));

  // Authz shell (SecurityConfig :87 parity): the gate answers the Boot body
  // BEFORE every handler — and before the fall-through of paths this router
  // does not own (anonymous callers get 401, never 404).
  r.use("*", async (c, next) => {
    const gate = requireRole(c, "TEACHER", "ADMIN");
    if (gate instanceof Response) return gate;
    await next();
  });

  // POST / (:102-128) → 201 — the dedup/target/class gates are service law
  // (unit-pinned); this layer binds the CreateRequest constraints only.
  r.post("/", async (c) => {
    const auth = getAuth(c)!; // shell invariant: authenticated
    const raw = await readJsonBody(c);
    if (!raw.ok) return c.json(malformedBody(), 400);
    const parsed = assignmentCreateRequestSchema.safeParse(raw.value);
    if (!parsed.success) return bodyErrorResponse(c, parsed.error);
    return c.json(await module.createAssignment(auth.userId, parsed.data), 201);
  });

  // GET / (:134-145) → 200 — newest-first LIMIT 50 + the computed stats
  r.get("/", async (c) => {
    getAuth(c)!;
    return c.json(await module.listAssignments());
  });

  // GET /:id (:151-183) → 200 — the roster view (states + the ordering law)
  r.get("/:id", async (c) => {
    getAuth(c)!;
    const id = parseUuid(c.req.param("id"));
    return c.json(await module.assignmentRoster(id));
  });

  // POST /:id/status (:205-217) → 200 — the tolerant parse law is
  // service-side ('status must be "open" or "closed": {raw}' verbatim)
  r.post("/:id/status", async (c) => {
    getAuth(c)!;
    const id = parseUuid(c.req.param("id"));
    const raw = await readJsonBody(c);
    if (!raw.ok) return c.json(malformedBody(), 400);
    const parsed = assignmentStatusRequestSchema.safeParse(raw.value);
    if (!parsed.success) return bodyErrorResponse(c, parsed.error);
    return c.json(await module.setAssignmentStatus(id, parsed.data.status));
  });

  return r;
}

/** the router factory (the fleet seam shape — buildClassroomRouters
 *  parity): ZERO-KEY law untouched (no LLM seam exists on this family),
 *  the db url required at construction (fail-fast env gate parity). */
export function buildTeacherAssignmentsRouters(
  env: Record<string, string | undefined> = process.env,
  seams: { clock?: SubmitClock } = {},
) {
  const databaseUrl = requireDatabaseUrl(env as { DATABASE_URL?: string });
  const sql = createSql(databaseUrl);
  const module = buildTeacherAssignmentsModule(
    sql,
    seams.clock ?? { newId: () => crypto.randomUUID(), now: () => new Date() },
  );
  return {
    module,
    teacherAssignmentsRoute: createTeacherAssignmentsRouter(module),
  };
}

/**
 * TeachingCoverage wire router — path parity with the frozen Java core
 * (T-MIG-087, the r4b mount band; operator mount order trace
 * 1a114e45f09db04d; frozen sources @ 6cad6ef):
 *
 *   TeachingCoverageController @RequestMapping("/api/v1/teacher/classes")
 *     :56-192 — the 3 coverage endpoints this module owns EXACTLY:
 *       GET /api/v1/teacher/classes/{classId}/coverage
 *       GET /api/v1/teacher/classes/{classId}/coverage/{specPointNodeId}/history
 *       PUT /api/v1/teacher/classes/{classId}/coverage/{specPointNodeId}
 *
 * WHY A DEDICATED FILE: the T-MIG-052 classroom.ts and T-MIG-079
 * learnerkg.ts headers explicitly rule coverage OUT of their bands ("KG /
 * coverage / analytics / notes / revision / smart-lesson stay OUT — their
 * own W5 tranches"). This module is that W5 band's wire slice; the
 * historical headers stay untouched.
 *
 * SERVICE SEAM (no port here — the 053 tranche-1 layer is the seam of
 * record, services/knowledge/index.ts):
 *   - coverageList   (:66-92)  — recorded rows only, spec_point_node_id asc
 *   - coverageHistory(:66-92)  — the per-point audit trail, newest first
 *   - coverageMark   (:116-160) — the fail-closed gate chain (404 class →
 *     403 ownership → 409 archived → 400 status parse → 404 spec point →
 *     400 not-a-spec-point (V39) → normalizeNote → idempotent re-mark →
 *     exactly one audit event + the state move)
 * This layer owns the wire only: authz shell, path parsing, body binding,
 * error-status mapping, transaction boundary. Nothing here re-implements
 * service law.
 *
 * Route security (SecurityConfig parity): /api/v1/teacher/** →
 * hasAnyRole('TEACHER','ADMIN') (:87) — the shell answers the Boot 401 body
 * for anonymous callers and the Boot 403 body for authenticated
 * non-teachers BEFORE every handler (classroom.ts shell pattern; the
 * deep-audit M5 @PreAuthorize stays defense in depth).
 *
 * Error envelopes (GlobalExceptionHandler parity — the classroom.ts
 * mapping): KnowledgeNotFoundError → 404 not_found (message verbatim —
 * "class not found" / "specification point not found");
 * KnowledgeForbiddenError → 403 forbidden ("this class belongs to another
 * teacher"); BadRequestError → 400 bad_request ("status must be 'taught' or
 * 'not-taught'" / "that node is not a specification point" / "malformed
 * request"); ConflictError → 409 conflict ("this class is archived — reopen
 * it before marking coverage"). @PathVariable UUID type mismatch → 400
 * bad_request "malformed request" (:169-172 — the classroom parseUuid
 * parity; the service binds ::uuid and must never see a non-uuid).
 *
 * PUT body law (two-envelope, R0 intake fix R-1 — the fleet convention
 * carried by classroom/teachermarking/selfmark): Jackson binds the WHOLE
 * document BEFORE @Valid, so a binding-type failure answers 400
 * malformed_body verbatim and a constraint failure answers 400
 * validation_failed "field: message" with the jakarta default messages
 * (@NotBlank status → "status: must not be blank"; @Size(max=500) note →
 * "note: size must be between 0 and 500"). The zod pin is the contracts
 * coverageMarkRequestSchema (T-MIG-053 t1); the tolerant status vocabulary
 * ("taught" | "not-taught" | "not_taught", trim+lowercase) stays SERVICE
 * law — a constraint-valid but unknown status reaches the service's 400.
 *
 * R-TX DOCTRINE (the mission law for this mount): the PUT carries TWO
 * writes (the teaching_coverage state row + the teaching_coverage_events
 * audit row). The 053 service port issues them as one logical
 * @Transactional unit; the ROUTE LAYER owns the transaction boundary here —
 * every PUT handler runs coverageMark inside deps.sql.transaction (the
 * createSql adapter's begin/commit/rollback; the concept-seed precedent:
 * "the route layer owns the transaction boundary"). A failure between the
 * state move and the audit append rolls back BOTH — no partial coverage
 * writes, no audit gap. Reads stay outside transactions.
 *
 * Mount proposal (operator integrates index.ts centrally — this file does
 * NOT touch it):
 *   import { buildTeacherCoverageRouters } from "./routes/teacher-coverage";
 *   const coverage = buildTeacherCoverageRouters();
 *   app.route("/api/v1/teacher/classes", coverage.teacherCoverageRoute);
 * placed AFTER the classroom mount. Path-disjoint with
 * classroom.teacherClassesRoute (which owns "/", "/:id", "/:id/status",
 * "/:id/members", "/:id/announcements" — never any coverage path), so the
 * two routers cannot shadow each other (Hono first-match-wins per handler).
 */
import { Hono, type Context } from "hono";
import type { ZodError } from "zod";
import {
  coverageList,
  coverageHistory,
  coverageMark,
  KnowledgeForbiddenError,
  KnowledgeNotFoundError,
  type KnowledgeDeps,
} from "../services/knowledge";
import { BadRequestError, ConflictError, type SubmitClock } from "../services/selfmark";
import { requireDatabaseUrl } from "@syllabai/db";
import { createSql } from "../services/identity/users";
import type { SqlFn } from "../services/identity/users";
import { apiError } from "../services/identity/errors";
import { requireRole, getAuth } from "../middleware/auth";
import { coverageMarkRequestSchema } from "@syllabai/contracts";

/**
 * The sql seam this router needs: the tagged-template SqlFn PLUS the
 * adapter's interactive-transaction affordance (the T-MIG-010
 * register/claim seam; sme TxSqlFn shape, per-module declared).
 */
export type CoverageSql = SqlFn & {
  transaction<T>(body: (tx: SqlFn) => Promise<T>): Promise<T>;
};

export type CoverageRouteDeps = KnowledgeDeps & { sql: CoverageSql };

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** @PathVariable UUID conversion parity (MethodArgumentTypeMismatch → 400
 *  bad_request "malformed request", GlobalExceptionHandler :169-172). */
function parseUuid(raw: string): string {
  if (!UUID_RE.test(raw)) {
    throw new BadRequestError("malformed request");
  }
  return raw;
}

// ── two-envelope body law (R0 intake fix R-1 — the fleet convention) ────────
/*
 * Same law text as classroom.ts: a binding-class failure answers 400
 * malformed_body verbatim; a constraint failure answers 400
 * validation_failed with the FIRST field error in the jakarta default
 * rendering. The coverage schemas carry no format checks (no
 * invalid_string class); null/undefined status binds and its rejection is
 * the @NotBlank constraint.
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

type BodyError = { kind: "malformed" } | { kind: "validation"; message: string };

function classifyBodyError(error: ZodError): BodyError {
  const isBinding = (i: ZodError["issues"][number]): boolean => {
    if (i.code === "invalid_string") return true;
    if (i.code === "invalid_type") {
      const received = (i as { received?: string }).received;
      return received !== "undefined" && received !== "null";
    }
    return false;
  };
  if (error.issues.some(isBinding)) return { kind: "malformed" };
  const first = error.issues[0];
  if (!first) return { kind: "validation", message: "request invalid" };
  const field = first.path.reduce<string>(
    (acc, seg) => (typeof seg === "number" ? `${acc}[${seg}]` : acc ? `${acc}.${seg}` : String(seg)),
    "",
  );
  if (first.code === "too_small") {
    // @NotBlank (status min 1) — the jakarta default
    return { kind: "validation", message: `${field}: must not be blank` };
  }
  if (first.code === "custom") {
    return { kind: "validation", message: `${field}: ${first.message ?? "request invalid"}` };
  }
  if (first.code === "too_big") {
    // @Size(max=500) note — the jakarta default rendering
    const maximum = (first as { maximum: number }).maximum;
    return { kind: "validation", message: `${field}: size must be between 0 and ${maximum}` };
  }
  if (first.code === "invalid_type") {
    // F-1: @NotBlank(null/absent) — the jakarta default; the JSON-null ROOT
    // keeps the disclosed 400-not-500 posture ("request invalid")
    return {
      kind: "validation",
      message: field === "" ? "request invalid" : `${field}: must not be blank`,
    };
  }
  return { kind: "validation", message: `${field}: request invalid` };
}

function bodyErrorResponse(c: Context, error: ZodError): Response {
  const verdict = classifyBodyError(error);
  if (verdict.kind === "malformed") return c.json(malformedBody(), 400);
  return c.json(apiError(400, "validation_failed", verdict.message), 400);
}

/** Shared domain-error mapping (the classroom.ts pattern verbatim: the 053
 *  error classes carry verbatim frozen messages; everything else falls
 *  through to the app boundary (500). */
function coverageOnError(err: unknown, c: Context): Response {
  if (err instanceof KnowledgeNotFoundError) {
    return c.json(apiError(404, "not_found", err.message), 404);
  }
  if (err instanceof KnowledgeForbiddenError) {
    return c.json(apiError(403, "forbidden", err.message), 403);
  }
  if (err instanceof BadRequestError) {
    return c.json(apiError(400, "bad_request", err.message), 400);
  }
  if (err instanceof ConflictError) {
    return c.json(apiError(409, "conflict", err.message), 409);
  }
  console.error("[teacher-coverage] unhandled error:", err);
  return c.json(apiError(500, "internal_error", "an internal error occurred"), 500);
}

/**
 * TeachingCoverage router — mounted at "/api/v1/teacher/classes".
 * TEACHER/ADMIN shell (SecurityConfig :87 parity + the class-level
 * @PreAuthorize); the §17 ownership gate lives in the 053 services (404/403
 * verbatim). Pure factory: tests inject the sql/clock seams directly.
 */
export function createTeacherCoverageRouter(deps: CoverageRouteDeps): Hono {
  const r = new Hono();

  r.onError((err, c) => coverageOnError(err, c));

  // Authz shell (SecurityConfig :87 parity): the gate answers the Boot body
  // BEFORE every handler — and before the fall-through of paths this router
  // does not own (anonymous callers get 401, never 404).
  r.use("*", async (c, next) => {
    const gate = requireRole(c, "TEACHER", "ADMIN");
    if (gate instanceof Response) return gate;
    await next();
  });

  // GET /:classId/coverage (:66-92) → 200 — only RECORDED rows,
  // spec_point_node_id asc; absent rows are the honest "unrecorded" state
  // (the API never fabricates NOT_TAUGHT for a whole curriculum).
  r.get("/:classId/coverage", async (c) => {
    const auth = getAuth(c)!; // shell invariant: authenticated
    const classId = parseUuid(c.req.param("classId"));
    return c.json(await coverageList(deps, auth.userId, classId));
  });

  // GET /:classId/coverage/:specPointNodeId/history (:66-92) → 200 — the
  // per-point audit trail, newest first; previousStatus null on the trail's
  // first event.
  r.get("/:classId/coverage/:specPointNodeId/history", async (c) => {
    const auth = getAuth(c)!;
    const classId = parseUuid(c.req.param("classId"));
    const specPointNodeId = parseUuid(c.req.param("specPointNodeId"));
    return c.json(await coverageHistory(deps, auth.userId, classId, specPointNodeId));
  });

  // PUT /:classId/coverage/:specPointNodeId (:116-160) → 200 — the full
  // fail-closed gate chain is SERVICE law; this layer binds the MarkRequest
  // constraints (two-envelope law) and owns the R-TX boundary: the state
  // row + the audit event commit or roll back TOGETHER.
  r.put("/:classId/coverage/:specPointNodeId", async (c) => {
    const auth = getAuth(c)!;
    const classId = parseUuid(c.req.param("classId"));
    const specPointNodeId = parseUuid(c.req.param("specPointNodeId"));
    const raw = await readJsonBody(c);
    if (!raw.ok) return c.json(malformedBody(), 400);
    const parsed = coverageMarkRequestSchema.safeParse(raw.value);
    if (!parsed.success) return bodyErrorResponse(c, parsed.error);
    return c.json(
      await deps.sql.transaction(() =>
        coverageMark(deps, auth.userId, classId, specPointNodeId, parsed.data),
      ),
      200,
    );
  });

  return r;
}

/**
 * Module + router composition for the app root — the buildClassroomRouters
 * shape (env → requireDatabaseUrl → createSql adapter). `seams.clock`
 * injects the SubmitClock (determinism law; production default is the wall
 * clock). NOTE: the operator mounts the returned router centrally; this
 * builder never touches index.ts itself.
 */
export function buildTeacherCoverageRouters(
  env: Record<string, string | undefined> = process.env,
  seams: { clock?: SubmitClock } = {},
) {
  const databaseUrl = requireDatabaseUrl(env as { DATABASE_URL?: string });
  const sql = createSql(databaseUrl) as CoverageSql;
  const deps: CoverageRouteDeps = {
    sql,
    clock: seams.clock ?? { newId: () => crypto.randomUUID(), now: () => new Date() },
  };
  return {
    teacherCoverageRoute: createTeacherCoverageRouter(deps),
  };
}

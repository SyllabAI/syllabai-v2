/**
 * Teaching-coverage router — T-MIG-082 tranche A (the wire-mounts band, R0).
 * Path parity with the frozen core (syllabai-core @ 6cad6ef):
 *
 *   TeachingCoverageController @RequestMapping("/api/v1/teacher/classes/{classId}/coverage")
 *     (TeachingCoverageController.java :60-160):
 *     GET  /:classId/coverage                      list — only what teachers
 *                                                  asserted, spec_point_node_id asc
 *     GET  /:classId/coverage/:specPointNodeId/history   the per-point audit
 *                                                  trail, newest first — verbatim
 *     PUT  /:classId/coverage/:specPointNodeId     mark — the full fail-closed
 *                                                  gate chain
 *
 * Route security (SecurityConfig parity): /api/v1/teacher/** requires
 * TEACHER or ADMIN → the requireRole("TEACHER","ADMIN") gate answers BEFORE
 * every handler body (the classroom.ts :254 per-route gate — the sme.ts
 * r.use shell is the equivalent law); anonymous → Boot 401 body, student →
 * Boot 403.
 *
 * THE GATE ORDER (:116-160 + the §17 helper :169-175) — the service's own
 * covOwnedClass/coverageMark chain, consumed AS-IS (zero service edits):
 *   class exists (404 "class not found") → this teacher's (403 "this class
 *   belongs to another teacher") → ACTIVE (409 "this class is archived —
 *   reopen it before marking coverage", the WRITE gate) → status parse (400
 *   "status must be 'taught' or 'not-taught'") → node exists (404
 *   "specification point not found") → the V39 invariant (400 "that node is
 *   not a specification point": applicability is populated ONLY on
 *   seed-owned spec-point rows — refuse everything else instead of guessing).
 *   GET routes deliberately carry NO archived-class gate (409 is a WRITE
 *   gate — a teacher may inspect a past class's coverage).
 *
 * Body law (PUT mark — MarkRequest :155-158, the classroom.ts two-envelope
 * classifier):
 *   - non-JSON / empty body → 400 malformed_body "request body is not
 *     readable (check field types and enum values)" (:175-180);
 *   - a non-string status/note (wrong JSON type) = a BIND failure (F-0) →
 *     the same malformed_body envelope (binding beats every constraint);
 *   - @NotBlank status null/absent/whitespace-only → 400 validation_failed
 *     "status: must not be blank" (:158-165 first-field law);
 *   - @Size(max=500) note longer than 500 → 400 validation_failed "note:
 *     size must be between 0 and 500" (the too_big rendering; null/absent
 *     note passes — constraints skip null);
 *   - the identical re-mark (same status AND same normalized note) is the
 *     idempotent no-op it honestly is — 200 with the unchanged row, exactly
 *     one audit event on any information change.
 *
 * PUT returns 200 CoverageRowView (the frozen @PutMapping default — NOT 201).
 * Path vars are @PathVariable UUID (:62/:79/:101) → malformed UUID → 400
 * bad_request "malformed request" (MethodArgumentTypeMismatch parity,
 * GlobalExceptionHandler :167-170).
 */
import { Hono } from "hono";
import { requireRole } from "../middleware/auth";
import { apiError } from "../services/identity/errors";
import { requireDatabaseUrl } from "@syllabai/db";
import { createSql } from "../services/identity/users";
import {
  coverageList,
  coverageHistory,
  coverageMark,
  KnowledgeNotFoundError,
  KnowledgeForbiddenError,
  type KnowledgeDeps,
} from "../services/knowledge";
import { BadRequestError, ConflictError, type SubmitClock } from "../services/selfmark";

/** the frozen unreadable-body envelope (GlobalExceptionHandler :175-180) */
const MALFORMED_BODY = "request body is not readable (check field types and enum values)";

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export type CoverageDeps = KnowledgeDeps;

/** the mapErrors law — the four named envelopes, message-verbatim. */
function mapErrors(
  e: unknown,
  c: { json: (b: unknown, s: number) => Response },
): Response {
  if (e instanceof KnowledgeNotFoundError) return c.json(apiError(404, "not_found", e.message), 404);
  if (e instanceof KnowledgeForbiddenError) return c.json(apiError(403, "forbidden", e.message), 403);
  if (e instanceof ConflictError) return c.json(apiError(409, "conflict", e.message), 409);
  if (e instanceof BadRequestError) return c.json(apiError(400, "bad_request", e.message), 400);
  console.error("[coverage] unhandled error:", e);
  return c.json(apiError(500, "internal_error", "an internal error occurred"), 500);
}

/** the @NotBlank first-field law (:158-165): null/absent/whitespace fail. */
const isBlank = (v: unknown): v is undefined | null | string =>
  v === undefined || v === null || (typeof v === "string" && v.trim().length === 0);

/**
 * The PUT /:specPointNodeId body classifier — the MarkRequest record
 * (@NotBlank status, @Size(max=500) note), the classroom.ts two-envelope
 * law: binding failures (wrong JSON types anywhere) beat every constraint;
 * otherwise the FIRST field error renders "field: jakarta default".
 */
export function classifyCoverageBody(
  body: unknown,
): { kind: "malformed" } | { kind: "validation"; message: string } | { kind: "ok"; value: { status: string; note: string | null } } {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { kind: "malformed" };
  }
  const { status, note } = body as { status?: unknown; note?: unknown };
  // F-0: a wrong JSON type is a BIND failure — beats every constraint
  if (status !== undefined && status !== null && typeof status !== "string") {
    return { kind: "malformed" };
  }
  if (note !== undefined && note !== null && typeof note !== "string") {
    return { kind: "malformed" };
  }
  // F-1 constraints, first-field order (the record declares status first)
  if (isBlank(status)) {
    return { kind: "validation", message: "status: must not be blank" };
  }
  if (typeof note === "string" && note.length > 500) {
    return { kind: "validation", message: "note: size must be between 0 and 500" };
  }
  return { kind: "ok", value: { status: status as string, note: (note as string | null | undefined) ?? null } };
}

export function createCoverageRouter(deps: CoverageDeps): Hono {
  const r = new Hono();

  // GET /:classId/coverage (:63-76) — only what teachers asserted
  r.get("/:classId/coverage", async (c) => {
    // authz gate FIRST (the shell precedes the param law — the 079 rule)
    const gate = requireRole(c, "TEACHER", "ADMIN");
    if (gate instanceof Response) return gate;
    const classId = c.req.param("classId");
    if (!UUID_RE.test(classId)) {
      return c.json(apiError(400, "bad_request", "malformed request"), 400);
    }
    try {
      return c.json(await coverageList(deps, gate.userId, classId), 200);
    } catch (e) {
      return mapErrors(e, c);
    }
  });

  // GET /:classId/coverage/:specPointNodeId/history (:78-91) — newest first
  r.get("/:classId/coverage/:specPointNodeId/history", async (c) => {
    const gate = requireRole(c, "TEACHER", "ADMIN");
    if (gate instanceof Response) return gate;
    const classId = c.req.param("classId");
    if (!UUID_RE.test(classId)) {
      return c.json(apiError(400, "bad_request", "malformed request"), 400);
    }
    const specPointNodeId = c.req.param("specPointNodeId");
    if (!UUID_RE.test(specPointNodeId)) {
      return c.json(apiError(400, "bad_request", "malformed request"), 400);
    }
    try {
      return c.json(
        await coverageHistory(deps, gate.userId, classId, specPointNodeId),
        200,
      );
    } catch (e) {
      return mapErrors(e, c);
    }
  });

  // PUT /:classId/coverage/:specPointNodeId (:93-152) — the fail-closed mark
  r.put("/:classId/coverage/:specPointNodeId", async (c) => {
    const gate = requireRole(c, "TEACHER", "ADMIN");
    if (gate instanceof Response) return gate;
    const classId = c.req.param("classId");
    if (!UUID_RE.test(classId)) {
      return c.json(apiError(400, "bad_request", "malformed request"), 400);
    }
    const specPointNodeId = c.req.param("specPointNodeId");
    if (!UUID_RE.test(specPointNodeId)) {
      return c.json(apiError(400, "bad_request", "malformed request"), 400);
    }
    const raw = await c.req.text();
    let body: unknown;
    try {
      body = raw ? JSON.parse(raw) : undefined;
    } catch {
      return c.json(apiError(400, "malformed_body", MALFORMED_BODY), 400);
    }
    if (raw === "" || body === undefined) {
      // an empty PUT body = Required request body is missing → the unreadable
      // envelope (HttpMessageNotReadable :175-180)
      return c.json(apiError(400, "malformed_body", MALFORMED_BODY), 400);
    }
    const classified = classifyCoverageBody(body);
    if (classified.kind === "malformed") {
      return c.json(apiError(400, "malformed_body", MALFORMED_BODY), 400);
    }
    if (classified.kind === "validation") {
      return c.json(apiError(400, "validation_failed", classified.message), 400);
    }
    try {
      const row = await coverageMark(deps, gate.userId, classId, specPointNodeId, classified.value);
      return c.json(row, 200);
    } catch (e) {
      return mapErrors(e, c);
    }
  });

  return r;
}

/**
 * Live factory — the real sql client; `seams.clock` injects the clock
 * (determinism law; the coverage INSERT stamps marked_at/created_at).
 */
export function buildCoverageRouters(
  env: Record<string, string | undefined> = process.env,
  seams: { clock?: SubmitClock } = {},
) {
  const databaseUrl = requireDatabaseUrl(env as { DATABASE_URL?: string });
  const sql = createSql(databaseUrl);
  const clock = seams.clock ?? { newId: () => crypto.randomUUID(), now: () => new Date() };
  const deps: CoverageDeps = { sql, clock };
  return { deps, coverageRoute: createCoverageRouter(deps) };
}

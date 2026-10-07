/**
 * Teacher class KG + teaching coverage + concept-graph routers —
 * T-MIG-082 tranche-1 (r4b mount band). Path parity with the frozen core
 * (syllabai-core @ 6cad6ef):
 *
 *   TeachingCoverageController  @RequestMapping(
 *     "/api/v1/teacher/classes/{classId}/coverage") (:56-192) — 3 endpoints:
 *     GET "" (:80-91, recorded rows, spec_point_node_id asc), GET
 *     "/{specPointNodeId}/history" (:93-103, newest first), PUT
 *     "/{specPointNodeId}" (:116-160, the band's only write).
 *   ClassKnowledgeGraphController @RequestMapping(
 *     "/api/v1/teacher/classes/{classId}/knowledge-graph") (:37-113) — 3 GETs:
 *     "" (:59-63, the heatmap), "/nodes/{nodeId}/students" (:78-84, TFA-07
 *     weak-node leg), "/learners/{learnerId}/knowledge-graph" (:95-101,
 *     TFA-07 student leg — the SAME F-034 read model, the teacher lens adds
 *     only gates).
 *   TeacherConceptGraphController @RequestMapping(
 *     "/api/v1/teacher/concept-graph") (:39-137) — 2 endpoints: POST
 *     "/activate" (:66-70, @ResponseStatus OK — idempotent re-verify), GET
 *     "/edges" (:87-105, relation→source-code→target-code deterministic
 *     order, PART_OF excluded, misconception-family widening).
 *
 * Route security (SecurityConfig + deep-audit 09-28 M5 parity): the frozen
 * controllers carry class-level @PreAuthorize("hasAnyRole('TEACHER','ADMIN')")
 * ON TOP of the /api/v1/teacher/** route rule — both routers open with the
 * router-level M5 shell requireRole(c, "TEACHER", "ADMIN") (Boot 403 body
 * for authenticated non-teachers, the classroom.ts :407-414 precedent).
 * The per-object §17 OWNERSHIP gate (404 "class not found" / 403 "this
 * class belongs to another teacher") lives INSIDE the services
 * (covOwnedClass / classGraph's ownedClass) — the route never re-guesses it.
 *
 * Param laws (Spring MVC parity, GlobalExceptionHandler.java):
 *   - {classId} / {specPointNodeId} / {nodeId} / {learnerId} are
 *     @PathVariable UUID → malformed UUID → 400 bad_request "malformed
 *     request" (:167-170, checked in-path BEFORE any sql);
 *   - rootId is a @RequestParam UUID on all three knowledge-graph GETs and
 *     /edges → missing → 400 validation_failed "missing required
 *     parameter: rootId" (:185-190), malformed → 400 bad_request "malformed
 *     request" (the learnerkg.ts T-MIG-079 signature-order precedent).
 *
 * PUT body law (MarkRequest, TeachingCoverageController :188-191 —
 * @NotBlank String status, @Size(max = 500) String note): @Valid runs
 * BEFORE the method body, so it beats the ownership gate. jakarta renders
 *   - null/absent/blank status → 400 validation_failed "status: must not
 *     be blank" (constraints skip null; @NotBlank fails it — the classroom
 *     contracts T-MIG-059 F-1 law);
 *   - note > 500 chars → 400 validation_failed "note: size must be between
 *     0 and 500" (explicit null SKIPS @Size — the service's normalizeNote
 *     owns it);
 *   - an unreadable body → 400 bad_request "request body is not readable
 *     (check field types and enum values)" (GlobalExceptionHandler :175-180).
 * The SEMANTIC status parse ("status must be 'taught' or 'not-taught'",
 * :126-129) stays in the service — the route only carries the bean
 * validation layer, in the frozen order (body validation → ownedClass →
 * archived 409 → status parse → node gates).
 *
 * Error envelopes (the frozen handler law, mapped locally — everything
 * else falls to the app-level 500 boundary, never guessed):
 *   KnowledgeNotFoundError → 404 not_found; KnowledgeForbiddenError → 403
 *   forbidden; BadRequestError → 400 bad_request; ConflictError → 409
 *   conflict ("this class is archived — reopen it before marking
 *   coverage"); SeedConflictError → 409 conflict (the concept-seed
 *   provenance law).
 *
 * Reuse-not-redeclare — the services are the T-MIG-053 tranche-1/t2 ports
 * (fakeSql-pinned in test/knowledge/ + test/teacher/): coverageList /
 * coverageHistory / coverageMark (services/knowledge/index.ts), classGraph /
 * classNodeStudents / classLearnerKnowledgeGraph (services/knowledge/
 * graphs.ts), activateConceptGraph (services/teacher/concept-seed.ts) +
 * teacherConceptEdges (services/teacher/concept-edges.ts). The wire schemas
 * are pre-ratified in @syllabai/contracts (knowledge.ts / teacher.ts) —
 * zero new wire; the routes serialize the service views verbatim.
 *
 * Scope honesty: these routers own EXACTLY the paths above under the two
 * mounts. The sibling classroom routers (teachermarking 032, classes 052)
 * mount at the same /api/v1/teacher/* bases — Hono resolves per router;
 * first-match-wins registration keeps every router authoritative for its
 * own paths. The app-level 404-after-auth fallback stays the answer for
 * anything unclaimed. /api/v1/subjects and /api/v1/tree stay CORE-ONLY by
 * the T-MIG-035 check-3 law — deliberately NOT mounted here (the band's
 * adjudication of record).
 */
import { Hono, type Context } from "hono";
import { z } from "zod";
import { requireRole } from "../middleware/auth";
import { apiError } from "../services/identity/errors";
import { requireDatabaseUrl } from "@syllabai/db";
import { createSql } from "../services/identity/users";
import {
  classGraph,
  classLearnerKnowledgeGraph,
  classNodeStudents,
  coverageHistory,
  coverageList,
  coverageMark,
  KnowledgeForbiddenError,
  KnowledgeNotFoundError,
  type KnowledgeDeps,
} from "../services/knowledge";
import { activateConceptGraph, SeedConflictError } from "../services/teacher/concept-seed";
import { teacherConceptEdges } from "../services/teacher/concept-edges";
import { BadRequestError, ConflictError } from "../services/selfmark";

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** The frozen GlobalExceptionHandler :175-180 unreadable-body envelope. */
const BODY_NOT_READABLE =
  "request body is not readable (check field types and enum values)";

/** MarkRequest bean-validation wire (header law) — @NotBlank + @Size(500). */
const markRequestSchema = z.object({
  status: z.string({ message: "must not be blank" }).refine(
    (s) => s.trim().length > 0,
    "must not be blank",
  ),
  note: z.string().max(500, "size must be between 0 and 500").nullish(),
});

/**
 * The shared local error map (the frozen handler law; header). */
function mapErrors(
  e: unknown,
  c: { json: (b: unknown, s: number) => Response },
): Response | null {
  if (e instanceof KnowledgeNotFoundError) return c.json(apiError(404, "not_found", e.message), 404);
  if (e instanceof KnowledgeForbiddenError) return c.json(apiError(403, "forbidden", e.message), 403);
  if (e instanceof BadRequestError) return c.json(apiError(400, "bad_request", e.message), 400);
  if (e instanceof ConflictError) return c.json(apiError(409, "conflict", e.message), 409);
  if (e instanceof SeedConflictError) return c.json(apiError(409, "conflict", e.message), 409);
  return null;
}

/**
 * The shared per-handler runner: M5 gate is the router shell, so the
 * handlers wire the UUID param law + the error map (the learnerkg shape).
 */
export function createTeacherClassesKgRouter(deps: KnowledgeDeps): Hono {
  const r = new Hono();

  // Authz shell (SecurityConfig /api/v1/teacher/** + the frozen class-level
  // @PreAuthorize — the M5 defense-in-depth, scoped to this router only).
  r.use("*", async (c, next) => {
    const gate = requireRole(c, "TEACHER", "ADMIN");
    if (gate instanceof Response) return gate;
    await next();
  });

  // ── TeachingCoverage (the coverage family, 3 endpoints) ────────────────

  // GET "/{classId}/coverage" (:80-91) — recorded rows only, node info
  // attached; the ownership gate is the service's.
  r.get("/:classId/coverage", async (c) => {
    const gate = requireRole(c, "TEACHER", "ADMIN");
    if (gate instanceof Response) return gate;
    const classId = c.req.param("classId");
    if (!UUID_RE.test(classId)) {
      return c.json(apiError(400, "bad_request", "malformed request"), 400);
    }
    try {
      return c.json(await coverageList(deps, gate.userId, classId), 200);
    } catch (e) {
      const mapped = mapErrors(e, c);
      if (mapped) return mapped;
      throw e;
    }
  });

  // GET "/{classId}/coverage/{specPointNodeId}/history" (:93-103) — the
  // append-only trail, newest first.
  r.get("/:classId/coverage/:specPointNodeId/history", async (c) => {
    const gate = requireRole(c, "TEACHER", "ADMIN");
    if (gate instanceof Response) return gate;
    const classId = c.req.param("classId");
    const specPointNodeId = c.req.param("specPointNodeId");
    if (!UUID_RE.test(classId) || !UUID_RE.test(specPointNodeId)) {
      return c.json(apiError(400, "bad_request", "malformed request"), 400);
    }
    try {
      return c.json(
        await coverageHistory(deps, gate.userId, classId, specPointNodeId),
        200,
      );
    } catch (e) {
      const mapped = mapErrors(e, c);
      if (mapped) return mapped;
      throw e;
    }
  });

  // PUT "/{classId}/coverage/{specPointNodeId}" (:116-160) — the only write
  // in the band; the @Valid-before-body law (header), then the service's
  // gate order (404 → 403 → 409 → 400 status parse → 404 → 400 V39).
  r.put("/:classId/coverage/:specPointNodeId", async (c) => {
    const gate = requireRole(c, "TEACHER", "ADMIN");
    if (gate instanceof Response) return gate;
    const classId = c.req.param("classId");
    const specPointNodeId = c.req.param("specPointNodeId");
    if (!UUID_RE.test(classId) || !UUID_RE.test(specPointNodeId)) {
      return c.json(apiError(400, "bad_request", "malformed request"), 400);
    }
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json(apiError(400, "bad_request", BODY_NOT_READABLE), 400);
    }
    const parsed = markRequestSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = issue?.path.join(".") ?? "request";
      return c.json(
        apiError(400, "validation_failed", `${field}: ${issue?.message ?? "request invalid"}`),
        400,
      );
    }
    try {
      return c.json(
        await coverageMark(deps, gate.userId, classId, specPointNodeId, {
          status: parsed.data.status,
          note: parsed.data.note ?? null,
        }),
        200,
      );
    } catch (e) {
      const mapped = mapErrors(e, c);
      if (mapped) return mapped;
      throw e;
    }
  });

  // ── ClassKnowledgeGraph (the class-scoped KG family, 3 endpoints) ──────

  const rootIdOf = (
    c: Context,
  ): { ok: true; rootId: string } | { ok: false; response: Response } => {
    const raw = c.req.query("rootId");
    if (raw === undefined) {
      return {
        ok: false,
        response: c.json(apiError(400, "validation_failed", "missing required parameter: rootId"), 400),
      };
    }
    if (!UUID_RE.test(raw)) {
      return { ok: false, response: c.json(apiError(400, "bad_request", "malformed request"), 400) };
    }
    return { ok: true, rootId: raw };
  };

  // GET "/{classId}/knowledge-graph" (:59-63) — the heatmap; archived
  // classes readable (the service keeps the gate order).
  r.get("/:classId/knowledge-graph", async (c) => {
    const gate = requireRole(c, "TEACHER", "ADMIN");
    if (gate instanceof Response) return gate;
    const classId = c.req.param("classId");
    if (!UUID_RE.test(classId)) {
      return c.json(apiError(400, "bad_request", "malformed request"), 400);
    }
    const root = rootIdOf(c);
    if (!root.ok) return root.response;
    try {
      return c.json(
        await classGraph(deps, gate.userId, classId, root.rootId),
        200,
      );
    } catch (e) {
      const mapped = mapErrors(e, c);
      if (mapped) return mapped;
      throw e;
    }
  });

  // GET "/{classId}/knowledge-graph/nodes/{nodeId}/students" (:78-84) —
  // TFA-07 weak-node leg; node-outside-subject 404 is the service's.
  r.get("/:classId/knowledge-graph/nodes/:nodeId/students", async (c) => {
    const gate = requireRole(c, "TEACHER", "ADMIN");
    if (gate instanceof Response) return gate;
    const classId = c.req.param("classId");
    const nodeId = c.req.param("nodeId");
    if (!UUID_RE.test(classId) || !UUID_RE.test(nodeId)) {
      return c.json(apiError(400, "bad_request", "malformed request"), 400);
    }
    const root = rootIdOf(c);
    if (!root.ok) return root.response;
    try {
      return c.json(
        await classNodeStudents(deps, gate.userId, classId, root.rootId, nodeId),
        200,
      );
    } catch (e) {
      const mapped = mapErrors(e, c);
      if (mapped) return mapped;
      throw e;
    }
  });

  // GET "/{classId}/knowledge-graph/learners/{learnerId}/knowledge-graph"
  // (:95-101) — TFA-07 student leg; the §17 enabled-member 404 is the
  // service's (backend-enforced, the UI hiding data is not authorization).
  r.get("/:classId/knowledge-graph/learners/:learnerId/knowledge-graph", async (c) => {
    const gate = requireRole(c, "TEACHER", "ADMIN");
    if (gate instanceof Response) return gate;
    const classId = c.req.param("classId");
    const learnerId = c.req.param("learnerId");
    if (!UUID_RE.test(classId) || !UUID_RE.test(learnerId)) {
      return c.json(apiError(400, "bad_request", "malformed request"), 400);
    }
    const root = rootIdOf(c);
    if (!root.ok) return root.response;
    try {
      return c.json(
        await classLearnerKnowledgeGraph(deps, gate.userId, classId, learnerId, root.rootId),
        200,
      );
    } catch (e) {
      const mapped = mapErrors(e, c);
      if (mapped) return mapped;
      throw e;
    }
  });

  return r;
}

/** Concept-graph router — the teacher activation + edges pair. */
export function createTeacherConceptGraphRouter(deps: KnowledgeDeps): Hono {
  const r = new Hono();

  // Authz shell (the frozen class-level @PreAuthorize, M5 parity).
  r.use("*", async (c, next) => {
    const gate = requireRole(c, "TEACHER", "ADMIN");
    if (gate instanceof Response) return gate;
    await next();
  });

  // POST "/activate" (:66-70) — @ResponseStatus(OK); deterministic and
  // idempotent over the SHA-256-pinned snapshot; the provenance mismatch
  // 409 is the service's law.
  r.post("/activate", async (c) => {
    const gate = requireRole(c, "TEACHER", "ADMIN");
    if (gate instanceof Response) return gate;
    try {
      return c.json(await activateConceptGraph(deps, gate.userId), 200);
    } catch (e) {
      const mapped = mapErrors(e, c);
      if (mapped) return mapped;
      throw e;
    }
  });

  // GET "/edges?rootId=" (:87-105) — semantic edges within the subtree plus
  // the misconception-family widening; sorted relation→source→target.
  r.get("/edges", async (c) => {
    const gate = requireRole(c, "TEACHER", "ADMIN");
    if (gate instanceof Response) return gate;
    const raw = c.req.query("rootId");
    if (raw === undefined) {
      return c.json(apiError(400, "validation_failed", "missing required parameter: rootId"), 400);
    }
    if (!UUID_RE.test(raw)) {
      return c.json(apiError(400, "bad_request", "malformed request"), 400);
    }
    try {
      return c.json(await teacherConceptEdges(deps, raw), 200);
    } catch (e) {
      const mapped = mapErrors(e, c);
      if (mapped) return mapped;
      throw e;
    }
  });

  return r;
}

/**
 * Module + router composition for the app root — the buildClassroomRouters
 * shape (env → requireDatabaseUrl → createSql adapter). ONE sql + ONE clock
 * shared by both routers (the coverage/seed instant laws read the ONE
 * anchor, ADR-031). `opts.now` injects the clock (determinism law);
 * production default is the fresh per-request clock.
 */
export function buildTeacherKgRouters(
  env: Record<string, string | undefined> = process.env,
  opts: { now?: () => Date } = {},
) {
  const databaseUrl = requireDatabaseUrl(env as { DATABASE_URL?: string });
  const sql = createSql(databaseUrl);
  const deps: KnowledgeDeps = {
    sql,
    clock: {
      newId: () => crypto.randomUUID(),
      now: opts.now ?? (() => new Date()),
    },
  };
  return {
    teacherClassesKgRoute: createTeacherClassesKgRouter(deps),
    teacherConceptGraphRoute: createTeacherConceptGraphRouter(deps),
  };
}

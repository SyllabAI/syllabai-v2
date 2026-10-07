/**
 * Class knowledge-graph (heatmap) router — T-MIG-082 tranche A (the
 * wire-mounts band, R0). Path parity with the frozen core (syllabai-core @
 * 6cad6ef):
 *
 *   ClassKnowledgeGraphController
 *   @RequestMapping("/api/v1/teacher/classes/{classId}/knowledge-graph")
 *     (ClassKnowledgeGraphController.java :57-112):
 *     GET /:classId/knowledge-graph?rootId=                  the F-072 heatmap
 *     GET /:classId/knowledge-graph/nodes/:nodeId/students?rootId=
 *                                             TFA-07 leg 1 — the heatmap's
 *                                             roster at student grain
 *     GET /:classId/knowledge-graph/learners/:learnerId/knowledge-graph?rootId=
 *                                             TFA-07 leg 2 — ONE student's
 *                                             subject graph through the SAME
 *                                             F-034 read model the student
 *                                             sees (the one-graph law)
 *
 * Route security: /api/v1/teacher/** requires TEACHER or ADMIN — the
 * requireRole("TEACHER","ADMIN") gate answers BEFORE every handler body
 * (the classroom.ts :254 per-route gate); anonymous → Boot 401, student →
 * Boot 403.
 *
 * GATES (the controller docstring law, consumed AS-IS via the 053 t1
 * services — ZERO service edits): class exists (404 "class not found") →
 * this teacher's (403 "this class belongs to another teacher") → root node
 * 404-first via the tree read. There is deliberately NO archived-class gate
 * on any read: 409 is a WRITE gate — a teacher may inspect a past class's
 * heatmap. The third leg adds the §17 privacy boundary: the learner must be
 * an ENABLED member of THIS class (404 "learner is not a member of this
 * class") — the membership check short-circuits BEFORE any user lookup, an
 * absent membership neither confirms nor denies any other enrollment.
 *
 * Param law (signature order — path vars resolve in declaration order
 * before the query param, then MissingServletRequestParameter :
 * 185-190 → MethodArgumentTypeMismatch :167-170):
 *   - malformed path UUID (classId/nodeId/learnerId) → 400 bad_request
 *     "malformed request";
 *   - MISSING rootId → 400 validation_failed "missing required parameter:
 *     rootId" (the 079 captured law shape);
 *   - malformed rootId → 400 bad_request "malformed request".
 *
 * Reuse-not-redeclare: services/knowledge/graphs.ts classGraph /
 * classNodeStudents / classLearnerKnowledgeGraph (the 053 t1 ports,
 * fakeSql-pinned in test/knowledge/class-graph.test.ts) — consumed as-is.
 */
import { Hono } from "hono";
import { requireRole } from "../middleware/auth";
import { apiError } from "../services/identity/errors";
import { requireDatabaseUrl } from "@syllabai/db";
import { createSql } from "../services/identity/users";
import {
  classGraph,
  classNodeStudents,
  classLearnerKnowledgeGraph,
  KnowledgeNotFoundError,
  KnowledgeForbiddenError,
  type ClassGraphDeps,
} from "../services/knowledge";
import type { SubmitClock } from "../services/selfmark";

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export type ClassKgDeps = ClassGraphDeps;

function mapErrors(
  e: unknown,
  c: { json: (b: unknown, s: number) => Response },
): Response {
  if (e instanceof KnowledgeNotFoundError) return c.json(apiError(404, "not_found", e.message), 404);
  if (e instanceof KnowledgeForbiddenError) return c.json(apiError(403, "forbidden", e.message), 403);
  console.error("[classkg] unhandled error:", e);
  return c.json(apiError(500, "internal_error", "an internal error occurred"), 500);
}

/** the shared rootId query law (presence, then UUID shape) */
function rootIdLaw(c: { json: (b: unknown, s: number) => Response }, raw: string | undefined): Response | null {
  if (raw === undefined) {
    return c.json(apiError(400, "validation_failed", "missing required parameter: rootId"), 400);
  }
  if (!UUID_RE.test(raw)) {
    return c.json(apiError(400, "bad_request", "malformed request"), 400);
  }
  return null;
}

/** the malformed-path-var law (MethodArgumentTypeMismatch parity) */
function pathUuidLaw(c: { json: (b: unknown, s: number) => Response }, raw: string): Response | null {
  if (!UUID_RE.test(raw)) {
    return c.json(apiError(400, "bad_request", "malformed request"), 400);
  }
  return null;
}

export function createClassKgRouter(deps: ClassKgDeps): Hono {
  const r = new Hono();

  // GET /:classId/knowledge-graph?rootId= (:57-70) — the F-072 heatmap
  r.get("/:classId/knowledge-graph", async (c) => {
    const gate = requireRole(c, "TEACHER", "ADMIN");
    if (gate instanceof Response) return gate;
    const classId = c.req.param("classId");
    const classLaw = pathUuidLaw(c, classId);
    if (classLaw) return classLaw;
    const rootLaw = rootIdLaw(c, c.req.query("rootId"));
    if (rootLaw) return rootLaw;
    try {
      return c.json(await classGraph(deps, gate.userId, classId, c.req.query("rootId")!), 200);
    } catch (e) {
      return mapErrors(e, c);
    }
  });

  // GET /:classId/knowledge-graph/nodes/:nodeId/students?rootId= (:72-94)
  // — TFA-07 leg 1; node-outside-subtree is a 404 (subject isolation),
  // never a silent cross-subject hop (the service's law).
  r.get("/:classId/knowledge-graph/nodes/:nodeId/students", async (c) => {
    const gate = requireRole(c, "TEACHER", "ADMIN");
    if (gate instanceof Response) return gate;
    const classId = c.req.param("classId");
    const classLaw = pathUuidLaw(c, classId);
    if (classLaw) return classLaw;
    const nodeId = c.req.param("nodeId");
    const nodeLaw = pathUuidLaw(c, nodeId);
    if (nodeLaw) return nodeLaw;
    const rootLaw = rootIdLaw(c, c.req.query("rootId"));
    if (rootLaw) return rootLaw;
    try {
      return c.json(
        await classNodeStudents(deps, gate.userId, classId, c.req.query("rootId")!, nodeId),
        200,
      );
    } catch (e) {
      return mapErrors(e, c);
    }
  });

  // GET /:classId/knowledge-graph/learners/:learnerId/knowledge-graph?rootId=
  // (:96-112) — TFA-07 leg 2; the §17 boundary: ENABLED-member 404,
  // short-circuit BEFORE the user lookup (the service's law).
  r.get("/:classId/knowledge-graph/learners/:learnerId/knowledge-graph", async (c) => {
    const gate = requireRole(c, "TEACHER", "ADMIN");
    if (gate instanceof Response) return gate;
    const classId = c.req.param("classId");
    const classLaw = pathUuidLaw(c, classId);
    if (classLaw) return classLaw;
    const learnerId = c.req.param("learnerId");
    const learnerLaw = pathUuidLaw(c, learnerId);
    if (learnerLaw) return learnerLaw;
    const rootLaw = rootIdLaw(c, c.req.query("rootId"));
    if (rootLaw) return rootLaw;
    try {
      return c.json(
        await classLearnerKnowledgeGraph(deps, gate.userId, classId, learnerId, c.req.query("rootId")!),
        200,
      );
    } catch (e) {
      return mapErrors(e, c);
    }
  });

  return r;
}

/**
 * Live factory — the real sql client; ONE clock (the decay anchor law: the
 * services read deps.clock ONCE per call). `seams.now` overrides the wall
 * clock for determinism.
 */
export function buildClassKgRouters(
  env: Record<string, string | undefined> = process.env,
  seams: { now?: () => Date } = {},
) {
  const databaseUrl = requireDatabaseUrl(env as { DATABASE_URL?: string });
  const sql = createSql(databaseUrl);
  const clock: SubmitClock = {
    newId: () => crypto.randomUUID(),
    now: seams.now ?? (() => new Date()),
  };
  const deps: ClassKgDeps = { sql, clock };
  return { deps, classKgRoute: createClassKgRouter(deps) };
}

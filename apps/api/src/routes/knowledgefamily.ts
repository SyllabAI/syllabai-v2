/**
 * Knowledge-graph family routers — T-MIG-084 / T-MIG-085 / T-MIG-086 (the
 * r4b mount band, lane r1c). Path parity with the frozen core (frozen
 * sources @ 6cad6ef), pinned from the HUB CALLERS (apps/hub/src/lib/api.ts
 * — the hub runs against the legacy Java core today, so its emitted paths
 * and shapes are Java-faithful; the r4b census's path strings are hints,
 * the callers are the law):
 *
 *   T-MIG-084 — KnowledgeController @RequestMapping("/api/v1/knowledge")
 *               :17-46, the 4 GETs over the global knowledge spine
 *               (services/knowledge/index.ts :391-538, the 053-t1 port):
 *     GET /nodes/{id}                    → knowledgeNode          (hub
 *        citation-map.ts :76 KNOWLEDGE_NODE deep link form)
 *     GET /nodes/{id}/misconceptions     → knowledgeMisconceptions
 *     GET /nodes/{id}/prerequisites      → knowledgePrerequisites (hub
 *        api.ts :494 prerequisites())
 *     GET /nodes/{id}/tree?includeMisconceptions= → knowledgeTree (hub
 *        api.ts :488 knowledgeTree() + core-topics.ts :96; the hub client
 *        default `includeMisconceptions = true` (api.ts :485) mirrors the
 *        core's `defaultValue = "true"` — see the param law below)
 *
 *   T-MIG-085 — TeacherConceptGraphController (activate :66 / edges :87;
 *        the 053-t2 ports concept-edges.ts + concept-seed.ts), hub
 *        api.ts :979-990:
 *     GET  /api/v1/teacher/concept-graph/edges?rootId=   → teacherConceptEdges
 *     POST /api/v1/concept-graph/activate                → activateConceptGraph
 *        (200 SeedSummary — the report-shaped ResponseEntity, NOT a created
 *        resource: the sme.ts :34 "ResponseEntity.ok, NOT 201" precedent;
 *        the frozen @Transactional runs as ONE transaction on this layer's
 *        seam — concept-seed.ts :153-156 "the route layer owns the
 *        transaction boundary")
 *
 *   T-MIG-086 — the class-scoped KG band, hub api.ts :776-800 + :1029-1032
 *        (the callers' EXACT paths; the census's "/nodes/{nodeId}/students
 *        + class-prefix" and "/topics/{nodeId}/drill-down + class-prefix"
 *        strings are normalization artifacts — the callers never emit
 *        /classes/{classId}/nodes/... nor /classes/{classId}/topics/...):
 *     GET /api/v1/teacher/classes/{classId}/knowledge-graph/nodes/{nodeId}/students?rootId=
 *        → classNodeStudents (hub teacherClassNodeStudents :785-788)
 *     GET /api/v1/teacher/classes/{classId}/learners/{learnerId}/knowledge-graph?rootId=
 *        → classLearnerKnowledgeGraph (hub teacherClassLearnerKnowledgeGraph
 *        :793-800 — the F-034 read model the teacher lens DELEGATES to)
 *     GET /api/v1/teacher/class/topics/{nodeId}/drill-down?rootId=
 *        → topicDrillDown (hub classTopicDrillDown :1029-1032 — the frozen
 *        ClassAnalyticsController :66 surface over @RequestMapping
 *        "/api/v1/teacher/class" SINGULAR, no classId: analytics.ts :31-35
 *        "this surface predates class scoping … NO classId parameter — only
 *        rootId", so a /classes/{classId}/topics/... mount would be an
 *        invented shape the ported service cannot serve)
 *
 * Route security (SecurityConfig parity):
 *   - /api/v1/knowledge/** → anyRequest().authenticated() (:87-91 has no
 *     specific matcher for the prefix; every hub caller rides the auth
 *     header) — the requireAuth shell answers the Boot 401 body first.
 *   - /api/v1/teacher/** → hasAnyRole('TEACHER','ADMIN') (:87) — the
 *     requireRole shell answers the Boot 401 (anonymous) / 403
 *     (authenticated non-teacher) body BEFORE every handler; the §17
 *     per-object ownership gate (404 "class not found" / 403 "this class
 *     belongs to another teacher") and the membership privacy boundary are
 *     SERVICE law (services/knowledge/graphs.ts :22-35, :1019-1036).
 *
 * Param law (Spring MVC parity, GlobalExceptionHandler.java):
 *   - missing required query param → 400 validation_failed
 *     "missing required parameter: {name}" (:185-190; the learnerkg
 *     :104-116 precedent) — checked BEFORE the UUID parse;
 *   - malformed UUID (path variable or query param) → 400 bad_request
 *     "malformed request" (:167-170 MethodArgumentTypeMismatch parity —
 *     the classroom.ts parseUuid law; knowledge node / class / learner ids
 *     are all uuid-typed in the Flyway schema);
 *   - includeMisconceptions (084 tree only): OPTIONAL, default TRUE —
 *     evidence: the hub client's own default (api.ts :485) and the
 *     core-topics caller which always sends an explicit value. Parsing
 *     follows Spring's StringToBooleanConverter vocabulary (true/on/yes/1,
 *     false/off/no/0, case-insensitive); anything else is a conversion
 *     failure → 400 bad_request "malformed request". DISCLOSED: the
 *     178-case corpus exercises NONE of this family (r1c Task-33 receipt),
 *     so these two laws carry no captured wire case — they are derived
 *     from the hub callers + the frozen handler line numbers, never
 *     invented shapes.
 *
 * Error envelopes (GlobalExceptionHandler parity — the messages are the
 * SERVICES' verbatim law, this layer maps classes to statuses only):
 *   KnowledgeNotFoundError   → 404 not_found   (e.g. "knowledge node <id>
 *     not found" — the 084 404-first reads; "class not found", "learner is
 *     not a member of this class", "node is not part of this subject
 *     subtree" — the 086 gate chain; "curriculum topic in this subject
 *     not found: <id>" — the 086 hard subject isolation)
 *   KnowledgeForbiddenError  → 403 forbidden   ("this class belongs to
 *     another teacher")
 *   SeedConflictError        → 409 conflict    ("… resolve manually, never
 *     re-seed over it" — the concept-seed loud conflict)
 *   everything else → falls through to the app-level 500 boundary.
 *
 * Wire schemas: ALL pre-ratified in @syllabai/contracts — knowledge.ts
 * (nodeViewSchema, prerequisiteViewSchema, classNodeStudentsViewSchema)
 * and teacher.ts (conceptGraphEdgesViewSchema, seedSummarySchema,
 * topicDrillDownViewSchema) + learner.ts (learnerKnowledgeGraphViewSchema
 * for the class-served F-034 view). The service views are wire-ready (the
 * 053 ports render Instant as ISO, node keys frozen-camelCase) — the route
 * serializes by returning the view, and the tests parse against the
 * canonical schemas. ZERO new wire in this band.
 *
 * Scope honesty (the census artifacts, disclosed NOT silently dropped):
 *   - the F-072 heatmap leg GET /api/v1/teacher/classes/{classId}/
 *     knowledge-graph (classGraph, graphs.ts :435 — hub
 *     teacherClassKnowledgeGraph :776-779) is ported and hub-called but is
 *     in NO card of the filed band (the r4b census's ClassKnowledgeGraph
 *     family listing swapped it out for the class-intelligence drill-down).
 *     This module deliberately mounts EXACTLY the 9 card endpoints; the
 *     heatmap leg is reported as a residual for a card amendment / R0
 *     ruling, never mounted beyond the claim of record.
 *   - the sibling class-intelligence reads GET /api/v1/teacher/class
 *     /overview?rootId= and /learners?rootId= (classOverview/classLearners,
 *     analytics.ts :830+) are likewise in no card — left unmounted.
 *   - teaching coverage (T-MIG-087's own band) stays OUT per the
 *     classroom.ts/learnerkg.ts headers' history claims.
 *
 * Mount (proposed — index.ts is OUT OF FENCE for this band, the 010/020/
 * 031/032/041/043/052/060/061/062/069 precedent: the import + construction
 * + four mount lines ship as the minimal app-level wiring so R0 can
 * ratify or lift them out at review; register AFTER the classroom mount
 * lines so the existing order is untouched — both shells are the same
 * TEACHER/ADMIN gate, and Hono resolves per router so the two routers at
 * the /api/v1/teacher/classes base never overlap on paths):
 *     import { buildKnowledgeFamilyRouters } from "./routes/knowledgefamily";
 *     const knowledgeFamily = buildKnowledgeFamilyRouters();
 *     app.route("/api/v1/knowledge", knowledgeFamily.knowledgeRoute);
 *     app.route("/api/v1/teacher/concept-graph", knowledgeFamily.conceptGraphRoute);
 *     app.route("/api/v1/teacher/classes", knowledgeFamily.classKgRoute);
 *     app.route("/api/v1/teacher/class", knowledgeFamily.classDrillDownRoute);
 *
 * Determinism (ADR-031): the KG/analytics services derive `now` from the
 * ONE injected clock anchor per call; production keeps the fresh
 * per-request clock, the composition root threads opts.now.
 */
import { Hono } from "hono";
import { requireAuth, requireRole } from "../middleware/auth";
import { apiError } from "../services/identity/errors";
import { requireDatabaseUrl } from "@syllabai/db";
import { createSql, type SqlFn } from "../services/identity/users";
import {
  KnowledgeForbiddenError,
  KnowledgeNotFoundError,
  knowledgeMisconceptions,
  knowledgeNode,
  knowledgePrerequisites,
  knowledgeTree,
} from "../services/knowledge";
import {
  classLearnerKnowledgeGraph,
  classNodeStudents,
  type ClassGraphDeps,
} from "../services/knowledge";
import {
  activateConceptGraph,
  SeedConflictError,
  teacherConceptEdges,
  topicDrillDown,
  type AnalyticsDeps,
} from "../services/teacher";
import { BadRequestError } from "../services/selfmark";

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** @PathVariable UUID conversion parity (MethodArgumentTypeMismatch → 400
 *  bad_request "malformed request", GlobalExceptionHandler :167-170; the
 *  classroom.ts parseUuid law — BadRequestError is the fleet's 400 family). */
function parseUuid(raw: string): string {
  if (!UUID_RE.test(raw)) {
    throw new BadRequestError("malformed request");
  }
  return raw;
}

/** The route-owned transaction seam for the seed (the sme.ts R-TX shape). */
export type TransactionSeam = <T>(body: (tx: SqlFn) => Promise<T>) => Promise<T>;

/** T-MIG-085 activate deps — the seed runs inside ONE caller transaction. */
export interface ConceptSeedDeps {
  sql: SqlFn;
  clock: { newId: () => string; now: () => Date };
  transaction: TransactionSeam;
}

/** The family's deps — all structurally {sql, clock} (the 053 KnowledgeDeps
 *  shape; engine params stay the ports' paper defaults). */
export interface KnowledgeFamilyDeps {
  knowledge: { sql: SqlFn; clock: { newId: () => string; now: () => Date } };
  conceptEdges: { sql: SqlFn; clock: { newId: () => string; now: () => Date } };
  conceptSeed: ConceptSeedDeps;
  classGraph: ClassGraphDeps;
  analytics: AnalyticsDeps;
}

/**
 * The shared error mapping (the frozen handler law): the two 404/403
 * classes + the seed's 409 verbatim — everything else falls through to the
 * app-level 500 boundary, never guessed here.
 */
function mapErrors(
  e: unknown,
  c: { json: (b: unknown, s: number) => Response },
): Response | null {
  if (e instanceof KnowledgeNotFoundError) return c.json(apiError(404, "not_found", e.message), 404);
  if (e instanceof KnowledgeForbiddenError) return c.json(apiError(403, "forbidden", e.message), 403);
  if (e instanceof SeedConflictError) return c.json(apiError(409, "conflict", e.message), 409);
  if (e instanceof BadRequestError) return c.json(apiError(400, "bad_request", e.message), 400);
  return null;
}

// ── T-MIG-084 — KnowledgeController (mounted at /api/v1/knowledge) ──────────

/**
 * The global knowledge-tree router. Authenticated shell (SecurityConfig :91
 * anyRequest().authenticated() parity — no specific matcher for the
 * prefix); read-only over the knowledge spine, no per-user gates.
 */
export function createKnowledgeRouter(
  deps: { sql: SqlFn; clock: { newId: () => string; now: () => Date } },
): Hono {
  const r = new Hono();

  r.onError((err, c) => {
    const mapped = mapErrors(err, c);
    if (mapped) return mapped;
    throw err;
  });

  // Authz shell (SecurityConfig :91 parity): anonymous callers get the Boot
  // 401 body BEFORE any path/param work.
  r.use("*", async (c, next) => {
    const gate = requireAuth(c);
    if (gate instanceof Response) return gate;
    await next();
  });

  // GET /nodes/:id (:20-24) → 200 NodeView (flat, children []) — 404-first
  r.get("/nodes/:id", async (c) => {
    const id = parseUuid(c.req.param("id"));
    return c.json(await knowledgeNode(deps, id), 200);
  });

  // GET /nodes/:id/misconceptions (:140-143) → 200 NodeView[] — the topic
  // node is 404-first; sources pass through in edge-query order.
  r.get("/nodes/:id/misconceptions", async (c) => {
    const id = parseUuid(c.req.param("id"));
    return c.json(await knowledgeMisconceptions(deps, id), 200);
  });

  // GET /nodes/:id/prerequisites (:119-122) → 200 PrerequisiteView[] — the
  // closure CTE, deepest first then node id (the remediation walk-back).
  r.get("/nodes/:id/prerequisites", async (c) => {
    const id = parseUuid(c.req.param("id"));
    return c.json(await knowledgePrerequisites(deps, id), 200);
  });

  // GET /nodes/:id/tree?includeMisconceptions= (:63-69 + :278-345) → 200
  // NodeView — the PART_OF subtree with the optional misconception fold.
  // Param law: optional, default TRUE (hub api.ts :485); Spring's
  // StringToBooleanConverter vocabulary; a conversion failure is the
  // MethodArgumentTypeMismatch 400 (:167-170).
  r.get("/nodes/:id/tree", async (c) => {
    const id = parseUuid(c.req.param("id"));
    const raw = c.req.query("includeMisconceptions");
    let include = true;
    if (raw !== undefined) {
      const v = raw.trim().toLowerCase();
      if (v === "true" || v === "on" || v === "yes" || v === "1") include = true;
      else if (v === "false" || v === "off" || v === "no" || v === "0") include = false;
      else return c.json(apiError(400, "bad_request", "malformed request"), 400);
    }
    return c.json(await knowledgeTree(deps, id, include), 200);
  });

  return r;
}

// ── T-MIG-085 — TeacherConceptGraph (mounted at /api/v1/teacher/concept-graph)

/**
 * The teacher concept-graph router. TEACHER/ADMIN shell (SecurityConfig :87
 * — /api/v1/teacher/** parity); the read model's root 404 and the seed's
 * loud 409 are service law.
 */
export function createConceptGraphRouter(deps: {
  edges: { sql: SqlFn; clock: { newId: () => string; now: () => Date } };
  seed: ConceptSeedDeps;
}): Hono {
  const r = new Hono();

  r.onError((err, c) => {
    const mapped = mapErrors(err, c);
    if (mapped) return mapped;
    throw err;
  });

  // Authz shell (SecurityConfig :87 parity).
  r.use("*", async (c, next) => {
    const gate = requireRole(c, "TEACHER", "ADMIN");
    if (gate instanceof Response) return gate;
    await next();
  });

  // GET /edges?rootId= (:87-103) → 200 ConceptGraphEdgesView — rootId is a
  // required UUID (checked in that order, the learnerkg param law); the
  // 404-first root read is the service's (teacherConceptEdges).
  r.get("/edges", async (c) => {
    const rawRootId = c.req.query("rootId");
    if (rawRootId === undefined) {
      return c.json(apiError(400, "validation_failed", "missing required parameter: rootId"), 400);
    }
    if (!UUID_RE.test(rawRootId)) {
      return c.json(apiError(400, "bad_request", "malformed request"), 400);
    }
    return c.json(await teacherConceptEdges(deps.edges, rawRootId), 200);
  });

  // POST /activate (:66) → 200 SeedSummary — the idempotent 4CH1 seed, run
  // in ONE transaction on the injected seam (concept-seed.ts :153-156: the
  // frozen @Transactional — the route layer owns the boundary). Report-
  // shaped 200, not 201 (the sme.ts :34 precedent). SeedConflictError →
  // 409 with the service's verbatim message. The frozen controller reads
  // no body — an incoming body is ignored exactly as Spring ignores it.
  r.post("/activate", async (c) => {
    const gate = requireRole(c, "TEACHER", "ADMIN");
    if (gate instanceof Response) return gate;
    const summary = await deps.seed.transaction((tx) =>
      activateConceptGraph({ sql: tx, clock: deps.seed.clock }, gate.userId),
    );
    return c.json(summary, 200);
  });

  return r;
}

// ── T-MIG-086 — the class-scoped KG band (mounted at /api/v1/teacher/classes
// ── and /api/v1/teacher/class — two bases, one family, per the callers)

/**
 * The class-scoped KG router (the two /classes/{classId} surfaces). Mounted
 * at "/api/v1/teacher/classes" — the SAME base as classroom.ts's
 * teacher-classes router; the two routers never overlap on paths (the
 * classroom router owns the 1-segment/:id CRUD forms, this router owns the
 * multi-segment KG forms) and both carry the identical TEACHER/ADMIN
 * shell, so registration order is behavior-neutral. TEACHER/ADMIN shell
 * (:87); the §17 gate chain (404 class → 403 ownership → 404 root/node)
 * and the membership privacy boundary are service law.
 */
export function createClassKgRouter(deps: ClassGraphDeps): Hono {
  const r = new Hono();

  r.onError((err, c) => {
    const mapped = mapErrors(err, c);
    if (mapped) return mapped;
    throw err;
  });

  // Authz shell (SecurityConfig :87 parity).
  r.use("*", async (c, next) => {
    const gate = requireRole(c, "TEACHER", "ADMIN");
    if (gate instanceof Response) return gate;
    await next();
  });

  // GET /:classId/knowledge-graph/nodes/:nodeId/students?rootId=
  // (hub teacherClassNodeStudents :785-788) → 200 ClassNodeStudentsView —
  // §13.5: the heatmap node's affected students at student grain. Gate
  // ORDER (graphs.ts :22-27): class 404 → ownership 403 → the root's
  // 404-first tree read → the node's subject-isolation 404.
  r.get("/:classId/knowledge-graph/nodes/:nodeId/students", async (c) => {
    const gate = requireRole(c, "TEACHER", "ADMIN");
    if (gate instanceof Response) return gate;
    const classId = parseUuid(c.req.param("classId"));
    const nodeId = parseUuid(c.req.param("nodeId"));
    const rawRootId = c.req.query("rootId");
    if (rawRootId === undefined) {
      return c.json(apiError(400, "validation_failed", "missing required parameter: rootId"), 400);
    }
    if (!UUID_RE.test(rawRootId)) {
      return c.json(apiError(400, "bad_request", "malformed request"), 400);
    }
    return c.json(await classNodeStudents(deps, gate.userId, classId, rawRootId, nodeId), 200);
  });

  // GET /:classId/learners/:learnerId/knowledge-graph?rootId=
  // (hub teacherClassLearnerKnowledgeGraph :793-800) → 200
  // LearnerKnowledgeGraphView — ONE student's subject graph through the
  // SAME F-034 read model the student sees (the one-graph-implementation
  // law); a non-member learner is the service's 404 (the privacy boundary
  // short-circuits BEFORE any user lookup).
  r.get("/:classId/learners/:learnerId/knowledge-graph", async (c) => {
    const gate = requireRole(c, "TEACHER", "ADMIN");
    if (gate instanceof Response) return gate;
    const classId = parseUuid(c.req.param("classId"));
    const learnerId = parseUuid(c.req.param("learnerId"));
    const rawRootId = c.req.query("rootId");
    if (rawRootId === undefined) {
      return c.json(apiError(400, "validation_failed", "missing required parameter: rootId"), 400);
    }
    if (!UUID_RE.test(rawRootId)) {
      return c.json(apiError(400, "bad_request", "malformed request"), 400);
    }
    return c.json(
      await classLearnerKnowledgeGraph(deps, gate.userId, classId, learnerId, rawRootId),
      200,
    );
  });

  return r;
}

/**
 * The class-intelligence drill-down router (the §5 surface). Mounted at
 * "/api/v1/teacher/class" SINGULAR — the frozen ClassAnalyticsController's
 * @RequestMapping (analytics.ts :5-6), which the hub caller emits verbatim
 * (api.ts :1031). The service takes NO classId (analytics.ts :31-35: the
 * surface predates class scoping — rootId subject isolation only). A
 * /classes/{classId}/topics/... mount would be an invented shape.
 */
export function createClassDrillDownRouter(deps: AnalyticsDeps): Hono {
  const r = new Hono();

  r.onError((err, c) => {
    const mapped = mapErrors(err, c);
    if (mapped) return mapped;
    throw err;
  });

  // Authz shell (SecurityConfig :87 parity — the base sits under
  // /api/v1/teacher/**).
  r.use("*", async (c, next) => {
    const gate = requireRole(c, "TEACHER", "ADMIN");
    if (gate instanceof Response) return gate;
    await next();
  });

  // GET /topics/:nodeId/drill-down?rootId= (hub classTopicDrillDown
  // :1029-1032) → 200 TopicDrillDownView — §5: class → topic → learners →
  // evidence → intervention. The root 404 rides the tree read; a topic
  // outside the subtree is the hard-isolation 404 (analytics.ts :992-997).
  r.get("/topics/:nodeId/drill-down", async (c) => {
    const nodeId = parseUuid(c.req.param("nodeId"));
    const rawRootId = c.req.query("rootId");
    if (rawRootId === undefined) {
      return c.json(apiError(400, "validation_failed", "missing required parameter: rootId"), 400);
    }
    if (!UUID_RE.test(rawRootId)) {
      return c.json(apiError(400, "bad_request", "malformed request"), 400);
    }
    return c.json(await topicDrillDown(deps, rawRootId, nodeId), 200);
  });

  return r;
}

/**
 * Module + router composition for the app root — the buildClassroomRouters
 * shape (env → requireDatabaseUrl → createSql adapter; the structural SqlFn
 * keeps every service driver-agnostic through the T-MIG-014 dispatch). ONE
 * sql + ONE clock shared across the four routers; the seed additionally
 * gets the adapter's transaction seam (begin/commit/rollback). opts.now
 * injects the clock (determinism law); production default is the fresh
 * per-request clock.
 */
export function buildKnowledgeFamilyRouters(
  env: Record<string, string | undefined> = process.env,
  opts: { now?: () => Date } = {},
) {
  const databaseUrl = requireDatabaseUrl(env as { DATABASE_URL?: string });
  const sql = createSql(databaseUrl);
  const clock = {
    newId: () => crypto.randomUUID(),
    now: opts.now ?? (() => new Date()),
  };
  const shared = { sql, clock };
  return {
    knowledgeRoute: createKnowledgeRouter(shared),
    conceptGraphRoute: createConceptGraphRouter({
      edges: shared,
      seed: { ...shared, transaction: sql.transaction.bind(sql) },
    }),
    classKgRoute: createClassKgRouter(shared),
    classDrillDownRoute: createClassDrillDownRouter(shared),
  };
}

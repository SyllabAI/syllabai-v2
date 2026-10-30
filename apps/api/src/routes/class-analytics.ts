/**
 * Class-analytics route factories — path parity with the frozen Java core
 * (syllabai-core @ 6cad6ef, T-MIG-053 tranche-2 header; verified 2026-10-30):
 *   ClassAnalyticsController  @RequestMapping("/api/v1/teacher/class")
 *     (:27-71)
 *     GET /overview                     (rootId)
 *     GET /learners                     (rootId)
 *     GET /topics/{nodeId}/drill-down   (rootId)
 *
 * MOUNT HISTORY (this lane): the T-MIG-053 tranche-2 doctrine shipped
 * contracts+services+fakeSql pins with NO routes/mounts — the routes
 * tranche was deliberately left as its own lane. CD-A run-001 (trace
 * 1a18c0171724f5ed) then disclosed the consequence: the hub Class
 * Intelligence page (apps/hub/src/app/teacher/class/class-client.tsx)
 * emits api.classOverview / api.classLearners / api.classTopicDrillDown
 * against exactly this family since the teacher-console tranche
 * (2026-09-28), and no /api/v1/teacher/class mount existed — the dark
 * path. This router closes it: the views are the T-MIG-053 tranche-2
 * services (classOverview / classLearners / topicDrillDown) serialized
 * VERBATIM — zero route-level reshaping, zero new reads, zero new
 * parameters (the C6 posture: the engine inside is the frozen
 * LEARNER_ENGINE_PAPER_DEFAULTS + CONFIG 0.45/2 via engineOf — the same
 * tuning the learner-facing surfaces use).
 *
 * Route security (SecurityConfig /api/v1/teacher/** rule): hasAnyRole
 * ('TEACHER','ADMIN') — the authz shell runs before every handler (the
 * M5 defense-in-depth, the teacher-kg.ts shape: a router-level shell AND
 * the per-handler gate; Boot 401/403 bodies via requireRole).
 *
 * Query binding law (frozen GlobalExceptionHandler.java — the T-MIG-034
 * testbuilder + teacher-kg parity, the captured envelopes):
 *   - rootId is a @RequestParam UUID on all three GETs → missing → 400
 *     validation_failed "missing required parameter: rootId"
 *     (MissingServletRequestParameterException :185-190); value present
 *     but malformed → 400 bad_request "malformed request"
 *     (MethodArgumentTypeMismatchException :167-170); "" behaves as
 *     ABSENT for non-String types (Spring binding parity, inferred,
 *     uncaptured).
 *   - {nodeId} is a @PathVariable UUID on the drill-down → malformed →
 *     400 bad_request "malformed request", checked IN-PATH BEFORE the
 *     rootId law (the frozen signature order: path params → query
 *     params — the teacher-kg.ts header law).
 *
 * Error envelopes (the frozen handler law, mapped locally — everything
 * else falls to the app-level 500 boundary, never guessed):
 *   KnowledgeNotFoundError → 404 not_found. Both 404 bodies are
 *   service-owned and ride the wire verbatim:
 *     - the unknown root 404 is the tree read's 404-first
 *       ("knowledge node <rootId> not found");
 *     - the drill-down subject isolation is the §5 hard gate ("curriculum
 *       topic in this subject not found: <nodeId>") — a topic outside the
 *       root's subtree is never a silent cross-subject hop.
 *
 * SCOPE HONESTY (the T-MIG-053 tranche-2 roster law): this surface
 * predates class scoping — there is NO classId parameter and NO
 * class-membership filter (unlike the F-072 heatmap trio); the roster is
 * ALL enabled STUDENTS (`users.findEnabledByRole(STUDENT)`). No
 * ownership gate exists to run here — the router carries only the
 * role shell.
 */
import { Hono } from "hono";
import { requireDatabaseUrl } from "@syllabai/db";
import { requireRole } from "../middleware/auth";
import { apiError } from "../services/identity/errors";
import { createSql } from "../services/identity/users";
import { KnowledgeNotFoundError } from "../services/knowledge";
import type { KnowledgeDeps } from "../services/knowledge";
import {
  classLearners,
  classOverview,
  topicDrillDown,
  type AnalyticsDeps,
} from "../services/teacher/analytics";

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** MethodArgumentTypeMismatchException handler body (:167-170) — verbatim. */
const malformedRequest = () => apiError(400, "bad_request", "malformed request");

/** MissingServletRequestParameterException handler body (:185-190) — verbatim shape, param name interpolated. */
const missingParam = (name: string) =>
  apiError(400, "validation_failed", `missing required parameter: ${name}`);

/**
 * The required rootId binding law, shared by all three GETs: absent or ""
 * → the captured validation_failed envelope; a non-UUID value → the
 * type-mismatch envelope; a valid value → returned.
 */
function bindRootId(
  raw: string | undefined,
): { value: string; error: null } | { value: null; error: ReturnType<typeof apiError> } {
  if (raw === undefined || raw === "") {
    return { value: null, error: missingParam("rootId") };
  }
  if (!UUID_RE.test(raw)) {
    return { value: null, error: malformedRequest() };
  }
  return { value: raw, error: null };
}

export function createClassAnalyticsRouter(deps: AnalyticsDeps): Hono {
  const r = new Hono();

  // Authz shell (SecurityConfig /api/v1/teacher/** — the M5 defense-in-
  // depth, scoped to this router only; the teacher-kg.ts shape).
  r.use("*", async (c, next) => {
    const gate = requireRole(c, "TEACHER", "ADMIN");
    if (gate instanceof Response) return gate;
    await next();
  });

  // GET /overview (:27-41) — the §2 class overview VERBATIM.
  r.get("/overview", async (c) => {
    const gate = requireRole(c, "TEACHER", "ADMIN");
    if (gate instanceof Response) return gate;

    const rootId = bindRootId(c.req.query("rootId"));
    if (rootId.error) return c.json(rootId.error, 400);

    try {
      return c.json(await classOverview(deps, rootId.value!), 200);
    } catch (e) {
      if (e instanceof KnowledgeNotFoundError) {
        return c.json(apiError(404, "not_found", e.message), 404);
      }
      throw e;
    }
  });

  // GET /learners (:43-56) — the §2 evidence-separated learner rows VERBATIM.
  r.get("/learners", async (c) => {
    const gate = requireRole(c, "TEACHER", "ADMIN");
    if (gate instanceof Response) return gate;

    const rootId = bindRootId(c.req.query("rootId"));
    if (rootId.error) return c.json(rootId.error, 400);

    try {
      return c.json(await classLearners(deps, rootId.value!), 200);
    } catch (e) {
      if (e instanceof KnowledgeNotFoundError) {
        return c.json(apiError(404, "not_found", e.message), 404);
      }
      throw e;
    }
  });

  // GET /topics/{nodeId}/drill-down (:58-71) — the §5 intervention view
  // VERBATIM. The path param binds FIRST (frozen signature order: path
  // params → rootId), before any sql.
  r.get("/topics/:nodeId/drill-down", async (c) => {
    const gate = requireRole(c, "TEACHER", "ADMIN");
    if (gate instanceof Response) return gate;

    const nodeId = c.req.param("nodeId");
    if (!UUID_RE.test(nodeId)) {
      return c.json(malformedRequest(), 400);
    }

    const rootId = bindRootId(c.req.query("rootId"));
    if (rootId.error) return c.json(rootId.error, 400);

    try {
      return c.json(await topicDrillDown(deps, rootId.value!, nodeId), 200);
    } catch (e) {
      if (e instanceof KnowledgeNotFoundError) {
        return c.json(apiError(404, "not_found", e.message), 404);
      }
      throw e;
    }
  });

  return r;
}

/**
 * Module + router composition for the app root — the buildTeacherKgRouters
 * shape exactly (env → requireDatabaseUrl → createSql; ONE sql client; the
 * clock is the ADR-031 anchor holder, `opts.now` injects it for the
 * determinism law; production default is the fresh per-request clock). The
 * engine stays UNSET — engineOf falls to the frozen defaults
 * (LEARNER_ENGINE_PAPER_DEFAULTS + CONFIG 0.45/2), the C6 posture: no
 * teacher-specific tuning exists anywhere on this surface.
 */
export function buildClassAnalyticsRouters(
  env: Record<string, string | undefined> = process.env,
  opts: { now?: () => Date } = {},
): { classAnalyticsRoute: Hono } {
  const databaseUrl = requireDatabaseUrl(env as { DATABASE_URL?: string });
  const sql = createSql(databaseUrl);
  const deps: KnowledgeDeps = {
    sql,
    clock: {
      newId: () => crypto.randomUUID(),
      now: opts.now ?? (() => new Date()),
    },
  };
  return { classAnalyticsRoute: createClassAnalyticsRouter(deps) };
}

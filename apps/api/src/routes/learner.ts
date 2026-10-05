/**
 * Learner state-model route factory (T-MIG-041 tranche-2) — path parity with
 * the frozen Java core @ 6cad6ef:
 *   LearnerStateController  GET /api/v1/learners/me/state        (9-leg composite read)
 *   CourseStatsController   GET /api/v1/learners/me/course-stats (4-count distinct-coverage read)
 *
 * Route security (SecurityConfig.java:91): no role restriction and no
 * specific matcher on the learner /me read cluster → anyRequest().authenticated();
 * the auth shell runs before every handler (captured w4-state-unauthed-401 /
 * w4-state-empty-bearer-401 / w4-course-stats-unauthed-401 Boot 401
 * envelope). Identity is the bearer subject: both controllers read the
 * CURRENT user (learnerId = auth.userId) — no path variable, no query
 * params on either surface (the captured w4-*-practiced-200 requests carry
 * none, and the tranche-1 builder signatures take exactly learnerId [+ now]).
 *
 * Read-time determinism (ADR-031): `now` is injected PER REQUEST — every
 * decay/relaxation/staleness value is recomputed at read time, never
 * persisted; the w4-state-* golden tranche tolerates exactly those wire
 * fields. Engine parameters default to the paper values inside
 * buildLearnerModule; the model_versions registry override path
 * (LearnerProperties normalization) is tranche-3 and stays out of the route
 * layer.
 *
 * No body, no query binding → the two-envelope write law (R0 intake fix
 * R-1) does not apply to these surfaces. Error parity: there is NO
 * service-level 4xx class here (an empty learner is the captured
 * w4-state-empty-200 / w4-course-stats-empty-200 posture, not a 404); repo
 * failures fall through to the app error boundary (opaque 500,
 * GlobalExceptionHandler :224-230 parity).
 *
 * DOCTRINE: read-time values are ADR-031-tolerated in the golden tranche;
 * the structural wire shapes are the #60 contracts (learnerStateViewSchema /
 * courseStatsViewSchema — type-level here; response bodies are not
 * re-validated at runtime, matching the 033/034 route precedent).
 */
import { Hono } from "hono";
import { buildLearnerModule } from "../services/learner";
import { requireDatabaseUrl } from "@syllabai/db";
import { createSql } from "../services/identity/users";
import { requireAuth } from "../middleware/auth";

export function createLearnerRouter(module: ReturnType<typeof buildLearnerModule>) {
  const r = new Hono();

  // GET /api/v1/learners/me/state — LearnerStateController 9-leg composite
  // (skill states + read-time Ebbinghaus decay + misconception staleness
  // relaxation + review schedule + tutor engagement + rating/vote windows
  // + exam targets + enrolment counts). Empty learner → empty-200 (captured).
  r.get("/state", async (c) => {
    const auth = requireAuth(c);
    if (auth instanceof Response) return auth;
    const view = await module.learnerState(auth.userId, new Date());
    return c.json(view);
  });

  // GET /api/v1/learners/me/course-stats — CourseStatsController 4-count
  // distinct-coverage read. Empty learner → empty-200 (captured).
  r.get("/course-stats", async (c) => {
    const auth = requireAuth(c);
    if (auth instanceof Response) return auth;
    const view = await module.courseStats(auth.userId);
    return c.json(view);
  });

  return r;
}

/**
 * Live factory (same shape as the 033/034 route factories): one module per
 * process over the injected adapter; the router owns its authz shell
 * internally — the /api/v1/* fallback in index.ts stays the 404-after-auth
 * path for routes no router claimed.
 */
export function buildLearnerRouters(env: Record<string, string | undefined> = process.env) {
  const databaseUrl = requireDatabaseUrl(env as { DATABASE_URL?: string });
  const sql = createSql(databaseUrl);
  const module = buildLearnerModule(sql);
  return { module, learnerRoute: createLearnerRouter(module) };
}

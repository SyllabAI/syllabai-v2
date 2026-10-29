/**
 * Study-Plan Builder routers (spec §5.3 + roadmap Table 3 P2 row; prereg of
 * record docs/STUDY-PLAN-BUILDER-PLAN.md).
 *
 * DC-7-SPEC-NATIVE paths (the same posture as routes/learner/progress.ts —
 * not a frozen-port band; the frozen learner-me paths stay owned by
 * routes/learner/index.ts):
 *   GET  /api/v1/learners/me/study-plan            (active plan + generated week)
 *   GET  /api/v1/learners/me/study-plan/defaults   (the three cheap defaults)
 *   PUT  /api/v1/learners/me/study-plan            (validated upsert, fresh week)
 *
 * Router posture verbatim: the authz shell answers BEFORE every handler
 * (anonymous callers get 401, never 404); the principal is
 * getAuth(c).userId; the clock is injected per the ADR-031 determinism law.
 * Write surface of record: PUT persists ONLY the plan-config row (migration
 * 0012_study_plans) — every task completion state stays a query-time
 * projection over the DC-7 event rows (services/learner/study-plan.ts →
 * buildPlanProjection; the lane never stores progress).
 */
import { Hono } from "hono";
import { requireDatabaseUrl } from "@syllabai/db";
import { createSql } from "../../services/identity/users";
import { getAuth, requireAuth } from "../../middleware/auth";
import {
  buildStudyPlanPayload,
  getStudyPlanDefaults,
  loadStudyPlan,
  StudyPlanValidationError,
  upsertStudyPlan,
  type StudyPlanUpsertBody,
} from "../../services/learner/study-plan";

export function createLearnerStudyPlanRouter(
  sql: ReturnType<typeof createSql>,
  now: () => Date = () => new Date(),
): Hono {
  const r = new Hono();

  // authz shell FIRST (SecurityConfig anyRequest().authenticated() parity) —
  // the same gate posture as the learner routers next door.
  r.use("*", async (c, next) => {
    const gate = requireAuth(c);
    if (gate instanceof Response) return gate;
    await next();
  });

  // GET /api/v1/learners/me/study-plan — the active plan plus its generated
  // week (or { plan: null } when the learner has none yet; the builder is
  // the rail's Create Study Plan button).
  r.get("/study-plan", async (c) => {
    const auth = getAuth(c)!; // shell invariant: authenticated
    const t = now();
    const plan = await loadStudyPlan(sql, auth.userId);
    if (!plan) return c.json({ plan: null });
    return c.json(await buildStudyPlanPayload(sql, auth.userId, plan, t));
  });

  // GET /api/v1/learners/me/study-plan/defaults — the three cheap defaults:
  // registry courses (slug ASC, step 1 pre-selected), per-course exam
  // seasons (step 2, May/June vs Summer two years out), 120/0 minutes
  // (step 3).
  r.get("/study-plan/defaults", async (c) => {
    getAuth(c)!; // shell invariant: authenticated
    return c.json(await getStudyPlanDefaults(sql, now()));
  });

  // PUT /api/v1/learners/me/study-plan — create-or-replace (the observed
  // product's single plan; uq_study_plan_learner enforces ONE row per
  // learner). Validation failures are 400 with the reason (the DC-3
  // disclosure law's posture: the count and the reason at the gate).
  r.put("/study-plan", async (c) => {
    const auth = getAuth(c)!; // shell invariant: authenticated
    let body: StudyPlanUpsertBody;
    try {
      body = (await c.req.json()) as StudyPlanUpsertBody;
    } catch {
      return c.json({ error: "request body must be JSON" }, 400);
    }
    if (!body || !Array.isArray(body.courses)) {
      return c.json({ error: "courses must be an array of course slugs" }, 400);
    }
    const t = now();
    try {
      const plan = await upsertStudyPlan(sql, auth.userId, body, t);
      return c.json(await buildStudyPlanPayload(sql, auth.userId, plan, t));
    } catch (err) {
      if (err instanceof StudyPlanValidationError) {
        return c.json({ error: err.message }, 400);
      }
      throw err;
    }
  });

  return r;
}

/** Module + router composition for the app root — the buildLearnerRouters shape. */
export function buildLearnerStudyPlanRouters(
  env: Record<string, string | undefined> = process.env,
  opts: { now?: () => Date } = {},
) {
  const databaseUrl = requireDatabaseUrl(env as { DATABASE_URL?: string });
  const sql = createSql(databaseUrl);
  return {
    learnerStudyPlanRoute: createLearnerStudyPlanRouter(sql, opts.now ?? (() => new Date())),
  };
}

/**
 * DC-7 — Progress Attribution routers (spec §3.7; prereg of record
 * docs/DC7-PROGRESS-ATTRIBUTION-PLAN.md).
 *
 * DC-7-SPEC-NATIVE paths (not a frozen-port parity band — the frozen
 * learner-me paths are owned by routes/learner/index.ts under its
 * scope-honesty law; progress attribution is the spec's new surface):
 *   GET /api/v1/learners/me/progress?course=<slug>
 *   GET /api/v1/learners/me/plan-projection?course=<slug>
 *
 * Router posture is the createLearnerStateRouter shape of record verbatim:
 * the authz shell answers BEFORE every handler (anonymous callers get 401,
 * never 404); the principal is getAuth(c).userId (no learners indirection);
 * the clock is injected per the ADR-031 determinism law (production keeps
 * the fresh per-request clock; tests pin it). The rollup WRITES NOTHING —
 * both handlers are pure projections over the persisted event rows
 * (services/learner/progress-rollup.ts).
 */
import { Hono } from "hono";
import { requireDatabaseUrl } from "@syllabai/db";
import { createSql } from "../../services/identity/users";
import { getAuth, requireAuth } from "../../middleware/auth";
import {
  buildPlanProjection,
  buildProgressProjection,
} from "../../services/learner/progress-rollup";

export function createLearnerProgressRouter(
  sql: ReturnType<typeof createSql>,
  now: () => Date = () => new Date(),
): Hono {
  const r = new Hono();

  // authz shell FIRST (SecurityConfig anyRequest().authenticated() parity) —
  // the same gate posture as the frozen-parity learner routers next door.
  r.use("*", async (c, next) => {
    const gate = requireAuth(c);
    if (gate instanceof Response) return gate;
    await next();
  });

  // GET /api/v1/learners/me/progress?course=<slug> — the event→projection
  // rollup: three display levels (leaf binary, subtopic fraction, topic
  // fraction) with separate notes|questions dimensions, keyed by the
  // curriculum codes the spec tree renders verbatim, plus the day-scoped
  // `today` counter block every display consumer shares.
  r.get("/progress", async (c) => {
    const auth = getAuth(c)!; // shell invariant: authenticated
    const course = c.req.query("course");
    if (!course) return c.json({ error: "course query parameter is required" }, 400);
    const projection = await buildProgressProjection(sql, auth.userId, course, now());
    return c.json(projection);
  });

  // GET /api/v1/learners/me/plan-projection?course=<slug> — the study
  // plan's subscription to the SAME rollup: per-task-type threshold
  // decisions (REVISE flips on the note check; PRACTISE flips at five
  // marked parts — the spec's proposed default, PROGRESS_PLAN_THRESHOLD_
  // PRACTISE) plus the same `today` block (acceptance (c) by construction).
  r.get("/plan-projection", async (c) => {
    const auth = getAuth(c)!; // shell invariant: authenticated
    const course = c.req.query("course");
    if (!course) return c.json({ error: "course query parameter is required" }, 400);
    const projection = await buildPlanProjection(sql, auth.userId, course, now());
    return c.json(projection);
  });

  return r;
}

/** Module + router composition for the app root — the buildLearnerRouters shape. */
export function buildLearnerProgressRouters(
  env: Record<string, string | undefined> = process.env,
  opts: { now?: () => Date } = {},
) {
  const databaseUrl = requireDatabaseUrl(env as { DATABASE_URL?: string });
  const sql = createSql(databaseUrl);
  return {
    learnerProgressRoute: createLearnerProgressRouter(sql, opts.now ?? (() => new Date())),
  };
}

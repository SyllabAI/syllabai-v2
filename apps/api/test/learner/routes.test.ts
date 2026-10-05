/**
 * Learner state-model ROUTE tests (T-MIG-041 tranche-2) — the observable
 * HTTP contract of LearnerStateController + CourseStatsController
 * (@ 6cad6ef) over a FAKE module (service internals were tranche-1's tested
 * surface; this file pins the route layer: anyRequest().authenticated()
 * shell with the Boot 401 envelope, bearer-identity scoping, per-request
 * `now` injection (ADR-031), status codes + delegation).
 */
import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { createLearnerRouter } from "../../src/routes/learner";
import type { buildLearnerModule } from "../../src/services/learner";
import { bootErrorBody } from "../../src/middleware/auth";

const LEARNER_ID = "60000000-0000-4000-8000-000000000001";

/** Auth contexts (roles drive the shell: anyRequest().authenticated()). */
function authFor(roles: string[] | null, userId = LEARNER_ID) {
  return roles === null
    ? null
    : { email: "u@example.invalid", userId, roles, tokenVersion: 0 };
}

/** The route harness: auth injector + the router over a fake module. */
function boot(opts: { roles?: string[] | null; userId?: string } = {}) {
  const calls: Record<string, unknown[][]> = {};
  const fake = (name: string, ret: unknown = {}) => async (...args: unknown[]) => {
    (calls[name] ??= []).push(args);
    return ret;
  };
  const module = {
    learnerState: fake("learnerState", { skillStates: [], misconceptions: [] }),
    courseStats: fake("courseStats", { courses: 2, attempts: 5, masteryMean: 0.5, coverage: 0.25 }),
  } as unknown as ReturnType<typeof buildLearnerModule>;
  const router = createLearnerRouter(module);
  const app = new Hono();
  app.use("*", async (c, next) => {
    const a = authFor(opts.roles ?? null, opts.userId);
    if (a) c.set("syllabai.auth" as never, a as never);
    await next();
  });
  app.route("/", router);
  return { app, calls };
}

// ── shell: anyRequest().authenticated() (captured w4-*-unauthed-401) ────────

describe("learner route shell", () => {
  test("both surfaces answer the Boot 401 envelope for anonymous callers", async () => {
    for (const path of ["/state", "/course-stats"]) {
      const { app } = boot({ roles: null });
      const res = await app.request(path);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Unauthorized");
      expect(body.path).toBe(path);
    }
  });

  test("authenticated callers of ANY role pass the shell (no role gate on /me reads)", async () => {
    for (const roles of [["LEARNER"], ["TEACHER"], ["ADMIN"]]) {
      const { app, calls } = boot({ roles });
      const res = await app.request("/state");
      expect(res.status).toBe(200);
      expect(calls.learnerState).toHaveLength(1);
    }
  });
});

// ── GET /state (LearnerStateController 9-leg composite) ─────────────────────

describe("GET /state", () => {
  test("200 + delegates with bearer identity and a per-request now (ADR-031)", async () => {
    const { app, calls } = boot({ roles: ["LEARNER"] });
    const res = await app.request("/state");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ skillStates: [], misconceptions: [] });
    expect(calls.learnerState).toHaveLength(1);
    const [learnerId, now] = calls.learnerState![0] as [string, Date];
    expect(learnerId).toBe(LEARNER_ID);
    expect(now).toBeInstanceOf(Date);
    // ADR-031: now is injected per call — the route must NOT cache it at
    // module scope; each request re-derives the clock (monotonic here; the
    // wall clock can legitimately repeat within one millisecond, so the pin
    // is monotonicity, not strict increase).
    await app.request("/state");
    const [, now1] = calls.learnerState![0] as [string, Date];
    const [, now2] = calls.learnerState![1] as [string, Date];
    expect(now1).toBeInstanceOf(Date);
    expect(now2).toBeInstanceOf(Date);
    expect(now2.getTime()).toBeGreaterThanOrEqual(now1.getTime());
  });

  test("identity is the bearer subject, not a client-controllable param", async () => {
    const other = "61000000-0000-4000-8000-000000000002";
    const { app, calls } = boot({ roles: ["LEARNER"], userId: other });
    await app.request("/state");
    expect((calls.learnerState![0] as unknown[])[0]).toBe(other);
  });
});

// ── GET /course-stats (CourseStatsController 4-count read) ──────────────────

describe("GET /course-stats", () => {
  test("200 + delegates with bearer identity, view rendered verbatim", async () => {
    const { app, calls } = boot({ roles: ["LEARNER"] });
    const res = await app.request("/course-stats");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ courses: 2, attempts: 5, masteryMean: 0.5, coverage: 0.25 });
    expect(calls.courseStats).toHaveLength(1);
    expect((calls.courseStats![0] as unknown[])[0]).toBe(LEARNER_ID);
  });
});

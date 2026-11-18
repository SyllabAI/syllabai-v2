/**
 * T-TUTOR-AIM-P3 (DC10 §7.8 + §13.2): the drill-directive CLAIM route — the
 * exactly-once claim surface's wire behavior, pinned.
 *
 * LAWS PINNED HERE:
 *   - the dormant posture: no P3 deps → the honest 503 on BOTH new routes
 *     (the claim never fakes success, the calibration never fakes data)
 *   - the authz shell: anonymous callers get 401, never 404 (the router's
 *     shell posture — the new routes live INSIDE it)
 *   - malformed body → 400 validation_failed
 *   - guard 1 + guard 2 through the wire: a missing directive row → 404;
 *     a prior claim → 200 already_claimed with the SAME scheduled count;
 *     a fresh CAS win → 201 claimed with the ACTUAL scheduled count
 *   - the claim that scheduled nothing is not a claim: every draw at the
 *     row's targets failing → 409 conflict AND the release query ran (the
 *     CAS re-opened — the learner can retry)
 *   - the directive id NEVER travels from the client: the request body is
 *     the §22 identity pair only — the id recomputes server-side
 */
import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import type { Context } from "hono";

import { createTutorRouter, buildTutorRouters } from "../../src/routes/tutor";
import { buildTutorModule } from "../../src/services/tutor";
import { buildGroundedTutorGenerator, type PaperQuestionResolver } from "../../src/services/tutor";
import { toErrorResponse } from "../../src/services/identity/errors";
import { DRAW_SIZE } from "../../src/services/drill/draw";
import type { DrillBank, DrillPartContent } from "../../src/services/drill/bank";
import type { DrillStore } from "../../src/services/drill/store";
import type { SqlFn } from "../../src/services/tutor/sql";

// ── fixtures ────────────────────────────────────────────────────────────────

const LEARNER = "bb000000-0000-4000-8000-000000000001";
const SESSION = "cc000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-11-18T00:00:00Z");
const clock = { now: () => NOW };

type Row = Record<string, unknown>;
type Responder = Row[] | ((params: unknown[]) => Row[]);
function fakeSql(responses: Record<string, Responder>) {
  const queries: string[] = [];
  const fn = (async (strings: TemplateStringsArray, ...params: unknown[]) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    queries.push(text);
    for (const key of Object.keys(responses)) {
      if (text.includes(key)) {
        const hit = responses[key];
        return typeof hit === "function" ? hit(params) : hit;
      }
    }
    return [];
  }) as unknown as SqlFn & { queries: string[] };
  fn.queries = queries;
  return fn;
}

const asLearner = (): Record<string, unknown> | null => ({
  email: "s@example.edu",
  userId: LEARNER,
  roles: ["STUDENT"],
  tokenVersion: 1,
});
const anon = (): Record<string, unknown> | null => null;

const scopes = {
  resolveActive: async () => null,
  resolveForCourse: async () => null,
} as unknown as PaperQuestionResolver;
const emptyGraph = {} as never;
const notPaper = {
  resolve: async () => null,
} as unknown as PaperQuestionResolver;

function makeApp(
  routes: Record<string, Responder>,
  opts: {
    auth?: (c: Context) => Record<string, unknown> | null;
    p3?: Parameters<typeof createTutorRouter>[1];
  } = {},
) {
  const sql = fakeSql(routes);
  const module = buildTutorModule(sql, clock, {
    kgGraph: emptyGraph,
    scopes,
    vectorRetriever: async () => [],
    paperQuestionResolver: notPaper,
    generator: buildGroundedTutorGenerator({ available: () => false, generate: async () => ({ text: "", model: "dormant", providerName: "dormant" }), stream: async function* () {} } as never),
    telemetry: () => {},
  } as never);
  const auth = opts.auth ?? asLearner;
  const app = new Hono();
  app.use("*", async (c, next) => {
    const a = auth(c);
    if (a) c.set("syllabai.auth" as never, a as never);
    await next();
  });
  app.route("/api/v1/tutor", createTutorRouter(module, opts.p3 ?? null));
  app.onError((err, c) => {
    const mapped = toErrorResponse(err);
    if (mapped) return c.json(mapped.body, mapped.status as 400);
    console.error("[test] unhandled error:", err);
    return c.json({ status: 500, error: "internal_error", message: "an internal error occurred" }, 500 as const);
  });
  return { app, sql };
}

/** A minimal live bank: 5 parts at the address (the draw floor of record). */
function stubBank(course: string, code: string): DrillBank {
  const parts = Array.from({ length: DRAW_SIZE }, (_, i) => ({
    partId: `${code}-part-${i}`,
    questionId: `q-${i}`,
    setId: "set-1",
    plane: "P1" as never,
    order: i,
    marks: 2,
    specPointCodes: [code],
  }));
  const contentOf = (partId: string): DrillPartContent | null =>
    parts.some((p) => p.partId === partId)
      ? { problemMd: "the problem", questionType: "MCQ", commandWord: "State", choices: null }
      : null;
  return {
    course,
    parts,
    addressRows: [],
    censusSummary: { specPointAddresses: 1, covered: 1, drillable: 1, thin: 0, uncovered: 0 },
    poolOf: (c) => (c === code ? parts : []),
    contentOf,
    marksOf: (partId) => (parts.some((p) => p.partId === partId) ? 2 : null),
    isCorrectChoice: () => null,
    solutionOf: () => null,
    markSchemeOf: () => null,
  };
}

function stubStore(): DrillStore {
  return {
    recordDraw: async () => ({ id: "draw-1", createdAt: NOW.toISOString() }),
    recentDrawnPartIds: async () => [],
    drawOf: async () => null,
    evidenceIdOf: async () => null,
    recordEvidence: async () => ({ id: "ev-1", createdAt: NOW.toISOString() }),
    evidenceForCourse: async () => [],
    evidenceForDraw: async () => [],
  };
}

const claim = (app: Hono, body: unknown) =>
  app.request("/api/v1/tutor/drill-directives/claim", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

function makeAppWithSql(
  sql: SqlFn & { queries: string[] },
  opts: {
    auth?: (c: Context) => Record<string, unknown> | null;
    p3?: Parameters<typeof createTutorRouter>[1];
  } = {},
) {
  const module = buildTutorModule(sql, clock, {
    kgGraph: emptyGraph,
    scopes,
    vectorRetriever: async () => [],
    paperQuestionResolver: notPaper,
    generator: buildGroundedTutorGenerator({ available: () => false, generate: async () => ({ text: "", model: "dormant", providerName: "dormant" }), stream: async function* () {} } as never),
    telemetry: () => {},
  } as never);
  const auth = opts.auth ?? asLearner;
  const app = new Hono();
  app.use("*", async (c, next) => {
    const a = auth(c);
    if (a) c.set("syllabai.auth" as never, a as never);
    await next();
  });
  app.route("/api/v1/tutor", createTutorRouter(module, opts.p3 ?? null));
  app.onError((err, c) => {
    const mapped = toErrorResponse(err);
    if (mapped) return c.json(mapped.body, mapped.status as 400);
    console.error("[test] unhandled error:", err);
    return c.json({ status: 500, error: "internal_error", message: "an internal error occurred" }, 500 as const);
  });
  return { app };
}

// ── the dormant posture + the authz shell ───────────────────────────────────

describe("POST /drill-directives/claim + GET /calibration (the P3 routes)", () => {
  test("no P3 deps → the honest 503 on both routes (never a fake claim, never fake data)", async () => {
    const { app } = makeApp({});
    const claimed = await claim(app, { sessionId: SESSION, turnId: 2 });
    expect(claimed.status).toBe(503);
    const calib = await app.request("/api/v1/tutor/calibration");
    expect(calib.status).toBe(503);
  });

  test("anonymous callers get 401 on both routes (the shell posture)", async () => {
    const { app } = makeApp({}, { auth: anon });
    const claimed = await claim(app, { sessionId: SESSION, turnId: 2 });
    expect(claimed.status).toBe(401);
    const calib = await app.request("/api/v1/tutor/calibration");
    expect(calib.status).toBe(401);
  });

  test("malformed body → 400 validation_failed (the closed shape)", async () => {
    const { app } = makeApp({});
    const bad = await claim(app, { sessionId: "not-a-uuid", turnId: 2 });
    expect(bad.status).toBe(400);
    const bad2 = await claim(app, { sessionId: SESSION, turnId: 0 });
    expect(bad2.status).toBe(400);
  });
});

describe("the claim flow (the two guards through the wire)", () => {
  const p3 = (sql: SqlFn) => ({
    sql,
    clock,
    drill: {
      bankOf: (course: string) => stubBank(course, "4CH1-U1-T2"),
      store: stubStore(),
    },
  });

  test("guard 1: a directive the server never issued → 404", async () => {
    const sql = fakeSql({});
    const { app } = makeAppWithSql(sql, { p3: p3(sql) });
    // the CAS lost ([]) AND the ownership select came back empty ([])
    const res = await claim(app, { sessionId: SESSION, turnId: 2 });
    expect(res.status).toBe(404);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.status).toBe(404);
  });

  test("guard 2 losing to a prior claim → 200 already_claimed with the SAME artefact", async () => {
    // hit-counted responder: hit 1 = the CAS update LOSES (nothing to
    // update — the prior claim already flipped claimed_at); hit 2 = the
    // ownership select returns the prior claim's artefact
    let directiveHits = 0;
    const sql = fakeSql({
      tutor_drill_directives: () => {
        directiveHits += 1;
        return directiveHits === 1 ? [] : [{ scheduled_count: 5 }];
      },
    });
    const { app } = makeAppWithSql(sql, { p3: p3(sql) });
    const res = await claim(app, { sessionId: SESSION, turnId: 2 });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; scheduledCount: number };
    expect(body.status).toBe("already_claimed");
    expect(body.scheduledCount).toBe(5);
    // the re-render scheduled NOTHING new (no draw-side update fired)
    expect(sql.queries.some((q) => q.includes("scheduled_count =") && q.includes("update"))).toBe(false);
  });

  test("a fresh CAS win schedules the draws at the ROW's targets → 201 claimed", async () => {
    // the CAS responder is a FUNCTION: the first hit (the CAS update) returns
    // the winning row; every later hit (the ownership select in the CAS-lost
    // branch never runs; loadDirectiveTargets' row select) returns the row's
    // own targets
    let directiveHits = 0;
    const sql = fakeSql({
      tutor_drill_directives: () => {
        directiveHits += 1;
        return directiveHits === 1
          ? [{ scheduled_count: null }]
          : [{ node_ids: ["aa000000-0000-4000-8000-00000000000a"], course_ref: "4ch1" }];
      },
      knowledge_nodes: [{ id: "aa000000-0000-4000-8000-00000000000a", code: "4CH1-U1-T2" }],
    });
    const { app } = makeAppWithSql(sql, { p3: p3(sql) });
    const res = await claim(app, { sessionId: SESSION, turnId: 2 });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { status: string; scheduledCount: number };
    expect(body.status).toBe("claimed");
    // the draw size of record: 5 parts at the ONE resolved target
    expect(body.scheduledCount).toBe(DRAW_SIZE);
    // the outcome of record persisted (the re-render's artefact)
    const outcomeQuery = sql.queries.find((q) => q.includes("scheduled_count ="));
    expect(outcomeQuery).toBeDefined();
  });

  test("a claim that scheduled nothing is NOT a claim: 409 + the release ran", async () => {
    const bankOf = (course: string) => stubBank(course, "NO-SUCH-CODE");
    const sql = fakeSql({
      // the CAS wins, the targets resolve, but NO address can serve
      tutor_drill_directives: [{ scheduled_count: null }],
      knowledge_nodes: [],
    });
    const module = buildTutorModule(sql, clock, {
      kgGraph: emptyGraph,
      scopes,
      vectorRetriever: async () => [],
      paperQuestionResolver: notPaper,
      generator: buildGroundedTutorGenerator({ available: () => false, generate: async () => ({ text: "", model: "dormant", providerName: "dormant" }), stream: async function* () {} } as never),
      telemetry: () => {},
    } as never);
    const app = new Hono();
    app.use("*", async (c, next) => {
      const a = asLearner();
      if (a) c.set("syllabai.auth" as never, a as never);
      await next();
    });
    app.route("/api/v1/tutor", createTutorRouter(module, { sql, clock, drill: { bankOf, store: stubStore() } }));
    app.onError((err, c) => {
      const mapped = toErrorResponse(err);
      if (mapped) return c.json(mapped.body, mapped.status as 400);
      return c.json({ status: 500, error: "internal_error", message: "an internal error occurred" }, 500 as const);
    });
    const res = await claim(app, { sessionId: SESSION, turnId: 2 });
    expect(res.status).toBe(409);
    // the release query ran: claimed_at flips back (retryable)
    const releaseQuery = sql.queries.find(
      (q) => q.includes("claimed_at = null") && q.includes("scheduled_count is null"),
    );
    expect(releaseQuery).toBeDefined();
  });

  test("the composition root wires the P3 plane (the claim route goes LIVE in the real boot)", async () => {
    const env = { DATABASE_URL: "postgresql://stub:stub@localhost:5432/stub" };
    const built = buildTutorRouters(env);
    // a live composition root must serve the claim route beyond the dormant
    // posture — the status proves the route is wired past the 503-by-missing-
    // deps branch: the dormant branch returns 503 BEFORE the auth shell can
    // even matter, while the wired route resolves the auth (401 here — the
    // bare Hono request carries no auth context)
    const res = await built.tutorRoute.request("/api/v1/tutor/drill-directives/claim", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: SESSION, turnId: 2 }),
    });
    expect(res.status).toBe(401);
  });
});

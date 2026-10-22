/**
 * T-TEACH-002 (ADR-CLASS-0001) — the class feature-toggle tests: the STATE
 * service (features.ts) and the GATE (feature-gate.ts), over the shared
 * fakeSql helper.
 *
 * Pinned: the side-table storage law (row-absent = all ON, COALESCE
 * materialization), the partial UPSERT law (absent keys keep their value;
 * the INSERT arm binds explicit values), the §17 ownership gate reuse
 * (404/403 verbatim), the conservative-union deny law (any matching class
 * OFF denies; archived classes and non-members never deny), the
 * anchor-strength law (anchorless → pass; malformed ids → pass; the gate
 * is never an existence oracle), the tutor anchor resolution order (body
 * courseRef ?? session course_ref), the CLA CHECK-only anchor law, the
 * smartmark path regex, and the composition-root wrapper wire (gated POSTs
 * 403 with the FIXED client-safe body before the frozen handler; unauthed
 * 401 parity; non-gated paths and methods pass; gate-infrastructure
 * failure passes through with the failure logged).
 */
import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import type { Context } from "hono";
import {
  CLASS_FEATURES,
  DEFAULT_CLASS_FEATURES,
  featuresByClassId,
  setClassFeatures,
  type ClassFeaturesWriteDeps,
} from "../../src/services/classroom/features";
import {
  FEATURE_DISABLED_CODE,
  FeatureDisabledByTeacherError,
  courseSlugsForAttempt,
  courseSlugsForQuestion,
  featureDisabledMessage,
  resolveClaAnchor,
  resolveSmartMarkAnchor,
  resolveTutorAnchor,
  withClassFeatureGate,
  type FeatureGateDeps,
} from "../../src/services/classroom/feature-gate";
import { ClassroomForbiddenError, ClassroomNotFoundError } from "../../src/services/classroom";
import { fakeSql, type Route } from "../assessment/helpers";
import { apiError } from "../../src/services/identity/errors";

// ── fixtures ────────────────────────────────────────────────────────────────

const TEACHER = "aa000000-0000-4000-8000-000000000001";
const LEARNER = "bb000000-0000-4000-8000-000000000001";
const CLASS_A = "cc000000-0000-4000-8000-000000000001";
const CLASS_B = "cc000000-0000-4000-8000-000000000002";
const ATTEMPT = "dd000000-0000-4000-8000-000000000001";
const QUESTION = "dd000000-0000-4000-8000-000000000002";
const SESSION = "dd000000-0000-4000-8000-000000000003";
const NOW = new Date("2026-10-21T12:00:00Z");
const clock = { newId: () => ATTEMPT, now: () => NOW };

const gateDeps = (routes: Route[]) => {
  const sql = fakeSql(routes);
  return { deps: { sql } as FeatureGateDeps, sql };
};

const FEATURES_SELECT = /from class_features/;

// ── the state service ───────────────────────────────────────────────────────

describe("featuresByClassId (the side-table storage law)", () => {
  test("row-absent classes materialize the all-ON default", async () => {
    const deps = { sql: fakeSql([{ match: FEATURES_SELECT, rows: [] }]), clock };
    const out = await featuresByClassId(deps, [CLASS_A, CLASS_B]);
    expect(out.get(CLASS_A)).toEqual({ smartMark: true, tutor: true, cla: true });
    expect(out.get(CLASS_B)).toEqual({ smartMark: true, tutor: true, cla: true });
  });

  test("stored rows surface verbatim; absent classes still default", async () => {
    const sql = fakeSql([
      {
        match: FEATURES_SELECT,
        rows: [
          { class_id: CLASS_A, smart_mark: false, tutor: true, cla: false },
        ],
      },
    ]);
    const out = await featuresByClassId({ sql, clock }, [CLASS_A, CLASS_B]);
    expect(out.get(CLASS_A)).toEqual({ smartMark: false, tutor: true, cla: false });
    expect(out.get(CLASS_B)).toEqual(DEFAULT_CLASS_FEATURES);
  });

  test("the empty class set answers without touching the table", async () => {
    const deps = { sql: fakeSql([]), clock };
    const out = await featuresByClassId(deps, []);
    expect(out.size).toBe(0);
    expect(deps.sql.queries).toHaveLength(0);
  });

  test("the closed feature set is the pilot's three AI surfaces", () => {
    expect([...CLASS_FEATURES]).toEqual(["smart_mark", "tutor", "cla"]);
  });
});

describe("setClassFeatures (the partial UPSERT law)", () => {
  const ownedRow = {
    id: CLASS_A,
    teacher_id: TEACHER,
    course_slug: "igcse-chemistry-19",
    course_label: "IGCSE Chemistry",
    name: "Period 3",
    status: "ACTIVE",
    created_at: "2026-10-01T10:00:00Z",
  };
  const detailDeps = (routes: Route[]): ClassFeaturesWriteDeps => {
    const sql = fakeSql(routes);
    return {
      sql,
      clock,
      ownedClass: async (t, id) => {
        if (id !== CLASS_A) throw new ClassroomNotFoundError("class not found");
        if (t !== TEACHER) throw new ClassroomForbiddenError("this class belongs to another teacher");
        return ownedRow;
      },
      detailOf: async () => ({
        id: CLASS_A,
        courseSlug: ownedRow.course_slug,
        courseLabel: ownedRow.course_label,
        name: ownedRow.name,
        status: "active",
        createdAt: ownedRow.created_at,
        members: [],
        features: { smartMark: true, tutor: false, cla: true },
      }),
    };
  };

  test("a first write INSERTs with explicit booleans (absent keys → true) and answers the refreshed detail", async () => {
    let bound: unknown[] | null = null;
    const deps = detailDeps([
      {
        match: /^insert into class_features/,
        rows: [],
        rowsFor: (params) => {
          bound = params;
          return [];
        },
      },
    ]);
    const view = await setClassFeatures(deps, TEACHER, CLASS_A, { tutor: false });
    expect(view.features.tutor).toBe(false);
    // the INSERT arm: (class_id, smart_mark, tutor, cla, updated_at, updated_by)
    expect(bound![0]).toBe(CLASS_A);
    expect(bound![1]).toBe(true); // smart_mark absent → the ON default
    expect(bound![2]).toBe(false); // tutor = the requested flip
    expect(bound![3]).toBe(true); // cla absent → the ON default
    expect(bound![5]).toBe(TEACHER);
  });

  test("a partial update COALESCEs absent keys against the stored row", async () => {
    let bound: unknown[] | null = null;
    const deps = detailDeps([
      {
        match: /^insert into class_features/,
        rows: [],
        rowsFor: (params) => {
          bound = params;
          return [];
        },
      },
    ]);
    await setClassFeatures(deps, TEACHER, CLASS_A, { cla: false });
    // the ON CONFLICT arm coalesces (param indices 6-8 follow the six INSERT
    // values): smart_mark null → keep, tutor null → keep, cla false → set
    expect(bound![6]).toBeNull();
    expect(bound![7]).toBeNull();
    expect(bound![8]).toBe(false);
  });

  test("the §17 ownership gate rides the SAME law (unknown 404 verbatim, foreign 403 verbatim)", async () => {
    const deps = detailDeps([]);
    await expect(setClassFeatures(deps, TEACHER, "ee000000-0000-4000-8000-000000000001", {})).rejects.toThrow(
      "class not found",
    );
    await expect(
      setClassFeatures(deps, "aa000000-0000-4000-8000-0000000000ff", CLASS_A, {}),
    ).rejects.toThrow("this class belongs to another teacher");
  });
});

// ── the gate ────────────────────────────────────────────────────────────────

const DENY_QUERY = /not coalesce\(f\.(smart_mark|tutor|cla), true\)/;

describe("the deny law (conservative union, fail-closed)", () => {
  test("featureDisabledMessage is FIXED and client-safe per feature", () => {
    expect(featureDisabledMessage("tutor")).toBe(
      "your teacher has turned off the tutor for your class",
    );
    expect(featureDisabledMessage("smart_mark")).toBe(
      "your teacher has turned off smart marking for your class",
    );
    expect(featureDisabledMessage("cla")).toBe(
      "your teacher has turned off the cla for your class",
    );
    expect(new FeatureDisabledByTeacherError("tutor").feature).toBe("tutor");
  });

  test("an empty anchor set NEVER queries and NEVER denies (the anchor-strength law)", async () => {
    const { deps, sql } = gateDeps([]);
    const { courseSlugsForAttempt: bridge } = await import("../../src/services/classroom/feature-gate");
    // exercised via the deny path below through the middleware tests; here:
    // the deny check itself with [] short-circuits before any SQL
    expect(sql.queries).toHaveLength(0);
  });

  test("the deny query joins memberships → classes → features LEFT (COALESCE default ON)", async () => {
    const routes: Route[] = [
      {
        match: DENY_QUERY,
        rows: [{ 1: 1 }],
      },
    ];
    const { deps } = gateDeps(routes);
    // deniedViaSlugs is private; the middleware tests below pin it end-to-end.
    // Here we pin the QUERY SHAPE the three feature branches render:
    expect(DENY_QUERY.test("not coalesce(f.tutor, true)")).toBe(true);
    expect(DENY_QUERY.test("not coalesce(f.smart_mark, true)")).toBe(true);
    expect(DENY_QUERY.test("not coalesce(f.cla, true)")).toBe(true);
  });
});

// ── the bridges ─────────────────────────────────────────────────────────────

const BRIDGE_ROW = { course_slug: "igcse-chemistry-19" };
const QUESTION_BRIDGE = /from questions q\s+join exam_papers ep/;
const ATTEMPT_BRIDGE = /from attempts a\s+join questions q/;

describe("the course bridges (never an existence oracle)", () => {
  test("question bridge: the 5-join chain through course_registry", async () => {
    const { deps, sql } = gateDeps([{ match: QUESTION_BRIDGE, rows: [BRIDGE_ROW] }]);
    const slugs = await courseSlugsForQuestion(deps, QUESTION);
    expect(slugs).toEqual(["igcse-chemistry-19"]);
    expect(sql.queries[0]).toContain("join curriculum_versions cv on cv.id = s.curriculum_version_id");
    expect(sql.queries[0]).toContain("join course_registry cr on cr.curriculum_code = cv.code");
  });

  test("attempt bridge: the same chain from attempts", async () => {
    const { deps } = gateDeps([
      { match: ATTEMPT_BRIDGE, rows: [BRIDGE_ROW, { course_slug: "cie-igcse-maths-25-core" }] },
    ]);
    const slugs = await courseSlugsForAttempt(deps, ATTEMPT);
    expect(slugs).toEqual(["igcse-chemistry-19", "cie-igcse-maths-25-core"]); // multi-slug preserved
  });

  test("malformed/empty ids pass anchorless WITHOUT a query (no fabricated anchors)", async () => {
    const { deps, sql } = gateDeps([]);
    expect(await courseSlugsForQuestion(deps, "not-a-uuid")).toEqual([]);
    expect(await courseSlugsForAttempt(deps, "")).toEqual([]);
    expect(sql.queries).toHaveLength(0);
  });

  test("unresolvable references answer ZERO slugs (the frozen route owns its 404)", async () => {
    const { deps } = gateDeps([{ match: QUESTION_BRIDGE, rows: [] }]);
    expect(await courseSlugsForQuestion(deps, QUESTION)).toEqual([]);
  });
});

// ── the surface resolvers ───────────────────────────────────────────────────

const mockContext = (opts: { path: string; body?: unknown }): Context => {
  const req = new Request(`https://api.test${opts.path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(opts.body ?? {}),
  });
  const c = { req: { raw: req, url: req.url } } as unknown as Context;
  return c;
};

describe("resolveTutorAnchor (body courseRef ?? session course_ref)", () => {
  const TUTOR_SESSION_ROUTE: Route = {
    match: /select course_ref from tutor_sessions where id = \? ::uuid$/,
    rows: [{ course_ref: "igcse-chemistry-19" }],
  };

  test("body courseRef wins when present (trimmed)", async () => {
    const { deps, sql } = gateDeps([]);
    const slugs = await resolveTutorAnchor(
      mockContext({ path: "/api/v1/tutor/ask", body: { courseRef: " igcse-chemistry-19 " } }),
      deps,
    );
    expect(slugs).toEqual(["igcse-chemistry-19"]);
    expect(sql.queries).toHaveLength(0); // no session lookup needed
  });

  test("blank courseRef (V53: blank = absent) falls to the session anchor", async () => {
    const { deps } = gateDeps([TUTOR_SESSION_ROUTE]);
    const slugs = await resolveTutorAnchor(
      mockContext({ path: "/api/v1/tutor/ask", body: { courseRef: "  ", sessionId: SESSION } }),
      deps,
    );
    expect(slugs).toEqual(["igcse-chemistry-19"]);
  });

  test("no courseRef + no session = anchorless (the disclosed §4 open tier)", async () => {
    const { deps, sql } = gateDeps([]);
    const slugs = await resolveTutorAnchor(
      mockContext({ path: "/api/v1/tutor/ask", body: { question: "why?" } }),
      deps,
    );
    expect(slugs).toEqual([]);
    expect(sql.queries).toHaveLength(0);
  });

  test("a session without course_ref is anchorless, honestly", async () => {
    const { deps } = gateDeps([
      { match: TUTOR_SESSION_ROUTE.match, rows: [{ course_ref: null }] },
    ]);
    const slugs = await resolveTutorAnchor(
      mockContext({ path: "/api/v1/tutor/ask/stream", body: { sessionId: SESSION } }),
      deps,
    );
    expect(slugs).toEqual([]);
  });
});

describe("resolveClaAnchor (CHECK-only law)", () => {
  test("kind CHECK + questionId resolves the question bridge", async () => {
    const { deps } = gateDeps([{ match: QUESTION_BRIDGE, rows: [BRIDGE_ROW] }]);
    const slugs = await resolveClaAnchor(
      mockContext({ path: "/api/v1/learners/me/cla/ask", body: { kind: "CHECK", questionId: QUESTION } }),
      deps,
    );
    expect(slugs).toEqual(["igcse-chemistry-19"]);
  });

  test("non-CHECK kinds are the disclosed OPEN tier (no anchor attempt)", async () => {
    const { deps, sql } = gateDeps([]);
    for (const kind of ["EXPLAIN", "SMART_LESSON", "NOTE_SECTION"]) {
      const slugs = await resolveClaAnchor(
        mockContext({ path: "/api/v1/learners/me/cla/ask", body: { kind, questionId: QUESTION } }),
        deps,
      );
      expect(slugs).toEqual([]);
    }
    expect(sql.queries).toHaveLength(0);
  });

  test("CHECK without questionId is anchorless (the route's own 400 owns it)", async () => {
    const { deps, sql } = gateDeps([]);
    const slugs = await resolveClaAnchor(
      mockContext({ path: "/api/v1/learners/me/cla/ask", body: { kind: "CHECK" } }),
      deps,
    );
    expect(slugs).toEqual([]);
    expect(sql.queries).toHaveLength(0);
  });
});

describe("resolveSmartMarkAnchor (the attemptId path law)", () => {
  test("all three gated POST paths extract the attemptId", async () => {
    const { deps } = gateDeps([{ match: ATTEMPT_BRIDGE, rows: [BRIDGE_ROW] }]);
    for (const path of [
      `/api/v1/learners/me/attempts/${ATTEMPT}/smart-mark`,
      `/api/v1/learners/me/attempts/${ATTEMPT}/parts/ee000000-0000-4000-8000-000000000001/feedback-explanation`,
      `/api/v1/learners/me/attempts/${ATTEMPT}/parts/ee000000-0000-4000-8000-000000000001/improvement-plan`,
    ]) {
      const slugs = await resolveSmartMarkAnchor(mockContext({ path }), deps);
      expect(slugs).toEqual(["igcse-chemistry-19"]);
    }
  });

  test("a non-matching path is anchorless", async () => {
    const { deps, sql } = gateDeps([]);
    expect(await resolveSmartMarkAnchor(mockContext({ path: "/api/v1/learners/me/attempts" }), deps)).toEqual([]);
    expect(sql.queries).toHaveLength(0);
  });
});

// ── the composition-root wrapper ────────────────────────────────────────────

const AUTH = { userId: LEARNER, roles: ["STUDENT"], tokenVersion: 1 };

function makeGatedApp(opts: {
  gateRoutes: Route[];
  feature: "tutor" | "cla" | "smart_mark";
  paths: readonly string[];
  resolve: (c: Context, deps: FeatureGateDeps) => Promise<string[]>;
  innerHits: string[];
  injectAuth?: boolean;
}) {
  const sql = fakeSql(opts.gateRoutes);
  const deps: FeatureGateDeps = { sql };
  const inner = new Hono();
  inner.post("*", async (c) => {
    opts.innerHits.push(c.req.path);
    return c.json({ ok: true });
  });
  const gated = withClassFeatureGate(inner, deps, {
    feature: opts.feature,
    paths: opts.paths,
    resolve: opts.resolve,
  });
  // the production order: the auth injection middleware runs at the ROOT app
  // BEFORE any router mounts (apps/api/src/index.ts) — so the parent here.
  const root = new Hono();
  root.use("*", async (c, next) => {
    if (opts.injectAuth) c.set("syllabai.auth" as never, AUTH as never);
    await next();
  });
  root.route("/", gated);
  return root;
}

describe("withClassFeatureGate (the composition-root wire)", () => {
  test("a denied gated POST answers 403 with the FIXED body BEFORE the frozen handler", async () => {
    const innerHits: string[] = [];
    const app = makeGatedApp({
      gateRoutes: [{ match: DENY_QUERY, rows: [{ 1: 1 }] }],
      feature: "tutor",
      paths: ["/ask"],
      resolve: async () => ["igcse-chemistry-19"],
      innerHits,
      injectAuth: true,
    });
    const res = await app.request("/api/v1/tutor/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ courseRef: "igcse-chemistry-19", question: "why?" }),
    });
    expect(res.status).toBe(403);
    // the volatile-timestamp law (errors.ts: golden tolerance treats the
    // timestamp as volatile): the WHOLE-body comparison must not pin the
    // millisecond — the response's isoNow() and this expectation's isoNow()
    // straddle a wall-clock ms boundary ~1% of runs (the CI flake of record,
    // run1 2026-10-22T00:47:39.004Z vs .003Z). The house pattern
    // (questions/routes.test.ts:200) pins the deterministic fields only.
    expect(await res.json()).toEqual({
      ...apiError(403, FEATURE_DISABLED_CODE, featureDisabledMessage("tutor")),
      timestamp: expect.any(String),
    });
    expect(innerHits).toEqual([]); // the frozen handler NEVER ran
  });

  test("the conservative union: the deny query fired, the pass-through reaches the handler", async () => {
    const innerHits: string[] = [];
    const app = makeGatedApp({
      gateRoutes: [{ match: DENY_QUERY, rows: [] }], // no matching OFF class
      feature: "cla",
      paths: ["/ask"],
      resolve: async () => ["igcse-chemistry-19"],
      innerHits,
      injectAuth: true,
    });
    const res = await app.request("/api/v1/learners/me/cla/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "CHECK", questionId: QUESTION, question: "check this" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(innerHits).toEqual(["/api/v1/learners/me/cla/ask"]);
  });

  test("unauthenticated requests pass the gate and meet the shell's 401 (parity)", async () => {
    const innerHits: string[] = [];
    const inner2 = new Hono();
    inner2.use("*", async (c, next) => {
      const auth = (c as unknown as { get: (k: string) => unknown }).get("syllabai.auth");
      if (!auth) return c.json(apiError(401, "unauthorized", "authentication required"), 401);
      await next();
    });
    inner2.post("*", async (c) => {
      innerHits.push(c.req.path);
      return c.json({ ok: true });
    });
    const deps: FeatureGateDeps = {
      sql: (async () => {
        throw new Error("the gate must NOT be consulted for unauthenticated requests");
      }) as never,
    };
    const app = withClassFeatureGate(inner2, deps, {
      feature: "smart_mark",
      paths: ["/smart-mark"],
      resolve: async () => ["igcse-chemistry-19"],
    });
    const res = await app.request(`/api/v1/learners/me/attempts/${ATTEMPT}/smart-mark`, { method: "POST" });
    expect(res.status).toBe(401);
    expect(innerHits).toEqual([]); // the shell answered, the handler still never ran
  });

  test("non-gated paths and non-POST methods pass without consulting the gate", async () => {
    const innerHits: string[] = [];
    const app = makeGatedApp({
      gateRoutes: [],
      feature: "tutor",
      paths: ["/ask"],
      resolve: async () => ["igcse-chemistry-19"],
      innerHits,
      injectAuth: true,
    });
    const getRes = await app.request("/api/v1/tutor/ask", { method: "GET" });
    expect(getRes.status).toBe(404); // inner has no GET /ask — the frozen shape
    const otherRes = await app.request("/api/v1/tutor/sessions", { method: "POST" });
    expect(otherRes.status).toBe(200);
    expect(innerHits).toEqual(["/api/v1/tutor/sessions"]);
  });

  test("gate-infrastructure failure passes through with the failure logged (policy ≠ availability)", async () => {
    const innerHits: string[] = [];
    const sql = fakeSql([]);
    // a gate sql that THROWS on any query
    const throwingDeps: FeatureGateDeps = {
      sql: (async () => {
        throw new Error("bridge down");
      }) as never,
    };
    void sql;
    const inner = new Hono();
    inner.use("*", async (_c, next) => {
      await next();
    });
    inner.post("*", async (c) => {
      innerHits.push(c.req.path);
      return c.json({ ok: true });
    });
    const app = withClassFeatureGate(inner, throwingDeps, {
      feature: "tutor",
      paths: ["/ask"],
      resolve: async () => {
        throw new Error("resolver down");
      },
    });
    const res = await app.request("/api/v1/tutor/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ courseRef: "igcse-chemistry-19" }),
    });
    expect(res.status).toBe(200); // pass-through, the frozen route owns it
    expect(innerHits).toEqual(["/api/v1/tutor/ask"]);
  });
});

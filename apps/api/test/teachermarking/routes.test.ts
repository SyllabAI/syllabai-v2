/**
 * Teacher marking ROUTE tests (T-MIG-033 tranche 2) — the observable HTTP
 * contract of TeacherMarkingController (:46-328 @ 6cad6ef) over a FAKE
 * module (service internals were tranche-1's tested surface; this file pins
 * the route layer: authz shell, dual-shape G-5 surfaces, C-9 message,
 * validation wiring via the #58 contracts, status codes + error envelopes).
 */
import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { createTeacherMarkingRouter, type KappaEvaluationView } from "../../src/routes/teachermarking";
import type { TeacherMarkingModule } from "../../src/services/teachermarking";
import { bootErrorBody } from "../../src/middleware/auth";

const ANSWER_ID = "a0000000-0000-4000-8000-000000000001";
const PAPER_ID = "b0000000-0000-4000-8000-000000000001";

/** Auth contexts (roles drive the shell: anonymous/LEARNER/TEACHER/ADMIN). */
function authFor(roles: string[] | null) {
  return roles === null
    ? null
    : { email: "u@example.invalid", userId: "60000000-0000-4000-8000-000000000001", roles, tokenVersion: 0 };
}

/** The route harness: auth injector + the router; the router owns its error map. */
function boot(opts: {
  roles: string[] | null;
  module?: Partial<TeacherMarkingModule>;
  latestKappa?: (paperId: string | null) => Promise<KappaEvaluationView | null>;
}) {
  const calls: Record<string, unknown[]> = {};
  const fake = (name: string, ret: unknown = {}) => async (...args: unknown[]) => {
    (calls[name] ??= []).push(args);
    return ret;
  };
  const module: TeacherMarkingModule = {
    queue: {
      answersList: fake("answersList", []),
      answersPaged: fake("answersPaged", { items: [], page: 0, size: 50, totalElements: 0, totalPages: 0 }),
      markingQueuePaged: fake("markingQueuePaged", { state: "PENDING", groups: [], items: [] }),
      throughput: fake("throughput", { answersByState: {}, humanMarks24h: 0, humanMarks7d: 0, pendingByPaper: [], oldestPendingAt: null, oldestPendingHours: null }),
      smartMarkBatch: fake("smartMarkBatch", { requested: 0, results: [] }),
      answerById: fake("answerById", null),
      ...((opts.module?.queue ?? {}) as object),
    } as unknown as TeacherMarkingModule["queue"],
    marking: {
      recordHumanMark: fake("recordHumanMark", { id: "m1" }),
      evaluateAgreement: fake("evaluateAgreement", { id: "k1", scope: "ALL", paperId: null, sampleSize: 0, kappa: 0.7, observedAgreement: 0.85, threshold: 0.6, passed: true, computedAt: "2026-10-05T00:00:00Z" }),
      ...((opts.module?.marking ?? {}) as object),
    } as unknown as TeacherMarkingModule["marking"],
    teacherSmartMark: {
      markAnswer: fake("markAnswer", { answerId: ANSWER_ID }),
      ...((opts.module?.teacherSmartMark ?? {}) as object),
    } as unknown as TeacherMarkingModule["teacherSmartMark"],
  };
  const latest = opts.latestKappa ?? (async () => null);
  const router = createTeacherMarkingRouter(module, latest);
  const app = new Hono();
  app.use("*", async (c, next) => {
    const a = authFor(opts.roles);
    if (a) c.set("syllabai.auth" as never, a as never);
    await next();
  });
  app.route("/", router);
  return { app, calls };
}

const TEACHER = ["TEACHER"];

// ── authz shell (SecurityConfig /api/v1/teacher/** + @PreAuthorize parity) ──

test("anonymous caller gets the Boot 401 body on every surface", async () => {
  for (const [method, path] of [
    ["GET", "/answers"],
    ["GET", "/queue-v2"],
    ["GET", "/throughput"],
    ["POST", "/smart-mark-batch"],
    ["GET", `/answers/${ANSWER_ID}`],
    ["POST", `/answers/${ANSWER_ID}/smart-mark`],
    ["POST", `/answers/${ANSWER_ID}/human-mark`],
    ["POST", "/kappa/evaluate"],
    ["GET", "/kappa/latest"],
  ] as const) {
    const { app } = boot({ roles: null });
    const res = await app.request(path, { method });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
    expect(body.path).toBe(path);
  }
});

test("authenticated non-teacher gets the Boot 403 body (route-rule parity)", async () => {
  const { app } = boot({ roles: ["LEARNER"] });
  const res = await app.request("/answers");
  expect(res.status).toBe(403);
  expect((await res.json()).error).toBe("Forbidden");
});

// ── GET /answers — dual-shape G-5 surface (:148-176) ─────────────────────────

test("TEACHER unpaged /answers returns the plain list (the unchanged contract)", async () => {
  const { app, calls } = boot({ roles: TEACHER });
  const res = await app.request("/answers");
  expect(res.status).toBe(200);
  expect(Array.isArray(await res.json())).toBe(true);
  expect(calls.answersList?.[0]).toEqual(["PENDING"]);
});

test("paged /answers returns the page envelope; defaults 0/50", async () => {
  const { app, calls } = boot({ roles: TEACHER });
  const res = await app.request("/answers?page=1");
  expect(res.status).toBe(200);
  const body = await res.json();
  // the fake returns its STATIC default; the (state, page, size) args are
  // pinned separately above via calls
  expect(body).toEqual({ items: [], page: 0, size: 50, totalElements: 0, totalPages: 0 });
  expect(calls.answersPaged?.[0]).toEqual(["PENDING", 1, 50]);
});

test("/answers bounds are verbatim (:156-163)", async () => {
  for (const [qs, msg] of [
    ["?page=-1", "page must be >= 0"],
    ["?size=0", "size must be between 1 and 200"],
    ["?size=201", "size must be between 1 and 200"],
  ] as const) {
    const { app } = boot({ roles: TEACHER });
    const res = await app.request(`/answers${qs}`);
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe(msg);
  }
});

test("/answers non-integer page is a type-mismatch 400 (malformed request)", async () => {
  const { app } = boot({ roles: TEACHER });
  const res = await app.request("/answers?page=abc");
  expect(res.status).toBe(400);
});

test("C-9: unknown state is a 400 with the verbatim four-state hint (not a 404)", async () => {
  const { app } = boot({ roles: TEACHER });
  const res = await app.request("/answers?state=BOGUS");
  expect(res.status).toBe(400);
  expect((await res.json()).message).toBe(
    "unknown marking state: BOGUS (expected PENDING, SMART_MARKED, HUMAN_MARKED or OVERRIDDEN)",
  );
});

test("state is upper-cased before the service read (:180 valueOf parity)", async () => {
  const { app, calls } = boot({ roles: TEACHER });
  const res = await app.request("/answers?state=smart_marked");
  expect(res.status).toBe(200);
  expect(calls.answersList?.[0]).toEqual(["SMART_MARKED"]);
});

// ── GET /queue-v2 — dual-shape; bounds live in the service (:204-213) ───────

test("/queue-v2 unpaged delegates (state, null, null)", async () => {
  const { app, calls } = boot({ roles: TEACHER });
  const res = await app.request("/queue-v2");
  expect(res.status).toBe(200);
  expect(calls.markingQueuePaged?.[0]).toEqual(["PENDING", null, null]);
});

test("/queue-v2 paged delegates page/size (validation unit-pinned in the service)", async () => {
  const { app, calls } = boot({ roles: TEACHER });
  const res = await app.request("/queue-v2?state=PENDING&page=2&size=7");
  expect(res.status).toBe(200);
  expect(calls.markingQueuePaged?.[0]).toEqual(["PENDING", 2, 7]);
});

// ── GET /throughput (:220-223) ───────────────────────────────────────────────

test("/throughput returns the counts-of-what-happened view", async () => {
  const { app, calls } = boot({ roles: TEACHER });
  const res = await app.request("/throughput");
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body).toHaveProperty("answersByState");
  expect(calls.throughput).toHaveLength(1);
});

// ── POST /smart-mark-batch (:231-235; #58 contracts 1..50 ids) ──────────────

test("/smart-mark-batch valid body runs the bounded batch", async () => {
  const { app, calls } = boot({ roles: TEACHER });
  const res = await app.request("/smart-mark-batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answerIds: [ANSWER_ID] }),
  });
  expect(res.status).toBe(200);
  expect(calls.smartMarkBatch?.[0]).toEqual([[ANSWER_ID]]);
});

test("/smart-mark-batch validation: empty, 51 ids, missing body → 400", async () => {
  const { app } = boot({ roles: TEACHER });
  const empty = await app.request("/smart-mark-batch", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answerIds: [] }),
  });
  expect(empty.status).toBe(400);
  const ids = Array.from({ length: 51 }, (_, i) =>
    `a0000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
  const over = await app.request("/smart-mark-batch", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answerIds: ids }),
  });
  expect(over.status).toBe(400);
  const missing = await app.request("/smart-mark-batch", { method: "POST" });
  expect(missing.status).toBe(400);
});

// ── GET /answers/{id} (:243-252) — rich view or NotFound("answer", id) ──────

test("unknown answer → 404 with the NotFound detail message", async () => {
  const { app } = boot({ roles: TEACHER });
  const res = await app.request(`/answers/${ANSWER_ID}`);
  expect(res.status).toBe(404);
  expect((await res.json()).message).toBe(`answer ${ANSWER_ID} not found`);
});

test("malformed uuid path variable → 400 (MethodArgumentTypeMismatch parity)", async () => {
  const { app } = boot({ roles: TEACHER });
  const res = await app.request("/answers/not-a-uuid");
  expect(res.status).toBe(400);
});

// ── POST /answers/{id}/human-mark (:261-270) — 201 + contract wiring ────────

test("valid human mark → 201, marker id from the JWT identity", async () => {
  const { app, calls } = boot({ roles: TEACHER });
  const res = await app.request(`/answers/${ANSWER_ID}/human-mark`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ marksAwarded: 2, perPointDecisions: { p1: 1 }, comments: "ok" }),
  });
  expect(res.status).toBe(201);
  expect(calls.recordHumanMark?.[0]).toEqual([ANSWER_ID, "60000000-0000-4000-8000-000000000001", 2, { p1: 1 }, "ok"]);
});

test("human mark bounds from the contract: 100 rejected, 99 accepted", async () => {
  const over = boot({ roles: TEACHER });
  const r1 = await over.app.request(`/answers/${ANSWER_ID}/human-mark`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ marksAwarded: 100 }),
  });
  expect(r1.status).toBe(400);
  const at = boot({ roles: TEACHER });
  const r2 = await at.app.request(`/answers/${ANSWER_ID}/human-mark`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ marksAwarded: 99 }),
  });
  expect(r2.status).toBe(201);
});

test("human mark requires marksAwarded (@NotNull parity)", async () => {
  const { app } = boot({ roles: TEACHER });
  const res = await app.request(`/answers/${ANSWER_ID}/human-mark`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
  });
  expect(res.status).toBe(400);
});

// ── POST /kappa/evaluate (:273-280) — @RequestBody(required=false) ──────────

test("absent body evaluates scope ALL; 201", async () => {
  const { app, calls } = boot({ roles: TEACHER });
  const res = await app.request("/kappa/evaluate", { method: "POST" });
  expect(res.status).toBe(201);
  expect(calls.evaluateAgreement?.[0]).toEqual([null, "60000000-0000-4000-8000-000000000001"]);
});

test("explicit paperId scopes the evaluation; invalid uuid is a 400", async () => {
  const { app, calls } = boot({ roles: TEACHER });
  const ok = await app.request("/kappa/evaluate", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paperId: PAPER_ID }),
  });
  expect(ok.status).toBe(201);
  expect(calls.evaluateAgreement?.[0]).toEqual([PAPER_ID, "60000000-0000-4000-8000-000000000001"]);
  const bad = await app.request("/kappa/evaluate", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paperId: "nope" }),
  });
  expect(bad.status).toBe(400);
});

// ── GET /kappa/latest (:282-293) — newest by scope, 404 when none ───────────

test("no evaluation on record → 404 naming the ALL scope", async () => {
  const { app } = boot({ roles: TEACHER });
  const res = await app.request("/kappa/latest");
  expect(res.status).toBe(404);
  expect((await res.json()).message).toBe("kappa evaluation ALL not found");
});

test("recorded evaluation returns the KappaEvaluationView shape", async () => {
  const view: KappaEvaluationView = {
    id: "k1", scope: "ALL", paperId: null, sampleSize: 12, kappa: 0.71,
    observedAgreement: 0.86, threshold: 0.6, passed: true, computedAt: "2026-10-05T00:00:00Z",
  };
  const { app } = boot({ roles: TEACHER, latestKappa: async () => view });
  const res = await app.request("/kappa/latest");
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual(view);
});

test("paper-scoped latest passes the uuid through; malformed uuid → 400", async () => {
  const seen: Array<string | null> = [];
  const { app } = boot({
    roles: TEACHER,
    latestKappa: async (p) => { seen.push(p); return null; },
  });
  await app.request(`/kappa/latest?paperId=${PAPER_ID}`);
  expect(seen).toEqual([PAPER_ID]);
  const bad = await app.request("/kappa/latest?paperId=nope");
  expect(bad.status).toBe(400);
});

// silence unused import guard for the boot helper's bootErrorBody assertions
void bootErrorBody;

/**
 * TeachingCoverage route tests (T-MIG-087) — the observable HTTP contract
 * of TeachingCoverageController (:56-192, frozen @ 6cad6ef) over an
 * IN-MEMORY Hono app wiring the REAL 053 tranche-1 coverage services
 * (services/knowledge: coverageList / coverageHistory / coverageMark) over
 * stubbed sql (no Neon) — the T-MIG-052-t2 route-test pattern.
 *
 * 200 bodies are validated against the CANONICAL @syllabai/contracts
 * schemas (knowledge.ts: coverageRowViewSchema / coverageEventViewSchema —
 * the TeachingCoverageViews.java port). Error envelopes are pinned to the
 * GlobalExceptionHandler laws: NotFound/Forbidden/BadRequest/Conflict →
 * 404/403/400/409 with the verbatim service messages; @PathVariable UUID
 * mismatch → 400 "malformed request"; the Boot 401/403 authz shells
 * (SecurityConfig :87 TEACHER/ADMIN; timestamp tolerated).
 *
 * R-TX pin: every PUT runs the service inside deps.sql.transaction (the
 * route layer owns the boundary — the concept-seed precedent); the tx shim
 * counts entries so the tests pin ONE transaction per PUT, ZERO for reads.
 */
import { describe, expect, test } from "bun:test";
import { Hono, type Context } from "hono";
import { createTeacherCoverageRouter, type CoverageSql } from "../../src/routes/teacher-coverage";
import { toErrorResponse } from "../../src/services/identity/errors";
import type { SqlFn } from "../../src/services/identity/users";
import {
  coverageEventViewSchema,
  coverageRowViewSchema,
} from "@syllabai/contracts";
import { fakeSql, type Route } from "../assessment/helpers";

// ── fixtures (fixed-constant uuids; golden law @ 6cad6ef) ───────────────────

const TEACHER = "aa000000-0000-4000-8000-000000000001";
const OTHER_TEACHER = "aa000000-0000-4000-8000-000000000002";
const CLASS_A = "cc000000-0000-4000-8000-000000000001";
const SP_1 = "20000000-0000-4000-8000-000000000001";
const SP_2 = "20000000-0000-4000-8000-000000000002";

const T0 = "2026-09-20T10:00:00Z";
const T1 = "2026-10-01T10:00:00Z";
const T2 = "2026-10-02T10:00:00Z";
const NOW_TEXT = "2026-10-06T08:00:00Z";
const NOW_ISO = "2026-10-06T08:00:00.000Z";
const NOW = new Date(NOW_TEXT);
const clock = { newId: () => "7e571d00-0000-4000-8000-000000000001", now: () => NOW };

const classRow = (status = "ACTIVE", teacherId = TEACHER) => ({
  id: CLASS_A,
  status,
  teacher_id: teacherId,
});

const coverageRow = (over: Partial<Record<string, unknown>> = {}) => ({
  class_id: CLASS_A,
  spec_point_node_id: SP_1,
  status: "TAUGHT",
  marked_by: TEACHER,
  marked_at: T1,
  note: "week 3",
  created_at: T0,
  ...over,
});

const specPointRow = (over: Partial<Record<string, unknown>> = {}) => ({
  id: SP_1,
  code: "4CH1-S1-c",
  node_type: "SUBTOPIC",
  title: "States of matter",
  description: null,
  validation_status: "VALIDATED",
  provenance: "seed",
  applicability: { tiers: ["higher"] }, // non-null applicability IS the V39 spec-point gate
  ...over,
});

const eventRow = (over: Partial<Record<string, unknown>> = {}) => ({
  status: "TAUGHT",
  previous_status: null,
  actor_id: TEACHER,
  note: null,
  created_at: T2,
  ...over,
});

// ── shared route shapes (the 053 SQL, verbatim renderings) ──────────────────

const ownedClassRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /^select id, status, teacher_id from classes where id = \? ::uuid$/,
  rows,
});

const coverageListRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match:
    /^select class_id, spec_point_node_id, status, marked_by, marked_at, note, created_at from teaching_coverage where class_id = \? ::uuid order by spec_point_node_id asc$/,
  rows,
});

const nodesAnyRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match:
    /^select id, code, node_type, title, description, validation_status, provenance, applicability from knowledge_nodes where id = any\( \? ::uuid\[\]\)$/,
  rows,
  // the service resolves identities by id from the batch — respond with only
  // the rows whose id was bound (a vanished node id yields NO row → null
  // code/title, the V30 NO-ACTION FK honesty)
  rowsFor: (params) => rows.filter((r) => (params[0] as string[]).includes(r.id as string)),
});

const historyRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match:
    /^select status, previous_status, actor_id, note, created_at from teaching_coverage_events where class_id = \? ::uuid and spec_point_node_id = \? ::uuid order by created_at desc$/,
  rows,
});

const nodeOneRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match:
    /^select id, code, node_type, title, description, validation_status, provenance, applicability from knowledge_nodes where id = \? ::uuid$/,
  rows,
});

const existingRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match:
    /^select class_id, spec_point_node_id, status, marked_by, marked_at, note, created_at from teaching_coverage where class_id = \? ::uuid and spec_point_node_id = \? ::uuid$/,
  rows,
});

const insertCoverageRoute = (): Route => ({
  match: /^insert into teaching_coverage \(class_id, spec_point_node_id, status, marked_by, marked_at, note, created_at\)/,
  rows: [],
});

const insertEventRoute = (): Route => ({
  match: /^insert into teaching_coverage_events \(id, class_id, spec_point_node_id, status, previous_status, actor_id, note, created_at\)/,
  rows: [],
});

const updateCoverageRoute = (): Route => ({
  match:
    /^update teaching_coverage set status = \? , marked_by = \? ::uuid, marked_at = \? , note = \? where class_id = \? ::uuid and spec_point_node_id = \? ::uuid$/,
  rows: [],
});

// ── app assembly (mirrors apps/api/src/index.ts: auth injection + the real
//    error boundary; the router at the REAL mount prefix) ───────────────────

type AuthRow = Record<string, unknown> | null;

/** fakeSql + a transaction() that forwards to the base fn (adapter shim,
 *  the sme/revision-notes helper pattern) + a run counter for the R-TX pin. */
function txSql(routes: Route[]) {
  const inner = fakeSql(routes);
  let txRuns = 0;
  const wrapped = Object.assign(inner as unknown as CoverageSql & { queries: string[] }, {
    transaction: async <T,>(body: (tx: SqlFn) => Promise<T>): Promise<T> => {
      txRuns += 1;
      return body(inner);
    },
  });
  return { sql: wrapped, txRuns: () => txRuns };
}

function makeApp(auth: (c: Context) => AuthRow, routes: Route[]) {
  const { sql, txRuns } = txSql(routes);
  const app = new Hono();
  app.use("*", async (c, next) => {
    const a = auth(c);
    if (a) c.set("syllabai.auth" as never, a as never);
    await next();
  });
  app.route("/api/v1/teacher/classes", createTeacherCoverageRouter({ sql, clock }));
  app.onError((err, c) => {
    const mapped = toErrorResponse(err);
    if (mapped) return c.json(mapped.body, mapped.status as 400);
    console.error("[test] unhandled error:", err);
    return c.json({ status: 500, error: "internal_error", message: "an internal error occurred" }, 500 as const);
  });
  return { app, sql, txRuns };
}

const asTeacher = (): AuthRow => ({
  email: "t@example.edu",
  userId: TEACHER,
  roles: ["TEACHER"],
  tokenVersion: 1,
});
const asStudent = (): AuthRow => ({
  email: "s@example.edu",
  userId: "bb000000-0000-4000-8000-000000000001",
  roles: ["STUDENT"],
  tokenVersion: 1,
});
const anon = (): AuthRow => null;

const base = `/api/v1/teacher/classes/${CLASS_A}/coverage`;

// ── authz shells (SecurityConfig :87 parity) ────────────────────────────────

describe("authz shells (TEACHER/ADMIN)", () => {
  test("anonymous GET list → Boot 401 body with the request path", async () => {
    const { app } = makeApp(anon, []);
    const res = await app.request(base);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
    expect(body.path).toBe(base);
    expect(typeof body.timestamp).toBe("string");
  });

  test("anonymous PUT → Boot 401 BEFORE any body/path work", async () => {
    const { app } = makeApp(anon, []);
    const res = await app.request(`${base}/${SP_1}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "taught" }),
    });
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("Unauthorized");
  });

  test("authenticated STUDENT → Boot 403 body (list / history / PUT)", async () => {
    for (const [path, init] of [
      [base, {}],
      [`${base}/${SP_1}/history`, {}],
      [`${base}/${SP_1}`, { method: "PUT", body: JSON.stringify({ status: "taught" }) }],
    ] as Array<[string, RequestInit]>) {
      const { app, sql } = makeApp(asStudent, []);
      const res = await app.request(path, init);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.status).toBe(403);
      expect(body.error).toBe("Forbidden");
      expect(body.path).toBe(new URL(path, "http://x").pathname);
      expect(sql.queries).toHaveLength(0); // the gate precedes every handler
    }
  });
});

// ── GET list (:66-92) ───────────────────────────────────────────────────────

describe("GET /:classId/coverage", () => {
  test("happy: 200 recorded rows, spec_point_node_id asc, canonical CoverageRowView wire", async () => {
    const { app } = makeApp(asTeacher, [
      ownedClassRoute([classRow()]),
      coverageListRoute([coverageRow(), coverageRow({ spec_point_node_id: SP_2, status: "NOT_TAUGHT", note: null })]),
      nodesAnyRoute([specPointRow(), specPointRow({ id: SP_2, code: "4CH1-S2-a", title: "Particle model" })]),
    ]);
    const res = await app.request(base);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBeTrue();
    for (const row of body) expect(coverageRowViewSchema.safeParse(row).success).toBeTrue();
    expect(body).toHaveLength(2);
    expect(body[0].specPointNodeId).toBe(SP_1);
    expect(body[0].status).toBe("taught"); // the canonical wire form
    expect(body[0].code).toBe("4CH1-S1-c");
    expect(body[0].title).toBe("States of matter");
    expect(body[0].note).toBe("week 3");
    expect(body[0].markedAt).toBe(new Date(T1).toISOString());
    expect(body[0].firstMarkedAt).toBe(new Date(T0).toISOString());
    expect(body[1].status).toBe("not-taught");
  });

  test("a vanished node (V30 NO-ACTION refresh) serves code/title null — identity is the stored id", async () => {
    const { app } = makeApp(asTeacher, [
      ownedClassRoute([classRow()]),
      coverageListRoute([coverageRow({ spec_point_node_id: SP_2 })]),
      nodesAnyRoute([specPointRow()]), // SP_2 not returned — node gone
    ]);
    const res = await app.request(base);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body[0].specPointNodeId).toBe(SP_2);
    expect(body[0].code).toBeNull();
    expect(body[0].title).toBeNull();
  });

  test("empty class → 200 [] — absent rows are the honest 'unrecorded' state", async () => {
    const { app, sql } = makeApp(asTeacher, [
      ownedClassRoute([classRow()]),
      coverageListRoute([]),
    ]);
    const res = await app.request(base);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
    expect(sql.queries).toHaveLength(2); // no node batch when nothing recorded
  });

  test("unknown class → 404 'class not found'", async () => {
    const { app } = makeApp(asTeacher, [ownedClassRoute([])]);
    const res = await app.request(base);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
    expect(body.message).toBe("class not found");
  });

  test("another teacher's class → 403 'this class belongs to another teacher' (§17 gate)", async () => {
    const { app } = makeApp(asTeacher, [ownedClassRoute([classRow("ACTIVE", OTHER_TEACHER)])]);
    const res = await app.request(base);
    expect(res.status).toBe(403);
    expect((await res.json()).message).toBe("this class belongs to another teacher");
  });

  test("malformed classId uuid → 400 bad_request 'malformed request' BEFORE any statement", async () => {
    const { app, sql } = makeApp(asTeacher, []);
    const res = await app.request(`/api/v1/teacher/classes/not-a-uuid/coverage`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("bad_request");
    expect(body.message).toBe("malformed request");
    expect(sql.queries).toHaveLength(0);
  });
});

// ── GET history (:66-92) ────────────────────────────────────────────────────

describe("GET /:classId/coverage/:specPointNodeId/history", () => {
  test("happy: 200 audit trail newest-first, previousStatus null on the first event, canonical wire", async () => {
    const { app } = makeApp(asTeacher, [
      ownedClassRoute([classRow()]),
      historyRoute([
        eventRow({ status: "TAUGHT", previous_status: "NOT_TAUGHT", note: "re-taught", created_at: T2 }),
        eventRow({ status: "NOT_TAUGHT", previous_status: null, created_at: T1 }),
      ]),
    ]);
    const res = await app.request(`${base}/${SP_1}/history`);
    expect(res.status).toBe(200);
    const body = await res.json();
    for (const e of body) expect(coverageEventViewSchema.safeParse(e).success).toBeTrue();
    expect(body).toHaveLength(2);
    expect(body[0].status).toBe("taught");
    expect(body[0].previousStatus).toBe("not-taught");
    expect(body[0].note).toBe("re-taught");
    expect(body[1].previousStatus).toBeNull(); // the trail's first event
    expect(body[1].createdAt).toBe(new Date(T1).toISOString());
  });

  test("unknown class → 404 'class not found' (the §17 gate precedes the trail read)", async () => {
    const { app } = makeApp(asTeacher, [ownedClassRoute([])]);
    const res = await app.request(`${base}/${SP_1}/history`);
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe("class not found");
  });

  test("malformed specPointNodeId uuid → 400 'malformed request'", async () => {
    const { app, sql } = makeApp(asTeacher, []);
    const res = await app.request(`${base}/nope/history`);
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe("malformed request");
    expect(sql.queries).toHaveLength(0);
  });
});

// ── PUT mark (:116-160) ─────────────────────────────────────────────────────

describe("PUT /:classId/coverage/:specPointNodeId", () => {
  const putBody = JSON.stringify({ status: "taught", note: "week 3" });

  test("fresh mark: 200 canonical row, state row + audit event inside ONE transaction (R-TX)", async () => {
    const { app, sql, txRuns } = makeApp(asTeacher, [
      ownedClassRoute([classRow()]),
      nodeOneRoute([specPointRow()]),
      existingRoute([]),
      insertCoverageRoute(),
      insertEventRoute(),
    ]);
    const res = await app.request(`${base}/${SP_1}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: putBody,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(coverageRowViewSchema.safeParse(body).success).toBeTrue();
    expect(body.status).toBe("taught");
    expect(body.markedBy).toBe(TEACHER);
    expect(body.markedAt).toBe(NOW_ISO);
    expect(body.firstMarkedAt).toBe(NOW_ISO); // first-marked = this instant
    expect(body.note).toBe("week 3");
    // R-TX: ONE transaction wraps the whole service call…
    expect(txRuns()).toBe(1);
    // …and BOTH writes happened inside it, state row first, then the audit
    const inserts = sql.queries.filter((q) => q.startsWith("insert into"));
    expect(inserts).toHaveLength(2);
    expect(inserts[0]!.startsWith("insert into teaching_coverage ")).toBeTrue();
    expect(inserts[1]!.startsWith("insert into teaching_coverage_events ")).toBeTrue();
  });

  test("note normalization: trimmed on store; empty → null (the honest absence)", async () => {
    const { app } = makeApp(asTeacher, [
      ownedClassRoute([classRow()]),
      nodeOneRoute([specPointRow()]),
      existingRoute([]),
      insertCoverageRoute(),
      insertEventRoute(),
    ]);
    const res = await app.request(`${base}/${SP_1}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "not-taught", note: "   " }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("not-taught");
    expect(body.note).toBeNull();
  });

  test("identical re-mark → 200 the honest no-op: NO writes, firstMarkedAt preserved, still one tx entry", async () => {
    const { app, sql, txRuns } = makeApp(asTeacher, [
      ownedClassRoute([classRow()]),
      nodeOneRoute([specPointRow()]),
      existingRoute([coverageRow()]), // status TAUGHT + note "week 3" already stored
    ]);
    const res = await app.request(`${base}/${SP_1}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: putBody,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.firstMarkedAt).toBe(new Date(T0).toISOString());
    expect(sql.queries.filter((q) => q.startsWith("insert into") || q.startsWith("update "))).toHaveLength(0);
    expect(txRuns()).toBe(1); // the boundary is unconditional on the PUT path
  });

  test("status flip: update + event carrying previous_status; firstMarkedAt NEVER mutates", async () => {
    const { app, sql } = makeApp(asTeacher, [
      ownedClassRoute([classRow()]),
      nodeOneRoute([specPointRow()]),
      existingRoute([coverageRow({ status: "NOT_TAUGHT", note: null })]),
      updateCoverageRoute(),
      insertEventRoute(),
    ]);
    const res = await app.request(`${base}/${SP_1}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: putBody,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("taught");
    expect(body.firstMarkedAt).toBe(new Date(T0).toISOString()); // FIRST-MARKED law
    const evt = sql.queries.find((q) => q.startsWith("insert into teaching_coverage_events"));
    expect(evt).toBeDefined();
  });

  test("400 bad body: {} → validation_failed 'status: must not be blank' BEFORE any statement", async () => {
    const { app, sql } = makeApp(asTeacher, []);
    const res = await app.request(`${base}/${SP_1}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(body.message).toBe("status: must not be blank");
    expect(sql.queries).toHaveLength(0);
  });

  test("400 bad body: empty status → 'status: must not be blank' (@NotBlank)", async () => {
    const { app, sql } = makeApp(asTeacher, []);
    const res = await app.request(`${base}/${SP_1}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "" }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe("status: must not be blank");
    expect(sql.queries).toHaveLength(0);
  });

  test("400 bad body: 501-char note → 'note: size must be between 0 and 500' (@Size)", async () => {
    const { app, sql } = makeApp(asTeacher, []);
    const res = await app.request(`${base}/${SP_1}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "taught", note: "x".repeat(501) }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe("note: size must be between 0 and 500");
    expect(sql.queries).toHaveLength(0);
  });

  test("400 bad body: wrong-typed status → 400 malformed_body verbatim (binding beats constraints)", async () => {
    const { app, sql } = makeApp(asTeacher, []);
    const res = await app.request(`${base}/${SP_1}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: 123 }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("malformed_body");
    expect(body.message).toBe("request body is not readable (check field types and enum values)");
    expect(sql.queries).toHaveLength(0);
  });

  test("400 bad body: malformed JSON → 400 malformed_body", async () => {
    const { app } = makeApp(asTeacher, []);
    const res = await app.request(`${base}/${SP_1}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("malformed_body");
  });

  test("constraint-valid unknown status → the SERVICE parse law: 400 bad_request verbatim", async () => {
    // the tolerant vocabulary (trim+lowercase, 'taught'|'not-taught'|'not_taught')
    // is service law (TeachingCoverage.Status.parse :43-50) — the route zod
    // pin deliberately does NOT own the vocabulary
    const { app } = makeApp(asTeacher, [
      ownedClassRoute([classRow()]),
      nodeOneRoute([specPointRow()]),
      existingRoute([]),
    ]);
    const res = await app.request(`${base}/${SP_1}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "  sometimes  " }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("bad_request");
    expect(body.message).toBe("status must be 'taught' or 'not-taught'");
  });

  test("gate ORDER: unknown class → 404 before the spec-point lookup", async () => {
    const { app, sql } = makeApp(asTeacher, [ownedClassRoute([])]);
    const res = await app.request(`${base}/${SP_1}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: putBody,
    });
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe("class not found");
    expect(sql.queries).toHaveLength(1); // class gate only
  });

  test("gate ORDER: archived class → 409 verbatim", async () => {
    const { app } = makeApp(asTeacher, [
      ownedClassRoute([classRow("ARCHIVED")]),
      nodeOneRoute([specPointRow()]),
      existingRoute([]),
    ]);
    const res = await app.request(`${base}/${SP_1}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: putBody,
    });
    expect(res.status).toBe(409);
    expect((await res.json()).message).toBe("this class is archived — reopen it before marking coverage");
  });

  test("gate ORDER: unknown spec point → 404 'specification point not found'", async () => {
    const { app } = makeApp(asTeacher, [
      ownedClassRoute([classRow()]),
      nodeOneRoute([]),
      existingRoute([]),
    ]);
    const res = await app.request(`${base}/${SP_1}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: putBody,
    });
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe("specification point not found");
  });

  test("V39 invariant: TOPIC node and null-applicability SUBTOPIC both → 400 'that node is not a specification point'", async () => {
    for (const node of [
      specPointRow({ node_type: "TOPIC" }),
      specPointRow({ applicability: null }),
    ]) {
      const { app } = makeApp(asTeacher, [
        ownedClassRoute([classRow()]),
        nodeOneRoute([node]),
        existingRoute([]),
      ]);
      const res = await app.request(`${base}/${SP_1}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: putBody,
      });
      expect(res.status).toBe(400);
      expect((await res.json()).message).toBe("that node is not a specification point");
    }
  });

  test("§17 ownership on the write too → 403 verbatim", async () => {
    const { app } = makeApp(asTeacher, [ownedClassRoute([classRow("ACTIVE", OTHER_TEACHER)])]);
    const res = await app.request(`${base}/${SP_1}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: putBody,
    });
    expect(res.status).toBe(403);
    expect((await res.json()).message).toBe("this class belongs to another teacher");
  });

  test("malformed uuids (class + spec point) → 400 'malformed request' before any statement", async () => {
    for (const path of [`/api/v1/teacher/classes/zz/coverage/${SP_1}`, `${base}/zz`]) {
      const { app, sql } = makeApp(asTeacher, []);
      const res = await app.request(path, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: putBody,
      });
      expect(res.status).toBe(400);
      expect((await res.json()).message).toBe("malformed request");
      expect(sql.queries).toHaveLength(0);
    }
  });
});

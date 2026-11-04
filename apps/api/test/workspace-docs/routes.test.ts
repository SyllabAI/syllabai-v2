/**
 * T-AUDIT-TIER1 run-003 route tests — the observable HTTP contract of the
 * workspace-docs router (routes/workspace-docs.ts) over an IN-MEMORY Hono
 * app wiring the REAL WorkspaceDocs service over stubbed sql (no Neon).
 *
 * Pinned: the authz shell (the Boot 401 before any handler work — three
 * legs), the hydration read contract (list validates against the REAL
 * contracts schema; the honest-null get — never a 404 on a fresh account),
 * the closed-vocabulary key gate (unknown key → 400 validation_failed
 * BEFORE any query), the PUT upsert receipt, the progress:<slug> family,
 * the five refused sibling keys (the run-002 teacher stores keep their own
 * plane), the two-envelope body law (malformed_body ×2 vs
 * validation_failed), the 413 plane cap, and the idempotent 204 delete.
 */
import { describe, expect, test } from "bun:test";
import { Hono, type Context } from "hono";
import { createWorkspaceDocsRouter } from "../../src/routes/workspace-docs";
import { WorkspaceDocs } from "../../src/services/workspace-docs";
import { toErrorResponse } from "../../src/services/identity/errors";
import { workspaceDocListSchema, workspaceDocGetSchema } from "@syllabai/contracts";
import { fakeSql, type Route } from "../assessment/helpers";

const USER = {
  email: "learner@example.edu",
  userId: "aa000000-0000-4000-8000-000000000001",
  roles: ["STUDENT"],
  tokenVersion: 1,
};
const anon = () => null;
const asUser = () => USER;

function makeApp(auth: (c: Context) => Record<string, unknown> | null, routes: Route[]) {
  const app = new Hono();
  app.use("*", async (c, next) => {
    const a = auth(c);
    if (a) c.set("syllabai.auth" as never, a as never);
    await next();
  });
  const sql = fakeSql(routes);
  app.route("/api/v1/me/documents", createWorkspaceDocsRouter(new WorkspaceDocs(sql as never)));
  app.onError((err, c) => {
    const mapped = toErrorResponse(err);
    if (mapped) return c.json(mapped.body, mapped.status as 400);
    console.error("[test] unhandled error:", err);
    return c.json(
      { status: 500, error: "internal_error", message: "an internal error occurred", timestamp: "2026-11-05T00:00:00.000Z" },
      500 as const,
    );
  });
  return { app, sql };
}

const DOC_ROW = {
  key: "tutor-threads",
  value: { threads: [{ id: "t_1", updatedAt: 1730000000000, messages: [] }] },
  updatedAt: "2026-11-05T00:00:00.000Z",
};

const LIST_ROUTE: Route = {
  match: /SELECT doc_key AS key, value, updated_at AS "updatedAt" FROM user_documents WHERE user_id = \? ORDER BY updated_at ASC/,
  rows: [DOC_ROW],
};
const GET_ROUTE: Route = {
  match: /FROM user_documents WHERE user_id = \? AND doc_key = \? LIMIT 1/,
  rows: [DOC_ROW],
};
const GET_EMPTY: Route = { match: GET_ROUTE.match, rows: [] };
const PUT_ROUTE: Route = {
  match: /INSERT INTO user_documents/,
  rows: [DOC_ROW],
};
const DELETE_ROUTE: Route = { match: /DELETE FROM user_documents/, rows: [{ key: "tutor-threads" }] };
const DELETE_ABSENT: Route = { match: DELETE_ROUTE.match, rows: [] };

describe("workspace-docs routes", () => {
  // ── the authz shell (the classroom.ts law, three legs) ────────────────
  test("401 shell — GET / without auth is the Boot 401 before any handler work", async () => {
    const { app } = makeApp(anon, []);
    const res = await app.request("/api/v1/me/documents");
    expect(res.status).toBe(401);
  });

  test("401 shell — GET /:key without auth", async () => {
    const { app } = makeApp(anon, []);
    const res = await app.request("/api/v1/me/documents/tutor-threads");
    expect(res.status).toBe(401);
  });

  test("401 shell — PUT /:key without auth (no query ran, no body read)", async () => {
    const { app } = makeApp(anon, []);
    const res = await app.request("/api/v1/me/documents/tutor-threads", {
      method: "PUT",
      body: JSON.stringify({ value: { threads: [] } }),
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(401);
  });

  // ── the hydration read contract ───────────────────────────────────────
  test("GET / — 200 list validating against the REAL contracts schema", async () => {
    const { app } = makeApp(asUser, [LIST_ROUTE]);
    const res = await app.request("/api/v1/me/documents");
    expect(res.status).toBe(200);
    const body = await res.json();
    const parsed = workspaceDocListSchema.safeParse(body);
    expect(parsed.success).toBe(true);
  });

  test("GET /:key — the honest-null read for an absent doc (200, never 404)", async () => {
    const { app } = makeApp(asUser, [GET_EMPTY]);
    const res = await app.request("/api/v1/me/documents/tutor-threads");
    expect(res.status).toBe(200);
    const body = await res.json();
    const parsed = workspaceDocGetSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.value).toBeNull();
      expect(parsed.data.updatedAt).toBeNull();
    }
  });

  // ── the closed-vocabulary key gate (fail-closed, before any query) ────
  test("GET /:key — unknown key → 400 validation_failed before any query", async () => {
    const { app, sql } = makeApp(asUser, []);
    const res = await app.request("/api/v1/me/documents/some-future-key");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(String(body.message)).toContain("key:");
    expect(sql.queries).toHaveLength(0); // fail-closed: no query ran
  });

  test("PUT /:key — 200 upsert receipt (key echoed, server updatedAt)", async () => {
    const { app, sql } = makeApp(asUser, [PUT_ROUTE]);
    const res = await app.request("/api/v1/me/documents/tutor-threads", {
      method: "PUT",
      body: JSON.stringify({ value: { threads: [] } }),
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.key).toBe("tutor-threads");
    expect(body.updatedAt).toBe("2026-11-05T00:00:00.000Z");
    expect(sql.queries).toHaveLength(1);
    expect(sql.queries[0]).toContain("ON CONFLICT (user_id, doc_key)");
  });

  test("PUT /:key — the progress:<slug> family parses (kebab slug)", async () => {
    const { app } = makeApp(asUser, [
      { match: /INSERT INTO user_documents/, rows: [{ ...DOC_ROW, key: "progress:igcse-chemistry-19" }] },
    ]);
    const res = await app.request("/api/v1/me/documents/progress:igcse-chemistry-19", {
      method: "PUT",
      body: JSON.stringify({ value: { seen: true } }),
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.key).toBe("progress:igcse-chemistry-19");
  });

  test("the five refused sibling keys — the run-002 teacher stores keep their own plane", async () => {
    const { app, sql } = makeApp(asUser, []);
    for (const key of ["saved-tests", "teaching-coverage", "content-reviews", "mock-results", "last-opened"]) {
      const res = await app.request(`/api/v1/me/documents/${key}`, {
        method: "PUT",
        body: JSON.stringify({ value: null }),
        headers: { "content-type": "application/json" },
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("validation_failed");
    }
    expect(sql.queries).toHaveLength(0);
  });

  // ── the two-envelope body law (R-1) ───────────────────────────────────
  test("PUT /:key — non-JSON body → 400 malformed_body", async () => {
    const { app } = makeApp(asUser, []);
    const res = await app.request("/api/v1/me/documents/tutor-threads", {
      method: "PUT",
      body: "not json at all",
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("malformed_body");
  });

  test("PUT /:key — array body → 400 malformed_body (binding failure beats constraints)", async () => {
    const { app } = makeApp(asUser, []);
    const res = await app.request("/api/v1/me/documents/tutor-threads", {
      method: "PUT",
      body: JSON.stringify([{ value: null }]),
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("malformed_body");
  });

  test("PUT /:key — absent value field → 400 validation_failed (the jakarta default)", async () => {
    const { app } = makeApp(asUser, []);
    const res = await app.request("/api/v1/me/documents/tutor-threads", {
      method: "PUT",
      body: JSON.stringify({ threads: [] }),
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(String(body.message)).toContain("value: must not be null");
  });

  // ── the 413 plane cap ─────────────────────────────────────────────────
  test("PUT /:key — value over the 512KB plane cap → 413 document_too_large", async () => {
    const { app, sql } = makeApp(asUser, []);
    const big = "x".repeat(512 * 1024 + 10);
    const res = await app.request("/api/v1/me/documents/tutor-threads", {
      method: "PUT",
      body: JSON.stringify({ value: { blob: big } }),
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error).toBe("document_too_large");
    expect(sql.queries).toHaveLength(0); // the cap runs before any query
  });

  test("PUT /:key — a value just under the cap passes the gate", async () => {
    const { app } = makeApp(asUser, [PUT_ROUTE]);
    const big = "x".repeat(400 * 1024);
    const res = await app.request("/api/v1/me/documents/tutor-threads", {
      method: "PUT",
      body: JSON.stringify({ value: { blob: big } }),
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(200);
  });

  // ── the delete law ────────────────────────────────────────────────────
  test("DELETE /:key — 204 on the stored doc", async () => {
    const { app, sql } = makeApp(asUser, [DELETE_ROUTE]);
    const res = await app.request("/api/v1/me/documents/tutor-threads", { method: "DELETE" });
    expect(res.status).toBe(204);
    expect(sql.queries).toHaveLength(1);
  });

  test("DELETE /:key — 204 on an absent doc (idempotent end-state)", async () => {
    const { app } = makeApp(asUser, [DELETE_ABSENT]);
    const res = await app.request("/api/v1/me/documents/tutor-threads", { method: "DELETE" });
    expect(res.status).toBe(204);
  });

  test("DELETE /:key — unknown key → 400 validation_failed before any query", async () => {
    const { app, sql } = makeApp(asUser, []);
    const res = await app.request("/api/v1/me/documents/some-future-key", { method: "DELETE" });
    expect(res.status).toBe(400);
    expect(sql.queries).toHaveLength(0);
  });
});

/**
 * Workspace-document route tests (T-AUDIT-TIER1) — the observable HTTP
 * contract of /api/v1/me/documents over REAL services on stubbed sql (the
 * 032 route-test pattern, learner-pdf-drawings harness). 200 bodies
 * validated against the canonical contracts; the error envelopes pinned to
 * the Boot 401 shell + the allow-list 400 / malformed-400 / oversized-413
 * law; the owner id rides the JWT context (no wire shape carries a userId).
 */
import { describe, expect, test } from "bun:test";
import { Hono, type Context } from "hono";
import { createWorkspaceDocsRouter } from "../../src/routes/workspace-docs";
import { WorkspaceDocs } from "../../src/services/workspace-docs";
import { toErrorResponse } from "../../src/services/identity/errors";
import { workspaceDocListSchema, workspaceDocGetSchema } from "@syllabai/contracts";

const USER = "aa645313-5930-4381-91ed-caff67a2f836";

type Route = {
  match: RegExp;
  rows?: Array<Record<string, unknown>>;
  rowsFor?: (params: unknown[]) => Array<Record<string, unknown>>;
};

const row = (over: Partial<Record<string, unknown>> = {}) => ({
  doc_key: "last-opened",
  value: { slug: "igcse-chemistry-19", resource: "hub", ts: 1 },
  updated_at: "2026-11-03T00:00:00Z",
  ...over,
});

const listRoute: Route = {
  match: /from user_documents where user_id = \? ::uuid order by updated_at asc/,
  rows: [],
  rowsFor: (params) => (params[0] === USER ? [row(), row({ doc_key: "mock-results", value: [] })] : []),
};

const getRoute: Route = {
  match: /from user_documents where user_id = \? ::uuid and doc_key = \?$/,
  rows: [],
  rowsFor: (params) => (params[0] === USER && params[1] === "last-opened" ? [row()] : []),
};

const putRoute: Route = {
  match: /insert into user_documents/,
  rows: [],
  rowsFor: (params) => [
    row({ doc_key: params[1], value: JSON.parse(params[2] as string), updated_at: "2026-11-03T00:01:00Z" }),
  ],
};

const deleteRoute: Route = {
  match: /delete from user_documents/,
  rows: [],
};

function makeApp(auth: (c: Context) => Record<string, unknown> | null, opts: { extra?: Route[] } = {}) {
  const all = [...(opts.extra ?? []), deleteRoute, putRoute, getRoute, listRoute];
  const sql = (async (strings: TemplateStringsArray, ...params: unknown[]) => {
    const text = strings.join(" ? ").replace(/\s+/g, " ").trim();
    const hit = all.find((r) => r.match.test(text));
    if (!hit) throw new Error("unexpected query: " + text);
    return hit.rowsFor ? hit.rowsFor(params) : hit.rows!;
  }) as never;
  const store = new WorkspaceDocs(sql);
  const app = new Hono();
  app.use("*", async (c, next) => {
    const a = auth(c);
    if (a) c.set("syllabai.auth" as never, a as never);
    await next();
  });
  app.route("/api/v1/me/documents", createWorkspaceDocsRouter(store));
  return app;
}

const signedIn = () => ({ email: "s@example.com", userId: USER, roles: ["STUDENT"], tokenVersion: 1 });

async function run(app: Hono, method: string, path: string, body?: unknown) {
  const res = await app.request(path, {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } } : {}),
  });
  let json: unknown = null;
  if (res.status !== 204) {
    try {
      json = await res.json();
    } catch {
      json = null;
    }
  }
  return { res, json };
}

describe("POSTURE — the auth shell", () => {
  test("anonymous GET list → the Boot 401 body, before any handler work", async () => {
    const { res, json } = await run(makeApp(() => null), "GET", "/api/v1/me/documents");
    expect(res.status).toBe(401);
    expect(json).toMatchObject({ status: 401, error: "Unauthorized" });
  });

  test("anonymous PUT → 401 shell (no query runs, nothing stored)", async () => {
    const { res } = await run(makeApp(() => null), "PUT", "/api/v1/me/documents/last-opened", { value: { a: 1 } });
    expect(res.status).toBe(401);
  });
});

describe("GET / — the hydration list", () => {
  test("200 with every stored doc, contracts-validated", async () => {
    const { res, json } = await run(makeApp(signedIn), "GET", "/api/v1/me/documents");
    expect(res.status).toBe(200);
    const parsed = workspaceDocListSchema.safeParse(json);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.docs.map((d) => d.key)).toEqual(["last-opened", "mock-results"]);
    }
  });
});

describe("GET /:key — honest-null posture", () => {
  test("stored key → 200 the row", async () => {
    const { res, json } = await run(makeApp(signedIn), "GET", "/api/v1/me/documents/last-opened");
    expect(res.status).toBe(200);
    expect(workspaceDocGetSchema.safeParse(json).success).toBe(true);
    expect(json).toMatchObject({ key: "last-opened" });
  });

  test("never-written key → 200 {value:null, updatedAt:null} (no 404 special-casing)", async () => {
    const { res, json } = await run(makeApp(signedIn), "GET", "/api/v1/me/documents/deck-sessions");
    expect(res.status).toBe(200);
    expect(json).toEqual({ key: "deck-sessions", value: null, updatedAt: null });
  });

  test("unknown key → 400 validation_failed, no query runs", async () => {
    const { res, json } = await run(makeApp(signedIn), "GET", "/api/v1/me/documents/anything-else");
    expect(res.status).toBe(400);
    expect(json).toMatchObject({ error: "validation_failed" });
    expect((json as { message?: string }).message).toContain("key:");
  });
});

describe("PUT /:key — the write-through", () => {
  test("allow-listed key → 200 the stored row (upsert receipt)", async () => {
    const value = { threads: [], activeId: null };
    const { res, json } = await run(makeApp(signedIn), "PUT", "/api/v1/me/documents/tutor-threads", { value });
    expect(res.status).toBe(200);
    expect(json).toMatchObject({ key: "tutor-threads", value, updatedAt: "2026-11-03T00:01:00.000Z" });
  });

  test("progress:<slug> keys ride the pattern arm of the allow-list", async () => {
    const { res, json } = await run(
      makeApp(signedIn),
      "PUT",
      "/api/v1/me/documents/progress:igcse-chemistry-19",
      { value: { notesRead: {} } },
    );
    expect(res.status).toBe(200);
    expect(json).toMatchObject({ key: "progress:igcse-chemistry-19" });
  });

  test("unknown key → 400 validation_failed (the closed-vocabulary law)", async () => {
    const { res, json } = await run(makeApp(signedIn), "PUT", "/api/v1/me/documents/my-own-key", { value: {} });
    expect(res.status).toBe(400);
    expect(json).toMatchObject({ error: "validation_failed" });
  });

  test("unreadable body → 400 malformed_body", async () => {
    const app = makeApp(signedIn);
    const res = await app.request("/api/v1/me/documents/last-opened", {
      method: "PUT",
      body: "{not json",
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "malformed_body" });
  });

  test("body without the value field → 400 malformed_body", async () => {
    const { res } = await run(makeApp(signedIn), "PUT", "/api/v1/me/documents/last-opened", {});
    expect(res.status).toBe(400);
  });

  test("value over the 512 KB envelope → 413 document_too_large", async () => {
    const big = { blob: "x".repeat(512 * 1024 + 10) };
    const { res, json } = await run(makeApp(signedIn), "PUT", "/api/v1/me/documents/mock-results", { value: big });
    expect(res.status).toBe(413);
    expect(json).toMatchObject({ error: "document_too_large" });
  });
});

describe("DELETE /:key — the clear path", () => {
  test("204, idempotent", async () => {
    const { res } = await run(makeApp(signedIn), "DELETE", "/api/v1/me/documents/test-builder-drafts");
    expect(res.status).toBe(204);
  });
});

describe("error envelope normalization", () => {
  test("toErrorResponse normalizes thrown Boot parity errors", () => {
    expect(toErrorResponse(new Error("boom"))).toBeNull();
  });
});

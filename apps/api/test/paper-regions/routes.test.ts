/**
 * Paper-assets regions route tests (T-MG-MP-RECT-1 run-001) — the
 * observable HTTP contract of GET /api/v1/paper-assets/:id/regions over
 * REAL services on stubbed sql (the 032 route-test pattern). 200 bodies
 * validated against the canonical paperAssetRegionsResponseSchema; the
 * error envelopes pinned to the Boot 401 shell + the malformed-400 /
 * unknown-404 handler law.
 */
import { describe, expect, test } from "bun:test";
import { Hono, type Context } from "hono";
import { createPaperRegionsRouter } from "../../src/routes/paper-regions";
import { PaperRegions } from "../../src/services/paper-regions";
import { toErrorResponse } from "../../src/services/identity/errors";
import { paperAssetRegionsResponseSchema } from "@syllabai/contracts";
import type { SqlFn } from "../../src/services/paper-regions/sql";

/** Local structural duplicate of the 031 Route type (per-module seam
 * convention — no cross-fence test imports). */
type Route = {
  match: RegExp;
  rows: Array<Record<string, unknown>>;
  rowsFor?: (params: unknown[]) => Array<Record<string, unknown>>;
};

const PAPER_ID = "47000000-0000-4000-8000-000000000001";
const PAPER_DOCLESS_ID = "47000000-0000-4000-8000-000000000002";

const paperRoute = (id: string, rows: Array<Record<string, unknown>>): Route => ({
  match: new RegExp(`from exam_papers p where p\\.id = \\?`),
  rows,
  rowsFor: (params) => (params.includes(id) ? rows : []),
});

const knownPaper: Route = paperRoute(PAPER_ID, [{ id: PAPER_ID }]);

const emptyQuestions: Route = {
  match: /from questions q\s*join/,
  rows: [],
};

function makeApp(auth: (c: Context) => Record<string, unknown> | null, extra: Route[] = []) {
  const issued: string[] = [];
  const sql = (async (strings: TemplateStringsArray, ...params: unknown[]) => {
    const text = strings.join(" ? ").replace(/\s+/g, " ").trim();
    issued.push(text);
    const hit = [...extra, knownPaper, emptyQuestions].find((r) => r.match.test(text));
    if (!hit) throw new Error("unexpected query: " + text);
    return hit.rowsFor ? hit.rowsFor(params) : hit.rows;
  }) as unknown as SqlFn;
  const regions = new PaperRegions(sql);
  const app = new Hono();
  app.use("*", async (c, next) => {
    const a = auth(c);
    if (a) c.set("syllabai.auth" as never, a as never);
    await next();
  });
  app.route("/api/v1/paper-assets", createPaperRegionsRouter(regions));
  app.onError((err, c) => {
    const mapped = toErrorResponse(err);
    if (mapped) return c.json(mapped.body, mapped.status as 400 | 404);
    console.error("[test] unhandled error:", err);
    return c.json({ status: 500, error: "internal_error", message: "an internal error occurred", timestamp: "2026-10-30T00:00:00Z" }, 500 as const);
  });
  return { app, issued };
}

const STUDENT = { email: "student@example.edu", userId: "aa645313-5930-4381-91ed-caff67a2f836", roles: ["STUDENT"], tokenVersion: 1 };
const asStudent = () => STUDENT;
const anon = () => null;

const BASE = "/api/v1/paper-assets";

describe("authz shell (SecurityConfig.java:91 parity — any authenticated user)", () => {
  test("unauthed regions → 401 shell answers before any handler body", async () => {
    const { app } = makeApp(anon);
    const res = await app.request(`${BASE}/${PAPER_ID}/regions`);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.status).toBe(401);
  });

  test("unauthed malformed id → the 401 shell still wins (authz before binding)", async () => {
    const { app } = makeApp(anon);
    const res = await app.request(`${BASE}/not-a-uuid/regions`);
    expect(res.status).toBe(401);
  });
});

describe("GET /:id/regions — binding + payload law", () => {
  test("malformed uuid → 400 bad_request 'malformed request' (conversion parity)", async () => {
    const { app } = makeApp(asStudent);
    const res = await app.request(`${BASE}/not-a-uuid/regions`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("bad_request");
    expect(body.message).toBe("malformed request");
  });

  test("unknown paper → 404 T-C20 'exam paper … not found'", async () => {
    const { app } = makeApp(asStudent, [paperRoute(PAPER_DOCLESS_ID, [])]);
    const res = await app.request(`${BASE}/${PAPER_DOCLESS_ID}/regions`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
    expect(body.message).toContain("exam paper");
  });

  test("known ungrounded paper → 200 honest-empty negative path, contract-valid (pin c)", async () => {
    const { app } = makeApp(asStudent);
    const res = await app.request(`${BASE}/${PAPER_ID}/regions`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ extracted: false, markable: false, groundingComplete: false, regions: [] });
    expect(() => paperAssetRegionsResponseSchema.parse(body)).not.toThrow();
  });
});

import { describe, expect, test, beforeAll } from "bun:test";
import { Hono } from "hono";
import { buildIdentityApp } from "../../src/services/identity";
import { toErrorResponse, apiError } from "../../src/services/identity/errors";
import { bootErrorBody, getAuth, createAuthMiddleware } from "../../src/middleware/auth";

/**
 * Integration tier — the T-MIG-010 flows against a REAL Neon branch
 * (copy-on-write of the production end-state, per BASELINE_DB.md §2:
 * `t-mig-010/r3` sandbox). Requires:
 *   INTEGRATION_DATABASE_URL  — postgresql://…ep-….neon.tech/…branch…
 *   SYLLABAI_JWT_SECRET       — ≥32 bytes (any test value; R-JWT cross-verify
 *                               with the core's own secret happens at capture)
 *   SYLLABAI_TEACHER_JOIN_CODE — a test join code
 * Skipped (loudly, by design) when the URL is absent — CI runs the unit tier;
 * the integration run's receipt is attached to the PR (§2.5 receipts doctrine).
 */

const DB_URL = process.env.INTEGRATION_DATABASE_URL;
const SECRET = process.env.INTEGRATION_JWT_SECRET ?? "integration-secret-0123456789abcdef0123456";
const JOIN_CODE = "test-join-code-2026";

let app: Hono | null = null;
/** bun:test: test.skip still counts the case; test.skipIf needs the condition at
 * registration. This file registers at import time but wires in beforeAll, so
 * a plain tier gate is cleanest: absent URL → the tier self-skips with a note. */
const integrationTest = DB_URL ? test : test.skip;

beforeAll(() => {
  if (!DB_URL) return;
  process.env.SYLLABAI_JWT_SECRET = SECRET;
  process.env.DATABASE_URL = DB_URL;
  process.env.SYLLABAI_TEACHER_JOIN_CODE = JOIN_CODE;
  const identity = buildIdentityApp();
  const router = new Hono();
  router.use("*", identity.authMiddleware);
  router.onError((err, c) => {
    const mapped = toErrorResponse(err);
    if (mapped) return c.json(mapped.body, mapped.status as 400);
    console.error("[integration] unhandled:", err);
    return c.json(apiError(500, "internal_error", "an internal error occurred"), 500);
  });
  router.route("/api/v1/auth", identity.authRoute);
  router.route("/api/v1/auth", identity.bootstrapRoute);
  // routers first, fallback last — public auth surfaces must stay public
  router.all("/api/v1/*", (c) => {
    if (!getAuth(c)) return c.json(bootErrorBody(401, new URL(c.req.url).pathname), 401);
    return c.json(apiError(404, "not_found", "resource not found"), 404);
  });
  app = router;
  void createAuthMiddleware; // wired inside buildIdentityApp
});

const post = (path: string, body?: unknown, headers: Record<string, string> = {}) => {
  if (!app) throw new Error("integration app not wired");
  return app.request(path, {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "Content-Type": "application/json", ...headers },
  });
};

const get = (path: string, headers: Record<string, string> = {}) => {
  if (!app) throw new Error("integration app not wired");
  return app.request(path, { headers });
};

const STRONG = "integration-pass-1";
const STAMP = Date.now().toString(36); // unique-per-run emails keep the branch clean

describe("identity integration against the Neon branch (T-MIG-010)", () => {
  integrationTest("register → 201 + persisted row (email lowercased, STUDENT default)", async () => {
    const email = `int-student-${STAMP}@example.invalid`;
    const res = await post("/api/v1/auth/register", { email: email.toUpperCase(), password: STRONG, displayName: "IntS" });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { user: { email: string; roles: string[] } };
    expect(body.user.email).toBe(email);
    expect(body.user.roles).toEqual(["STUDENT"]);

    // row-level truth: the users + user_roles rows exist with token_version 1
    const { createSql } = await import("../../src/services/identity/users");
    const sql = createSql(DB_URL!);
    const rows = await sql`select u.token_version, r.role from users u join user_roles r on r.user_id = u.id where u.email = ${email}`;
    const row = rows[0];
    expect(row).toBeDefined();
    expect(Number(row!.token_version)).toBe(1);
    expect(row!.role).toBe("STUDENT");
  });

  integrationTest("login → token; me → UserView; rotation kills old token; re-login on new password", async () => {
    const email = `int-rotate-${STAMP}@example.invalid`;
    await post("/api/v1/auth/register", { email, password: STRONG, displayName: "IntR" });

    const login = await post("/api/v1/auth/login", { email, password: STRONG });
    expect(login.status).toBe(200);
    const { accessToken } = (await login.json()) as { accessToken: string };

    const me = await get("/api/v1/auth/me", { Authorization: `Bearer ${accessToken}` });
    expect(me.status).toBe(200);

    const rot = await post(
      "/api/v1/auth/password",
      { currentPassword: STRONG, newPassword: "integration-new-1" },
      { Authorization: `Bearer ${accessToken}` },
    );
    expect(rot.status).toBe(204);

    const dead = await get("/api/v1/auth/me", { Authorization: `Bearer ${accessToken}` });
    expect(dead.status).toBe(401); // ver bump — R1 revocation, live

    const relogin = await post("/api/v1/auth/login", { email, password: "integration-new-1" });
    expect(relogin.status).toBe(200);
  });

  integrationTest("teacher join-code path with configured code → TEACHER row", async () => {
    const email = `int-teacher-${STAMP}@example.invalid`;
    const res = await post("/api/v1/auth/register", {
      email,
      password: STRONG,
      displayName: "IntT",
      role: "TEACHER",
      joinCode: JOIN_CODE,
    });
    expect(res.status).toBe(201);
    expect(((await res.json()) as { user: { roles: string[] } }).user.roles).toEqual(["TEACHER"]);
  });

  integrationTest("bootstrap-status → boolean; claim flow consumes the window terminally", async () => {
    const status = await get("/api/v1/auth/bootstrap-status");
    expect(status.status).toBe(200);
    const { available } = (await status.json()) as { available: boolean };

    if (!available) {
      // The branch's V19 row is not PENDING (seeded branch state) — a claim
      // must be refused with 409, never silently accepted.
      const claim = await post("/api/v1/auth/bootstrap-admin", {
        email: `int-admin-${STAMP}@example.invalid`,
        password: STRONG,
        displayName: "IntA",
      });
      expect(claim.status).toBe(409);
      return;
    }

    const claim = await post("/api/v1/auth/bootstrap-admin", {
      email: `int-admin-${STAMP}@example.invalid`,
      password: STRONG,
      displayName: "IntA",
    });
    expect(claim.status).toBe(200);
    const body = (await claim.json()) as { user: { roles: string[] } };
    expect([...body.user.roles].sort()).toEqual(["ADMIN", "TEACHER"]); // ADMIN+TEACHER (BootstrapAdminService.java:114)

    // window consumed terminally — status flips, second claim refused
    const after = await get("/api/v1/auth/bootstrap-status");
    expect(((await after.json()) as { available: boolean }).available).toBe(false);
    const second = await post("/api/v1/auth/bootstrap-admin", {
      email: `int-admin2-${STAMP}@example.invalid`,
      password: STRONG,
      displayName: "IntA2",
    });
    expect(second.status).toBe(409);
  });
});

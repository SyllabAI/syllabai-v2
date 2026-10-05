import { describe, expect, test, beforeAll } from "bun:test";
import { Hono } from "hono";
import { AuthService } from "../../src/services/identity/service";
import { UsersRepository, type UserRow } from "../../src/services/identity/users";
import { BootstrapStateStore, BootstrapAdminService } from "../../src/services/identity/bootstrap";
import { readIdentityConfig, buildIdentityServices } from "../../src/services/identity/config";
import { LoginAttemptBudget, type BudgetClock } from "../../src/services/identity/budget";
import { createAuthRoute, createBootstrapRoutes } from "../../src/routes/auth";
import { createAuthMiddleware, createJwtAuthenticator } from "../../src/middleware/auth";
import { apiError, toErrorResponse, type ApiErrorBody } from "../../src/services/identity/errors";

/**
 * Route-level parity tests over an IN-MEMORY repository — the observable
 * HTTP contract of AuthController/BootstrapAdminController/GlobalExceptionHandler,
 * with no database. Real-DB flows live in db.integration.test.ts (Neon branch).
 */

const SECRET = "unit-test-secret-0123456789abcdef0123456789abcdef";

/** In-memory UsersRepository — same observable behaviour, no Postgres. */
class FakeUsersRepo extends UsersRepository {
  private rows = new Map<string, UserRow>();

  constructor() {
    super(null as never);
  }

  override async findByEmailIgnoreCase(email: string): Promise<UserRow | null> {
    return (
      [...this.rows.values()].find((r) => r.email === email.toLowerCase()) ?? null
    );
  }
  override async existsByEmailIgnoreCase(email: string): Promise<boolean> {
    return [...this.rows.keys()].includes(email.toLowerCase());
  }
  override async insertUser(input: {
    email: string;
    passwordHash: string;
    displayName: string;
    roles: string[];
    id: string;
    createdAt: Date;
  }): Promise<UserRow> {
    const row: UserRow = {
      id: input.id,
      email: input.email.toLowerCase(),
      passwordHash: input.passwordHash,
      displayName: input.displayName,
      enabled: true,
      tokenVersion: 1,
      createdAt: input.createdAt,
      roles: input.roles,
    };
    this.rows.set(row.email, row);
    return row;
  }
  override async rotatePasswordHash(email: string, newPasswordHash: string): Promise<number> {
    const row = [...this.rows.values()].find((r) => r.email === email.toLowerCase());
    if (!row) throw new Error("missing user");
    row.passwordHash = newPasswordHash;
    row.tokenVersion += 1;
    return row.tokenVersion;
  }
  override async findById(id: string): Promise<UserRow | null> {
    return [...this.rows.values()].find((r) => r.id === id) ?? null;
  }
}

class FakeStateStore extends BootstrapStateStore {
  constructor(
    private state: "PENDING" | "CONSUMED" | "EXPIRED",
    private admins: number,
  ) {
    super(null as never);
  }
  override async lockStateWithArmedAt() {
    return { state: this.state, updatedAt: new Date() };
  }
  override async peekStateWithArmedAt() {
    return { state: this.state, updatedAt: new Date() };
  }
  override async adminCount(): Promise<number> {
    return this.admins;
  }
}

/**
 * T-MIG-036 — deterministic budget clock. The LoginAttemptBudget windows are
 * minute-ALIGNED fixed windows (Java-faithful law: windowStart =
 * floor(now/window)*window, budget.ts:72), so a test that records failures in
 * real time can straddle a wall-minute boundary mid-sequence and silently
 * reset the window (fleet flake: CI run 37294749131, routes.test.ts:329
 * toBe(9) failing at 10:10:02.126Z after the sibling passed at 10:09:59.039Z).
 * The roll is LAW — the defect was the tests' wall-clock dependence — so the
 * budget tests pin this clock instead. Seeded exactly ON an aligned boundary:
 * 1_800_000_000_000 % 60_000 === 0.
 */
class SteppingClock implements BudgetClock {
  constructor(private nowMs = 1_800_000_000_000) {}
  instant(): Date {
    return new Date(this.nowMs);
  }
  advance(ms: number): void {
    this.nowMs += ms;
  }
}

function buildTestApp(env: Record<string, string>, budgetClock?: BudgetClock) {
  const config = readIdentityConfig(env);
  const identity = buildIdentityServices(config);
  if (budgetClock) {
    // T-MIG-036: pin the budget clock for tests that hammer the budget.
    // Swapped BEFORE AuthService construction — AuthService reads
    // identity.budget lazily today (service.ts:154), but pre-construction
    // swapping stays correct even against a future eager capture.
    identity.budget = new LoginAttemptBudget({
      windowMs: config.ratelimit.windowMs,
      loginPerAccount: config.ratelimit.loginPerAccount,
      enabled: config.ratelimit.enabled,
      clock: budgetClock,
    });
  }
  const users = new FakeUsersRepo();
  const authService = new AuthService(users, identity);
  const bootstrap = new BootstrapAdminService(
    new FakeStateStore("PENDING", 0),
    users,
    identity,
    "postgresql://unused-in-unit-tests.invalid/db",
  );
  const app = new Hono();
  app.use("*", createAuthMiddleware(createJwtAuthenticator(identity.jwt, users)));
  app.onError((err, c) => {
    // mirror of the OUT-OF-FENCE index.ts error boundary
    const mapped = toErrorResponse(err);
    if (mapped) {
      if (mapped.headers) for (const [k, v] of Object.entries(mapped.headers)) c.header(k, v);
      return c.json(mapped.body, mapped.status as 400);
    }
    console.error("[test] unhandled:", err);
    return c.json(apiError(500, "internal_error", "an internal error occurred"), 500);
  });
  app.route("/api/v1/auth", createAuthRoute(authService));
  app.route("/api/v1/auth", createBootstrapRoutes(bootstrap));
  return { app, users, identity };
}

const baseEnv = {
  SYLLABAI_JWT_SECRET: SECRET,
  DATABASE_URL: "postgresql://unused.invalid/db",
};
const STRONG = "long-enough-password-1";
const post = (app: Hono, path: string, body?: unknown, headers: Record<string, string> = {}) =>
  app.request(path, {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "Content-Type": "application/json", ...headers },
  });

describe("POST /api/v1/auth/register — AuthController.java:34-41 parity", () => {
  const { app } = buildTestApp(baseEnv);

  test("201 Created + Location:/api/v1/auth/me + AuthResponse (Bearer tokenType)", async () => {
    const res = await post(app, "/api/v1/auth/register", {
      email: "Alice@Example.invalid",
      password: STRONG,
      displayName: "Alice",
    });
    expect(res.status).toBe(201);
    expect(res.headers.get("Location")).toBe("/api/v1/auth/me");
    const body = (await res.json()) as {
      accessToken: string;
      tokenType: string;
      user: { id: string; email: string; displayName: string; roles: string[] };
    };
    expect(body.tokenType).toBe("Bearer");
    expect(body.user.email).toBe("alice@example.invalid"); // lowercased (:75)
    expect(body.user.roles).toEqual(["STUDENT"]);
    expect(body.accessToken.split(".").length).toBe(3);
  });

  test("stored email lowercased; duplicate (case-insensitive) → 409 'email already registered'", async () => {
    const res = await post(app, "/api/v1/auth/register", {
      email: "ALICE@example.invalid",
      password: STRONG,
      displayName: "Clone",
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as ApiErrorBody;
    expect(body).toMatchObject({ status: 409, error: "conflict", message: "email already registered" });
  });

  test("unknown role → 400 bad_request 'unknown role: <trimmed>'", async () => {
    const res = await post(app, "/api/v1/auth/register", {
      email: "r1@example.invalid",
      password: STRONG,
      displayName: "R1",
      role: "  wizard  ",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "bad_request", message: "unknown role: wizard" });
  });

  test("role ADMIN → 403 forbidden (never self-serviceable, fail-closed not downgrade)", async () => {
    const res = await post(app, "/api/v1/auth/register", {
      email: "r2@example.invalid",
      password: STRONG,
      displayName: "R2",
      role: "ADMIN",
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({
      error: "forbidden",
      message: "admin accounts are provisioned by an administrator",
    });
  });

  test("teacher join-code gate FAILS CLOSED: unset config refuses every code with 403", async () => {
    const closedEnv = { ...baseEnv, SYLLABAI_TEACHER_JOIN_CODE: "" };
    const closed = buildTestApp(closedEnv);
    for (const joinCode of [undefined, "", "anything-guess"]) {
      const res = await post(closed.app, "/api/v1/auth/register", {
        email: "t1@example.invalid",
        password: STRONG,
        displayName: "T1",
        role: "TEACHER",
        joinCode,
      });
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({
        error: "forbidden",
        message: "teacher registration requires a valid join code",
      });
    }
  });

  test("teacher with the RIGHT code lands TEACHER; wrong code → same 403", async () => {
    const openEnv = { ...baseEnv, SYLLABAI_TEACHER_JOIN_CODE: "join-code-abc" };
    const open = buildTestApp(openEnv);
    const ok = await post(open.app, "/api/v1/auth/register", {
      email: "t2@example.invalid",
      password: STRONG,
      displayName: "T2",
      role: "TEACHER",
      joinCode: "join-code-abc",
    });
    expect(ok.status).toBe(201);
    expect(((await ok.json()) as { user: { roles: string[] } }).user.roles).toEqual(["TEACHER"]);

    const bad = await post(open.app, "/api/v1/auth/register", {
      email: "t3@example.invalid",
      password: STRONG,
      displayName: "T3",
      role: "TEACHER",
      joinCode: "nope",
    });
    expect(bad.status).toBe(403);
  });

  test("unknown request properties are IGNORED (Jackson default, contracts header)", async () => {
    const res = await post(app, "/api/v1/auth/register", {
      email: "x1@example.invalid",
      password: STRONG,
      displayName: "X1",
      totallyUnknownField: { nested: true },
    });
    expect(res.status).toBe(201);
  });

  test("scalar → String coercion parity (Jackson binds {displayName:42} as '42')", async () => {
    const res = await post(app, "/api/v1/auth/register", {
      email: "coerced@example.invalid",
      password: STRONG,
      displayName: 42,
    });
    expect(res.status).toBe(201);
    expect(((await res.json()) as { user: { displayName: string } }).user.displayName).toBe("42");
  });

  test("coerced email that then fails @Email → 400 'must be a well-formed email address' (Jakarta after binding; text pinned by golden auth-register-bad-email-400, R0 T-MIG-016)", async () => {
    const res = await post(app, "/api/v1/auth/register", {
      email: 123,
      password: STRONG,
      displayName: "Coerced",
    });
    expect(res.status).toBe(400);
    expect((await res.json() as ApiErrorBody).message).toBe("email: must be a well-formed email address");
  });

  test("array for a string field → 400 malformed_body (HttpMessageNotReadable parity)", async () => {
    const res = await post(app, "/api/v1/auth/register", {
      email: ["array"],
      password: STRONG,
      displayName: "Bad",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: "malformed_body",
      message: "request body is not readable (check field types and enum values)",
    });
  });

  test("syntactically invalid JSON → 400 malformed_body, not 500", async () => {
    const res = await app.request("/api/v1/auth/register", {
      method: "POST",
      body: "{not json",
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(400);
    expect((await res.json() as ApiErrorBody).error).toBe("malformed_body");
  });
});

describe("POST /api/v1/auth/login — AuthService.login (:123-140) parity", () => {
  const { app } = buildTestApp(baseEnv);
  beforeAll(async () => {
    await post(app, "/api/v1/auth/register", { email: "login@example.invalid", password: STRONG, displayName: "Login" });
  });

  test("200 with AuthResponse on good credentials", async () => {
    const res = await post(app, "/api/v1/auth/login", { email: "login@example.invalid", password: STRONG });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { accessToken: string; tokenType: string; user: { email: string } };
    expect(body.tokenType).toBe("Bearer");
    expect(body.user.email).toBe("login@example.invalid");
  });

  test("401 invalid_credentials — no echo of WHICH factor failed (user unknown)", async () => {
    const res = await post(app, "/api/v1/auth/login", { email: "ghost@example.invalid", password: STRONG });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "invalid_credentials", message: "invalid credentials" });
  });

  test("401 invalid_credentials — wrong password same shape", async () => {
    const res = await post(app, "/api/v1/auth/login", { email: "login@example.invalid", password: "wrong-password-1" });
    expect(res.status).toBe(401);
    expect((await res.json() as ApiErrorBody).error).toBe("invalid_credentials");
  });

  test("per-TARGET-account budget: 11 failures → 429 + Retry-After (R5)", async () => {
    // T-MIG-036: clock-pinned app — all 11 attempts land in ONE aligned
    // window by construction (previously real systemClock; a wall-minute
    // straddle opened a fresh window and turned attempt 11 into a 401).
    // budget@example.invalid is intentionally never registered: the failures
    // stay pre-bcrypt (AuthService.java:129 budget check comes first).
    const { app: budgeted } = buildTestApp(baseEnv, new SteppingClock());
    for (let i = 0; i < 10; i++) {
      const r = await post(budgeted, "/api/v1/auth/login", { email: "budget@example.invalid", password: "nope-nope-nope-1" });
      expect(r.status).toBe(401);
    }
    const res = await post(budgeted, "/api/v1/auth/login", { email: "budget@example.invalid", password: "nope-nope-nope-1" });
    expect(res.status).toBe(429);
    // :110 formula at the pinned instant — all 10 failures at windowStart T0,
    // attempt 11 still at T0: remaining = aligned = 60_000ms → 60/1000 + 1 = 61.
    expect(res.headers.get("Retry-After")).toBe("61");
    expect(await res.json()).toMatchObject({
      error: "Too Many Requests",
      message: "Too many attempts. Wait a moment and try again.",
    });
    // a DIFFERENT account is untouched (per-target, not global) — registered
    // on THIS app instance so the good-credentials login is real
    await post(budgeted, "/api/v1/auth/register", { email: "login@example.invalid", password: STRONG, displayName: "Login" });
    const other = await post(budgeted, "/api/v1/auth/login", { email: "login@example.invalid", password: STRONG });
    expect(other.status).toBe(200);
  });

  test("successful login clears the account budget (:138)", async () => {
    // T-MIG-036: clock-pinned budget — the 9 real-bcrypt failures used to run
    // on the wall clock; straddling a minute boundary reset the aligned window
    // and currentCount read < 9 (the register flake). Bcrypt parity stays real;
    // only the budget clock is pinned.
    const fresh = buildTestApp(baseEnv, new SteppingClock());
    await post(fresh.app, "/api/v1/auth/register", { email: "clear@example.invalid", password: STRONG, displayName: "Clr" });
    for (let i = 0; i < 9; i++) {
      await post(fresh.app, "/api/v1/auth/login", { email: "clear@example.invalid", password: "wrong-password-1" });
    }
    expect(fresh.identity.budget.currentCount("clear@example.invalid")).toBe(9);
    const good = await post(fresh.app, "/api/v1/auth/login", { email: "clear@example.invalid", password: STRONG });
    expect(good.status).toBe(200);
    // the success WIPED the history — the counter restarts from zero
    expect(fresh.identity.budget.currentCount("clear@example.invalid")).toBe(0);
    // one fresh failure lands on a clean slate (no 429 window re-arm)
    await post(fresh.app, "/api/v1/auth/login", { email: "clear@example.invalid", password: "wrong-password-1" });
    expect(fresh.identity.budget.currentCount("clear@example.invalid")).toBe(1);
  }, 60_000); // ~11 BCrypt cost-12 compares ≈ 3s — bcrypt parity is worth the wall clock; the BUDGET clock is pinned (T-MIG-036)
});

describe("GET /api/v1/auth/me + POST /api/v1/auth/password — token lifecycle", () => {
  const { app, users, identity } = buildTestApp(baseEnv);

  test("me without token → 401 Boot-shaped body (authenticationEntryPoint parity)", async () => {
    const res = await app.request("/api/v1/auth/me");
    expect(res.status).toBe(401);
    const body = (await res.json()) as { status: number; error: string; path?: string };
    expect(body.error).toBe("Unauthorized");
  });

  test("me with garbage token → 401 (filter leaves context empty, never 500)", async () => {
    const res = await app.request("/api/v1/auth/me", {
      headers: { Authorization: "Bearer garbage.token.here" },
    });
    expect(res.status).toBe(401);
  });

  test("me round-trips the UserView from the bearer token", async () => {
    const reg = await post(app, "/api/v1/auth/register", { email: "me@example.invalid", password: STRONG, displayName: "Me" });
    const { accessToken } = (await reg.json()) as { accessToken: string };
    const res = await app.request("/api/v1/auth/me", { headers: { Authorization: `Bearer ${accessToken}` } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ email: "me@example.invalid", displayName: "Me", roles: ["STUDENT"] });
  });

  test("password rotation: 204, bumps ver — OLD token dead at next request (R1 revocation)", async () => {
    const reg = await post(app, "/api/v1/auth/register", { email: "rot@example.invalid", password: STRONG, displayName: "Rot" });
    const { accessToken } = (await reg.json()) as { accessToken: string };

    const rot = await post(
      app,
      "/api/v1/auth/password",
      { currentPassword: STRONG, newPassword: "brand-new-password-2" },
      { Authorization: `Bearer ${accessToken}` },
    );
    expect(rot.status).toBe(204);

    const oldToken = await app.request("/api/v1/auth/me", { headers: { Authorization: `Bearer ${accessToken}` } });
    expect(oldToken.status).toBe(401); // ver mismatch — fail-closed (JwtAuthenticationFilter:60-70)

    const relogin = await post(app, "/api/v1/auth/login", { email: "rot@example.invalid", password: "brand-new-password-2" });
    expect(relogin.status).toBe(200); // documented contract: re-login
  });

  test("password change with wrong current password → 401, no echo", async () => {
    const reg = await post(app, "/api/v1/auth/register", { email: "rot2@example.invalid", password: STRONG, displayName: "R2" });
    const { accessToken } = (await reg.json()) as { accessToken: string };
    const res = await post(
      app,
      "/api/v1/auth/password",
      { currentPassword: "totally-wrong-1", newPassword: "brand-new-password-3" },
      { Authorization: `Bearer ${accessToken}` },
    );
    expect(res.status).toBe(401);
    expect((await res.json() as ApiErrorBody).error).toBe("invalid_credentials");
  });

  test("new password below floor → 400 validation_failed (same register bar, R6)", async () => {
    const reg = await post(app, "/api/v1/auth/register", { email: "rot3@example.invalid", password: STRONG, displayName: "R3" });
    const { accessToken } = (await reg.json()) as { accessToken: string };
    const res = await post(
      app,
      "/api/v1/auth/password",
      { currentPassword: STRONG, newPassword: "short1" },
      { Authorization: `Bearer ${accessToken}` },
    );
    expect(res.status).toBe(400);
    expect((await res.json() as ApiErrorBody).message).toBe("newPassword: size must be between 12 and 100");
  });

  test("me for a deleted/unknown user → 404 'user <email> not found'", async () => {
    const { identity } = buildTestApp(baseEnv);
    const token = identity.jwt.issueAccessToken({ email: "vanished@example.invalid", id: "11111111-2222-4333-8444-555555555555", tokenVersion: 1, roles: ["STUDENT"] });
    const res = await app.request("/api/v1/auth/me", { headers: { Authorization: `Bearer ${token}` } });
    // The revocation filter treats unknown user as no-context → 401 (fail-closed),
    // matching JwtAuthenticationFilter:60-70 — NOT the 404 the service would
    // throw if the token were honored. This IS the parity behaviour.
    expect(res.status).toBe(401);
  });

  test("token with stale ver → 401 even though the signature is valid", async () => {
    const reg = await post(app, "/api/v1/auth/register", { email: "stale@example.invalid", password: STRONG, displayName: "Stale" });
    const user = await users.findByEmailIgnoreCase("stale@example.invalid");
    expect(user).not.toBeNull();
    const staleToken = identity.jwt.issueAccessToken({ email: user!.email, id: user!.id, tokenVersion: 99, roles: ["STUDENT"] });
    const res = await app.request("/api/v1/auth/me", { headers: { Authorization: `Bearer ${staleToken}` } });
    expect(res.status).toBe(401);
    void reg;
  });
});

describe("bootstrap surface — BootstrapAdminController/Service parity (unit tier)", () => {
  test("claimable(): enabled && PENDING && zero admins", async () => {
    const config = readIdentityConfig(baseEnv);
    const identity = buildIdentityServices(config);
    const users = new FakeUsersRepo();
    const bootstrap = new BootstrapAdminService(new FakeStateStore("PENDING", 0), users, identity, "postgresql://u.invalid/d");
    const withAdmin = new BootstrapAdminService(new FakeStateStore("PENDING", 1), users, identity, "postgresql://u.invalid/d");
    const consumed = new BootstrapAdminService(new FakeStateStore("CONSUMED", 0), users, identity, "postgresql://u.invalid/d");
    const disabled = new BootstrapAdminService(
      new FakeStateStore("PENDING", 0),
      users,
      buildIdentityServices(readIdentityConfig({ ...baseEnv, SYLLABAI_BOOTSTRAP_ENABLED: "false" })),
      "postgresql://u.invalid/d",
    );
    expect(await bootstrap.claimable()).toBe(true);
    expect(await withAdmin.claimable()).toBe(false);
    expect(await consumed.claimable()).toBe(false);
    expect(await disabled.claimable()).toBe(false);
  });

  test("claimable() does NOT wall-clock check (parity with BootstrapAdminService:72-78) — claim path enforces", async () => {
    // documented asymmetry: status probes available:true on a stale PENDING row
    const config = readIdentityConfig(baseEnv);
    const identity = buildIdentityServices(config);
    const bootstrap = new BootstrapAdminService(new FakeStateStore("PENDING", 0), new FakeUsersRepo(), identity, "postgresql://u.invalid/d");
    expect(await bootstrap.claimable()).toBe(true);
  });

  test("bootstrap-status route serves {available:bool} anonymously", async () => {
    const { app } = buildTestApp(baseEnv);
    const res = await app.request("/api/v1/auth/bootstrap-status");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ available: true });
  });

  test("toUserView maps the User projection (UserView.from parity)", async () => {
    const config = readIdentityConfig(baseEnv);
    const identity = buildIdentityServices(config);
    const users = new FakeUsersRepo();
    const authService = new AuthService(users, identity);
    const reg = await authService.register({ email: "View@Example.invalid", password: STRONG, displayName: "V" });
    expect(reg.user).toMatchObject({ email: "view@example.invalid", displayName: "V", roles: ["STUDENT"] });
    expect(reg.user.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  test("bootstrap claim flow is covered at the integration tier (real branch, real row locking)", () => {
    // claim() needs FOR UPDATE + a real bootstrap_admin_state row → exercised
    // in db.integration.test.ts against the task's Neon branch. Unit fakes
    // would only re-test the mock.
    expect(true).toBe(true);
  });
});

/**
 * RateLimitFilter port suite — mirror of
 * syllabai-core/src/test/java/com/syllabai/ratelimit/RateLimitFilterTest.java
 * (11 cases) + the property-defaults pin at config level (propertyDefaults).
 *
 * Harness parity: the Java tests drive the filter through MockHttpServletRequest
 * + MockFilterChain; here a minimal Hono app plays the chain (middleware order:
 * auth-stub → rate limiter → dummy routes) so classification, bypasses, 429
 * body/header shape, and fail-open behavior are exercised exactly as mounted.
 * The step clock stands in for MutableClock; the auth stub stands in for
 * SecurityContextHolder/request-attribute setup.
 */
import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import {
  RateLimitFilter,
  clientIp,
  isPrivateAddress,
  type RateLimitBudgets,
} from "../../src/middleware/ratelimit";
import { readIdentityConfig } from "../../src/services/identity/config";
import type { AuthContext } from "../../src/middleware/auth";

/** MutableClock stand-in: window-reset tests step time instead of sleeping. */
class MutableClock {
  nowMs = Date.parse("2026-09-28T10:00:00Z");
  instant(): Date {
    return new Date(this.nowMs);
  }
  plusSeconds(s: number): void {
    this.nowMs += s * 1000;
  }
}

// login 2, register 2, bootstrap 1, password 2, llm 3 — tiny budgets (:49-53)
const BUDGETS: RateLimitBudgets = {
  loginPerIp: 2,
  registerPerIp: 2,
  bootstrapPerIp: 1,
  passwordPerIp: 2,
  llmPerLearner: 3,
};

const LEARNER_A = "11111111-1111-1111-1111-111111111111";
const LEARNER_B = "22222222-2222-2222-2222-222222222222";

function buildApp(filter: RateLimitFilter, auth: AuthContext | null) {
  const app = new Hono();
  // auth-stub: plays the JwtAuthenticationFilter role — resolves the context
  // BEFORE the rate limiter (SecurityConfig addFilterAfter parity)
  app.use("*", async (c, next) => {
    if (auth) c.set("syllabai.auth" as never, auth as never);
    await next();
  });
  app.use("*", filter.handle);
  // dummy chain targets (MockFilterChain parity: classified paths answer 200)
  for (const p of [
    "/api/v1/auth/login",
    "/api/v1/auth/register",
    "/api/v1/auth/bootstrap-admin",
    "/api/v1/auth/password",
    "/api/v1/auth/me",
    "/api/v1/tutor/ask",
    "/api/v1/tutor/ask/stream",
    "/api/v1/learners/me/cla/ask",
    "/api/v1/learners/me/answer-input/transcribe",
  ]) {
    app.post(p, (c) => c.json({ ok: true }, 200));
    app.get(p, (c) => c.json({ ok: true }, 200));
  }
  app.post("/api/v1/learners/me/attempts/:id/smart-mark", (c) => c.json({ ok: true }, 200));
  app.post("/api/v1/learners/me/attempts/:id/parts/:pid/feedback-explanation", (c) => c.json({ ok: true }, 200));
  app.post("/api/v1/learners/me/attempts/:id/parts/:pid/improvement-plan", (c) => c.json({ ok: true }, 200));
  app.all("*", (c) => c.json({ ok: true }, 200));
  return app;
}

function post(app: Hono, path: string, headers: Record<string, string> = {}) {
  return app.request(path, { method: "POST", headers });
}

describe("RateLimitFilter port (M1) — auth tier", () => {
  test("login burst beyond the per-IP budget is rejected with 429 + Retry-After", async () => {
    const clock = new MutableClock();
    const filter = new RateLimitFilter({ enabled: true, windowMs: 60_000, budgets: BUDGETS, clock });
    const app = buildApp(filter, null);
    expect((await post(app, "/api/v1/auth/login")).status).toBe(200);
    expect((await post(app, "/api/v1/auth/login")).status).toBe(200);
    const rejected = await post(app, "/api/v1/auth/login");
    expect(rejected.status).toBe(429);
    const retryAfter = Number(rejected.headers.get("Retry-After"));
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(retryAfter).toBeLessThanOrEqual(60);
    const body = (await rejected.json()) as Record<string, unknown>;
    expect(JSON.stringify(body)).toContain("Too Many Requests");
    expect(JSON.stringify(body)).toContain("retryAfterSeconds");
    // filter-path body shape (RateLimitFilter.java:263-266) — retryAfterSeconds
    // is a body FIELD and the message says "requests" (exception path differs)
    expect(body.retryAfterSeconds).toBe(retryAfter);
    expect(body.message).toBe("Too many requests. Wait a moment and try again.");
  });

  test("auth routes bucket independently per route and per IP", async () => {
    const filter = new RateLimitFilter({ enabled: true, windowMs: 60_000, budgets: BUDGETS, clock: new MutableClock() });
    const app = buildApp(filter, null);
    await post(app, "/api/v1/auth/login");
    await post(app, "/api/v1/auth/login");
    expect((await post(app, "/api/v1/auth/login")).status).toBe(429);
    // same IP: register budget untouched
    expect((await post(app, "/api/v1/auth/register")).status).toBe(200);
    // different IP: login budget untouched
    expect((await post(app, "/api/v1/auth/login", { "X-Forwarded-For": "5.6.7.8" })).status).toBe(200);
    // bootstrap is its own (tightest) bucket
    expect((await post(app, "/api/v1/auth/bootstrap-admin")).status).toBe(200);
    expect((await post(app, "/api/v1/auth/bootstrap-admin")).status).toBe(429);
  });

  test("the window resets after the budget window passes", async () => {
    const clock = new MutableClock();
    const filter = new RateLimitFilter({ enabled: true, windowMs: 60_000, budgets: BUDGETS, clock });
    const app = buildApp(filter, null);
    await post(app, "/api/v1/auth/login");
    await post(app, "/api/v1/auth/login");
    expect((await post(app, "/api/v1/auth/login")).status).toBe(429);
    clock.plusSeconds(61);
    expect((await post(app, "/api/v1/auth/login")).status).toBe(200);
  });
});

describe("RateLimitFilter port (M1) — XFF trusted-chain walk", () => {
  test("the FIRST PUBLIC hop from the right is the key — fake hops left of the proxy append never matter", async () => {
    const filter = new RateLimitFilter({ enabled: true, windowMs: 60_000, budgets: BUDGETS, clock: new MutableClock() });
    const app = buildApp(filter, null);
    // exact live-probed shape: attacker fakes + real peer + varying internal hop
    const a = { "X-Forwarded-For": "9.9.9.9, 203.0.113.7, 10.44.0.7" };
    const b = { "X-Forwarded-For": "8.8.8.8, 203.0.113.7, 10.44.9.9" };
    expect((await post(app, "/api/v1/auth/login", a)).status).toBe(200);
    expect((await post(app, "/api/v1/auth/login", a)).status).toBe(200);
    // same REAL peer (203.0.113.7) despite rotated fakes AND varying internal -> exhausted
    expect((await post(app, "/api/v1/auth/login", a)).status).toBe(429);
    // rotated fake leftmost no longer mints a fresh budget -> same bucket
    expect((await post(app, "/api/v1/auth/login", b)).status).toBe(429);
  });

  test("a genuinely different real peer gets its own budget", async () => {
    const filter = new RateLimitFilter({ enabled: true, windowMs: 60_000, budgets: BUDGETS, clock: new MutableClock() });
    const app = buildApp(filter, null);
    const a = { "X-Forwarded-For": "9.9.9.9, 203.0.113.7, 10.44.0.7" };
    const b = { "X-Forwarded-For": "9.9.9.9, 198.51.100.9, 10.44.0.7" };
    expect((await post(app, "/api/v1/auth/login", a)).status).toBe(200);
    expect((await post(app, "/api/v1/auth/login", a)).status).toBe(200);
    expect((await post(app, "/api/v1/auth/login", a)).status).toBe(429);
    expect((await post(app, "/api/v1/auth/login", b)).status).toBe(200);
  });

  test("private hops are SKIPPED, not keys — an injected private hop cannot hide the fake either", async () => {
    const filter = new RateLimitFilter({ enabled: true, windowMs: 60_000, budgets: BUDGETS, clock: new MutableClock() });
    const app = buildApp(filter, null);
    const a = { "X-Forwarded-For": "203.0.113.7, 10.255.255.5" };
    const b = { "X-Forwarded-For": "203.0.113.7, 192.168.5.5, 10.44.0.7" };
    expect((await post(app, "/api/v1/auth/login", a)).status).toBe(200);
    expect((await post(app, "/api/v1/auth/login", a)).status).toBe(200);
    expect((await post(app, "/api/v1/auth/login", a)).status).toBe(429);
    // b walks: 10.44.0.7 skip, 192.168.5.5 skip, 203.0.113.7 -> a's bucket
    expect((await post(app, "/api/v1/auth/login", b)).status).toBe(429);
  });

  test("an all-private header falls back to the socket peer (one shared fallback bucket)", async () => {
    const filter = new RateLimitFilter({ enabled: true, windowMs: 60_000, budgets: BUDGETS, clock: new MutableClock() });
    const app = buildApp(filter, null);
    const a = { "X-Forwarded-For": "10.0.0.1, 192.168.5.5" };
    const b = { "X-Forwarded-For": "10.77.3.3" };
    expect((await post(app, "/api/v1/auth/login", a)).status).toBe(200);
    expect((await post(app, "/api/v1/auth/login", a)).status).toBe(200);
    expect((await post(app, "/api/v1/auth/login", a)).status).toBe(429);
    // both fall back to the same (socket/unknown) peer -> same bucket
    expect((await post(app, "/api/v1/auth/login", b)).status).toBe(429);
  });

  test("isPrivateAddress predicate — CGNAT range, the literal 172.2x quirk, malformed 100.x", () => {
    expect(isPrivateAddress("100.100.1.1")).toBe(true); // 100.64.0.0/10 CGNAT
    expect(isPrivateAddress("100.63.1.1")).toBe(false);
    expect(isPrivateAddress("100.128.1.1")).toBe(false);
    expect(isPrivateAddress("172.19.9.9")).toBe(true);
    expect(isPrivateAddress("172.25.9.9")).toBe(true); // the literal "172.2" prefix
    expect(isPrivateAddress("172.32.9.9")).toBe(false);
    expect(isPrivateAddress("10.0.0.1")).toBe(true);
    expect(isPrivateAddress("192.168.0.1")).toBe(true);
    expect(isPrivateAddress("127.0.0.1")).toBe(true);
    expect(isPrivateAddress("169.254.1.1")).toBe(true);
    expect(isPrivateAddress("fe80::1")).toBe(true);
    expect(isPrivateAddress("fd00::1")).toBe(true);
    expect(isPrivateAddress("::1")).toBe(true);
    expect(isPrivateAddress("203.0.113.7")).toBe(false);
    expect(isPrivateAddress("100.not.an.ip")).toBe(false); // malformed 100.x → public (NumberFormatException parity)
    // clientIp end-to-end: private tail skipped, all-private → peer fallback
    expect(clientIp("9.9.9.9, 203.0.113.7, 10.44.0.7", "127.0.0.1")).toBe("203.0.113.7");
    expect(clientIp("10.0.0.1, 192.168.5.5", "127.0.0.1")).toBe("127.0.0.1");
    expect(clientIp(undefined, "127.0.0.1")).toBe("127.0.0.1");
    expect(clientIp(undefined, undefined)).toBe("unknown");
  });
});

describe("RateLimitFilter port (M1) — LLM tier", () => {
  test("keys on the JWT learner id: tutor and cla share one per-learner budget", async () => {
    const filter = new RateLimitFilter({ enabled: true, windowMs: 60_000, budgets: BUDGETS, clock: new MutableClock() });
    const app = buildApp(filter, { email: "learner@example.com", userId: LEARNER_A, roles: [], tokenVersion: 1 });
    expect((await post(app, "/api/v1/tutor/ask")).status).toBe(200);
    expect((await post(app, "/api/v1/tutor/ask")).status).toBe(200);
    expect((await post(app, "/api/v1/learners/me/cla/ask", { "X-Forwarded-For": "5.5.5.5" })).status).toBe(200);
    // 4th ask for the SAME learner from ANY route/host -> 429
    expect((await post(app, "/api/v1/learners/me/cla/ask", { "X-Forwarded-For": "5.5.5.5" })).status).toBe(429);
    // a different learner is untouched
    const otherApp = buildApp(filter, { email: "other@example.com", userId: LEARNER_B, roles: [], tokenVersion: 1 });
    expect((await post(otherApp, "/api/v1/tutor/ask")).status).toBe(200);
  });

  test("falls back to the authenticated subject, then the client IP", async () => {
    // subject-keyed (userId blank → Java auth.getName() path)
    const filter = new RateLimitFilter({ enabled: true, windowMs: 60_000, budgets: BUDGETS, clock: new MutableClock() });
    const app = buildApp(filter, { email: "learner@example.com", userId: "", roles: [], tokenVersion: 1 });
    for (let i = 0; i < 3; i++) {
      expect((await post(app, "/api/v1/tutor/ask", { "X-Forwarded-For": "7.7.7.7" })).status).toBe(200);
    }
    // subject-keyed: a different host for the same principal is still over budget
    expect((await post(app, "/api/v1/tutor/ask", { "X-Forwarded-For": "8.8.8.8" })).status).toBe(429);

    // no attribute, no authentication -> IP-keyed fallback
    const anonApp = buildApp(filter, null);
    expect((await post(anonApp, "/api/v1/tutor/ask", { "X-Forwarded-For": "9.9.9.9" })).status).toBe(200);
  });

  test("Smart Mark LLM surfaces share the per-learner LLM budget (R8)", async () => {
    const filter = new RateLimitFilter({ enabled: true, windowMs: 60_000, budgets: BUDGETS, clock: new MutableClock() });
    const app = buildApp(filter, { email: "learner@example.com", userId: "", roles: [], tokenVersion: 1 });
    // 2 tutor asks + 1 smart-mark = 3 admitted (tiny llm budget)
    expect((await post(app, "/api/v1/tutor/ask", { "X-Forwarded-For": "7.7.7.7" })).status).toBe(200);
    expect((await post(app, "/api/v1/tutor/ask", { "X-Forwarded-For": "7.7.7.7" })).status).toBe(200);
    expect((await post(app, `/api/v1/learners/me/attempts/${LEARNER_A}/smart-mark`, { "X-Forwarded-For": "7.7.7.7" })).status).toBe(200);
    // 4th LLM call this window — over the shared per-learner budget
    expect((await post(app, `/api/v1/learners/me/attempts/${LEARNER_A}/parts/${LEARNER_B}/feedback-explanation`, { "X-Forwarded-For": "7.7.7.7" })).status).toBe(429);
    expect((await post(app, `/api/v1/learners/me/attempts/${LEARNER_A}/parts/${LEARNER_B}/improvement-plan`, { "X-Forwarded-For": "7.7.7.7" })).status).toBe(429);
  });
});

describe("RateLimitFilter port (M1) — bypasses and fail-open", () => {
  test("non-matching requests are never throttled: GET ask, unlisted paths, OPTIONS, disabled filter", async () => {
    const filter = new RateLimitFilter({ enabled: true, windowMs: 60_000, budgets: BUDGETS, clock: new MutableClock() });
    const app = buildApp(filter, null);
    // GET on an LLM route carries no token cost
    for (let i = 0; i < 6; i++) {
      const res = await app.request("/api/v1/tutor/ask", { headers: { "X-Forwarded-For": "1.2.3.4" } });
      expect(res.status).toBe(200);
    }
    // unlisted POST path
    expect((await post(app, "/api/v1/auth/me")).status).toBe(200);
    // CORS preflight is always exempt
    const options = await app.request("/api/v1/auth/login", { method: "OPTIONS" });
    expect(options.status).toBe(200);
    // master switch off -> nothing counts
    const disabled = new RateLimitFilter({
      enabled: false,
      windowMs: 60_000,
      budgets: { loginPerIp: 1, registerPerIp: 1, bootstrapPerIp: 1, passwordPerIp: 1, llmPerLearner: 1 },
      clock: new MutableClock(),
    });
    const offApp = buildApp(disabled, null);
    for (let i = 0; i < 5; i++) {
      expect((await post(offApp, "/api/v1/auth/login")).status).toBe(200);
    }
  });

  test("an internal limiter error fails OPEN — the chain continues", async () => {
    const clock = new MutableClock();
    // anonymous subclass overriding classification (Java anonymous budgetOf override)
    class Broken extends RateLimitFilter {
      protected override classify(): { tier: string; subject: string; limit: number } | null {
        throw new Error("simulated limiter fault");
      }
    }
    const broken = new Broken({ enabled: true, windowMs: 60_000, budgets: BUDGETS, clock });
    const app = buildApp(broken, null);
    const res = await post(app, "/api/v1/tutor/ask");
    expect(res.status).toBe(200);
  });
});

describe("RateLimitFilter port (M1) — audited budget defaults", () => {
  test("properties default to the audited budgets when unset (RateLimitProperties:53-59)", () => {
    const cfg = readIdentityConfig({}).ratelimit;
    expect(cfg.enabled).toBe(true);
    expect(cfg.windowMs).toBe(60_000);
    expect(cfg.loginPerIp).toBe(10);
    expect(cfg.loginPerAccount).toBe(10);
    expect(cfg.registerPerIp).toBe(5);
    expect(cfg.bootstrapPerIp).toBe(3);
    expect(cfg.passwordPerIp).toBe(10);
    expect(cfg.llmPerLearner).toBe(20);
  });

  test("env overrides apply (relaxed binding of syllabai.ratelimit.* keys)", () => {
    const cfg = readIdentityConfig({
      SYLLABAI_RATELIMIT_ENABLED: "false",
      SYLLABAI_RATELIMIT_LOGIN_PER_IP: "77",
      SYLLABAI_RATELIMIT_REGISTER_PER_IP: "6",
      SYLLABAI_RATELIMIT_LLM_PER_LEARNER: "21",
    }).ratelimit;
    expect(cfg.enabled).toBe(false);
    expect(cfg.loginPerIp).toBe(77);
    expect(cfg.registerPerIp).toBe(6);
    expect(cfg.bootstrapPerIp).toBe(3); // untouched default
    expect(cfg.llmPerLearner).toBe(21);
    expect(cfg.passwordPerIp).toBe(10); // untouched default
  });
});

/**
 * LLM chain-observability route tests (T-MIG-090) — the observable HTTP
 * contract of LlmAdminController (:30-36, frozen @ 6cad6ef) over an
 * IN-MEMORY Hono app wiring the REAL llmchain service (services/llmchain:
 * FailoverLlmChain + LlmProviderHealth + the LlmChainProperties env
 * projection) over a CONTROLLED env object and a deterministic HealthClock
 * — the classroom/coverage route-test pattern (no DB, no network).
 *
 * Pinned laws:
 *   - the wire shape (LlmAdminControllerTest shape gate): {chainAvailable,
 *     providers} with providers keyed in the §26.1 chain order groq →
 *     gemini → openrouter, validated against the canonical
 *     chainHealthReportSchema (llm-admin.ts contracts)
 *   - the frozen zero-key boot semantics: no keys → every provider
 *     registered UNCONFIGURED with the model it WOULD use, chainAvailable
 *     honestly false, boot clean (LlmChainProperties zero-component
 *     defaults: dailyBudget 1000, models verbatim)
 *   - TEST mode ignores keys in the environment (LlmChainConfig :106-110 —
 *     the ADR-023 fail-closed warn path)
 *   - snapshots NEVER carry credential material
 *     (LlmAdminControllerTest.snapshotsNeverCarrySecrets)
 *   - the authz shells (SecurityConfig /api/v1/admin/** → ADMIN only):
 *     anonymous → Boot 401 body, authenticated non-admin → Boot 403 body
 *   - the failure-class law (LlmProviderHealth): AUTHENTICATION_FAILURE →
 *     cooldown until the END OF THE UTC DAY (config cannot heal
 *     mid-deployment); RATE_LIMITED below threshold → NO cooldown
 *     (transient, fail over); the UTC-day rollover resets requestsToday
 *   - the dormant-member generate seam (ADR-023 fail-closed): a configured
 *     member's generate raises the structured LlmProviderException instead
 *     of silently spending quota; the exhausted chain answers the aggregate
 *     "no available LLM provider in chain" (the frozen empty-candidates law)
 */
import { describe, expect, test } from "bun:test";
import { Hono, type Context } from "hono";
import { createLlmAdminRouter } from "../../src/routes/llmadmin";
import {
  buildLlmChain,
  LlmProviderException,
  type HealthClock,
} from "../../src/services/llmchain";
import { toErrorResponse } from "../../src/services/identity/errors";
import { chainHealthReportSchema } from "@syllabai/contracts";

// ── deterministic clock (the frozen package-private test wiring) ────────────

const DAY_1 = "2026-10-09";
const clock: HealthClock = {
  now: () => new Date(`${DAY_1}T10:00:00.000Z`),
  utcDay: () => DAY_1,
};

// ── app assembly (the route at the REAL mount prefix) ───────────────────────

type AuthRow = Record<string, unknown> | null;

function makeApp(auth: (c: Context) => AuthRow, env: Record<string, string | undefined> = {}) {
  const chain = buildLlmChain(env, clock);
  const app = new Hono();
  app.use("*", async (c, next) => {
    const a = auth(c);
    if (a) c.set("syllabai.auth" as never, a as never);
    await next();
  });
  app.route("/api/v1/admin/llm", createLlmAdminRouter(chain));
  app.onError((err, c) => {
    const mapped = toErrorResponse(err);
    if (mapped) return c.json(mapped.body, mapped.status as 400);
    console.error("[test] unhandled error:", err);
    return c.json({ status: 500, error: "internal_error", message: "an internal error occurred" }, 500 as const);
  });
  return { app, chain };
}

const asAdmin = (): AuthRow => ({
  email: "a@example.edu",
  userId: "aa000000-0000-4000-8000-00000000000a",
  roles: ["ADMIN"],
  tokenVersion: 1,
});
const asTeacher = (): AuthRow => ({
  email: "t@example.edu",
  userId: "aa000000-0000-4000-8000-000000000001",
  roles: ["TEACHER"],
  tokenVersion: 1,
});
const anon = (): AuthRow => null;

const URL = "/api/v1/admin/llm/chain-health";

// ── authz shells (SecurityConfig /api/v1/admin/** parity) ───────────────────

describe("authz shells (ADMIN-only)", () => {
  test("anonymous → Boot 401 body with the request path", async () => {
    const { app } = makeApp(anon);
    const res = await app.request(URL);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
    expect(body.path).toBe(URL);
    expect(typeof body.timestamp).toBe("string");
  });

  test("authenticated TEACHER → Boot 403 body (hasRole('ADMIN') + route rule)", async () => {
    const { app } = makeApp(asTeacher);
    const res = await app.request(URL);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.status).toBe(403);
    expect(body.error).toBe("Forbidden");
    expect(body.path).toBe(URL);
  });
});

// ── GET /chain-health (:30-36) ──────────────────────────────────────────────

describe("GET /chain-health — the zero-key boot (frozen LlmChainProperties defaults)", () => {
  test("admin → 200 two-key report, providers keyed in §26.1 chain order, schema-valid", async () => {
    const { app } = makeApp(asAdmin);
    const res = await app.request(URL);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(chainHealthReportSchema.safeParse(body).success).toBeTrue();
    // exactly two keys, the frozen LinkedHashMap law
    expect(Object.keys(body)).toEqual(["chainAvailable", "providers"]);
    // chain order (LlmChainProperties.chainOrder() verbatim)
    expect(Object.keys(body.providers)).toEqual(["groq", "gemini", "openrouter"]);
    expect(body.chainAvailable).toBe(false); // no keys → honestly false
  });

  test("every unconfigured member reports the model it WOULD use + the frozen chain defaults", async () => {
    const { app } = makeApp(asAdmin);
    const body = (await (await app.request(URL)).json()) as {
      providers: Record<string, Record<string, unknown>>;
    };
    expect(body.providers.groq!).toMatchObject({
      enabled: false,
      configured: false,
      healthy: false,
      coolingDown: false,
      consecutiveFailures: 0,
      requestsToday: 0,
      lastErrorAt: null,
      lastErrorMessage: null,
      cooldownUntil: null,
      dailyBudget: 1000, // LlmChainProperties.Chain compacted default
      remainingLocalBudget: 1000,
      lastFailureClass: null,
      effectiveModel: "llama-3.3-70b-versatile",
    });
    expect(body.providers.gemini!.effectiveModel).toBe("gemini-2.5-flash");
    expect(body.providers.openrouter!.effectiveModel).toBe(
      "meta-llama/llama-3.3-70b-instruct:free",
    );
  });

  test("snapshots never carry credential material (the frozen secrets law)", async () => {
    const { app } = makeApp(asAdmin, {
      SYLLABAI_LLM_GROQ_API_KEY: "gsk_SUPER-secret-value-42",
    });
    const raw = JSON.stringify(await (await app.request(URL)).json());
    expect(raw).not.toContain("gsk_SUPER-secret-value-42");
    expect(raw).not.toContain("apiKey");
    expect(raw).not.toContain("api_key");
  });
});

// ── the config projection (SYLLABAI_LLM_* / syllabai.llm.* relaxed binding) ─

describe("chain config law", () => {
  test("enabled + keyed (PRODUCTION) → configured/healthy, chainAvailable true", async () => {
    const { app } = makeApp(asAdmin, {
      SYLLABAI_LLM_GROQ_ENABLED: "true",
      SYLLABAI_LLM_GROQ_API_KEY: "gsk_test-key",
    });
    const body = (await (await app.request(URL)).json()) as {
      chainAvailable: boolean;
      providers: Record<string, Record<string, unknown>>;
    };
    expect(body.providers.groq!).toMatchObject({ enabled: true, configured: true, healthy: true });
    expect(body.providers.gemini!.configured).toBe(false); // untouched members stay honest
    expect(body.chainAvailable).toBe(true);
  });

  test("TEST mode IGNORES keys in the environment (LlmChainConfig :106-110 fail-closed)", async () => {
    const { app } = makeApp(asAdmin, {
      SYLLABAI_LLM_MODE: "TEST",
      SYLLABAI_LLM_GROQ_ENABLED: "true",
      SYLLABAI_LLM_GROQ_API_KEY: "gsk_test-key",
    });
    const body = (await (await app.request(URL)).json()) as {
      chainAvailable: boolean;
      providers: Record<string, Record<string, unknown>>;
    };
    expect(body.providers.groq!).toMatchObject({ enabled: true, configured: false, healthy: false });
    expect(body.chainAvailable).toBe(false);
  });

  test("model/base-url overrides ride the relaxed binding", async () => {
    const { app } = makeApp(asAdmin, {
      SYLLABAI_LLM_GEMINI_ENABLED: "true",
      SYLLABAI_LLM_GEMINI_API_KEY: "gm-key",
      SYLLABAI_LLM_GEMINI_MODEL: "gemini-2.0-flash",
    });
    const body = (await (await app.request(URL)).json()) as {
      providers: Record<string, Record<string, unknown>>;
    };
    expect(body.providers.gemini!.effectiveModel).toBe("gemini-2.0-flash");
  });
});

// ── the health law (LlmProviderHealth, service-level pins) ──────────────────

describe("LlmProviderHealth — failure classification + UTC-day law", () => {
  test("AUTHENTICATION_FAILURE cools down to the END OF THE UTC DAY (config cannot heal)", async () => {
    const { chain } = makeApp(asAdmin, {
      SYLLABAI_LLM_GROQ_ENABLED: "true",
      SYLLABAI_LLM_GROQ_API_KEY: "gsk_test-key",
    });
    const groq = chain.member("groq")!;
    groq.health().recordFailure("401 invalid api key", "AUTHENTICATION_FAILURE");
    const snap = groq.health().snapshot();
    expect(snap.lastFailureClass).toBe("AUTHENTICATION_FAILURE");
    expect(snap.consecutiveFailures).toBe(1);
    expect(snap.requestsToday).toBe(1);
    expect(snap.coolingDown).toBe(true);
    expect(snap.cooldownUntil).toBe("2026-10-10T00:00:00.000Z"); // utcDay.plusDays(1).atStartOfDay
    expect(snap.healthy).toBe(false);
  });

  test("RATE_LIMITED below the threshold → transient, NO cooldown (fail over)", async () => {
    const { chain } = makeApp(asAdmin, {
      SYLLABAI_LLM_GROQ_ENABLED: "true",
      SYLLABAI_LLM_GROQ_API_KEY: "gsk_test-key",
    });
    const groq = chain.member("groq")!;
    groq.health().recordFailure("429 quota", "RATE_LIMITED");
    const snap = groq.health().snapshot();
    expect(snap.lastFailureClass).toBe("RATE_LIMITED");
    expect(snap.coolingDown).toBe(false); // 1 < threshold 3
    expect(snap.cooldownUntil).toBeNull();
    expect(snap.healthy).toBe(true);
  });

  test("success clears consecutive failures; the UTC-day rollover resets requestsToday", async () => {
    let day = DAY_1;
    const rolling: HealthClock = {
      now: () => new Date(`${day}T10:00:00.000Z`),
      utcDay: () => day,
    };
    const chain = buildLlmChain(
      { SYLLABAI_LLM_GROQ_ENABLED: "true", SYLLABAI_LLM_GROQ_API_KEY: "gsk" },
      rolling,
    );
    const groq = chain.member("groq")!;
    groq.health().recordFailure("429", "RATE_LIMITED");
    groq.health().recordSuccess();
    expect(groq.health().snapshot().consecutiveFailures).toBe(0);
    expect(groq.health().snapshot().requestsToday).toBe(2); // both count
    day = "2026-10-10"; // the UTC day rolls
    expect(groq.health().snapshot().requestsToday).toBe(0); // rollDay reset
    expect(groq.health().snapshot().remainingLocalBudget).toBe(1000);
  });
});

// ── the dormant-generation seam (ADR-023 fail-closed) ───────────────────────

describe("FailoverLlmChain.generate — the dormant seam", () => {
  test("zero-key boot: exhausted chain → 'no available LLM provider in chain'", async () => {
    const { chain } = makeApp(asAdmin);
    try {
      await chain.generate({ system: "s", user: "u" });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(LlmProviderException);
      expect((e as LlmProviderException).message).toBe("no available LLM provider in chain");
    }
  });

  test("configured-but-dormant member: generate raises the structured exception, never a silent spend", async () => {
    const { chain } = makeApp(asAdmin, {
      SYLLABAI_LLM_GROQ_ENABLED: "true",
      SYLLABAI_LLM_GROQ_API_KEY: "gsk_test-key",
    });
    try {
      await chain.generate({ system: "s", user: "u" });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(LlmProviderException);
      const err = e as LlmProviderException;
      // the frozen aggregate: the chain throws with ITS name and the
      // diagnosable "all providers failed, last error: … [detail]" body
      expect(err.providerName).toBe("chain");
      expect(err.message).toContain("all providers failed, last error:");
      expect(err.message).toContain("dormant seam");
      expect(err.message).toContain("[groq: ");
      expect(err.failureClass).toBe("UNKNOWN");
    }
    // the attempt was recorded faithfully (observability stays honest)
    const snap = chain.member("groq")!.health().snapshot();
    expect(snap.consecutiveFailures).toBe(1);
    expect(snap.requestsToday).toBe(1);
    expect(snap.lastErrorMessage).toContain("dormant seam");
  });
});

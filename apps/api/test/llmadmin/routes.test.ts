/**
 * LLM chain-observability route tests (T-MIG-090) — the observable HTTP
 * contract of LlmAdminController (frozen @ 6cad6ef) over an IN-MEMORY Hono
 * app wiring the REAL llmchain service (services/llmchain: FailoverLlmChain
 * + LlmProviderHealth + the three-layer config projection of record) over a
 * CONTROLLED env object and a deterministic HealthClock — the
 * classroom/coverage route-test pattern (no DB, no network).
 *
 * ACCEPTANCE GATE OF RECORD (R0-arbitration/ruling4 §5): the admin-200 body
 * in the CAPTURE posture deep-equals the r4b wire truth of record
 * golden-captures/t-mig-090/leg-04-chain-admin-200.json (embedded below as
 * LEG04_GOLDEN), and the 401/403 shells match legs 01-03.
 *
 * Pinned laws:
 *   - the wire shape (LlmAdminControllerTest shape gate): {chainAvailable,
 *     providers} with providers keyed in the §26.1 chain order groq →
 *     gemini → openrouter, validated against the canonical
 *     chainHealthReportSchema (llm-admin.ts contracts)
 *   - the CAPTURE-ORDER key assembly (ruling4 §2): snapshot keys emit in
 *     the captured alphabetical order — the byte-level emission order
 *   - the frozen-EFFECTIVE config (ruling4 §2, the r1c amendment): no-env
 *     boot binds the application.yml @ 6cad6ef layer (enabled bridges
 *     default TRUE, models openai/gpt-oss-120b / gemini-3.6-flash /
 *     nvidia/nemotron-3-super-120b-a12b:free, groq base-url /v1, chain
 *     60/60/3/1000) — NOT the LlmChainProperties record defaults (those are
 *     the compactor TARGETS, reachable only on blank/non-positive sets)
 *   - the zero-key boot law (ruling4 §3): no keys → every member registers
 *     UNCONFIGURED with the model it WOULD use, chainAvailable honestly
 *     false, boot clean
 *   - TEST mode ignores keys in the environment (LlmChainConfig fail-closed)
 *   - THREE modes (production/test/live — ruling4 §2); LIVE report posture
 *     = production, generation stays ADR-023 fail-closed dormant
 *   - snapshots NEVER carry credential material
 *     (LlmAdminControllerTest.snapshotsNeverCarrySecrets)
 *   - the failure-class law (LlmProviderHealth): AUTHENTICATION_FAILURE →
 *     cooldown until the END OF THE UTC DAY; RATE_LIMITED below threshold →
 *     NO cooldown (transient, fail over); the UTC-day rollover resets
 *     requestsToday
 *   - the dormant-member generate seam (ADR-023 fail-closed, AMENDED OF
 *     RECORD by ADR-MIG-0002 — operator directive ① trace 1a117913519cd141):
 *     buildLlmChain now constructs REAL adapters for keyed members in
 *     PRODUCTION/LIVE; TEST mode and zero-key boots stay fail-closed dormant
 *     (a configured member without a real adapter still raises the structured
 *     LlmProviderException instead of silently spending quota); the exhausted
 *     chain answers the aggregate "no available LLM provider in chain"
 */
import { describe, expect, test } from "bun:test";
import { Hono, type Context } from "hono";
import { createLlmAdminRouter } from "../../src/routes/llmadmin";
import {
  buildLlmChain,
  DormantChainMember,
  LlmProviderException,
  readLlmChainProperties,
  type HealthClock,
} from "../../src/services/llmchain";
import { OpenAiCompatibleChainMember } from "../../src/services/llmchain/adapters";
import { toErrorResponse } from "../../src/services/identity/errors";
import { chainHealthReportSchema } from "@syllabai/contracts";

// ── deterministic clock (the frozen package-private test wiring) ────────────

const DAY_1 = "2026-10-07";
const clock: HealthClock = {
  now: () => new Date(`${DAY_1}T10:00:00.000Z`),
  utcDay: () => DAY_1,
};

// ── the r4b capture golden (golden-captures/t-mig-090/leg-04, verbatim) ─────

/** The capture posture: SYLLABAI_LLM_MODE=test + the three DISABLE bridges. */
const CAPTURE_ENV: Record<string, string> = {
  SYLLABAI_LLM_MODE: "test",
  SYLLABAI_GROQ_ENABLED: "false",
  SYLLABAI_GEMINI_ENABLED: "false",
  SYLLABAI_OPENROUTER_ENABLED: "false",
};

const LEG04_GOLDEN = {
  chainAvailable: false,
  providers: {
    gemini: {
      configured: false,
      consecutiveFailures: 0,
      cooldownUntil: null,
      coolingDown: false,
      dailyBudget: 1000,
      effectiveModel: "gemini-3.6-flash",
      enabled: false,
      healthy: false,
      lastErrorAt: null,
      lastErrorMessage: null,
      lastFailureClass: null,
      remainingLocalBudget: 1000,
      requestsToday: 0,
    },
    groq: {
      configured: false,
      consecutiveFailures: 0,
      cooldownUntil: null,
      coolingDown: false,
      dailyBudget: 1000,
      effectiveModel: "openai/gpt-oss-120b",
      enabled: false,
      healthy: false,
      lastErrorAt: null,
      lastErrorMessage: null,
      lastFailureClass: null,
      remainingLocalBudget: 1000,
      requestsToday: 0,
    },
    openrouter: {
      configured: false,
      consecutiveFailures: 0,
      cooldownUntil: null,
      coolingDown: false,
      dailyBudget: 1000,
      effectiveModel: "nvidia/nemotron-3-super-120b-a12b:free",
      enabled: false,
      healthy: false,
      lastErrorAt: null,
      lastErrorMessage: null,
      lastFailureClass: null,
      remainingLocalBudget: 1000,
      requestsToday: 0,
    },
  },
} as const;

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

// ── authz shells (SecurityConfig /api/v1/admin/** parity; legs 01-03) ───────

describe("authz shells (ADMIN-only)", () => {
  test("anonymous → Boot 401 body with the request path (leg-01 shape)", async () => {
    const { app } = makeApp(anon);
    const res = await app.request(URL);
    expect(res.status).toBe(401);
    const body = await res.json();
    // the leg-01 golden shape: {error, path, status, timestamp}
    expect(body.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
    expect(body.path).toBe("/api/v1/admin/llm/chain-health");
    expect(typeof body.timestamp).toBe("string");
  });

  test("authenticated TEACHER → Boot 403 body (hasRole('ADMIN') + route rule; leg-02 shape)", async () => {
    const { app } = makeApp(asTeacher);
    const res = await app.request(URL);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.status).toBe(403);
    expect(body.error).toBe("Forbidden");
    expect(body.path).toBe("/api/v1/admin/llm/chain-health");
    expect(typeof body.timestamp).toBe("string");
  });
});

// ── GET /chain-health — the ACCEPTANCE GATE (ruling4 §5) ────────────────────

describe("GET /chain-health — the r4b capture golden gate", () => {
  test("GOLDEN: capture posture → body deep-equals leg-04 EXACTLY", async () => {
    const { app } = makeApp(asAdmin, CAPTURE_ENV);
    const res = await app.request(URL);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(LEG04_GOLDEN);
  });

  test("capture-order key assembly: provider keys emit in the captured alphabetical order", async () => {
    const { app } = makeApp(asAdmin, CAPTURE_ENV);
    const body = (await (await app.request(URL)).json()) as {
      providers: Record<string, Record<string, unknown>>;
    };
    const expectedKeys = [
      "configured",
      "consecutiveFailures",
      "cooldownUntil",
      "coolingDown",
      "dailyBudget",
      "effectiveModel",
      "enabled",
      "healthy",
      "lastErrorAt",
      "lastErrorMessage",
      "lastFailureClass",
      "remainingLocalBudget",
      "requestsToday",
    ];
    expect(Object.keys(body.providers.groq!)).toEqual(expectedKeys);
    expect(Object.keys(body.providers.gemini!)).toEqual(expectedKeys);
    expect(Object.keys(body.providers.openrouter!)).toEqual(expectedKeys);
  });

  test("admin → 200 two-key report, providers keyed in §26.1 chain order, schema-valid", async () => {
    const { app } = makeApp(asAdmin, CAPTURE_ENV);
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

  test("snapshots never carry credential material (the frozen secrets law)", async () => {
    const { app } = makeApp(asAdmin, {
      ...CAPTURE_ENV,
      SYLLABAI_LLM_GROQ_API_KEY: "gsk_SUPER-secret-value-42",
    });
    const raw = JSON.stringify(await (await app.request(URL)).json());
    expect(raw).not.toContain("gsk_SUPER-secret-value-42");
    expect(raw).not.toContain("apiKey");
    expect(raw).not.toContain("api_key");
  });
});

// ── the frozen-EFFECTIVE config law (ruling4 §2, the r1c amendment) ─────────

describe("chain config law — the application.yml @ 6cad6ef layer of record", () => {
  test("no-env boot binds the YML layer: enabled bridges default TRUE, unconfigured members honest", async () => {
    const { app } = makeApp(asAdmin);
    const body = (await (await app.request(URL)).json()) as {
      chainAvailable: boolean;
      providers: Record<string, Record<string, unknown>>;
    };
    // enabled=true (the ${SYLLABAI_*_ENABLED:true} bridges) but no keys →
    // configured=false, healthy=false, chainAvailable honestly false
    expect(body.providers.groq!).toMatchObject({
      enabled: true,
      configured: false,
      healthy: false,
      effectiveModel: "openai/gpt-oss-120b", // the YML model, not the record default
    });
    expect(body.providers.gemini!.effectiveModel).toBe("gemini-3.6-flash");
    expect(body.providers.openrouter!.effectiveModel).toBe("nvidia/nemotron-3-super-120b-a12b:free");
    expect(body.chainAvailable).toBe(false);
  });

  test("properties of record: groq base-url carries /v1, chain 60/60/3/1000 (yml-effective)", () => {
    const props = readLlmChainProperties({});
    expect(props.mode).toBe("PRODUCTION");
    expect(props.groq.baseUrl).toBe("https://api.groq.com/openai/v1");
    expect(props.groq.model).toBe("openai/gpt-oss-120b");
    expect(props.gemini.model).toBe("gemini-3.6-flash");
    expect(props.openRouter.model).toBe("nvidia/nemotron-3-super-120b-a12b:free");
    expect(props.openRouter.baseUrl).toBe("https://openrouter.ai/api/v1");
    expect(props.chain.timeoutSeconds).toBe(60);
    expect(props.chain.cooldownSeconds).toBe(60);
    expect(props.chain.failureThreshold).toBe(3);
    expect(props.chain.dailyBudgetPerProvider).toBe(1000);
  });

  test("the record compactors stay reachable as compactor TARGETS (blank/≤0 sets)", () => {
    // an explicitly-set-but-blank layer-1 model falls to the record default
    expect(readLlmChainProperties({ SYLLABAI_LLM_GROQ_MODEL: "" }).groq.model).toBe(
      "llama-3.3-70b-versatile",
    );
    // an explicitly-zero timeout falls to the record compactor target (30, not 60)
    expect(readLlmChainProperties({ SYLLABAI_LLM_CHAIN_TIMEOUT_SECONDS: "0" }).chain.timeoutSeconds).toBe(30);
    // the yml placeholder bridge feeds layer 2
    expect(readLlmChainProperties({ SYLLABAI_GROQ_MODEL: "custom-model" }).groq.model).toBe("custom-model");
    // the daily-budget bridge rides SYLLABAI_LLM_DAILY_BUDGET
    expect(readLlmChainProperties({ SYLLABAI_LLM_DAILY_BUDGET: "50" }).chain.dailyBudgetPerProvider).toBe(50);
  });

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

  test("TEST mode IGNORES keys in the environment (LlmChainConfig fail-closed)", async () => {
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

  test("LIVE mode: report posture = production; keyed members construct the REAL adapters (ADR-MIG-0002)", async () => {
    const { app, chain } = makeApp(asAdmin, {
      SYLLABAI_LLM_MODE: "live",
      SYLLABAI_LLM_GROQ_ENABLED: "true",
      SYLLABAI_LLM_GROQ_API_KEY: "gsk_test-key",
    });
    const body = (await (await app.request(URL)).json()) as {
      providers: Record<string, Record<string, unknown>>;
    };
    expect(body.providers.groq!).toMatchObject({ enabled: true, configured: true, healthy: true });
    // ADR-MIG-0002 (operator directive ①, trace 1a117913519cd141): LIVE
    // constructs the real adapter for a configured member — the OpenAI-
    // compatible wire client, whose generate/stream law over an INJECTED
    // fake fetch is pinned in test/llmchain/adapters.test.ts (no network in
    // CI, the behavioural-gate doctrine §6). Untouched members stay dormant.
    const groq = chain.member("groq")!;
    expect(groq).toBeInstanceOf(OpenAiCompatibleChainMember);
    expect(chain.member("gemini")).toBeInstanceOf(DormantChainMember);
    expect(chain.member("openrouter")).toBeInstanceOf(DormantChainMember);
  });

  test("layer-1 relaxed binding overrides the yml layer (Spring precedence)", async () => {
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
    expect(snap.cooldownUntil).toBe("2026-10-08T00:00:00.000Z"); // utcDay.plusDays(1).atStartOfDay
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
    day = "2026-10-08"; // the UTC day rolls
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

  test("configured-but-dormant member (constructed directly): generate raises the structured exception, never a silent spend", async () => {
    // ADR-MIG-0002 amendment: buildLlmChain no longer PRODUCES configured
    // dormant members (keyed + enabled + non-test → the real adapter), so
    // the dormant-seam discipline is pinned at the unit tier — a directly
    // constructed configured DormantChainMember (the shape a zero-key boot
    // registers, and the shape TEST mode forces regardless of keys) still
    // refuses generation with the structured exception and records the
    // attempt faithfully. The TEST-mode-ignores-keys law over the real
    // builder is pinned above ("TEST mode IGNORES keys").
    const dormant = new DormantChainMember("groq", true, true, false, 3, 60, 1000, "openai/gpt-oss-120b", clock);
    expect(dormant.available()).toBe(true);
    try {
      await dormant.generate({ system: "s", user: "u" });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(LlmProviderException);
      const err = e as LlmProviderException;
      expect(err.providerName).toBe("groq");
      expect(err.message).toContain("dormant seam");
      expect(err.failureClass).toBe("UNKNOWN");
    }
    // the attempt was recorded faithfully (observability stays honest)
    const snap = dormant.health().snapshot();
    expect(snap.consecutiveFailures).toBe(1);
    expect(snap.requestsToday).toBe(1);
    expect(snap.lastErrorMessage).toContain("dormant seam");
  });

  test("TEST mode + keys → the members the builder registers are dormant and refuse (fail-closed end-to-end)", async () => {
    const chain = buildLlmChain(
      {
        SYLLABAI_LLM_MODE: "test",
        SYLLABAI_LLM_GROQ_ENABLED: "true",
        SYLLABAI_LLM_GROQ_API_KEY: "gsk_test-key",
      },
      clock,
    );
    const groq = chain.member("groq")!;
    expect(groq).toBeInstanceOf(DormantChainMember);
    expect(groq.available()).toBe(false); // configured=false — the unconfigured guard
    try {
      await chain.generate({ system: "s", user: "u" });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(LlmProviderException);
      expect((e as LlmProviderException).message).toBe("no available LLM provider in chain");
    }
  });
});

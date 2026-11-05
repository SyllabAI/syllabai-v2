/**
 * DC8 — the key POOL laws (operator directive, trace 1a1aa5bf9c669399:
 * "we have a lot of keys — if quota finishes, use automatically the
 * others"). The key vars accept a comma-separated pool; every key
 * constructs its own chain member and the FROZEN failover loop (unchanged)
 * tries a provider's next key before the next provider. Pins:
 *   - parseKeyPool: split/trim/drop-empty, NO dedupe (disclosed);
 *   - construction: member names `groq`, `groq#2`, … in provider order;
 *     single-key boots keep the EXACT frozen names (byte-compat);
 *   - failover across a provider's own keys happens within ONE generate —
 *     the second key's Authorization header carries the SECOND key (each
 *     member owns its credential);
 *   - an AUTHENTICATION_FAILURE key benches to the end of the UTC day (the
 *     frozen health law) — the pool stops calling it at all;
 *   - media routing still only reaches the gemini family (pool members
 *     inherit supportsMedia from their class);
 *   - TEST mode + zero-key boots stay fail-closed (dormant singletons).
 * Real adapters + injected fake fetches — no network (the CI discipline).
 */
import { describe, expect, test } from "bun:test";
import {
  FailoverLlmChain,
  buildLlmChain,
  parseKeyPool,
} from "../../src/services/llmchain";
import { OpenAiCompatibleChainMember } from "../../src/services/llmchain/adapters";
import type { HealthClock, LlmChainRequest } from "../../src/services/llmchain";

const DAY_1 = "2026-11-05";
const clock: HealthClock = {
  now: () => new Date(`${DAY_1}T10:00:00.000Z`),
  utcDay: () => DAY_1,
};

const MEMBER_OPTS = {
  failureThreshold: 3,
  cooldownSeconds: 60,
  dailyBudget: 1000,
  timeoutSeconds: 5,
  clock,
} as const;

const REQ: LlmChainRequest = { system: "sys", user: "question" };

/** Fake fetch with a per-Authorization call ledger (each key counted). */
function fetchByKey(responses: Record<string, { status: number; body?: unknown }>) {
  const calls: Array<{ key: string; status: number }> = [];
  const fetchImpl = (async (url: unknown, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    const key = headers.get("Authorization") ?? "";
    const rule = responses[key];
    calls.push({ key, status: rule?.status ?? 0 });
    return new Response(JSON.stringify(rule?.body ?? {}), {
      status: rule?.status ?? 500,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

const OK_BODY = {
  choices: [{ finish_reason: "stop", message: { content: "answered" } }],
  model: "test-model",
};

// ── parseKeyPool ─────────────────────────────────────────────────────────────

describe("parseKeyPool (the DC8 env projection)", () => {
  test("comma pool splits, trims, drops empties", () => {
    expect(parseKeyPool("k1,k2,k3")).toEqual(["k1", "k2", "k3"]);
    expect(parseKeyPool(" k1 ,  k2  ,k3,")).toEqual(["k1", "k2", "k3"]);
    expect(parseKeyPool(",")).toEqual([]);
    expect(parseKeyPool("")).toEqual([]);
    expect(parseKeyPool(null)).toEqual([]);
    expect(parseKeyPool(undefined)).toEqual([]);
  });

  test("single key = the pool of one (pre-DC8 surface)", () => {
    expect(parseKeyPool("only-key")).toEqual(["only-key"]);
  });

  test("NO dedupe — duplicate keys are the operator's own redundancy (disclosed)", () => {
    expect(parseKeyPool("k1,k1")).toEqual(["k1", "k1"]);
  });
});

// ── construction law ────────────────────────────────────────────────────────

describe("buildLlmChain key pools (construction)", () => {
  test("multi-key env registers one member per key, provider order preserved", () => {
    const chain = buildLlmChain(
      {
        SYLLABAI_GROQ_API_KEY: "gk1,gk2,gk3",
        SYLLABAI_GEMINI_API_KEY: "mk1,mk2",
        SYLLABAI_OPENROUTER_API_KEY: "ok1",
      },
      clock,
    );
    expect(Object.keys(chain.memberHealth())).toEqual([
      "groq",
      "groq#2",
      "groq#3",
      "gemini",
      "gemini#2",
      "openrouter",
    ]);
    // per-key members inherit their class law: the gemini family is the
    // vision-capable one, pool-wide
    expect(chain.member("gemini#2")?.supportsMedia()).toBe(true);
    expect(chain.member("groq#3")?.supportsMedia()).toBe(false);
  });

  test("single-key boot is byte-identical (the frozen three names, no #2)", () => {
    const chain = buildLlmChain({ SYLLABAI_GROQ_API_KEY: "gk1" }, clock);
    expect(Object.keys(chain.memberHealth())).toEqual(["groq", "gemini", "openrouter"]);
    expect(chain.member("groq#2")).toBeNull();
  });

  test("zero-key boot stays the dormant fail-closed singleton", () => {
    const chain = buildLlmChain({}, clock);
    expect(Object.keys(chain.memberHealth())).toEqual(["groq", "gemini", "openrouter"]);
    expect(chain.available()).toBe(false);
  });

  test("TEST mode ignores a whole pool (fail-closed, no real adapters)", () => {
    const chain = buildLlmChain(
      { SYLLABAI_LLM_MODE: "test", SYLLABAI_GROQ_API_KEY: "gk1,gk2" },
      clock,
    );
    const report = chain.memberHealth();
    expect(Object.keys(report)).toEqual(["groq", "gemini", "openrouter"]);
    expect(report.groq?.configured).toBe(false);
    expect(chain.available()).toBe(false);
  });

  test("blank pool entries never construct a keyless member", () => {
    const chain = buildLlmChain({ SYLLABAI_GROQ_API_KEY: " , ,, " }, clock);
    expect(Object.keys(chain.memberHealth())).toEqual(["groq", "gemini", "openrouter"]);
    expect(chain.member("groq")?.health().snapshot().configured).toBe(false);
  });
});

// ── the failover law over a provider's own keys ─────────────────────────────

describe("key-pool failover (the frozen loop, per-key credentials)", () => {
  test("a 429 key moves the SAME request to the provider's next key", async () => {
    const { calls, fetchImpl } = fetchByKey({
      "Bearer gk1": { status: 429, body: { error: "quota" } },
      "Bearer gk2": { status: 200, body: OK_BODY },
    });
    const chain = new FailoverLlmChain([
      new OpenAiCompatibleChainMember("groq", { apiKey: "gk1", baseUrl: "https://groq.test/v1", model: "m" }, { ...MEMBER_OPTS, fetchImpl }),
      new OpenAiCompatibleChainMember("groq#2", { apiKey: "gk2", baseUrl: "https://groq.test/v1", model: "m" }, { ...MEMBER_OPTS, fetchImpl }),
    ]);
    const out = await chain.generate(REQ);
    expect(out.text).toBe("answered");
    expect(out.providerName).toBe("groq#2");
    expect(calls).toEqual([
      { key: "Bearer gk1", status: 429 },
      { key: "Bearer gk2", status: 200 },
    ]);
  });

  test("an AUTH_FAILURE key benches to the end of the UTC day — never called again", async () => {
    const { calls, fetchImpl } = fetchByKey({
      "Bearer dead": { status: 401, body: { error: "invalid api key" } },
      "Bearer live": { status: 200, body: OK_BODY },
    });
    const chain = new FailoverLlmChain([
      new OpenAiCompatibleChainMember("groq", { apiKey: "dead", baseUrl: "https://groq.test/v1", model: "m" }, { ...MEMBER_OPTS, fetchImpl }),
      new OpenAiCompatibleChainMember("groq#2", { apiKey: "live", baseUrl: "https://groq.test/v1", model: "m" }, { ...MEMBER_OPTS, fetchImpl }),
    ]);
    await chain.generate(REQ);
    const afterFirst = calls.length;
    expect(afterFirst).toBe(2); // dead tried once, live served

    await chain.generate(REQ);
    await chain.generate(REQ);
    // every later ask goes straight to the live key — the dead key is
    // benched until the day rolls over (the frozen health law)
    expect(calls.slice(afterFirst).every((c) => c.key === "Bearer live")).toBe(true);
  });

  test("exhausted pools of BOTH keys surface the classified aggregate (honest red)", async () => {
    const { calls, fetchImpl } = fetchByKey({
      "Bearer gk1": { status: 429, body: { error: "quota" } },
      "Bearer gk2": { status: 429, body: { error: "quota" } },
    });
    const chain = new FailoverLlmChain([
      new OpenAiCompatibleChainMember("groq", { apiKey: "gk1", baseUrl: "https://groq.test/v1", model: "m" }, { ...MEMBER_OPTS, fetchImpl }),
      new OpenAiCompatibleChainMember("groq#2", { apiKey: "gk2", baseUrl: "https://groq.test/v1", model: "m" }, { ...MEMBER_OPTS, fetchImpl }),
    ]);
    await expect(chain.generate(REQ)).rejects.toThrow(/all providers failed/);
    expect(calls).toHaveLength(2); // one bounded attempt per key
  });
});

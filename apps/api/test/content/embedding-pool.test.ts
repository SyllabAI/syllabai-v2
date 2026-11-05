/**
 * DC8 — the EMBEDDING key pool (the query plane's quota failover). The
 * embedding provider is on EVERY ask (KG arm + pgvector arm + the DC7
 * pivot arm), so one dead Gemini key 500s the whole tutor — the measured
 * 2026-11-04/05 outage. The pool rides the CHAIN's own health law:
 *   - first HEALTHY key serves; exhausted keys cool after the failure
 *     threshold; AUTH_FAILURE keys bench to the end of the UTC day;
 *   - classified failures (classifyHttpStatus) — one classifier law;
 *   - every key exhausted → the aggregate THROW (the frozen arm contract:
 *     transport failures propagate — never a silent empty search).
 * Injected fake fetch + fake clock — no network, deterministic cooldowns.
 */
import { describe, expect, test } from "bun:test";
import {
  GeminiEmbeddingProvider,
  resolveEmbeddingProvider,
} from "../../src/services/content/retrieval";
import type { HealthClock } from "../../src/services/llmchain";

/** Mutable fake clock (cooldown expiry needs time to move). */
function makeClock() {
  let t = Date.parse("2026-11-05T10:00:00.000Z");
  const clock: HealthClock = {
    now: () => new Date(t),
    utcDay: () => new Date(t).toISOString().slice(0, 10),
  };
  return {
    clock,
    advanceMs: (ms: number) => {
      t += ms;
    },
  };
}

const OK_768 = { embedding: { values: Array.from({ length: 768 }, (_, i) => i / 768) } };

/** Fake fetch keyed on the x-goog-api-key header, with a call ledger. */
function fetchByKey(rules: Record<string, { status: number; body?: unknown }>) {
  const calls: Array<{ key: string; status: number }> = [];
  const fetchImpl = (async (url: unknown, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    const key = headers.get("x-goog-api-key") ?? "";
    const rule = rules[key];
    calls.push({ key, status: rule?.status ?? 0 });
    return new Response(JSON.stringify(rule?.body ?? {}), {
      status: rule?.status ?? 500,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

describe("GeminiEmbeddingProvider key pool (DC8)", () => {
  test("single key: the pool of one serves and records success", async () => {
    const { calls, fetchImpl } = fetchByKey({ K1: { status: 200, body: OK_768 } });
    const p = new GeminiEmbeddingProvider(["K1"], { fetchImpl });
    const v = await p.embedQuery("ionic bonding");
    expect(v).toHaveLength(768);
    expect(calls).toEqual([{ key: "K1", status: 200 }]);
  });

  test("a 429 key rotates the SAME query to the next pool key", async () => {
    const { calls, fetchImpl } = fetchByKey({
      K1: { status: 429, body: { error: "quota exceeded" } },
      K2: { status: 200, body: OK_768 },
    });
    const p = new GeminiEmbeddingProvider(["K1", "K2"], { fetchImpl });
    const v = await p.embedQuery("ionic bonding");
    expect(v).toHaveLength(768);
    expect(calls).toEqual([
      { key: "K1", status: 429 },
      { key: "K2", status: 200 },
    ]);
  });

  test("an exhausted key cools (threshold reached) and is SKIPPED while cooling", async () => {
    const { clock, advanceMs } = makeClock();
    const { calls, fetchImpl } = fetchByKey({
      K1: { status: 429, body: { error: "quota exceeded" } },
      K2: { status: 200, body: OK_768 },
    });
    const p = new GeminiEmbeddingProvider(["K1", "K2"], {
      fetchImpl,
      clock,
      failureThreshold: 1, // one 429 = cooling (the chain's knob, shared law)
      cooldownSeconds: 60,
    });
    await p.embedQuery("q1"); // K1 fails → K2 serves
    await p.embedQuery("q2"); // K1 cooling → straight to K2
    expect(calls.map((c) => c.key)).toEqual(["K1", "K2", "K2"]);

    advanceMs(61_000); // cooldown expired — K1 is healthy again
    await p.embedQuery("q3");
    expect(calls.map((c) => c.key)).toEqual(["K1", "K2", "K2", "K1", "K2"]);
  });

  test("an AUTH_FAILURE key benches to the end of the UTC day", async () => {
    const { clock, advanceMs } = makeClock();
    const { calls, fetchImpl } = fetchByKey({
      DEAD: { status: 401, body: { error: "invalid key" } },
      LIVE: { status: 200, body: OK_768 },
    });
    const p = new GeminiEmbeddingProvider(["DEAD", "LIVE"], {
      fetchImpl,
      clock,
      failureThreshold: 5, // irrelevant: AUTH benches immediately (frozen law)
      cooldownSeconds: 1,
    });
    await p.embedQuery("q1");
    advanceMs(30_000); // past any 1s cooldown — but AUTH benches the whole day
    await p.embedQuery("q2");
    expect(calls.map((c) => c.key)).toEqual(["DEAD", "LIVE", "LIVE"]);
  });

  test("every key exhausted → the honest aggregate throw (never a silent empty)", async () => {
    const { calls, fetchImpl } = fetchByKey({
      K1: { status: 429, body: { error: "quota" } },
      K2: { status: 503, body: { error: "down" } },
    });
    const p = new GeminiEmbeddingProvider(["K1", "K2"], { fetchImpl });
    await expect(p.embedQuery("q")).rejects.toThrow(/all embedding keys failed/);
    expect(calls).toHaveLength(2);
  });

  test("every key cooling/benched → the pool-exhausted throw, zero calls", async () => {
    const { clock } = makeClock();
    const { calls, fetchImpl } = fetchByKey({
      K1: { status: 429, body: { error: "quota" } },
      K2: { status: 429, body: { error: "quota" } },
    });
    const p = new GeminiEmbeddingProvider(["K1", "K2"], {
      fetchImpl,
      clock,
      failureThreshold: 1,
      cooldownSeconds: 60,
    });
    await expect(p.embedQuery("q1")).rejects.toThrow(/all embedding keys failed/);
    await expect(p.embedQuery("q2")).rejects.toThrow(/cooling or benched/);
    expect(calls).toHaveLength(2); // q2 attempted NOTHING
  });

  test("dimension mismatch is a classified failure — falls to the next key", async () => {
    const { fetchImpl } = fetchByKey({
      K1: { status: 200, body: { embedding: { values: [0.1, 0.2] } } }, // wrong dims
      K2: { status: 200, body: OK_768 },
    });
    const p = new GeminiEmbeddingProvider(["K1", "K2"], { fetchImpl });
    const v = await p.embedQuery("q");
    expect(v).toHaveLength(768);
  });

  test("string-form construction parses the pool (the resolveEmbeddingProvider path)", () => {
    const p = new GeminiEmbeddingProvider("a,b,c");
    expect(p.poolSize).toBe(3);
  });
});

describe("resolveEmbeddingProvider (the DC8 seam)", () => {
  test("unkeyed/blank → null (the frozen provider-absent posture)", () => {
    expect(resolveEmbeddingProvider({})).toBeNull();
    expect(resolveEmbeddingProvider({ SYLLABAI_EMBEDDING_GEMINI_API_KEY: "  " })).toBeNull();
    expect(resolveEmbeddingProvider({ SYLLABAI_EMBEDDING_GEMINI_API_KEY: ",," })).toBeNull();
  });

  test("comma pool → one provider over N keys", () => {
    const p = resolveEmbeddingProvider({ SYLLABAI_EMBEDDING_GEMINI_API_KEY: "k1, k2" });
    expect(p).not.toBeNull();
    expect((p as GeminiEmbeddingProvider).poolSize).toBe(2);
  });

  test("single key → pool of one (byte-compatible with pre-DC8)", () => {
    const p = resolveEmbeddingProvider({ SYLLABAI_EMBEDDING_GEMINI_API_KEY: "k1" });
    expect(p).not.toBeNull();
    expect((p as GeminiEmbeddingProvider).poolSize).toBe(1);
  });
});

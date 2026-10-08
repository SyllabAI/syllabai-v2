/**
 * Chain routing + failover tests over the REAL adapters with INJECTED fake
 * fetches (no network; members constructed directly so each gets its own
 * fake — buildLlmChain's construction law is pinned in llmadmin +
 * adapters tests). Pins the frozen FailoverLlmChain laws the real-adapter
 * lane must keep (ADR-MIG-0002):
 *   - media routing: a media-carrying request is offered ONLY to
 *     supportsMedia() members — a text-only provider never receives an image
 *     it would merely fail on; when no vision-capable member is available
 *     the request fails with the DISTINCT frozen message;
 *   - stream failover matches generate EXACTLY up to the first token (an
 *     error before any delta moves to the next candidate); after the first
 *     delta the stream is COMMITTED — a mid-stream failure propagates and
 *     the next candidate is NEVER tried (no duplicated/interleaved text);
 *   - the health of the failed member records the attempt faithfully even
 *     when the chain fails over;
 *   - generate failover + the aggregate exhaustion contract (which provider
 *     failed, why, classified).
 */
import { describe, expect, test } from "bun:test";
import { FailoverLlmChain } from "../../src/services/llmchain";
import { LlmProviderException } from "../../src/services/llmchain/health";
import {
  GeminiChainMember,
  OpenAiCompatibleChainMember,
} from "../../src/services/llmchain/adapters";

const MEMBER_OPTS = {
  failureThreshold: 3,
  cooldownSeconds: 60,
  dailyBudget: 1000,
  timeoutSeconds: 5,
} as const;

const encoder = new TextEncoder();

/** JSON fake fetch with a call ledger. */
function fetchJson(status: number, body: unknown) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = (async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

/** SSE fake fetch with a call ledger. */
function fetchSse(chunks: string[]) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = (async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    });
    return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

/** SSE fake fetch that yields ONE delta, then errors mid-stream (the error
 * is scheduled AFTER the chunk so the first read really delivers it — an
 * error() during start() discards the queue and would look pre-first-delta). */
function fetchSseDiesMidFlight() {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = (async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'));
        setTimeout(() => controller.error(new Error("connection reset mid-stream")), 20);
      },
    });
    return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

function groq(fetchImpl: typeof fetch) {
  return new OpenAiCompatibleChainMember(
    "groq",
    { apiKey: "gsk", baseUrl: "https://groq.test/v1", model: "groq-model" },
    { ...MEMBER_OPTS, fetchImpl },
  );
}

function gemini(fetchImpl: typeof fetch) {
  return new GeminiChainMember(
    "gemini",
    { apiKey: "gm", model: "gemini-model" },
    { ...MEMBER_OPTS, fetchImpl },
  );
}

async function collect(iterable: AsyncIterable<{ text: string; providerName: string }>) {
  const out: Array<{ text: string; providerName: string }> = [];
  for await (const delta of iterable) out.push({ text: delta.text, providerName: delta.providerName });
  return out;
}

describe("FailoverLlmChain — media routing (the frozen HUB-ANSWER-BOX law)", () => {
  test("text request → the first available member only (gemini never called)", async () => {
    const groqOk = fetchJson(200, { choices: [{ finish_reason: "stop", message: { content: "groq text" } }] });
    const geminiOk = fetchJson(200, { candidates: [] });
    const chain = new FailoverLlmChain([groq(groqOk.fetchImpl), gemini(geminiOk.fetchImpl)]);
    const out = await chain.generate({ system: "s", user: "u" });
    expect(out.text).toBe("groq text");
    expect(out.providerName).toBe("groq");
    expect(geminiOk.calls).toHaveLength(0);
  });

  test("media request → ONLY the vision-capable member (a text-only provider never sees an image)", async () => {
    const groqOk = fetchJson(200, { choices: [{ finish_reason: "stop", message: { content: "hallucinated" } }] });
    const geminiOk = fetchJson(200, {
      candidates: [{ finishReason: "STOP", content: { parts: [{ text: "read the image" }] } }],
    });
    const chain = new FailoverLlmChain([groq(groqOk.fetchImpl), gemini(geminiOk.fetchImpl)]);
    const out = await chain.generate({
      system: "s",
      user: "u",
      media: { base64: "QUJD", mimeType: "image/png" },
    });
    expect(out.text).toBe("read the image");
    expect(out.providerName).toBe("gemini");
    expect(groqOk.calls).toHaveLength(0); // the routing filter, not the provider's honesty
  });

  test("media request with NO vision-capable member → the DISTINCT frozen exhaustion message", async () => {
    const groqOk = fetchJson(200, { choices: [{ finish_reason: "stop", message: { content: "x" } }] });
    const chain = new FailoverLlmChain([groq(groqOk.fetchImpl)]);
    try {
      await chain.generate({ system: "s", user: "u", media: { base64: "QUJD", mimeType: "image/png" } });
      expect.unreachable();
    } catch (e) {
      expect((e as LlmProviderException).message).toBe(
        "no vision-capable LLM provider available in chain",
      );
    }
    expect(groqOk.calls).toHaveLength(0);
  });
});

describe("FailoverLlmChain.generate — the failover + aggregate contract", () => {
  test("first member 429s (no cooldown) → the chain fails over to the next; failures recorded faithfully", async () => {
    const groqRate = fetchJson(429, { error: { message: "quota" } });
    const geminiOk = fetchJson(200, {
      candidates: [{ finishReason: "STOP", content: { parts: [{ text: "from gemini" }] } }],
    });
    const groqMember = groq(groqRate.fetchImpl);
    const geminiMember = gemini(geminiOk.fetchImpl);
    const chain = new FailoverLlmChain([groqMember, geminiMember]);
    const out = await chain.generate({ system: "s", user: "u" });
    expect(out.text).toBe("from gemini");
    expect(groqRate.calls).toHaveLength(1);
    expect(groqMember.health().snapshot().consecutiveFailures).toBe(1);
  });

  test("all members fail → the aggregate says WHICH provider failed and WHY, classified", async () => {
    const groqDown = fetchJson(500, { error: "groq down" });
    const geminiDown = fetchJson(503, { error: "gemini down" });
    const chain = new FailoverLlmChain([groq(groqDown.fetchImpl), gemini(geminiDown.fetchImpl)]);
    try {
      await chain.generate({ system: "s", user: "u" });
      expect.unreachable();
    } catch (e) {
      const err = e as LlmProviderException;
      expect(err.providerName).toBe("chain");
      expect(err.message).toContain("all providers failed, last error:");
      expect(err.message).toContain("[groq:");
      expect(err.message).toContain("gemini:");
      expect(err.failureClass).toBe("PROVIDER_UNAVAILABLE");
    }
  });
});

describe("FailoverLlmChain.stream — the commit law", () => {
  test("error BEFORE the first delta → clean failover to the next candidate", async () => {
    const groqDown = fetchJson(500, { error: "down" });
    const geminiSse = fetchSse(['data: {"candidates":[{"content":{"parts":[{"text":"gemini delta"}]}}]}\n\n']);
    const chain = new FailoverLlmChain([groq(groqDown.fetchImpl), gemini(geminiSse.fetchImpl)]);
    const deltas = await collect(chain.stream({ system: "s", user: "u" }));
    expect(deltas).toEqual([{ text: "gemini delta", providerName: "gemini" }]);
    expect(groqDown.calls).toHaveLength(1);
    expect(geminiSse.calls).toHaveLength(1);
  });

  test("error AFTER the first delta → the stream is COMMITTED: the error propagates, no second provider", async () => {
    const groqDies = fetchSseDiesMidFlight();
    const geminiSse = fetchSse(['data: {"candidates":[{"content":{"parts":[{"text":"never"}]}}]}\n\n']);
    const chain = new FailoverLlmChain([groq(groqDies.fetchImpl), gemini(geminiSse.fetchImpl)]);
    const deltas: string[] = [];
    let threw: unknown = null;
    try {
      for await (const delta of chain.stream({ system: "s", user: "u" })) deltas.push(delta.text);
    } catch (e) {
      threw = e;
    }
    // the committed provider delivered its first delta, then the mid-stream
    // failure surfaced honestly (the SSE error-event path upstream)
    expect(deltas).toEqual(["partial"]);
    expect(threw).not.toBeNull();
    expect((threw as LlmProviderException).providerName).toBe("groq");
    // the fallback NEVER ran (no duplicated/interleaved text)
    expect(geminiSse.calls).toHaveLength(0);
  });

  test("empty chain (zero keys) → text and media exhaustion messages (dormant members)", async () => {
    const groqOk = fetchJson(200, {});
    const chain = new FailoverLlmChain([groq(groqOk.fetchImpl)]);
    // a member that is unconfigured/cooled/budgeted is not a candidate —
    // simulate via the health law: exhaust the budget
    const member = chain.member("groq")!;
    for (let i = 0; i < 1000; i++) member.health().recordSuccess(); // burn the daily budget
    try {
      await chain.generate({ system: "s", user: "u" });
      expect.unreachable();
    } catch (e) {
      expect((e as LlmProviderException).message).toBe("no available LLM provider in chain");
    }
    try {
      await chain.generate({ system: "s", user: "u", media: { base64: "Q", mimeType: "image/png" } });
      expect.unreachable();
    } catch (e) {
      expect((e as LlmProviderException).message).toBe(
        "no vision-capable LLM provider available in chain",
      );
    }
  });
});

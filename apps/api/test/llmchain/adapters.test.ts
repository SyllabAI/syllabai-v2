/**
 * Real provider adapter tests (ADR-MIG-0002 — the wave-3 LLM-chain lane's
 * surface, operator directive ① trace 1a117913519cd141). The wire laws of
 * SpringAiChatModelAdapter + LlmProviderFailureClassifier @ 6cad6ef, pinned
 * over an INJECTED fake fetch — never real HTTP (behavioural-gate doctrine
 * §6: CI stays model-free):
 *   - classify ONCE at the adapter boundary, from status codes and exception
 *     TYPES (429 rate limit, 401/403 auth, 404 model, 400/422 request,
 *     5xx server; abort → TIMEOUT; fetch TypeError → PROVIDER_UNAVAILABLE);
 *   - health bookkeeping: recordSuccess on completion (requestsToday counts,
 *     failures reset); recordFailure classified (AUTHENTICATION_FAILURE
 *     cools down to the end of the UTC day);
 *   - OpenAI-compatible wire shape: POST {baseUrl}/chat/completions, Bearer
 *     key, model = request.model > configured default, temperature rides only
 *     when present, max_tokens = maxTokens + the reasoning completion
 *     allowance (the content budget cannot be eaten by the reasoning
 *     channel), reasoning_effort carries the §26 knob;
 *   - Gemini wire shape: POST v1beta models/{model}:generateContent with
 *     x-goog-api-key, systemInstruction, generationConfig.maxOutputTokens
 *     ("GenAI names the cap differently"), media as inlineData (the
 *     vision-capable member, HUB-ANSWER-BOX wave 3);
 *   - SSE streaming: data:-line envelopes, [DONE] termination, empty
 *     bookkeeping chunks dropped, success recorded on completion.
 */
import { describe, expect, test } from "bun:test";
import {
  GeminiChainMember,
  OpenAiCompatibleChainMember,
  REASONING_COMPLETION_ALLOWANCE,
  classifyHttpStatus,
  classifyTransportError,
  type MemberOpts,
} from "../../src/services/llmchain/adapters";
import type { HealthClock } from "../../src/services/llmchain";

const DAY_1 = "2026-10-07";
const clock: HealthClock = {
  now: () => new Date(`${DAY_1}T10:00:00.000Z`),
  utcDay: () => DAY_1,
};

const opts: MemberOpts = {
  failureThreshold: 3,
  cooldownSeconds: 60,
  dailyBudget: 1000,
  timeoutSeconds: 60,
  clock,
};

/** Capturing fake fetch: one canned JSON response, calls recorded. */
function fetchJson(status: number, body: unknown) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = (async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(status === 204 ? null : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

/** SSE fake fetch: emits the given data lines from a real ReadableStream. */
function fetchSse(sseLines: string[], status = 200) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of sseLines) controller.enqueue(encoder.encode(line));
      controller.close();
    },
  });
  const fetchImpl = (async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(stream, { status, headers: { "Content-Type": "text/event-stream" } });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

async function collect(iterable: AsyncIterable<{ text: string }>): Promise<string[]> {
  const out: string[] = [];
  for await (const delta of iterable) out.push(delta.text);
  return out;
}

// ── the classifier ──────────────────────────────────────────────────────────

describe("LlmProviderFailureClassifier port — classifyHttpStatus", () => {
  test("the frozen byHttpStatus mapping", () => {
    expect(classifyHttpStatus(429)).toBe("RATE_LIMITED");
    expect(classifyHttpStatus(401)).toBe("AUTHENTICATION_FAILURE");
    expect(classifyHttpStatus(403)).toBe("AUTHENTICATION_FAILURE");
    expect(classifyHttpStatus(404)).toBe("MODEL_NOT_FOUND");
    expect(classifyHttpStatus(400)).toBe("BAD_REQUEST");
    expect(classifyHttpStatus(422)).toBe("BAD_REQUEST");
    expect(classifyHttpStatus(408)).toBe("TIMEOUT");
    expect(classifyHttpStatus(504)).toBe("TIMEOUT");
    expect(classifyHttpStatus(500)).toBe("PROVIDER_UNAVAILABLE");
    expect(classifyHttpStatus(503)).toBe("PROVIDER_UNAVAILABLE");
    expect(classifyHttpStatus(418)).toBe("UNKNOWN");
  });

  test("classifyTransportError: abort → TIMEOUT, fetch TypeError → PROVIDER_UNAVAILABLE, else UNKNOWN", () => {
    expect(classifyTransportError(new DOMException("aborted", "AbortError"))).toBe("TIMEOUT");
    expect(classifyTransportError(new TypeError("fetch failed"))).toBe("PROVIDER_UNAVAILABLE");
    expect(classifyTransportError(new Error("boom"))).toBe("UNKNOWN");
  });
});

// ── OpenAI-compatible member (groq / openrouter) ────────────────────────────

function groqMember(fetchImpl: typeof fetch, overrides: Partial<MemberOpts> = {}) {
  return new OpenAiCompatibleChainMember(
    "groq",
    { apiKey: "gsk_test", baseUrl: "https://api.groq.com/openai/v1", model: "openai/gpt-oss-120b" },
    { ...opts, fetchImpl, ...overrides },
  );
}

describe("OpenAiCompatibleChainMember — the SpringAiChatModelAdapter wire law", () => {
  test("generate: endpoint, Bearer key, default model, options ride only when present; success recorded", async () => {
    const { fetchImpl, calls } = fetchJson(200, {
      model: "openai/gpt-oss-120b",
      choices: [{ finish_reason: "stop", message: { content: "grounded answer" } }],
    });
    const member = groqMember(fetchImpl);
    const out = await member.generate({ system: "SYS", user: "USER", temperature: 0.2, maxTokens: 900 });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe("Bearer gsk_test");
    const body = JSON.parse(String(calls[0]!.init.body)) as Record<string, unknown>;
    expect(body.model).toBe("openai/gpt-oss-120b");
    expect(body.messages).toEqual([
      { role: "system", content: "SYS" },
      { role: "user", content: "USER" },
    ]);
    expect(body.temperature).toBe(0.2);
    // the content budget of record + the reasoning completion allowance —
    // the wire cap can never be eaten inside the reasoning channel (#706 class)
    expect(body.max_tokens).toBe(900 + REASONING_COMPLETION_ALLOWANCE);
    expect(body.stream).toBe(false);
    expect("reasoning_effort" in body).toBeFalse(); // the §26 knob rides only when asked
    expect(out).toEqual({
      text: "grounded answer",
      model: "openai/gpt-oss-120b",
      providerName: "groq",
      finishReason: "stop",
    });
    const snap = member.health().snapshot();
    expect(snap.requestsToday).toBe(1);
    expect(snap.consecutiveFailures).toBe(0);
    expect(snap.healthy).toBe(true);
  });

  test("request.model overrides the configured default; reasoningEffort wires reasoning_effort", async () => {
    const { fetchImpl, calls } = fetchJson(200, {
      choices: [{ finish_reason: "stop", message: { content: "x" } }],
    });
    const member = groqMember(fetchImpl);
    await member.generate({ system: "s", user: "u", model: "pinned-model", reasoningEffort: "low" });
    const body = JSON.parse(String(calls[0]!.init.body)) as Record<string, unknown>;
    expect(body.model).toBe("pinned-model");
    expect(body.reasoning_effort).toBe("low");
    expect("temperature" in body).toBeFalse(); // null = provider default (frozen law)
    expect("max_tokens" in body).toBeFalse();
  });

  test("maxTokens is the CONTENT budget — the wire cap rides the reasoning completion allowance", async () => {
    // T-REASON-WALL-1: the reasoning models this member serves (groq
    // gpt-oss-*, openrouter nemotron-*) spend reasoning tokens out of the
    // completion cap — the #706 tutor wall class. The caller's budget must
    // survive the reasoning spend, so the wire cap = maxTokens + allowance;
    // without a budget no cap rides at all (unchanged frozen law).
    const { fetchImpl, calls } = fetchJson(200, {
      choices: [{ finish_reason: "stop", message: { content: "x" } }],
    });
    const member = groqMember(fetchImpl);
    await member.generate({ system: "s", user: "u", maxTokens: 8000 });
    const body = JSON.parse(String(calls[0]!.init.body)) as Record<string, unknown>;
    expect(body.max_tokens).toBe(8000 + REASONING_COMPLETION_ALLOWANCE);
  });

  test("401 → AUTHENTICATION_FAILURE + cooldown to the END OF THE UTC DAY (dead keys cannot heal)", async () => {
    const { fetchImpl } = fetchJson(401, { error: { message: "invalid api key" } });
    const member = groqMember(fetchImpl);
    try {
      await member.generate({ system: "s", user: "u" });
      expect.unreachable();
    } catch (e) {
      expect((e as Error).name).toBe("LlmProviderException");
      expect((e as Error).message).toContain("status 401");
    }
    const snap = member.health().snapshot();
    expect(snap.lastFailureClass).toBe("AUTHENTICATION_FAILURE");
    expect(snap.consecutiveFailures).toBe(1);
    expect(snap.coolingDown).toBe(true);
    expect(snap.cooldownUntil).toBe("2026-10-08T00:00:00.000Z");
  });

  test("429 → RATE_LIMITED below threshold: NO cooldown (transient — the chain fails over)", async () => {
    const { fetchImpl } = fetchJson(429, { error: { message: "quota" } });
    const member = groqMember(fetchImpl);
    await member.generate({ system: "s", user: "u" }).catch(() => {});
    const snap = member.health().snapshot();
    expect(snap.lastFailureClass).toBe("RATE_LIMITED");
    expect(snap.coolingDown).toBe(false);
    expect(snap.healthy).toBe(true);
  });

  test("provider outage 500 → PROVIDER_UNAVAILABLE with the capped error body", async () => {
    const { fetchImpl } = fetchJson(500, { error: "backend blowup ".repeat(50) });
    const member = groqMember(fetchImpl);
    try {
      await member.generate({ system: "s", user: "u" });
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).toContain("status 500");
      expect((e as Error).message.length).toBeLessThan(260); // the 200-char cap
    }
    expect(member.health().snapshot().lastFailureClass).toBe("PROVIDER_UNAVAILABLE");
  });

  test("200 with an unparseable payload → INVALID_RESPONSE (never a silent empty)", async () => {
    const fetchImpl = (async (_url: unknown, _init?: RequestInit) =>
      new Response("<html>not json</html>", { status: 200 })) as typeof fetch;
    const member = groqMember(fetchImpl);
    try {
      await member.generate({ system: "s", user: "u" });
      expect.unreachable();
    } catch {
      expect(member.health().snapshot().lastFailureClass).toBe("INVALID_RESPONSE");
    }
  });

  test("200 with no choices → INVALID_RESPONSE", async () => {
    const { fetchImpl } = fetchJson(200, { object: "chat.completion" });
    const member = groqMember(fetchImpl);
    await member.generate({ system: "s", user: "u" }).catch(() => {});
    expect(member.health().snapshot().lastFailureClass).toBe("INVALID_RESPONSE");
  });

  test("transport timeout (abort) → TIMEOUT class", async () => {
    const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    }) as typeof fetch;
    const member = groqMember(fetchImpl, { timeoutSeconds: 1 });
    try {
      await member.generate({ system: "s", user: "u" });
      expect.unreachable();
    } catch {
      expect(member.health().snapshot().lastFailureClass).toBe("TIMEOUT");
    }
  });

  test("stream: SSE deltas parse, [DONE] terminates, bookkeeping chunks drop, success recorded on completion", async () => {
    const { fetchImpl, calls } = fetchSse([
      'data: {"model":"m","choices":[{"delta":{"role":"assistant"}}]}\n\n', // role-only — dropped
      'data: {"model":"m","choices":[{"delta":{"content":"He"}}]}\n\n',
      "data: {not json}\n\n", // keep-alive noise — dropped
      'data: {"model":"m","choices":[{"delta":{"content":"llo"}}]}\n\n',
      "data: [DONE]\n\n",
    ]);
    const member = groqMember(fetchImpl);
    const deltas = await collect(member.stream({ system: "s", user: "u" }));
    expect(deltas).toEqual(["He", "llo"]);
    const body = JSON.parse(String(calls[0]!.init.body)) as Record<string, unknown>;
    expect(body.stream).toBe(true);
    expect(member.health().snapshot().requestsToday).toBe(1); // stream success counts
  });

  test("stream: HTTP failure before the first delta → classified throw (failover-eligible)", async () => {
    const { fetchImpl } = fetchJson(500, { error: "down" });
    const member = groqMember(fetchImpl);
    await collect(member.stream({ system: "s", user: "u" })).catch((e) => {
      expect((e as Error).name).toBe("LlmProviderException");
      expect((e as Error).message).toContain("status 500");
    });
    expect(member.health().snapshot().lastFailureClass).toBe("PROVIDER_UNAVAILABLE");
  });
});

// ── the VISION-FB media slot (groq-vision / openrouter-vision tail) ─────────

describe("OpenAiCompatibleChainMember — the media-capable construction (VISION-FB)", () => {
  function scoutMember(fetchImpl: typeof fetch) {
    return new OpenAiCompatibleChainMember(
      "groq-vision",
      { apiKey: "gsk_vision", baseUrl: "https://api.groq.com/openai/v1", model: "meta-llama/llama-4-scout-17b-16e-instruct" },
      { ...opts, fetchImpl },
      true, // mediaCapable — the vision slot
    );
  }

  test("media request → image_url data URL + text content parts (the OpenAI vision wire shape)", async () => {
    const { fetchImpl, calls } = fetchJson(200, {
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      choices: [{ finish_reason: "stop", message: { content: "NH4+" } }],
    });
    const member = scoutMember(fetchImpl);
    const out = await member.generate({
      system: "transcribe the crop",
      user: "read the handwritten answer",
      temperature: 0,
      maxTokens: 900,
      media: { base64: "QUJD", mimeType: "image/png" },
    });
    expect(out.text).toBe("NH4+");
    expect(out.providerName).toBe("groq-vision");
    const body = JSON.parse(String(calls[0]!.init.body)) as Record<string, unknown>;
    expect(body.model).toBe("meta-llama/llama-4-scout-17b-16e-instruct");
    const messages = body.messages as Array<{ role: string; content: unknown }>;
    expect(messages[0]).toEqual({ role: "system", content: "transcribe the crop" });
    const userParts = messages[1]!.content as Array<Record<string, unknown>>;
    expect(userParts[0]).toEqual({
      type: "image_url",
      image_url: { url: "data:image/png;base64,QUJD" },
    });
    expect(userParts[1]).toEqual({ type: "text", text: "read the handwritten answer" });
    expect(member.supportsMedia()).toBe(true);
    expect(member.health().snapshot().healthy).toBe(true);
  });

  test("text request on the vision slot → byte-identical string content (no parts array)", async () => {
    const { fetchImpl, calls } = fetchJson(200, {
      choices: [{ finish_reason: "stop", message: { content: "x" } }],
    });
    const member = scoutMember(fetchImpl);
    await member.generate({ system: "s", user: "u" });
    const body = JSON.parse(String(calls[0]!.init.body)) as { messages: Array<{ content: unknown }> };
    expect(body.messages[1]!.content).toBe("u");
  });

  test("the default (text-only) construction drops media on a direct call — the disclosed belt", async () => {
    const { fetchImpl, calls } = fetchJson(200, {
      choices: [{ finish_reason: "stop", message: { content: "x" } }],
    });
    const member = groqMember(fetchImpl);
    expect(member.supportsMedia()).toBe(false);
    await member.generate({ system: "s", user: "u", media: { base64: "QUJD", mimeType: "image/png" } });
    const body = JSON.parse(String(calls[0]!.init.body)) as { messages: Array<{ content: unknown }> };
    // the CHAIN routing law is the guard (media never offered to a text
    // member); the payload drop is the belt — no image_url anywhere
    expect(body.messages[1]!.content).toBe("u");
    expect(JSON.stringify(body)).not.toContain("image_url");
    expect(JSON.stringify(body)).not.toContain("QUJD");
  });
});

// ── Gemini member (the vision-capable member) ───────────────────────────────

function geminiMember(fetchImpl: typeof fetch) {
  return new GeminiChainMember("gemini", { apiKey: "gm_test", model: "gemini-3.6-flash" }, { ...opts, fetchImpl });
}

describe("GeminiChainMember — the GoogleGenAiChatModel wire law", () => {
  test("generate: v1beta endpoint, x-goog-api-key, systemInstruction, maxOutputTokens mapping, text join", async () => {
    const { fetchImpl, calls } = fetchJson(200, {
      modelVersion: "gemini-3.6-flash",
      candidates: [
        { finishReason: "STOP", content: { parts: [{ text: "part one " }, { text: "part two" }] } },
      ],
    });
    const member = geminiMember(fetchImpl);
    const out = await member.generate({ system: "SYS", user: "USER", temperature: 0.1, maxTokens: 700 });
    expect(calls[0]!.url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent",
    );
    expect((calls[0]!.init.headers as Record<string, string>)["x-goog-api-key"]).toBe("gm_test");
    const body = JSON.parse(String(calls[0]!.init.body)) as Record<string, unknown>;
    expect((body.systemInstruction as { parts: Array<{ text: string }> }).parts[0]!.text).toBe("SYS");
    expect((body.contents as Array<{ role: string }>).at(0)!.role).toBe("user");
    expect((body.generationConfig as Record<string, unknown>).maxOutputTokens).toBe(700); // "GenAI names the cap differently"
    expect((body.generationConfig as Record<string, unknown>).temperature).toBe(0.1);
    expect(out.text).toBe("part one part two");
    expect(out.finishReason).toBe("STOP");
    expect(out.providerName).toBe("gemini");
  });

  test("media rides inlineData — the transcription path (vision-capable)", async () => {
    const { fetchImpl, calls } = fetchJson(200, {
      candidates: [{ finishReason: "STOP", content: { parts: [{ text: "$x^2$" }] } }],
    });
    const member = geminiMember(fetchImpl);
    await member.generate({
      system: "s",
      user: "u",
      media: { base64: "QUJD", mimeType: "image/png" },
    });
    const body = JSON.parse(String(calls[0]!.init.body)) as Record<string, unknown>;
    const parts = (body.contents as Array<{ parts: Array<Record<string, unknown>> }>)[0]!.parts;
    expect(parts[0]!.inlineData).toEqual({ mimeType: "image/png", data: "QUJD" });
    expect(parts[1]!.text).toBe("u");
  });

  test("403 → AUTHENTICATION_FAILURE; 404 → MODEL_NOT_FOUND (the classifier is provider-blind)", async () => {
    const dead = geminiMember(fetchJson(403, { error: { message: "key suspended" } }).fetchImpl);
    await dead.generate({ system: "s", user: "u" }).catch(() => {});
    expect(dead.health().snapshot().lastFailureClass).toBe("AUTHENTICATION_FAILURE");

    const retired = geminiMember(fetchJson(404, { error: { message: "model not found" } }).fetchImpl);
    await retired.generate({ system: "s", user: "u" }).catch(() => {});
    expect(retired.health().snapshot().lastFailureClass).toBe("MODEL_NOT_FOUND");
  });

  test("stream: alt=sse endpoint, chunk text joins through the same textOf law", async () => {
    const { fetchImpl, calls } = fetchSse([
      'data: {"modelVersion":"gemini-3.6-flash","candidates":[{"content":{"parts":[{"text":"Hel"}]}}]}\n\n',
      'data: {"modelVersion":"gemini-3.6-flash","candidates":[{"finishReason":"STOP","content":{"parts":[{"text":"lo"}]}}]}\n\n',
    ]);
    const member = geminiMember(fetchImpl);
    const deltas = await collect(member.stream({ system: "s", user: "u" }));
    expect(deltas).toEqual(["Hel", "lo"]);
    expect(calls[0]!.url).toContain(":streamGenerateContent?alt=sse");
  });
});

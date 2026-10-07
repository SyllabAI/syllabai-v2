/**
 * The REAL provider adapters — the wave-3 LLM-chain lane's surface, landed of
 * record (ADR-023 AMENDMENT: operator directive ①, trace 1a117913519cd141,
 * ADR-MIG-0002). Frozen sources ported line-against-line @ 6cad6ef:
 *   - infrastructure/llm/SpringAiChatModelAdapter.java (generate/stream/
 *     media/timeout/health-recording law)
 *   - infrastructure/llm/LlmChainConfig.java (registerProvider construction:
 *     real adapters ONLY when mode allows AND enabled AND key present)
 *   - infrastructure/llm/LlmProviderFailureClassifier.java (classify ONCE at
 *     the adapter boundary, from status codes and exception TYPES — never by
 *     parsing error strings; classified messages carry no credential material)
 *   - LlmMarkingCandidateGenerator G-4 law: per-gap stream idle timeout
 *     (STREAM_IDLE_TIMEOUT_SECONDS=60) mirrors the frozen Reactor .timeout().
 *
 * Providers (SpringAiChatModelAdapter javadoc): "Works for the OpenAI-
 * compatible models (Groq, OpenRouter) and the Google GenAI model (Gemini)
 * alike — provider specifics stay inside the bean construction." The v2
 * construction rides native fetch (zero new deps — bundle-safe for the
 * esbuild CJS lambda pipeline of record); the Spring AI SDK classes are the
 * wire shapes: /chat/completions (OpenAI-compatible) and :generateContent /
 * :streamGenerateContent?alt=sse (Gemini v1beta).
 *
 * TEST discipline preserved: adapters are CONSTRUCTED only for configured
 * members (buildLlmChain), and TEST mode never constructs them — tests wire
 * deterministic fakes via the injected fetchImpl, never real HTTP (the
 * behavioural-gate doctrine §6, CI stays model-free).
 */
import {
  type ChainMember,
  type HealthClock,
  type LlmChainRequest,
  type LlmChainResponse,
  type LlmFailureClassName,
  LlmProviderException,
  LlmProviderHealth,
} from "./health";

/** LlmProviderFailureClassifier.byHttpStatus — the shared HTTP-status mapping. */
export function classifyHttpStatus(status: number): LlmFailureClassName {
  if (status === 429) return "RATE_LIMITED";
  if (status === 401 || status === 403) return "AUTHENTICATION_FAILURE";
  if (status === 404) return "MODEL_NOT_FOUND";
  if (status === 400 || status === 422) return "BAD_REQUEST";
  if (status === 408 || status === 504) return "TIMEOUT";
  if (status >= 500) return "PROVIDER_UNAVAILABLE";
  return "UNKNOWN";
}

/**
 * Transport-level classification (the classifier's JDK-exception tier):
 * an aborted signal is the adapter's own timeout; a fetch TypeError is the
 * connect-failure family. Never throws — worst case UNKNOWN.
 */
export function classifyTransportError(e: unknown): LlmFailureClassName {
  if (e instanceof LlmProviderException) return e.failureClass;
  if (e instanceof Error && e.name === "AbortError") return "TIMEOUT";
  if (typeof e === "object" && e != null && (e as { signal?: { aborted?: boolean } }).signal?.aborted) {
    return "TIMEOUT";
  }
  if (e instanceof TypeError) return "PROVIDER_UNAVAILABLE"; // fetch network failure
  return "UNKNOWN";
}

export interface MemberOpts {
  failureThreshold: number;
  cooldownSeconds: number;
  dailyBudget: number;
  /** syllabai.llm.chain.timeout-seconds (the blocking-path bound). */
  timeoutSeconds: number;
  clock?: HealthClock;
  fetchImpl?: typeof fetch;
}

/**
 * AbortController + timer (AbortSignal.timeout parity) — cleared on
 * completion so a settled call never holds a live timer in the lambda.
 */
function timeoutSignal(seconds: number): { signal: AbortSignal; clear(): void } {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), Math.max(1, seconds) * 1000);
  // Node/bun unref: a pending provider timeout must not hold the event loop
  const unref = (t as { unref?: () => void }).unref;
  if (typeof unref === "function") unref.call(t);
  return { signal: controller.signal, clear: () => clearTimeout(t) };
}

/** The frozen STREAM_IDLE_TIMEOUT_SECONDS (SpringAiChatModelAdapter:211). */
const STREAM_IDLE_TIMEOUT_SECONDS = 60;

/**
 * Idle-timeout race for one streamed read: a provider that stalls between
 * chunks degrades into a counted TIMEOUT failure instead of an open stream.
 * The losing side of the race must never surface an unhandled rejection —
 * both promises carry a no-op catch; the timer is cleared when the race
 * settles (an abandoned read simply goes quiet).
 */
function readWithIdleTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  controller: AbortController,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const read = reader.read();
  read.catch(() => {}); // late rejection after the race settled — swallowed
  const idle = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new DOMException("stream idle timeout", "AbortError"));
    }, STREAM_IDLE_TIMEOUT_SECONDS * 1000);
    const u = (timer as unknown as { unref?: () => void } | undefined)?.unref;
    if (typeof u === "function") u.call(timer);
  });
  idle.catch(() => {}); // read won — the idle reject is swallowed
  return Promise.race([read, idle]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

/**
 * The shared member skeleton: SpringAiChatModelAdapter's health bookkeeping
 * (recordSuccess on completion; recordFailure classified ONCE at the adapter
 * boundary on any failure) with the provider wire specifics in subclasses.
 */
export abstract class BaseChainMember implements ChainMember {
  readonly healthObj: LlmProviderHealth;

  protected constructor(
    readonly name: string,
    protected readonly opts: MemberOpts,
    effectiveModel: string | null,
    protected readonly mediaCapable: boolean,
  ) {
    this.healthObj = new LlmProviderHealth(
      true,
      true,
      opts.failureThreshold,
      opts.cooldownSeconds,
      opts.dailyBudget,
      effectiveModel,
      opts.clock,
    );
  }

  available(): boolean {
    // SpringAiChatModelAdapter.available(): configured && not cooling && budget left
    return !this.healthObj.inCooldown() && !this.healthObj.budgetExhausted();
  }

  supportsMedia(): boolean {
    return this.mediaCapable;
  }

  health(): LlmProviderHealth {
    return this.healthObj;
  }

  abstract generate(request: LlmChainRequest): Promise<LlmChainResponse>;
  abstract stream(request: LlmChainRequest): AsyncIterable<LlmChainResponse>;

  /** The frozen failure path: classified summary, capped, health-recorded. */
  protected fail(message: string, failureClass: LlmFailureClassName): LlmProviderException {
    const summary = message.length > 200 ? message.slice(0, 200) : message;
    this.healthObj.recordFailure(summary, failureClass);
    return new LlmProviderException(this.name, `generation failed (${summary})`, failureClass);
  }
}

// ── OpenAI-compatible (Groq, OpenRouter) ────────────────────────────────────

export interface OpenAiCompatibleConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

interface ChatCompletionChunk {
  model?: string;
  choices?: Array<{
    finish_reason?: string | null;
    message?: { content?: string | null };
    delta?: { content?: string | null };
  }>;
}

/**
 * groqChatModel()/openRouterChatModel() construction + the adapter generate/
 * stream law, over POST {baseUrl}/chat/completions. openAiRuntimeOptions
 * parity: request.model > configured default; temperature/maxTokens ride only
 * when present; reasoningEffort → reasoning_effort (the §26 knob).
 */
export class OpenAiCompatibleChainMember extends BaseChainMember {
  constructor(
    name: string,
    private readonly config: OpenAiCompatibleConfig,
    opts: MemberOpts,
  ) {
    super(name, opts, config.model, false); // mediaCapable=false (LlmChainConfig)
  }

  private endpoint(): string {
    // the frozen base-urls carry the /v1 segment (yml layer of record)
    return `${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`;
  }

  private payload(request: LlmChainRequest, stream: boolean): Record<string, unknown> {
    const model = request.model != null && request.model.trim() !== "" ? request.model : this.config.model;
    const body: Record<string, unknown> = {
      model,
      // media-carrying requests never reach this member (chain routing law);
      // a direct call is refused honestly rather than hallucinating blindness
      messages: [
        ...(request.system ? [{ role: "system", content: request.system }] : []),
        { role: "user", content: request.user },
      ],
      stream,
    };
    if (request.temperature != null) body.temperature = request.temperature;
    if (request.maxTokens != null) body.max_tokens = request.maxTokens;
    if (request.reasoningEffort != null) body.reasoning_effort = request.reasoningEffort;
    return body;
  }

  private async post(request: LlmChainRequest, stream: boolean): Promise<Response> {
    const { signal, clear } = timeoutSignal(this.opts.timeoutSeconds);
    try {
      return await (this.opts.fetchImpl ?? fetch)(this.endpoint(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(this.payload(request, stream)),
        signal,
      });
    } catch (e) {
      const cls = classifyTransportError(e);
      throw this.fail(
        `${e instanceof Error ? e.name : "Error"}: ${e instanceof Error ? e.message : String(e)}`,
        cls === "UNKNOWN" ? "PROVIDER_UNAVAILABLE" : cls,
      );
    } finally {
      clear();
    }
  }

  async generate(request: LlmChainRequest): Promise<LlmChainResponse> {
    let res: Response;
    try {
      res = await this.post(request, false);
    } catch (e) {
      throw e instanceof LlmProviderException ? e : this.fail(String(e), "UNKNOWN");
    }
    if (!res.ok) {
      // provider error text: no credential material, capped for diagnosability
      const raw = await res.text().catch(() => "");
      const snippet = raw.replace(/\s+/g, " ").trim().slice(0, 200);
      throw this.fail(`status ${res.status}${snippet ? `: ${snippet}` : ""}`, classifyHttpStatus(res.status));
    }
    let parsed: ChatCompletionChunk;
    try {
      parsed = (await res.json()) as ChatCompletionChunk;
    } catch {
      throw this.fail("malformed provider payload (unparseable JSON)", "INVALID_RESPONSE");
    }
    const choice = parsed.choices?.[0];
    const text = choice?.message?.content ?? "";
    if (choice == null || choice.message == null) {
      throw this.fail("malformed provider payload (no choices[0].message)", "INVALID_RESPONSE");
    }
    this.healthObj.recordSuccess();
    return {
      text,
      model: parsed.model ?? this.config.model,
      providerName: this.name,
      finishReason: choice.finish_reason ?? null,
    };
  }

  async *stream(request: LlmChainRequest): AsyncIterable<LlmChainResponse> {
    const res = await this.post(request, true);
    if (!res.ok || res.body == null) {
      const raw = res.body == null ? "" : await res.text().catch(() => "");
      const snippet = raw.replace(/\s+/g, " ").trim().slice(0, 200);
      throw this.fail(`status ${res.status}${snippet ? `: ${snippet}` : ""}`, classifyHttpStatus(res.status));
    }
    // failures BEFORE the first delta stay failover-eligible (the chain's
    // switchOnFirst law); after the first delta the stream is committed and
    // a mid-stream failure propagates (recorded here, mapped by the chain)
    let yieldedFirst = false;
    const controller = new AbortController();
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (true) {
        const { done, value } = await readWithIdleTimeout(reader, controller);
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const data = trimmed.slice(5).trim();
          if (data === "[DONE]") continue;
          let chunk: ChatCompletionChunk;
          try {
            chunk = JSON.parse(data) as ChatCompletionChunk;
          } catch {
            continue; // keep-alive/comment noise — the frozen filter drops it
          }
          const text = chunk.choices?.[0]?.delta?.content ?? "";
          if (text.length === 0) continue; // role-only/usage-only bookkeeping
          yieldedFirst = true;
          yield {
            text,
            model: chunk.model ?? this.config.model,
            providerName: this.name,
            finishReason: chunk.choices?.[0]?.finish_reason ?? null,
          };
        }
      }
      if (yieldedFirst) this.healthObj.recordSuccess();
    } catch (e) {
      // classified ONCE at the adapter boundary (AbortError → TIMEOUT, fetch
      // TypeError → PROVIDER_UNAVAILABLE); pre- and post-first-delta failures
      // carry the same classes — the CHAIN owns the failover distinction
      throw this.fail(
        `${e instanceof Error ? e.name : "Error"}: ${e instanceof Error ? e.message : String(e)}`,
        classifyTransportError(e),
      );
    } finally {
      controller.abort(); // release the connection either way
      reader.releaseLock();
    }
  }
}

// ── Google GenAI (Gemini) — the chain's vision-capable member ───────────────

export interface GeminiConfig {
  apiKey: string;
  model: string;
}

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

interface GenerateContentResponse {
  modelVersion?: string;
  candidates?: Array<{
    finishReason?: string;
    content?: { parts?: Array<{ text?: string }> };
  }>;
}

/**
 * geminiChatModel() construction (GoogleGenAiChatModel over the genai REST
 * v1beta) + genAiRuntimeOptions parity: temperature/maxTokens →
 * generationConfig.{temperature,maxOutputTokens} ("GenAI names the cap
 * differently"); media rides inlineData (HUB-ANSWER-BOX wave 3 — transcription
 * reads images through THIS member only); reasoningEffort is accepted and
 * ignored (disclosed: the SDK thinkingLevel enum has no direct REST mapping —
 * the LOW knob's bounded-thinking purpose is preserved by the budget caps).
 */
export class GeminiChainMember extends BaseChainMember {
  constructor(name: string, private readonly config: GeminiConfig, opts: MemberOpts) {
    super(name, opts, config.model, true); // mediaCapable=true (LlmChainConfig)
  }

  private endpoint(stream: boolean, model: string): string {
    const action = stream ? "streamGenerateContent?alt=sse" : "generateContent";
    return `${GEMINI_BASE}/models/${model}:${action}`;
  }

  private payload(request: LlmChainRequest): Record<string, unknown> {
    const parts: Array<Record<string, unknown>> = [];
    if (request.media != null) {
      parts.push({ inlineData: { mimeType: request.media.mimeType, data: request.media.base64 } });
    }
    parts.push({ text: request.user });
    const generationConfig: Record<string, unknown> = {};
    if (request.temperature != null) generationConfig.temperature = request.temperature;
    if (request.maxTokens != null) generationConfig.maxOutputTokens = request.maxTokens;
    return {
      ...(request.system ? { systemInstruction: { parts: [{ text: request.system }] } } : {}),
      contents: [{ role: "user", parts }],
      ...(Object.keys(generationConfig).length > 0 ? { generationConfig } : {}),
    };
  }

  private textOf(res: GenerateContentResponse): { text: string; finishReason: string | null } {
    const candidate = res.candidates?.[0];
    const text =
      candidate?.content?.parts
        ?.map((p) => p.text ?? "")
        .join("") ?? "";
    return { text, finishReason: candidate?.finishReason ?? null };
  }

  private async post(request: LlmChainRequest, stream: boolean): Promise<Response> {
    const model =
      request.model != null && request.model.trim() !== "" ? request.model : this.config.model;
    const { signal, clear } = timeoutSignal(this.opts.timeoutSeconds);
    try {
      return await (this.opts.fetchImpl ?? fetch)(this.endpoint(stream, model), {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": this.config.apiKey },
        body: JSON.stringify(this.payload(request)),
        signal,
      });
    } catch (e) {
      const cls = classifyTransportError(e);
      throw this.fail(
        `${e instanceof Error ? e.name : "Error"}: ${e instanceof Error ? e.message : String(e)}`,
        cls === "UNKNOWN" ? "PROVIDER_UNAVAILABLE" : cls,
      );
    } finally {
      clear();
    }
  }

  async generate(request: LlmChainRequest): Promise<LlmChainResponse> {
    let res: Response;
    try {
      res = await this.post(request, false);
    } catch (e) {
      throw e instanceof LlmProviderException ? e : this.fail(String(e), "UNKNOWN");
    }
    if (!res.ok) {
      const raw = await res.text().catch(() => "");
      const snippet = raw.replace(/\s+/g, " ").trim().slice(0, 200);
      throw this.fail(`status ${res.status}${snippet ? `: ${snippet}` : ""}`, classifyHttpStatus(res.status));
    }
    let parsed: GenerateContentResponse;
    try {
      parsed = (await res.json()) as GenerateContentResponse;
    } catch {
      throw this.fail("malformed provider payload (unparseable JSON)", "INVALID_RESPONSE");
    }
    if (parsed.candidates == null) {
      throw this.fail("malformed provider payload (no candidates)", "INVALID_RESPONSE");
    }
    const { text, finishReason } = this.textOf(parsed);
    this.healthObj.recordSuccess();
    return {
      text,
      model: parsed.modelVersion ?? this.config.model,
      providerName: this.name,
      finishReason,
    };
  }

  async *stream(request: LlmChainRequest): AsyncIterable<LlmChainResponse> {
    const res = await this.post(request, true);
    if (!res.ok || res.body == null) {
      const raw = res.body == null ? "" : await res.text().catch(() => "");
      const snippet = raw.replace(/\s+/g, " ").trim().slice(0, 200);
      throw this.fail(`status ${res.status}${snippet ? `: ${snippet}` : ""}`, classifyHttpStatus(res.status));
    }
    let yieldedFirst = false;
    const controller = new AbortController();
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (true) {
        const { done, value } = await readWithIdleTimeout(reader, controller);
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          let chunk: GenerateContentResponse;
          try {
            chunk = JSON.parse(trimmed.slice(5).trim()) as GenerateContentResponse;
          } catch {
            continue;
          }
          const { text, finishReason } = this.textOf(chunk);
          if (text.length === 0) continue;
          yieldedFirst = true;
          yield {
            text,
            model: chunk.modelVersion ?? this.config.model,
            providerName: this.name,
            finishReason,
          };
        }
      }
      if (yieldedFirst) this.healthObj.recordSuccess();
    } catch (e) {
      // classified ONCE at the adapter boundary (see the OpenAI-compatible twin)
      throw this.fail(
        `${e instanceof Error ? e.name : "Error"}: ${e instanceof Error ? e.message : String(e)}`,
        classifyTransportError(e),
      );
    } finally {
      controller.abort();
      reader.releaseLock();
    }
  }
}

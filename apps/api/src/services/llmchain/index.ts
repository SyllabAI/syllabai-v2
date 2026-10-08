/**
 * The §26.1 free-tier LLM chain — deterministic plumbing port (T-MIG-090;
 * frozen sources: infrastructure/llm/FailoverLlmChain.java,
 * LlmProviderHealth.java, LlmChainProperties.java, LlmChainConfig.java,
 * SpringAiChatModelAdapter.java @ 6cad6ef, first-hand raw reads 2026-10-07).
 *
 * VEHICLE PROVENANCE (R0-arbitration/ruling4 §2, main de30ef8): the
 * structure is r1c's preserved implementation (branch t-mig-082-091/r1c @
 * 937ed6291 — services/llmchain, adopted of record), AMENDED by R0 to the
 * frozen-EFFECTIVE configuration. r1c carried the LlmChainProperties
 * CODE-layer defaults as effective; the r4b capture
 * (golden-captures/t-mig-090/leg-04-chain-admin-200.json) + the frozen
 * application.yml @ 6cad6ef prove the boot's effective config is the YML
 * layer:
 *   - groq model ${SYLLABAI_GROQ_MODEL:openai/gpt-oss-120b} (the code
 *     default llama-3.3-70b-versatile is retired for this key generation —
 *     yml comment, catalog probe 2026-09-14) and base-url
 *     https://api.groq.com/openai/v1 (the /v1 live finding 2026-09-14)
 *   - gemini model gemini-3.6-flash (literal — gemini-2.5-flash retired
 *     for new accounts)
 *   - openrouter model nvidia/nemotron-3-super-120b-a12b:free (literal —
 *     the free inventory rotated; probe-verified 2026-09-14)
 *   - chain timeout-seconds 60 / cooldown-seconds 60 / failure-threshold 3
 *     / daily-budget-per-provider ${SYLLABAI_LLM_DAILY_BUDGET:1000}
 *   - enabled bridges ${SYLLABAI_GROQ_ENABLED:true} /
 *     ${SYLLABAI_GEMINI_ENABLED:true} / ${SYLLABAI_OPENROUTER_ENABLED:true}
 *   - mode ${SYLLABAI_LLM_MODE:production} — THREE modes (production /
 *     test / live); r1c ported two.
 * Spring precedence preserved: SYLLABAI_LLM_* relaxed-binding env (layer 1)
 * > the yml values + placeholder bridges (layer 2) > the record compactors'
 * code defaults (layer 3, the compactor TARGETS — reachable only when an
 * explicitly-set value is blank/non-positive, mirroring the record
 * compactor semantics).
 *
 * Behaviour (the frozen generate loop, preserved): iterate the chain in
 * order; skip providers that are unconfigured or in cooldown; on failure
 * record health and continue; if every provider fails, throw the aggregate
 * LlmProviderException. memberHealth() snapshots every member in chain
 * order — the LlmAdminController.chainHealth() payload (groq → gemini →
 * openrouter, LlmChainProperties.chainOrder()).
 *
 * CONFIG SEAM: the same shape the existing v2 LLM services use — the tutor
 * and CLA composition roots gate generation behind an injected LlmProvider
 * port, the smartmark module behind MarkingCandidateGenerator/FeedbackLlm,
 * transcription behind TranscriptionProvider. bridges.ts adapts the chain to
 * all four; the composition roots wire the ONE chain of record (index.ts).
 * Providers register only when enabled AND their key is present
 * (LlmChainConfig registerProvider) — the ZERO-KEY boot of record
 * (ruling4 §3) is clean and the chain report shows what is missing.
 *
 * ADR-023 AMENDMENT OF RECORD (operator directive ①, trace
 * 1a117913519cd141, ADR-MIG-0002): the original port constructed NO real
 * provider adapter in any mode (fail-closed dormant seam; the wave-3
 * LLM-chain lane's surface). The operator has now commissioned that lane:
 * buildLlmChain constructs the REAL adapters (adapters.ts — groq/openrouter
 * OpenAI-compatible, gemini vision-capable) when the mode allows it AND the
 * provider is enabled AND its key is present, exactly the frozen
 * LlmChainConfig.registerProvider law. The fail-closed posture survives
 * UNCHANGED where it was load-bearing: TEST mode ignores keys entirely
 * (never constructs real adapters — no code path can silently spend quota);
 * zero-key boots register dormant members (chain report shows what is
 * missing; generation refuses honestly); golden cases are untouched (the
 * leg-04 capture posture is zero-key/TEST). Tests wire deterministic fakes
 * via the injected fetchImpl — never real adapters over real HTTP.
 *
 * Media routing (HUB-ANSWER-BOX wave 3, frozen FailoverLlmChain javadoc): a
 * request carrying media is offered ONLY to members that declare
 * supportsMedia() — when no vision-capable member is available the request
 * fails with the DISTINCT frozen message ("no vision-capable LLM provider
 * available in chain") instead of degrading into a text-only hallucination
 * of an image the provider never saw.
 *
 * Streaming (tutor SSE tranche): FailoverLlmChain.stream matches the frozen
 * law EXACTLY up to the first token — an error arriving before any delta
 * moves the stream to the next candidate; once the first delta is emitted
 * the stream is COMMITTED to that provider and a mid-stream failure
 * propagates (the caller surfaces the honest error event).
 */
import {
  type ChainMember,
  type HealthClock,
  type LlmChainRequest,
  type LlmChainResponse,
  LlmProviderException,
  LlmProviderHealth,
} from "./health";
import { GeminiChainMember, OpenAiCompatibleChainMember } from "./adapters";

// re-export the kernel — the historical import surface
// (routes/llmadmin.ts, test/llmadmin/**) stays byte-stable
export {
  isConfigurationFailure,
  LlmProviderException,
  LlmProviderHealth,
} from "./health";
export type {
  HealthClock,
  LlmMedia,
  LlmReasoningEffort,
  LlmChainRequest,
  LlmChainResponse,
  ChainMember,
} from "./health";
export { classifyHttpStatus, classifyTransportError } from "./adapters";
export {
  chainAsLlmProvider,
  chainAsFeedbackLlm,
  chainAsTranscriptionProvider,
  chainAsCandidateGenerator,
  isTruncationFinish,
  completionBudget,
  batchCompletionBudget,
  resolveMarks,
} from "./bridges";

// ── DormantChainMember — the fail-closed member (TEST mode + zero-key) ──────

/**
 * One chain member without a real adapter — the ADR-023 fail-closed posture
 * for unconfigured providers (and every provider in TEST mode). Records
 * health faithfully and answers generation with the structured exception
 * (never a silent spend).
 */
export class DormantChainMember implements ChainMember {
  readonly healthObj: LlmProviderHealth;

  constructor(
    readonly name: string,
    enabled: boolean,
    readonly configured: boolean,
    readonly mediaCapable: boolean,
    failureThreshold: number,
    cooldownSeconds: number,
    dailyBudget: number,
    readonly defaultModel: string | null,
    clock?: HealthClock,
  ) {
    this.healthObj = new LlmProviderHealth(
      enabled,
      configured,
      failureThreshold,
      cooldownSeconds,
      dailyBudget,
      defaultModel,
      clock,
    );
  }

  available(): boolean {
    // SpringAiChatModelAdapter.available()
    return this.configured && !this.healthObj.inCooldown() && !this.healthObj.budgetExhausted();
  }

  supportsMedia(): boolean {
    return this.mediaCapable;
  }

  health(): LlmProviderHealth {
    return this.healthObj;
  }

  async generate(_request: LlmChainRequest): Promise<LlmChainResponse> {
    if (!this.configured) {
      // the frozen unconfigured guard (SpringAiChatModelAdapter)
      throw new LlmProviderException(this.name, "provider not configured");
    }
    // ADR-023 fail-closed (TEST mode): no real adapter exists for this member —
    // structured, classified, honest.
    this.healthObj.recordFailure(
      `provider adapter not constructed in this lane — dormant seam (ADR-023 fail-closed, ${this.name})`,
      "UNKNOWN",
    );
    throw new LlmProviderException(
      this.name,
      "provider adapter not constructed in this lane — dormant seam (ADR-023 fail-closed)",
    );
  }

  async *stream(_request: LlmChainRequest): AsyncIterable<LlmChainResponse> {
    // the same fail-closed contract on the streaming path — the generator
    // body throws on first pull, which the chain treats as a pre-first-delta
    // failure (failover-eligible)
    if (!this.configured) {
      throw new LlmProviderException(this.name, "provider not configured");
    }
    this.healthObj.recordFailure(
      `provider adapter not constructed in this lane — dormant seam (ADR-023 fail-closed, ${this.name})`,
      "UNKNOWN",
    );
    throw new LlmProviderException(
      this.name,
      "provider adapter not constructed in this lane — dormant seam (ADR-023 fail-closed)",
    );
  }
}

// ── FailoverLlmChain (FailoverLlmChain.java, the health/report surface) ─────

export class FailoverLlmChain {
  private readonly membersByName = new Map<string, ChainMember>(); // insertion-ordered

  constructor(membersInOrder: ChainMember[]) {
    for (const member of membersInOrder) {
      this.membersByName.set(member.name, member);
    }
  }

  get name(): string {
    return "chain";
  }

  /** available(): any member available. */
  available(): boolean {
    for (const member of this.membersByName.values()) {
      if (member.available()) return true;
    }
    return false;
  }

  /** memberHealth(): snapshot of every member, chain order. */
  memberHealth(): Record<string, ReturnType<LlmProviderHealth["snapshot"]>> {
    const snapshot: Record<string, ReturnType<LlmProviderHealth["snapshot"]>> = {};
    for (const [name, member] of this.membersByName) {
      snapshot[name] = member.health().snapshot();
    }
    return snapshot;
  }

  /** orderedAvailable(). */
  private orderedAvailable(): ChainMember[] {
    const available: ChainMember[] = [];
    for (const member of this.membersByName.values()) {
      if (member.available()) available.push(member);
    }
    return available;
  }

  /**
   * routingOf — the shared routing step (the frozen javadoc: the filter
   * lives in the shared routing step so the blocking and streaming paths
   * cannot drift apart on it): media-carrying requests are offered ONLY to
   * supportsMedia() members.
   */
  private routingOf(request: LlmChainRequest): ChainMember[] {
    const candidates = this.orderedAvailable();
    if (request.media == null) return candidates;
    return candidates.filter((member) => member.supportsMedia());
  }

  /** Distinct exhaustion message for media requests (frozen emptyChainMessage). */
  private static emptyChainMessage(request: LlmChainRequest): string {
    return request.media != null
      ? "no vision-capable LLM provider available in chain"
      : "no available LLM provider in chain";
  }

  /**
   * generate — the frozen failover loop: one bounded attempt per provider;
   * failures aggregate into the diagnosable exhaustion throw. (Experiment
   * pinning is the research registry's surface — no v2 read exists; disclosed
   * dormant exactly like the core's absent-registry posture.)
   */
  async generate(request: LlmChainRequest) {
    const candidates = this.routingOf(request);
    if (candidates.length === 0) {
      throw new LlmProviderException("chain", FailoverLlmChain.emptyChainMessage(request));
    }
    let last: LlmProviderException | null = null;
    const failures: string[] = [];
    for (const provider of candidates) {
      try {
        return await provider.generate(request);
      } catch (e) {
        const err =
          e instanceof LlmProviderException
            ? e
            : new LlmProviderException(provider.name, String(e), "UNKNOWN");
        // ADR-023: failures arrive already classified at the provider/adapter
        // boundary — the chain never parses exception strings
        failures.push(`${provider.name}: ${err.message} (classified ${err.failureClass})`);
        last = err;
      }
    }
    // the aggregate must say WHICH provider failed and WHY
    const detail = failures.join(" | ");
    throw new LlmProviderException(
      "chain",
      `all providers failed, last error: ${last == null ? "unknown" : last.message} [${detail}]`,
      last == null ? "UNKNOWN" : last.failureClass,
    );
  }

  /**
   * stream — the frozen law (FailoverLlmChain.stream): failover matches
   * generate EXACTLY up to the first token; after that the stream is
   * committed to one provider and a mid-stream failure propagates as the
   * honest error (resuming on a second provider would duplicate or
   * interleave text).
   */
  async *stream(request: LlmChainRequest): AsyncIterable<LlmChainResponse> {
    const candidates = this.routingOf(request);
    if (candidates.length === 0) {
      throw new LlmProviderException("chain", FailoverLlmChain.emptyChainMessage(request));
    }
    const failures: string[] = [];
    for (const provider of candidates) {
      const iterator = provider.stream(request)[Symbol.asyncIterator]();
      // the commit gate: the first delta pulled through the member's own
      // error boundary. An error BEFORE that point is invisible upstream
      // (nothing delivered), so the failover is a clean restart on the next
      // member. Once a delta HAS been delivered the stream is COMMITTED —
      // a mid-stream failure propagates (resuming on a second provider
      // would duplicate or interleave text; the frozen switchOnFirst law).
      let committed = false;
      try {
        const first = await iterator.next();
        if (first.done !== true) {
          committed = true;
          yield first.value;
          while (true) {
            const next = await iterator.next();
            if (next.done === true) break;
            yield next.value;
          }
        }
        return; // completed (possibly empty-complete — the frozen law)
      } catch (e) {
        const err =
          e instanceof LlmProviderException
            ? e
            : new LlmProviderException(provider.name, String(e), "UNKNOWN");
        if (committed) {
          // COMMITTED: the honest error propagates to the caller — never a
          // silent restart on the next provider after text was delivered
          throw err;
        }
        failures.push(`${provider.name}: ${err.message} (classified ${err.failureClass})`);
        // fall through to the next candidate — nothing was delivered
      }
    }
    // the same aggregate contract as the exhausted generate() path
    const detail = failures.join(" | ");
    throw new LlmProviderException(
      "chain",
      `all providers failed before first token [${detail}]`,
      "UNKNOWN",
    );
  }

  member(name: string): ChainMember | null {
    return this.membersByName.get(name) ?? null;
  }
}

// ── LlmChainProperties port — the THREE-LAYER env projection of syllabai.llm.*

export const LLM_CHAIN_ORDER = ["groq", "gemini", "openrouter"] as const;

/**
 * Layer-3: the LlmChainProperties.java RECORD defaults — the compactor
 * TARGETS (reachable only when an explicitly-set value is blank or
 * non-positive, mirroring the record compactors; the frozen boot's yml
 * layer supplies effective values, so these are NOT the effective
 * defaults — that was r1c's single divergence, corrected per ruling4).
 */
const CODE_DEFAULT_GROQ_BASE_URL = "https://api.groq.com/openai";
const CODE_DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile";
const CODE_DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const CODE_DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const CODE_DEFAULT_OPENROUTER_MODEL = "meta-llama/llama-3.3-70b-instruct:free";
const CODE_DEFAULT_TIMEOUT_SECONDS = 30;
const CODE_DEFAULT_COOLDOWN_SECONDS = 60;
const CODE_DEFAULT_FAILURE_THRESHOLD = 3;
const CODE_DEFAULT_DAILY_BUDGET_PER_PROVIDER = 1000;

/**
 * Layer-2: the frozen application.yml @ 6cad6ef EFFECTIVE values — the
 * capture-corroborated defaults of record (ruling4 §2; the yml is part of
 * the frozen tree, so a no-env boot binds THESE, not the record defaults).
 */
const YML_GROQ_BASE_URL = "https://api.groq.com/openai/v1"; // the /v1 live finding 2026-09-14
const YML_GROQ_MODEL_DEFAULT = "openai/gpt-oss-120b"; // ${SYLLABAI_GROQ_MODEL:…}
const YML_GEMINI_MODEL = "gemini-3.6-flash"; // literal
const YML_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"; // literal
const YML_OPENROUTER_MODEL = "nvidia/nemotron-3-super-120b-a12b:free"; // literal
const YML_TIMEOUT_SECONDS = 60; // literal (the CLA enriched-evidence profile, §10.4)
const YML_COOLDOWN_SECONDS = 60; // literal
const YML_FAILURE_THRESHOLD = 3; // literal
const YML_DAILY_BUDGET_DEFAULT = 1000; // ${SYLLABAI_LLM_DAILY_BUDGET:1000}

function envBool(v: string | undefined): boolean | undefined {
  if (v == null || v.trim() === "") return undefined;
  return v.trim().toLowerCase() === "true";
}

function envStr(v: string | undefined): string | undefined {
  return v; // present-but-blank is MEANINGFUL (record compactor parity)
}

function parseNonNegative(v: string): number | undefined {
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined; // Spring would fail the bind — treated unset here
  return Math.trunc(n);
}

export interface LlmChainPropertiesPort {
  mode: "PRODUCTION" | "TEST" | "LIVE";
  groq: { enabled: boolean; apiKey: string | null; baseUrl: string; model: string };
  gemini: { enabled: boolean; apiKey: string | null; model: string };
  openRouter: { enabled: boolean; apiKey: string | null; baseUrl: string; model: string };
  chain: {
    timeoutSeconds: number;
    cooldownSeconds: number;
    failureThreshold: number;
    dailyBudgetPerProvider: number;
  };
}

/** Boolean resolution: layer-1 relaxed binding > layer-2 yml bridge > yml literal. */
function resolveBool(
  layer1: string | undefined,
  layer2Bridge: string | undefined,
  ymlLiteral: boolean,
): boolean {
  const l1 = envBool(layer1);
  if (l1 !== undefined) return l1;
  const l2 = envBool(layer2Bridge);
  if (l2 !== undefined) return l2;
  return ymlLiteral;
}

/** String resolution: layer-1 > layer-2 (bridge or literal) > code compactor target on blank. */
function resolveString(layer1: string | undefined, layer2: string, codeDefault: string): string {
  const l1 = envStr(layer1);
  if (l1 !== undefined) return l1.trim() === "" ? codeDefault : l1;
  return layer2.trim() === "" ? codeDefault : layer2;
}

/**
 * Int resolution: layer-1 (≤0/blank → the code compactor target, mirroring
 * the record compactors) > the yml-effective fallback.
 */
function resolveInt(layer1: string | undefined, ymlEffective: number, codeDefault: number): number {
  if (layer1 != null && layer1.trim() !== "") {
    const n = parseNonNegative(layer1);
    if (n === undefined) return ymlEffective;
    return n <= 0 ? codeDefault : n;
  }
  return ymlEffective;
}

/**
 * readLlmChainProperties — the three-layer projection of syllabai.llm.*
 * (Spring relaxed binding → SYLLABAI_LLM_* env, then the frozen
 * application.yml @ 6cad6ef layer, then the record compactors).
 */
export function readLlmChainProperties(env: Record<string, string | undefined>): LlmChainPropertiesPort {
  const modeRaw = (env.SYLLABAI_LLM_MODE ?? "production").trim().toLowerCase();
  const mode =
    modeRaw === "test" ? ("TEST" as const) : modeRaw === "live" ? ("LIVE" as const) : ("PRODUCTION" as const);
  const ymlGroqModel = envStr(env.SYLLABAI_GROQ_MODEL) ?? YML_GROQ_MODEL_DEFAULT;
  const ymlBudget =
    env.SYLLABAI_LLM_DAILY_BUDGET != null && env.SYLLABAI_LLM_DAILY_BUDGET.trim() !== ""
      ? (parseNonNegative(env.SYLLABAI_LLM_DAILY_BUDGET) ?? YML_DAILY_BUDGET_DEFAULT)
      : YML_DAILY_BUDGET_DEFAULT;
  return {
    mode,
    groq: {
      enabled: resolveBool(env.SYLLABAI_LLM_GROQ_ENABLED, env.SYLLABAI_GROQ_ENABLED, true),
      apiKey:
        envStr(env.SYLLABAI_LLM_GROQ_API_KEY) ??
        (envStr(env.SYLLABAI_GROQ_API_KEY)?.trim() ? env.SYLLABAI_GROQ_API_KEY : null) ??
        null,
      baseUrl: resolveString(env.SYLLABAI_LLM_GROQ_BASE_URL, YML_GROQ_BASE_URL, CODE_DEFAULT_GROQ_BASE_URL),
      model: resolveString(env.SYLLABAI_LLM_GROQ_MODEL, ymlGroqModel, CODE_DEFAULT_GROQ_MODEL),
    },
    gemini: {
      enabled: resolveBool(env.SYLLABAI_LLM_GEMINI_ENABLED, env.SYLLABAI_GEMINI_ENABLED, true),
      apiKey:
        envStr(env.SYLLABAI_LLM_GEMINI_API_KEY) ??
        (envStr(env.SYLLABAI_GEMINI_API_KEY)?.trim() ? env.SYLLABAI_GEMINI_API_KEY : null) ??
        null,
      model: resolveString(env.SYLLABAI_LLM_GEMINI_MODEL, YML_GEMINI_MODEL, CODE_DEFAULT_GEMINI_MODEL),
    },
    openRouter: {
      enabled: resolveBool(env.SYLLABAI_LLM_OPENROUTER_ENABLED, env.SYLLABAI_OPENROUTER_ENABLED, true),
      apiKey:
        envStr(env.SYLLABAI_LLM_OPENROUTER_API_KEY) ??
        (envStr(env.SYLLABAI_OPENROUTER_API_KEY)?.trim() ? env.SYLLABAI_OPENROUTER_API_KEY : null) ??
        null,
      baseUrl: resolveString(
        env.SYLLABAI_LLM_OPENROUTER_BASE_URL,
        YML_OPENROUTER_BASE_URL,
        CODE_DEFAULT_OPENROUTER_BASE_URL,
      ),
      model: resolveString(
        env.SYLLABAI_LLM_OPENROUTER_MODEL,
        YML_OPENROUTER_MODEL,
        CODE_DEFAULT_OPENROUTER_MODEL,
      ),
    },
    chain: {
      timeoutSeconds: resolveInt(env.SYLLABAI_LLM_CHAIN_TIMEOUT_SECONDS, YML_TIMEOUT_SECONDS, CODE_DEFAULT_TIMEOUT_SECONDS),
      cooldownSeconds: resolveInt(env.SYLLABAI_LLM_CHAIN_COOLDOWN_SECONDS, YML_COOLDOWN_SECONDS, CODE_DEFAULT_COOLDOWN_SECONDS),
      failureThreshold: resolveInt(env.SYLLABAI_LLM_CHAIN_FAILURE_THRESHOLD, YML_FAILURE_THRESHOLD, CODE_DEFAULT_FAILURE_THRESHOLD),
      dailyBudgetPerProvider: resolveInt(
        env.SYLLABAI_LLM_CHAIN_DAILY_BUDGET_PER_PROVIDER,
        ymlBudget,
        CODE_DEFAULT_DAILY_BUDGET_PER_PROVIDER,
      ),
    },
  };
}

function hasKey(apiKey: string | null): boolean {
  return apiKey != null && apiKey.trim() !== "";
}

/**
 * buildLlmChain — LlmChainConfig.failoverLlmChain. Chain order per §26.1:
 * Groq → Gemini → OpenRouter; gemini is the vision-capable member (media
 * routing, HUB-ANSWER-BOX wave 3). ADR-023 AMENDMENT (ADR-MIG-0002, operator
 * directive ①): configured members construct the REAL adapters (adapters.ts)
 * in PRODUCTION and LIVE; TEST mode ignores keys entirely (the frozen
 * fail-closed discipline — real ChatModels are never constructed, no code
 * path can silently spend quota); unconfigured providers register the
 * dormant member, still visible in the chain report with the model it WOULD
 * use (the enabled/configured distinction is the drift signal).
 */
export function buildLlmChain(
  env: Record<string, string | undefined> = process.env,
  clock?: HealthClock,
): FailoverLlmChain {
  const props = readLlmChainProperties(env);
  const testMode = props.mode === "TEST";
  const threshold = Math.max(1, props.chain.failureThreshold);
  const cooldown = Math.max(1, props.chain.cooldownSeconds);
  const dailyBudget = Math.max(1, props.chain.dailyBudgetPerProvider);
  const timeout = Math.max(1, props.chain.timeoutSeconds);
  const memberOpts = { failureThreshold: threshold, cooldownSeconds: cooldown, dailyBudget, timeoutSeconds: timeout, clock };

  const register = (
    name: string,
    enabled: boolean,
    apiKey: string | null,
    construct: (key: string) => ChainMember,
    defaultModel: string,
    mediaCapable: boolean,
  ): ChainMember => {
    // the frozen registerProvider law: real adapters only when the mode
    // allows it AND the provider is enabled AND its key is present
    if (!testMode && enabled && hasKey(apiKey)) {
      return construct(apiKey as string);
    }
    if (testMode && enabled && hasKey(apiKey)) {
      // the frozen warn: the key is present but IGNORED (fail-closed)
      console.warn(
        `LLM mode=test: provider '${name}' has an API key in the environment but it is ` +
          `IGNORED — real providers are never constructed in test mode (fail-closed, ADR-023)`,
      );
    }
    return new DormantChainMember(
      name,
      enabled,
      false,
      mediaCapable,
      threshold,
      cooldown,
      dailyBudget,
      defaultModel,
      clock,
    );
  };

  return new FailoverLlmChain([
    register(
      "groq",
      props.groq.enabled,
      props.groq.apiKey,
      (key) =>
        new OpenAiCompatibleChainMember("groq", { apiKey: key, baseUrl: props.groq.baseUrl, model: props.groq.model }, memberOpts),
      props.groq.model,
      false,
    ),
    register(
      "gemini",
      props.gemini.enabled,
      props.gemini.apiKey,
      (key) => new GeminiChainMember("gemini", { apiKey: key, model: props.gemini.model }, memberOpts),
      props.gemini.model,
      true,
    ),
    register(
      "openrouter",
      props.openRouter.enabled,
      props.openRouter.apiKey,
      (key) =>
        new OpenAiCompatibleChainMember(
          "openrouter",
          { apiKey: key, baseUrl: props.openRouter.baseUrl, model: props.openRouter.model },
          memberOpts,
        ),
      props.openRouter.model,
      false,
    ),
  ]);
}

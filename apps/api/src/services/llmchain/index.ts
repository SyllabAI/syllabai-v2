/**
 * The §26.1 free-tier LLM chain — deterministic plumbing port (T-MIG-090;
 * frozen sources: infrastructure/llm/FailoverLlmChain.java,
 * LlmProviderHealth.java, LlmChainProperties.java, LlmChainConfig.java,
 * SpringAiChatModelAdapter.java @ 6cad6ef, raw reads 2026-10-09).
 *
 * Behaviour (the frozen :61-101 generate loop, preserved): iterate the chain
 * in order; skip providers that are unconfigured or in cooldown; on failure
 * record health and continue; if every provider fails, throw the aggregate
 * LlmProviderException. memberHealth() snapshots every member in chain order
 * — the LlmAdminController.chainHealth() payload (groq → gemini → openrouter,
 * LlmChainProperties.chainOrder()).
 *
 * CONFIG SEAM — the same shape the existing v2 LLM services use: the tutor
 * and CLA composition roots already gate generation behind an injected
 * LlmProvider port (routes/tutor.ts dormantTutorLlm, routes/cla.ts
 * dormantClaLlm — the smartmark posture, available() = false → honest 503).
 * This module ports the CHAIN-LEVEL config the frozen core reads from
 * syllabai.llm.* (LlmChainProperties) as its env projection — Spring's
 * relaxed binding maps syllabai.llm.groq.api-key → SYLLABAI_LLM_GROQ_API_KEY
 * etc. — with the frozen defaults verbatim (groq llama-3.3-70b-versatile,
 * gemini gemini-2.5-flash, openrouter meta-llama/llama-3.3-70b-instruct:free,
 * chain 30s/60s/3/1000, mode PRODUCTION). Providers register only when
 * enabled AND their key is present (LlmChainConfig.registerProvider) — the
 * zero-key boot is clean and the chain report shows what is missing.
 *
 * ADR-023 FAIL-CLOSED (hard law, never violated): NO real provider adapter
 * is constructed here — real ChatModel construction is the wave-3 LLM-chain
 * lane's surface. A configured member's generate() raises the structured
 * LlmProviderException instead of silently spending quota (the frozen TEST
 * mode discipline, LlmChainConfig :54-57 + :106-110, generalized to every
 * mode in this lane: keys in the environment change the REPORT, never the
 * network). Tests wire deterministic fakes — never real adapters.
 */
import { providerHealthSnapshotSchema, type ProviderHealthSnapshot } from "@syllabai/contracts";

// ── LlmFailureClass (LlmFailureClass.java:24-59) ────────────────────────────

export type LlmFailureClassName =
  | "RATE_LIMITED"
  | "AUTHENTICATION_FAILURE"
  | "PROVIDER_UNAVAILABLE"
  | "TIMEOUT"
  | "BAD_REQUEST"
  | "MODEL_NOT_FOUND"
  | "INVALID_RESPONSE"
  | "UNKNOWN";

/** True when the failure means the provider's CONFIGURATION is broken (:57-59). */
export function isConfigurationFailure(f: LlmFailureClassName): boolean {
  return f === "AUTHENTICATION_FAILURE" || f === "MODEL_NOT_FOUND";
}

/** LlmProviderException (structured, classified at the adapter boundary). */
export class LlmProviderException extends Error {
  constructor(
    readonly providerName: string,
    message: string,
    readonly failureClass: LlmFailureClassName = "UNKNOWN",
  ) {
    super(message);
    this.name = "LlmProviderException";
  }
}

// ── LlmProviderHealth (LlmProviderHealth.java, line-against-line) ───────────

/** Injectable UTC-day clock (the frozen package-private test wiring :64-67). */
export interface HealthClock {
  now(): Date;
  utcDay(): string; // "YYYY-MM-DD" — LocalDate.now(ZoneOffset.UTC) parity
}

const realClock: HealthClock = {
  now: () => new Date(),
  utcDay: () => new Date().toISOString().slice(0, 10),
};

function isoOrNull(d: Date | null): string | null {
  return d == null ? null : d.toISOString();
}

/**
 * The daily budget is a CONFIGURED LOCAL ROUTING GUARD (:14-19) — a ceiling
 * on the requests THIS application routes at the provider per UTC day. Both
 * successful and failed attempts count. <= 0 = unlimited (no local guard).
 */
export class LlmProviderHealth {
  private readonly failureThreshold: number;
  private readonly cooldownSeconds: number;
  private consecutiveFailures = 0;
  private requestsToday = 0;
  private lastErrorAt: Date | null = null;
  private lastErrorMessage: string | null = null;
  private lastFailureClass: LlmFailureClassName | null = null;
  private cooldownUntil: Date | null = null;
  private day: string;

  constructor(
    private readonly enabled: boolean,
    private readonly configured: boolean,
    failureThreshold: number,
    cooldownSeconds: number,
    private readonly dailyBudget: number,
    private readonly effectiveModel: string | null,
    private readonly clock: HealthClock = realClock,
  ) {
    this.failureThreshold = Math.max(1, failureThreshold); // (:70-71)
    this.cooldownSeconds = Math.max(1, cooldownSeconds); // (:72-73)
    this.day = clock.utcDay();
  }

  /** recordSuccess (:100-104) — clears failures, counts against the day. */
  recordSuccess(): void {
    this.rollDay();
    this.consecutiveFailures = 0;
    this.requestsToday += 1;
  }

  /** recordFailure (:111-126) — classified at the adapter boundary. */
  recordFailure(message: string, failureClass: LlmFailureClassName = "UNKNOWN"): void {
    this.rollDay();
    this.consecutiveFailures += 1;
    this.requestsToday += 1;
    this.lastErrorAt = this.clock.now();
    this.lastErrorMessage = message;
    const classified = failureClass ?? "UNKNOWN";
    this.lastFailureClass = classified;
    if (isConfigurationFailure(classified)) {
      // dead key / retired model cannot heal mid-deployment: skip future
      // attempts until the UTC day rolls over (ADR-023)
      this.cooldownUntil = this.endOfUtcDay();
    } else if (this.consecutiveFailures >= this.failureThreshold) {
      this.cooldownUntil = new Date(this.clock.now().getTime() + this.cooldownSeconds * 1000);
    }
  }

  private endOfUtcDay(): Date {
    // endOfUtcDay (:128-130): utcDay.plusDays(1).atStartOfDay(ZoneOffset.UTC)
    const day = this.clock.utcDay();
    return new Date(new Date(`${day}T00:00:00.000Z`).getTime() + 24 * 3600 * 1000);
  }

  inCooldown(): boolean {
    const until = this.cooldownUntil;
    return until != null && this.clock.now().getTime() < until.getTime();
  }

  /** budgetExhausted (:138-141) — true when the local daily budget is consumed. */
  budgetExhausted(): boolean {
    this.rollDay();
    return this.dailyBudget > 0 && this.requestsToday >= this.dailyBudget;
  }

  /** healthy (:144-146) — can the member serve traffic right now (ADR-023). */
  healthy(): boolean {
    return this.configured && !this.inCooldown() && !this.budgetExhausted();
  }

  /** snapshot (:148-165) — the immutable observability view (ADR-023). */
  snapshot(): ProviderHealthSnapshot {
    this.rollDay();
    const cooling = this.inCooldown();
    const body = {
      configured: this.configured,
      consecutiveFailures: this.consecutiveFailures,
      requestsToday: this.requestsToday,
      lastErrorAt: isoOrNull(this.lastErrorAt),
      lastErrorMessage: this.lastErrorMessage,
      cooldownUntil: isoOrNull(this.cooldownUntil),
      enabled: this.enabled,
      healthy: this.healthy(),
      coolingDown: cooling,
      dailyBudget: this.dailyBudget > 0 ? this.dailyBudget : null,
      remainingLocalBudget:
        this.dailyBudget > 0 ? Math.max(0, this.dailyBudget - this.requestsToday) : null,
      lastFailureClass: this.lastFailureClass,
      effectiveModel: this.effectiveModel,
    };
    // the wire shape IS the contract (LlmAdminControllerTest shape gate)
    return providerHealthSnapshotSchema.parse(body);
  }

  /** rollDay (:87-98) — resets the per-day request counter on UTC rollover. */
  private rollDay(): void {
    const today = this.clock.utcDay();
    if (today !== this.day) {
      this.day = today;
      this.requestsToday = 0;
    }
  }
}

// ── chain members (SpringAiChatModelAdapter port, generation dormant) ───────

/** Minimal request shape — the chain's deterministic plumbing is the surface. */
export interface LlmChainRequest {
  system: string;
  user: string;
  model?: string | null;
}

export interface ChainMember {
  name: string;
  /** available(): configured && not cooling && budget not exhausted (:133-136). */
  available(): boolean;
  supportsMedia(): boolean;
  health(): LlmProviderHealth;
  generate(request: LlmChainRequest): Promise<{ text: string; model: string; providerName: string }>;
}

/**
 * One chain member — SpringAiChatModelAdapter without the ChatModel. Real
 * adapter construction is the wave-3 LLM-chain lane's surface (ADR-023
 * fail-closed); this member records health faithfully and answers
 * generation with the structured exception (never a silent spend).
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
    // SpringAiChatModelAdapter.available() (:133-136)
    return this.configured && !this.healthObj.inCooldown() && !this.healthObj.budgetExhausted();
  }

  supportsMedia(): boolean {
    return this.mediaCapable;
  }

  health(): LlmProviderHealth {
    return this.healthObj;
  }

  async generate(_request: LlmChainRequest): Promise<{ text: string; model: string; providerName: string }> {
    if (!this.configured) {
      // the frozen unconfigured guard (SpringAiChatModelAdapter :145-147)
      throw new LlmProviderException(this.name, "provider not configured");
    }
    // ADR-023 fail-closed: no real adapter exists in this lane — the wave-3
    // LLM-chain lane owns provider construction. Structured, classified, honest.
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

  /** available(): any member available (the frozen :62-64). */
  available(): boolean {
    for (const member of this.membersByName.values()) {
      if (member.available()) return true;
    }
    return false;
  }

  /** memberHealth(): snapshot of every member, chain order (the frozen :162-166). */
  memberHealth(): Record<string, ProviderHealthSnapshot> {
    const snapshot: Record<string, ProviderHealthSnapshot> = {};
    for (const [name, member] of this.membersByName) {
      snapshot[name] = member.health().snapshot();
    }
    return snapshot;
  }

  /** orderedAvailable (:168-176). */
  private orderedAvailable(): ChainMember[] {
    const available: ChainMember[] = [];
    for (const member of this.membersByName.values()) {
      if (member.available()) available.push(member);
    }
    return available;
  }

  /**
   * generate (:67-101) — the frozen failover loop: one bounded attempt per
   * provider; failures aggregate into the diagnosable exhaustion throw.
   * (Experiment pinning + media routing are the wave-3 generation lane's
   * surface; this port carries the TEXT chain's deterministic plumbing.)
   */
  async generate(request: LlmChainRequest) {
    const candidates = this.orderedAvailable();
    if (candidates.length === 0) {
      throw new LlmProviderException("chain", "no available LLM provider in chain");
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
    // the aggregate must say WHICH provider failed and WHY (the frozen :92-100)
    const detail = failures.join(" | ");
    throw new LlmProviderException(
      "chain",
      `all providers failed, last error: ${last == null ? "unknown" : last.message} [${detail}]`,
      last == null ? "UNKNOWN" : last.failureClass,
    );
  }

  member(name: string): ChainMember | null {
    return this.membersByName.get(name) ?? null;
  }
}

// ── LlmChainProperties port — the env projection of syllabai.llm.* ─────────

export const LLM_CHAIN_ORDER = ["groq", "gemini", "openrouter"] as const;

/** Frozen defaults (LlmChainProperties.java:25-27, 30-33, 36-40, 43-50, 57-59). */
const DEFAULT_GROQ_BASE_URL = "https://api.groq.com/openai";
const DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_OPENROUTER_MODEL = "meta-llama/llama-3.3-70b-instruct:free";
const DEFAULT_TIMEOUT_SECONDS = 30;
const DEFAULT_COOLDOWN_SECONDS = 60;
const DEFAULT_FAILURE_THRESHOLD = 3;
const DEFAULT_DAILY_BUDGET_PER_PROVIDER = 1000;

function envBool(v: string | undefined, fallback = false): boolean {
  if (v == null || v.trim() === "") return fallback;
  return v.trim().toLowerCase() === "true";
}

function envInt(v: string | undefined, fallback: number): number {
  if (v == null || v.trim() === "") return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  // the frozen compactors: non-positive → documented default
  return n <= 0 ? fallback : Math.trunc(n);
}

export interface LlmChainPropertiesPort {
  mode: "PRODUCTION" | "TEST";
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

/** LlmChainProperties.from-env (Spring relaxed binding → SYLLABAI_LLM_*). */
export function readLlmChainProperties(env: Record<string, string | undefined>): LlmChainPropertiesPort {
  const mode = (env.SYLLABAI_LLM_MODE ?? "PRODUCTION").trim().toUpperCase() === "TEST"
    ? ("TEST" as const)
    : ("PRODUCTION" as const);
  return {
    mode,
    groq: {
      enabled: envBool(env.SYLLABAI_LLM_GROQ_ENABLED),
      apiKey: env.SYLLABAI_LLM_GROQ_API_KEY?.trim() ? env.SYLLABAI_LLM_GROQ_API_KEY : null,
      baseUrl: env.SYLLABAI_LLM_GROQ_BASE_URL?.trim() || DEFAULT_GROQ_BASE_URL,
      model: env.SYLLABAI_LLM_GROQ_MODEL?.trim() || DEFAULT_GROQ_MODEL,
    },
    gemini: {
      enabled: envBool(env.SYLLABAI_LLM_GEMINI_ENABLED),
      apiKey: env.SYLLABAI_LLM_GEMINI_API_KEY?.trim() ? env.SYLLABAI_LLM_GEMINI_API_KEY : null,
      model: env.SYLLABAI_LLM_GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL,
    },
    openRouter: {
      enabled: envBool(env.SYLLABAI_LLM_OPENROUTER_ENABLED),
      apiKey: env.SYLLABAI_LLM_OPENROUTER_API_KEY?.trim()
        ? env.SYLLABAI_LLM_OPENROUTER_API_KEY
        : null,
      baseUrl: env.SYLLABAI_LLM_OPENROUTER_BASE_URL?.trim() || DEFAULT_OPENROUTER_BASE_URL,
      model: env.SYLLABAI_LLM_OPENROUTER_MODEL?.trim() || DEFAULT_OPENROUTER_MODEL,
    },
    chain: {
      timeoutSeconds: envInt(env.SYLLABAI_LLM_CHAIN_TIMEOUT_SECONDS, DEFAULT_TIMEOUT_SECONDS),
      cooldownSeconds: envInt(env.SYLLABAI_LLM_CHAIN_COOLDOWN_SECONDS, DEFAULT_COOLDOWN_SECONDS),
      failureThreshold: envInt(env.SYLLABAI_LLM_CHAIN_FAILURE_THRESHOLD, DEFAULT_FAILURE_THRESHOLD),
      dailyBudgetPerProvider: envInt(
        env.SYLLABAI_LLM_CHAIN_DAILY_BUDGET_PER_PROVIDER,
        DEFAULT_DAILY_BUDGET_PER_PROVIDER,
      ),
    },
  };
}

function hasKey(apiKey: string | null): boolean {
  return apiKey != null && apiKey.trim() !== "";
}

/**
 * buildLlmChain — LlmChainConfig.failoverLlmChain (:40-114) with the adapter
 * construction replaced by the ADR-023 fail-closed dormant member (real
 * ChatModel construction is the wave-3 lane's surface). Chain order per
 * §26.1: Groq → Gemini → OpenRouter; gemini is the vision-capable member.
 * TEST mode ignores keys present in the environment (the frozen :106-110).
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

  const register = (
    name: string,
    enabled: boolean,
    apiKey: string | null,
    defaultModel: string,
    mediaCapable: boolean,
  ): ChainMember => {
    // real adapters are constructed only when the mode allows it AND the
    // provider is enabled AND its key is present (:99-113) — otherwise the
    // member registers unconfigured, still visible in the chain report with
    // the model it WOULD use (the enabled/configured distinction is the
    // drift signal)
    const configured = !testMode && enabled && hasKey(apiKey);
    return new DormantChainMember(
      name,
      enabled,
      configured,
      mediaCapable,
      threshold,
      cooldown,
      dailyBudget,
      defaultModel,
      clock,
    );
  };

  return new FailoverLlmChain([
    register("groq", props.groq.enabled, props.groq.apiKey, props.groq.model, false),
    register("gemini", props.gemini.enabled, props.gemini.apiKey, props.gemini.model, true),
    register("openrouter", props.openRouter.enabled, props.openRouter.apiKey, props.openRouter.model, false),
  ]);
}

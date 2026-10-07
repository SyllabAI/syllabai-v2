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
 * and CLA composition roots already gate generation behind an injected
 * LlmProvider port (routes/tutor.ts dormantTutorLlm, routes/cla.ts
 * dormantClaLlm — the smartmark posture, available() = false → honest
 * 503). Providers register only when enabled AND their key is present
 * (LlmChainConfig registerProvider) — the ZERO-KEY boot of record
 * (ruling4 §3) is clean and the chain report shows what is missing.
 *
 * ADR-023 FAIL-CLOSED (hard law, never violated): NO real provider adapter
 * is constructed here — real ChatModel construction is the wave-3
 * LLM-chain lane's surface, in EVERY mode (LIVE included: this lane's LIVE
 * posture differs from PRODUCTION only in that a future lane may construct
 * adapters there; the report semantics are identical and generation stays
 * fail-closed here). A configured member's generate() raises the
 * structured LlmProviderException instead of silently spending quota (the
 * frozen TEST discipline, LlmChainConfig :106-110, generalized per ADR-023
 * as of record). Tests wire deterministic fakes — never real adapters.
 */
import { providerHealthSnapshotSchema, type ProviderHealthSnapshot } from "@syllabai/contracts";

// ── LlmFailureClass (LlmFailureClass.java) ──────────────────────────────────

export type LlmFailureClassName =
  | "RATE_LIMITED"
  | "AUTHENTICATION_FAILURE"
  | "PROVIDER_UNAVAILABLE"
  | "TIMEOUT"
  | "BAD_REQUEST"
  | "MODEL_NOT_FOUND"
  | "INVALID_RESPONSE"
  | "UNKNOWN";

/** True when the failure means the provider's CONFIGURATION is broken. */
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

/** Injectable UTC-day clock (the frozen package-private test wiring). */
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
 * The daily budget is a CONFIGURED LOCAL ROUTING GUARD — a ceiling on the
 * requests THIS application routes at the provider per UTC day. Both
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
    this.failureThreshold = Math.max(1, failureThreshold); // record compactor
    this.cooldownSeconds = Math.max(1, cooldownSeconds); // record compactor
    this.day = clock.utcDay();
  }

  /** recordSuccess — clears failures, counts against the day. */
  recordSuccess(): void {
    this.rollDay();
    this.consecutiveFailures = 0;
    this.requestsToday += 1;
  }

  /** recordFailure — classified at the adapter boundary. */
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
    // utcDay.plusDays(1).atStartOfDay(ZoneOffset.UTC)
    const day = this.clock.utcDay();
    return new Date(new Date(`${day}T00:00:00.000Z`).getTime() + 24 * 3600 * 1000);
  }

  inCooldown(): boolean {
    const until = this.cooldownUntil;
    return until != null && this.clock.now().getTime() < until.getTime();
  }

  /** budgetExhausted — true when the local daily budget is consumed. */
  budgetExhausted(): boolean {
    this.rollDay();
    return this.dailyBudget > 0 && this.requestsToday >= this.dailyBudget;
  }

  /** healthy — can the member serve traffic right now (ADR-023). */
  healthy(): boolean {
    return this.configured && !this.inCooldown() && !this.budgetExhausted();
  }

  /** snapshot — the immutable observability view, in the CAPTURED key order. */
  snapshot(): ProviderHealthSnapshot {
    this.rollDay();
    const cooling = this.inCooldown();
    const body = {
      configured: this.configured,
      consecutiveFailures: this.consecutiveFailures,
      cooldownUntil: isoOrNull(this.cooldownUntil),
      coolingDown: cooling,
      dailyBudget: this.dailyBudget > 0 ? this.dailyBudget : null,
      effectiveModel: this.effectiveModel,
      enabled: this.enabled,
      healthy: this.healthy(),
      lastErrorAt: isoOrNull(this.lastErrorAt),
      lastErrorMessage: this.lastErrorMessage,
      lastFailureClass: this.lastFailureClass,
      remainingLocalBudget:
        this.dailyBudget > 0 ? Math.max(0, this.dailyBudget - this.requestsToday) : null,
      requestsToday: this.requestsToday,
    };
    // the wire shape IS the contract (LlmAdminControllerTest shape gate +
    // the r4b leg-04 golden — the zod parse re-issues keys in the captured
    // declaration order)
    return providerHealthSnapshotSchema.parse(body);
  }

  /** rollDay — resets the per-day request counter on UTC rollover. */
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
  /** available(): configured && not cooling && budget not exhausted. */
  available(): boolean;
  supportsMedia(): boolean;
  health(): LlmProviderHealth;
  generate(request: LlmChainRequest): Promise<{ text: string; model: string; providerName: string }>;
}

/**
 * One chain member — SpringAiChatModelAdapter without the ChatModel. Real
 * adapter construction is the wave-3 LLM-chain lane's surface (ADR-023
 * fail-closed, every mode); this member records health faithfully and
 * answers generation with the structured exception (never a silent spend).
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

  async generate(_request: LlmChainRequest): Promise<{ text: string; model: string; providerName: string }> {
    if (!this.configured) {
      // the frozen unconfigured guard (SpringAiChatModelAdapter)
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

  /** available(): any member available. */
  available(): boolean {
    for (const member of this.membersByName.values()) {
      if (member.available()) return true;
    }
    return false;
  }

  /** memberHealth(): snapshot of every member, chain order. */
  memberHealth(): Record<string, ProviderHealthSnapshot> {
    const snapshot: Record<string, ProviderHealthSnapshot> = {};
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
   * generate — the frozen failover loop: one bounded attempt per provider;
   * failures aggregate into the diagnosable exhaustion throw. (Experiment
   * pinning + media routing are the wave-3 generation lane's surface; this
   * port carries the TEXT chain's deterministic plumbing.)
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
    // the aggregate must say WHICH provider failed and WHY
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
 * buildLlmChain — LlmChainConfig.failoverLlmChain with the adapter
 * construction replaced by the ADR-023 fail-closed dormant member (real
 * ChatModel construction is the wave-3 lane's surface, every mode). Chain
 * order per §26.1: Groq → Gemini → OpenRouter; gemini is the
 * vision-capable member. TEST mode ignores keys present in the
 * environment (the frozen fail-closed discipline).
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
    // provider is enabled AND its key is present — otherwise the member
    // registers unconfigured, still visible in the chain report with the
    // model it WOULD use (the enabled/configured distinction is the drift
    // signal). TEST ignores keys entirely (fail-closed).
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

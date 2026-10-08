/**
 * llmchain kernel — the failure-classification, health and port-type layer of
 * the §26.1 LLM chain (moved VERBATIM from services/llmchain/index.ts when the
 * real-adapter lane landed; frozen sources unchanged: infrastructure/llm/
 * LlmProviderHealth.java, LlmFailureClass.java, LlmProviderException.java,
 * LlmRequest.java, LlmProvider.java @ 6cad6ef).
 *
 * ADR-023 AMENDMENT OF RECORD (operator directive ①, trace 1a117913519cd141,
 * ADR-MIG-0002): the fail-closed posture survives unchanged for TEST mode and
 * zero-key boots; CONFIGURED members in PRODUCTION/LIVE now construct real
 * adapters (adapters.ts) per the operator's explicit commission of the
 * wave-3 LLM-chain lane. The health/exception contracts below are untouched —
 * the chain report, the classified-failure law and the UTC-day semantics are
 * exactly the ruling4 surface of record.
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

// ── the port shapes (LlmRequest.java / LlmProvider.java) ────────────────────

/**
 * Minimal request shape — the chain's deterministic plumbing is the surface.
 * The real-adapter lane (ADR-MIG-0002) extends the port with the frozen
 * LlmRequest optionals: temperature/maxTokens (null = provider default),
 * media (HUB-ANSWER-BOX wave 3 — routed ONLY to supportsMedia() members),
 * reasoningEffort (§26 knob — OpenAI-compatible reasoning_effort; the gemini
 * REST member ignores it: the SDK thinkingLevel mapping has no direct REST
 * equivalent, disclosed divergence), model (per-request pin > member default).
 */
export interface LlmMedia {
  base64: string;
  mimeType: string;
}

export type LlmReasoningEffort = "minimal" | "low" | "medium" | "high";

export interface LlmChainRequest {
  system: string;
  user: string;
  model?: string | null;
  temperature?: number | null;
  maxTokens?: number | null;
  media?: LlmMedia | null;
  reasoningEffort?: LlmReasoningEffort | null;
}

/** One chain generation result — finishReason rides for truncation laws. */
export interface LlmChainResponse {
  text: string;
  model: string;
  providerName: string;
  finishReason?: string | null;
}

export interface ChainMember {
  name: string;
  /** available(): configured && not cooling && budget not exhausted. */
  available(): boolean;
  supportsMedia(): boolean;
  health(): LlmProviderHealth;
  generate(request: LlmChainRequest): Promise<LlmChainResponse>;
  /**
   * Token streaming (SpringAiChatModelAdapter.stream port): failover is NOT
   * the member's concern — the chain fails over only before the first delta;
   * after that the stream is committed (mid-stream errors propagate).
   */
  stream(request: LlmChainRequest): AsyncIterable<LlmChainResponse>;
}

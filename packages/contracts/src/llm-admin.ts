/**
 * Admin LLM chain-observability contracts — ported from the frozen Java
 * core (T-MIG-090).
 *
 * Sources (syllabai-core @ 6cad6ef, frozen, raw reads 2026-10-09):
 *   src/main/java/com/syllabai/infrastructure/llm/LlmAdminController.java
 *       (GET /api/v1/admin/llm/chain-health — Map<String,Object> with keys
 *        "chainAvailable" + "providers"; providers is a LinkedHashMap keyed
 *        by chain order groq → gemini → openrouter)
 *   src/main/java/com/syllabai/infrastructure/llm/LlmProviderHealth.java
 *       (Snapshot record :172-185 — the per-provider observability view)
 *   src/main/java/com/syllabai/infrastructure/llm/LlmFailureClass.java
 *
 * RESPONSE-side Jackson facts: the Snapshot record has no @JsonProperty
 * annotations → component names serialize verbatim, in declaration order.
 * Instant renders ISO-8601 UTC (JSR-310, write-dates-as-timestamps off) —
 * nullable for lastErrorAt/cooldownUntil. dailyBudget/remainingLocalBudget
 * are Integer (null when no local budget guard is configured);
 * lastFailureClass is the enum name (null until the first classified
 * failure). ADR-023 Slice E: the snapshot NEVER carries API keys,
 * authorization headers, prompts or learner data (pinned by the frozen
 * LlmAdminControllerTest.snapshotsNeverCarrySecrets).
 */
import { z } from "zod";

/** LlmFailureClass (LlmFailureClass.java:24-48) — the enum names verbatim. */
export const llmFailureClassSchema = z.enum([
  "RATE_LIMITED",
  "AUTHENTICATION_FAILURE",
  "PROVIDER_UNAVAILABLE",
  "TIMEOUT",
  "BAD_REQUEST",
  "MODEL_NOT_FOUND",
  "INVALID_RESPONSE",
  "UNKNOWN",
]);
export type LlmFailureClass = z.infer<typeof llmFailureClassSchema>;

/**
 * LlmProviderHealth.Snapshot (LlmProviderHealth.java:172-185) — the first
 * six components are the original §26.1 contract; the later components are
 * additive (backward-compatible for existing admin consumers).
 */
export const providerHealthSnapshotSchema = z.object({
  configured: z.boolean(),
  consecutiveFailures: z.number().int(),
  requestsToday: z.number().int(),
  lastErrorAt: z.string().nullable(),
  lastErrorMessage: z.string().nullable(),
  cooldownUntil: z.string().nullable(),
  enabled: z.boolean(),
  healthy: z.boolean(),
  coolingDown: z.boolean(),
  dailyBudget: z.number().int().nullable(),
  remainingLocalBudget: z.number().int().nullable(),
  lastFailureClass: llmFailureClassSchema.nullable(),
  effectiveModel: z.string().nullable(),
});
export type ProviderHealthSnapshot = z.infer<typeof providerHealthSnapshotSchema>;

/**
 * LlmAdminController.chainHealth() (:30-36) — mode-free aggregate +
 * per-provider snapshots, keyed by the §26.1 chain order (groq → gemini →
 * openrouter; LlmChainProperties.chainOrder()).
 */
export const chainHealthReportSchema = z.object({
  chainAvailable: z.boolean(),
  providers: z.record(z.string(), providerHealthSnapshotSchema),
});
export type ChainHealthReport = z.infer<typeof chainHealthReportSchema>;

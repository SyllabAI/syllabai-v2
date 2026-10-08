/**
 * Admin LLM chain-observability contracts — ported from the frozen Java
 * core (T-MIG-090; vehicle = r1c's preserved contracts per
 * R0-arbitration/ruling4, AMENDED: schema field order = the CAPTURED wire
 * key order — the r4b capture bodies are key-alphabetical, so the zod
 * declaration order below IS the wire order this lane emits).
 *
 * Sources (syllabai-core @ 6cad6ef, frozen, first-hand reads 2026-10-07):
 *   src/main/java/com/syllabai/infrastructure/llm/LlmAdminController.java
 *       (GET /api/v1/admin/llm/chain-health — LinkedHashMap with keys
 *        "chainAvailable" + "providers"; providers keyed by chain order
 *        groq → gemini → openrouter)
 *   src/main/java/com/syllabai/infrastructure/llm/LlmProviderHealth.java
 *       (Snapshot record — the per-provider observability view)
 *   src/main/java/com/syllabai/infrastructure/llm/LlmFailureClass.java
 *
 * RESPONSE-side Jackson facts: the Snapshot record has no @JsonProperty
 * annotations → component names serialize verbatim (the captured order is
 * alphabetical); Instant renders ISO-8601 UTC (JSR-310,
 * write-dates-as-timestamps off) — nullable for lastErrorAt/cooldownUntil.
 * dailyBudget/remainingLocalBudget are Integer (null when no local budget
 * guard is configured); lastFailureClass is the enum name (null until the
 * first classified failure). ADR-023 Slice E: the snapshot NEVER carries
 * API keys, authorization headers, prompts or learner data (pinned by the
 * frozen LlmAdminControllerTest.snapshotsNeverCarrySecrets; re-pinned here
 * against the r4b capture golden).
 */
import { z } from "zod";

/** LlmFailureClass (LlmFailureClass.java) — the enum names verbatim. */
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
 * LlmProviderHealth.Snapshot — field order = the CAPTURED wire order
 * (golden-captures/t-mig-090/leg-04-chain-admin-200.json, key-alphabetical;
 * zod .parse() re-issues keys in declaration order, so this declaration IS
 * the byte-level emission order).
 */
export const providerHealthSnapshotSchema = z.object({
  configured: z.boolean(),
  consecutiveFailures: z.number().int(),
  cooldownUntil: z.string().nullable(),
  coolingDown: z.boolean(),
  dailyBudget: z.number().int().nullable(),
  effectiveModel: z.string().nullable(),
  enabled: z.boolean(),
  healthy: z.boolean(),
  lastErrorAt: z.string().nullable(),
  lastErrorMessage: z.string().nullable(),
  lastFailureClass: llmFailureClassSchema.nullable(),
  remainingLocalBudget: z.number().int().nullable(),
  requestsToday: z.number().int(),
});
export type ProviderHealthSnapshot = z.infer<typeof providerHealthSnapshotSchema>;

/**
 * LlmAdminController.chainHealth() — the two-key report + per-provider
 * snapshots, keyed by the §26.1 chain order (groq → gemini → openrouter;
 * LlmChainProperties.chainOrder()).
 */
export const chainHealthReportSchema = z.object({
  chainAvailable: z.boolean(),
  providers: z.record(z.string(), providerHealthSnapshotSchema),
});
export type ChainHealthReport = z.infer<typeof chainHealthReportSchema>;

/**
 * T-TEACHME-001 · run-002 · apps/api/src/teach-me/config.ts
 *
 * SINGLE SOURCE for every Teach-Me constant (ADR-040 D3/D4, ruling Q4/Q5).
 * The vague-explanation re-probe retunes THIS FILE ONLY — no code changes, no
 * test literals. Tests import constants from here; hard-coding any of these
 * values elsewhere is a review reject.
 *
 * NOTE ON FLAGS: apps/hub/content/flags.json is the RENDER-time source for the
 * `teachMe` gate (run-003 flips it); the `flags` block below is the API-side
 * serving scope of record and must be kept in sync with it (soft-asserted in
 * the behavioural suite until the run-003 launch commit adds the key there).
 */

export const TEACH_ME_CONFIG = {
  feature: "teach-me",
  pupilName: "the Pupil", // ruling Q1/D5 — no mascot art in v1

  /** Runtime render gate lives in flags.json; this mirror is the serving scope of record. */
  flags: {
    teachMe: {
      enabled: true,
      courses: ["igcse-chemistry-19"], // Wave 0 pilot — see docs/TEACH_ME_PLAN.md §1
    },
  },

  /** Ruling Q4 — cost protection, NOT a monetization meter. Enforced server-side. */
  quota: {
    dailySessionCap: 3,
    /** "back tomorrow" honest state; no countdown/upsell dark patterns. */
  },

  /** Original-faithful session shape (probe of record). */
  sessionShape: {
    objectivesByLength: { quick: 3, in_depth: 4 } as const,
    maxMessagesByLength: { quick: 5, in_depth: 6 } as const,
  },

  /** Hard ceilings asserted in CI (ADR-040 D3). */
  cost: {
    maxLlmCallsPerSession: 10, // worst-case shape is 1 + 6 + 1 = 8; headroom 2
    maxTokensPerSession: 60_000,
    /**
     * The chain response carries no usage payload (LlmChainResponse has
     * text/model/providerName/finishReason only), so tokens_used is a
     * deterministic chars/4 estimate over (system+user) prompt + completion.
     * The sentinel treats it as an estimate; the ceiling law uses it
     * fail-closed regardless (an estimate never under-counts spend risk).
     */
    charsPerTokenEstimate: 4,
  },

  /** Judge temperature/maxTokens (structured extraction posture, toolkit law). */
  llm: {
    objectivesTemperature: 0.2,
    judgeTemperature: 0.2,
    reviewTemperature: 0.3,
    maxTokens: 4_000,
  },

  /**
   * Ruling Q5 — anti-gaming defaults, PROVISIONAL until the vague-explanation
   * re-probe. All three are fail-closed.
   */
  antiGaming: {
    minWordsPerExplanation: 40,
    verbatimOverlapFlag: 0.8,
    repeatCreditWindowDays: 7,
    /** Deterministic shingle width for the verbatim-overlap detector (D4). */
    overlapShingleWords: 8,
  },

  /** ADR-040 D1 — the only evidence path this feature may write. */
  evidence: {
    kind: "TEACH_SESSION",
    tier: "AI_SUGGESTED",
    appendOnly: true,
  },

  /** Pinned prompts v1 (fixture-replayed in CI; bump version, never edit). */
  prompts: {
    pupilCharter: "pupil.v1",
    turn: "teachme.turn.v1",
    objectives: "teachme.objectives.v1", // inline canon-grounding system prompt (not a version-pinned file)
    review: "teachme.review.v1",
  },
} as const;

export type TeachMeConfig = typeof TEACH_ME_CONFIG;

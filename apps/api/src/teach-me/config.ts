/**
 * T-TEACHME-001 · run-002 · apps/api/src/teach-me/config.ts
 * T-TEACHGENIE-001 · Teach Genie reskin (MG Teach Genie parity, 2026-11-04)
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
  /** T-TEACHGENIE-001: the learner-facing persona of record (MG parity — the
   *  student teaches Baby Genie, a confused younger pupil, Feynman-style).
   *  Still no mascot art in the API contract; the hub renders an original
   *  stand-in avatar (no MathsGenie assets are copied). */
  pupilName: "Baby Genie",

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

  /** Session shape (probe of record). T-TEACHGENIE-001: In-Depth carries SIX
   *  objectives — the MG Teach Genie header is literally "Objective 1/6" —
   *  with 8 message slots so six objectives stay coverable in one sitting. */
  sessionShape: {
    objectivesByLength: { quick: 3, in_depth: 6 } as const,
    maxMessagesByLength: { quick: 5, in_depth: 8 } as const,
  },

  /** Hard ceilings asserted in CI (ADR-040 D3). T-TEACHGENIE-001: the worst
   *  In-Depth shape is 1 (objectives) + 8 (turns) + 1 (review) = 10 calls —
   *  ceiling 12 keeps two calls of headroom; token estimate follows the same
   *  proportional bump (8 judged turns × longer transcripts). */
  cost: {
    maxLlmCallsPerSession: 12,
    maxTokensPerSession: 90_000,
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

  /** Pinned prompts (fixture-replayed in CI; bump version, never edit).
   *  T-TEACHGENIE-001 bumps the charter (Baby Genie identity + MG casual
   *  voice) and the objectives prompt (dynamic in-character opener). */
  prompts: {
    pupilCharter: "pupil.v2",
    turn: "teachme.turn.v1",
    objectives: "teachme.objectives.v2", // inline canon-grounding system prompt (not a version-pinned file)
    review: "teachme.review.v1",
  },
} as const;

export type TeachMeConfig = typeof TEACH_ME_CONFIG;

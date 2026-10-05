// Per-seam tolerance declarations — THE REVIEWED CONTRACT (doctrine §4).
// Changing this file is a gate-contract change and requires review.
// Source citations are drift-watchers: if the cited law moves, this file moves with it (reviewed).
import type { FeedbackView, SeamId } from "./types.ts";

/**
 * Refusal contract — honesty of refusals is GOLDEN_MASTER §3's first behavioural
 * dimension. Pinned VERBATIM from the real law (this harness never re-pins the
 * route itself — 032's route tests own it):
 *   - route 503 fixed body: apps/api/src/routes/smartmark/index.ts :70-76
 *   - service refusal errors: apps/api/src/services/smartmark/index.ts :883-893
 */
export const REFUSAL_CONTRACT = {
  serviceErrorKind: "SmartFeedbackGenerationError", // -> route maps to 503 (GlobalExceptionHandler :107-117 parity)
  routeStatus: 503,
  routeErrorCode: "smart_feedback_unavailable",
  routeFixedBody: "the marking feedback engine is temporarily unavailable — try again shortly",
  serviceUnavailableMessage: "the marking feedback engine is temporarily unavailable -- try again shortly",
  serviceEmptyResponseMessage: "feedback generation returned an empty response -- try again",
} as const;

/**
 * Envelope field-name law (T1, doctrine §3 row 3) — verbatim from the consumed views:
 * FeedbackExplanationView / ImprovementPlanView (services/smartmark :728-746).
 * Exact key sets: an extra or renamed field is a contract breach (the
 * marks->marksPossible class of catch, T-MIG-032 tranche-2 correction).
 */
export const ENVELOPE_FIELDS: Record<FeedbackView, readonly string[]> = {
  "feedback-explanation": ["partId", "explanation", "modelId", "generatedAt"],
  "improvement-plan": ["partId", "plan", "modelId", "generatedAt"],
};

/** Wall-clock fields tolerated (never compared) — the runner's `tolerate` law applied here. */
export const TOLERATED_FIELDS = ["generatedAt"] as const;

/**
 * Grounding temperatures per view (services/smartmark :728 explain -> 0.2,
 * :742 improve -> 0.3) — provenance sanity range, not a comparison input.
 */
export const VIEW_TEMPERATURES: Record<FeedbackView, number> = {
  "feedback-explanation": 0.2,
  "improvement-plan": 0.3,
};

/** Transcript speakers (stub contract — revisit against the real DTO when answerinput lands). */
export const TRANSCRIPT_SPEAKERS = ["host", "guest", "narrator"] as const;

/**
 * T2 thresholds (doctrine §4.2) — STARTING values; relaxing requires a reviewed
 * commit citing a LIVE-posture drift report demonstrating false positives.
 */
export const T2_THRESHOLDS = {
  "smart-mark-prose": 0.9,
  transcription: 0.9,
} as const satisfies Record<SeamId, number>;

/** Coarse expansion bound (candidate/baseline length ratio) — doctrine §4.2. */
export const T2_MAX_EXPANSION_RATIO = 1.5;

/** Declared class per compared field — smart-mark prose (doctrine §4 table). */
export const PROSE_CLASSES = {
  view: "T0",
  partId: "T0",
  modelId: "T0",
  text: "T2",
  envelope: "T1",
} as const;

/** Declared class per compared field — transcription (stub). */
export const TRANSCRIPTION_CLASSES = {
  index: "T0",
  startMs: "T0",
  endMs: "T0",
  speaker: "T0",
  text: "T2",
} as const;

/** Transcript segment count mismatch is structural (T1). */
export const TRANSCRIPTION_COUNT_CLASS = "T1" as const;

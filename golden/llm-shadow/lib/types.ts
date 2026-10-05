// LLM-OUTPUT behavioural gate — shared types (doctrine docs/gates/LLM-OUTPUT-BEHAVIOURAL-GATE.md).
// Duck-typed to apps/api's FeedbackLlm contract shape BY DESIGN: golden/** must not
// couple to app code (the real seam lives at apps/api/src/services/smartmark :414-419).

/** Tolerance classes (doctrine §4). */
export type ToleranceClass = "T0" | "T1" | "T2" | "T3";

/** Gate verdicts (doctrine §5). Baseline staleness is an R0/owner disposition, never an automatic verdict. */
export type Verdict = "PASS" | "FAIL";

/** Capture metadata — audit-only, NEVER a comparison input (doctrine §7). */
export interface Provenance {
  modelId: string;
  promptHash: string;
  sampling: { temperature: number | null };
  posture: "LIVE" | "RECORDED";
}

export type SeamId = "smart-mark-prose" | "transcription";
export type FeedbackView = "feedback-explanation" | "improvement-plan";

/**
 * Smart-mark prose artifact — mirrors the consumed envelopes verbatim:
 * FeedbackExplanationView { partId, explanation, modelId, generatedAt } /
 * ImprovementPlanView { partId, plan, modelId, generatedAt } (services/smartmark :728-746).
 * `text` is the prose payload (explanation | plan); envelope field-name law is T1 (§3).
 */
export interface FeedbackProseArtifact {
  view: FeedbackView;
  partId: string;
  text: string;
  modelId: string;
  generatedAt: string; // wall-clock — TOLERATED (never compared), runner `tolerate` law
}

/** Transcription artifact — seam unlanded (answerinput contracts wave); stub contract, doctrine §8.2. */
export interface TranscriptArtifact {
  segments: Array<{
    index: number;
    startMs: number;
    endMs: number;
    speaker: string;
    text: string;
  }>;
}

export type ShadowArtifact = FeedbackProseArtifact | TranscriptArtifact;

/** Recorded shadow fixture (doctrine §7, llm-shadow/v1). */
export interface ShadowFixture {
  schema: "llm-shadow/v1";
  seam: SeamId;
  view?: FeedbackView;
  surface: string;
  case: string;
  recordedAt: string;
  provenance: Provenance;
  artifact: ShadowArtifact;
  /** Grounding anchors (§4.1) — deterministic keyphrases of the grounding chunks. */
  anchors: string[];
  /** Leak vectors (§4 T3) — substrings that must never surface in prose (scheme rubric lines etc.). */
  forbidden: string[];
}

/** Result of one compared field/segment. */
export interface SegmentResult {
  segmentId: string;
  field: string;
  declaredClass: ToleranceClass;
  ok: boolean;
  /** T2 similarity score (baseline content-token coverage), when applicable. */
  score?: number;
  detail: string;
}

/** Aggregated comparison result (doctrine §5). */
export interface CompareResult {
  verdict: Verdict;
  segments: SegmentResult[];
  /** Immediate hard-fail reasons: T3 hits + invariant violations. */
  hardFails: string[];
}

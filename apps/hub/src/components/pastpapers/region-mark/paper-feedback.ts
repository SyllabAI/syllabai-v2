/**
 * Paper-feedback copy + rollup model — T-MG-FEEDBACK-1 run-001. PURE
 * module (the ink.ts / region-mark-state.ts law: the interactive surface's
 * decisions live in testable pure modules; the component only renders).
 *
 * THE COPY PIN (plan §3.6 (b)): the feedback panel renders ALL FIVE
 * feedbackObject fields — chatMessage (as markdown), pointsScored[],
 * pointsNotScored[], thoughtProcess (the transcription), and
 * strategiesForImprovement[] — with THE FAILURE-ONLY STRATEGIES LAW (the
 * observed behaviour: strategies exist in the payload on every mark, but
 * the panel renders them ONLY when the region scored below its max).
 *
 * THE ROLLUP PIN (plan §3.6 (c)): the paper-level total is Σ score /
 * Σ maxScore FROM THE LEDGER (the per-region served slices), never a
 * local counter of anything else. Unanchored ledger regions (a regionKey
 * the served regions plane does not carry — honest drift) STILL count
 * into Σ: the ledger is the paper's total authority; anchoring only
 * decides where a per-region highlight can be DRAWN, never whether a
 * mark exists.
 */
import type { MarkAwardFeedback } from "@syllabai/contracts";
import type { MirroredPaperMarksLedger } from "@/lib/paper-marks";

export interface FeedbackCopyModel {
  /** markdown voice of record (rendered by the hub Markdown component). */
  chatMessage: string;
  /** the awarded-point labels (the ledger decomposition, NOT re-derived). */
  scored: string[];
  /** the not-scored-point labels (itemized 1:1 against the mark points). */
  notScored: string[];
  /** null = nothing rendered (the FAILURE-ONLY law: a full-score region
   * suppresses the section even if the payload carried entries). */
  strategies: string[] | null;
  /** the transcription thoughtProcess (rendered collapsed). */
  transcription: string | null;
}

/**
 * The five-field copy model of one region mark. `score`/`max` decide the
 * failure-only strategies law (score < max = failure). Empty lists render
 * as absent sections (the honest empty — no fabricated bullets).
 */
export function feedbackCopyModel(
  feedback: MarkAwardFeedback,
  score: number,
  max: number,
): FeedbackCopyModel {
  const failed = score < max;
  return {
    chatMessage: feedback.chatMessage,
    scored: feedback.pointsScored,
    notScored: feedback.pointsNotScored,
    strategies: failed && feedback.strategiesForImprovement.length > 0 ? feedback.strategiesForImprovement : null,
    transcription: feedback.thoughtProcess.length > 0 ? feedback.thoughtProcess : null,
  };
}

/** Σ score / Σ maxScore over the ledger's per-region slices (pin c). */
export function ledgerTotals(ledger: MirroredPaperMarksLedger): {
  score: number;
  max: number;
  /** how many regions carry award rows (the "5/11 style" denominator
   * context is the paper's region count, served by the regions plane —
   * the ledger only ever speaks for regions it has marked). */
  markedRegions: number;
} {
  let score = 0;
  let max = 0;
  for (const r of ledger.regions) {
    score += r.score;
    max += r.maxScore;
  }
  return { score, max, markedRegions: ledger.regions.length };
}

/**
 * Per-region award state keyed by regionKey (the highlight join: the
 * ledger's regionKey ↔ the regions plane's regionKey — the same RECT-1
 * derive law on both sides). Unmarked regions are simply absent.
 */
export function ledgerRegionScores(
  ledger: MirroredPaperMarksLedger,
): Map<string, { score: number; max: number }> {
  const byKey = new Map<string, { score: number; max: number }>();
  for (const r of ledger.regions) {
    byKey.set(r.regionKey, { score: r.score, max: r.maxScore });
  }
  return byKey;
}

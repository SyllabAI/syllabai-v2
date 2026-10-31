/**
 * Paper-feedback copy + rollup law tests — T-MG-FEEDBACK-1 run-001 (plan
 * docs/MG-MARK-PARITY-PLAN.md §3.6). The COPY PIN: all five feedbackObject
 * fields surface through the model, with the FAILURE-ONLY strategies law
 * (strategies suppressed on a full-score region even when the payload
 * carries entries). The ROLLUP PIN: Σ score / Σ maxScore FROM THE LEDGER's
 * per-region slices — never a local counter of anything else; unanchored
 * ledger regions still count into Σ (anchoring only decides where a
 * highlight can be DRAWN).
 */
import { describe, expect, test } from "bun:test";

import type { MirroredPaperMarksLedger } from "@/lib/paper-marks";
import { feedbackCopyModel, ledgerRegionScores, ledgerTotals } from "./paper-feedback";

const FULL_FEEDBACK = {
  attempt: "full",
  chatMessage: "So it says **simplify**: all five e terms combine to 5e.",
  pointsScored: ["B1: combined the five e terms correctly"],
  pointsNotScored: [],
  thoughtProcess: "5e\n\nThe transcription matches the scheme's single B1.",
  strategiesForImprovement: [],
};

const FAILED_FEEDBACK = {
  attempt: "full",
  chatMessage: "The question requires all working — the conclusion alone earns no marks.",
  pointsScored: [],
  pointsNotScored: ["P1: scale factor 15÷10 = 1.5", "P1: four ingredient amounts scaled", "C1: 300 ml > 250 ml conclusion"],
  thoughtProcess: "No, not enough milk\n\nWorking is absent; each point needs the method.",
  strategiesForImprovement: ["Find the scale factor", "Multiply each amount", "Compare with the available milk"],
};

describe("feedbackCopyModel — the copy pin (b) + the failure-only strategies law", () => {
  test("all five fields surface on a failure; strategies render", () => {
    const m = feedbackCopyModel(FAILED_FEEDBACK, 0, 3);
    expect(m.chatMessage).toBe(FAILED_FEEDBACK.chatMessage);
    expect(m.scored).toEqual([]);
    expect(m.notScored).toHaveLength(3);
    expect(m.strategies).toEqual(FAILED_FEEDBACK.strategiesForImprovement);
    expect(m.transcription).toBe(FAILED_FEEDBACK.thoughtProcess);
  });

  test("a full-score region SUPPRESSES strategies even when the payload carries entries", () => {
    const m = feedbackCopyModel({ ...FULL_FEEDBACK, strategiesForImprovement: ["practice more"] }, 1, 1);
    expect(m.strategies).toBeNull(); // the failure-only law — never rendered
    expect(m.scored).toHaveLength(1);
    expect(m.notScored).toEqual([]);
  });

  test("an empty thoughtProcess renders absent (no empty collapsed section)", () => {
    const m = feedbackCopyModel({ ...FULL_FEEDBACK, thoughtProcess: "" }, 1, 1);
    expect(m.transcription).toBeNull();
  });

  test("strategies on a failure with an EMPTY payload list render absent too", () => {
    const m = feedbackCopyModel({ ...FAILED_FEEDBACK, strategiesForImprovement: [] }, 0, 3);
    expect(m.strategies).toBeNull();
  });
});

function ledgerWith(regions: Array<{ regionKey: string; score: number; maxScore: number }>): MirroredPaperMarksLedger {
  return {
    documentRefType: "paper_asset",
    documentRefId: "47000000-0000-4000-8000-000000000001",
    regions: regions.map((r) => ({
      ...r,
      page: 3,
      awards: [],
      workingBlocks: [],
    })),
  };
}

describe("ledgerTotals — the rollup pin (c): Σ from the ledger slices", () => {
  test("5/11 across marked regions (the observed paper shape)", () => {
    const t = ledgerTotals(
      ledgerWith([
        { regionKey: "1.p1", score: 1, maxScore: 1 },
        { regionKey: "9.a", score: 0, maxScore: 1 },
        { regionKey: "9.b", score: 0, maxScore: 1 },
        { regionKey: "9.c", score: 1, maxScore: 1 },
        { regionKey: "17.p1", score: 0, maxScore: 3 },
      ]),
    );
    expect(t).toEqual({ score: 2, max: 7, markedRegions: 5 });
  });

  test("an empty ledger totals zero and renders nothing (the honest-absent law)", () => {
    const t = ledgerTotals(ledgerWith([]));
    expect(t).toEqual({ score: 0, max: 0, markedRegions: 0 });
  });

  test("unanchored ledger regions still count into Σ (anchoring is drawing, not existence)", () => {
    const ledger = ledgerWith([
      { regionKey: "SERVED-1", score: 1, maxScore: 2 },
      { regionKey: "DRIFTED-REGION", score: 2, maxScore: 2 },
    ]);
    const t = ledgerTotals(ledger);
    expect(t.score).toBe(3);
    expect(t.max).toBe(4);
    // the highlight join only carries the served key
    expect(ledgerRegionScores(ledger).has("DRIFTED-REGION")).toBe(true);
  });
});

describe("ledgerRegionScores — the highlight join", () => {
  test("keyed by regionKey; unmarked regions are absent", () => {
    const m = ledgerRegionScores(
      ledgerWith([
        { regionKey: "9.p1", score: 1, maxScore: 1 },
        { regionKey: "17.p1", score: 0, maxScore: 3 },
      ]),
    );
    expect(m.get("9.p1")).toEqual({ score: 1, max: 1 });
    expect(m.get("17.p1")).toEqual({ score: 0, max: 3 });
    expect(m.has("2.p1")).toBe(false);
  });
});

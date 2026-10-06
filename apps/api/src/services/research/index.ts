/**
 * T-MIG-062 — research calibration service (frozen law @ 6cad6ef, syllabai-core).
 * The Wave-6 research band, ported line-against-line:
 *
 *   - ResearchCalibrationController.java :1-40 → the route (routes/research):
 *     GET /api/v1/research/learner-model/calibration?nodeId=<uuid optional> —
 *     SecurityConfig :88-90 hasAnyRole('TEACHER','ADMIN') + the method-level
 *     @PreAuthorize re-gate (defense in depth; the port collapses both into
 *     the one shell check with the same 401/403 outcomes — there is no second
 *     layer to bypass in a single-router mount).
 *
 *   - LearnerModelCalibrationService.java (515 lines) → this module, verbatim:
 *     ONE ordered fetch (findByTypeOrderByOccurredAtAsc(BKT_UPDATED) — the
 *     C4 §6 single-pass posture; paging is a named follow-up, not now), the
 *     skip-before-filter row walk, the emission mapping, the ten equal-width
 *     bins, the per-format and per-gap segment axes in FIXED render order,
 *     and the k-anonymity suppression (C7 resolution — ADR-036 BINDS THE
 *     PORT).
 *
 * ROW CONTRACT (the BKT_UPDATED payload, written by the frozen update path):
 *   decayedPrior (number|numeric-string — the computed never-persisted
 *   pre-attempt estimate, NOT the stored anchor), correctness (STRICT
 *   boolean), nodeId (uuid string), questionType (string), optionCount
 *   (number), gapDays (number|numeric-string), priorMastery (number —
 *   optional), learner_id on the row (non-null by the telemetry contract).
 *   Rows missing/unparseable decayedPrior or correctness, or latent outside
 *   [0,1], are skipped and counted HONESTLY (skippedRows, global, never
 *   attributed to a segment — pre-C1 rows carry no honest format); the
 *   nodeId filter drops rows into NEITHER bucket ("filtered, not malformed")
 *   and runs AFTER the skip check in the same walk.
 *
 * EMISSION MAPPING (C2): even a perfectly latent-calibrated model observes
 *   bin accuracy P·(1−slip) + (1−P)·guess — so the headline meanPredicted is
 *   the EMISSION-MAPPED prediction and Brier/ECE are computed on it, while
 *   the raw latent mean rides beside it (meanLatentPredicted) for drift
 *   forensics. slip is GLOBAL 0.1 (ADR-033 declined format-aware slip);
 *   guess resolves per format through the SAME resolver the update path uses
 *   (LearnerProperties.Bkt.toParams :94-111 — ported below as toParams()).
 *
 * K-ANONYMITY (C7, decided 2026-10-02): any cell — the pooled headline, a
 *   pooled bin, a format or gap segment, a bin within a segment — whose
 *   DISTINCT learners number fewer than MIN_REPORTABLE_LEARNERS (k=5, a CODE
 *   CONSTANT: a privacy floor an env var could silently lower is not a
 *   floor) renders its statistics null with counts visible everywhere
 *   (sampleCount, learnerCount, bin counts, skippedRows). The unit is the
 *   LEARNER, not the row (one marked attempt updates every node it honestly
 *   tests — a row-count floor would pass a 6-row/2-learner cell). Segment
 *   aggregate Brier/ECE still INCLUDE their suppressed bins' contributions
 *   (excluding them would select-bias the statistic); only the fine-grained
 *   cells hide. Empty cells (count 0) keep the honest-zero rendering and are
 *   DISTINCT from suppressed ones (count > 0, nulls).
 *
 * DISCLOSED PARSING NUANCES (defensive-parser parity, :488-515):
 *   - optionCount mirrors Java's (int) cast: truncation toward zero, NaN → 0
 *     (a NaN optionCount and a 0 optionCount land in the same malformed
 *     stratum and resolve the same paper guess).
 *   - gapDays mirrors Long.parseLong strictness: integer-only strings (the
 *     decimal regex below) — a "30.5" string is UNKNOWN here exactly as it
 *     is a NumberFormatException → null → UNKNOWN in the frozen service.
 *     Long-overflow-range strings cannot flip a band (both land "366+").
 *   - doubleValue accepts plain decimal/scientific strings only. A
 *     hand-crafted "NaN" string payload is SKIPPED here; the frozen service
 *     would parse it and poison the sums (NaN comparisons bypass the [0,1]
 *     guard) — a pathological row outside the writer's contract (Jackson
 *     never serializes NaN by default); skipped is the honest posture.
 *   - the nodeId filter compares STRICT string equality against the
 *     canonical (lowercase) uuid — a non-string payload value never matches,
 *     mirroring Java's equals().
 *
 * F-062-A (dead-branch resolution, F-061-C precedent): the toParams clamp
 *   `min(resolved, 1 − slip − 1e-9)` is UNREACHABLE through the aggregation
 *   path with the paper constants — MCQ guesses are ≤ 0.5 for any usable
 *   option count and every configured constant is ≤ 0.25, all strictly below
 *   1 − 0.1. Ported verbatim (comment, not code elimination): a future
 *   registry-configured slip near 0.5 would arm it.
 *
 * READ-ONLY: no transaction affordance (R-TX doctrine applies to writes);
 * every query is a single statement. The FP accumulation order follows the
 * frozen fetch order (occurred_at ASC) — row-walk order is the only
 * floating-point-ordering contract this module carries.
 */

import type { SqlFn } from "../assessment/sql";
import {
  CALIBRATION_SEGMENT_ORDER,
  CALIBRATION_GAP_ORDER,
  type CalibrationReport,
  type CalibrationBin,
  type CalibrationFormatSegment,
  type CalibrationGapSegment,
} from "@syllabai/contracts";

// ── the BKT emission parameters (LearnerProperties.java :21-111) ────────────

/**
 * LearnerProperties.Bkt record (:52-62) — research-design parameters,
 * versioned through the model_versions registry and configurable via
 * syllabai.learner.bkt.* in the frozen core; the compact constructor
 * normalizes any param <= 0 to the paper constant (a misconfigured knob
 * degrades, never inverts). The model_versions registry path is tranche-3
 * (the T-MIG-041 note stands): the calibration read consumes the PAPER
 * defaults until that band lands — the normalization is ported
 * (normalizedBkt) so the registry band can drop its config in without
 * touching this law.
 */
export interface BktConfig {
  l0: number;
  slip: number;
  guess: number;
  learnRate: number;
  shortAnswerGuess: number;
  structuredGuess: number;
}

/** Paper B Cycle-1 constants (BktParams.java :36-46 / the 041 contracts note). */
export const PAPER_BKT: BktConfig = {
  l0: 0.1,
  slip: 0.1,
  guess: 0.25,
  learnRate: 0.1,
  shortAnswerGuess: 0.05,
  structuredGuess: 0.01,
};

/** The compact-ctor normalization (:56-62): any param <= 0 falls back to paper. */
export function normalizedBkt(raw: Partial<BktConfig>): BktConfig {
  const pick = (v: number | undefined, paper: number): number =>
    v !== undefined && v > 0 ? v : paper;
  return {
    l0: pick(raw.l0, PAPER_BKT.l0),
    slip: pick(raw.slip, PAPER_BKT.slip),
    guess: pick(raw.guess, PAPER_BKT.guess),
    learnRate: pick(raw.learnRate, PAPER_BKT.learnRate),
    shortAnswerGuess: pick(raw.shortAnswerGuess, PAPER_BKT.shortAnswerGuess),
    structuredGuess: pick(raw.structuredGuess, PAPER_BKT.structuredGuess),
  };
}

/** The resolved emission pair the mapping consumes (BktParams l0/T ride along unused). */
export interface BktEmission {
  slip: number;
  guess: number;
}

const SLIP = PAPER_BKT.slip;

/**
 * LearnerProperties.Bkt.toParams(String questionType, int optionCount)
 * (:94-111), verbatim:
 *   MCQ_SINGLE with a usable option count → 1.0/optionCount (the paper's
 *     0.25 is exactly N=4 — four-option MCQs are bit-identical to the legacy
 *     path); MCQ_SINGLE with a count below 2 → the paper default (the C3
 *     guard: 1/1 = 1.0 would make wrong answers RAISE mastery; 1/0 would
 *     500 the submission) — malformed counts are a data-quality tail, so
 *     the guard degrades to the legacy prior instead of failing;
 *   SHORT_ANSWER → shortAnswerGuess (0.05, S2 challenge C5);
 *   STRUCTURED → structuredGuess (0.01 — the 0.25 paper constant
 *     under-credited structured learners 2.57× per correct answer);
 *   null/blank/unknown format → the paper default (legacy untyped evidence
 *     keeps its exact historical behaviour);
 *   then the clamp strictly below 1 − slip ("degrade, never invert") —
 *   see F-062-A: unreachable with the paper constants, ported verbatim.
 */
export function toParams(questionType: string | null, optionCount: number): BktEmission {
  let resolved: number;
  if (questionType === "MCQ_SINGLE") {
    resolved = optionCount >= 2 ? 1.0 / optionCount : PAPER_BKT.guess;
  } else if (questionType === "SHORT_ANSWER") {
    resolved = PAPER_BKT.shortAnswerGuess;
  } else if (questionType === "STRUCTURED") {
    resolved = PAPER_BKT.structuredGuess;
  } else {
    resolved = PAPER_BKT.guess;
  }
  resolved = Math.min(resolved, 1.0 - SLIP - 1e-9);
  return { slip: SLIP, guess: resolved };
}

// ── the segment axes (service :143-181) ─────────────────────────────────────

const UNTYPED = "UNTYPED";
const UNKNOWN_GAP = "UNKNOWN";

/**
 * The segment key a contract row belongs to — the same (questionType,
 * optionCount) the update path's resolver priced it with, bucketed per the
 * C4 §2 format axis (:158-175). Pure and total: every row maps to exactly
 * one of CALIBRATION_SEGMENT_ORDER's keys, so segments partition by
 * construction. Unrecognized format names fold into UNTYPED because the
 * resolver prices them identically (paper guess constant) — the fold never
 * mixes different pricing.
 */
export function segmentKey(questionType: string | null, optionCount: number): string {
  if (questionType === null || questionType.trim() === "") {
    return UNTYPED;
  }
  switch (questionType) {
    case "MCQ_SINGLE":
      return optionCount >= 5
        ? "MCQ_SINGLE(5+)"
        : optionCount >= 2
          ? optionCount === 4
            ? "MCQ_SINGLE(4)"
            : "MCQ_SINGLE(2-3)"
          : "MCQ_SINGLE(malformed)";
    case "SHORT_ANSWER":
      return "SHORT_ANSWER";
    case "STRUCTURED":
      return "STRUCTURED";
    default:
      return UNTYPED;
  }
}

/**
 * The gap-band key (:177-197) — the gapDays the update path computed
 * alongside the decay, banded per the τ alignment. Pure and total.
 * Missing/unparseable/negative → UNKNOWN (the publisher always writes
 * gapDays beside decayedPrior, so a populated UNKNOWN stratum is a
 * payload-contract finding, not a normal tail).
 */
export function gapSegmentKey(rawGapDays: unknown): string {
  const g = longValue(rawGapDays);
  if (g === null || g < 0) {
    return UNKNOWN_GAP;
  }
  if (g === 0) {
    return "0";
  }
  if (g <= 30) {
    return "1-30";
  }
  if (g <= 90) {
    return "31-90";
  }
  if (g <= 365) {
    return "91-365";
  }
  return "366+";
}

// ── defensive parsers (:488-515) — see the header disclosure block ──────────

/** longValue: Number (truncated, NaN → 0) or integer-only string, else null. */
export function longValue(raw: unknown): number | null {
  if (typeof raw === "number") {
    if (Number.isNaN(raw)) return 0; // Java (long) Double.NaN == 0
    return Math.trunc(raw);
  }
  if (typeof raw === "string" && raw.trim() !== "") {
    const s = raw.trim();
    if (!/^[+-]?\d+$/.test(s)) return null; // Long.parseLong strictness
    return Number(s);
  }
  return null;
}

/** doubleValue: Number or plain decimal/scientific string, else null. */
export function doubleValue(raw: unknown): number | null {
  if (typeof raw === "number") {
    return raw;
  }
  if (typeof raw === "string" && raw.trim() !== "") {
    const s = raw.trim();
    if (!/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(s)) return null;
    return Number(s);
  }
  return null;
}

/** intValue: Java (int) cast parity for the optionCount — truncate, NaN → 0. */
export function intValue(raw: unknown): number {
  if (typeof raw === "number") {
    if (Number.isNaN(raw)) return 0;
    return Math.trunc(raw);
  }
  return 0;
}

// ── the accumulator (:414-486) ──────────────────────────────────────────────

const BIN_COUNT = 10;

/**
 * The C7 suppression floor (:123-133): a report cell aggregates at least
 * this many DISTINCT learners before its statistics leave the wire. k = 5
 * per the C4 protocol's §4.2 small-cell floor (upgraded from a citation
 * rule to an enforced one); deliberately a constant, not configuration —
 * moving it is a reviewed code change with the ADR ledger updated.
 */
export const MIN_REPORTABLE_LEARNERS = 5;

/** Row accumulator for one population (pooled, a format segment, or a gap band). */
class Accum {
  n = 0;
  brierSum = 0;
  anchorSum = 0;
  anchorN = 0;
  binCount: number[] = Array<number>(BIN_COUNT).fill(0);
  latentSum: number[] = Array<number>(BIN_COUNT).fill(0);
  predictedSum: number[] = Array<number>(BIN_COUNT).fill(0);
  outcomeSum: number[] = Array<number>(BIN_COUNT).fill(0);
  binBrierSum: number[] = Array<number>(BIN_COUNT).fill(0);
  learners = new Set<unknown>();
  binLearners: Set<unknown>[] = Array.from({ length: BIN_COUNT }, () => new Set<unknown>());

  add(
    latent: number,
    predicted: number,
    outcome: number,
    brier: number,
    bin: number,
    anchor: number | null,
    learnerId: unknown,
  ): void {
    this.n++;
    this.brierSum += brier;
    this.binCount[bin] = (this.binCount[bin] ?? 0) + 1;
    this.latentSum[bin] = (this.latentSum[bin] ?? 0) + latent;
    this.predictedSum[bin] = (this.predictedSum[bin] ?? 0) + predicted;
    this.outcomeSum[bin] = (this.outcomeSum[bin] ?? 0) + outcome;
    this.binBrierSum[bin] = (this.binBrierSum[bin] ?? 0) + brier;
    if (anchor !== null) {
      this.anchorSum += anchor;
      this.anchorN++;
    }
    this.learners.add(learnerId);
    this.binLearners[bin]!.add(learnerId);
  }

  learnerCount(): number {
    return this.learners.size;
  }

  /** Mean raw anchor over the rows carrying one — the bit-identity leg's raw side. */
  anchor(): number {
    return this.anchorN === 0 ? 0.0 : this.anchorSum / this.anchorN;
  }

  brier(): number {
    return this.n === 0 ? 0.0 : this.brierSum / this.n;
  }

  ece(): number {
    let ece = 0.0;
    for (let i = 0; i < BIN_COUNT; i++) {
      if (this.binCount[i] === 0) {
        continue;
      }
      const meanPredicted = this.predictedSum[i]! / this.binCount[i]!;
      const observed = this.outcomeSum[i]! / this.binCount[i]!;
      ece += ((this.binCount[i]! / this.n) * Math.abs(meanPredicted - observed));
    }
    return ece;
  }

  bins(): CalibrationBin[] {
    const bins: CalibrationBin[] = [];
    for (let i = 0; i < BIN_COUNT; i++) {
      const count = this.binCount[i]!;
      const lower = i / BIN_COUNT;
      const upper = (i + 1) / BIN_COUNT;
      if (count === 0) {
        // empty: the established honest-zero rendering — no evidence, not
        // hidden evidence (distinct from C7 suppression by the zero count)
        bins.push({
          index: i,
          lowerBound: lower,
          upperBound: upper,
          count: 0,
          meanLatentPredicted: 0.0,
          meanPredicted: 0.0,
          observedAccuracy: 0.0,
          meanBrier: 0.0,
          calibrationError: 0.0,
        });
      } else if (this.binLearners[i]!.size < MIN_REPORTABLE_LEARNERS) {
        // suppressed (C7): the cell's outcomes hide, its traffic stays
        bins.push({
          index: i,
          lowerBound: lower,
          upperBound: upper,
          count,
          meanLatentPredicted: null,
          meanPredicted: null,
          observedAccuracy: null,
          meanBrier: null,
          calibrationError: null,
        });
      } else {
        const meanPredicted = this.predictedSum[i]! / count;
        const observed = this.outcomeSum[i]! / count;
        bins.push({
          index: i,
          lowerBound: lower,
          upperBound: upper,
          count,
          meanLatentPredicted: this.latentSum[i]! / count,
          meanPredicted,
          observedAccuracy: observed,
          meanBrier: this.binBrierSum[i]! / count,
          calibrationError: meanPredicted - observed,
        });
      }
    }
    return bins;
  }
}

// ── the report walk (service :337-400) ──────────────────────────────────────

export interface ResearchModule {
  /** The calibration report (ResearchCalibrationController.calibration :34-39). */
  calibrationReport(nodeIdFilter: string | null): Promise<CalibrationReport>;
}

export function buildResearchModule(sql: SqlFn): ResearchModule {
  return {
    async calibrationReport(nodeIdFilter: string | null): Promise<CalibrationReport> {
      // findByTypeOrderByOccurredAtAsc(BKT_UPDATED) — one ordered fetch, one
      // pass (C4 §6); the FP accumulation order rides the fetch order.
      const rows = await sql`
        select id, learner_id, payload, occurred_at
        from telemetry_events
        where event_type = ${"BKT_UPDATED"}
        order by occurred_at asc
      `;

      const pooled = new Accum();
      const bySegment = new Map<string, Accum>();
      for (const key of CALIBRATION_SEGMENT_ORDER) {
        bySegment.set(key, new Accum());
      }
      const byGap = new Map<string, Accum>();
      for (const key of CALIBRATION_GAP_ORDER) {
        byGap.set(key, new Accum());
      }

      let skipped = 0;
      for (const row of rows) {
        const payload = (row.payload ?? {}) as Record<string, unknown>;
        const latent = doubleValue(payload["decayedPrior"]);
        const correct =
          typeof payload["correctness"] === "boolean" ? (payload["correctness"] as boolean) : null;
        if (latent === null || correct === null || latent < 0.0 || latent > 1.0) {
          skipped++; // legacy row (pre-C1 contract) or malformed — skipped honestly
          continue;
        }
        if (nodeIdFilter !== null && payload["nodeId"] !== nodeIdFilter) {
          continue; // filtered, not malformed — counts in neither bucket
        }
        const type = typeof payload["questionType"] === "string" ? (payload["questionType"] as string) : null;
        const optionCount = intValue(payload["optionCount"]);
        const emission = toParams(type, optionCount);
        const predicted = latent * (1.0 - emission.slip) + (1.0 - latent) * emission.guess;
        const outcome = correct ? 1.0 : 0.0;
        const brier = (predicted - outcome) * (predicted - outcome);
        const bin = Math.min(BIN_COUNT - 1, Math.max(0, Math.floor(latent * BIN_COUNT)));
        const anchor = doubleValue(payload["priorMastery"]);
        pooled.add(latent, predicted, outcome, brier, bin, anchor, row.learner_id);
        bySegment
          .get(segmentKey(type, optionCount))!
          .add(latent, predicted, outcome, brier, bin, anchor, row.learner_id);
        byGap
          .get(gapSegmentKey(payload["gapDays"]))!
          .add(latent, predicted, outcome, brier, bin, anchor, row.learner_id);
      }

      const segments: CalibrationFormatSegment[] = CALIBRATION_SEGMENT_ORDER.map((key) => {
        const a = bySegment.get(key)!;
        const suppressed = a.learnerCount() > 0 && a.learnerCount() < MIN_REPORTABLE_LEARNERS;
        return {
          segment: key,
          sampleCount: a.n,
          brier: suppressed ? null : a.brier(),
          ece: suppressed ? null : a.ece(),
          bins: a.bins(),
          learnerCount: a.learnerCount(),
          suppressed,
        };
      });
      const gapSegments: CalibrationGapSegment[] = CALIBRATION_GAP_ORDER.map((key) => {
        const a = byGap.get(key)!;
        const suppressed = a.learnerCount() > 0 && a.learnerCount() < MIN_REPORTABLE_LEARNERS;
        return {
          segment: key,
          sampleCount: a.n,
          brier: suppressed ? null : a.brier(),
          ece: suppressed ? null : a.ece(),
          meanAnchor: suppressed ? null : a.anchor(),
          bins: a.bins(),
          learnerCount: a.learnerCount(),
          suppressed,
        };
      });
      const pooledSuppressed = pooled.learnerCount() > 0 && pooled.learnerCount() < MIN_REPORTABLE_LEARNERS;
      return {
        sampleCount: pooled.n,
        skippedRows: skipped,
        brier: pooledSuppressed ? null : pooled.brier(),
        ece: pooledSuppressed ? null : pooled.ece(),
        bins: pooled.bins(),
        segments,
        gapSegments,
        learnerCount: pooled.learnerCount(),
        suppressed: pooledSuppressed,
      };
    },
  };
}

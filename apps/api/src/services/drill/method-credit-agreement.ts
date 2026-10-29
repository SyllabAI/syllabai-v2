/**
 * F-185 — the method-credit agreement measurement (the F-183 validation
 * metric "method-credit agreement on structured drill parts" — the F-183 law
 * run's disclosed handoff: "method-credit agreement measurement is F-185's
 * title consuming these acks").
 *
 * Spec of record: docs/F185-MODEL-DRIVEN-DRAW-PLAN.md §7 (committed WITH this
 * implementation per the #216/#225/#229/#232/DC-4/F182/F183/F184 pattern);
 * the statistic of record is two-rater Cohen's kappa over the per-point
 * methodCredited verdicts — the T-SM-KAPPA-SUBJECT marking-plane precedent's
 * agreement law, at drill method-credit scale.
 *
 * THE LAWS (A1..A5 — pinned by apps/api/test/drill/method-credit-agreement.test.ts):
 *   A1  INPUT OF RECORD — a TRIAL pairs two raters' verdicts over the SAME
 *       structured part's SAME MS-of-record points; each side is the F-183
 *       ack's DrillMethodCreditAllocation list ({ref, methodCredited,
 *       rationale}) — the validator-trio law already guarantees ack
 *       allocations reference known point refs with no duplicates.
 *   A2  POINT-PAIRED DENOMINATOR — a point is COMPARED iff BOTH raters
 *       allocated it; refs allocated by only one rater are EXCLUDED and
 *       disclosed (never scored as agreement or disagreement) — the
 *       denominator of record is the paired-point count.
 *   A3  THE STATISTICS OF RECORD — Po = observed per-point agreement over
 *       the paired denominator; Pe = Cohen's expected agreement from the
 *       two raters' joint marginals over the SAME paired points;
 *       kappa = (Po - Pe) / (1 - Pe). The honest null: any statistic
 *       without a denominator (zero paired points) — or with a degenerate
 *       kappa denominator (1 - Pe == 0, both raters constant in the same
 *       category) — is null, never a fabricated number.
 *   A4  NO PERSISTENCE — the measurement computes from the trials its
 *       caller hands it and stores nothing (the acks are EPHEMERAL per the
 *       F-183 law L4; the zero-stakes law is untouched). No store, no
 *       SqlFn, no clock in this module.
 *   A5  HONEST DISCLOSURE — the result carries the population (trials,
 *       compared + excluded points), each rater's credit totals over the
 *       PAIRED denominator, and the per-trial breakdown; exclusions are
 *       always visible, never silently dropped.
 *
 * Collection posture (disclosed residual): the acks are ephemeral, so the
 * live agreement number needs a collection run — a second generator pass at
 * reveal time (2x spend) or a teacher-reference replay (marking time). Both
 * are operator-gated research runs; the kappa infrastructure of record lands
 * here (the F-183 precedent verbatim: "the metric infrastructure is what
 * lands"). No agreement number for the live model is asserted by this PR.
 */
import type { DrillMethodCreditAllocation } from "@syllabai/contracts";

/** One rater's verdict over one structured part's MS points (the F-183 ack shape). */
export interface MethodCreditRaterVerdict {
  /** The rater's identity of record (e.g. the generator's pipelineVersion, or "teacher-reference"). */
  readonly rater: string;
  readonly allocations: readonly DrillMethodCreditAllocation[];
}

/** One paired verdict: two raters over the same structured part (law A1). */
export interface MethodCreditTrial {
  readonly partId: string;
  readonly raterA: MethodCreditRaterVerdict;
  readonly raterB: MethodCreditRaterVerdict;
}

/** One trial's outcome: the paired denominator, the exclusions, the agreement. */
export interface MethodCreditTrialResult {
  readonly partId: string;
  readonly raterA: string;
  readonly raterB: string;
  readonly pointsCompared: number;
  readonly excludedPoints: number;
  readonly agreed: number;
  readonly raterACredited: number;
  readonly raterBCredited: number;
}

/** The agreement measurement of record over a trial set (laws A2..A5). */
export interface MethodCreditAgreement {
  readonly trials: number;
  readonly pointsCompared: number;
  readonly excludedPoints: number;
  /** Po — null when no points were compared (no denominator, never a fabricated rate). */
  readonly observedAgreement: number | null;
  /** Pe — the joint-marginal expectation over the paired points; null with the denominator. */
  readonly expectedAgreement: number | null;
  /** Cohen's kappa; null when the denominator is empty or 1 - Pe degenerates (law A3). */
  readonly kappa: number | null;
  readonly raterA: { readonly credited: number; readonly total: number };
  readonly raterB: { readonly credited: number; readonly total: number };
  readonly perTrial: readonly MethodCreditTrialResult[];
}

/**
 * Law A2 — the paired point refs of two raters' allocations: the
 * intersection (compared) and the symmetric difference (excluded, disclosed).
 */
export function pairedRefs(
  a: readonly DrillMethodCreditAllocation[],
  b: readonly DrillMethodCreditAllocation[],
): { compared: string[]; excluded: string[] } {
  const aRefs = new Map(a.map((x) => [x.ref, x]));
  const bRefs = new Map(b.map((x) => [x.ref, x]));
  const compared: string[] = [];
  for (const [ref] of aRefs) if (bRefs.has(ref)) compared.push(ref);
  const excluded: string[] = [];
  for (const [ref] of aRefs) if (!bRefs.has(ref)) excluded.push(ref);
  for (const [ref] of bRefs) if (!aRefs.has(ref)) excluded.push(ref);
  return { compared, excluded };
}

/**
 * The agreement measurement of record (laws A1..A5). Pure: same trials ->
 * the same measurement. Kappa convention: complete agreement with
 * non-degenerate marginals -> 1; the degenerate-denominator cases
 * (no paired points, or both raters constant in the same category) -> null.
 */
export function methodCreditAgreement(trials: readonly MethodCreditTrial[]): MethodCreditAgreement {
  let compared = 0;
  let agreed = 0;
  let excluded = 0;
  let aCredited = 0;
  let bCredited = 0;
  const perTrial: MethodCreditTrialResult[] = [];

  for (const trial of trials) {
    const { compared: refs, excluded: trialExcluded } = pairedRefs(trial.raterA.allocations, trial.raterB.allocations);
    excluded += trialExcluded.length;
    const aByRef = new Map(trial.raterA.allocations.map((x) => [x.ref, x]));
    const bByRef = new Map(trial.raterB.allocations.map((x) => [x.ref, x]));
    let trialAgreed = 0;
    let trialA = 0;
    let trialB = 0;
    for (const ref of refs) {
      const va = aByRef.get(ref)!;
      const vb = bByRef.get(ref)!;
      if (va.methodCredited === vb.methodCredited) trialAgreed += 1;
      if (va.methodCredited) trialA += 1;
      if (vb.methodCredited) trialB += 1;
    }
    compared += refs.length;
    agreed += trialAgreed;
    aCredited += trialA;
    bCredited += trialB;
    perTrial.push({
      partId: trial.partId,
      raterA: trial.raterA.rater,
      raterB: trial.raterB.rater,
      pointsCompared: refs.length,
      excludedPoints: trialExcluded.length,
      agreed: trialAgreed,
      raterACredited: trialA,
      raterBCredited: trialB,
    });
  }

  const observed = compared > 0 ? agreed / compared : null;

  // Cohen's Pe from the joint marginals over the SAME paired points
  // (law A3): Pe = pA(credited)*pB(credited) + pA(not)*pB(not).
  let expected: number | null = null;
  let kappa: number | null = null;
  if (compared > 0) {
    const pa = aCredited / compared;
    const pb = bCredited / compared;
    const pe = pa * pb + (1 - pa) * (1 - pb);
    expected = pe;
    const denom = 1 - pe;
    kappa = denom <= 1e-12 ? null : (observed! - pe) / denom;
  }

  return {
    trials: trials.length,
    pointsCompared: compared,
    excludedPoints: excluded,
    observedAgreement: observed,
    expectedAgreement: expected,
    kappa,
    raterA: { credited: aCredited, total: compared },
    raterB: { credited: bCredited, total: compared },
    perTrial,
  };
}

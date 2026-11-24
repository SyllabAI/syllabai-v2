/**
 * The conformance trend scorer (T-TUTOR-AUDIT-P4 run-001, P4-08) — PURE,
 * provider-free. It scores recorded WIRE marked-part turns through the
 * SERVING DC-5 law of record, imported VERBATIM (the no-drift discipline,
 * P3-01's own ruling: "a re-implemented law would drift; an imported one
 * cannot"):
 *
 *   - mark-conformance.ts : lintMarkedPartTurn (the turn-level law, the
 *     blocking surface of record — Rules A/B, sentence-granular strip, the
 *     turn-level fail-open), lintSentence (the per-sentence law, the
 *     stream wrapper's unit), conformanceReport (the telemetry projection).
 *   - mark-context.ts     : MarkContext (the resolved scheme of record the
 *     caller passes; the shape itself rides the wire of record).
 *
 * The decision tree of record (the serve-time invariants the wire turn
 * makes checkable post-hoc — every branch of the serving law's own
 * posture, karag :1263-1274 blocking / :1299-1338 stream):
 *
 *   1. BLOCKING serving turn (report present) — the recorded report must
 *      be internally consistent (stripped == ruleA + ruleB, OR the
 *      turn-level fail-open shape: stripped == 0 && ruleA + ruleB > 0 —
 *      the empty-result law returns the input unchanged), and:
 *        - ruleA + ruleB == 0  → re-linting the WIRE answer must be
 *          all-clear (a clean serve);
 *        - stripped == ruleA + ruleB > 0 → re-linting the WIRE answer must
 *          be all-clear (the strip held — the offending sentences never
 *          reached the learner);
 *        - the fail-open shape → the wire answer IS the input, so
 *          re-linting it must reproduce the recorded counts exactly.
 *   2. REFUSED turn — conformance must be null (the lint never activates
 *      on a refusal; karag :254-256's own posture).
 *   3. STREAM serving turn — conformance must be null (no report is
 *      published on the stream event today, karag :1130-1146) and the
 *      per-sentence law re-derived on the WIRE answer must be all-clear
 *      (the wrapper held the violating sentences back).
 */

import {
  conformanceReport,
  factsOfContext,
  lintMarkedPartTurn,
  lintSentence,
} from "../../../apps/api/src/services/tutor/mark-conformance.ts";
import type { MarkContext } from "../../../apps/api/src/services/tutor/mark-context.ts";
import type {
  ConformanceAggregate,
  MarkedTurnCorpus,
  MarkedTurnVerdict,
  RecordedConformanceReport,
  RecordedMarkedTurn,
} from "./types.ts";

export const LANE = "T-TUTOR-AUDIT-P4";
export const RUN = "run-001";

/** The rubric of record (bump ONLY in a same-PR re-pin conversation). */
export const RUBRIC_VERSION = "conformance-trend-rubric-v1";

/** Re-derive the per-sentence law over the wire answer (the stream
 *  wrapper's unit — per-sentence decisions, no turn-level fail-open). The
 *  facts precompute once per turn via the serving law's own exported
 *  factsOfContext (the SAME normalisation the wrapper runs). */
function reDeriveSentenceLaw(
  answer: string,
  ctx: MarkContext,
): { violations: number; ruleA: number; ruleB: number } {
  let violations = 0;
  let ruleA = 0;
  let ruleB = 0;
  const facts = factsOfContext(ctx);
  const passThroughRefs: string[] = [];
  for (const sentence of answer.split(/(?<=[.!?])\s+|\n+/)) {
    const s = sentence.trim();
    if (s.length === 0) continue;
    const drop = lintSentence(s, facts, passThroughRefs);
    if (drop != null) {
      violations++;
      if (drop.rule === "A") ruleA++;
      else ruleB++;
    }
  }
  return { violations, ruleA, ruleB };
}

/** Re-derive the turn-level law on the wire answer (the blocking unit). */
function reDeriveTurnLaw(
  answer: string,
  ctx: MarkContext,
): { violations: number; ruleA: number; ruleB: number; passThrough: number; stripped: number } {
  const result = lintMarkedPartTurn(answer, ctx);
  const report = conformanceReport(result);
  return {
    violations: report.ruleA + report.ruleB,
    ruleA: report.ruleA,
    ruleB: report.ruleB,
    passThrough: report.passThrough,
    stripped: report.stripped,
  };
}

/** Score one recorded marked-part turn through the serving DC-5 law. Pure
 *  — no I/O, no provider, no database; the verdict is a function of the
 *  turn alone. */
export function scoreTurn(turn: RecordedMarkedTurn): MarkedTurnVerdict {
  const violations: string[] = [];
  const ctx = turn.markContext;
  const isRefusal = turn.refused;
  const isStream = turn.path === "stream";

  // The refusal posture: the lint never activates on a refusal — the
  // deterministic refusal answer is generated BEFORE the lint seam (karag
  // :865-886) and the event publishes conformance null (:254-256).
  if (isRefusal) {
    if (turn.conformance != null) violations.push("refusal-report-present");
    return {
      turnId: turn.turnId,
      reDerived: { violations: 0, ruleA: 0, ruleB: 0, passThrough: 0, stripped: 0 },
      branch: "refusal",
      violations,
    };
  }

  // The stream posture: the per-sentence law acts but NO report is
  // published on the stream event today (karag :1130-1146) — the wire
  // answer must obey the per-sentence law and the report must be absent.
  if (isStream) {
    if (turn.conformance != null) violations.push("stream-report-present");
    const re = reDeriveSentenceLaw(turn.answer, ctx);
    if (re.violations > 0) violations.push("wire-breaks-law");
    return {
      turnId: turn.turnId,
      reDerived: { ...re, passThrough: 0, stripped: 0 },
      branch: "stream",
      violations,
    };
  }

  // The blocking surface of record: the report of record must be present
  // and internally consistent, and the wire answer must sit in the branch
  // the recorded report claims.
  const recorded: RecordedConformanceReport | null = turn.conformance;
  if (recorded == null) {
    violations.push("report-not-active");
    const re = reDeriveTurnLaw(turn.answer, ctx);
    return {
      turnId: turn.turnId,
      reDerived: re,
      branch: "clear",
      violations,
    };
  }
  if (recorded.active !== true) violations.push("report-not-active");

  const recordedTotal = recorded.ruleA + recorded.ruleB;
  const failOpen = recorded.stripped === 0 && recordedTotal > 0;
  if (recorded.stripped !== recordedTotal && !failOpen) {
    violations.push("report-count-mismatch");
  }

  if (failOpen) {
    // The empty-result law returned the INPUT unchanged — the wire answer
    // is the pre-lint text, so re-linting it reproduces the recorded
    // counts exactly.
    const re = reDeriveTurnLaw(turn.answer, ctx);
    if (re.ruleA !== recorded.ruleA || re.ruleB !== recorded.ruleB) {
      violations.push("wire-breaks-law");
    }
    return {
      turnId: turn.turnId,
      reDerived: re,
      branch: "fail-open",
      violations,
    };
  }

  if (recordedTotal === 0) {
    // A clean serve: the wire answer re-lints all-clear.
    const re = reDeriveTurnLaw(turn.answer, ctx);
    if (re.violations > 0) violations.push("wire-breaks-law");
    return {
      turnId: turn.turnId,
      reDerived: re,
      branch: "clear",
      violations,
    };
  }

  // The strip held: the offending sentences never reached the learner —
  // the post-lint wire answer re-lints all-clear.
  const re = reDeriveTurnLaw(turn.answer, ctx);
  if (re.violations > 0) violations.push("wire-breaks-law");
  return {
    turnId: turn.turnId,
    reDerived: re,
    branch: "stripped",
    violations,
  };
}

/** Aggregate the corpus (the rubric v1 measurement). Rates are honest
 *  rationals over their own denominators; conformancePassRate is null when
 *  no eligible turn exists (a measurement over nothing is not 100%). */
export function aggregateVerdicts(
  turns: RecordedMarkedTurn[],
  verdicts: MarkedTurnVerdict[],
): ConformanceAggregate {
  const total = turns.length;
  let refusedTurns = 0;
  let streamTurns = 0;
  let eligible = 0;
  let conformancePassTurns = 0;
  let ruleATotal = 0;
  let ruleBTotal = 0;
  let stripTurns = 0;
  let failOpenTurns = 0;
  let passThroughTurns = 0;
  let violationTotal = 0;
  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    const v = verdicts[i];
    if (turn == null || v == null) continue;
    violationTotal += v.violations.length;
    if (turn.refused) refusedTurns++;
    if (turn.path === "stream") streamTurns++;
    if (turn.conformance != null) {
      eligible++;
      ruleATotal += turn.conformance.ruleA;
      ruleBTotal += turn.conformance.ruleB;
      if (turn.conformance.ruleA + turn.conformance.ruleB === 0) conformancePassTurns++;
      if (turn.conformance.stripped > 0) stripTurns++;
      if (turn.conformance.stripped === 0 && turn.conformance.ruleA + turn.conformance.ruleB > 0)
        failOpenTurns++;
      if (turn.conformance.passThrough > 0) passThroughTurns++;
    }
  }
  return {
    total,
    refusedTurns,
    streamTurns,
    eligible,
    conformancePassTurns,
    conformancePassRate: eligible === 0 ? null : conformancePassTurns / eligible,
    ruleATotal,
    ruleBTotal,
    stripTurns,
    failOpenTurns,
    passThroughTurns,
    violationTotal,
  };
}

/** Score the whole corpus (turn order preserved). */
export function scoreCorpus(corpus: MarkedTurnCorpus): {
  perTurn: MarkedTurnVerdict[];
  aggregate: ConformanceAggregate;
} {
  const perTurn = corpus.turns.map(scoreTurn);
  return { perTurn, aggregate: aggregateVerdicts(corpus.turns, perTurn) };
}

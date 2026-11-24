/**
 * The answer-quality scorer (T-TUTOR-AUDIT-P3 run-001, P3-04) — PURE,
 * provider-free. It scores recorded WIRE tutor turns through the SERVING
 * laws of record, imported VERBATIM (the no-drift discipline, P3-01's own
 * ruling: "a re-implemented law would drift; an imported one cannot"):
 *
 *   - refusal-detect.ts : modelRefusalLikely (the head-anchored detector),
 *     carriesInRangeCitation (the F4 citation-aware second signal),
 *     hasRedirectLine, REFUSAL_REDIRECT_SUFFIX (the deterministic gate)
 *   - karag.ts        : isTruncationFinish (the run-013 honest truncation
 *     disclosure law — karag's own copy, the per-module doctrine)
 *   - prompt.ts       : TUTOR_REFUSAL + paperIdentityRefusal (the
 *     deterministic refusal family whose own opener is a way forward)
 *
 * The three P3-04 dimensions of record:
 *
 *   1. CITATION SUPPORT — a serving (not refused, evidence-bearing) turn
 *      carries at least one IN-RANGE citation marker ([n]/【n】, n ∈
 *      [1..evidenceCount]). Scored with carriesInRangeCitation on the WIRE
 *      answer: the same marker shape the H2 hygiene judged, the same
 *      evidenceCount. The stored transcript is NOT scoreable here — the
 *      session store strips ALL markers at persist (conversation.ts :42-52),
 *      the wire answer is the citation archive of record.
 *
 *   2. REFUSAL CORRECTNESS — the learner-experience law the TUTOR_REFUSAL
 *      redirect + F4 gate exist to hold: a refused turn (or a turn whose
 *      head the serving detector re-derives as a refusal shape) must show a
 *      WAY FORWARD — the redirect line (hasRedirectLine), an in-range
 *      citation (F4: the cited answer is substantive), or the deterministic
 *      family's own opener ("Try naming the topic", prompt.ts :26-31 and
 *      :165-171). A bare dead end is the run-001 measured failure class
 *      (6/6 model-worded refusals ended bare — no way forward). Two more
 *      serve-time invariants are scored because the wire turn makes them
 *      checkable post-hoc: the analytics flag cannot disagree with a
 *      detector-shaped answer (refused=false + refusal shape is impossible
 *      on an honest serve — the serve path computes the flag with THIS
 *      detector on THIS head), and the F4 suppression must have held (a
 *      cited refused answer never carries the tacked-on suffix — the
 *      dominant false-positive shape the gate exists to kill).
 *
 *   3. TRUNCATION DISCLOSURE — the wire's `truncated` flag must equal
 *      isTruncationFinish(finishReason) re-derived from the recorded
 *      reason; rate = truncated/total.
 */

import {
  carriesInRangeCitation,
  hasRedirectLine,
  modelRefusalLikely,
  REFUSAL_REDIRECT_SUFFIX,
} from "../../../apps/api/src/services/tutor/refusal-detect.ts";
import { isTruncationFinish } from "../../../apps/api/src/services/tutor/karag.ts";
import {
  paperIdentityRefusal,
  TUTOR_REFUSAL,
} from "../../../apps/api/src/services/tutor/prompt.ts";
import type {
  QualityAggregate,
  RecordedTutorTurn,
  TurnCorpus,
  TurnVerdict,
} from "./types.ts";

export const LANE = "T-TUTOR-AUDIT-P3";
export const RUN = "run-001";

/** The rubric of record (bump ONLY in a same-PR re-pin conversation). */
export const RUBRIC_VERSION = "answer-quality-rubric-v1";

/** The deterministic refusal family's own way-forward opener. prompt.ts
 *  :26-31 (TUTOR_REFUSAL) and :165-171 (paperIdentityRefusal) both carry
 *  it verbatim; the selftest PINS that derivation so a serving constant
 *  that drops the opener fails the instrument, not the learner. The match
 *  is whitespace-NORMALIZED — the family copy wraps the opener across a
 *  template-literal line break ("Try naming\nthe topic"), and the serving
 *  detector applies the same normalization to heads (refusal-detect.ts
 *  :137). (courseScopeRefusal carries its own reviewed way-forward — the
 *  family is EXEMPT from the dead-end law via the wire's own `provider`
 *  discriminator below, so the opener vocabulary here stays exactly the
 *  two constants the selftest pins.) */
export const DETERMINISTIC_OPENER = "Try naming the topic";

/** The wire's own disclosure of the deterministic family: BOTH paths
 *  publish provider = "deterministic-refusal" | "deterministic-course-
 *  refusal" | "deterministic-paper-refusal" (karag :870/:877/:884 blocking,
 *  :1013/:1016/:1019 stream) — the family's way-forward copy is reviewed
 *  deterministic law, not a model-worded refusal the gate must rescue. */
export function isDeterministicFamily(provider: string | null): boolean {
  return provider != null && provider.startsWith("deterministic-");
}

/** A way forward was learner-visible on the wire answer: the redirect line
 *  (either wording of the law or the appended suffix), an in-range citation
 *  (the F4 substantive-answer signal), or the deterministic family's own
 *  opener (TUTOR_REFUSAL's wording does NOT match hasRedirectLine's
 *  vocabulary — it is still a way forward by its own law; the opener match
 *  is whitespace-normalized, the detector's own discipline). */
export function carriesWayForward(answer: string, evidenceCount: number): boolean {
  return (
    hasRedirectLine(answer) ||
    carriesInRangeCitation(answer, evidenceCount) ||
    answer.replace(/\s+/g, " ").includes(DETERMINISTIC_OPENER)
  );
}

/** Score one recorded turn through the serving laws. Pure — no I/O, no
 *  provider, no database; the verdict is a function of the turn alone. */
export function scoreTurn(turn: RecordedTutorTurn): TurnVerdict {
  const violations: string[] = [];
  const inRangeCited = carriesInRangeCitation(turn.answer, turn.evidenceCount);
  const wayForward = carriesWayForward(turn.answer, turn.evidenceCount);
  const refusalShape = modelRefusalLikely(turn.answer);
  const citationSupported = turn.refused || turn.evidenceCount <= 0
    ? null
    : inRangeCited;
  const truncationConsistent = turn.truncated === isTruncationFinish(turn.finishReason);

  // Dimension 2 — the bare-refusal dead end (the run-001 class): the event
  // of record says refused, or the answer's head is a detector-shaped
  // refusal, yet the learner sees neither a way forward nor citations. The
  // deterministic family is exempt: its way-forward copy is reviewed
  // deterministic law (disclosed on the wire by the provider field) — the
  // gate exists to rescue MODEL-worded refusals, which it appends to (or
  // suppresses for cited answers) BEFORE the wire.
  const deterministic = isDeterministicFamily(turn.provider);
  if ((turn.refused || refusalShape) && !wayForward && !deterministic) {
    violations.push("bare-refusal-dead-end");
  }
  // The analytics flag cannot disagree with a detector-shaped head: the
  // serve path computes `refused` with THIS detector on THIS head (karag
  // :905 blocking / :1115 stream) — a recorded refused=false + refusal
  // shape means the published flag lied about the wire.
  if (!turn.refused && refusalShape) {
    violations.push("refusal-flag-disagreement");
  }
  // F4 suppression held: a cited refused answer never carries the tacked-on
  // suffix (the gate's citation-aware second signal suppressed the append).
  if (
    turn.refused &&
    inRangeCited &&
    turn.answer.endsWith(REFUSAL_REDIRECT_SUFFIX)
  ) {
    violations.push("redirect-tacked-on-cited");
  }
  // Dimension 3 — the run-013 disclosure law: the wire flag equals the law
  // re-derivation from the recorded finish reason.
  if (!truncationConsistent) {
    violations.push("truncation-disclosure-mismatch");
  }

  return {
    turnId: turn.turnId,
    citationSupported,
    wayForward,
    refusalShape,
    truncationConsistent,
    violations,
  };
}

/** Aggregate the corpus (the rubric v1 measurement). Rates are honest
 *  rationals over their own denominators; citationSupportRate is null when
 *  no eligible turn exists (a measurement over nothing is not 100%). */
export function aggregateVerdicts(turns: RecordedTutorTurn[], verdicts: TurnVerdict[]): QualityAggregate {
  const total = turns.length;
  let refused = 0;
  let citationEligible = 0;
  let citationSupported = 0;
  let refusalDeadEnds = 0;
  let truncated = 0;
  let violationTotal = 0;
  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    const v = verdicts[i];
    if (turn == null || v == null) continue;
    violationTotal += v.violations.length;
    if (turn.refused) refused++;
    if (v.citationSupported != null) {
      citationEligible++;
      if (v.citationSupported) citationSupported++;
    }
    if (v.violations.includes("bare-refusal-dead-end")) refusalDeadEnds++;
    if (turn.truncated) truncated++;
  }
  return {
    total,
    refused,
    citationEligible,
    citationSupported,
    citationSupportRate: citationEligible === 0 ? null : citationSupported / citationEligible,
    refusalDeadEnds,
    refusalCorrectRate: total === 0 ? 1 : 1 - refusalDeadEnds / total,
    truncated,
    truncationRate: total === 0 ? 0 : truncated / total,
    violationTotal,
  };
}

/** Score the whole corpus (turn order preserved). */
export function scoreCorpus(corpus: TurnCorpus): { perTurn: TurnVerdict[]; aggregate: QualityAggregate } {
  const perTurn = corpus.turns.map(scoreTurn);
  return { perTurn, aggregate: aggregateVerdicts(corpus.turns, perTurn) };
}

/** Exposed ONLY for the selftest's drift-detection pins (the instrument
 *  proves the serving constants still carry the laws it scores with). */
export const servingConstants = {
  TUTOR_REFUSAL,
  paperIdentityRefusal,
  REFUSAL_REDIRECT_SUFFIX,
} as const;

// Selftest entrypoint — the anti-tautology device (GOLDEN_MASTER §5: a parity
// gate with a broken comparator is worse than no gate). Fixed vectors only:
// no corpus file, no baseline file, no network, no model, no database.
// Deterministic.
// Usage: bun run selftest.ts --selftest  (or: bun golden/answer-quality/selftest.ts)
//
// The pins below run the REAL serving laws (refusal-detect.ts, karag.ts,
// prompt.ts — imported verbatim, the no-drift discipline) against hand-derived
// verdicts, plus ILLEGAL wire shapes the committed corpus of record deliberately
// never carries (the corpus is all-legal; the violation classes need their own
// fixed vectors) — so a drifted scorer, a drifted serving law, or a serving
// constant that lost its way-forward copy cannot pass by re-deriving itself.
import {
  carriesInRangeCitation,
  hasRedirectLine,
} from "../../apps/api/src/services/tutor/refusal-detect.ts";
import { isTruncationFinish } from "../../apps/api/src/services/tutor/karag.ts";
import { paperIdentityRefusal, TUTOR_REFUSAL } from "../../apps/api/src/services/tutor/prompt.ts";
import {
  aggregateVerdicts,
  carriesWayForward,
  DETERMINISTIC_OPENER,
  scoreTurn,
  servingConstants,
} from "./lib/scorer.ts";
import type { RecordedTutorTurn, TurnVerdict } from "./lib/types.ts";

const results: Array<[string, boolean]> = [];
const check = (ok: boolean, name: string) => results.push([name, ok]);

/** A minimal recorded turn with per-field overrides. */
function turn(over: Partial<RecordedTutorTurn> & { turnId: string; answer: string }): RecordedTutorTurn {
  return {
    path: "blocking",
    query: "the scrubbed ask",
    evidenceCount: 3,
    refused: false,
    truncated: false,
    finishReason: "stop",
    model: "synthetic-model",
    provider: "synthetic-provider",
    latencyMs: 1000,
    at: "2026-01-01T00:00:00Z",
    ...over,
  };
}

const codes = (v: TurnVerdict) => v.violations;

// ── 1. the serving constants still carry the laws the scorer scores with ──
check(
  TUTOR_REFUSAL.replace(/\s+/g, " ").includes(DETERMINISTIC_OPENER),
  "the deterministic refusal of record keeps its own way-forward opener (prompt.ts :26-31, whitespace-normalized)",
);
check(
  paperIdentityRefusal("Unit B2 June 2022 Q3").replace(/\s+/g, " ").includes(DETERMINISTIC_OPENER),
  "the paper-identity refusal family keeps the same opener (prompt.ts :165-171)",
);
check(
  hasRedirectLine(servingConstants.REFUSAL_REDIRECT_SUFFIX),
  "REFUSAL_REDIRECT_SUFFIX matches hasRedirectLine's vocabulary (the append IS a way forward)",
);
check(
  servingConstants.REFUSAL_REDIRECT_SUFFIX ===
    "\n\nCould you rephrase the question, or start a new conversation on this topic?",
  "REFUSAL_REDIRECT_SUFFIX is byte-verbatim (a corpus recording of the append stays byte-exact)",
);

// ── 2. isTruncationFinish (the run-013 law, hand-derived) ──
check(isTruncationFinish("length") === true, "finish length IS a truncation");
check(isTruncationFinish("max_tokens") === true, "finish max_tokens IS a truncation");
check(isTruncationFinish("Length") === true, "finish reason normalized case-insensitively");
check(isTruncationFinish("stop") === false, "finish stop is NOT a truncation");
check(isTruncationFinish(null) === false, "null finish (deterministic classes) is NOT a truncation");
check(isTruncationFinish("content_filter") === false, "other finish vocabulary is NOT the truncation law");

// ── 3. carriesInRangeCitation (the F4 second signal, hand-derived) ──
check(carriesInRangeCitation("see [2] for the curve", 3) === true, "in-range [2] of 3 counts");
check(carriesInRangeCitation("see 【2】 for the curve", 3) === true, "the 【n】 shape counts identically");
check(carriesInRangeCitation("see [9] for the curve", 3) === false, "out-of-range [9] of 3 does NOT count");
check(carriesInRangeCitation("since [2025] the data", 5) === false, "a wide number is content, not a marker");
check(carriesInRangeCitation("no markers here", 3) === false, "no marker, no citation");
check(carriesInRangeCitation("[1]", 0) === false, "zero evidence admits NO in-range marker by construction");
check(carriesInRangeCitation("boundary [3]", 3) === true, "the boundary n == evidenceCount counts (n ∈ [1..count])");

// ── 4. carriesWayForward (the learner-experience vocabulary) ──
check(carriesWayForward("Try naming the topic, or open another course.", 0) === true, "the deterministic family's own opener is a way forward");
check(carriesWayForward("Could you rephrase the question?", 0) === true, "the redirect-line vocabulary is a way forward");
check(carriesWayForward("an in-range [1] citation", 1) === true, "an in-range citation is a way forward (F4)");
check(carriesWayForward("a bare refusal shape with nothing forward", 0) === false, "nothing forward is nothing forward");

// ── 5. scoreTurn on ILLEGAL wire shapes (the violation classes) ──
const bare = scoreTurn(turn({
  turnId: "v-bare",
  answer: "I'm sorry, but the supplied sources do not contain that derivation.",
  refused: true,
  provider: "synthetic-provider",
}));
check(codes(bare).includes("bare-refusal-dead-end"), "a refused bare dead end is THE run-001 violation");
check(codes(bare).includes("refusal-flag-disagreement") === false, "a refused turn does not double-flag the detector disagreement");

const undetected = scoreTurn(turn({
  turnId: "v-undetected",
  answer: "The supplied sources do not contain that derivation.",
  refused: false,
  provider: "synthetic-provider",
}));
check(codes(undetected).includes("refusal-flag-disagreement"), "refused=false + detector-shaped head = the published flag lied");
check(codes(undetected).includes("bare-refusal-dead-end"), "…and the learner still walked into the bare dead end");

const tacked = scoreTurn(turn({
  turnId: "v-tacked",
  answer: "The substantive correction cites [1]." + servingConstants.REFUSAL_REDIRECT_SUFFIX,
  refused: true,
  evidenceCount: 2,
  provider: "synthetic-provider",
}));
check(codes(tacked).includes("redirect-tacked-on-cited"), "the F4 false-positive shape (redirect ON a cited answer) never reaches the wire");

const mismatch = scoreTurn(turn({
  turnId: "v-mismatch",
  answer: "A plain serving answer.",
  truncated: true,
  finishReason: "stop",
}));
check(codes(mismatch).includes("truncation-disclosure-mismatch"), "truncated=true with finish stop breaks the run-013 disclosure law");

// ── 6. scoreTurn on LEGAL shapes (hand-derived clean verdicts) ──
const cited = scoreTurn(turn({
  turnId: "v-cited",
  answer: "The rate rises because of the curve shift [2].",
  evidenceCount: 3,
  refused: false,
}));
check(codes(cited).length === 0, "a cited serving answer is fully clean");
check(cited.citationSupported === true, "…and scores citation-supported");

const suppressed = scoreTurn(turn({
  turnId: "v-suppressed",
  answer: "I'm sorry, but the supplied sources do not state it; the validated material does give the neighbouring law [1].",
  refused: true,
  evidenceCount: 2,
  provider: "synthetic-provider",
}));
check(codes(suppressed).length === 0, "the F4 suppression shape (cited refusal-worded, NO suffix) is fully clean");
check(suppressed.citationSupported === null, "…and is NOT citation-eligible (refused turns leave the denominator)");

const rescued = scoreTurn(turn({
  turnId: "v-rescued",
  answer: "The supplied sources do not contain it." + servingConstants.REFUSAL_REDIRECT_SUFFIX,
  refused: true,
  evidenceCount: 4,
  provider: "synthetic-provider",
}));
check(codes(rescued).length === 0, "a gate-rescued refusal (suffix appended, no citations) is fully clean");

const deterministic = scoreTurn(turn({
  turnId: "v-deterministic",
  answer: TUTOR_REFUSAL,
  refused: true,
  evidenceCount: 0,
  finishReason: null,
  provider: "deterministic-refusal",
}));
check(codes(deterministic).length === 0, "the deterministic family (provider-disclosed) is exempt and clean");
check(deterministic.refusalShape === true, "…the detector still re-derives its shape (observability, not violation)");

const courseScope = scoreTurn(turn({
  turnId: "v-course-scope",
  answer: "I can't answer that from the validated course material yet. This chat is scoped to the course \"chemistry-a-level\".",
  refused: true,
  evidenceCount: 0,
  finishReason: null,
  provider: "deterministic-course-refusal",
}));
check(codes(courseScope).length === 0, "courseScopeRefusal's own way-forward wording is exempt via the provider discriminator");

const eligibilityNull = scoreTurn(turn({
  turnId: "v-eligibility",
  answer: "A plain serving answer.",
  refused: false,
  evidenceCount: 0,
}));
check(eligibilityNull.citationSupported === null, "zero evidence is NOT citation-eligible (nothing to cite)");

// ── 7. the aggregate (hand-derived rationals over 3 hand turns) ──
const t1 = turn({ turnId: "a1", answer: "cited [1]", evidenceCount: 1, refused: false });
const t2 = turn({ turnId: "a2", answer: "uncited prose", evidenceCount: 2, refused: false });
const t3 = turn({
  turnId: "a3",
  answer: "The supplied sources do not contain it.",
  refused: true,
  evidenceCount: 4,
  provider: "synthetic-provider",
});
const agg = aggregateVerdicts([t1, t2, t3], [scoreTurn(t1), scoreTurn(t2), scoreTurn(t3)]);
check(agg.total === 3 && agg.refused === 1, "total/refused hand-count 3/1");
check(agg.citationEligible === 2 && agg.citationSupported === 1, "eligible=2 cited=1 (refused leaves the denominator)");
check(agg.citationSupportRate === 0.5, "citationSupportRate = 1/2 (hand rational)");
check(agg.refusalDeadEnds === 1 && Math.abs(agg.refusalCorrectRate - 2 / 3) < 1e-12, "one dead end of three turns: rate ≈ 2/3 (hand rational, fp-tolerant)");
check(agg.truncated === 0 && agg.truncationRate === 0, "no truncation in the hand set");
check(agg.violationTotal === 1, "hand violation count: the refused dead end carries dead-end alone (the flag agrees)");

// ── verdict ──
let fails = 0;
for (const [name, ok] of results) {
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${name}`);
  if (!ok) fails++;
}
console.log(fails === 0 ? "selftest: ALL PASS" : `selftest: ${fails} FAIL`);
if (fails > 0) process.exit(1);

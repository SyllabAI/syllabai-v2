// Selftest entrypoint — the anti-tautology device (GOLDEN_MASTER §5: a parity
// gate with a broken comparator is worse than no gate). Fixed vectors only:
// no corpus file, no baseline file, no network, no model, no database.
// Deterministic.
// Usage: bun run selftest.ts --selftest  (or: bun golden/conformance-trend/selftest.ts)
//
// The pins below run the REAL serving DC-5 law (mark-conformance.ts +
// mark-context.ts — imported verbatim, the no-drift discipline) against
// hand-derived verdicts, plus ILLEGAL wire shapes the committed corpus of
// record deliberately never carries (the corpus is all-legal; the lane
// violation classes need their own fixed vectors) — so a drifted scorer, a
// drifted serving law, or a lint that lost its posture cannot pass by
// re-deriving itself.
import {
  conformanceReport,
  lintMarkedPartTurn,
  lintSentence,
  MarkConformanceStreamSanitizer,
} from "../../apps/api/src/services/tutor/mark-conformance.ts";
import type { MarkContext, MarkContextPoint } from "../../apps/api/src/services/tutor/mark-context.ts";
import {
  aggregateVerdicts,
  scoreTurn,
} from "./lib/scorer.ts";
import type { MarkedTurnVerdict, RecordedMarkedTurn } from "./lib/types.ts";

const results: Array<[string, boolean]> = [];
const check = (ok: boolean, name: string) => results.push([name, ok]);

/** A minimal scrubbed scheme row with per-field overrides. */
function point(over: Partial<MarkContextPoint> & { ref: string; text: string }): MarkContextPoint {
  return { marks: 1, awarded: true, marksAwarded: 1, ...over };
}

/** A minimal MarkContext with per-field overrides. */
function ctx(over: Partial<MarkContext> & { points: MarkContextPoint[] }): MarkContext {
  return {
    paperLabel: "the scrubbed paper",
    questionNumber: "1",
    partLabel: "(a)",
    answerText: "the scrubbed learner submission",
    totalAwarded: 0,
    totalPossible: over.points.length,
    ...over,
  };
}

/** A minimal recorded turn with per-field overrides. */
function turn(over: Partial<RecordedMarkedTurn> & { turnId: string; answer: string }): RecordedMarkedTurn {
  return {
    path: "blocking",
    query: "the scrubbed ask",
    markContext: ctx({
      points: [point({ ref: "1-a-i", text: "the scheme line", alternatives: ["the alternative row"] })],
    }),
    refused: false,
    conformance: { active: true, stripped: 0, ruleA: 0, ruleB: 0, passThrough: 0 },
    truncated: false,
    finishReason: "stop",
    model: "synthetic-model",
    provider: "synthetic-provider",
    latencyMs: 1000,
    at: "2026-01-01T00:00:00Z",
    ...over,
  };
}

const codes = (v: MarkedTurnVerdict) => v.violations;

// ── 1. the serving DC-5 law's own behavior (hand-derived, the REAL law) ──
{
  const unknown = ctx({ points: [point({ ref: "1-a-i", text: "the scheme line" })] });
  const linted = lintMarkedPartTurn("You missed point 9 entirely.", unknown);
  check(
    linted.violations.length === 1 &&
      linted.violations[0]?.rule === "A" &&
      linted.violations[0]?.kind === "unknown-point",
    "Rule A fires on a claimed-missed point the scheme rows do not carry (kind unknown-point)",
  );
  check(
    linted.stripped === 0 && linted.text === "You missed point 9 entirely.",
    "the turn-level FAIL-OPEN returns the input unchanged (stripped 0, violations logged)",
  );
  const proj = conformanceReport(linted);
  check(
    proj.active === true && proj.stripped === 0 && proj.ruleA === 1 && proj.ruleB === 0 && proj.passThrough === 0,
    "the telemetry projection of record (active/stripped/ruleA/ruleB/passThrough) rides the fail-open shape",
  );

  const two = lintMarkedPartTurn(
    "The first sentence is legitimate explanation. You missed point 9 entirely.",
    unknown,
  );
  check(
    two.stripped === 1 && two.text === "The first sentence is legitimate explanation.",
    "sentence-granular strip: only the offending sentence is removed (the kept join law)",
  );

  const surfaced = ctx({
    points: [
      point({ ref: "1", text: "the awarded line", awarded: true }),
      point({ ref: "2", text: "solution turns orange", awarded: false, marksAwarded: 0, alternatives: ["an orange-brown colour forms"] }),
    ],
  });
  const ruleB = lintMarkedPartTurn(
    "The observation would also score \"iodine crystals form\" in the tube.",
    surfaced,
  );
  check(
    ruleB.violations.length === 1 &&
      ruleB.violations[0]?.rule === "B" &&
      ruleB.violations[0]?.kind === "out-of-set-alternative",
    "Rule B fires on an out-of-set quoted alternative offer (the quoted-span priority)",
  );

  const inSet = lintMarkedPartTurn(
    "The scheme would also score \"solution turns orange\" in the tube.",
    surfaced,
  );
  check(inSet.violations.length === 0, "an IN-SET quoted offer passes (the membership law is generous to scheme quotes)");

  const numeric = lintMarkedPartTurn(
    "The yield would also score 67 % with the fuller method.",
    ctx({
      points: [point({ ref: "2-b", text: "the percentage yield value", awarded: false, marksAwarded: 0, numericValues: ["66 %"] })],
    }),
  );
  check(
    numeric.violations.length === 1 && numeric.violations[0]?.kind === "out-of-set-numeric",
    "the NUMERIC surface fires Rule B with kind out-of-set-numeric (the % unit vocabulary)",
  );

  const furniture = lintMarkedPartTurn(
    "Also acceptable: valid.",
    ctx({
      points: [point({ ref: "2-b", text: "the percentage yield value", awarded: false, marksAwarded: 0, numericValues: ["66 %"] })],
    }),
  );
  check(furniture.violations.length === 0, "a sub-MIN_SUBSTRING candidate is furniture — precision-first, never strip");

  const echo = lintMarkedPartTurn(
    "You wrote \"iodine crystals form\" and that would also be acceptable.",
    surfaced,
  );
  check(echo.violations.length === 0, "the LEARNER-ECHO pass: the learner's own answer is confirmed, never stripped");

  const unsurfaced = ctx({
    points: [point({ ref: "1-a-ii", text: "oxygen gains two electrons", awarded: false, marksAwarded: 0 })],
  });
  const ptRefs: string[] = [];
  const dropped = lintSentence(
    "An alternative answer would be \"magnesium is the reducing agent\" here.",
    unsurfaced.points.map((p) => ({
      ref: p.ref,
      normRef: p.ref.toLowerCase(),
      textNorm: p.text.toLowerCase(),
      membersNorm: [p.text.toLowerCase()],
      hasSurface: false,
      awarded: p.awarded,
    })),
    ptRefs,
  );
  check(
    dropped == null && ptRefs.includes("1-a-ii"),
    "the R-DC5-4 pass-through: a point without a materialised surface logs the ref, never strips",
  );

  const tail = ctx({
    points: [point({ ref: "2", text: "the shielding explanation", awarded: true })],
  });
  const tailLint = lintMarkedPartTurn("You missed point 2 in your explanation.", tail);
  check(
    tailLint.violations.length === 0,
    "the tail-match law: \"point 2\" names the ref whose tail segment is 2 — existence proven, Rule A silent",
  );

  const streamOut = (() => {
    const w = new MarkConformanceStreamSanitizer(surfaced);
    let out = "";
    out += w.push("Chlorine displaces bromine from the solution.");
    out += w.push("The observation would also score \"iodine crystals form\" in the tube.");
    out += w.push("The displacement order decreases down the group.");
    out += w.flush();
    return out;
  })();
  check(
    streamOut.includes("displaces bromine") && streamOut.includes("displacement order") &&
      !streamOut.includes("iodine crystals"),
    "the stream wrapper HOLDS the violating sentence back (per-sentence decisions are final)",
  );
}

// ── 2. the scorer's decision tree on ILLEGAL shapes (the lane classes) ──
{
  const scheme = ctx({
    points: [
      point({ ref: "1-a-i", text: "the scheme line", awarded: true }),
      point({ ref: "2-b", text: "solution turns orange", awarded: false, marksAwarded: 0, alternatives: ["an orange colour appears"] }),
    ],
  });

  // report-count-mismatch: stripped does not equal ruleA+ruleB, not a fail-open
  const mismatch = scoreTurn(turn({
    turnId: "v-mismatch",
    answer: "A clean wire answer.",
    markContext: scheme,
    conformance: { active: true, stripped: 2, ruleA: 1, ruleB: 0, passThrough: 0 },
  }));
  check(codes(mismatch).includes("report-count-mismatch"), "stripped ≠ ruleA+ruleB outside the fail-open shape is RED");

  // report-not-active: the lint activated on a serving marked-part turn — active must be true
  const inactive = scoreTurn(turn({
    turnId: "v-inactive",
    answer: "A clean wire answer.",
    markContext: scheme,
    conformance: { active: false, stripped: 0, ruleA: 0, ruleB: 0, passThrough: 0 },
  }));
  check(codes(inactive).includes("report-not-active"), "a report claiming active=false on a serving marked-part turn is RED");
  const absentReport = scoreTurn(turn({
    turnId: "v-absent",
    answer: "A clean wire answer.",
    markContext: scheme,
    conformance: null,
  }));
  check(codes(absentReport).includes("report-not-active"), "a blocking serving turn with NO report is RED (the surface of record publishes)");

  // refusal-report-present: the lint never activates on a refusal
  const refusedReported = scoreTurn(turn({
    turnId: "v-refused-reported",
    answer: "the deterministic refusal",
    refused: true,
    conformance: { active: true, stripped: 0, ruleA: 0, ruleB: 0, passThrough: 0 },
  }));
  check(codes(refusedReported).includes("refusal-report-present"), "a refused turn carrying a conformance report is RED");

  // stream-report-present: no report is published on the stream event today
  const streamReported = scoreTurn(turn({
    turnId: "v-stream-reported",
    answer: "A clean stream wire answer.",
    path: "stream",
    conformance: { active: true, stripped: 0, ruleA: 0, ruleB: 0, passThrough: 0 },
  }));
  check(codes(streamReported).includes("stream-report-present"), "a stream turn carrying a conformance report is RED (the karag :1130-1146 posture)");

  // wire-breaks-law (strip did not hold): the wire answer still trips the law
  const notHeld = scoreTurn(turn({
    turnId: "v-not-held",
    answer: "You missed point 9 entirely.",
    markContext: ctx({ points: [point({ ref: "1-a-i", text: "the scheme line" })] }),
    conformance: { active: true, stripped: 1, ruleA: 1, ruleB: 0, passThrough: 0 },
  }));
  check(codes(notHeld).includes("wire-breaks-law"), "a recorded strip that did NOT hold on the wire answer is RED");

  // wire-breaks-law (fail-open not reproduced): the recorded counts disagree with the re-derivation
  const notReproduced = scoreTurn(turn({
    turnId: "v-not-reproduced",
    answer: "A clean wire answer.",
    markContext: scheme,
    conformance: { active: true, stripped: 0, ruleA: 1, ruleB: 0, passThrough: 0 },
  }));
  check(codes(notReproduced).includes("wire-breaks-law"), "a fail-open report whose counts the wire answer does not reproduce is RED");

  // stream wire-breaks-law: the per-sentence law re-derivation on the wire
  const streamBreaks = scoreTurn(turn({
    turnId: "v-stream-breaks",
    answer: "The observation would also score \"iodine crystals form\" in the tube.",
    path: "stream",
    markContext: scheme,
    conformance: null,
  }));
  check(codes(streamBreaks).includes("wire-breaks-law"), "a stream wire answer that trips the per-sentence law is RED");

  // ── 3. LEGAL shapes re-derive clean (hand-derived verdicts) ──
  const clean = scoreTurn(turn({
    turnId: "v-clean",
    answer: "A clean wire answer.",
    markContext: scheme,
    conformance: { active: true, stripped: 0, ruleA: 0, ruleB: 0, passThrough: 0 },
  }));
  check(codes(clean).length === 0 && clean.branch === "clear", "a clean serve re-derives all-clear in the clear branch");

  const stripped = scoreTurn(turn({
    turnId: "v-stripped",
    answer: "The first sentence is legitimate explanation.",
    markContext: ctx({ points: [point({ ref: "1-a-i", text: "the scheme line" })] }),
    conformance: { active: true, stripped: 1, ruleA: 1, ruleB: 0, passThrough: 0 },
  }));
  check(codes(stripped).length === 0 && stripped.branch === "stripped", "a held strip re-derives all-clear in the stripped branch (the wire obeys the law)");

  const failOpen = scoreTurn(turn({
    turnId: "v-fail-open",
    answer: "You missed point 9 entirely.",
    markContext: ctx({ points: [point({ ref: "1-a-i", text: "the scheme line" })] }),
    conformance: { active: true, stripped: 0, ruleA: 1, ruleB: 0, passThrough: 0 },
  }));
  check(codes(failOpen).length === 0 && failOpen.branch === "fail-open", "the fail-open branch reproduces the recorded counts from the unchanged wire answer");

  const refused = scoreTurn(turn({
    turnId: "v-refused",
    answer: "the deterministic refusal",
    refused: true,
    conformance: null,
  }));
  check(codes(refused).length === 0 && refused.branch === "refusal", "the refusal posture (null report) is legal");

  const stream = scoreTurn(turn({
    turnId: "v-stream",
    answer: "Chlorine displaces bromine from the solution. ",
    path: "stream",
    conformance: null,
  }));
  check(codes(stream).length === 0 && stream.branch === "stream", "the stream posture (null report, law-obeying wire) is legal");
}

// ── 4. the aggregate (hand-derived over a 5-turn hand set) ──
{
  const scheme = ctx({ points: [point({ ref: "1-a-i", text: "the scheme line" })] });
  const t1 = turn({ turnId: "a1", answer: "clean", markContext: scheme, conformance: { active: true, stripped: 0, ruleA: 0, ruleB: 0, passThrough: 0 } });
  const t2 = turn({ turnId: "a2", answer: "the refusal", refused: true, conformance: null });
  const t3 = turn({ turnId: "a3", answer: "stream text. ", path: "stream", conformance: null });
  const t4 = turn({ turnId: "a4", answer: "kept only.", markContext: scheme, conformance: { active: true, stripped: 1, ruleA: 1, ruleB: 0, passThrough: 0 } });
  const t5 = turn({ turnId: "a5", answer: "You missed point 9 entirely.", markContext: scheme, conformance: { active: true, stripped: 0, ruleA: 1, ruleB: 0, passThrough: 0 } });
  const hand = [t1, t2, t3, t4, t5];
  const agg = aggregateVerdicts(hand, hand.map(scoreTurn));
  check(agg.total === 5 && agg.refusedTurns === 1 && agg.streamTurns === 1, "total/refused/stream hand-count 5/1/1");
  check(agg.eligible === 3 && agg.conformancePassTurns === 1, "eligible = the report-bearing surface (3); pass = the all-zero reports (1)");
  check(agg.conformancePassRate === 1 / 3, "conformancePassRate = 1/3 (hand rational)");
  check(agg.ruleATotal === 2 && agg.ruleBTotal === 0, "ruleA/ruleB hand-count 2/0");
  check(agg.stripTurns === 1 && agg.failOpenTurns === 1 && agg.passThroughTurns === 0, "strip/failOpen/passThrough hand-count 1/1/0");
  check(agg.violationTotal === 0, "the hand set is all-legal (zero lane violations)");
}

// ── verdict ──
let fails = 0;
for (const [name, ok] of results) {
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${name}`);
  if (!ok) fails++;
}
console.log(fails === 0 ? "selftest: ALL PASS" : `selftest: ${fails} FAIL`);
if (fails > 0) process.exit(1);

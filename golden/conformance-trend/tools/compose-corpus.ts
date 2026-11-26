/**
 * The corpus composer (T-TUTOR-AUDIT-P4 run-001) — the AUTHORING tool of
 * record for fixtures/marked-turns-v1.json. NOT run by CI: the corpus is a
 * committed file; this tool is how it was composed, re-runnable for the
 * first LIVE capture.
 *
 * ZERO HAND-COPYING: the wire answers and the recorded conformance reports
 * are the SERVING DC-5 LAW'S OWN OUTPUTS — the composer runs the real
 * lintMarkedPartTurn / MarkConformanceStreamSanitizer / conformanceReport
 * over hand-built scrubbed pre-lint texts + scheme rows and records the
 * results verbatim (the run-001 capture posture, synthetic scrubbed
 * chemistry copy, no PII — the deterministic refusal text is imported from
 * prompt.ts VERBATIM). The first LIVE capture (real recorded wire turns,
 * human-reviewed before commit — the llm-shadow doctrine) replaces this
 * corpus and re-pins the baseline deliberately.
 *
 * Usage: bun golden/conformance-trend/tools/compose-corpus.ts
 *   → rewrites golden/conformance-trend/fixtures/marked-turns-v1.json
 */

import { writeFileSync } from "node:fs";

import { TUTOR_REFUSAL } from "../../../apps/api/src/services/tutor/prompt.ts";
import {
  conformanceReport,
  lintMarkedPartTurn,
  MarkConformanceStreamSanitizer,
} from "../../../apps/api/src/services/tutor/mark-conformance.ts";
import type { MarkContext, MarkContextPoint } from "../../../apps/api/src/services/tutor/mark-context.ts";
import type { RecordedMarkedTurn } from "../lib/types.ts";

/** A scrubbed scheme row (the mark_points + mark_point_alternatives rows of
 *  record, verbatim shape). */
function point(over: Partial<MarkContextPoint> & { ref: string; text: string }): MarkContextPoint {
  return {
    marks: 1,
    awarded: true,
    marksAwarded: 1,
    ...over,
  };
}

/** A scrubbed MarkContext (the resolved scheme of record). */
function context(over: Partial<MarkContext> & { points: MarkContextPoint[] }): MarkContext {
  return {
    paperLabel: "IGCSE Chemistry Paper 1B June 2024",
    questionNumber: "3",
    partLabel: "(b)",
    answerText: "the scrubbed learner submission",
    totalAwarded: over.points.filter((p) => p.awarded).length,
    totalPossible: over.points.length,
    ...over,
  };
}

/** The blocking compose: run the REAL law, record its outputs verbatim. */
function blockingTurn(
  base: Omit<RecordedMarkedTurn, "answer" | "conformance" | "path" | "markContext">,
  preLint: string,
  ctx: MarkContext,
): RecordedMarkedTurn {
  const linted = lintMarkedPartTurn(preLint, ctx);
  const report = conformanceReport(linted);
  return { ...base, markContext: ctx, path: "blocking", answer: linted.text, conformance: report };
}

/** The stream compose: the sentence-buffered wrapper's own output, one
 *  delta per complete sentence (the real stream's sentence cadence), the
 *  report ABSENT (no conformance field is published on the stream event —
 *  karag :1130-1146). */
function streamTurn(
  base: Omit<RecordedMarkedTurn, "answer" | "conformance" | "path" | "markContext">,
  sentences: string[],
  ctx: MarkContext,
): RecordedMarkedTurn {
  const wrapper = new MarkConformanceStreamSanitizer(ctx);
  let out = "";
  for (const s of sentences) out += wrapper.push(s);
  out += wrapper.flush();
  return { ...base, markContext: ctx, path: "stream", answer: out, conformance: null };
}

const META = {
  model: "llama-3.3-70b-versatile",
  provider: "groq",
  finishReason: "stop",
  truncated: false,
} as const;

const turns: RecordedMarkedTurn[] = [];

// ── ct01 — the clean serve: no grammar fires, the report is all zeros ──
{
  const ctx = context({
    points: [
      point({ ref: "1-a-i", text: "particles gain kinetic energy" }),
      point({ ref: "1-a-ii", text: "collisions become more frequent", alternatives: ["more collisions per second"] }),
    ],
  });
  turns.push(
    blockingTurn(
      { turnId: "cft-v1-t01", query: "Why does heating increase the rate of reaction?", refused: false, ...META, latencyMs: 1712, at: "2026-11-20T10:00:00Z" },
      "Heating raises the average kinetic energy of the particles, so more collisions exceed the activation energy. The steeper gradient at the start of the curve gives the faster initial rate.",
      ctx,
    ),
  );
}

// ── ct02 — Rule A fires: a claimed-missed point that is NOT in the scheme
//    rows ("point 9" — no ref's tail is "9"); the offending sentence is
//    STRIPPED from the wire answer ──
{
  const ctx = context({
    points: [
      point({ ref: "1-a-i", text: "larger molecules" }),
      point({ ref: "2-b", text: "more intermolecular forces to overcome" }),
    ],
  });
  turns.push(
    blockingTurn(
      { turnId: "cft-v1-t02", query: "Explain the melting point trend down group 7.", refused: false, ...META, latencyMs: 1588, at: "2026-11-20T10:04:00Z" },
      "The melting point increases down group 7 because the molecules become larger with more electrons. You missed point 9 about the bonding type.",
      ctx,
    ),
  );
}

// ── ct03 — Rule B fires: an offered alternative OUTSIDE the materialised
//    set (quoted span); the sentence is STRIPPED ──
{
  const ctx = context({
    points: [
      point({ ref: "1-a-i", text: "chlorine displaces iodine", awarded: true }),
      point({
        ref: "3-c",
        text: "solution turns orange",
        awarded: false,
        marksAwarded: 0,
        alternatives: ["bromine is displaced by chlorine"],
      }),
    ],
  });
  turns.push(
    blockingTurn(
      { turnId: "cft-v1-t03", query: "What happens when chlorine water is added to potassium iodide?", refused: false, ...META, latencyMs: 1663, at: "2026-11-20T10:08:00Z" },
      "Chlorine is more reactive, so it displaces iodine from the solution. A full answer would also score \"damp red litmus turns blue\" on the observation.",
      ctx,
    ),
  );
}

// ── ct04 — Rule B fires on the NUMERIC surface: an out-of-set value+unit
//    offer; the sentence is STRIPPED ──
{
  const ctx = context({
    points: [
      point({ ref: "2-a", text: "the theoretical yield calculation", awarded: true }),
      point({
        ref: "2-b",
        text: "the percentage yield value",
        awarded: false,
        marksAwarded: 0,
        numericValues: ["66 %"],
      }),
    ],
  });
  turns.push(
    blockingTurn(
      { turnId: "cft-v1-t04", query: "How do I calculate the percentage yield?", refused: false, ...META, latencyMs: 1741, at: "2026-11-20T10:12:00Z" },
      "Divide the actual mass by the theoretical mass and multiply by one hundred. The yield would also score 67 % with the fuller method.",
      ctx,
    ),
  );
}

// ── ct05 — Rule B PASSES THROUGH: the offer associates with a point whose
//    surface is not materialised (no alternatives/numeric rows — the
//    R-DC5-4 honest telemetry); nothing is stripped, passThrough = 1 ──
{
  const ctx = context({
    points: [
      point({ ref: "1-a-i", text: "magnesium loses two electrons", awarded: true }),
      point({ ref: "1-a-ii", text: "oxygen gains two electrons", awarded: false, marksAwarded: 0 }),
    ],
  });
  turns.push(
    blockingTurn(
      { turnId: "cft-v1-t05", query: "Describe the redox change when magnesium burns.", refused: false, ...META, latencyMs: 1527, at: "2026-11-20T10:16:00Z" },
      "Magnesium is oxidised and oxygen is reduced in the reaction. An alternative answer would be \"magnesium is the reducing agent\" here.",
      ctx,
    ),
  );
}

// ── ct06 — the LEARNER-ECHO pass-through: the offer quotes the learner's
//    own answer being confirmed — never stripped (precision-first) ──
{
  const ctx = context({
    points: [
      point({ ref: "1-b", text: "chlorine is displaced", awarded: false, marksAwarded: 0, alternatives: ["the solution decolourises"] }),
    ],
  });
  turns.push(
    blockingTurn(
      { turnId: "cft-v1-t06", query: "Did I get the displacement observation right?", refused: false, ...META, latencyMs: 1494, at: "2026-11-20T10:20:00Z" },
      "You wrote \"chlorine is displaced\" and that reading of the observation is the right shape for this part.",
      ctx,
    ),
  );
}

// ── ct07 — the TURN-LEVEL FAIL-OPEN: one sentence, it violates Rule A, the
//    kept list empties and the law returns the INPUT unchanged (stripped = 0,
//    the violations stay logged — the stem-hygiene law) ──
{
  const ctx = context({
    points: [point({ ref: "1-a-i", text: "the precipitate dissolves in excess ammonia" })],
  });
  turns.push(
    blockingTurn(
      { turnId: "cft-v1-t07", query: "What did I miss on the silver halide test?", refused: false, ...META, latencyMs: 1381, at: "2026-11-20T10:24:00Z" },
      "You missed point 9 entirely.",
      ctx,
    ),
  );
}

// ── ct08 — the STREAM posture: the per-sentence wrapper HOLDS the violating
//    sentence back (per-sentence decisions are final) and NO report is
//    published on the stream event (conformance null, karag :1130-1146) ──
{
  const ctx = context({
    points: [
      point({ ref: "1-a-i", text: "chlorine displaces bromine", awarded: true }),
      point({
        ref: "1-a-ii",
        text: "the solution turns orange",
        awarded: false,
        marksAwarded: 0,
        alternatives: ["an orange-brown colour forms"],
      }),
    ],
  });
  turns.push(
    streamTurn(
      { turnId: "cft-v1-t08", query: "What happens when chlorine water reacts with potassium bromide?", refused: false, ...META, latencyMs: 2216, at: "2026-11-20T10:28:00Z" },
      [
        "Chlorine displaces bromine from the solution.",
        "The observation would also score \"iodine crystals form\" in the tube.",
        "The displacement order decreases down the group.",
      ],
      ctx,
    ),
  );
}

// ── ct09 — the REFUSAL posture: the deterministic refusal is generated
//    BEFORE the lint seam — conformance null (karag :254-256, :865-886);
//    the refusal text is prompt.ts's TUTOR_REFUSAL VERBATIM ──
turns.push({
  turnId: "cft-v1-t09",
  path: "blocking",
  query: "Work through question 3(b) for me.",
  markContext: context({
    points: [point({ ref: "2-a", text: "state the trend in first ionisation energy" })],
  }),
  answer: TUTOR_REFUSAL,
  refused: true,
  conformance: null,
  truncated: false,
  finishReason: null,
  model: null,
  provider: "deterministic-refusal",
  latencyMs: 11,
  at: "2026-11-20T10:32:00Z",
});

// ── ct10 — the MULTI-VIOLATION turn: one Rule A + one Rule B, BOTH
//    stripped (stripped = ruleA + ruleB = 2) ──
{
  const ctx = context({
    points: [
      point({ ref: "1-a-i", text: "the graph axes labelled with units", awarded: true }),
      point({ ref: "1-a-ii", text: "a single smooth curve drawn", awarded: true }),
      point({
        ref: "2-b",
        text: "bromine turns the solution orange",
        awarded: false,
        marksAwarded: 0,
        alternatives: ["an orange colour appears"],
      }),
    ],
  });
  turns.push(
    blockingTurn(
      { turnId: "cft-v1-t10", query: "Mark my displacement graph and observation.", refused: false, ...META, latencyMs: 1904, at: "2026-11-20T10:36:00Z" },
      "The axes and curve are the right shape for the plotted data. You did not earn point 3 for the graph. An acceptable alternative would be \"bromine crystals form\" for the observation.",
      ctx,
    ),
  );
}

// ── ct11 — Rule B passes on an IN-SET quoted offer (substring membership on
//    the canonical form — generous to legitimate scheme quotes; the point's
//    surface IS materialised, so the membership law runs and passes) ──
{
  const ctx = context({
    points: [
      point({
        ref: "1-a-i",
        text: "White precipitate forms with silver nitrate.",
        awarded: false,
        marksAwarded: 0,
        alternatives: ["a white precipitate insoluble in acid"],
      }),
    ],
  });
  turns.push(
    blockingTurn(
      { turnId: "cft-v1-t11", query: "What is the halide test result for chloride?", refused: false, ...META, latencyMs: 1615, at: "2026-11-20T10:40:00Z" },
      "The nitrate acidifier rules out carbonate fizzes first. The scheme would also score \"white precipitate\" for the halide test.",
      ctx,
    ),
  );
}

// ── ct12 — the TAIL-MATCH law: "point 2" names the ref whose tail segment
//    is "2" (in-set — existence proven, Rule A does not fire) ──
{
  const ctx = context({
    points: [
      point({ ref: "1-a-i", text: "the trend stated with a comparison", awarded: true }),
      point({ ref: "2", text: "the shielding explanation", awarded: true }),
    ],
  });
  turns.push(
    blockingTurn(
      { turnId: "cft-v1-t12", query: "Explain the first ionisation energy trend.", refused: false, ...META, latencyMs: 1577, at: "2026-11-20T10:44:00Z" },
      "The first ionisation energy decreases down the group as shielding grows. You missed point 2 in your explanation of the trend.",
      ctx,
    ),
  );
}

const corpus = {
  schema: "conformance-trend-turns/v1",
  notes:
    "Run-001 capture posture: SYNTHETIC, SCRUBBED wire marked-part turns (no PII). The wire answers and the recorded conformance reports are the SERVING DC-5 LAW'S OWN OUTPUTS (tools/compose-corpus.ts runs lintMarkedPartTurn / MarkConformanceStreamSanitizer / conformanceReport verbatim — zero hand-copying); the deterministic refusal text is prompt.ts TUTOR_REFUSAL verbatim; all other prose is synthetic scrubbed chemistry marking copy. Shapes cover: clean serves, Rule A strips, Rule B alternative/numeric strips, the R-DC5-4 pass-through, the learner-echo pass, the turn-level fail-open, the stream hold-back posture (no report published), the refusal posture (conformance null), multi-violation turns, in-set quoted offers, and the tail-match law. The first LIVE capture replaces this corpus and re-pins the baseline deliberately.",
  turns,
};

const out = new URL("../fixtures/marked-turns-v1.json", import.meta.url).pathname;
writeFileSync(out, JSON.stringify(corpus, null, 2) + "\n");
console.log(`corpus of record composed: ${out} (${turns.length} turns)`);

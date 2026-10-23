/**
 * DC-5 conformance lint tests — the spec §3.5 acceptance pins over the
 * lint of record (prereg docs/DC5-CONFORMANCE-LINT-PLAN.md §4.4/§5):
 *   (a) Membership pin — a synthetic tutor turn that offers an alternative
 *       absent from the set is caught by the lint;
 *   (b) Parity pin — marker wording (the scheme lines) and tutor remediation
 *       both reference only materialised rows;
 *   (c) Drift pin — pinned at the consume seam (mark-context-dc5.test.ts:
 *       the loader reads the LATEST scheme's rows; the set flips atomically).
 * The strip precedents are pinned too: the citation-marker posture (violations
 * stripped + reported, never silent) and the stem-hygiene fail-open law.
 */
import { describe, expect, test } from "bun:test";
import {
  MarkConformanceStreamSanitizer,
  conformanceReport,
  lintMarkedPartTurn,
} from "../../src/services/tutor/mark-conformance";
import type { MarkContext } from "../../src/services/tutor/mark-context";

/** The synthetic marked part of record: two points, one missed, the missed
 *  point carries a materialised surface (the alternatives + numeric values
 *  the ingestion of record would have extracted from its scheme text). */
function markContext(overrides?: Partial<MarkContext>): MarkContext {
  return {
    paperLabel: "4CH1/1C June 2022",
    questionNumber: "1",
    partLabel: "c",
    answerText: "The cell is bigger.",
    points: [
      { ref: "1-c-i", text: "correctly states the effect on rate", marks: 1, awarded: true, marksAwarded: 1 },
      {
        ref: "1-c-ii",
        text: "explains in terms of collision frequency",
        marks: 1,
        awarded: false,
        marksAwarded: 0,
        alternatives: ["greater surface area increases collisions"],
        numericValues: ["0.5 nm", "between 200 and 400 nm"],
      },
    ],
    totalAwarded: 1,
    totalPossible: 2,
    ...overrides,
  };
}

describe("DC-5 acceptance (a) — the membership pin", () => {
  test("a synthetic tutor turn offering an out-of-set alternative is CAUGHT and stripped", () => {
    const turn =
      "You missed the second marking point. An alternative answer would be the chloroplast membrane folded over, which would also score.";
    const result = lintMarkedPartTurn(turn, markContext());
    expect(result.stripped).toBe(1);
    expect(result.violations.length).toBe(1);
    expect(result.violations[0]!.rule).toBe("B");
    expect(result.violations[0]!.kind).toBe("out-of-set-alternative");
    expect(result.violations[0]!.ref).toBe("1-c-ii");
    expect(result.text).toBe("You missed the second marking point.");
    // the report never carries learner text beyond a bounded excerpt
    expect(result.violations[0]!.excerpt.length).toBeLessThanOrEqual(120);
  });

  test("an in-set alternative (the materialised row verbatim) passes untouched", () => {
    const turn =
      "You missed the collision frequency point. The scheme also accepts greater surface area increases collisions.";
    const result = lintMarkedPartTurn(turn, markContext());
    expect(result.stripped).toBe(0);
    expect(result.violations.length).toBe(0);
    expect(result.text).toBe(turn);
  });

  test("a quote of the scheme line itself (marker wording) passes — parity (b) tutor half", () => {
    const turn =
      "You missed the point on collision frequency — the scheme line is explains in terms of collision frequency.";
    const result = lintMarkedPartTurn(turn, markContext());
    expect(result.stripped).toBe(0);
  });

  test("an out-of-set NUMERIC offer is caught with the numeric kind", () => {
    const turn =
      "You missed the second point. A resolution of about 0.4 nm would also score here.";
    const result = lintMarkedPartTurn(turn, markContext());
    expect(result.stripped).toBe(1);
    expect(result.violations[0]!.rule).toBe("B");
    expect(result.violations[0]!.kind).toBe("out-of-set-numeric");
  });

  test("the materialised numeric row verbatim passes", () => {
    const turn =
      "You missed the second point; the scheme values 0.5 nm as an acceptable figure.";
    const result = lintMarkedPartTurn(turn, markContext());
    expect(result.stripped).toBe(0);
  });
});

describe("DC-5 Rule A — a claimed-missed point must exist in the scheme rows", () => {
  test("a hallucinated point identifier is stripped", () => {
    const turn =
      "You missed marking point 9 in your answer, which cost you the mark. The rest of your method was fine.";
    const result = lintMarkedPartTurn(turn, markContext());
    expect(result.stripped).toBe(1);
    expect(result.violations[0]!.rule).toBe("A");
    expect(result.violations[0]!.kind).toBe("unknown-point");
    expect(result.text).toBe("The rest of your method was fine.");
  });

  test("a real point ref named in a miss-claim passes (existence proven)", () => {
    const turn = "You missed marking point 1-c-ii here.";
    const result = lintMarkedPartTurn(turn, markContext());
    expect(result.stripped).toBe(0);
  });

  test("the trailing-segment law: point 2 matches 1-c-ii's tail", () => {
    const turn = "Point 2 was not awarded because the explanation was missing.";
    const result = lintMarkedPartTurn(turn, markContext());
    expect(result.stripped).toBe(0);
  });

  test("no point mention in a miss-claim → nothing to check, no strip", () => {
    const result = lintMarkedPartTurn("Your explanation was missing the key idea.", markContext());
    expect(result.stripped).toBe(0);
  });
});

describe("DC-5 activation + pass-through laws (prereg R-DC5-4)", () => {
  test("a point WITHOUT a materialised surface passes through and is LOGGED, never stripped", () => {
    const ctx = markContext();
    const bare = { ...ctx.points[0]!, alternatives: undefined, numericValues: undefined };
    ctx.points = [bare, ctx.points[1]!];
    const turn =
      "You missed marking point 1-c-i; alternatively, greater surface area increases collisions.";
    const result = lintMarkedPartTurn(turn, ctx);
    expect(result.stripped).toBe(0);
    expect(result.passThroughRefs).toContain("1-c-i");
  });

  test("an ambiguous association (two missed points, no ref named) passes through", () => {
    const ctx = markContext();
    ctx.points = [
      { ...ctx.points[0]!, awarded: false },
      { ...ctx.points[1]!, awarded: false },
    ];
    const turn = "An alternative answer would be something about membranes entirely unrelated.";
    const result = lintMarkedPartTurn(turn, ctx);
    expect(result.stripped).toBe(0);
  });

  test("sentences with no miss-claim and no offer cue pass byte-intact", () => {
    const turn = "The answer correctly states the effect on rate. Well done.";
    const result = lintMarkedPartTurn(turn, markContext());
    expect(result.text).toBe(turn);
    expect(result.stripped).toBe(0);
  });
});

describe("DC-5 fail-open — the stem-hygiene law mirrored", () => {
  test("a lint that would empty the answer returns the input unchanged, violations logged", () => {
    const turn =
      "You missed marking point 9. An alternative answer would be the folded membrane idea which would also score.";
    const result = lintMarkedPartTurn(turn, markContext());
    expect(result.text).toBe(turn); // unchanged
    expect(result.stripped).toBe(0); // nothing served-stripped
    expect(result.violations.length).toBe(2); // both logged (A + B)
    expect(result.violations.map((v) => v.rule).sort()).toEqual(["A", "B"]);
  });
});

describe("DC-5 telemetry projection — violations logged, never learner text", () => {
  test("conformanceReport counts rules and pass-throughs", () => {
    const turn =
      "You missed marking point 9. An alternative answer would be the folded membrane which would also score.";
    const report = conformanceReport(lintMarkedPartTurn(turn, markContext()));
    expect(report).toEqual({ active: true, stripped: 0, ruleA: 1, ruleB: 1, passThrough: 0 });
    const clean = conformanceReport(lintMarkedPartTurn("Great work on this part.", markContext()));
    expect(clean).toEqual({ active: true, stripped: 0, ruleA: 0, ruleB: 0, passThrough: 0 });
  });
});

describe("DC-5 streaming — the sentence-buffered wrapper", () => {
  test("clean sentences flow; the violating sentence is held back", () => {
    const s = new MarkConformanceStreamSanitizer(markContext());
    let out = "";
    out += s.push("You missed the second marking point. ");
    out += s.push("The scheme also accepts ");
    out += s.push("greater surface area increases collisions. ");
    out += s.push("An alternative answer would be the folded membrane which would also score.");
    out += s.flush();
    expect(out).toContain("greater surface area increases collisions");
    expect(out).not.toContain("folded membrane");
  });

  test("the tail flush lints the held-back remainder through the exact blocking law", () => {
    const s = new MarkConformanceStreamSanitizer(markContext());
    let out = "";
    out += s.push("A resolution of 0.4 nm would also score"); // no terminal punctuation
    out += s.flush();
    expect(out).toBe(""); // the out-of-set numeric offer is held
  });

  test("an all-clean stream is byte-faithful sentence-joined text", () => {
    const s = new MarkConformanceStreamSanitizer(markContext());
    let out = "";
    out += s.push("You missed the collision frequency point. ");
    out += s.push("The scheme line is explains in terms of collision frequency.");
    out += s.flush();
    expect(out).toContain("collision frequency");
    expect(out).not.toMatch(/folded membrane/);
  });
});

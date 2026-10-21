/**
 * F-BOOK-0003 r1 — the two-phase widened join law tests.
 *
 * The fixture of record is the book's p.39 c4 LO box (parse chunk
 * chem_v3_u1_c4_pdf039_0113, sha-pinned in book.yaml): 1.18's head bullet
 * carries trailing intro prose, and 1.18's colon-continuation sub-clauses
 * ("in order of atomic number", "in groups and periods") are TYPESet after
 * the NEXT top-level bullet, so splitBullets folds them into that foreign
 * bullet. r0 honest-reviewed the 1.18 head (containment 0.611 < 0.75);
 * r1's phase 2 rescues it by attach evidence. The official wordings below
 * are the canonical graph's own texts (specification_points.yaml).
 */
import { describe, expect, it } from "bun:test";

import {
  joinChapterLearningObjectives,
  matchBullet,
  normalizeStatement,
  splitBullets,
  type SpinePoint,
} from "./spine-join";

const SPINE: SpinePoint[] = [
  {
    code: "4CH1-1.18",
    officialCode: "1.18",
    wording:
      "understand how elements are arranged in the Periodic Table： •in order of atomic number •in groups and periods.",
    globalOrder: 18,
  },
  {
    code: "4CH1-1.19",
    officialCode: "1.19",
    wording:
      "understand how to deduce the electronic configurations of the first 20 elements from their positions in the Periodic Table",
    globalOrder: 19,
  },
  {
    code: "4CH1-1.20",
    officialCode: "1.20",
    wording:
      "understand how to use electrical conductivity and the acid-base character of oxides to classify elements as metals or non-metals",
    globalOrder: 20,
  },
];

const LO_ID = "chem_v3_u1_c4_pdf039_0113";

// The interleaved box, verbatim-class from the parse of record (the intro
// prose between the head bullet and the next • is the book's own typesetting).
const P39_BOX = [
  "LEARNING OBJECTIVES",
  "",
  "• Understand how elements are arranged in the Periodic Table:",
  "",
  "The Periodic Table shows all the elements in the universe and is one of the most important tools that a chemist has. The arrangement of the elements allows us to understand trends in properties and make predictions. The modern Periodic Table was first presented in 1869 by a famous Russian chemist, Dmitri Mendeleev. This chapter explores some of the features of the Periodic Table.",
  "",
  "• Identify an element as a metal or a non-metal according to its position in the Periodic Table",
  "",
  "• in order of atomic number",
  "",
  "• in groups and periods",
  "",
  "• Understand how to deduce the electronic configurations of the first 20 elements from their positions in the Periodic Table",
].join("\n");

describe("F-BOOK-0003 r1 — two-phase widened join", () => {
  it("phase 1 alone still honest-reviews the interleaved 1.18 head (r0 behavior preserved)", () => {
    const bullets = splitBullets(P39_BOX);
    // the head bullet carries the prose noise; its flattened matchText misses
    // the continuation tokens → below the tier-3 bar
    const head = bullets[0];
    expect(head).toBeDefined();
    const { ref } = matchBullet(head!, SPINE, LO_ID);
    expect(ref).toBeNull();
  });

  it("the sub-clauses fold into the FOREIGN bullet (the typesetting defect of record)", () => {
    const bullets = splitBullets(P39_BOX);
    const foreign = bullets[1]; // the identify bullet
    expect(foreign).toBeDefined();
    expect(foreign!.subs).toEqual(["in order of atomic number", "in groups and periods"]);
  });

  it("phase 2 rescues 1.18 with method=widened, tier 2, +attach lineage", () => {
    const joined = joinChapterLearningObjectives(P39_BOX, LO_ID, SPINE);
    const r118 = joined.refs.find((r) => r.officialCode === "1.18");
    expect(r118).toBeDefined();
    expect(r118?.method).toBe("widened");
    expect(r118?.tier).toBe("2");
    expect(r118?.lineage).toBe(`${LO_ID}#b1+attach`);
    expect((r118?.score ?? 0)).toBeGreaterThanOrEqual(0.9);
    // the review lane no longer carries the rescued head bullet
    expect(joined.review.find((r) => r.text.startsWith("Understand how elements are arranged"))).toBeUndefined();
  });

  it("phase 1 binds are untouched: 1.19 still binds verbatim-class via its own bullet", () => {
    const joined = joinChapterLearningObjectives(P39_BOX, LO_ID, SPINE);
    const r119 = joined.refs.find((r) => r.officialCode === "1.19");
    expect(r119).toBeDefined();
    expect(r119?.method).toBe("verbatim");
    expect(r119?.lineage).toBe(`${LO_ID}#b3`);
  });

  it("no attach without sub-clause evidence: the review bullet stays in the lane", () => {
    const box = [
      "LEARNING OBJECTIVES",
      "",
      "• Understand how elements are arranged in the Periodic Table:",
      "",
      "Some completely unrelated trailing prose about Mendeleev and 1869 without any continuation tokens anywhere.",
    ].join("\n");
    const joined = joinChapterLearningObjectives(box, "lo:test-no-attach", SPINE);
    expect(joined.refs.find((r) => r.officialCode === "1.18")).toBeUndefined();
    expect(joined.review.length).toBe(1);
  });

  it("the head floor holds: a low-overlap bullet cannot borrow foreign sub-clauses", () => {
    const box = [
      "LEARNING OBJECTIVES",
      "",
      "• Describe experiments to investigate electrolysis of molten compounds briefly",
      "",
      "• in order of atomic number",
    ].join("\n");
    const joined = joinChapterLearningObjectives(box, "lo:test-floor", SPINE);
    expect(joined.refs).toHaveLength(0);
  });

  it("phase 2 is deterministic across runs (sorted candidate assignment)", () => {
    const a = joinChapterLearningObjectives(P39_BOX, LO_ID, SPINE);
    const b = joinChapterLearningObjectives(P39_BOX, LO_ID, SPINE);
    expect(a.refs).toEqual(b.refs);
    expect(a.review).toEqual(b.review);
  });

  it("normalization folds the fullwidth colon and bullet markers of the official wording", () => {
    expect(normalizeStatement("understand how elements are arranged in the Periodic Table： •in groups")).toBe(
      "understand how elements are arranged in the periodic table in groups",
    );
  });
});

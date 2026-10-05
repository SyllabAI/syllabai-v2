/**
 * T-MIG-034 deterministic-law pins — TestBuilderService.selectByMarks port
 * (pure function; the frozen javadoc law verbatim):
 *   1. no target — the P9 behaviour: first `cap` questions in difficulty order;
 *   2. with a target — greedy in difficulty order while it fits, then
 *      repeatedly add the remaining candidate landing CLOSEST to the target,
 *      only when the addition is strictly closer than stopping short
 *      (honest undershoot beats overshoot for its own sake); the cap ALWAYS
 *      applies.
 */
import { describe, expect, test } from "bun:test";
import { selectByMarks } from "../../src/services/testbuilder/builder";
import type { StudentQuestionView } from "@syllabai/contracts";

let seq = 0;
function q(marks: number, difficulty: number, id?: string): StudentQuestionView {
  seq += 1;
  const padded = String(seq).padStart(12, "0");
  // NOTE: ids are difficulty-unique but seq is FILE-global — assertions use
  // marks (unique per fixture), never generated stems/ids.
  return {
    id: id ?? `00000000-0000-4000-8000-${padded}`,
    externalRef: null,
    type: "MCQ_SINGLE",
    stem: `q${seq}`,
    marks,
    difficulty,
    expectedTimeSeconds: 60,
    commandWord: null,
    primaryTopicNodeId: null,
    examPaperId: null,
    options: [],
    parts: [],
    specPointCodes: [],
    specPoints: [],
  };
}

describe("selectByMarks (TestBuilderService.java:313-361 port)", () => {
  test("no target: first cap questions in difficulty order (P9 behaviour)", () => {
    const ordered = [q(1, 1), q(2, 2), q(3, 3), q(4, 4)];
    expect(selectByMarks(ordered, 2, null).map((x) => x.marks)).toEqual([1, 2]);
  });

  test("greedy fill while it fits, cap always applies", () => {
    const ordered = [q(3, 1), q(3, 2), q(3, 3), q(3, 4), q(3, 5)];
    // target 8: greedy takes q1+q2 (6), q3 would hit 9 > 8 → stop; gap-close
    // adds the closest overshoot? 6+3=9 is distance 1; target-total=2 →
    // 1 < 2 → strictly closer → q3 lands (9, honest overshoot-by-gap-close)
    const selected = selectByMarks(ordered, 10, 8);
    expect(selected.map((x) => x.marks)).toEqual([3, 3, 3]);
  });

  test("smallest-overshoot gap closing picks the closest candidate", () => {
    // target 10: greedy takes 4+4 (8); remaining 5 and 6: distances 3 and 4
    // → 5 lands (13). Undershoot distance is 2 → 3 > 2 would STOP. Craft so
    // the close candidate beats the undershoot: target 12, greedy 5+5=10,
    // remaining 3 (distance 1 < undershoot 2) → lands.
    const ordered = [q(5, 1), q(5, 2), q(3, 3)];
    expect(selectByMarks(ordered, 10, 12).map((x) => x.marks)).toEqual([5, 5, 3]);
  });

  test("honest undershoot: no candidate lands strictly closer than stopping", () => {
    // target 10: greedy takes 4+4 (8); remaining 5 → 8+5=13, distance 3 ≥
    // undershoot 2 → STOP at 8 (the frozen rule)
    const ordered = [q(4, 1), q(4, 2), q(5, 3)];
    expect(selectByMarks(ordered, 10, 10).map((x) => x.marks)).toEqual([4, 4]);
  });

  test("cap applies even when the target is unmet", () => {
    const ordered = [q(1, 1), q(1, 2), q(1, 3), q(1, 4), q(1, 5)];
    expect(selectByMarks(ordered, 2, 100)).toHaveLength(2);
  });
});

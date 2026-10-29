import { describe, expect, test } from "bun:test";
import { partDisplayLabel } from "./part-label";

/**
 * part-label unit tests — the attested shapes from the census of record
 * (see part-label.ts header: 7,304 official ids / 3,201 SME values, all
 * three Official-ExamQuestion courses) plus the fail-closed null classes.
 */

describe("partDisplayLabel — official plane (id slug)", () => {
  test("two-level paths", () => {
    expect(partDisplayLabel({ id: "offp_2019-06_1p_1-a-i" })).toBe("(a)(i)");
    expect(partDisplayLabel({ id: "offp_2023-06_2cr_7-c-ii" })).toBe("(c)(ii)");
    expect(partDisplayLabel({ id: "offp_2024-06_2p_6-b-iii" })).toBe("(b)(iii)");
  });

  test("one-level paths", () => {
    expect(partDisplayLabel({ id: "offp_2019-06_1p_2-a" })).toBe("(a)");
    expect(partDisplayLabel({ id: "offp_2021-01_2c_11-d" })).toBe("(d)");
  });

  test("path-less official parts (735-strong class) render no chip", () => {
    expect(partDisplayLabel({ id: "offp_2020-01_1p_1" })).toBeNull();
    expect(partDisplayLabel({ id: "offp_2021-11_1p_7" })).toBeNull();
  });

  test("fail-closed on off-grammar official ids — never guessed", () => {
    expect(partDisplayLabel({ id: "offp_weird" })).toBeNull();
    expect(partDisplayLabel({ id: "offp_2019-06_1p_x-a" })).toBeNull();
    expect(partDisplayLabel({ id: "offp_2019-06_1p_1-" })).toBeNull();
  });
});

describe("partDisplayLabel — SME plane (sourcePaper.questionPart)", () => {
  test("top-level letters", () => {
    expect(partDisplayLabel({ id: "qstnprt_6ngCxGqwMvWnRrcv", sourcePaper: { questionPart: "a" } })).toBe("(a)");
    expect(partDisplayLabel({ id: "qstnprt_R5DPB283BzWNHnhY", sourcePaper: { questionPart: "f" } })).toBe("(f)");
  });

  test("glued sub-levels (ai / aii / cii / biii)", () => {
    expect(partDisplayLabel({ id: "qstnprt_x", sourcePaper: { questionPart: "ai" } })).toBe("(a)(i)");
    expect(partDisplayLabel({ id: "qstnprt_x", sourcePaper: { questionPart: "aii" } })).toBe("(a)(ii)");
    expect(partDisplayLabel({ id: "qstnprt_x", sourcePaper: { questionPart: "cii" } })).toBe("(c)(ii)");
    expect(partDisplayLabel({ id: "qstnprt_x", sourcePaper: { questionPart: "biii" } })).toBe("(b)(iii)");
  });

  test("roman-only sub-levels (questions typed (i)(ii)(iii))", () => {
    expect(partDisplayLabel({ id: "qstnprt_x", sourcePaper: { questionPart: "i" } })).toBe("(i)");
    expect(partDisplayLabel({ id: "qstnprt_x", sourcePaper: { questionPart: "iii" } })).toBe("(iii)");
  });

  test("trivial messy forms are rescued (trim + lowercase)", () => {
    expect(partDisplayLabel({ id: "qstnprt_x", sourcePaper: { questionPart: "c " } })).toBe("(c)");
    expect(partDisplayLabel({ id: "qstnprt_x", sourcePaper: { questionPart: "A" } })).toBe("(a)");
  });

  test("messy minority stays null — never guessed", () => {
    for (const qp of ["b ii, iii", "a i)", "d(ii)", "b-i", "b ii", "a(i)", "b iii) iv)", "b iv, v"]) {
      expect(partDisplayLabel({ id: "qstnprt_x", sourcePaper: { questionPart: qp } })).toBeNull();
    }
  });

  test("absent provenance renders no chip", () => {
    expect(partDisplayLabel({ id: "qstnprt_x", sourcePaper: { questionPart: null } })).toBeNull();
    expect(partDisplayLabel({ id: "qstnprt_x", sourcePaper: null })).toBeNull();
    expect(partDisplayLabel({ id: "qstnprt_x" })).toBeNull();
    expect(partDisplayLabel({})).toBeNull();
  });
});

describe("partDisplayLabel — realistic official ids from all three courses", () => {
  // ids lifted verbatim from the census of record
  // (chemistry-19 / physics-19 / maths-b-16 content of record)
  test("chemistry + maths-B variants", () => {
    expect(partDisplayLabel({ id: "offp_2019-06_1c_1-b-i" })).toBe("(b)(i)");
    expect(partDisplayLabel({ id: "offp_2019-06_1c_1-a" })).toBe("(a)");
    expect(partDisplayLabel({ id: "offp_2018-06_01_12-a" })).toBe("(a)");
    expect(partDisplayLabel({ id: "offp_2019-06_1p_1-a-i" })).toBe("(a)(i)");
  });

  test("maths-B path-less ids (offp_2018-06_01_1) render no chip", () => {
    expect(partDisplayLabel({ id: "offp_2018-06_01_1" })).toBeNull();
    expect(partDisplayLabel({ id: "offp_2018-06_01_2" })).toBeNull();
  });

  test("path segments outside [a-z0-9]{1,5} fail closed", () => {
    expect(partDisplayLabel({ id: "offp_2019-06_1p_1-a--i" })).toBeNull();
    expect(partDisplayLabel({ id: "offp_2019-06_1p_1-a(b)" })).toBeNull();
  });
});

import { describe, expect, test } from "bun:test";
import { checkOptionMisconceptionTag } from "../../src/services/sme/misconception-law";
import { BadRequestError } from "../../src/services/selfmark";

/**
 * T-TUTOR-AIM-P1 (DC10 §7.1): the misconception-tag law, unit-pinned.
 * The catalog set is passed in (pure module) — the apply flow resolves it
 * per primary topic from knowledge_edges (MISCONCEPTION_OF → topic, of-record
 * direction: source = the misconception node, target = the topic).
 */
const TAG = "11111111-1111-4111-8111-111111111111";
const CATALOG = new Set([TAG]);
const EMPTY = new Set<string>();

describe("misconception-tag law (DC10 §7.1)", () => {
  test("L1 — a correct option never carries a tag", () => {
    expect(() =>
      checkOptionMisconceptionTag(
        { isCorrect: true, misconceptionNodeId: TAG },
        "4CH1-Q1",
        true,
        CATALOG,
      ),
    ).toThrow(BadRequestError);
    expect(() =>
      checkOptionMisconceptionTag(
        { isCorrect: true, misconceptionNodeId: "99999999-9999-4999-8999-999999999999" },
        "4CH1-Q1",
        true,
        CATALOG,
      ),
    ).toThrow(/tags express wrong models only/);
    // correct + untagged passes (the ordinary correct option)
    expect(() =>
      checkOptionMisconceptionTag({ isCorrect: true, misconceptionNodeId: null }, "4CH1-Q1", true, CATALOG),
    ).not.toThrow();
  });

  test("L2 — a wrong option's tag must resolve into the topic's catalog", () => {
    expect(() =>
      checkOptionMisconceptionTag({ isCorrect: false, misconceptionNodeId: TAG }, "4CH1-Q1", true, CATALOG),
    ).not.toThrow();
    expect(() =>
      checkOptionMisconceptionTag(
        { isCorrect: false, misconceptionNodeId: "99999999-9999-4999-8999-999999999999" },
        "4CH1-Q1",
        true,
        CATALOG,
      ),
    ).toThrow(/does not resolve/);
  });

  test("L3 — no tag on a wrong option is refused when the catalog is live", () => {
    expect(() =>
      checkOptionMisconceptionTag({ isCorrect: false, misconceptionNodeId: null }, "4CH1-Q1", true, CATALOG),
    ).toThrow(/every distractor must name its node/);
  });

  test("L4 — no tag passes when the topic's catalog carries no rows (disclosed residual)", () => {
    expect(() =>
      checkOptionMisconceptionTag({ isCorrect: false, misconceptionNodeId: null }, "4CH1-Q1", false, EMPTY),
    ).not.toThrow();
    // and absent (undefined) normalizes to null — the hand-built-row precedent
    expect(() =>
      checkOptionMisconceptionTag(
        { isCorrect: false, misconceptionNodeId: undefined as unknown as null },
        "4CH1-Q1",
        false,
        EMPTY,
      ),
    ).not.toThrow();
  });

  test("L3 bites through the absent-field normalization too (a live catalog refuses untagged)", () => {
    expect(() =>
      checkOptionMisconceptionTag(
        { isCorrect: false, misconceptionNodeId: undefined as unknown as null },
        "4CH1-Q1",
        true,
        CATALOG,
      ),
    ).toThrow(/every distractor must name its node/);
  });
});

/**
 * Editor-planes tests — ADR-044 run-011 (the @syllabai/shared pin: the
 * Phase 2 merge-transport disclosure is byte-identical across planes by
 * law — the api serves it and the hub renders it; a drifted disclosure is
 * not a disclosure).
 */
import { describe, expect, test } from "bun:test";
import { EDITOR_PHASE2_MERGE_DISCLOSURE } from "./editor-planes";

describe("EDITOR_PHASE2_MERGE_DISCLOSURE (the B4 simulated-transport law)", () => {
  test("the pinned verbatim text", () => {
    expect(EDITOR_PHASE2_MERGE_DISCLOSURE).toBe(
      "Phase 2 records the merge in the proposal journal with a SIMULATED PR transport: no corpus byte changes and nothing user-visible changes until Phase 3 wires the real GitHub PR path and the census-guard serve (ADR-044 §2 E-0, §9).",
    );
  });

  test("the law keywords survive any future amendment (the guardrail pin)", () => {
    expect(EDITOR_PHASE2_MERGE_DISCLOSURE).toContain("SIMULATED PR transport");
    expect(EDITOR_PHASE2_MERGE_DISCLOSURE).toContain("census-guard");
    expect(EDITOR_PHASE2_MERGE_DISCLOSURE).toContain("Phase 3");
    expect(EDITOR_PHASE2_MERGE_DISCLOSURE).toContain("E-0");
  });
});

/**
 * MarkSchemeReveal law tests (T-MIG-031 tranche 1).
 * Frozen law: MarkSchemeRevealService.java @ 6cad6ef.
 */
import { describe, expect, test } from "bun:test";
import { MarkSchemeReveal, parseRevealPolicy } from "../../src/services/questions/reveal";
import { ServableQuestions } from "../../src/services/questions/servable";
import {
  BY_ID,
  MCQ_ID,
  MCQ_ROW,
  PART_1_ID,
  PART_2_ID,
  SCHEME_ID,
  UNKNOWN_ID,
  VERSION_ID,
  fakeSql,
  servableRoutes,
} from "./helpers";

function build(schemeRow: Record<string, unknown>, extra: Parameters<typeof servableRoutes>[0] = []) {
  const sql = fakeSql([
    ...extra,
    ...servableRoutes([{ match: BY_ID, rows: [MCQ_ROW] }]),
    {
      match: /from question_versions v where v\.question_id = \? order by v\.version desc/,
      rows: [{ id: VERSION_ID, version: 2 }],
    },
    {
      match: /from mark_schemes s/,
      rows: [schemeRow],
    },
    {
      match: /from mark_points mp/,
      rows: [
        { id: "63000000-0000-4000-8000-000000000002", ref: "ai-2", ordering: 2, text: "second point", marks: 1, question_part_id: PART_1_ID },
        { id: "63000000-0000-4000-8000-000000000003", ref: "ai-3", ordering: 1, text: "general note", marks: 1, question_part_id: null },
        { id: "63000000-0000-4000-8000-000000000001", ref: "ai-1", ordering: 1, text: "first point", marks: 2, question_part_id: PART_1_ID },
        { id: "63000000-0000-4000-8000-000000000004", ref: "ai-4", ordering: 1, text: "part two point", marks: 1, question_part_id: PART_2_ID },
      ],
    },
    {
      match: /from question_parts p/,
      rows: [
        { part_id: PART_1_ID, label: "a", prompt: "part one", command_word: "state", marks: 4, part_ordering: 1 },
        { part_id: PART_2_ID, label: "b", prompt: "part two", command_word: "explain", marks: 2, part_ordering: 2 },
      ],
    },
  ]);
  const servable = new ServableQuestions(sql);
  const reveal = new MarkSchemeReveal(sql, servable, policy);
  return { sql, reveal };
}

let policy: ReturnType<typeof parseRevealPolicy> = "VALIDATED_ONLY";

describe("reveal policy (the explicit boundary)", () => {
  test("parseRevealPolicy: default VALIDATED_ONLY, trim+uppercase, fail-fast on bad value", () => {
    expect(parseRevealPolicy(undefined)).toBe("VALIDATED_ONLY");
    expect(parseRevealPolicy(null)).toBe("VALIDATED_ONLY");
    expect(parseRevealPolicy("  include_suggested ")).toBe("INCLUDE_SUGGESTED");
    expect(() => parseRevealPolicy("SHOW_EVERYTHING")).toThrow();
  });

  test("VALIDATED scheme reveals under VALIDATED_ONLY with the full projection", async () => {
    policy = "VALIDATED_ONLY";
    const { reveal } = build({ id: SCHEME_ID, validation_state: "VALIDATED" });
    const view = await reveal.reveal(MCQ_ID);
    expect(view).not.toBeNull();
    expect(view!.schemeId).toBe(SCHEME_ID);
    expect(view!.validationState).toBe("VALIDATED");
    expect(view!.questionId).toBe(MCQ_ID);
    expect(view!.questionMarks).toBe(1);
    // schemeMarks DERIVED: sum of point marks (2+1+1+1 = 5), not a column
    expect(view!.schemeMarks).toBe(5);
    // part-scoped points grouped under version-ordered parts, ordering-sorted
    expect(view!.parts.map((p) => p.partId)).toEqual([PART_1_ID, PART_2_ID]);
    expect(view!.parts[0]!.points.map((p) => p.ref)).toEqual(["ai-1", "ai-2"]); // ordering 1, 2
    expect(view!.parts[0]!.marks).toBe(4);
    expect(view!.parts[1]!.points.map((p) => p.ref)).toEqual(["ai-4"]);
    // general points (null part) ordering-sorted after the parts
    expect(view!.generalPoints.map((p) => p.ref)).toEqual(["ai-3"]);
    // acceptanceCriteria / extraction metadata NEVER leave the backend
    expect(JSON.stringify(view)).not.toContain("acceptance");
  });

  test("SUGGESTED withholds under VALIDATED_ONLY (204 path) but reveals under INCLUDE_SUGGESTED", async () => {
    policy = "VALIDATED_ONLY";
    const { reveal: strict } = build({ id: SCHEME_ID, validation_state: "SUGGESTED" });
    expect(await strict.reveal(MCQ_ID)).toBeNull();

    policy = "INCLUDE_SUGGESTED";
    const { reveal: lenient } = build({ id: SCHEME_ID, validation_state: "SUGGESTED" });
    const view = await lenient.reveal(MCQ_ID);
    expect(view!.validationState).toBe("SUGGESTED"); // carried honestly so the UI can label it
  });

  test("REJECTED and FLAGGED never reveal under either policy", async () => {
    for (const pol of ["VALIDATED_ONLY", "INCLUDE_SUGGESTED"] as const) {
      policy = pol;
      const { reveal: rejected } = build({ id: SCHEME_ID, validation_state: "REJECTED" });
      expect(await rejected.reveal(MCQ_ID)).toBeNull();
      const { reveal: flagged } = build({ id: SCHEME_ID, validation_state: "FLAGGED" });
      expect(await flagged.reveal(MCQ_ID)).toBeNull();
    }
  });

  test("no version or no scheme -> null (honest empty), unservable question -> 404", async () => {
    policy = "VALIDATED_ONLY";
    const { sql, reveal } = build(
      { id: SCHEME_ID, validation_state: "VALIDATED" },
      [
        // override the versions route to return nothing (no version exists)
        {
          match: /from question_versions v where v\.question_id = \? order by v\.version desc/,
          rows: [],
        },
      ],
    );
    expect(await reveal.reveal(MCQ_ID)).toBeNull();
    expect(sql.queries.some((t) => t.includes("from mark_schemes"))).toBe(false); // no scheme lookup without a version
  });

  test("unservable question: 404 NotFoundException('question', id) — the servability gate rides the reveal", async () => {
    policy = "VALIDATED_ONLY";
    const sql = fakeSql(servableRoutes([{ match: BY_ID, rows: [] }]));
    const reveal = new MarkSchemeReveal(sql, new ServableQuestions(sql), policy);
    let message = "";
    try {
      await reveal.reveal(UNKNOWN_ID);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toBe(`question ${UNKNOWN_ID} not found`);
  });
});

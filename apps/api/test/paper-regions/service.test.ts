/**
 * PaperRegions law tests (T-MG-MP-RECT-1 run-001).
 * Plan of record: docs/MG-MARK-PARITY-PLAN.md §3.1 — acceptance pins
 * (a) join, (b) contract, (c) honest-empty over the service + assembly.
 * Stubbed sql (the 031 pattern); the assembly is exercised PURELY so the
 * join laws read without stub noise, and the 404/honest-empty service
 * paths ride fakeSql.
 */
import { describe, expect, test } from "bun:test";
import { PaperRegions, assemble, type PartRow, type PointRow, type QuestionRow, type RectRow } from "../../src/services/paper-regions";
import type { SqlFn } from "../../src/services/paper-regions/sql";
import { NotFoundException, toErrorResponse } from "../../src/services/identity/errors";
import { paperAssetRegionsResponseSchema, type PaperAssetRegionsResponse } from "@syllabai/contracts";

// ── fixed uuid fixtures (the questions/helpers golden convention, local to
// this module's fence — no cross-fence test imports) ────────────────────────
const PAPER_ID = "47000000-0000-4000-8000-000000000001";
const UNKNOWN_ID = "00000000-0000-4000-8000-00000000dead";
const Q9_ID = "48000000-0000-4000-8000-000000000001";
const Q3_ID = "48000000-0000-4000-8000-000000000002";
const V9_ID = "61000000-0000-4000-8000-000000000001";
const V3_ID = "61000000-0000-4000-8000-000000000002";
const PART_A_ID = "60000000-0000-4000-8000-000000000001";
const PART_B_ID = "60000000-0000-4000-8000-000000000002";
const POINT_DIRECT_ID = "63000000-0000-4000-8000-000000000001";
const POINT_SCHEME_ID = "63000000-0000-4000-8000-000000000002";
const POINT_VERSION_ID = "63000000-0000-4000-8000-000000000003";

const Q9: QuestionRow = {
  question_id: Q9_ID,
  external_ref: "1ma1-1f-q9",
  question_marks: 3,
  version_id: V9_ID,
};
const Q3: QuestionRow = {
  question_id: Q3_ID,
  external_ref: null, // positional fallback → "q2"
  question_marks: 1,
  version_id: V3_ID,
};
const PART_A: PartRow = { part_id: PART_A_ID, question_version_id: V9_ID, label: "a", marks: 1, ordering: 0 };
const PART_B: PartRow = { part_id: PART_B_ID, question_version_id: V9_ID, label: "2", marks: 2, ordering: 1 };
const POINT_DIRECT: PointRow = { mark_point_id: POINT_DIRECT_ID, marks: 1, direct_part_id: PART_A_ID, scheme_part_id: null, question_version_id: V9_ID };
const POINT_SCHEME: PointRow = { mark_point_id: POINT_SCHEME_ID, marks: 1, direct_part_id: null, scheme_part_id: PART_B_ID, question_version_id: V9_ID };
const POINT_VERSION: PointRow = { mark_point_id: POINT_VERSION_ID, marks: 1, direct_part_id: null, scheme_part_id: null, question_version_id: V3_ID };

function service(queries: Array<Record<string, unknown>>): { svc: PaperRegions; sql: SqlFn & { queries: string[] } } {
  const issued: string[] = [];
  const sql = (async (strings: TemplateStringsArray, ...params: unknown[]) => {
    const text = strings.join(" ? ").replace(/\s+/g, " ").trim();
    issued.push(text);
    for (const q of queries) {
      if ((q.match as RegExp).test(text)) return q.rows as Array<Record<string, unknown>>;
    }
    throw new Error("unexpected query: " + text);
  }) as unknown as SqlFn & { queries: string[] };
  sql.queries = issued;
  return { svc: new PaperRegions(sql), sql };
}

describe("assemble — the join law (plan §3.1 pin a)", () => {
  const full: PaperAssetRegionsResponse = assemble(
    [Q9, Q3],
    [PART_A, PART_B],
    [POINT_DIRECT, POINT_SCHEME, POINT_VERSION],
    [
      { mark_point_id: POINT_DIRECT_ID, page: 3, x: 0.1, y: 0.2, width: 0.3, height: 0.4, ordinal: 1 },
      { mark_point_id: POINT_DIRECT_ID, page: 3, x: 0.1, y: 0.6, width: 0.3, height: 0.1, ordinal: 0 },
      { mark_point_id: POINT_VERSION_ID, page: 5, x: 0.5, y: 0.5, width: 0.2, height: 0.2, ordinal: 0 },
    ],
  );

  test("seeded rect resolves to a live mark_point AND part — questionPartId WIRED (pin a+b)", () => {
    const partA = full.regions.find((r) => r.regionKey === "1ma1-1f-q9.a");
    expect(partA).toBeDefined();
    expect(partA!.kind).toBe("part");
    expect(partA!.questionPartId).toBe(PART_A_ID); // non-null: the parity gap closed
    expect(partA!.parentRegionId).toBe(Q9_ID);
    expect(partA!.marks).toBe(1);
    expect(partA!.markable).toBe(true);
    expect(partA!.extracted).toBe(true);
  });

  test("multi-rect renders in ordinal order (their rects[] as ordinal rows)", () => {
    const partA = full.regions.find((r) => r.regionKey === "1ma1-1f-q9.a")!;
    expect(partA.rects.map((r) => r.ordinal)).toEqual([0, 1]);
    expect(partA.rects[0]).toMatchObject({ page: 3, x: 0.1, y: 0.6, width: 0.3, height: 0.1 });
    expect(partA.page).toBe(3);
  });

  test("region-key law: labeled sub-part 6.a style + answer-line 9.pN style (§1.3 conventions)", () => {
    const keys = full.regions.map((r) => r.regionKey);
    expect(keys).toContain("1ma1-1f-q9"); // bare question
    expect(keys).toContain("1ma1-1f-q9.a"); // labeled sub-part (label "a")
    expect(keys).toContain("1ma1-1f-q9.p2"); // answer-line (label "2", ordering 1 → .p2)
  });

  test("region-key law: positional fallback for null external_ref", () => {
    const q2 = full.regions.find((r) => r.regionKey === "q2");
    expect(q2).toBeDefined();
    expect(q2!.kind).toBe("question");
  });

  test("scheme-level binding (ADR-040 part-granular) resolves to the part region", () => {
    const partB = full.regions.find((r) => r.regionKey === "1ma1-1f-q9.p2")!;
    expect(partB.markable).toBe(true);
    expect(partB.questionPartId).toBe(PART_B_ID);
    // no rects seeded for the scheme-bound point: markable, NOT extracted
    expect(partB.extracted).toBe(false);
  });

  test("version-level points belong to the QUESTION region (markable + extracted)", () => {
    const q2 = full.regions.find((r) => r.regionKey === "q2")!;
    expect(q2.markable).toBe(true);
    expect(q2.extracted).toBe(true);
    expect(q2.questionPartId).toBeNull();
    expect(q2.parentRegionId).toBeNull();
    expect(q2.rects).toHaveLength(1);
    expect(q2.rects[0]!.page).toBe(5);
  });

  test("groundingComplete: false while any markable region is un-extracted; top flags honest", () => {
    expect(full.extracted).toBe(true);
    expect(full.markable).toBe(true);
    expect(full.groundingComplete).toBe(false); // part B markable, un-extracted
  });

  test("groundingComplete: true when every markable region is extracted", () => {
    const done = assemble(
      [Q9],
      [PART_A],
      [POINT_DIRECT],
      [{ mark_point_id: POINT_DIRECT_ID, page: 3, x: 0.1, y: 0.2, width: 0.3, height: 0.4, ordinal: 0 }],
    );
    expect(done.groundingComplete).toBe(true);
    expect(done.extracted).toBe(true);
  });

  test("wire shape validates against the canonical contract (pin b)", () => {
    expect(() => paperAssetRegionsResponseSchema.parse(full)).not.toThrow();
  });
});

describe("assemble — the honest-empty law (plan §3.1 pin c)", () => {
  test("no questions at all → the §1.3 negative path EXACTLY", () => {
    const empty = assemble([], [], [], []);
    expect(empty).toEqual({ extracted: false, markable: false, groundingComplete: false, regions: [] });
    expect(() => paperAssetRegionsResponseSchema.parse(empty)).not.toThrow();
  });

  test("questions but zero points → regions exist, nothing markable, nothing extracted", () => {
    const bare = assemble([Q9], [PART_A, PART_B], [], []);
    expect(bare.extracted).toBe(false);
    expect(bare.markable).toBe(false);
    // vacuous-complete semantics: regions exist and NO region is markable —
    // there is nothing that could be grounded, so grounding is complete.
    // (The pinned FALSE negative path is the zero-regions case above.)
    expect(bare.groundingComplete).toBe(true);
    expect(bare.regions.map((r) => r.regionKey).sort()).toEqual(["1ma1-1f-q9", "1ma1-1f-q9.a", "1ma1-1f-q9.p2"]);
    for (const r of bare.regions) {
      expect(r.markable).toBe(false);
      expect(r.extracted).toBe(false);
      expect(r.rects).toEqual([]);
      expect(r.page).toBeNull();
    }
  });
});

describe("PaperRegions service — 404 + honest-empty service paths", () => {
  test("unknown paper → 404 T-C20 (shared 'exam paper' envelope)", async () => {
    const { svc } = service([{ match: /from exam_papers p where p\.id = \?/, rows: [] }]);
    try {
      await svc.regions(UNKNOWN_ID);
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(NotFoundException);
      const mapped = toErrorResponse(e);
      expect(mapped?.status).toBe(404);
      expect(mapped?.body.message).toContain("exam paper");
      expect(mapped?.body.message).toContain(UNKNOWN_ID);
    }
  });

  test("known paper with no questions → 200 negative path (never an error)", async () => {
    const { svc, sql } = service([
      { match: /from exam_papers p where p\.id = \?/, rows: [{ id: PAPER_ID }] },
      { match: /from questions q\s*join/, rows: [] },
    ]);
    const res = await svc.regions(PAPER_ID);
    expect(res).toEqual({ extracted: false, markable: false, groundingComplete: false, regions: [] });
    expect(sql.queries.length).toBe(2); // parts/points queries short-circuited
  });

  test("head law rides the SQL: distinct-on latest version, deterministic question order", async () => {
    const { svc, sql } = service([
      { match: /from exam_papers p where p\.id = \?/, rows: [{ id: PAPER_ID }] },
      { match: /from questions q\s*join/, rows: [] },
    ]);
    await svc.regions(PAPER_ID);
    const questionsQuery = sql.queries.find((q) => q.includes("question_versions"));
    expect(questionsQuery).toBeDefined();
    expect(questionsQuery).toContain("distinct on (v.question_id)");
    expect(questionsQuery).toContain("order by v.question_id, v.version desc");
    expect(questionsQuery).toContain("order by q.external_ref asc nulls last, q.created_at asc, q.id asc");
  });
});

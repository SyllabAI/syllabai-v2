/**
 * T-MIG-021 tranche-1 unit tests — CurriculumReviewReader (the teacher read
 * surface: GET /api/v1/teacher/curriculum/versions + /versions/{id}/nodes,
 * CurriculumReviewService.java:48-90 read methods), stubbed-sql (no Neon).
 *
 * Behavior pins are capture-backed (T-MIG-004 golden cases): the overview
 * counts body (teacher-curriculum-versions-teacher-200: 1 validated / 0
 * suggested / 10 unvalidated), the sorted node list (nodes-teacher-200), the
 * SUGGESTED empty queue (nodes-suggested-200), and the F-1 empty queue on an
 * unknown version (nodes-unknown-version-200-empty). The recursive PART_OF
 * CTE text is pinned as the subtree definition (KnowledgeNodeRepository
 * .java:436-444, carried verbatim).
 */
import { describe, expect, test } from "bun:test";
import { CurriculumVersionsRepository } from "../../src/services/curriculum/versions";
import { SubjectsRepository } from "../../src/services/curriculum/subjects";
import { CurriculumReviewReader } from "../../src/services/curriculum/review";
import { SEED_NODE_ROWS, SUBJECT_ROW, VERSION_ROW, fakeSql } from "./helpers";
import type { SqlFn } from "../../src/services/curriculum/sql";

const VERSION_ID = "10000000-0000-0000-0000-000000000001";

/** Stub routing the three shapes the reader issues (anchored so variants don't cross-match). */
function reviewSql(over: {
  versions?: Array<Record<string, unknown>>;
  subjects?: Array<Record<string, unknown>>;
  counts?: Array<Record<string, unknown>>;
  nodes?: Array<Record<string, unknown>>;
}): SqlFn & { queries: string[] } {
  return fakeSql([
    { match: /from curriculum_versions order by created_at desc$/i, rows: over.versions ?? [VERSION_ROW] },
    {
      match: /where s\.curriculum_version_id = \? order by s\.code$/i,
      rows: over.subjects ?? [SUBJECT_ROW],
    },
    { match: /group by n\.validation_status$/i, rows: over.counts ?? [] },
    {
      match: /select id from subtree \) and n\.validation_status = \?$/i,
      rows: over.nodes ?? [],
    },
    { match: /select id from subtree \)$/i, rows: over.nodes ?? [] },
  ]);
}

const reader = (sql: SqlFn) =>
  new CurriculumReviewReader(sql, new CurriculumVersionsRepository(sql), new SubjectsRepository(sql));

describe("CurriculumReviewReader.overviewRows — versions() :48-72", () => {
  test("seed-shaped counts aggregate to the captured overview body (1/0/10)", async () => {
    const sql = reviewSql({
      counts: [
        { validation_status: "VALIDATED", count: 1 },
        { validation_status: "UNVALIDATED", count: 10 },
      ],
    });
    const rows = await reader(sql).overviewRows();
    expect(rows).toEqual([
      {
        id: VERSION_ROW.id,
        board: "Edexcel",
        qualification: "IAL",
        code: "IAL-CHEM-2018",
        title: "Edexcel International A Level Chemistry (2018 specification)",
        status: "ACTIVE",
        validatedNodes: 1,
        suggestedNodes: 0,
        unvalidatedNodes: 10,
      },
    ]);
  });

  test("the subtree tally rides the frozen recursive PART_OF CTE, verbatim structure", async () => {
    const sql = reviewSql({});
    await reader(sql).overviewRows();
    const cte = sql.queries.find((q) => q.includes("group by n.validation_status"));
    expect(cte).toBeDefined();
    expect(cte).toMatch(/with recursive subtree as \( select n\.id from knowledge_nodes n where n\.id = \? union select e\.source_node_id from knowledge_edges e join subtree s on e\.target_node_id = s\.id where e\.relation_type = 'PART_OF' \)/);
  });

  test("the tally statement OPENS with SQL, never a bind slot (the ${''} 42601 regression, run #11 — T-MIG-067)", async () => {
    // A plain-string interpolation inside the sql template renders as a
    // bind parameter: the former leading `${""}` comment slot made Postgres
    // reject the whole statement with "syntax error at or near $1"
    // (position 8), 500-ing teacher-curriculum-versions on the instrument.
    const sql = reviewSql({});
    await reader(sql).overviewRows();
    const cte = sql.queries.find((q) => q.includes("group by n.validation_status"));
    expect(cte).toBeDefined();
    expect(cte!.startsWith("select n.validation_status")).toBe(true);
    expect(cte!.startsWith("?")).toBe(false);
  });

  test("subject with a null KG root contributes zeros and issues NO subtree query (:183-185 guard)", async () => {
    const sql = reviewSql({
      subjects: [{ ...SUBJECT_ROW, knowledge_node_id: null }],
    });
    const rows = await reader(sql).overviewRows();
    expect(rows[0]!.validatedNodes).toBe(0);
    expect(rows[0]!.unvalidatedNodes).toBe(0);
    expect(sql.queries.some((q) => q.includes("group by n.validation_status"))).toBe(false);
  });

  test("counts sum ACROSS subjects of one version (two-subject version)", async () => {
    const sql = reviewSql({
      subjects: [
        SUBJECT_ROW,
        { ...SUBJECT_ROW, id: "10000000-0000-0000-0000-000000000011", code: "PHY", knowledge_node_id: "20000000-0000-0000-0000-000000000002" },
      ],
      counts: [{ validation_status: "UNVALIDATED", count: 3 }],
    });
    const rows = await reader(sql).overviewRows();
    expect(rows[0]!.unvalidatedNodes).toBe(6); // 3 + 3 summed over the two subject trees
    expect(rows[0]!.validatedNodes).toBe(0);
  });
});

describe("CurriculumReviewReader.nodeRows — nodes() :75-90", () => {
  test("unknown version -> [] with NO subtree query (F-1 captured posture: 200 empty)", async () => {
    const sql = reviewSql({ subjects: [] });
    const rows = await reader(sql).nodeRows("00000000-0000-4000-8000-0000000000a2");
    expect(rows).toEqual([]);
    expect(sql.queries.some((q) => q.includes("with recursive subtree"))).toBe(false);
  });

  test("subtree rows map to NodeView and the FINAL in-memory sort by code runs (:89)", async () => {
    const sql = reviewSql({ nodes: [...SEED_NODE_ROWS].reverse() }); // stub returns WCH11 first
    const rows = await reader(sql).nodeRows(VERSION_ID);
    expect(rows.map((r) => r.code)).toEqual(["CHM", "WCH11"]); // sorted, not stub order
    expect(rows[0]).toEqual({
      id: "20000000-0000-0000-0000-000000000001",
      code: "CHM",
      nodeType: "SUBJECT",
      title: "Chemistry",
      validationStatus: "VALIDATED",
      provenance: "Edexcel IAL specification 2018",
      parentId: null,
    });
    expect(rows[1]!.parentId).toBe("20000000-0000-0000-0000-000000000001"); // PART_OF parent join
  });

  test("status filter pushes the exact-match predicate into the statement (SUGGESTED -> [] on seed)", async () => {
    const sql = reviewSql({});
    const rows = await reader(sql).nodeRows(VERSION_ID, "SUGGESTED");
    expect(rows).toEqual([]);
    expect(sql.queries.some((q) => q.endsWith("select id from subtree ) and n.validation_status = ?"))).toBe(true);
  });

  test("unfiltered queue issues no validation_status predicate (parity with post-fetch skip)", async () => {
    const sql = reviewSql({ nodes: SEED_NODE_ROWS });
    const rows = await reader(sql).nodeRows(VERSION_ID);
    expect(rows).toHaveLength(2);
    expect(sql.queries.some((q) => q.includes("validation_status = ?"))).toBe(false);
  });
});

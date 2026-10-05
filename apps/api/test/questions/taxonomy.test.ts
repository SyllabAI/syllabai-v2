/**
 * QuestionTaxonomy law tests (T-MIG-031 tranche 1).
 * Frozen law: ServableQuestionService.taxonomy @ 6cad6ef.
 */
import { describe, expect, test } from "bun:test";
import { QuestionFamilyAssembler } from "../../src/services/questions/families";
import { ServableQuestions } from "../../src/services/questions/servable";
import { QuestionTaxonomy } from "../../src/services/questions/taxonomy";
import {
  LIST_ALL,
  MCQ_ID,
  MCQ_ROW,
  SECTION_A_ID,
  SECTION_B_ID,
  STRUCTURED_ID,
  STRUCTURED_ROW,
  TOPIC2_ID,
  TOPIC_ID,
  fakeSql,
  servableRoutes,
} from "./helpers";

function build(extra: Parameters<typeof servableRoutes>[0] = []) {
  const sql = fakeSql(servableRoutes(extra));
  const servable = new ServableQuestions(sql);
  const families = new QuestionFamilyAssembler();
  const taxonomy = new QuestionTaxonomy(sql, servable, families);
  return { sql, servable, taxonomy };
}

/** Two servable questions: the paper-less MCQ (primary topic TOPIC_ID) and
 * the STRUCTURED row under the VALIDATED paper (primary TOPIC_ID, secondary
 * TOPIC2_ID via question_topics). */
const BASE: Parameters<typeof servableRoutes>[0] = [
  { match: LIST_ALL, rows: [MCQ_ROW, STRUCTURED_ROW] },
  {
    match: /select question_id, node_id from question_topics/,
    rows: [{ question_id: STRUCTURED_ID, node_id: TOPIC2_ID }],
  },
  {
    // node metadata for counted topics AND their parents (single any() route)
    match: /select id, code, title from knowledge_nodes/,
    rows: [
      { id: TOPIC_ID, code: "T1", title: "States of matter" },
      { id: TOPIC2_ID, code: "T2", title: "Elements, compounds and mixtures" },
      { id: SECTION_A_ID, code: "S1", title: "Section A" },
      { id: SECTION_B_ID, code: "S0", title: "Section B (lower id would win if edges said so)" },
    ],
  },
];

describe("taxonomy census", () => {
  test("per-topic counts, PART_OF grouping with duplicate-edge dedup (lowest parent id), deduped totals", async () => {
    const { taxonomy } = build([
      ...BASE,
      {
        match: /from knowledge_edges/,
        rows: [
          // duplicate structural PART_OF edges from the seed: TOPIC_ID has
          // TWO parents — deterministically-lowest parent id wins (SECTION_A)
          { source_id: TOPIC_ID, target_id: SECTION_B_ID },
          { source_id: TOPIC_ID, target_id: SECTION_A_ID },
          { source_id: TOPIC2_ID, target_id: SECTION_A_ID },
        ],
      },
    ]);
    const view = await taxonomy.taxonomy(null);
    expect(view.sections).toHaveLength(1);
    const section = view.sections[0]!;
    expect(section.nodeId).toBe(SECTION_A_ID);
    expect(section.code).toBe("S1");
    // per-topic reachable counts: TOPIC_ID serves both rows (1 mcq + 1
    // structured, 2 families); TOPIC2_ID serves the structured row only
    expect(section.topics).toHaveLength(2);
    expect(section.topics[0]).toEqual({
      nodeId: TOPIC_ID,
      code: "T1",
      title: "States of matter",
      questionCount: 2,
      mcqCount: 1,
      structuredCount: 1,
      familyCount: 2,
    });
    expect(section.topics[1]).toEqual({
      nodeId: TOPIC2_ID,
      code: "T2",
      title: "Elements, compounds and mixtures",
      questionCount: 1,
      mcqCount: 0,
      structuredCount: 1,
      familyCount: 1,
    });
    // deduped census (session-116): the structured row maps to BOTH topics
    // but counts ONCE per section and once in the view totals. Distinct
    // families = {MCQ row-id key, sme-eq-…-q16 key} — the q18 row is under
    // the REJECTED paper and never reached the census (V20 gate).
    expect(section.distinctQuestionCount).toBe(2);
    expect(section.distinctFamilyCount).toBe(2);
    expect(view.totalDistinctQuestions).toBe(2);
    expect(view.totalDistinctFamilies).toBe(2);
  });

  test("topics with no PART_OF parent are not browsable (dropped); sections stay deterministic", async () => {
    const { taxonomy } = build([
      ...BASE,
      {
        match: /from knowledge_edges/,
        rows: [{ source_id: TOPIC2_ID, target_id: SECTION_A_ID }], // TOPIC_ID orphaned
      },
    ]);
    const view = await taxonomy.taxonomy(null);
    expect(view.sections).toHaveLength(1);
    expect(view.sections[0]!.topics.map((t) => t.code)).toEqual(["T2"]);
    // the dropped topic's questions vanish from the deduped census too —
    // the census runs over the SAME browsability boundary
    expect(view.sections[0]!.distinctQuestionCount).toBe(1);
    expect(view.sections[0]!.distinctFamilyCount).toBe(1);
    expect(view.totalDistinctQuestions).toBe(1);
    expect(view.totalDistinctFamilies).toBe(1);
  });

  test("rootId scopes the census to the PART_OF subtree (unknown root 404s first)", async () => {
    const { taxonomy, sql } = build([
      ...BASE,
      {
        match: /from knowledge_edges/,
        rows: [{ source_id: TOPIC_ID, target_id: SECTION_A_ID }],
      },
      {
        // graph.node(rootId) 404-first contract
        match: /select id from knowledge_nodes where id = \?/,
        rows: [{ id: SECTION_A_ID }],
      },
      {
        match: /WITH RECURSIVE subtree/,
        rows: [{ id: SECTION_A_ID }, { id: TOPIC_ID }], // subtree excludes TOPIC2
      },
    ]);
    const view = await taxonomy.taxonomy(SECTION_A_ID);
    expect(view.sections[0]!.topics.map((t) => t.nodeId)).toEqual([TOPIC_ID]);
    expect(view.totalDistinctQuestions).toBe(2);
    const node = sql.queries.find((t) => t.startsWith("select id from knowledge_nodes"))!;
    expect(node).toMatch(/where id = \?/);
    expect(sql.queries.findIndex((t) => t.includes("WITH RECURSIVE"))).toBeGreaterThan(
      sql.queries.findIndex((t) => t.startsWith("select id from knowledge_nodes")),
    ); // 404 check runs BEFORE the CTE
  });

  test("unknown root throws NotFoundException('knowledge node', id) before any question work", async () => {
    const { taxonomy, sql } = build([
      ...BASE,
      { match: /select id from knowledge_nodes where id = \?/, rows: [] },
    ]);
    let message = "";
    try {
      await taxonomy.taxonomy("00000000-0000-4000-8000-00000000dead");
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toBe("knowledge node 00000000-0000-4000-8000-00000000dead not found");
    expect(sql.queries.some((t) => t.includes("from questions q"))).toBe(false);
  });

  test("empty census -> sections [], 0, 0", async () => {
    const { taxonomy } = build([
      { match: LIST_ALL, rows: [] }, // nothing servable
    ]);
    const view = await taxonomy.taxonomy(null);
    expect(view).toEqual({ sections: [], totalDistinctQuestions: 0, totalDistinctFamilies: 0 });
  });
});

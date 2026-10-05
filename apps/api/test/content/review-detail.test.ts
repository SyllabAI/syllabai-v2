/**
 * T-MIG-020 tranche-2 unit tests — the teacher content-review DETAIL
 * surfaces (paperReview / paperAudit / provenance / question topic rows),
 * stubbed-sql (no Neon).
 *
 * The captured golden posture (T-MIG-004 run-002) pins the 404 laws:
 * unknown paper → "exam paper <id> not found" on review/audit/provenance
 * alike; unknown question → "question <id> not found". The populated paths
 * here pin the view mappings (stem/marks fallbacks, ordering legs, criteria
 * defaults) the F-5 real-data tranche will replay against Neon.
 */
import { describe, expect, test } from "bun:test";
import { buildContentModule } from "../../src/services/content";
import { fakeSql, type Route } from "./helpers";

const P1 = "00000000-0000-4000-8000-0000000000a1";
const UNKNOWN_P = "00000000-0000-4000-8000-0000000000e1";
const Q1 = "00000000-0000-4000-8000-0000000000c1";
const V1 = "00000000-0000-4000-8000-0000000000d1";
const S1 = "00000000-0000-4000-8000-0000000000d2";
const MP1 = "00000000-0000-4000-8000-0000000000f1";
const MP2 = "00000000-0000-4000-8000-0000000000f2";
const T1 = "00000000-0000-4000-8000-0000000000011";
const T2 = "00000000-0000-4000-8000-0000000000012";
const ANCHOR = "00000000-0000-4000-8000-0000000000021";
const UNKNOWN_Q = "00000000-0000-4000-8000-0000000000e3";

const PAPER_ROW = {
  id: P1,
  subject_id: "00000000-0000-4000-8000-0000000000s1",
  title: "Chemistry 1C June 2024",
  board: "Edexcel",
  qualification: "GCSE",
  unit: null,
  session_label: "June 2024",
  paper_code: "4CH1/1C",
  question_paper_document_id: "qp-doc-1",
  mark_scheme_document_id: "ms-doc-1",
  validation_state: "SUGGESTED",
  provenance: "PAST_PAPER",
  extraction_method: "glm-ocr-v1",
  created_by: null,
  created_at: "2026-10-04T19:02:13Z",
};

const paperRoute: Route = {
  match: /select \* from exam_papers where id = \?$/i,
  matchParams: (params) => params[0] === P1,
  rows: [PAPER_ROW],
};

const unknownPaperRoute: Route = {
  match: /select \* from exam_papers where id = \?$/i,
  rows: [],
};

const versionRow = (over: Partial<Record<string, unknown>> = {}) => ({
  id: V1,
  question_id: Q1,
  version: 1,
  stem: null, // fallback law: question.stem serves
  marks: 5,
  difficulty: 3,
  expected_time_seconds: 120,
  command_word: "Explain",
  validation_state: "SUGGESTED",
  source_document_id: "qp-doc-1",
  extraction_confidence: 0.91,
  extraction_method: "glm-ocr-v1",
  created_at: "2026-10-04T19:02:13Z",
  ...over,
});

const questionRow = (over: Partial<Record<string, unknown>> = {}) => ({
  id: Q1,
  external_ref: "June2024-1C-Q3",
  question_type: "STRUCTURED",
  stem: "The student heated 2.0 g of copper oxide.",
  marks: 5,
  difficulty: 3,
  expected_time_seconds: 120,
  command_word: "Calculate",
  primary_topic_node_id: T1,
  exam_paper_id: P1,
  active: true,
  created_at: "2026-10-04T19:02:13Z",
  ...over,
});

const schemeRow = {
  id: S1,
  question_version_id: V1,
  version_label: "1",
  validation_state: "SUGGESTED",
  created_at: "2026-10-04T19:02:14Z",
};

const pointRow = (over: Partial<Record<string, unknown>> = {}) => ({
  id: MP1,
  mark_scheme_id: S1,
  question_part_id: null,
  ref: "a",
  ordering: 1,
  text: "2H₂ + O₂ → 2H₂O",
  marks: 2,
  acceptance_criteria: '["states 2H2 + O2", "balances equation"]',
  extraction_confidence: null,
  created_at: "2026-10-04T19:02:14Z",
  ...over,
});

describe("paperReview — the §7 reviewer's full answer key", () => {
  const routes = (pointOver: Partial<Record<string, unknown>> = {}): Route[] => [
    paperRoute,
    {
      match: /select v\.\* from question_versions v/i,
      rows: [versionRow()],
    },
    {
      match: /select \* from questions where id = any/i,
      rows: [questionRow()],
    },
    {
      match: /select \* from question_options where question_id = any/i,
      // rows PRE-SORTED by ordering — the stub emits what the DB would (the
      // SQL carries `order by ordering`; sorting is the engine's job)
      rows: [
        { id: "o2", question_id: Q1, label: "B", option_text: "right", is_correct: true, misconception_node_id: null, ordering: 1 },
        { id: "o1", question_id: Q1, label: "A", option_text: "wrong", is_correct: false, misconception_node_id: T2, ordering: 2 },
      ],
    },
    {
      match: /select \* from question_parts where question_version_id = any/i,
      rows: [
        { id: "pt0", question_version_id: V1, label: "a", prompt: "part a", command_word: "State", marks: 2, ordering: 0 },
        { id: "pt1", question_version_id: V1, label: "b", prompt: "part b", command_word: null, marks: 3, ordering: 1 },
      ],
    },
    {
      match: /select distinct on \(question_version_id\) \*/i,
      rows: [schemeRow],
    },
    {
      match: /select \* from mark_points where mark_scheme_id = any/i,
      rows: [pointRow(pointOver), pointRow({ id: MP2, ref: "b", ordering: 2, acceptance_criteria: null })],
    },
  ];

  test("unknown paper → the captured 404 law", async () => {
    const sql = fakeSql([unknownPaperRoute]);
    const { review } = buildContentModule(sql);
    try {
      await review.paperReview(UNKNOWN_P);
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as Error).message).toBe(`exam paper ${UNKNOWN_P} not found`);
      expect((e as { status?: number }).status).toBe(404);
      expect((e as { code?: string }).code).toBe("not_found");
    }
  });

  test("populated paper maps header + versions with fallbacks and orderings", async () => {
    const sql = fakeSql(routes());
    const { review } = buildContentModule(sql);
    const view = await review.paperReview(P1);
    expect(view.paper).toEqual({
      id: P1,
      subjectId: "00000000-0000-4000-8000-0000000000s1",
      title: "Chemistry 1C June 2024",
      paperCode: "4CH1/1C",
      sessionLabel: "June 2024",
      board: "Edexcel",
      qualification: "GCSE",
      validationState: "SUGGESTED",
    });
    expect(view.versions).toHaveLength(1);
    const v = view.versions[0]!;
    // stem fallback: version.stem null → question.stem (:903)
    expect(v.stem).toBe("The student heated 2.0 g of copper oxide.");
    // marks guard: version.marks > 0 → version.marks (:904)
    expect(v.marks).toBe(5);
    expect(v.versionId).toBe(V1);
    expect(v.questionId).toBe(Q1);
    expect(v.externalRef).toBe("June2024-1C-Q3");
    expect(v.type).toBe("STRUCTURED");
    expect(v.validationState).toBe("SUGGESTED");
    expect(v.commandWord).toBe("Explain"); // the VERSION's, not the question's
    expect(v.schemeId).toBe(S1);
    expect(v.schemeState).toBe("SUGGESTED");
    expect(v.extractionConfidence).toBe(0.91);
    expect(v.sourceDocumentId).toBe("qp-doc-1");
    // options ordered by the entity's @OrderBy("ordering") — B(ordering 1) first
    expect(v.options.map((o) => o.label)).toEqual(["B", "A"]);
    expect(v.options[1]).toEqual({
      id: "o1",
      label: "A",
      text: "wrong",
      correct: false,
      misconceptionNodeId: T2,
    });
    // parts ordered by ordering — a(0) before b(1)
    expect(v.parts.map((p) => p.label)).toEqual(["a", "b"]);
    // points ordered by ordering; null criteria → [] (the Java List.of() law)
    expect(v.points.map((p) => p.ref)).toEqual(["a", "b"]);
    expect(v.points[0]!.acceptanceCriteria).toEqual([
      "states 2H2 + O2",
      "balances equation",
    ]);
    expect(v.points[1]!.acceptanceCriteria).toEqual([]);
  });

  test("corrupted acceptance criteria fail loud (500 path, R10 no-echo)", async () => {
    const sql = fakeSql(routes({ acceptance_criteria: "{not-json" }));
    const { review } = buildContentModule(sql);
    expect(review.paperReview(P1)).rejects.toThrow(
      /acceptance criteria failed to parse/i,
    );
  });

  test("no scheme on a version → schemeId/schemeState null, points []", async () => {
    const sql = fakeSql([
      paperRoute,
      { match: /select v\.\* from question_versions v/i, rows: [versionRow()] },
      { match: /select \* from questions where id = any/i, rows: [questionRow()] },
      { match: /select \* from question_options where question_id = any/i, rows: [] },
      { match: /select \* from question_parts where question_version_id = any/i, rows: [] },
      { match: /select distinct on \(question_version_id\) \*/i, rows: [] },
    ]);
    const { review } = buildContentModule(sql);
    const v = (await review.paperReview(P1)).versions[0]!;
    expect(v.schemeId).toBeNull();
    expect(v.schemeState).toBeNull();
    expect(v.points).toEqual([]);
  });
});

describe("paperAudit — V22 four-way audit union", () => {
  test("unknown paper → the captured 404 law", async () => {
    const sql = fakeSql([unknownPaperRoute]);
    const { review } = buildContentModule(sql);
    expect(review.paperAudit(UNKNOWN_P)).rejects.toThrow(
      `exam paper ${UNKNOWN_P} not found`,
    );
  });

  test("children ids collected per family; rows map with actor rename", async () => {
    const sql = fakeSql([
      paperRoute,
      { match: /select v\.\* from question_versions v/i, rows: [versionRow()] },
      {
        match: /select s\.\* from mark_schemes s/i,
        rows: [schemeRow],
      },
      {
        match: /select \* from questions where exam_paper_id = \?\s*order by difficulty asc/i,
        rows: [questionRow()],
      },
      {
        match: /select \* from content_review_audit/i,
        rows: [
          {
            id: 7,
            occurred_at: "2026-10-04T19:30:00Z",
            actor_user_id: null,
            actor_label: "teacher-2",
            action: "VALIDATE",
            target_type: "question_version",
            target_id: V1,
            from_state: "SUGGESTED",
            to_state: "VALIDATED",
            detail: "",
          },
          {
            id: 6,
            occurred_at: "2026-10-04T19:10:00Z",
            actor_user_id: null,
            actor_label: "teacher-1",
            action: "PLACE",
            target_type: "exam_paper",
            target_id: P1,
            from_state: null,
            to_state: null,
            detail: "subject 00000000-0000-4000-8000-0000000000s1 (CH: Chemistry)",
          },
        ],
      },
    ]);
    const { review } = buildContentModule(sql);
    const rows = await review.paperAudit(P1);
    expect(rows).toHaveLength(2);
    // wire shape: occurredAt ISO string, actor (NOT actorLabel), states verbatim
    expect(rows[0]).toEqual({
      occurredAt: "2026-10-04T19:30:00.000Z",
      actor: "teacher-2",
      action: "VALIDATE",
      targetType: "question_version",
      targetId: V1,
      fromState: "SUGGESTED",
      toState: "VALIDATED",
      detail: "",
    });
    expect(rows[1]!.occurredAt).toBe("2026-10-04T19:10:00.000Z");
    expect(rows[1]!.fromState).toBeNull();
    // the union query pins its four-way type-scoped shape (whitespace around
    // placeholders is template-literal noise — match with regexes)
    const auditQuery = sql.queries.find((q) => q.includes("content_review_audit"))!;
    expect(auditQuery).toMatch(/target_type = 'exam_paper' and target_id = \?/);
    expect(auditQuery).toMatch(/target_type = 'question_version' and target_id = any\(\s*\?\s*::uuid\[\]\)/);
    expect(auditQuery).toMatch(/target_type = 'mark_scheme' and target_id = any\(\s*\?\s*::uuid\[\]\)/);
    expect(auditQuery).toMatch(/target_type = 'question' and target_id = any\(\s*\?\s*::uuid\[\]\)/);
    expect(auditQuery).toMatch(/order by occurred_at desc/);
  });
});

describe("paperProvenance — fail-closed source identities", () => {
  test("unknown paper → 'exam paper <id> not found' (captured)", async () => {
    const sql = fakeSql([unknownPaperRoute]);
    const { review } = buildContentModule(sql);
    expect(review.paperProvenance(UNKNOWN_P)).rejects.toThrow(
      `exam paper ${UNKNOWN_P} not found`,
    );
  });

  test("null or blank QP/MS document id → no provenance to expose", async () => {
    const sql = fakeSql([
      {
        ...paperRoute,
        rows: [
          { ...PAPER_ROW, question_paper_document_id: null, mark_scheme_document_id: "  " },
        ],
      },
    ]);
    const { review } = buildContentModule(sql);
    expect(review.paperProvenance(P1)).rejects.toThrow(
      `provenance for exam paper ${P1} not found`,
    );
  });

  test("missing QP document row → fail-closed 404", async () => {
    const sql = fakeSql([
      paperRoute,
      {
        match: /where document_id = \?\s*order by doc_version desc limit 1/i,
        rows: [],
      },
    ]);
    const { review } = buildContentModule(sql);
    expect(review.paperProvenance(P1)).rejects.toThrow(
      `provenance for exam paper ${P1} not found`,
    );
  });

  test("happy path maps DocumentIdentity for both source documents", async () => {
    const docRow = (documentId: string) => ({
      id: `row-${documentId}`,
      document_id: documentId,
      schema_version: "1.0",
      doc_version: 2,
      kind: documentId.startsWith("qp") ? "QUESTION_PAPER" : "MARK_SCHEME",
      source_uri: `file:///corpus/${documentId}.pdf`,
      file_name: `${documentId}.pdf`,
      mime_type: "application/pdf",
      checksum: `ck-${documentId}`,
      checksum_algorithm: "SHA-256",
      page_count: 12,
      element_count: 340,
      text_element_count: 300,
      chunk_count: 44,
      source_engine: "syllabai-parser",
      source_engine_version: "1.0.0",
      extracted_at: null,
      canonical_json: "{}",
      ingested_by: null,
      validation_state: "VALIDATED",
      created_at: "2026-10-04T19:02:13Z",
    });
    const sql = fakeSql([
      paperRoute,
      {
        match: /where document_id = \?\s*order by doc_version desc limit 1/i,
        matchParams: (params) => params[0] === "qp-doc-1",
        rows: [docRow("qp-doc-1")],
      },
      {
        match: /where document_id = \?\s*order by doc_version desc limit 1/i,
        matchParams: (params) => params[0] === "ms-doc-1",
        rows: [docRow("ms-doc-1")],
      },
    ]);
    const { review } = buildContentModule(sql);
    const view = await review.paperProvenance(P1);
    expect(view.paperId).toBe(P1);
    expect(view.questionPaper).toEqual({
      documentId: "qp-doc-1",
      fileName: "qp-doc-1.pdf",
      sourceUri: "file:///corpus/qp-doc-1.pdf",
      checksum: "ck-qp-doc-1",
      checksumAlgorithm: "SHA-256",
    });
    expect(view.markScheme.documentId).toBe("ms-doc-1");
  });
});

describe("questionTopicRows — §10 anchor-state visibility", () => {
  const topicRoutes = (opts: {
    question: Record<string, unknown> | [];
    topics: Array<Record<string, unknown>>;
    nodes: Array<Record<string, unknown>>;
  }): Route[] => [
    {
      match: /select \* from questions where id = \?$/i,
      rows: Array.isArray(opts.question) ? opts.question : [opts.question],
    },
    { match: /select \* from question_topics where question_id = \?$/i, rows: opts.topics },
    { match: /select id, code, title from knowledge_nodes where id = any/i, rows: opts.nodes },
  ];

  test("unknown question → the captured 404 law", async () => {
    const sql = fakeSql([
      { match: /select \* from questions where id = \?$/i, rows: [] },
    ]);
    const { review } = buildContentModule(sql);
    expect(review.questionTopicRows(UNKNOWN_Q)).rejects.toThrow(
      `question ${UNKNOWN_Q} not found`,
    );
  });

  test("rows map with their node code/title; missing node → nulls", async () => {
    const sql = fakeSql(
      topicRoutes({
        question: questionRow(),
        topics: [
          { id: "t1", question_id: Q1, node_id: T1, is_primary: true },
          { id: "t2", question_id: Q1, node_id: T2, is_primary: false },
        ],
        nodes: [{ id: T1, code: "1.3", title: "Ionic bonding" }],
      }),
    );
    const { review } = buildContentModule(sql);
    expect(await review.questionTopicRows(Q1)).toEqual([
      { nodeId: T1, primary: true, code: "1.3", title: "Ionic bonding" },
      { nodeId: T2, primary: false, code: null, title: null },
    ]);
  });

  test("anchor synthesis: no primary row + primary_topic_node_id → anchor row first", async () => {
    const sql = fakeSql(
      topicRoutes({
        question: questionRow({ primary_topic_node_id: ANCHOR }),
        topics: [{ id: "t2", question_id: Q1, node_id: T2, is_primary: false }],
        nodes: [{ id: ANCHOR, code: "ING-paper-a1", title: "Ingestion anchor" }],
      }),
    );
    const { review } = buildContentModule(sql);
    expect(await review.questionTopicRows(Q1)).toEqual([
      { nodeId: ANCHOR, primary: true, code: "ING-paper-a1", title: "Ingestion anchor" },
      { nodeId: T2, primary: false, code: null, title: null },
    ]);
  });

  test("anchor node missing from knowledge_nodes → row with null code/title", async () => {
    const sql = fakeSql(
      topicRoutes({
        question: questionRow({ primary_topic_node_id: ANCHOR }),
        topics: [],
        nodes: [],
      }),
    );
    const { review } = buildContentModule(sql);
    expect(await review.questionTopicRows(Q1)).toEqual([
      { nodeId: ANCHOR, primary: true, code: null, title: null },
    ]);
  });
});

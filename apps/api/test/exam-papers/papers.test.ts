/**
 * ExamPaperViews law tests (T-MIG-031 tranche 1).
 * Frozen law: ExamPaperController.java @ 6cad6ef.
 */
import { describe, expect, test } from "bun:test";
import { ExamPaperViews } from "../../src/services/exam-papers/papers";
import { ServableQuestions } from "../../src/services/questions/servable";
import {
  PAPER_DOC_ID,
  PAPER_OK_ID,
  PAPER_REJECTED_ID,
  STRUCTURED_ID,
  UNKNOWN_ID,
  VERSION_ID,
  fakeSql,
  servableRoutes,
} from "../questions/helpers";

const PAPER_ROW = {
  id: PAPER_OK_ID,
  subject_id: "44000000-0000-4000-8000-000000000001",
  title: "Chemistry Paper 1",
  board: "Edexcel",
  qualification: "GCSE",
  unit: null,
  session_label: "June 2022",
  paper_code: "4CH1/1C",
  question_paper_document_id: PAPER_DOC_ID,
  mark_scheme_document_id: null,
  validation_state: "VALIDATED",
  provenance: "PAST_PAPER",
  created_at: "2022-06-01T00:00:00Z",
};

const PAPER_QUESTION_ROW = {
  id: STRUCTURED_ID,
  external_ref: "sme-eq-1-1-states-of-matter-q16-p1",
  marks: 3,
  provenance: "PAST_PAPER",
};

function build(extra: Parameters<typeof servableRoutes>[0] = []) {
  const sql = fakeSql([
    ...extra,
    ...servableRoutes([{ match: /from questions q where q\.exam_paper_id = \?/, rows: [PAPER_QUESTION_ROW] }]),
    {
      // batched latest-version heads (Java N+1 ported batched, R-M-LAZY);
      // rows arrive in the ORDER BY v.question_id, v.version desc shape the
      // statement promises — first row per question = the latest version
      match: /select v\.question_id, v\.id as version_id/,
      rows: [
        { question_id: STRUCTURED_ID, version_id: "61000000-0000-4000-8000-000000000009", version: 2, validation_state: "VALIDATED", part_count: 2 },
        { question_id: STRUCTURED_ID, version_id: VERSION_ID, version: 1, validation_state: "SUGGESTED", part_count: 2 },
      ],
    },
  ]);
  return { sql, views: new ExamPaperViews(sql, new ServableQuestions(sql)) };
}

describe("exam-papers list", () => {
  test("all papers, newest-first by created_at; PaperView.from field mapping", async () => {
    const { sql, views } = build([
      {
        match: /from exam_papers p order by p\.created_at desc/,
        rows: [PAPER_ROW],
      },
    ]);
    const out = await views.list(null);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      id: PAPER_OK_ID,
      subjectId: "44000000-0000-4000-8000-000000000001",
      title: "Chemistry Paper 1",
      board: "Edexcel",
      qualification: "GCSE",
      unit: null,
      sessionLabel: "June 2022",
      paperCode: "4CH1/1C",
      validationState: "VALIDATED",
      provenance: "PAST_PAPER",
      questionPaperDocumentId: PAPER_DOC_ID,
      markSchemeDocumentId: null,
    });
    expect(sql.queries[0]).toMatch(/order by p\.created_at desc/);
  });

  test("subjectId filter swaps the WHERE clause", async () => {
    const { sql, views } = build([
      {
        match: /from exam_papers p where p\.subject_id = \? order by p\.created_at desc/,
        rows: [PAPER_ROW],
      },
    ]);
    await views.list("44000000-0000-4000-8000-000000000001");
    expect(sql.queries[0]).toMatch(/where p\.subject_id = \?/);
  });
});

describe("exam-papers detail", () => {
  test("unknown paper -> 404 NotFoundException('exam paper', id)", async () => {
    const { views } = build([
      { match: /from exam_papers p where p\.id = \?/, rows: [] },
    ]);
    let message = "";
    try {
      await views.detail(UNKNOWN_ID);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toBe(`exam paper ${UNKNOWN_ID} not found`);
  });

  test("PaperDetailView: latest version head per question (batched), partCount, specPoints via the T-C28 shared projection", async () => {
    const { views, sql } = build([
      { match: /from exam_papers p where p\.id = \?/, rows: [PAPER_ROW] },
    ]);
    const detail = await views.detail(PAPER_OK_ID);
    expect(detail.paper.id).toBe(PAPER_OK_ID);
    expect(detail.questions).toHaveLength(1);
    const q = detail.questions[0]!;
    expect(q.questionId).toBe(STRUCTURED_ID);
    expect(q.marks).toBe(3);
    expect(q.provenance).toBe("PAST_PAPER");
    // latest = max version (v2 VALIDATED), not the first row returned
    expect(q.currentVersionId).toBe("61000000-0000-4000-8000-000000000009");
    expect(q.versionValidationState).toBe("VALIDATED");
    expect(q.partCount).toBe(2);
    // spec points ride the SAME projection the learner views use
    // (PRIMARY first), honest-absent = empty for unmapped questions
    expect(q.specPoints.map((r) => r.role)).toEqual(["PRIMARY", "SECONDARY"]);
    // batched fetch law: ONE versions statement for the whole paper
    expect(sql.queries.filter((t) => t.includes("from question_versions v"))).toHaveLength(1);
  });

  test("question with NO version: versionValidationState null, currentVersionId null, partCount 0 (never null)", async () => {
    const { views } = build([
      { match: /from exam_papers p where p\.id = \?/, rows: [PAPER_ROW] },
      {
        match: /from questions q where q\.exam_paper_id = \?/,
        rows: [{ ...PAPER_QUESTION_ROW, id: "41000000-0000-4000-8000-000000000099" }],
      },
      {
        match: /select v\.question_id, v\.id as version_id/,
        rows: [], // no versions at all
      },
    ]);
    const detail = await views.detail(PAPER_OK_ID);
    const q = detail.questions[0]!;
    expect(q.versionValidationState).toBeNull();
    expect(q.currentVersionId).toBeNull();
    expect(q.partCount).toBe(0);
    expect(q.specPoints).toEqual([]); // honest absence
  });

  test("REJECTED paper papers still list (the browse surface is not the serving gate)", async () => {
    const { views } = build([
      {
        match: /from exam_papers p order by p\.created_at desc/,
        rows: [{ ...PAPER_ROW, id: PAPER_REJECTED_ID, validation_state: "REJECTED" }],
      },
    ]);
    const out = await views.list(null);
    expect(out[0]!.validationState).toBe("REJECTED");
  });
});

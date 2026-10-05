/**
 * T-MIG-031 tranche-2 route tests — the observable HTTP contract of
 * ExamPaperController (GET /api/v1/exam-papers, GET /api/v1/exam-papers/{id})
 * over REAL services on stubbed sql (the 032 route-test pattern). 200 bodies
 * validated against the CANONICAL T-MIG-018 schemas (examPaperViewSchema /
 * examPaperDetailResponseSchema); error envelopes pinned to the captured
 * Boot 401 + the frozen handler law (malformed-request 400, the shared
 * NotFoundException "exam paper" envelope).
 */
import { describe, expect, test } from "bun:test";
import { Hono, type Context } from "hono";
import { createExamPapersRouter } from "../../src/routes/exam-papers";
import { ExamPaperViews } from "../../src/services/exam-papers";
import { ServableQuestions } from "../../src/services/questions";
import { toErrorResponse } from "../../src/services/identity/errors";
import { examPaperDetailResponseSchema, examPaperViewSchema } from "@syllabai/contracts";
import {
  PAPER_DOC_ID,
  PAPER_OK_ID,
  PAPER_REJECTED_ID,
  STRUCTURED_ID,
  UNKNOWN_ID,
  VERSION_ID,
  fakeSql,
  servableRoutes,
  type Route,
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

function baseRoutes(): Route[] {
  return [
    { match: /from exam_papers p order by p\.created_at desc/, rows: [] },
    { match: /from exam_papers p where p\.subject_id = \? order by p\.created_at desc/, rows: [PAPER_ROW] },
    { match: /from exam_papers p\s*where p\.id = \?/, rows: [PAPER_ROW], rowsFor: (p) => (p[0] === UNKNOWN_ID ? [] : [PAPER_ROW]) },
    { match: /from questions q where q\.exam_paper_id = \?/, rows: [PAPER_QUESTION_ROW] },
    {
      // batched latest-version heads (Java N+1 ported batched, R-M-LAZY)
      match: /select v\.question_id, v\.id as version_id/,
      rows: [{ question_id: STRUCTURED_ID, version_id: VERSION_ID, version: 2, validation_state: "VALIDATED", part_count: 2 }],
    },
  ];
}

function makeApp(auth: (c: Context) => Record<string, unknown> | null, extra: Route[] = []) {
  const sql = fakeSql([...extra, ...baseRoutes(), ...servableRoutes()]);
  const papers = new ExamPaperViews(sql, new ServableQuestions(sql));
  const app = new Hono();
  app.use("*", async (c, next) => {
    const a = auth(c);
    if (a) c.set("syllabai.auth" as never, a as never);
    await next();
  });
  app.route("/api/v1/exam-papers", createExamPapersRouter(papers));
  app.onError((err, c) => {
    const mapped = toErrorResponse(err);
    if (mapped) return c.json(mapped.body, mapped.status as 400 | 404);
    console.error("[test] unhandled error:", err);
    return c.json({ status: 500, error: "internal_error", message: "an internal error occurred", timestamp: "2026-10-05T00:00:00Z" }, 500 as const);
  });
  return { app, sql };
}

const STUDENT = { email: "student@example.edu", userId: "aa645313-5930-4381-91ed-caff67a2f836", roles: ["STUDENT"], tokenVersion: 1 };
const asStudent = () => STUDENT;
const anon = () => null;

const BASE = "/api/v1/exam-papers";

describe("authz shell (SecurityConfig.java:91 parity — any authenticated user)", () => {
  test("unauthed list → 401 Boot body (w3-exam-papers-list-unauthed-401)", async () => {
    const res = await makeApp(anon).app.request(BASE);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
    expect(body.path).toBe(BASE);
    expect(typeof body.timestamp).toBe("string");
  });

  test("unauthed detail → same 401 shell (w3-exam-paper-unknown-uuid-unauthed-401)", async () => {
    const res = await makeApp(anon).app.request(`${BASE}/${UNKNOWN_ID}`);
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("Unauthorized");
  });
});

describe("GET / (list :42-48)", () => {
  test("student → 200 [] (w3-exam-papers-student-403-or-state captured truth: empty seed state)", async () => {
    const { app } = makeApp(asStudent);
    const res = await app.request(BASE);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  test("student with rows → 200 canonical ExamPaperView[], newest-first by created_at", async () => {
    const { app, sql } = makeApp(asStudent, [
      { match: /from exam_papers p order by p\.created_at desc/, rows: [PAPER_ROW] },
    ]);
    const res = await app.request(BASE);
    expect(res.status).toBe(200);
    const views = examPaperViewSchema.array().parse(await res.json());
    expect(views).toHaveLength(1);
    expect(views[0]).toEqual({
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
    const listQuery = sql.queries.find((q) => q.includes("from exam_papers p"))!;
    expect(listQuery).toMatch(/order by p\.created_at desc/);
  });

  test("subjectId filter binds the WHERE clause (findAllBySubjectIdOrderByCreatedAtDesc)", async () => {
    const subjectId = "44000000-0000-4000-8000-000000000001";
    const { app, sql } = makeApp(asStudent);
    const res = await app.request(`${BASE}?subjectId=${subjectId}`);
    expect(res.status).toBe(200);
    examPaperViewSchema.array().parse(await res.json());
    const listQuery = sql.queries.find((q) => q.includes("from exam_papers p"))!;
    expect(listQuery).toMatch(/where p\.subject_id = \? order by p\.created_at desc/);
  });

  test("unparseable subjectId → 400 bad_request 'malformed request' (UUID conversion parity)", async () => {
    const res = await makeApp(asStudent).app.request(`${BASE}?subjectId=not-a-uuid`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ status: 400, error: "bad_request", message: "malformed request", timestamp: expect.any(String) });
  });
});

describe("GET /:id (get :50-74)", () => {
  test("known paper → 200 canonical ExamPaperDetailResponse (T-C28 specPointRefs, batched version heads)", async () => {
    const res = await makeApp(asStudent).app.request(`${BASE}/${PAPER_OK_ID}`);
    expect(res.status).toBe(200);
    const detail = examPaperDetailResponseSchema.parse(await res.json());
    expect(detail.paper.id).toBe(PAPER_OK_ID);
    expect(detail.questions).toHaveLength(1);
    const q = detail.questions[0]!;
    expect(q).toEqual({
      questionId: STRUCTURED_ID,
      externalRef: "sme-eq-1-1-states-of-matter-q16-p1",
      marks: 3,
      provenance: "PAST_PAPER",
      versionValidationState: "VALIDATED",
      partCount: 2,
      currentVersionId: VERSION_ID,
      specPoints: [
        { code: "4CH1-1.15", role: "PRIMARY", applicability: { papers: ["4CH1"] } },
        { code: "4CH1-2.3", role: "SECONDARY", applicability: null },
      ],
    });
  });

  test("honest absence: a question with NO version carries null state, partCount 0, empty specPoints", async () => {
    const res = await makeApp(asStudent, [
      { match: /from questions q where q\.exam_paper_id = \?/, rows: [{ ...PAPER_QUESTION_ROW, id: UNKNOWN_ID }] },
      { match: /select v\.question_id, v\.id as version_id/, rows: [] },
      { match: /from question_spec_points qsp/, rows: [] },
    ]).app.request(`${BASE}/${PAPER_OK_ID}`);
    expect(res.status).toBe(200);
    const detail = examPaperDetailResponseSchema.parse(await res.json());
    expect(detail.questions[0]).toMatchObject({
      questionId: UNKNOWN_ID,
      versionValidationState: null,
      partCount: 0,
      currentVersionId: null,
      specPoints: [],
    });
  });

  test("unknown paper → 404 'exam paper {uuid} not found' (shared NotFoundException envelope)", async () => {
    const res = await makeApp(asStudent).app.request(`${BASE}/${UNKNOWN_ID}`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.status).toBe(404);
    expect(body.error).toBe("not_found");
    expect(body.message).toBe(`exam paper ${UNKNOWN_ID} not found`);
    expect(typeof body.timestamp).toBe("string");
  });

  test("bad uuid path → 400 bad_request 'malformed request' (MethodArgumentTypeMismatch parity)", async () => {
    const res = await makeApp(asStudent).app.request(`${BASE}/not-a-uuid`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("bad_request");
    expect(body.message).toBe("malformed request");
  });
});

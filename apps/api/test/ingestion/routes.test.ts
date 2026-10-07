/**
 * Tranche-B route pins (T-MIG-082 tranche B) — the observable HTTP
 * contract of RoutingController, GlmOcrIngestionController and
 * TeacherExamSeriesImportController over an IN-MEMORY Hono app wiring the
 * REAL tranche-B services over fakeSql fixtures (the revision-notes/
 * fleet cross-module test-helper precedent), no Neon.
 *
 * Pinned laws:
 *   - the authz shells: all three routers answer the Boot 401 body with
 *     the request path for anonymous callers and the Boot 403 body for
 *     authenticated non-teacher callers BEFORE any handler work (the
 *     SecurityConfig /api/v1/teacher/** + @PreAuthorize M5 posture);
 *   - the query binding laws: missing query/nodeCode → 400
 *     validation_failed "missing required parameter: …"; PRESENT-BLANK
 *     query → the catch-all 500 (HandlerMethodValidationException is
 *     unhandled by the frozen handler); Integer conversion errors → 400
 *     bad_request "malformed request";
 *   - the courseRef law (ADR-030): present → resolveForCourse fail-closed,
 *     absent/blank → resolveActive, unresolved → the honest empty views
 *     (FetchView parsed:null / EnumerateView mode:"unscoped") — NO fallback;
 *   - the glm-ocr wire: 201 PairResultView (status DUPLICATE | INGESTED),
 *     the rerun idempotency, the bundle-mix 409, missing subtree → 500,
 *     subtree shape-mismatch → 500 (treeToValue parity), malformed JSON →
 *     400 malformed_body; findings: MISSING record 404 vs empty findings
 *     clean 200 [], malformed uuid 400;
 *   - the exam-series wire: 200 summary, the fail-closed 409s, unknown
 *     ROW field → 400 malformed_body (ignoreUnknown = FALSE), missing
 *     board → 409.
 *
 * 200/201 bodies are validated against the CANONICAL contracts schemas
 * (ingestion.ts). Determinism: the shared fixed clock (ADR-031).
 */
import { describe, expect, test } from "bun:test";
import { Hono, type Context } from "hono";
import {
  createContentRoutingRouter,
  createGlmOcrRouter,
  createExamSeriesImportRouter,
  type IngestionDeps,
} from "../../src/routes/ingestion";
import type { CurriculumScopeResolver } from "../../src/services/content/scope";
import { CurriculumScope } from "../../src/services/content/scope";
import { toErrorResponse } from "../../src/services/identity/errors";
import { getAuth } from "../../src/middleware/auth";
import type { TxSqlFn } from "../../src/routes/ingestion";
import { fakeSql, type Route } from "../curriculum/helpers";
import { txSql as smeTxSql } from "../sme/helpers";
import {
  fetchViewSchema,
  enumerateViewSchema,
  glmPairResultViewSchema,
  examSeriesImportSummarySchema,
  canonicalDocumentSchema,
  glmPaperDraftSchema,
  glmMarkSchemeDraftSchema,
  glmReconciliationSchema,
  derivedDocumentId,
} from "@syllabai/contracts";

const USER = "f1000000-0000-4000-8000-000000000001";
const TEACHER = "f1000000-0000-4000-8000-0000000000aa";
const FIXED_NOW = new Date("2026-10-07T06:00:00Z");

type AuthFn = (c: Context) => Record<string, unknown> | null;

const SCOPE: CurriculumScope = {
  curriculumVersionId: "10000000-0000-0000-0000-000000000001",
  code: "IAL-CHEM-2018",
  surface: new Set<string>(),
};

interface AppOpts {
  routes?: Route[];
  /** undefined → resolved scope; null → unresolved (the honest empty views) */
  scope?: CurriculumScope | null;
}

function makeApp(auth: AuthFn, opts: AppOpts = {}) {
  const routes = opts.routes ?? [];
  const sql = smeTxSql(routes) as unknown as TxSqlFn;
  const scopeStub = {
    resolveActive: async () => (opts.scope === undefined ? SCOPE : opts.scope),
    resolveForCourse: async (ref: string) =>
      ref === "IAL-CHEM-2018" && opts.scope !== null ? SCOPE : null,
  } as unknown as CurriculumScopeResolver;
  const deps: IngestionDeps = {
    sql,
    clock: { now: () => FIXED_NOW },
    app: {
      scope: scopeStub,
      requesterId: (c: Context) => getAuth(c)?.userId ?? null,
    },
  };
  const app = new Hono();
  app.use("*", async (c, next) => {
    const a = auth(c);
    if (a) c.set("syllabai.auth" as never, a as never);
    await next();
  });
  app.route("/api/v1/teacher/content", createContentRoutingRouter(deps));
  app.route("/api/v1/teacher/content/glm-ocr", createGlmOcrRouter(deps));
  app.route("/api/v1/teacher/curriculum/exam-series", createExamSeriesImportRouter(deps));
  app.onError((err, c) => {
    const mapped = toErrorResponse(err);
    if (mapped) return c.json(mapped.body, mapped.status as 400 | 404 | 409);
    console.error("[test] unhandled error:", err);
    return c.json(
      { status: 500, error: "internal_error", message: "an internal error occurred", timestamp: "2026-10-07T06:00:00Z" },
      500 as const,
    );
  });
  return { app, sql };
}

const asTeacher = () => ({
  email: "teacher@example.edu", userId: TEACHER, roles: ["TEACHER"], tokenVersion: 1,
});
const asStudent = () => ({
  email: "student@example.edu", userId: USER, roles: ["STUDENT"], tokenVersion: 1,
});
const anon = () => null;

// ── the authz shells (M5: the gate answers before any handler work) ─────────

describe("tranche-B authz shells", () => {
  test("anonymous: Boot 401 body with the request path on all three routers", async () => {
    const { app } = makeApp(anon);
    for (const path of [
      "/api/v1/teacher/content/fetch?query=x",
      "/api/v1/teacher/content/enumerate?query=x",
      "/api/v1/teacher/content/enumerate/structured?nodeCode=4CH1-2.36",
      "/api/v1/teacher/content/glm-ocr/pairs",
      "/api/v1/teacher/content/glm-ocr/papers/00000000-0000-0000-0000-000000000001/findings",
      "/api/v1/teacher/curriculum/exam-series",
    ]) {
      const res = await app.request(path, { method: path.includes("pairs") || path.includes("exam-series") ? "POST" : "GET" });
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Unauthorized");
      expect(body.path).toBe(new URL(path, "http://x").pathname);
    }
  });

  test("authenticated non-teacher: Boot 403 (TEACHER/ADMIN)", async () => {
    const { app } = makeApp(asStudent);
    const res = await app.request("/api/v1/teacher/content/fetch?query=4CH1%202020");
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("Forbidden");
  });
});

// ── fetch/enumerate/structured (RoutingController) ──────────────────────────

const fetchRoutes: Route[] = [
  { match: /select distinct s\.code from subjects s/, rows: [{ code: "4CH1" }] },
  {
    match: /from exam_papers ep\s*join subjects s/,
    rows: [
      {
        id: "20000000-0000-0000-0000-000000000001", paper_code: "4CH1/1C",
        session_label: "June 2020", series: "JUN", year: 2020,
        validation_state: "VALIDATED", question_paper_document_id: "qp", mark_scheme_document_id: "ms",
      },
    ],
  },
  {
    match: /q\.exam_paper_id = \? ::uuid and q\.external_ref ~ \?/,
    rows: [
      { id: "30000000-0000-0000-0000-000000000001", external_ref: "q7-aa", stem: "Explain…", marks: 4, question_type: "STRUCTURED", command_word: "Explain" },
    ],
  },
  { match: /from question_parts qp\s*join question_versions qv/, rows: [{ label: "a", prompt: "p", marks: 4 }] },
  { match: /from mark_points mp\s*join mark_schemes ms/, rows: [{ ref: "7-a", text: "ions", marks: 4 }] },
];

const enumeratePaperRoutes: Route[] = [
  {
    match: /from exam_papers ep\s*join subjects s/,
    rows: [
      { id: "20000000-0000-0000-0000-000000000001", paper_code: "4CH0/1C", session_label: "Summer 2013", series: "JUN", year: 2013 },
    ],
  },
  {
    match: /from questions q\s*where q\.exam_paper_id = \? ::uuid and q\.provenance/,
    rows: [
      { id: "30000000-0000-0000-0000-000000000001", external_ref: "q1-aa", stem: "s", marks: 2, question_type: "STRUCTURED" },
    ],
  },
];

describe("fetch — the wire contract (GET /api/v1/teacher/content/fetch)", () => {
  test("missing query → 400 validation_failed (MissingServletRequestParameter parity)", async () => {
    const { app } = makeApp(asTeacher, { routes: fetchRoutes });
    const res = await app.request("/api/v1/teacher/content/fetch");
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ status: 400, error: "validation_failed", message: "missing required parameter: query" });
  });

  test("PRESENT-BLANK query → the catch-all 500 (HandlerMethodValidationException parity)", async () => {
    const { app } = makeApp(asTeacher, { routes: fetchRoutes });
    const res = await app.request("/api/v1/teacher/content/fetch?query=%20%20");
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("internal_error");
  });

  test("happy path → the FetchView wire shape over the resolved scope", async () => {
    const { app } = makeApp(asTeacher, { routes: fetchRoutes });
    const res = await app.request("/api/v1/teacher/content/fetch?query=" + encodeURIComponent("mark scheme for 4CH1/1C June 2020 question 7"));
    expect(res.status).toBe(200);
    const view = fetchViewSchema.parse(await res.json());
    expect(view.parsed!.paperCode).toBe("4CH1/1C");
    expect(view.papers[0]!.paperCode).toBe("4CH1/1C");
    expect(view.papers[0]!.question!.parts).toHaveLength(1);
  });

  test("unresolved scope → the honest empty view (parsed null), resolveActive path", async () => {
    const { app } = makeApp(asTeacher, { routes: fetchRoutes, scope: null });
    const res = await app.request("/api/v1/teacher/content/fetch?query=4CH1%2F1C%202020");
    expect(res.status).toBe(200);
    const view = fetchViewSchema.parse(await res.json());
    expect(view.parsed).toBeNull();
    expect(view.papers).toEqual([]);
    expect(view.parseDefect).toBe(false);
  });

  test("courseRef → resolveForCourse (ADR-030); unknown ref refuses, no fallback", async () => {
    const { app } = makeApp(asTeacher, { routes: fetchRoutes, scope: null });
    const res = await app.request("/api/v1/teacher/content/fetch?query=4CH1%2F1C%202020&courseRef=NOPE");
    expect(res.status).toBe(200);
    expect(((await res.json()) as { parsed: unknown }).parsed).toBeNull();
  });
});

describe("enumerate — the wire contract", () => {
  test("paper axis happy path → EnumerateView { result: … }", async () => {
    const { app } = makeApp(asTeacher, { routes: enumeratePaperRoutes });
    const res = await app.request("/api/v1/teacher/content/enumerate?query=" + encodeURIComponent("every question in the Summer 2013 paper 4CH0/1C"));
    expect(res.status).toBe(200);
    const view = enumerateViewSchema.parse(await res.json());
    expect(view.result.mode).toBe("paper");
    expect(view.result.questions).toHaveLength(1);
  });

  test("unresolved scope → mode 'unscoped' (the route renders the empty view BEFORE any axis)", async () => {
    const { app } = makeApp(asTeacher, { routes: [], scope: null });
    const res = await app.request("/api/v1/teacher/content/enumerate?query=4CH0%2F1C%20paper%202013");
    const view = enumerateViewSchema.parse(await res.json());
    expect(view.result.mode).toBe("unscoped");
  });

  test("resolved scope + no axis match → mode 'unparsed' (the service runs, honestly empty)", async () => {
    const { app } = makeApp(asTeacher, { routes: [] });
    const res = await app.request("/api/v1/teacher/content/enumerate?query=hello%20world");
    expect(enumerateViewSchema.parse(await res.json()).result.mode).toBe("unparsed");
  });

  test("structured: missing nodeCode → 400; bad yearFrom → 400 malformed", async () => {
    const { app } = makeApp(asTeacher, { routes: [] });
    const res = await app.request("/api/v1/teacher/content/enumerate/structured");
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "validation_failed", message: "missing required parameter: nodeCode" });
    const res2 = await app.request("/api/v1/teacher/content/enumerate/structured?nodeCode=4CH1-2.36&yearFrom=abc");
    expect(res2.status).toBe(400);
    expect((await res2.json()).error).toBe("bad_request");
  });

  test("structured axis=spec + the topic default (equalsIgnoreCase law)", async () => {
    const routes: Route[] = [
      {
        match: /from knowledge_nodes kn where \( \? ::text is null or lower\(kn\.code\)/,
        rows: [{ id: "40000000-0000-0000-0000-000000000002", code: "4CH1-2.36", title: "Titration" }],
      },
      { match: /from question_spec_points axis/, rows: [] },
      { match: /from question_topics axis/, rows: [] },
    ];
    const { app } = makeApp(asTeacher, { routes });
    const spec = await app.request("/api/v1/teacher/content/enumerate/structured?nodeCode=4CH1-2.36&axis=SPEC");
    expect(enumerateViewSchema.parse(await spec.json()).result.mode).toBe("spec");
    const topic = await app.request("/api/v1/teacher/content/enumerate/structured?nodeCode=4CH1-2.36");
    expect(enumerateViewSchema.parse(await topic.json()).result.mode).toBe("topic");
  });
});

// ── glm-ocr (GlmOcrIngestionController) ─────────────────────────────────────

// the P-6 mirror: documentId is DERIVED from checksum+engine+engineVersion
const QP_DOC_ID = derivedDocumentId("aa".repeat(32), "glm-ocr", "1.0");
const MS_DOC_ID = derivedDocumentId("bb".repeat(32), "glm-ocr", "1.0");
const QP_CANONICAL = canonicalDocumentSchema.parse({
  documentId: QP_DOC_ID,
  schemaVersion: "1.0",
  version: 1,
  pageCount: 1,
  source: { uri: "file:///qp.pdf", checksum: "aa".repeat(32), mimeType: "application/pdf" },
  provenance: { engine: "glm-ocr", engineVersion: "1.0", extractedAt: "2026-10-01T00:00:00Z" },
  textBlocks: [
    { element_id: "t1", element_type: "P", page_number: 1, reading_order: 0, text: "QP text", group_key: "q1", source_engine: "glm-ocr", source_engine_version: "1.0" },
  ],
});
const MS_CANONICAL = canonicalDocumentSchema.parse({
  documentId: MS_DOC_ID,
  schemaVersion: "1.0",
  version: 1,
  pageCount: 1,
  source: { uri: "file:///ms.pdf", checksum: "bb".repeat(32), mimeType: "application/pdf" },
  provenance: { engine: "glm-ocr", engineVersion: "1.0", extractedAt: "2026-10-01T00:00:00Z" },
  textBlocks: [
    { element_id: "m1", element_type: "P", page_number: 1, reading_order: 0, text: "MS text", group_key: "q1", source_engine: "glm-ocr", source_engine_version: "1.0" },
  ],
});
const QP_DRAFT = glmPaperDraftSchema.parse({
  schemaVersion: "1.0", extractionMethod: "glm-ocr-qp-v1", reviewRequired: false,
  paper: { canonicalDocumentId: QP_DOC_ID, session: "June 2020", paperReference: "4CH1/1C" },
  questions: [{ questionId: "q1-aa", number: 1, stem: "What is…", marks: 2, marksKnown: true, confidence: 0.9, parts: [] }],
  paperTotal: 2,
  warnings: ["QP cover partially unreadable"],
});
const MS_DRAFT = glmMarkSchemeDraftSchema.parse({
  schemaVersion: "1.0", extractionMethod: "glm-ocr-ms-v1", reviewRequired: true,
  paper: { canonicalDocumentId: MS_DOC_ID, board: "Edexcel", qualification: "IGCSE" },
  entries: [{ entryId: "e1", label: "1", number: 1, answerText: "C", marks: 2, confidence: 0.9, markPoints: [] }],
  paperTotal: 2,
  warnings: [],
});
const RECON = glmReconciliationSchema.parse({
  findings: [], qpPaperTotal: 2, msPaperTotal: 2, paperTotalConflict: false, mismatchCount: 0,
});

const PAIR = {
  qpCanonical: JSON.parse(JSON.stringify(QP_CANONICAL)),
  msCanonical: JSON.parse(JSON.stringify(MS_CANONICAL)),
  qpDraft: JSON.parse(JSON.stringify(QP_DRAFT)),
  msDraft: JSON.parse(JSON.stringify(MS_DRAFT)),
  reconciliation: JSON.parse(JSON.stringify(RECON)),
};

const ingestRoutes: Route[] = [
  { match: /from documents where checksum = \? limit 1/, rows: [] },
  { match: /insert into documents \(/, rows: [] },
  { match: /insert into document_chunks \(/, rows: [] },
  { match: /select paper_id, qp_document_id, ms_document_id, reconciliation_status, review_findings::text as review_findings, reconciliation::text as reconciliation\s*from glm_ocr_bridge_records\s*where qp_document_id/, rows: [] },
  { match: /select id, knowledge_node_id from subjects where code = \? limit 1/, rows: [{ id: "50000000-0000-0000-0000-000000000001", knowledge_node_id: null }] },
  { match: /select id from knowledge_nodes where code = \? limit 1/, rows: [] },
  { match: /insert into knowledge_nodes \(/, rows: [] },
  { match: /select id from exam_papers\s*where paper_code = \? and session_label = \? limit 1/, rows: [] },
  { match: /insert into exam_papers \(/, rows: [] },
  { match: /insert into questions \(/, rows: [] },
  { match: /insert into question_versions \(/, rows: [] },
  { match: /insert into question_parts \(/, rows: [] },
  { match: /select id from question_parts\s*where question_version_id = \? ::uuid and label = \?\s*limit 1/, rows: [{ id: "60000000-0000-0000-0000-000000000001" }] },
  { match: /insert into mark_schemes \(/, rows: [] },
  { match: /insert into mark_points \(/, rows: [] },
  { match: /insert into glm_ocr_bridge_records \(/, rows: [] },
  { match: /select title from exam_papers where id = \? ::uuid limit 1/, rows: [{ title: "IGCSE 4CH1/1C June 2020" }] },
  { match: /select count\(\*\) as n from mark_schemes/, rows: [{ n: 1 }] },
];

describe("glm-ocr POST /pairs — the verbatim parser contract (201)", () => {
  test("happy path: 201 PairResultView, all SUGGESTED rows created, embedding skipped", async () => {
    const { app } = makeApp(asTeacher, { routes: ingestRoutes });
    const res = await app.request("/api/v1/teacher/content/glm-ocr/pairs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(PAIR),
    });
    expect(res.status).toBe(201);
    const view = glmPairResultViewSchema.parse(await res.json());
    expect(view.qpDocument.status).toBe("INGESTED");
    expect(view.msDocument.status).toBe("INGESTED");
    expect(view.examPaper.status).toBe("INGESTED");
    expect(view.questions).toBe(1);
    expect(view.embeddingSkipped).toBe(true);
    expect(view.reconciliation.status).toBe("OK"); // no mismatches, no conflict
    expect(view.reviewFindings.map((f) => f.source)).toContain("QP_WARNING"); // the QP draft warning relayed verbatim
  });

  test("rerun: the bridge record resolves the pair → DUPLICATE statuses, no new rows", async () => {
    const dupRoutes: Route[] = [
      {
        match: /from documents where checksum = \? limit 1/,
        rows: [],
        rowsFor: (params: unknown[]) =>
          String(params[0]).startsWith("aa")
            ? [{ id: "70000000-0000-0000-0000-000000000001", document_id: QP_DOC_ID, kind: "QUESTION_PAPER", chunk_count: 1, element_count: 1, page_count: 1 }]
            : [{ id: "70000000-0000-0000-0000-000000000002", document_id: MS_DOC_ID, kind: "MARK_SCHEME", chunk_count: 1, element_count: 1, page_count: 1 }],
      },
      { match: /insert into documents \(/, rows: [] },
      {
        match: /from glm_ocr_bridge_records\s*where qp_document_id/,
        rows: [
          {
            paper_id: "80000000-0000-0000-0000-000000000001",
            qp_document_id: QP_DOC_ID,
            ms_document_id: MS_DOC_ID,
            reconciliation_status: "OK",
            review_findings: "[]",
            reconciliation: JSON.stringify({ mismatchCount: 0, paperTotalConflict: false, qpPaperTotal: 2, msPaperTotal: 2 }),
          },
        ],
      },
      { match: /select qv\.id, qv\.question_id from question_versions/, rows: [{ id: "90000000-0000-0000-0000-000000000001", question_id: "30000000-0000-0000-0000-000000000001" }] },
      { match: /select count\(\*\) as n from question_parts/, rows: [{ n: 2 }] },
      { match: /select ms\.id from mark_schemes/, rows: [{ id: "a0000000-0000-0000-0000-000000000001" }] },
      { match: /select count\(\*\) as n from mark_points/, rows: [{ n: 4 }] },
      { match: /select title from exam_papers where id = \? ::uuid limit 1/, rows: [{ title: "IGCSE 4CH1/1C June 2020" }] },
    ];
    const { app } = makeApp(asTeacher, { routes: dupRoutes });
    const res = await app.request("/api/v1/teacher/content/glm-ocr/pairs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(PAIR),
    });
    expect(res.status).toBe(201);
    const view = glmPairResultViewSchema.parse(await res.json());
    expect(view.qpDocument.status).toBe("DUPLICATE");
    expect(view.msDocument.status).toBe("DUPLICATE");
    expect(view.examPaper.status).toBe("DUPLICATE");
    expect(view.questions).toBe(1);
    expect(view.parts).toBe(2);
  });

  test("the bundle-mix 409: a draft claiming another canonical document", async () => {
    const { app } = makeApp(asTeacher, { routes: ingestRoutes });
    const mixed = { ...PAIR, qpDraft: { ...PAIR.qpDraft, paper: { ...PAIR.qpDraft.paper, canonicalDocumentId: "other-doc" } } };
    const res = await app.request("/api/v1/teacher/content/glm-ocr/pairs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(mixed),
    });
    expect(res.status).toBe(409);
    expect((await res.json()).message).toContain("the bundle mixes documents from different sources");
  });

  test("a reconciliation that is not ABOUT this pair → 409", async () => {
    const { app } = makeApp(asTeacher, { routes: ingestRoutes });
    const wrong = { ...PAIR, reconciliation: { ...PAIR.reconciliation, qpPaperTotal: 99 } };
    const res = await app.request("/api/v1/teacher/content/glm-ocr/pairs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(wrong),
    });
    expect(res.status).toBe(409);
    expect((await res.json()).message).toContain("is this reconciliation for this pair?");
  });

  test("a missing subtree and a shape-mismatched subtree → the catch-all 500 (treeToValue parity)", async () => {
    const { app } = makeApp(asTeacher, { routes: ingestRoutes });
    const missing = { ...PAIR, qpCanonical: null };
    const res = await app.request("/api/v1/teacher/content/glm-ocr/pairs", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(missing),
    });
    expect(res.status).toBe(500);
    const shaped = { ...PAIR, qpDraft: { ...PAIR.qpDraft, questions: "not-a-list" } };
    const res2 = await app.request("/api/v1/teacher/content/glm-ocr/pairs", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(shaped),
    });
    expect(res2.status).toBe(500);
  });

  test("malformed JSON body → 400 malformed_body", async () => {
    const { app } = makeApp(asTeacher, { routes: ingestRoutes });
    const res = await app.request("/api/v1/teacher/content/glm-ocr/pairs", {
      method: "POST", headers: { "content-type": "application/json" }, body: "{nope",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "malformed_body" });
  });
});

describe("glm-ocr GET /papers/:paperId/findings — record existence vs finding count", () => {
  test("MISSING bridge record → 404 not_found with the frozen message", async () => {
    const { app } = makeApp(asTeacher, { routes: [{ match: /from glm_ocr_bridge_records/, rows: [] }] });
    const res = await app.request(`/api/v1/teacher/content/glm-ocr/papers/00000000-0000-0000-0000-00000000000f/findings`);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({
      error: "not_found",
      message: "glm-ocr bridge record for paper 00000000-0000-0000-0000-00000000000f not found",
    });
  });

  test("existing record with zero findings → clean 200 []", async () => {
    const { app } = makeApp(asTeacher, {
      routes: [{
        match: /from glm_ocr_bridge_records/,
        rows: [{ review_findings: "[]" }],
      }],
    });
    const res = await app.request(`/api/v1/teacher/content/glm-ocr/papers/00000000-0000-0000-0000-00000000000f/findings`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  test("stored findings render verbatim; malformed uuid → 400 bad_request", async () => {
    const { app } = makeApp(asTeacher, {
      routes: [{
        match: /from glm_ocr_bridge_records/,
        rows: [{
          review_findings: JSON.stringify([
            { source: "RECONCILIATION", severity: "mismatch", questionNumber: "2", qpMarks: 6, msMarks: 7, detail: "d" },
          ]),
        }],
      }],
    });
    const res = await app.request(`/api/v1/teacher/content/glm-ocr/papers/00000000-0000-0000-0000-00000000000f/findings`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<Record<string, unknown>>;
    expect(body[0]!.source).toBe("RECONCILIATION");
    expect(body[0]!.qpMarks).toBe(6);
    const bad = await app.request("/api/v1/teacher/content/glm-ocr/papers/nope/findings");
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toBe("bad_request");
  });
});

// ── exam-series import (TeacherExamSeriesImportController) ──────────────────

const DATASET = {
  board: "Pearson",
  retrievedAt: "2026-10-07T05:00:00Z",
  series: [
    {
      qualification: "IAL", seriesCode: "jun-2026", label: "June 2026",
      windowStart: "2026-05-01", windowEnd: "2026-06-30",
      entryDeadline: "2026-04-15", resultsDate: "2026-08-01",
      published: true, estimated: false,
      sourceUrl: "https://qualifications.pearson.com/calendar-2026",
    },
  ],
};

const importRoutes = (existing: unknown[] = []): Route[] => [
  {
    match: /from exam_series\s*where board = \? and qualification = \?\s*and series_code = \?\s*limit 1/,
    rows: existing as never,
  },
  { match: /insert into exam_series \(/, rows: [] },
  { match: /update exam_series set/, rows: [] },
];

describe("exam-series POST /api/v1/teacher/curriculum/exam-series", () => {
  test("happy path: 200 ImportSummary {imported:1, updated:0, unchanged:0}", async () => {
    const { app } = makeApp(asTeacher, { routes: importRoutes() });
    const res = await app.request("/api/v1/teacher/curriculum/exam-series", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(DATASET),
    });
    expect(res.status).toBe(200);
    const summary = examSeriesImportSummarySchema.parse(await res.json());
    expect(summary.imported).toBe(1);
    expect(summary.unchanged).toBe(0);
  });

  test("re-import of an identical row → unchanged; a changed row → updated", async () => {
    const same = [
      {
        label: "June 2026", window_start: "2026-05-01", window_end: "2026-06-30",
        entry_deadline: "2026-04-15", results_date: "2026-08-01",
        published: true, estimated: false,
        source_url: "https://qualifications.pearson.com/calendar-2026",
      },
    ];
    const { app } = makeApp(asTeacher, { routes: importRoutes(same) });
    const res = await app.request("/api/v1/teacher/curriculum/exam-series", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(DATASET),
    });
    const summary = examSeriesImportSummarySchema.parse(await res.json());
    expect(summary.unchanged).toBe(1);
    const moved = await app.request("/api/v1/teacher/curriculum/exam-series", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...DATASET,
        series: [{ ...DATASET.series[0]!, windowStart: "2026-05-10", sourceUrl: "https://qualifications.pearson.com/v2" }],
      }),
    });
    const summary2 = examSeriesImportSummarySchema.parse(await moved.json());
    expect(summary2.updated).toBe(1); // the measured fields move WITH their newer citation
  });

  test("fail-closed 409s: missing board, non-https citation", async () => {
    const { app } = makeApp(asTeacher, { routes: importRoutes() });
    const noBoard = await app.request("/api/v1/teacher/curriculum/exam-series", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...DATASET, board: null }),
    });
    expect(noBoard.status).toBe(409);
    expect((await noBoard.json()).message).toContain("must name its board");
    const http = await app.request("/api/v1/teacher/curriculum/exam-series", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...DATASET, series: [{ ...DATASET.series[0]!, sourceUrl: "http://x.test/cal" }] }),
    });
    expect(http.status).toBe(409);
    expect((await http.json()).message).toContain("without an https citation fails closed");
  });

  test("an unknown ROW field fails binding → 400 malformed_body (ignoreUnknown = FALSE)", async () => {
    const { app } = makeApp(asTeacher, { routes: importRoutes() });
    const res = await app.request("/api/v1/teacher/curriculum/exam-series", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...DATASET, series: [{ ...DATASET.series[0]!, surprise: true }] }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "malformed_body" });
  });
});

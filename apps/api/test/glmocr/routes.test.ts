/**
 * GLM-OCR bridge route tests (T-MIG-089) — the observable HTTP contract of
 * GlmOcrIngestionController (@ 6cad6ef: POST /pairs 201 + GET
 * papers/{paperId}/findings) over an IN-MEMORY Hono app, wiring the REAL
 * GlmOcrIngestionService (bundle validation, rerun read-model, findings
 * deserialization) over stubbed sql, with the T-013/T-011 write band both
 * UNWIRED (this lane's composition) and wired-through-FAKES (proving the
 * full call sequence is a wire-up away, never a rewrite).
 *
 * Pinned laws:
 *   - the authz shells (SecurityConfig /api/v1/teacher/**): anonymous →
 *     Boot 401 body, student → Boot 403 body, BEFORE every handler
 *   - the web binding: the five parser subtrees bind as raw JSON; an
 *     unparseable body or a wrong-typed subtree → 400 malformed_body
 *     verbatim (HttpMessageConversionException posture — it dies BEFORE the
 *     service); a null subtree REACHES the service and dies on
 *     Objects.requireNonNull → 500 internal_error (NPE parity)
 *   - the deterministic bundle validation (validateBundle :186-221): a
 *     bundle that MIXES documents → 409 with the verbatim
 *     ConflictException message
 *   - the write-band seam: with T-013/T-011 unwired, POST /pairs answers
 *     the honest 501 after binding + validation (never a fabricated 200);
 *     with the ports wired, the frozen ingestPair sequence completes → 201
 *     PairResultView pinned against the canonical contract (status enums,
 *     declaration order, embeddingSkipped true)
 *   - the rerun spine: an already-bridged pair resolves to its record →
 *     DUPLICATE statuses, counts read back from the DB (the frozen :223-253
 *     read model), no new rows
 *   - the review surface: a MISSING bridge record is 404 ("glm-ocr bridge
 *     record for paper {id} not found"); an existing record with an EMPTY
 *     findings list is a clean 200 [] — malformed uuid → 400 "malformed
 *     request"
 */
import { describe, expect, test } from "bun:test";
import { Hono, type Context } from "hono";
import { createGlmOcrRouter } from "../../src/routes/glmocr";
import { buildGlmOcrModule, type ContentIngestionPort } from "../../src/services/glmocr";
import type { GlmOcrWritePath } from "../../src/services/glmocr/service";
import { toErrorResponse } from "../../src/services/identity/errors";
import {
  glmOcrFindingViewSchema,
  glmOcrPairResultViewSchema,
} from "@syllabai/contracts";
import { fakeSql, type Route } from "../assessment/helpers";

// ── fixtures ────────────────────────────────────────────────────────────────

const TEACHER = "aa000000-0000-4000-8000-000000000001";
const PAPER = "bb000000-0000-4000-8000-000000000001";
const UNKNOWN_PAPER = "bb000000-0000-4000-8000-0000000000e1";
const QP_DOC = "doc-qp-1";
const MS_DOC = "doc-ms-1";
const QP_ROW = "cc000000-0000-4000-8000-000000000001";
const MS_ROW = "cc000000-0000-4000-8000-000000000002";

const qpCanonical = { documentId: QP_DOC, schemaVersion: "1.0", source: { checksum: "qp-checksum" }, pages: [] };
const msCanonical = { documentId: MS_DOC, schemaVersion: "1.0", source: { checksum: "ms-checksum" }, pages: [] };

const qpDraft = {
  paper: { canonicalDocumentId: QP_DOC, session: "October 2025", paperReference: "4PH0/1P" },
  questions: [
    { questionId: "q-1", number: 1, stem: "State the unit of charge.", marks: 2, confidence: 0.7 },
  ],
  paperTotal: 2,
  warnings: [],
};
const msDraft = {
  paper: {
    board: "Pearson Edexcel",
    qualification: "International GCSE",
    canonicalDocumentId: MS_DOC,
  },
  entries: [
    {
      label: "1", number: 1, answerText: "coulomb", marks: 2,
      markPoints: [{ ordinal: 1, text: "coulomb", marks: 2, confidence: 0.9 }],
      confidence: 0.9,
    },
  ],
  paperTotal: 2,
  figureRefs: null,
  warnings: [],
};
const reconciliation = {
  findings: [{ questionNumber: "1", qpMarks: 2, msMarks: 2, severity: "match" }],
  qpPaperTotal: 2,
  msPaperTotal: 2,
  paperTotalConflict: false,
  mismatchCount: 0,
};

/** A well-formed bundle (the exact parser contract). */
const bundle = () => ({ qpCanonical, msCanonical, qpDraft, msDraft, reconciliation });

// ── the bridge-records SQL shapes (verbatim renderings) ─────────────────────

const bridgeByPaperRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match:
    /^select id, paper_id, bridge, qp_document_id, ms_document_id, qp_document_row_id, ms_document_row_id, qp_checksum, ms_checksum, extraction_methods, reconciliation_status, review_findings::text as review_findings, qp_draft::text as qp_draft, ms_draft::text as ms_draft, reconciliation::text as reconciliation from glm_ocr_bridge_records where paper_id = \? ::uuid limit 1$/,
  rows,
});

const bridgeByPairRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match:
    /^select id, paper_id, bridge, qp_document_id, ms_document_id, qp_document_row_id, ms_document_row_id, qp_checksum, ms_checksum, extraction_methods, reconciliation_status, review_findings::text as review_findings, qp_draft::text as qp_draft, ms_draft::text as ms_draft, reconciliation::text as reconciliation from glm_ocr_bridge_records where qp_document_id = \? and ms_document_id = \? limit 1$/,
  rows,
});

const bridgeInsertRoute = (): Route => ({
  match: /^insert into glm_ocr_bridge_records \(id, paper_id, bridge, qp_document_id,/,
  rows: [],
});

const paperTitleRoute = (title: string | null): Route => ({
  match: /^select id, title from exam_papers where id = \? ::uuid limit 1$/,
  rows: title == null ? [] : [{ id: PAPER, title }],
});

const versionsRoute = (): Route => ({
  match:
    /^select v.id, \(select count\(\*\) from question_parts p where p.question_version_id = v.id\) as parts_count from question_versions v join questions q on q.id = v.question_id where q.exam_paper_id = \? ::uuid order by q.external_ref asc nulls last, v.version desc$/,
  rows: [{ id: "dd000000-0000-4000-8000-000000000001", parts_count: 2 }],
});

const schemesRoute = (): Route => ({
  match:
    /^select s.id from mark_schemes s join question_versions v on v.id = s.question_version_id join questions q on q.id = v.question_id where q.exam_paper_id = \? ::uuid order by s.created_at asc$/,
  rows: [{ id: "ee000000-0000-4000-8000-000000000001" }],
});

const pointsRoute = (): Route => ({
  match: /^select id from mark_points where mark_scheme_id = \? ::uuid order by ordering asc$/,
  rows: [{ id: "ff000000-0000-4000-8000-000000000001" }, { id: "ff000000-0000-4000-8000-000000000002" }],
});

/** The rerun record row (review_findings/qp_draft/… as jsonb ::text). */
const recordRow = (over: Partial<Record<string, unknown>> = {}) => ({
  id: "aa000000-0000-4000-8000-000000000101",
  paper_id: PAPER,
  bridge: "glm-ocr-v1",
  qp_document_id: QP_DOC,
  ms_document_id: MS_DOC,
  qp_document_row_id: QP_ROW,
  ms_document_row_id: MS_ROW,
  qp_checksum: "qp-checksum",
  ms_checksum: "ms-checksum",
  extraction_methods: "glm-ocr-qp-v1+glm-ocr-ms-v1",
  reconciliation_status: "OK",
  review_findings: JSON.stringify([]),
  qp_draft: JSON.stringify(qpDraft),
  ms_draft: JSON.stringify(msDraft),
  reconciliation: JSON.stringify(reconciliation),
  ...over,
});

// ── deterministic write-band fakes (the T-013/T-011 port surfaces) ──────────

function fakeWritePath(overrides: {
  existingPair?: Array<Record<string, unknown>>;
  paperTitle?: string | null;
} = {}): { writePath: GlmOcrWritePath; routes: Route[] } {
  const ingested: string[] = [];
  const contentIngestion: ContentIngestionPort = {
    ingest: async (doc, _raw, kind) => {
      ingested.push(`${kind}:${doc!.documentId}`);
      return {
        id: kind === "QUESTION_PAPER" ? QP_ROW : MS_ROW,
        documentId: doc!.documentId!,
        duplicate: false,
        chunks: 3,
      };
    },
  };
  const pastPaperIngestion = {
    ingest: async () => ({ paperId: PAPER, questions: 1, parts: 2, markPoints: 2 }),
  };
  const routes: Route[] = [
    bridgeByPairRoute(overrides.existingPair ?? []),
    bridgeInsertRoute(),
    paperTitleRoute(overrides.paperTitle ?? "Physics Paper 1"),
    versionsRoute(),
    schemesRoute(),
    pointsRoute(),
  ];
  return { writePath: { contentIngestion, pastPaperIngestion }, routes };
}

// ── app assembly (mirrors apps/api/src/index.ts) ────────────────────────────

type AuthRow = Record<string, unknown> | null;

function makeApp(
  auth: (c: Context) => AuthRow,
  routes: Route[],
  writePath: GlmOcrWritePath | null = null,
) {
  const sql = fakeSql(routes);
  const app = new Hono();
  app.use("*", async (c, next) => {
    const a = auth(c);
    if (a) c.set("syllabai.auth" as never, a as never);
    await next();
  });
  app.route(
    "/api/v1/teacher/content",
    createGlmOcrRouter(buildGlmOcrModule(sql, writePath ? { writePath } : {})),
  );
  app.onError((err, c) => {
    const mapped = toErrorResponse(err);
    if (mapped) return c.json(mapped.body, mapped.status as 400);
    return c.json({ status: 500, error: "internal_error", message: String((err as Error).message) }, 500 as const);
  });
  return { app, sql };
}

const asTeacher = (): AuthRow => ({
  email: "t@example.edu",
  userId: TEACHER,
  roles: ["TEACHER"],
  tokenVersion: 1,
});
const asStudent = (): AuthRow => ({
  email: "s@example.edu",
  userId: "bb000000-0000-4000-8000-0000000000e2",
  roles: ["STUDENT"],
  tokenVersion: 1,
});
const anon = (): AuthRow => null;

const FINDINGS_URL = (paperId: string) =>
  `/api/v1/teacher/content/glm-ocr/papers/${paperId}/findings`;

// ── authz shells ────────────────────────────────────────────────────────────

describe("authz shells (TEACHER/ADMIN)", () => {
  test("anonymous → Boot 401 body on both surfaces", async () => {
    const { app } = makeApp(anon, []);
    for (const [path, init] of [
      ["/api/v1/teacher/content/glm-ocr/pairs", { method: "POST", body: "{}" }],
      [FINDINGS_URL(PAPER), {}],
    ] as Array<[string, RequestInit]>) {
      const res = await app.request(path, init);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.status).toBe(401);
      expect(body.error).toBe("Unauthorized");
    }
  });

  test("authenticated STUDENT → Boot 403 body on both surfaces", async () => {
    const { app, sql } = makeApp(asStudent, []);
    for (const [path, init] of [
      ["/api/v1/teacher/content/glm-ocr/pairs", { method: "POST", body: "{}" }],
      [FINDINGS_URL(PAPER), {}],
    ] as Array<[string, RequestInit]>) {
      const res = await app.request(path, init);
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe("Forbidden");
    }
    expect(sql.queries).toHaveLength(0); // the gate precedes every handler
  });
});

// ── POST /glm-ocr/pairs ─────────────────────────────────────────────────────

describe("POST /glm-ocr/pairs — binding + validation", () => {
  test("unparseable body → 400 malformed_body verbatim", async () => {
    const { app } = makeApp(asTeacher, []);
    const res = await app.request("/api/v1/teacher/content/glm-ocr/pairs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("malformed_body");
    expect(body.message).toBe("request body is not readable (check field types and enum values)");
  });

  test("wrong-typed subtree → 400 malformed_body (the Jackson-3 conversion posture)", async () => {
    const { app, sql } = makeApp(asTeacher, []);
    const res = await app.request("/api/v1/teacher/content/glm-ocr/pairs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...bundle(), qpCanonical: "a-string-not-an-object" }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("malformed_body");
    expect(sql.queries).toHaveLength(0);
  });

  test("a null reconciliation subtree REACHES the service → 500 (require NPE parity)", async () => {
    const { app, sql } = makeApp(asTeacher, [], null);
    const res = await app.request("/api/v1/teacher/content/glm-ocr/pairs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...bundle(), reconciliation: null }),
    });
    expect(res.status).toBe(500);
    expect((await res.json()).message).toContain("reconciliation is required");
    expect(sql.queries).toHaveLength(0);
  });

  test("a bundle that MIXES documents → 409 with the verbatim message", async () => {
    const { app, sql } = makeApp(asTeacher, [], null);
    const res = await app.request("/api/v1/teacher/content/glm-ocr/pairs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...bundle(),
        qpDraft: { ...qpDraft, paper: { ...qpDraft.paper, canonicalDocumentId: "doc-OTHER" } },
      }),
    });
    expect(res.status).toBe(409);
    expect((await res.json()).message).toBe(
      "qp draft claims canonical document doc-OTHER but the supplied QP canonical document is doc-qp-1 — the bundle mixes documents from different sources",
    );
    expect(sql.queries).toHaveLength(0);
  });
});

describe("POST /glm-ocr/pairs — the write-band seam", () => {
  test("unwired T-013/T-011 → honest 501 after binding + bundle validation", async () => {
    const { app, sql } = makeApp(asTeacher, [], null);
    const res = await app.request("/api/v1/teacher/content/glm-ocr/pairs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bundle()),
    });
    expect(res.status).toBe(501);
    const body = await res.json();
    expect(body.error).toBe("not_implemented");
    expect(body.message).toContain("owned by T-MIG-023");
    expect(sql.queries).toHaveLength(0); // the seam never touches persistence
  });

  test("wired ports: the frozen ingestPair sequence → 201 canonical PairResultView", async () => {
    const { writePath, routes } = fakeWritePath();
    const { app, sql } = makeApp(asTeacher, routes, writePath);
    const res = await app.request("/api/v1/teacher/content/glm-ocr/pairs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bundle()),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(glmOcrPairResultViewSchema.safeParse(body).success).toBeTrue();
    expect(body.qpDocument).toEqual({ status: "INGESTED", documentId: QP_DOC, chunks: 3 });
    expect(body.msDocument).toEqual({ status: "INGESTED", documentId: MS_DOC, chunks: 3 });
    expect(body.examPaper).toEqual({ status: "INGESTED", paperId: PAPER, title: "Physics Paper 1" });
    expect(body.questions).toBe(1);
    expect(body.parts).toBe(2);
    expect(body.markSchemes).toBe(1);
    expect(body.markPoints).toBe(2);
    expect(body.qpChunks).toBe(3);
    expect(body.msChunks).toBe(3);
    expect(body.reconciliation).toEqual({
      status: "OK", // no mismatches, no paper-total conflict
      mismatchCount: 0,
      paperTotalConflict: false,
      qpPaperTotal: 2,
      msPaperTotal: 2,
    });
    expect(body.embeddingSkipped).toBe(true); // embedding stays an explicit T-013 op
    expect(sql.queries.filter((q) => q.startsWith("insert into glm_ocr_bridge_records"))).toHaveLength(1);
  });

  test("rerun spine: an already-bridged pair → DUPLICATE statuses, counts from the record, no new rows", async () => {
    const { writePath, routes } = fakeWritePath({
      existingPair: [recordRow({ review_findings: JSON.stringify([
        { source: "RECONCILIATION", severity: "mismatch", questionNumber: "18", qpMarks: 8, msMarks: 2, detail: "Q18: QP total 8 vs MS total 2 (mismatch)" },
      ]), reconciliation_status: "REVIEW_REQUIRED" })],
    });
    const { app, sql } = makeApp(asTeacher, routes, writePath);
    const res = await app.request("/api/v1/teacher/content/glm-ocr/pairs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bundle()),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.qpDocument.status).toBe("INGESTED"); // the DOCUMENT ingest ran…
    expect(body.examPaper).toEqual({ status: "DUPLICATE", paperId: PAPER, title: "Physics Paper 1" });
    expect(body.questions).toBe(1); // …but the counts are the RECORD's read model
    expect(body.parts).toBe(2);
    expect(body.markSchemes).toBe(1);
    expect(body.markPoints).toBe(2);
    expect(body.reconciliation.status).toBe("REVIEW_REQUIRED"); // preserved verbatim
    expect(body.reviewFindings).toHaveLength(1);
    expect(body.reviewFindings[0].detail).toBe("Q18: QP total 8 vs MS total 2 (mismatch)");
    expect(sql.queries.filter((q) => q.startsWith("insert into glm_ocr_bridge_records"))).toHaveLength(0);
  });
});

// ── GET /glm-ocr/papers/{paperId}/findings ──────────────────────────────────

describe("GET /glm-ocr/papers/{paperId}/findings — the review surface", () => {
  test("existing record with findings → 200 the deserialized list, schema-pinned", async () => {
    const { app } = makeApp(asTeacher, [
      bridgeByPaperRoute([
        recordRow({
          review_findings: JSON.stringify([
            { source: "QP_WARNING", severity: "duplicate-part-label", questionNumber: "2", qpMarks: null, msMarks: null, detail: "Q2: part label 'b' occurs 2x (parser fragmentation) — later rows relabelled 'b.2', '.3' … for review; merge or reject" },
          ]),
        }),
      ]),
    ]);
    const res = await app.request(FINDINGS_URL(PAPER));
    expect(res.status).toBe(200);
    const body = await res.json();
    for (const f of body) expect(glmOcrFindingViewSchema.safeParse(f).success).toBeTrue();
    expect(body).toHaveLength(1);
    expect(body[0].source).toBe("QP_WARNING");
    expect(body[0].qpMarks).toBeNull(); // Integer nulls relay verbatim
  });

  test("existing record with an EMPTY findings list → 200 [] (clean pair, still reviewable)", async () => {
    const { app } = makeApp(asTeacher, [bridgeByPaperRoute([recordRow()])]);
    const res = await app.request(FINDINGS_URL(PAPER));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  test("missing bridge record → 404 'glm-ocr bridge record for paper … not found'", async () => {
    const { app } = makeApp(asTeacher, [bridgeByPaperRoute([])]);
    const res = await app.request(FINDINGS_URL(UNKNOWN_PAPER));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
    expect(body.message).toBe(`glm-ocr bridge record for paper ${UNKNOWN_PAPER} not found`);
  });

  test("malformed uuid → 400 bad_request 'malformed request'", async () => {
    const { app, sql } = makeApp(asTeacher, []);
    const res = await app.request(FINDINGS_URL("not-a-uuid"));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe("malformed request");
    expect(sql.queries).toHaveLength(0);
  });
});

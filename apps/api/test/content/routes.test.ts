import { describe, expect, test } from "bun:test";
import { Hono, type Context } from "hono";
import { createTeacherContentRouter, createContentReaderRouter, createQuestionAssetRouter } from "../../src/routes/content";
import type { ContentReadApp } from "../../src/services/content";
import type { ChunkHit, SearchEmptyDiagnostics } from "../../src/services/content/retrieval";
import { classifyEmptyCause, MAX_LIMIT } from "../../src/services/content/retrieval";
import { documentPageText } from "../../src/services/content/reader";
import { suggestedVersionCount, suggestedSchemeCount, rankReasons, sortEnrichedV3 } from "../../src/services/content/review";
import type { CitationDocumentView, DocumentSummaryView, EnrichedPaperSummary, EnrichedPaperSummaryV3 } from "@syllabai/contracts";

/**
 * Route-level parity tests over an IN-MEMORY app — the observable HTTP
 * contract of ContentController/ContentDocumentController/
 * ContentReaderController/QuestionAssetController read surfaces, with no
 * database. Expected bodies are the T-MIG-004 captured golden cases
 * (status + error-code strings + messages); the Neon-branch integration
 * tier lives in db.integration.test.ts.
 */

const UNKNOWN_DOC = "00000000-0000-4000-8000-0000000000d1";
const UNKNOWN_PAPER = "00000000-0000-4000-8000-0000000000e1";
const UNKNOWN_QUESTION = "00000000-0000-4000-8000-0000000000e3";

/** Build a minimal fake of the ContentReadApp interface. */
function fakeApp(overrides: Partial<ContentReadApp> = {}): ContentReadApp {
  const row = {
    id: UNKNOWN_DOC,
    documentId: "doc-business-id",
    docVersion: 1,
    kind: "MARK_SCHEME",
    fileName: "sample.pdf",
    sourceUri: "gs://bucket/sample.pdf",
    pageCount: 3,
    elementCount: 10,
    textElementCount: 8,
    chunkCount: 4,
    sourceEngine: "glm-ocr",
    sourceEngineVersion: "v1",
    checksum: "abc",
    checksumAlgorithm: "SHA-256",
    canonicalJson: { schemaVersion: "1.0" },
    createdAt: "2026-10-04T19:02:13.760Z",
  };
  const base: ContentReadApp = {
    documents: {
      findAllByOrderByCreatedAtDesc: async () => [],
      findById: async (id: string) => (id === UNKNOWN_DOC ? row : null),
      findTopByDocumentIdOrderByDocVersionDesc: async () => null,
      existsCitable: async () => false,
      canonicalJsonText: async (id: string) =>
        id === UNKNOWN_DOC ? '{"schemaVersion":"1.0"}' : null,
    } as unknown as ContentReadApp["documents"],
    questionAssets: {
      findByFilename: async () => null,
    } as unknown as ContentReadApp["questionAssets"],
    review: {
      reviewQueue: async () => ({ papers: [], suggestedVersions: 0, suggestedSchemes: 0 }),
      enrichedReviewQueue: async () => ({ papers: [], suggestedVersions: 0, suggestedSchemes: 0 }),
      enrichedReviewQueueV3: async () => ({
        papers: [],
        suggestedVersions: 0,
        suggestedSchemes: 0,
        practicableTopicCount: 0,
      }),
      paperReview: async () => {
        throw new Error("not faked");
      },
      paperAudit: async () => {
        throw new Error("not faked");
      },
      paperProvenance: async () => {
        throw new Error("not faked");
      },
      questionTopicRows: async () => {
        throw new Error("not faked");
      },
    } as unknown as ContentReadApp["review"],
    scope: {
      resolveActive: async () => null,
      resolveForCourse: async () => null,
    } as unknown as ContentReadApp["scope"],
    requesterId: (_c: Context) => "00000000-0000-4000-8000-000000000001",
    requireEmbeddingProvider: () => {
      throw new Error(
        "no embedding provider configured — set SYLLABAI_EMBEDDING_GEMINI_API_KEY " +
          "(free tier, ADR-009); search is unavailable until keyed",
      );
    },
    searchServingEligible: async (): Promise<ChunkHit[]> => [],
    diagnoseEmpty: async (): Promise<SearchEmptyDiagnostics> => ({
      chunksInScope: 0,
      embeddedInScope: 0,
      inScopeAtRev: 0,
      servingEligible: 0,
    }),
    embedDocument: async () => {
      throw new Error("not faked");
    },
    pageText: () => "",
    paperRefOf: async () => null,
    toCitationView: (doc, page, text, paper): CitationDocumentView => ({
      id: doc.id,
      documentId: doc.documentId,
      docVersion: doc.docVersion,
      kind: doc.kind as CitationDocumentView["kind"],
      title: doc.fileName == null ? doc.sourceUri : doc.fileName,
      pageCount: doc.pageCount,
      page,
      text,
      paper,
    }),
    toDocumentSummary: (doc): DocumentSummaryView => ({
      id: doc.id,
      documentId: doc.documentId,
      docVersion: doc.docVersion,
      kind: doc.kind as DocumentSummaryView["kind"],
      title: doc.fileName == null ? doc.sourceUri : doc.fileName,
      pageCount: doc.pageCount,
      elementCount: doc.elementCount,
      textElementCount: doc.textElementCount,
      chunkCount: doc.chunkCount,
      sourceEngine: doc.sourceEngine,
      sourceEngineVersion: doc.sourceEngineVersion,
      checksum: doc.checksum,
      createdAt: doc.createdAt,
    }),
    ...overrides,
  };
  return base;
}

/** Build the app error boundary exactly like apps/api/src/index.ts. */
function withBoundary(router: Hono, auth: (c: Context) => Record<string, unknown> | null): Hono {
  const app = new Hono();
  app.use("*", async (c, next) => {
    const a = auth(c);
    if (a) c.set("syllabai.auth" as never, a as never);
    await next();
  });
  app.onError((err, c) => {
    const status = (err as { status?: number }).status;
    const code = (err as { code?: string }).code;
    if (status && code) {
      return c.json({ status, error: code, message: err.message, timestamp: "2026-10-05T00:00:00Z" }, status as 400);
    }
    return c.json(
      { status: 500, error: "internal_error", message: "an internal error occurred", timestamp: "2026-10-05T00:00:00Z" },
      500,
    );
  });
  app.route("/", router);
  return app;
}

const teacherAuth = { userId: "u-teacher", roles: ["TEACHER"] };
const studentAuth = { userId: "u-student", roles: ["STUDENT"] };
const noAuth = () => null;
const asTeacher = () => teacherAuth;
const asStudent = () => studentAuth;

function teacherRouter(app: ContentReadApp, auth: () => Record<string, unknown> | null) {
  return withBoundary(createTeacherContentRouter(app), auth);
}

// ── authz shell (captured run-001) ────────────────────────────────────────

describe("teacher content router — authz shell", () => {
  test("unauthenticated → 401 Boot body before any persistence path", async () => {
    const res = await teacherRouter(fakeApp(), noAuth).request("/documents");
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
    expect(body.path).toBe("/documents");
  });

  test("student → 403 Forbidden (hasAnyRole TEACHER,ADMIN)", async () => {
    const res = await teacherRouter(fakeApp(), asStudent).request("/documents");
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Forbidden");
    expect(body.path).toBe("/documents");
  });
});

// ── ContentDocumentController reads ──────────────────────────────────────

describe("GET /documents", () => {
  test("teacher → 200 [] empty state (content-docs-teacher-empty-200)", async () => {
    const res = await teacherRouter(fakeApp(), asTeacher).request("/documents");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });
});

describe("GET /documents/:id", () => {
  test("unknown id → 404 not_found 'Document … not found' (captured body)", async () => {
    const res = await teacherRouter(fakeApp(), asTeacher).request(`/documents/00000000-0000-4000-8000-0000000000dd`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
    expect(body.message).toBe("Document 00000000-0000-4000-8000-0000000000dd not found");
  });

  test("malformed uuid → 400 bad_request 'malformed request'", async () => {
    const res = await teacherRouter(fakeApp(), asTeacher).request("/documents/not-a-uuid");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("bad_request");
    expect(body.message).toBe("malformed request");
  });

  test("known id → 200 DocumentSummaryView", async () => {
    const res = await teacherRouter(fakeApp(), asTeacher).request(`/documents/${UNKNOWN_DOC}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.documentId).toBe("doc-business-id");
    expect(body.kind).toBe("MARK_SCHEME");
    expect(body.title).toBe("sample.pdf");
  });
});

describe("GET /documents/:id/canonical", () => {
  test("unknown id → 404 'Document … not found' (captured)", async () => {
    const res = await teacherRouter(fakeApp(), asTeacher).request(`/documents/00000000-0000-4000-8000-0000000000d9/canonical`);
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe("Document 00000000-0000-4000-8000-0000000000d9 not found");
  });

  test("known id → sealed JSON as stored, application/json", async () => {
    const res = await teacherRouter(fakeApp(), asTeacher).request(`/documents/${UNKNOWN_DOC}/canonical`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    expect(await res.text()).toBe('{"schemaVersion":"1.0"}');
  });
});

describe("GET /documents/search — binding parity (T-MIG-004 captures)", () => {
  test("query ABSENT → 400 validation_failed 'missing required parameter: query'", async () => {
    const res = await teacherRouter(fakeApp(), asTeacher).request("/documents/search");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(body.message).toBe("missing required parameter: query");
  });

  test("query PRESENT-BUT-BLANK → 500 internal_error (captured as-is, F-2)", async () => {
    const res = await teacherRouter(fakeApp(), asTeacher).request("/documents/search?query=");
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("internal_error");
    expect(body.message).toBe("an internal error occurred");
  });

  test("bad kind → 400 malformed request (conversion parity)", async () => {
    const res = await teacherRouter(fakeApp(), asTeacher).request("/documents/search?query=moles&kind=NOT_A_KIND");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("bad_request");
  });

  test("non-integer limit → 400 malformed request", async () => {
    const res = await teacherRouter(fakeApp(), asTeacher).request("/documents/search?query=moles&limit=abc");
    expect(res.status).toBe(400);
  });

  test("scope unresolved → 200 [] + X-Search-Empty-Cause SCOPE_UNRESOLVED", async () => {
    const res = await teacherRouter(fakeApp(), asTeacher).request("/documents/search?query=moles");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
    expect(res.headers.get("X-Search-Empty-Cause")).toBe("SCOPE_UNRESOLVED");
  });

  test("courseRef unresolved → 200 [] + COURSE_REF_UNRESOLVED, no global fallback (ADR-030)", async () => {
    let globalCalls = 0;
    const app = fakeApp({
      scope: {
        resolveActive: async () => {
          globalCalls++;
          return null;
        },
        resolveForCourse: async () => null,
      } as unknown as ContentReadApp["scope"],
    });
    const res = await teacherRouter(app, asTeacher).request("/documents/search?query=moles&courseRef=igcse-chemistry-19");
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Search-Empty-Cause")).toBe("COURSE_REF_UNRESOLVED");
    expect(globalCalls).toBe(0); // NO fallback to the global scope
  });

  test("resolved scope + unkeyed provider → 500 internal_error (IllegalStateException parity)", async () => {
    const app = fakeApp({
      scope: {
        resolveActive: async () => ({
          curriculumVersionId: "cv-1",
          code: "4CH1-2017",
          surface: new Set<string>(),
        }),
      } as unknown as ContentReadApp["scope"],
    });
    const res = await teacherRouter(app, asTeacher).request("/documents/search?query=moles");
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("internal_error");
  });
});

describe("POST /documents/:id/embed — provider check precedes row lookup", () => {
  test("unkeyed provider → 500 internal_error for ANY id (case pins 500 despite name)", async () => {
    const res = await teacherRouter(fakeApp(), asTeacher).request(`/documents/${UNKNOWN_DOC}/embed`, { method: "POST" });
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("internal_error");
  });

  test("malformed uuid → 400 before the provider check (binding parity)", async () => {
    let providerChecked = false;
    const app = fakeApp({
      requireEmbeddingProvider: () => {
        providerChecked = true;
        throw new Error("should not be reached");
      },
    });
    const res = await teacherRouter(app, asTeacher).request("/documents/nope/embed", { method: "POST" });
    expect(res.status).toBe(400);
    expect(providerChecked).toBe(false);
  });
});

// ── ContentController read endpoints ─────────────────────────────────────

describe("review queues — captured empty shapes", () => {
  test("v1 → {papers:[], suggestedVersions:0, suggestedSchemes:0}", async () => {
    const res = await teacherRouter(fakeApp(), asTeacher).request("/review-queue");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ papers: [], suggestedVersions: 0, suggestedSchemes: 0 });
  });

  test("v2 → same empty shape as v1", async () => {
    const res = await teacherRouter(fakeApp(), asTeacher).request("/review-queue-v2");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ papers: [], suggestedVersions: 0, suggestedSchemes: 0 });
  });

  test("v3 → adds practicableTopicCount:0", async () => {
    const res = await teacherRouter(fakeApp(), asTeacher).request("/review-queue-v3");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      papers: [],
      suggestedVersions: 0,
      suggestedSchemes: 0,
      practicableTopicCount: 0,
    });
  });
});

describe("paper surfaces — unknown-id 404 parity (captured messages)", () => {
  test("exam-papers/:id/review → 'exam paper … not found'", async () => {
    const app = fakeApp({
      review: {
        paperReview: async () => {
          const { NotFoundException } = await import("../../src/services/identity/errors");
          throw new NotFoundException("exam paper", UNKNOWN_PAPER);
        },
      } as unknown as ContentReadApp["review"],
    });
    const res = await teacherRouter(app, asTeacher).request(`/exam-papers/${UNKNOWN_PAPER}/review`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe(`exam paper ${UNKNOWN_PAPER} not found`);
    expect(body.error).toBe("not_found");
  });

  test("questions/:id/topics → 'question … not found'", async () => {
    const app = fakeApp({
      review: {
        questionTopicRows: async () => {
          const { NotFoundException } = await import("../../src/services/identity/errors");
          throw new NotFoundException("question", UNKNOWN_QUESTION);
        },
      } as unknown as ContentReadApp["review"],
    });
    const res = await teacherRouter(app, asTeacher).request(`/questions/${UNKNOWN_QUESTION}/topics`);
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe(`question ${UNKNOWN_QUESTION} not found`);
  });
});

// ── honest 501 discipline ────────────────────────────────────────────────

describe("write surfaces — honest 501 + owning task", () => {
  const writes: Array<[string, string]> = [
    ["/past-papers", "POST"],
    ["/documents", "POST"],
    [`/documents/${UNKNOWN_DOC}/embed2`, "POST"], // wrong path → 404 fallback, not a 501 probe
    ["/exam-papers/00000000-0000-4000-8000-0000000000e1/validate-all", "POST"],
    ["/exam-papers/00000000-0000-4000-8000-0000000000e1/place", "POST"],
    ["/exam-papers/00000000-0000-4000-8000-0000000000e1/reject", "POST"],
    ["/exam-papers/00000000-0000-4000-8000-0000000000e1/flag", "POST"],
    ["/exam-papers/00000000-0000-4000-8000-0000000000e1/unflag", "POST"],
    ["/exam-papers/00000000-0000-4000-8000-0000000000e1/validate", "POST"],
    ["/question-versions/00000000-0000-4000-8000-0000000000e1/validate", "POST"],
    ["/question-versions/00000000-0000-4000-8000-0000000000e1/reject", "POST"],
    ["/question-versions/00000000-0000-4000-8000-0000000000e1/flag", "POST"],
    ["/question-versions/00000000-0000-4000-8000-0000000000e1/unflag", "POST"],
    ["/mark-schemes/00000000-0000-4000-8000-0000000000e1/validate", "POST"],
    ["/mark-schemes/00000000-0000-4000-8000-0000000000e1/reject", "POST"],
    ["/questions/00000000-0000-4000-8000-0000000000e3/topics", "POST"],
  ];
  for (const [path, method] of writes) {
    test(`${method} ${path} → 501 naming the owning task`, async () => {
      if (path.endsWith("/embed2")) return; // not a real surface
      const res = await teacherRouter(fakeApp(), asTeacher).request(path, { method });
      expect(res.status).toBe(501);
      const body = await res.json();
      expect(body.error).toBe("not_implemented");
      expect(body.message).toContain("owned by");
    });
  }
});

// ── ContentReaderController ──────────────────────────────────────────────

describe("reader router — corpus law", () => {
  // the router is mounted at /api/v1/content/documents in the app; in this
  // harness it mounts at "/", so :id is a SINGLE segment — request "/<uuid>".
  function readerRouter(app: ContentReadApp, auth: () => Record<string, unknown> | null) {
    return withBoundary(createContentReaderRouter(app), auth);
  }

  test("unauthenticated → 401 before the corpus gate", async () => {
    const res = await readerRouter(fakeApp(), noAuth).request(`/${UNKNOWN_DOC}`);
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("Unauthorized");
  });

  test("unknown id → 404 'Document … not found' (byte-identical to non-citable)", async () => {
    const res = await readerRouter(fakeApp(), asTeacher).request("/00000000-0000-4000-8000-0000000000df");
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe("Document 00000000-0000-4000-8000-0000000000df not found");
  });

  test("non-citable row → 404 IDENTICAL to unknown-id (no state leak, T-C20)", async () => {
    const res = await readerRouter(fakeApp(), asTeacher).request(`/${UNKNOWN_DOC}`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe(`Document ${UNKNOWN_DOC} not found`);
  });

  test("page out of range → 404 'Document page N … not found' (after the gate)", async () => {
    const app = fakeApp({
      documents: {
        ...fakeApp().documents,
        existsCitable: async () => true,
      } as unknown as ContentReadApp["documents"],
    });
    const res = await readerRouter(app, asTeacher).request(`/${UNKNOWN_DOC}?page=9`);
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe(`Document page 9 ${UNKNOWN_DOC} not found`);
  });
});

// ── QuestionAssetController ──────────────────────────────────────────────

describe("question assets", () => {
  test("unauthenticated → 401", async () => {
    const app = new Hono().route("/", createQuestionAssetRouter(fakeApp()));
    const wrapped = withBoundary(app, noAuth);
    const res = await wrapped.request("/unknown-figure.png");
    expect(res.status).toBe(401);
  });

  test("unknown filename → 404 with EMPTY body (ResponseEntity.notFound().build())", async () => {
    const wrapped = withBoundary(createQuestionAssetRouter(fakeApp()), asTeacher);
    const res = await wrapped.request("/unknown-figure.png");
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("");
  });

  test("known filename → binary with Content-Type + Content-Length", async () => {
    const app = fakeApp({
      questionAssets: {
        findByFilename: async () => ({
          contentType: "image/png",
          sizeBytes: 5,
          bytes: new Uint8Array([1, 2, 3, 4, 5]),
        }),
      } as unknown as ContentReadApp["questionAssets"],
    });
    const res = await withBoundary(createQuestionAssetRouter(app), asTeacher).request("/fig1.png");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Content-Length")).toBe("5");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
  });
});

// ── pure-function parity pins ────────────────────────────────────────────

describe("pure helpers", () => {
  test("classifyEmptyCause — first zero stage names the cause", () => {
    expect(classifyEmptyCause({ chunksInScope: 0, embeddedInScope: 0, inScopeAtRev: 0, servingEligible: 0 })).toBe("SCOPE_EMPTY");
    expect(classifyEmptyCause({ chunksInScope: 5, embeddedInScope: 0, inScopeAtRev: 0, servingEligible: 0 })).toBe("NOT_EMBEDDED");
    expect(classifyEmptyCause({ chunksInScope: 5, embeddedInScope: 3, inScopeAtRev: 0, servingEligible: 0 })).toBe("EMBED_REV_EMPTY");
    expect(classifyEmptyCause({ chunksInScope: 5, embeddedInScope: 3, inScopeAtRev: 2, servingEligible: 0 })).toBe("VALIDATION_GATE_EMPTY");
    expect(classifyEmptyCause({ chunksInScope: 5, embeddedInScope: 3, inScopeAtRev: 2, servingEligible: 1 })).toBe("UNEXPECTED");
    // monotone-non-increasing invariant violation → UNEXPECTED (fail loud)
    expect(classifyEmptyCause({ chunksInScope: 1, embeddedInScope: 3, inScopeAtRev: 0, servingEligible: 0 })).toBe("UNEXPECTED");
  });

  test("MAX_LIMIT is 50 (ContentRetrievalService parity)", () => {
    expect(MAX_LIMIT).toBe(50);
  });

  test("suggestedVersionCount/suggestedSchemeCount derive from the enrichment", () => {
    const base = {
      id: "p1",
      subjectId: "s1",
      title: "t",
      paperCode: null,
      sessionLabel: null,
      board: "b",
      qualification: "q",
      validationState: "SUGGESTED",
      versionCount: 10,
      validatedVersions: 3,
      rejectedVersions: 2,
      flaggedVersions: 1,
      suggestedSchemes: 4,
      reconciliationStatus: null,
      findingCount: 0,
      avgExtractionConfidence: null,
      createdAt: "2026-10-04T00:00:00Z",
    } as EnrichedPaperSummary;
    expect(suggestedVersionCount([base])).toBe(4); // 10-3-2-1
    expect(suggestedSchemeCount([base])).toBe(4);
  });

  test("rankReasons — only signals that hold are stated; absent confidence never stated", () => {
    const p = {
      reconciliationStatus: "OK",
      findingCount: 0,
      avgExtractionConfidence: null,
    } as EnrichedPaperSummary;
    expect(rankReasons(p, 0, 0, 0, 0)).toEqual(["bridge reconciled OK", "no parser findings"]);
    const p2 = { ...p, avgExtractionConfidence: 0.9123 } as EnrichedPaperSummary;
    expect(rankReasons(p2, 3, 1, 2, 4)).toEqual([
      "bridge reconciled OK",
      "mark scheme linked for 2/3 question(s)",
      "1/3 question(s) mapped to curriculum",
      "brings 4 topic(s) not yet practicable from validated content",
      "mean extraction confidence 0.91",
      "no parser findings",
    ]);
  });

  test("sortEnrichedV3 — reconciled first, then scheme ratio desc, novel asc", () => {
    const mk = (over: Partial<EnrichedPaperSummaryV3>): EnrichedPaperSummaryV3 => ({
      id: "id",
      subjectId: "s",
      title: "t",
      paperCode: null,
      sessionLabel: null,
      board: "b",
      qualification: "q",
      validationState: "SUGGESTED",
      versionCount: 0,
      validatedVersions: 0,
      rejectedVersions: 0,
      flaggedVersions: 0,
      suggestedSchemes: 0,
      reconciliationStatus: null,
      findingCount: 0,
      avgExtractionConfidence: null,
      createdAt: "2026-10-04T00:00:00Z",
      totalQuestions: 0,
      mappedQuestions: 0,
      questionsWithScheme: 0,
      novelTopicCount: 0,
      rankReasons: [],
      ...over,
    });
    const a = mk({ id: "a", reconciliationStatus: "OK", totalQuestions: 2, questionsWithScheme: 1 });
    const b = mk({ id: "b", reconciliationStatus: "REVIEW_REQUIRED", totalQuestions: 2, questionsWithScheme: 2 });
    const c = mk({ id: "c", reconciliationStatus: "OK", totalQuestions: 2, questionsWithScheme: 2, novelTopicCount: 5 });
    const sorted = sortEnrichedV3([b, c, a]);
    expect(sorted.map((p) => p.id)).toEqual(["c", "a", "b"]);
  });

  test("documentPageText — reading order, null sorts last, verbatim join", () => {
    const canonical = {
      textBlocks: [
        { text: "second", pageNumber: 2, readingOrder: 2 },
        { text: "first", pageNumber: 2, readingOrder: 1 },
        { text: "other page", pageNumber: 1, readingOrder: 0 },
        { text: "no order", pageNumber: 2, readingOrder: null },
      ],
      tables: [{ text: "table row", pageNumber: 2, readingOrder: 3 }],
      equations: null,
    };
    expect(documentPageText(canonical, 2)).toBe("first\nsecond\ntable row\nno order");
    expect(documentPageText(canonical, 1)).toBe("other page");
    expect(documentPageText(canonical, 7)).toBe(""); // text-free page: honest empty string
  });
});

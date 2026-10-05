/**
 * Contract pins for the wave-2 content-read port (T-MIG-005).
 *
 * UNIT-level accept/reject pins derived from the frozen Java constraints
 * and the T-MIG-004 captures — the schema's regression net, not a
 * replacement for golden replay (GOLDEN_MASTER.md §2). Captured bodies
 * are embedded verbatim (scrubbed fixtures from main).
 */
import { describe, expect, test } from "bun:test";
import {
  citationDocumentViewSchema,
  contentSearchQuerySchema,
  contentSearchResponseSchema,
  documentKindSchema,
  documentSummaryViewSchema,
  enrichedReviewQueueViewV3Schema,
  paperProvenanceViewSchema,
  paperSummarySchema,
  questionTypeSchema,
  reviewQueueViewSchema,
  uuidPathSchema,
} from "./content";
import { adviceErrorSchema, bootDefaultErrorSchema } from "./errors";

describe("documentKindSchema — Document.java:28 valueOf (case-sensitive, binding trims)", () => {
  test("accepts all seven Kind values", () => {
    for (const k of [
      "QUESTION_PAPER",
      "MARK_SCHEME",
      "SYLLABUS",
      "OTHER",
      "TEXTBOOK",
      "EXTERNAL_NOTES",
      "EXTERNAL_QUESTIONS",
    ]) {
      expect(documentKindSchema.safeParse(k).success).toBe(true);
    }
  });

  test("rejects lowercase and partial values (valueOf is case-sensitive)", () => {
    for (const k of ["question_paper", "Question_Paper", "QUESTION", "MARK", ""]) {
      expect(documentKindSchema.safeParse(k).success).toBe(false);
    }
  });
});

describe("questionTypeSchema — Question.java:26", () => {
  test("accepts the three Type values, rejects unknowns", () => {
    expect(questionTypeSchema.safeParse("MCQ_SINGLE").success).toBe(true);
    expect(questionTypeSchema.safeParse("SHORT_ANSWER").success).toBe(true);
    expect(questionTypeSchema.safeParse("STRUCTURED").success).toBe(true);
    expect(questionTypeSchema.safeParse("MCQ").success).toBe(false);
  });
});

describe("contentSearchQuerySchema — @NotBlank query + Spring int/enum binding", () => {
  test("rejects ABSENT query (captured 400 validation_failed: missing required parameter)", () => {
    expect(contentSearchQuerySchema.safeParse({}).success).toBe(false);
  });

  test("rejects blank query (DECLARED @NotBlank — F-2 divergence: core 500s, R0 owns the call)", () => {
    expect(contentSearchQuerySchema.safeParse({ query: "   " }).success).toBe(false);
  });

  test("accepts whitespace-padded query (jakarta @NotBlank semantics: ' x ' is valid)", () => {
    const r = contentSearchQuerySchema.safeParse({ query: " mole " });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.query).toBe(" mole ");
  });

  test("limit defaults to 10, binds Integer.parseInt-exact text, rejects what Java rejects", () => {
    const absent = contentSearchQuerySchema.safeParse({ query: "cells" });
    expect(absent.success && absent.data.limit).toBe(10);
    const ok = contentSearchQuerySchema.safeParse({ query: "cells", limit: "25" });
    expect(ok.success && ok.data.limit).toBe(25);
    // "1e3"/"10.5"/"abc"/"" all fail Java's int binding → 400 (NumberUtils.parseNumber)
    for (const bad of ["abc", "10.5", "1e3", "0x10", ""]) {
      expect(contentSearchQuerySchema.safeParse({ query: "cells", limit: bad }).success).toBe(false);
    }
    // whitespace inside the text is trimmed by NumberUtils before parsing
    const padded = contentSearchQuerySchema.safeParse({ query: "cells", limit: " 7 " });
    expect(padded.success && padded.data.limit).toBe(7);
    // no @Min/@Max exists — negative binds (service behavior is the port's concern)
    expect(contentSearchQuerySchema.safeParse({ query: "cells", limit: "-1" }).success).toBe(true);
    // int32 overflow → ConversionFailed 400
    expect(
      contentSearchQuerySchema.safeParse({ query: "cells", limit: "2147483648" }).success,
    ).toBe(false);
  });

  test("kind trims before valueOf; unknown values rejected", () => {
    const padded = contentSearchQuerySchema.safeParse({ query: "x", kind: " TEXTBOOK " });
    expect(padded.success && padded.data.kind).toBe("TEXTBOOK");
    expect(contentSearchQuerySchema.safeParse({ query: "x", kind: "textbook" }).success).toBe(false);
  });

  test("courseRef is optional and unconstrained", () => {
    const r = contentSearchQuerySchema.safeParse({ query: "x", courseRef: "ANY-REF-01" });
    expect(r.success && r.data.courseRef).toBe("ANY-REF-01");
  });
});

describe("uuidPathSchema — path variable binding (curriculum-subject-bad-uuid-400)", () => {
  test("rejects non-uuid segments, accepts uuids", () => {
    expect(uuidPathSchema.safeParse("not-a-uuid").success).toBe(false);
    expect(uuidPathSchema.safeParse("10000000-0000-0000-0000-000000000010").success).toBe(true);
  });
});

describe("documentSummaryViewSchema — ContentDocumentController.java:199", () => {
  test("parses a view with nullable title (fileName ?? sourceUri may be null)", () => {
    const r = documentSummaryViewSchema.safeParse({
      id: "00000000-0000-4000-8000-0000000000a1",
      documentId: "QP-2022-JUN-WCH11",
      docVersion: 2,
      kind: "QUESTION_PAPER",
      title: null,
      pageCount: 16,
      elementCount: 240,
      textElementCount: 190,
      chunkCount: 42,
      sourceEngine: "tika",
      sourceEngineVersion: "2.9.1",
      checksum: "sha256:deadbeef",
      createdAt: "2026-10-04T19:02:11.829Z",
    });
    expect(r.success).toBe(true);
  });

  test("rejects an unknown kind (name() can only be a Kind)", () => {
    expect(
      documentSummaryViewSchema.safeParse({
        id: "00000000-0000-4000-8000-0000000000a1",
        documentId: "d",
        docVersion: 1,
        kind: "PAPER",
        title: "t",
        pageCount: 1,
        elementCount: 1,
        textElementCount: 1,
        chunkCount: 1,
        sourceEngine: null,
        sourceEngineVersion: null,
        checksum: null,
        createdAt: "2026-10-04T19:02:11.829Z",
      }).success,
    ).toBe(false);
  });
});

describe("contentSearchResponseSchema — List<ChunkHitView>", () => {
  test("parses the empty array (captured empty-state shape)", () => {
    expect(contentSearchResponseSchema.safeParse([]).success).toBe(true);
  });

  test("parses a hit with nullable page span and model", () => {
    expect(
      contentSearchResponseSchema.safeParse([
        {
          chunkId: "00000000-0000-4000-8000-0000000000c1",
          documentId: "QP-2022-JUN-WCH11",
          kind: "QUESTION_PAPER",
          chunkIndex: 3,
          content: "…the rate of reaction…",
          pageStart: null,
          pageEnd: null,
          elementIds: ["e1", "e2"],
          embeddingModel: null,
          score: 0.8125,
        },
      ]).success,
    ).toBe(true);
  });
});

describe("citationDocumentViewSchema — ContentReaderController.java:117", () => {
  test("header shape: page/text/paper null (one-record deep-link)", () => {
    const r = citationDocumentViewSchema.safeParse({
      id: "00000000-0000-4000-8000-0000000000a1",
      documentId: "doc-1",
      docVersion: 1,
      kind: "SYLLABUS",
      title: "spec.pdf",
      pageCount: 48,
      page: null,
      text: null,
      paper: null,
    });
    expect(r.success).toBe(true);
  });

  test("paper role is exactly QP|MS", () => {
    const base = {
      id: "00000000-0000-4000-8000-0000000000a1",
      documentId: "doc-1",
      docVersion: 1,
      kind: "QUESTION_PAPER",
      title: "t",
      pageCount: 16,
      page: 3,
      text: "verbatim page text",
    };
    expect(citationDocumentViewSchema.safeParse({ ...base, paper: { paperId: "00000000-0000-4000-8000-0000000000b1", paperCode: "WCH11", sessionLabel: "June 2022", role: "QP" } }).success).toBe(true);
    expect(citationDocumentViewSchema.safeParse({ ...base, paper: { paperId: "00000000-0000-4000-8000-0000000000b1", paperCode: "WCH11", sessionLabel: "June 2022", role: "qp" } }).success).toBe(false);
  });
});

describe("reviewQueueViewSchema — ContentController.java:303 (captured empty state)", () => {
  test("parses the captured body verbatim", () => {
    expect(
      reviewQueueViewSchema.safeParse({ papers: [], suggestedVersions: 0, suggestedSchemes: 0 })
        .success,
    ).toBe(true);
  });

  test("rejects string counts (longs bind as numbers)", () => {
    expect(
      reviewQueueViewSchema.safeParse({ papers: [], suggestedVersions: "0", suggestedSchemes: 0 })
        .success,
    ).toBe(false);
  });

  test("parses a SUGGESTED paper row with null subjectId (unplaced)", () => {
    const r = reviewQueueViewSchema.safeParse({
      papers: [
        {
          id: "00000000-0000-4000-8000-0000000000b1",
          subjectId: null,
          title: "WCH11 June 2022",
          paperCode: "WCH11",
          sessionLabel: "June 2022",
          board: "Edexcel",
          qualification: "IAL",
          validationState: "SUGGESTED",
        },
      ],
      suggestedVersions: 12,
      suggestedSchemes: 9,
    });
    expect(r.success).toBe(true);
  });

  test("paperSummarySchema rejects a validationState outside the enum", () => {
    expect(
      paperSummarySchema.safeParse({
        id: "00000000-0000-4000-8000-0000000000b1",
        subjectId: null,
        title: "t",
        paperCode: null,
        sessionLabel: null,
        board: null,
        qualification: null,
        validationState: "PENDING",
      }).success,
    ).toBe(false);
  });
});

describe("enrichedReviewQueueViewV3Schema — pinned by the v3 empty-state capture", () => {
  test("parses the captured body verbatim", () => {
    expect(
      enrichedReviewQueueViewV3Schema.safeParse({
        papers: [],
        suggestedVersions: 0,
        suggestedSchemes: 0,
        practicableTopicCount: 0,
      }).success,
    ).toBe(true);
  });

  test("parses a v3 row inside the envelope: flat v2 fields + signals + rankReasons", () => {
    const r = enrichedReviewQueueViewV3Schema.safeParse({
      papers: [
        {
          id: "00000000-0000-4000-8000-0000000000b1",
          subjectId: "10000000-0000-0000-0000-000000000010",
          title: "WCH11 June 2022",
          paperCode: "WCH11",
          sessionLabel: "June 2022",
          board: "Edexcel",
          qualification: "IAL",
          validationState: "SUGGESTED",
          versionCount: 12,
          validatedVersions: 0,
          rejectedVersions: 0,
          flaggedVersions: 0,
          suggestedSchemes: 9,
          reconciliationStatus: "PENDING",
          findingCount: 3,
          avgExtractionConfidence: null,
          createdAt: "2026-10-04T19:02:11.829Z",
          totalQuestions: 14,
          mappedQuestions: 0,
          questionsWithScheme: 9,
          novelTopicCount: 2,
          rankReasons: ["12 suggested versions", "2 novel topics"],
        },
      ],
      suggestedVersions: 12,
      suggestedSchemes: 9,
      practicableTopicCount: 5,
    });
    expect(r.success).toBe(true);
  });
});

describe("paperProvenanceViewSchema — ContentController.java:167", () => {
  test("both identities required (fail-closed 404 means the view never lacks one)", () => {
    const identity = {
      documentId: "QP-2022-JUN-WCH11",
      fileName: "wch11-2022-jun.pdf",
      sourceUri: "s3://corpus/wch11.pdf",
      checksum: "sha256:deadbeef",
      checksumAlgorithm: "SHA-256",
    };
    expect(
      paperProvenanceViewSchema.safeParse({
        paperId: "00000000-0000-4000-8000-0000000000b1",
        questionPaper: identity,
        markScheme: identity,
      }).success,
    ).toBe(true);
    expect(
      paperProvenanceViewSchema.safeParse({
        paperId: "00000000-0000-4000-8000-0000000000b1",
        questionPaper: identity,
        markScheme: null,
      }).success,
    ).toBe(false);
  });
});

describe("error envelopes — errors.ts (observed shapes, T-MIG-004 captures)", () => {
  test("Boot-default envelope parses the captured 401 (message absent, path present)", () => {
    expect(
      bootDefaultErrorSchema.safeParse({
        timestamp: "2026-10-04T19:02:11.829Z",
        status: 401,
        error: "Unauthorized",
        path: "/api/v1/content/documents/00000000-0000-4000-8000-0000000000d1",
      }).success,
    ).toBe(true);
  });

  test("advice envelope parses the captured 400/404 (message present, no path)", () => {
    expect(
      adviceErrorSchema.safeParse({
        status: 400,
        error: "validation_failed",
        message: "missing required parameter: query",
        timestamp: "2026-10-04T19:02:14.557248630Z",
      }).success,
    ).toBe(true);
    expect(
      adviceErrorSchema.safeParse({
        status: 404,
        error: "not_found",
        message: "Document 00000000-0000-4000-8000-0000000000d1 not found",
        timestamp: "2026-10-04T19:02:13.930837060Z",
      }).success,
    ).toBe(true);
  });
});

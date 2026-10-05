/**
 * Contract pins for the write-flow contracts (T-MIG-006).
 *
 * UNIT-level accept/reject pins derived from the frozen Java sources —
 * the schema's regression net. NO golden write captures exist (T-MIG-004
 * captured read surfaces; T-MIG-003's 5 write captures are auth, covered
 * by auth.ts), so the baseline here is the Java declaration itself:
 * PastPaperDraftDto.java, CurriculumDraftDto.java, CanonicalDocumentDto.java,
 * CanonicalDocumentValidator.java, ContentController.java,
 * TeacherCurriculumController.java, ContentDocumentController.java.
 */
import { describe, expect, test } from "bun:test";
import {
  CANONICAL_DOCUMENT_SUPPORTED_SCHEMA,
  PAST_PAPER_SUPPORTED_SCHEMA,
  batchResultSchema,
  canonicalDocumentSchema,
  canonicalDocumentViolations,
  curriculumDraftSchema,
  curriculumIngestionResultSchema,
  derivedDocumentId,
  documentEmbeddingViewSchema,
  documentIngestionViewSchema,
  javaJsonBool,
  javaJsonDouble,
  javaJsonInt,
  paperPlaceRequestSchema,
  pastPaperDraftSchema,
  pastPaperIngestionResultSchema,
  pointCriteriaUpdateSchema,
  schemeSummarySchema,
  schemeValidateRequestSchema,
  topicMappingRequestSchema,
  topicMappingResultSchema,
  validateAllQuerySchema,
  versionSummarySchema,
} from "./content-writes";
import { knowledgeNodeViewSchema } from "./curriculum";

describe("javaJsonInt — Jackson String→int coercion defaults", () => {
  test("numeric strings bind; exponent forms only when integral", () => {
    expect(javaJsonInt.parse("3")).toBe(3);
    expect(javaJsonInt.parse(" 3 ")).toBe(3);
    expect(javaJsonInt.parse("1e3")).toBe(1000);
    expect(javaJsonInt.parse("-7")).toBe(-7);
  });

  test("rejects what Jackson rejects: fractional, hex, empty, text, null, bool", () => {
    for (const bad of ["10.5", "0x10", "", "   ", "abc", "1.2.3", null, true]) {
      expect(javaJsonInt.safeParse(bad).success).toBe(false);
    }
  });
});

describe("javaJsonDouble / javaJsonBool — coercion defaults", () => {
  test("double binds fractional and integral numeric strings, rejects junk", () => {
    expect(javaJsonDouble.parse("0.92")).toBeCloseTo(0.92);
    expect(javaJsonDouble.parse("3")).toBe(3);
    expect(javaJsonDouble.safeParse("abc").success).toBe(false);
    expect(javaJsonDouble.safeParse(null).success).toBe(false);
  });

  test("bool binds true/false text case-insensitively; yes/1/null rejected", () => {
    expect(javaJsonBool.parse("true")).toBe(true);
    expect(javaJsonBool.parse("FALSE")).toBe(false);
    for (const bad of ["yes", "1", "on", null, 0]) {
      expect(javaJsonBool.safeParse(bad).success).toBe(false);
    }
  });
});

describe("pastPaperDraftSchema — PastPaperDraftDto.java binding", () => {
  test("SUPPORTED_SCHEMA constant is the 1.0 the controller 409-guards", () => {
    expect(PAST_PAPER_SUPPORTED_SCHEMA).toBe("1.0");
  });

  test("empty object binds (no @JsonProperty(required) anywhere): primitives get JVM defaults", () => {
    const r = pastPaperDraftSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.schemaVersion).toBeNull();
      expect(r.data.paper).toBeNull();
      expect(r.data.questions).toBeNull();
      expect(r.data.markScheme).toBeNull();
      expect(r.data.reviewRequired).toBe(false);
    }
  });

  test("unknown keys are IGNORED (@JsonIgnoreProperties), top-level and nested", () => {
    const r = pastPaperDraftSchema.safeParse({
      totallyUnknown: { nested: [1, 2] },
      paper: { board: "Edexcel", mysteryField: true },
      questions: [{ prompt: "x", unknownInDraft: "y" }],
    });
    expect(r.success).toBe(true);
  });

  test("explicit null on a primitive is a 400 in Java (coercion failure) — rejected here", () => {
    expect(pastPaperDraftSchema.safeParse({ reviewRequired: null }).success).toBe(false);
    expect(
      pastPaperDraftSchema.safeParse({ questions: [{ prompt: "x", marks: null }] }).success,
    ).toBe(false);
  });

  test("absent primitive binds to the JVM default (0 / 0.0 / false)", () => {
    const r = pastPaperDraftSchema.parse({ questions: [{ prompt: "stem" }] });
    expect(r.questions?.[0]?.marks).toBe(0);
    expect(r.questions?.[0]?.confidence).toBe(0);
    expect(r.questions?.[0]?.pageNumber).toBe(0);
  });

  test("MarkSchemeDraft compactors: null points → [] (PastPaperDraftDto.java:77-79)", () => {
    expect(pastPaperDraftSchema.parse({ markScheme: { points: null } }).markScheme?.points).toEqual([]);
    expect(pastPaperDraftSchema.parse({ markScheme: {} }).markScheme?.points).toEqual([]);
  });

  test("questionType is a FREE STRING on the draft (service-side enum resolution)", () => {
    const r = pastPaperDraftSchema.safeParse({ questions: [{ questionType: "mcq_single" }] });
    expect(r.success).toBe(true);
  });

  test("boolean text coerces for the primitive (Jackson default)", () => {
    expect(pastPaperDraftSchema.parse({ reviewRequired: "true" }).reviewRequired).toBe(true);
  });
});

describe("curriculumDraftSchema — CurriculumDraftDto.java binding", () => {
  test("empty object binds; provenance/units null", () => {
    const r = curriculumDraftSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.units).toBeNull();
      expect(r.data.provenance).toBeNull();
    }
  });

  test("RECURSIVE subtopics bind to arbitrary depth (TopicDraft self-reference)", () => {
    const draft = {
      units: [
        {
          topics: [
            {
              code: "1.1",
              subtopics: [
                { code: "1.1.1", subtopics: [{ code: "1.1.1a", subtopics: [] }] },
              ],
            },
          ],
        },
      ],
    };
    const r = curriculumDraftSchema.safeParse(draft);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.units?.[0]?.topics?.[0]?.subtopics?.[0]?.subtopics?.[0]?.code).toBe("1.1.1a");
    }
  });

  test("pageNumber is a boxed Integer (null binds); confidence is primitive (null 400s, absent → 0)", () => {
    expect(curriculumDraftSchema.safeParse({ units: [{ pageNumber: null }] }).success).toBe(true);
    expect(curriculumDraftSchema.safeParse({ units: [{ confidence: null }] }).success).toBe(false);
    expect(curriculumDraftSchema.parse({ units: [{}] }).units?.[0]?.confidence).toBe(0);
  });

  test("a non-1.1 schemaVersion still BINDS (the 409 is controller logic, mirrored by the constant)", () => {
    const r = curriculumDraftSchema.safeParse({ schemaVersion: "9.9" });
    expect(r.success).toBe(true);
  });
});

describe("canonicalDocumentSchema — CanonicalDocumentDto.java binding", () => {
  test("empty object binds (validation happens in the validator pass, not at binding)", () => {
    const r = canonicalDocumentSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  test("snake_case element wire names are kept (§8); unknown keys ignored", () => {
    const r = canonicalDocumentSchema.safeParse({
      textBlocks: [
        { element_id: "e1", element_type: "para", page_number: "2", whatever: 1 },
      ],
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.textBlocks?.[0]?.page_number).toBe(2);
  });

  test("element confidence is a boxed Double (null binds) — unlike the draft DTOs' primitive", () => {
    expect(canonicalDocumentSchema.safeParse({ tables: [{ confidence: null }] }).success).toBe(true);
    expect(canonicalDocumentSchema.safeParse({ tables: [{ confidence: "0.5" }] }).success).toBe(true);
  });
});

describe("derivedDocumentId — byte-exact port of CanonicalDocumentValidator.java:215-232", () => {
  test("matches the Java algorithm vectors (computed independently)", () => {
    expect(derivedDocumentId("ABCDEF", "test-engine", "1.0")).toBe(
      "75044531-902f-5dcd-869a-0baf701bfa52",
    );
    expect(
      derivedDocumentId(
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        "syllabai-parser",
        "2.3.1",
      ),
    ).toBe("3450b17c-8204-5850-8611-ac8e9f35c9c1");
    expect(derivedDocumentId(null, null, null)).toBe("54b97e19-6da2-520b-9c5e-40570ac7725d");
  });

  test("components are stripped + lowercased (component() mirror), null → \"\"", () => {
    expect(derivedDocumentId("  ABC  ", "ENGINE", "1.0")).toBe(
      derivedDocumentId("abc", "engine", "1.0"),
    );
  });
});

describe("canonicalDocumentViolations — CanonicalDocumentValidator.validate port", () => {
  const base = () => ({
    schemaVersion: CANONICAL_DOCUMENT_SUPPORTED_SCHEMA,
    version: 1,
    pageCount: 3,
  });

  test("an empty-bound document collects the required-field violations in Java source order", () => {
    const v = canonicalDocumentViolations(canonicalDocumentSchema.parse({}));
    expect(v).toEqual([
      'schemaVersion must be "1.0" (was null)',
      "documentId is required",
      "version must be >= 1 (was null)",
      "source is required",
      "pageCount must be >= 1 (was null)",
      "provenance is required",
    ]);
  });

  test("a fully valid document (self-derived id) has NO violations", () => {
    const checksum = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const doc = canonicalDocumentSchema.parse({
      ...base(),
      documentId: derivedDocumentId(checksum, "syllabai-parser", "2.3.1"),
      source: { uri: "file:///qp.pdf", checksum, mimeType: "application/pdf" },
      provenance: { engine: "syllabai-parser", engineVersion: "2.3.1" },
      retrieval: { series: "JUN", year: 2019 },
      textBlocks: [
        {
          element_id: "e1",
          element_type: "para",
          page_number: 1,
          reading_order: 0,
          confidence: 0.98,
          source_engine: "parser",
          source_engine_version: "1",
        },
      ],
      sections: [{ sectionId: "s1", elementIds: ["e1"] }],
    });
    expect(canonicalDocumentViolations(doc)).toEqual([]);
  });

  test("P-6: a documentId that drifts from its derivation is a violation", () => {
    const doc = canonicalDocumentSchema.parse({
      ...base(),
      documentId: "11111111-1111-5111-8111-111111111111",
      source: { uri: "u", checksum: "cafe", mimeType: "application/pdf" },
      provenance: { engine: "e", engineVersion: "1" },
    });
    const v = canonicalDocumentViolations(doc);
    expect(v.some((x) => x.startsWith("documentId does not match its checksum+engine+"))).toBe(
      true,
    );
  });

  test("retrieval.series: raw labels rejected, padded canonical enum accepted (validator:85-90)", () => {
    const withSeries = (series: unknown) => {
      const doc = canonicalDocumentSchema.parse({
        ...base(),
        documentId: "d",
        source: { uri: "u", checksum: "c", mimeType: "m" },
        provenance: { engine: "e", engineVersion: "1" },
        retrieval: { series },
      });
      return canonicalDocumentViolations(doc).filter((x) => x.includes("retrieval.series"));
    };
    expect(withSeries("Summer 2019").length).toBe(1);
    expect(withSeries("MAY").length).toBe(1);
    expect(withSeries(" JUN ").length).toBe(0);
    const year = (y: number) => {
      const doc = canonicalDocumentSchema.parse({
        ...base(),
        source: { uri: "u", checksum: "c", mimeType: "m" },
        provenance: { engine: "e", engineVersion: "1" },
        retrieval: { year: y },
      });
      return canonicalDocumentViolations(doc).filter((x) => x.includes("retrieval.year"));
    };
    expect(year(1949).length).toBe(1);
    expect(year(2101).length).toBe(1);
    expect(year(1950).length).toBe(0);
    expect(year(2100).length).toBe(0);
  });

  test("element invariants: id/type/page/reading_order/confidence/engine — and page bounds use pageCount", () => {
    const doc = canonicalDocumentSchema.parse({
      ...base(),
      textBlocks: [
        { element_id: "", element_type: "", page_number: 4, reading_order: -1, confidence: 1.5 },
      ],
    });
    const v = canonicalDocumentViolations(doc);
    expect(v).toContain("textBlock without element_id");
    expect(v).toContain("textBlock <blank-id>: element_type is required");
    expect(v.some((x) => x.includes("page_number 4 outside 1..3"))).toBe(true);
    expect(v.some((x) => x.includes("reading_order must be >= 0 (was -1)"))).toBe(true);
    expect(v.some((x) => x.includes("confidence 1.5 outside 0..1"))).toBe(true);
    expect(v.some((x) => x.includes(": source_engine is required"))).toBe(true);
    expect(v.some((x) => x.includes(": source_engine_version is required"))).toBe(true);
  });

  test("duplicate element_id is caught ACROSS families (shared id universe, validator:99-137)", () => {
    const doc = canonicalDocumentSchema.parse({
      ...base(),
      textBlocks: [{ element_id: "e1", element_type: "para", page_number: 1, reading_order: 0 }],
      tables: [{ element_id: "e1", element_type: "table", page_number: 1, reading_order: 1 }],
    });
    expect(canonicalDocumentViolations(doc)).toContain("duplicate element_id e1");
  });

  test("sections: blank sectionId and dangling element refs are violations; known refs pass", () => {
    const doc = canonicalDocumentSchema.parse({
      ...base(),
      textBlocks: [{ element_id: "e1", element_type: "para", page_number: 1, reading_order: 0 }],
      sections: [
        { sectionId: "", elementIds: ["e1"] },
        { sectionId: "s2", elementIds: ["ghost"] },
        { sectionId: "s3", elementIds: ["e1"] },
      ],
    });
    const v = canonicalDocumentViolations(doc);
    expect(v).toContain("section without sectionId");
    expect(v).toContain("section s2 references unknown element ghost");
    expect(v.filter((x) => x.includes("references unknown")).length).toBe(1);
  });

  test("layout-only elements (null text) are TOLERATED (validator:97-98 comment)", () => {
    const checksum = "cafecafecafecafecafecafecafecafecafecafecafecafecafecafecafecafe";
    const doc = canonicalDocumentSchema.parse({
      ...base(),
      documentId: derivedDocumentId(checksum, "syllabai-parser", "2.3.1"),
      source: { uri: "u", checksum, mimeType: "application/pdf" },
      provenance: { engine: "syllabai-parser", engineVersion: "2.3.1" },
      figures: [
        { element_id: "f1", element_type: "img", page_number: 1, reading_order: 2, text: null,
          source_engine: "parser", source_engine_version: "1" },
      ],
    });
    expect(canonicalDocumentViolations(doc)).toEqual([]);
  });
});

describe("review-action request bodies — ContentController.java", () => {
  test("PlaceRequest: @NotNull uuid (ContentController.java:350)", () => {
    expect(paperPlaceRequestSchema.safeParse({}).success).toBe(false);
    expect(paperPlaceRequestSchema.safeParse({ subjectId: null }).success).toBe(false);
    expect(paperPlaceRequestSchema.safeParse({ subjectId: "not-a-uuid" }).success).toBe(false);
    expect(
      paperPlaceRequestSchema.safeParse({ subjectId: "0b8b8f58-3a17-4b0e-8f3e-2a6f9b0c1d02" })
        .success,
    ).toBe(true);
  });

  test("TopicMappingRequest: primaryNodeId @NotNull; secondaryNodeIds nullish but element-typed (lines 261-264)", () => {
    expect(topicMappingRequestSchema.safeParse({}).success).toBe(false);
    expect(topicMappingRequestSchema.safeParse({ primaryNodeId: null }).success).toBe(false);
    expect(topicMappingRequestSchema.safeParse({ primaryNodeId: "x" }).success).toBe(false);
    const ok = topicMappingRequestSchema.safeParse({
      primaryNodeId: "0b8b8f58-3a17-4b0e-8f3e-2a6f9b0c1d02",
      secondaryNodeIds: null,
    });
    expect(ok.success).toBe(true);
    expect(
      topicMappingRequestSchema.safeParse({
        primaryNodeId: "0b8b8f58-3a17-4b0e-8f3e-2a6f9b0c1d02",
        secondaryNodeIds: ["nope"],
      }).success,
    ).toBe(false);
  });

  test("PointCriteriaUpdate: both components @NotNull — empty acceptance list is FINE (not @NotEmpty)", () => {
    expect(pointCriteriaUpdateSchema.safeParse({}).success).toBe(false);
    expect(
      pointCriteriaUpdateSchema.safeParse({
        markPointId: "0b8b8f58-3a17-4b0e-8f3e-2a6f9b0c1d02",
        acceptanceCriteria: null,
      }).success,
    ).toBe(false);
    expect(
      pointCriteriaUpdateSchema.safeParse({
        markPointId: "0b8b8f58-3a17-4b0e-8f3e-2a6f9b0c1d02",
        acceptanceCriteria: [],
      }).success,
    ).toBe(true);
  });

  test("SchemeValidateRequest: the WHOLE body is optional (required = false, line 268-269)", () => {
    expect(schemeValidateRequestSchema.safeParse(undefined).success).toBe(true);
    expect(schemeValidateRequestSchema.safeParse(null).success).toBe(true);
    expect(schemeValidateRequestSchema.safeParse({}).success).toBe(true);
    expect(
      schemeValidateRequestSchema.safeParse({ criteria: [{ acceptanceCriteria: ["x"] }] }).success,
    ).toBe(false); // markPointId missing → @NotNull 400
  });

  test("validate-all `force`: optional boxed Boolean text (StringToBooleanConverter)", () => {
    expect(validateAllQuerySchema.safeParse({}).success).toBe(true);
    expect(validateAllQuerySchema.parse({ force: "true" })).toEqual({ force: true });
    expect(validateAllQuerySchema.parse({ force: " FALSE " })).toEqual({ force: false });
    for (const bad of ["yes", "1", "on", ""]) {
      expect(validateAllQuerySchema.safeParse({ force: bad }).success).toBe(false);
    }
  });
});

describe("write response views — record serialization (absent never happens)", () => {
  const uuid = "0b8b8f58-3a17-4b0e-8f3e-2a6f9b0c1d02";

  test("pastPaperIngestionResult: validationState is the controller constant 'SUGGESTED'", () => {
    const body = { paperId: uuid, questions: 12, parts: 30, markPoints: 54, validationState: "SUGGESTED" };
    expect(pastPaperIngestionResultSchema.safeParse(body).success).toBe(true);
    expect(
      pastPaperIngestionResultSchema.safeParse({ ...body, validationState: "VALIDATED" }).success,
    ).toBe(false);
  });

  test("curriculumIngestionResult: same constant + three uuids + counts", () => {
    const body = {
      curriculumVersionId: uuid,
      subjectId: uuid,
      subjectRootNodeId: uuid,
      units: 4,
      topics: 18,
      subtopics: 61,
      validationState: "SUGGESTED",
    };
    expect(curriculumIngestionResultSchema.safeParse(body).success).toBe(true);
    expect(
      curriculumIngestionResultSchema.safeParse({ ...body, validationState: "VALIDATED" }).success,
    ).toBe(false);
  });

  test("documentIngestionView: kind is the Kind enum (name()), duplicate boolean", () => {
    const body = { id: uuid, documentId: "doc-1", duplicate: false, chunks: 9, elements: 120, pages: 12, kind: "SYLLABUS" };
    expect(documentIngestionViewSchema.safeParse(body).success).toBe(true);
    expect(documentIngestionViewSchema.safeParse({ ...body, kind: "OTHER " }).success).toBe(false);
  });

  test("documentEmbeddingView: model is a plausible-null reference (nullable, never optional)", () => {
    const body = { id: uuid, documentId: "doc-1", embedded: 9, skipped: 2, totalChunks: 11 };
    expect(documentEmbeddingViewSchema.safeParse(body).success).toBe(false); // model ABSENT → not a record wire
    expect(
      documentEmbeddingViewSchema.safeParse({ ...body, model: "text-embedding-3-small" }).success,
    ).toBe(true);
    expect(documentEmbeddingViewSchema.safeParse({ ...body, model: null }).success).toBe(true);
  });

  test("versionSummary / schemeSummary / batchResult / topicMappingResult", () => {
    expect(
      versionSummarySchema.safeParse({ id: uuid, questionId: uuid, version: 1, validationState: "VALIDATED" })
        .success,
    ).toBe(true);
    expect(
      versionSummarySchema.safeParse({ id: uuid, questionId: uuid, version: 1, validationState: "GONE" })
        .success,
    ).toBe(false);
    expect(
      schemeSummarySchema.safeParse({ id: uuid, questionVersionId: uuid, pointCount: 5, validationState: "SUGGESTED" })
        .success,
    ).toBe(true);
    expect(
      batchResultSchema.safeParse({
        paperId: uuid,
        paperState: "VALIDATED",
        totalVersions: 12,
        versionsValidated: 12,
        schemesValidated: 2,
      }).success,
    ).toBe(true);
    expect(
      topicMappingResultSchema.safeParse({
        questionId: uuid,
        primaryNodeId: uuid,
        primaryCode: "4CH0/1",
        primaryTitle: "Chemistry",
        topicCount: 3,
      }).success,
    ).toBe(true);
  });

  test("curriculum write actions reuse the read-side views (NodeView / CurriculumOverview)", () => {
    // re-imported schemas parse a minimal NodeView / CurriculumOverview row
    const node = {
      id: uuid,
      code: "1.1",
      nodeType: "TOPIC",
      title: "T",
      validationStatus: "VALIDATED",
      provenance: null,
      parentId: null,
    };
    expect(knowledgeNodeViewSchema.safeParse(node).success).toBe(true);
  });
});

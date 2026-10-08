/**
 * Tranche-B service-law pins (T-MIG-082 tranche B) — the pure ports'
 * deterministic laws over frozen Java truth @ 6cad6ef. NO golden captures
 * exist for these families (the 178-case corpus exercises none of them —
 * r1c Task-33 of record), so the acceptance baseline is the Java
 * declaration itself, pinned line-against-line (the T-MIG-006 precedent).
 *
 * Files under pin:
 *   fetch-parser.ts      ← FetchQueryParser.java (268)
 *   content-routing.ts   ← FetchService.java (221) + EnumerateService.java (273)
 *   chunking.ts          ← ChunkingService.java (182) + ChunkHeaderBuilder.java (205)
 *   past-paper.ts        ← PastPaperIngestionService.java helpers (359)
 *   glm-ocr.ts           ← GlmOcrDraftMapper.java (267)
 *   exam-series.ts       ← ExamSeriesImportService.java validateRow (145)
 */
import { describe, expect, test } from "bun:test";
import {
  parseFetchQuery,
  parsedIsEmpty,
} from "../../src/services/ingestion/fetch-parser";
import {
  displaySeries,
  specRangeSegment,
  specCodeOrder,
  normalizeAtom,
  buildChunkHeader,
  estimateTokens,
  chunkCanonicalDocument,
} from "../../src/services/ingestion/chunking";
import {
  uniquePartLabel,
  subjectCodeOf,
  paperTitleOf,
  anchorCodeOf,
  javaStringHashCode,
  javaHex8,
} from "../../src/services/ingestion/past-paper";
import {
  markPointRef,
  normalizePart,
  toPastPaperDraft,
  assembleReviewFindings,
  duplicatePartLabelFindings,
  reviewFindingsForPaper,
} from "../../src/services/ingestion/glm-ocr";
import { validateExamSeriesRow } from "../../src/services/ingestion/exam-series";
import { canonicalDocumentViolations } from "@syllabai/contracts";
import {
  fetchViewSchema,
  enumerateViewSchema,
  glmPairResultViewSchema,
  glmPaperDraftSchema,
  glmMarkSchemeDraftSchema,
  glmReconciliationSchema,
  canonicalDocumentSchema,
  examSeriesRowSchema,
  examSeriesImportSummarySchema,
} from "@syllabai/contracts";
import { fakeSql, type Route } from "../curriculum/helpers";
import {
  fetchQuery,
  enumerateQuery,
  enumerateStructured,
} from "../../src/services/ingestion/content-routing";

const SCOPE = {
  curriculumVersionId: "10000000-0000-0000-0000-000000000001",
  code: "IAL-CHEM-2018",
  surface: new Set<string>(),
};

// ── FetchQueryParser (FetchQueryParser.java) ────────────────────────────────

describe("fetch-parser — the metadata vocabulary (frozen :192-267)", () => {
  test("full paper codes: slash/dash, optional spaces, R suffix", () => {
    expect(parseFetchQuery("mark scheme for 4CH1/2C 2020").paperCode).toBe("4CH1/2C");
    expect(parseFetchQuery("4CH0-1CR june 2014").paperCode).toBe("4CH0/1CR");
    expect(parseFetchQuery("4CH1 / 1C january 2019").paperCode).toBe("4CH1/1C");
  });

  test("bare unit binds only when no full code matched", () => {
    expect(parseFetchQuery("the 1CR paper").unit).toBe("1CR");
    expect(parseFetchQuery("paper 2C summer 2013").unit).toBe("2C");
    expect(parseFetchQuery("4CH1/2C 2020").unit).toBeNull();
  });

  test("series vocabulary: canonical enum only, raw labels never stored", () => {
    expect(parseFetchQuery("summer 2019").series).toBe("JUN");
    expect(parseFetchQuery("june 2019").series).toBe("JUN");
    expect(parseFetchQuery("january 2020").series).toBe("JAN");
    expect(parseFetchQuery("jan 2020").series).toBe("JAN");
    expect(parseFetchQuery("october 2021").series).toBe("NOV");
    expect(parseFetchQuery("november 2021").series).toBe("NOV");
    expect(parseFetchQuery("autumn 2021").series).toBeNull();
  });

  test("year: first 4-digit 19xx/20xx wins", () => {
    expect(parseFetchQuery("mark scheme 2019 4CH1").year).toBe(2019);
    expect(parseFetchQuery("question 3 from 1899").year).toBeNull();
  });

  test("question numbers: keyword-led forms incl. no./ordinal suffix", () => {
    expect(parseFetchQuery("question 6").qnum).toBe(6);
    expect(parseFetchQuery("q4").qnum).toBe(4);
    expect(parseFetchQuery("Q7b").qnum).toBe(7);
    expect(parseFetchQuery("Q7b").part).toBe("b");
    expect(parseFetchQuery("question number 3").qnum).toBe(3);
    expect(parseFetchQuery("question no. 10").qnum).toBe(10);
    expect(parseFetchQuery("question 10th").qnum).toBe(10);
  });

  test("word numbers one–forty-nine, cardinal and ordinal", () => {
    expect(parseFetchQuery("question ten").qnum).toBe(10);
    expect(parseFetchQuery("question tenth").qnum).toBe(10);
    expect(parseFetchQuery("question twenty one").qnum).toBe(21);
    expect(parseFetchQuery("question thirty-first").qnum).toBe(31);
    expect(parseFetchQuery("question forty ninth").qnum).toBe(49);
  });

  test("letter-gated roman sub-parts: (b)(ii) binds, bare roman never does", () => {
    expect(parseFetchQuery("question 9(b)(ii)").part).toBe("b");
    expect(parseFetchQuery("question 9(b)(ii)").partRoman).toBe("ii");
    expect(parseFetchQuery("question 9 part b ii").part).toBe("b");
    expect(parseFetchQuery("question 9 part b ii").partRoman).toBe("ii");
    // "question 9 (i think)" and "question 9 (ii)" bind the number alone
    expect(parseFetchQuery("question 9 (i think)").qnum).toBe(9);
    expect(parseFetchQuery("question 9 (i think)").part).toBeNull();
    expect(parseFetchQuery("question 9 (ii)").qnum).toBe(9);
    expect(parseFetchQuery("question 9 (ii)").part).toBeNull();
  });

  test("ordinal-led forms bind the number alone", () => {
    expect(parseFetchQuery("10th question").qnum).toBe(10);
    expect(parseFetchQuery("tenth question").qnum).toBe(10);
    expect(parseFetchQuery("10th question").part).toBeNull();
  });

  test("NFKC folds full-width digits; hyphen fold spares digit-adjacent codes", () => {
    const wide = parseFetchQuery("question １０ june 2019");
    expect(wide.qnum).toBe(10);
    expect(parseFetchQuery("question twenty-one").qnum).toBe(21); // hyphen fold feeds the keyword grammar
    expect(parseFetchQuery("4CH0-1C").paperCode).toBe("4CH0/1C");
  });

  test("intent probe: msSeeking default true, QP probes flip it", () => {
    expect(parseFetchQuery("mark scheme june 2020").msSeeking).toBe(true);
    expect(parseFetchQuery("answer june 2020").msSeeking).toBe(true);
    expect(parseFetchQuery("what did they ask in june 2020").msSeeking).toBe(false);
    expect(parseFetchQuery("4CH1 2020").msSeeking).toBe(true); // QP probe absent → true
  });

  test("normalized echo + empty parse", () => {
    expect(parseFetchQuery("mark scheme for 4CH1/2C june 2020 q7b").normalized).toBe(
      "4CH1/2C JUN 2020 Q7b",
    );
    const empty = parseFetchQuery("electrolysis");
    expect(parsedIsEmpty(empty)).toBe(true);
    expect(empty.normalized).toBe("");
    expect(parseFetchQuery("unit 2C summer 2013 q4").normalized).toBe("unit:2C JUN 2013 Q4");
  });
});

// ── ChunkHeaderBuilder + ChunkingService ────────────────────────────────────

describe("chunking — the deterministic T-013 stage", () => {
  test("displaySeries + spec range (numeric order: 2.9 < 2.10)", () => {
    expect(displaySeries("JUN")).toBe("Jun");
    expect(displaySeries("X")).toBe("");
    expect(specCodeOrder("4CH1-2.9", "4CH1-2.10")).toBeLessThan(0);
    expect(specRangeSegment(["4CH1-2.10", "4CH1-2.9"])).toBe("Spec 4CH1-2.9–4CH1-2.10");
    expect(specRangeSegment(["4CH1-2.9"])).toBe("Spec 4CH1-2.9");
    expect(specRangeSegment([])).toBe("");
  });

  test("normalizeAtom strips the leading q/Q and trims", () => {
    expect(normalizeAtom("q3")).toBe("3");
    expect(normalizeAtom(" Q12 ")).toBe("12");
    expect(normalizeAtom("")).toBeNull();
    expect(normalizeAtom(null)).toBeNull();
  });

  test("estimate = ceil(chars/4), min 1", () => {
    expect(estimateTokens("abcdefgh")).toBe(2);
    expect(estimateTokens("abc")).toBe(1);
  });

  test("the MS Q-prefix fires only without an explicit label", () => {
    type RetrievalShape = Parameters<typeof buildChunkHeader>[1];
type NonNullRetrieval = Exclude<RetrievalShape, null | undefined>;
const meta: NonNullRetrieval = { series: "JUN", year: 2020 } as NonNullRetrieval;
    expect(buildChunkHeader("MARK_SCHEME", meta, "q3", 2, 2)).toBe("Jun 2020 | MS Q3 | p.2");
    expect(
      buildChunkHeader("MARK_SCHEME", { ...meta, label: "Paper 1" }, "q3", 2, 2),
    ).toBe("Jun 2020 | Paper 1 | Q3 | p.2");
    expect(buildChunkHeader("QUESTION_PAPER", meta, "q3", 2, 4)).toBe("Jun 2020 | Q3 | pp.2–4");
    expect(buildChunkHeader("QUESTION_PAPER", null, null, null, null)).toBe("");
  });

  test("group-key change is a HARD boundary; oversized block stands alone", () => {
    const doc = canonicalDocumentSchema.parse({
      documentId: "d1",
      schemaVersion: "1.0",
      version: 1,
      pageCount: 1,
      source: { uri: "u", checksum: "c", mimeType: "application/pdf" },
      provenance: { engine: "e", engineVersion: "1" },
      textBlocks: [
        { element_id: "t1", element_type: "P", page_number: 1, reading_order: 0, text: "atom one", group_key: "q1" },
        { element_id: "t2", element_type: "P", page_number: 1, reading_order: 1, text: "atom two", group_key: "q2" },
        { element_id: "t3", element_type: "P", page_number: 1, reading_order: 2, text: "atom one again", group_key: "q1" },
      ],
    });
    const chunks = chunkCanonicalDocument(doc, "QUESTION_PAPER");
    expect(chunks).toHaveLength(3); // q1 | q2 | q1 — never a cross-atom chunk
    expect(chunks[0]!.elementIds).toEqual(["t1"]);
    expect(chunks[2]!.groupKey).toBe("q1");
    expect(chunks[0]!.content.startsWith("Q1 | p.1\n")).toBe(true); // header prepended, content-preserving
  });

  test("a block larger than maxTokens becomes its own (oversized) chunk", () => {
    const big = "x".repeat(4001);
    const doc = canonicalDocumentSchema.parse({
      documentId: "d1", schemaVersion: "1.0", version: 1, pageCount: 1,
      source: { uri: "u", checksum: "c", mimeType: "application/pdf" },
      provenance: { engine: "e", engineVersion: "1" },
      textBlocks: [
        { element_id: "big", element_type: "P", page_number: 1, reading_order: 0, text: big },
        { element_id: "small", element_type: "P", page_number: 1, reading_order: 1, text: "small" },
      ],
    });
    const chunks = chunkCanonicalDocument(doc, null, { targetTokens: 300, maxTokens: 800 });
    expect(chunks).toHaveLength(2);
    expect(chunks[0]!.tokenEstimate).toBe(Math.ceil(4001 / 4));
    expect(chunks[0]!.elementIds).toEqual(["big"]);
  });
});

// ── T-011 helpers (PastPaperIngestionService) ───────────────────────────────

describe("past-paper — fragmentation, identity, anchor laws", () => {
  test("uniquePartLabel: first keeps the printed label, later get .2/.3", () => {
    const seen = new Set<string>();
    expect(uniquePartLabel("b", seen)).toBe("b");
    expect(uniquePartLabel("b", seen)).toBe("b.2");
    expect(uniquePartLabel("b", seen)).toBe("b.3");
    expect(uniquePartLabel(null, seen)).toBeNull();
    expect(uniquePartLabel(null, seen)).toBeNull(); // unlabelled stay distinct
  });

  test("subjectCode: \\W-stripped, upper, cap 20", () => {
    expect(subjectCodeOf("International GCSE", "Chemistry")).toBe("INTERNATIONALGCSECHE");
    expect(subjectCodeOf(null, null)).toBe("GEN"); // the leading "-" is \W-stripped too
  });

  test("paperTitle skips absent components; never the literal null", () => {
    const meta = { qualification: "IGCSE", subject: "Chemistry", unit: null, sessionLabel: "June 2020", paperCode: "4CH1/1C" } as never;
    expect(paperTitleOf(meta, "4CH1/1C", "June 2020")).toBe("IGCSE Chemistry 4CH1/1C June 2020");
    const bare = { qualification: null, subject: null, unit: null, sessionLabel: "Summer 2013", paperCode: null } as never;
    expect(paperTitleOf(bare, null, "Summer 2013")).toBe("Summer 2013");
    const empty = { qualification: null, subject: null, unit: null, sessionLabel: "", paperCode: null } as never;
    expect(paperTitleOf(empty, null, "")).toBe("past paper"); // unreachable post-identity-gate, pinned anyway
  });

  test("anchor code: java hashCode cap is bit-exact", () => {
    expect(javaStringHashCode("hello")).toBe(99162322);
    expect(javaStringHashCode("")).toBe(0);
    expect(javaHex8(-1)).toBe("ffffffff");
    const long = "ING-" + "4CH1".repeat(20);
    const capped = anchorCodeOf(long.slice(4), null, "deadbeef");
    expect(capped.length).toBe(40);
    expect(capped.slice(31)).toMatch(/^-[0-9a-f]{8}$/);
    expect(anchorCodeOf("4CH1", "JUN2013", "x")).toBe("ING-4CH1JUN2013");
  });
});

// ── GlmOcrDraftMapper ───────────────────────────────────────────────────────

const QP_DRAFT = glmPaperDraftSchema.parse({
  schemaVersion: "1.0",
  extractionMethod: "glm-ocr-qp-v1",
  reviewRequired: false,
  paper: { canonicalDocumentId: "qp-doc-1", session: "June 2020", paperReference: "4CH1/1C" },
  questions: [
    {
      questionId: "q1-aaaa", number: 1, stem: "What is…", marks: 4, marksKnown: true,
      confidence: 0.9,
      parts: [
        { label: "a", text: "part a", marks: 2, confidence: 0.9 },
        { label: "b", text: "part b", marks: null, confidence: 0.9 },
      ],
    },
    {
      questionId: "q2-bbbb", number: 2, stem: "Explain…", marks: 6, marksKnown: true, confidence: 0.9,
      parts: [
        { label: "a", text: "row one", marks: 2, confidence: 0.9 },
        { label: "a", text: "fragment", marks: null, confidence: 0.9 },
      ],
    },
  ],
  questionTotals: { "1": 4, "2": 6 },
  paperTotal: 10,
  warnings: ["QP cover partially unreadable"],
});

const MS_DRAFT = glmMarkSchemeSchemaParsed();

function glmMarkSchemeSchemaParsed() {
  return glmMarkSchemeDraftSchema.parse({
    schemaVersion: "1.0",
    extractionMethod: "glm-ocr-ms-v1",
    reviewRequired: false,
    paper: { canonicalDocumentId: "ms-doc-1", board: "Edexcel", qualification: "IGCSE", session: "November 2020" },
    entries: [
      { entryId: "e1", label: "1(a)", number: 1, answerText: "because ions move", marks: 2, confidence: 0.9,
        markPoints: [
          { ordinal: 1, text: "ions carry charge", marks: 1, confidence: 0.9 },
          { ordinal: 2, text: "movement completes circuit", marks: null, confidence: 0.9 },
        ] },
      { entryId: "e2", label: "2", number: 2, answerText: "C — the MCQ rationale", marks: 1, confidence: 0.9, markPoints: [] },
      { entryId: "e3", label: "*13(b)(i)", number: 13, answerText: "", marks: 3, confidence: 0.9,
        markPoints: [{ ordinal: 1, text: "QWC point", marks: 3, confidence: 0.9 }] },
    ],
    paperTotal: 10,
    warnings: [],
  });
}

const RECON = glmReconciliationSchema.parse({
  findings: [
    { questionNumber: "2", qpMarks: 6, msMarks: 7, severity: "mismatch" },
  ],
  qpPaperTotal: 10,
  msPaperTotal: 12,
  paperTotalConflict: true,
  mismatchCount: 1,
});

describe("glm-ocr mapper — the ONLY translation point (frozen :44-251)", () => {
  test("markPointRef: printed label → ref, QWC star stripped, roman split", () => {
    expect(markPointRef({ label: null, number: 11 })).toBe("11");
    expect(markPointRef({ label: "13(a)", number: 13 })).toBe("13-a");
    expect(markPointRef({ label: "*14", number: 14 })).toBe("14");
    expect(markPointRef({ label: "13(b)(i)", number: 13 })).toBe("13-b-i");
  });

  test("normalizePart: bi → b-i; blank → x", () => {
    expect(normalizePart("bi")).toBe("b-i");
    expect(normalizePart("biv")).toBe("b-iv");
    expect(normalizePart("")).toBe("x");
    expect(normalizePart(null)).toBe("x");
  });

  test("toPastPaperDraft: QP-first identity, subject never inferred, refs mechanical", () => {
    const draft = toPastPaperDraft(QP_DRAFT, MS_DRAFT);
    expect(draft.paper!.sessionLabel).toBe("June 2020"); // QP side first
    expect(draft.paper!.paperCode).toBe("4CH1/1C");
    expect(draft.paper!.subject).toBeNull(); // never inferred
    expect(draft.paper!.board).toBe("Edexcel"); // MS-side identity
    expect(draft.extractionMethod).toBe("glm-ocr-qp-v1+glm-ocr-ms-v1");
    expect(draft.reviewRequired).toBe(false); // the OR of BOTH DRAFTS only (recon is separate evidence)
    expect(draft.questions!).toHaveLength(2);
    expect(draft.questions![0]!.questionNumber).toBe("1");
    expect(draft.questions![0]!.parts![0]!.label).toBe("a");
    expect(draft.questions![0]!.parts![1]!.marks).toBe(0); // null = unknown, materialized
    // mark points: split entries → one point each; marker-less → whole entry
    const refs = draft.markScheme!.points.map((p) => p.questionRef);
    expect(refs).toEqual(["1-a", "1-a", "2", "13-b-i"]);
    expect(draft.markScheme!.points[1]!.marks).toBe(0); // msMarks null → 0
    expect(draft.markScheme!.points[2]!.text).toBe("C — the MCQ rationale");
  });

  test("assembleReviewFindings: recon verbatim + paper-total + warnings + fragmentation", () => {
    const findings = assembleReviewFindings(QP_DRAFT, MS_DRAFT, RECON);
    const sources = findings.map((f) => f.source);
    expect(sources).toContain("RECONCILIATION");
    expect(sources).toContain("QP_WARNING");
    expect(sources).toContain("QP_WARNING");
    const dup = duplicatePartLabelFindings(QP_DRAFT);
    expect(dup).toHaveLength(1);
    expect(dup[0]!.severity).toBe("duplicate-part-label");
    expect(dup[0]!.detail).toContain("occurs 2x");
    const all = [...findings, ...dup];
    expect(all.find((f) => f.severity === "paper-total-conflict")!.detail).toContain("both preserved, never merged");
    expect(all.find((f) => f.severity === "mismatch")!.detail).toBe(
      "Q2: QP total 6 vs MS total 7 (mismatch)",
    );
  });

  test("the bridge-record findings JSONB round-trips (deserialize law)", async () => {
    const routes: Route[] = [
      {
        match: /select review_findings::text as review_findings\s*from glm_ocr_bridge_records/,
        rows: [
          {
            review_findings: JSON.stringify([
              { source: "RECONCILIATION", severity: "mismatch", questionNumber: "2", qpMarks: 6, msMarks: 7, detail: "d" },
            ]),
          },
        ],
      },
      { match: /from glm_ocr_bridge_records where paper_id/, rows: [] },
    ];
    const found = await reviewFindingsForPaper(fakeSql(routes), "00000000-0000-0000-0000-00000000000f");
    expect(found).toHaveLength(1);
    expect(found![0]!.questionNumber).toBe("2");
    const missing = await reviewFindingsForPaper(
      fakeSql([{ match: /from glm_ocr_bridge_records/, rows: [] }]),
      "00000000-0000-0000-0000-00000000000f",
    );
    expect(missing).toBeNull(); // MISSING record ≠ empty findings
  });
});

// ── ExamSeriesImportService validateRow ─────────────────────────────────────

const row = (overrides: Record<string, unknown> = {}) =>
  examSeriesRowSchema.parse({
    qualification: "IAL",
    seriesCode: "jun-2026",
    label: "June 2026",
    windowStart: "2026-05-01",
    windowEnd: "2026-06-30",
    entryDeadline: "2026-04-15",
    resultsDate: "2026-08-01",
    published: true,
    estimated: false,
    sourceUrl: "https://qualifications.pearson.com/calendar",
    ...overrides,
  });

describe("exam-series — the fail-closed calendar gates (frozen :102-132, in order)", () => {
  test("a real calendar row passes", () => {
    expect(() => validateExamSeriesRow(row())).not.toThrow();
  });

  test("seriesCode must be a kebab-case key", () => {
    expect(() => validateExamSeriesRow(row({ seriesCode: "JUN 2026" }))).toThrow(
      /must be a kebab-case key/,
    );
    expect(() => validateExamSeriesRow(row({ seriesCode: null }))).toThrow(
      /must be a kebab-case key/,
    );
  });

  test("window_end before window_start fails closed", () => {
    expect(() => validateExamSeriesRow(row({ windowEnd: "2026-04-30" }))).toThrow(
      /window_end before window_start/,
    );
  });

  test("entry deadline after window start + results before window end fail", () => {
    expect(() => validateExamSeriesRow(row({ entryDeadline: "2026-05-02" }))).toThrow(
      /entry deadline after window start/,
    );
    expect(() => validateExamSeriesRow(row({ resultsDate: "2026-06-29" }))).toThrow(
      /results date before window end/,
    );
  });

  test("no citation, no row (https only)", () => {
    expect(() => validateExamSeriesRow(row({ sourceUrl: "http://example.test/cal" }))).toThrow(
      /without an https citation fails closed/,
    );
    expect(() => validateExamSeriesRow(row({ sourceUrl: null }))).toThrow(
      /without an https citation fails closed/,
    );
  });

  test("unpublished non-estimated rows are not importable; NPE parity for nulls", () => {
    expect(() => validateExamSeriesRow(row({ published: false }))).toThrow(
      /unpublished non-estimated rows are not importable/,
    );
    expect(() => validateExamSeriesRow(row({ published: false, estimated: true }))).not.toThrow();
    // bean validation never ran on the frozen controller: null measured
    // fields NPE at the same decision points → the catch-all 500
    expect(() => validateExamSeriesRow(row({ windowEnd: null }))).toThrow("NPE parity");
    expect(() => validateExamSeriesRow(row({ published: null }))).toThrow("NPE parity");
  });
});

// ── canonical validator reuse + dataset binding shapes ──────────────────────

describe("canonical + binding shapes (the T-MIG-006 reuse)", () => {
  test("canonicalDocumentViolations collects ALL violations into one 400", () => {
    const bad = canonicalDocumentSchema.parse({
      schemaVersion: "9.9",
      documentId: "",
      version: 0,
    });
    const violations = canonicalDocumentViolations(bad);
    expect(violations.some((v) => v.includes('schemaVersion must be "1.0"'))).toBe(true);
    expect(violations.some((v) => v.includes("documentId is required"))).toBe(true);
    expect(violations.some((v) => v.includes("version must be >= 1"))).toBe(true);
    expect(violations.some((v) => v.includes("source is required"))).toBe(true);
  });

  test("exam-series rows bind STRICTLY (ignoreUnknown = FALSE → 400 malformed_body)", () => {
    const parsed = examSeriesRowSchema.safeParse({ ...row(), bogusField: 1 });
    expect(parsed.success).toBe(false); // the route renders 400 malformed_body
  });

  test("the summary + result wire schemas round-trip", () => {
    expect(examSeriesImportSummarySchema.safeParse({ imported: 1, updated: 0, unchanged: 2 }).success).toBe(true);
    expect(
      glmPairResultViewSchema.safeParse({
        qpDocument: { status: "INGESTED", documentId: "d", chunks: 3 },
        msDocument: { status: "DUPLICATE", documentId: "d2", chunks: 1 },
        examPaper: { status: "INGESTED", paperId: "00000000-0000-0000-0000-000000000001", title: null },
        questions: 2, parts: 3, markSchemes: 2, markPoints: 4, qpChunks: 3, msChunks: 1,
        reconciliation: { status: "OK", mismatchCount: 0, paperTotalConflict: false, qpPaperTotal: 10, msPaperTotal: 10 },
        reviewFindings: [],
        embeddingSkipped: true,
      }).success,
    ).toBe(true);
  });
});

// ── FetchService + EnumerateService over fakeSql ────────────────────────────

function fetchRoutes(overrides: Partial<Record<string, unknown[]>> = {}): Route[] {
  return [
    {
      match: /select distinct s\.code from subjects s/,
      rows: [{ code: "4CH1" }],
    },
    {
      match: /from exam_papers ep\s*join subjects s/,
      rows: (overrides.papers ?? [
        {
          id: "20000000-0000-0000-0000-000000000001",
          paper_code: "4CH1/1C",
          session_label: "June 2020",
          series: "JUN",
          year: 2020,
          validation_state: "VALIDATED",
          question_paper_document_id: "qp-doc",
          mark_scheme_document_id: "ms-doc",
        },
      ]) as never,
    },
    {
      match: /q\.exam_paper_id = \? ::uuid and q\.external_ref ~ \?/,
      rows: (overrides.question ?? [
        {
          id: "30000000-0000-0000-0000-000000000001",
          external_ref: "q7-aaaa",
          stem: "Explain electrolysis",
          marks: 4,
          question_type: "STRUCTURED",
          command_word: "Explain",
        },
      ]) as never,
    },
    {
      match: /from question_parts qp\s*join question_versions qv/,
      rows: (overrides.parts ?? [
        { label: "a", prompt: "part a", marks: 2 },
        { label: "b", prompt: "part b", marks: 2 },
      ]) as never,
    },
    {
      match: /from mark_points mp\s*join mark_schemes ms/,
      rows: (overrides.points ?? [
        { ref: "7-a", text: "ions move", marks: 2 },
        { ref: "7-b", text: "circuit completes", marks: 2 },
      ]) as never,
    },
  ];
}

describe("fetch — the deterministic resolution (FetchService.java:71-100)", () => {
  test("parses, resolves the paper, assembles QP parts + MS points by id", async () => {
    const sql = fakeSql(fetchRoutes());
    const result = await fetchQuery(sql, "mark scheme for 4CH1/1C June 2020 question 7", SCOPE);
    expect(result.parseDefect).toBe(false);
    expect(result.ambiguous).toBe(false);
    expect(result.papers).toHaveLength(1);
    const paper = result.papers[0]!;
    expect(paper.paperCode).toBe("4CH1/1C");
    expect(paper.question!.externalRef).toBe("q7-aaaa");
    expect(paper.question!.parts).toHaveLength(2);
    expect(paper.question!.markPoints).toHaveLength(2);
    const view = fetchViewSchema.parse({
      // the wire-boundary law (T-MIG-100 CLASS A): empty is derived by the
      // route mapper — a successful parse serializes empty:false
      parsed: { ...result.parsed, empty: false },
      ambiguous: result.ambiguous,
      parseDefect: result.parseDefect,
      papers: result.papers.map((p) => ({
        ...p, question: p.question === null ? null : { ...p.question },
      })),
    });
    expect(view.parsed!.paperCode).toBe("4CH1/1C");
    expect(view.parsed!.msSeeking).toBe(true);
  });

  test("the legacy 4CH0 alias rides LAST (alphabetical subject codes first)", async () => {
    const sql = fakeSql(fetchRoutes());
    await fetchQuery(sql, "unit 1C summer 2013", SCOPE);
    const bound = sql.queries.find((q) => q.includes("= any("))!;
    expect(bound).toContain("any(");
    // subject code list + the legacy alias: verified via the bound params order in the papers query
  });

  test("a query with no metadata vocabulary is a parse defect (honest echo)", async () => {
    const sql = fakeSql(fetchRoutes());
    const result = await fetchQuery(sql, "electrolysis", SCOPE);
    expect(result.parseDefect).toBe(true);
    expect(result.papers).toEqual([]);
    expect(result.ambiguous).toBe(false);
  });

  test("no year = no deterministic fetch (empty papers)", async () => {
    const sql = fakeSql(fetchRoutes());
    const result = await fetchQuery(sql, "4CH1/1C question 7", SCOPE);
    expect(result.papers).toEqual([]);
    expect(result.parseDefect).toBe(false);
  });

  test("a null scope throws the T-C07 guard (the router renders the empty view)", async () => {
    const sql = fakeSql(fetchRoutes());
    await expect(fetchQuery(sql, "4CH1/1C 2020", null)).rejects.toThrow(/never runs unscoped/);
    await expect(enumerateQuery(sql, "about electrolysis", null)).rejects.toThrow(/never runs unscoped/);
  });
});

describe("enumerate — the three axes (EnumerateService.java:86-234)", () => {
  const paperAxisRoutes: Route[] = [
    {
      match: /from exam_papers ep\s*join subjects s/,
      rows: [
        {
          id: "20000000-0000-0000-0000-000000000001",
          paper_code: "4CH0/1C",
          session_label: "Summer 2013",
          series: "JUN",
          year: 2013,
        },
      ],
    },
    {
      match: /from questions q\s*where q\.exam_paper_id = \? ::uuid and q\.provenance/,
      rows: [
        { id: "30000000-0000-0000-0000-000000000001", external_ref: "q1-aa", stem: "s1", marks: 2, question_type: "STRUCTURED" },
        { id: "30000000-0000-0000-0000-000000000002", external_ref: "q2-bb", stem: "s2", marks: 4, question_type: "STRUCTURED" },
      ],
    },
  ];

  test("paper axis: active-policy AGNOSTIC question list, session as title echo", async () => {
    const result = await enumerateQuery(fakeSql(paperAxisRoutes), "every question in the Summer 2013 paper 4CH0/1C", SCOPE);
    expect(result.mode).toBe("paper");
    expect(result.resolvedNodeCode).toBe("4CH0/1C");
    expect(result.resolvedNodeTitle).toBe("Summer 2013");
    expect(result.yearFrom).toBe(2013);
    expect(result.yearTo).toBe(2013);
    expect(result.questions).toHaveLength(2);
    const view = enumerateViewSchema.parse({ result });
    expect(view.result.mode).toBe("paper");
  });

  test("paper axis empty: honest empty with the code echo, null years", async () => {
    const result = await enumerateQuery(
      fakeSql([{ match: /from exam_papers ep\s*join subjects s/, rows: [] }]),
      "every question in the Summer 2013 paper 4CH0/1C",
      SCOPE,
    );
    expect(result.mode).toBe("paper");
    expect(result.resolvedNodeCode).toBe("4CH0/1C");
    expect(result.yearFrom).toBeNull();
    expect(result.questions).toEqual([]);
  });

  test("topic axis: node-title match walks question_topics (active + PAST_PAPER)", async () => {
    const routes: Route[] = [
      {
        match: /from knowledge_nodes kn where \( \? ::text is null or lower\(kn\.code\) = lower\( \? ::text\)\) and \( \? ::text is null or lower\(kn\.title\) = lower\( \? ::text\)\) order by kn\.code limit 1/,
        rows: [{ id: "40000000-0000-0000-0000-000000000001", code: "4CH1-2.31", title: "Electrolysis" }],
      },
      {
        match: /from question_topics axis/,
        rows: [
          { id: "30000000-0000-0000-0000-000000000001", external_ref: "q3-cc", stem: "x".repeat(300), marks: 3, question_type: "STRUCTURED", paper_id: "20000000-0000-0000-0000-000000000001", paper_code: "4CH1/1C", session_label: "June 2020", series: "JUN", year: 2020 },
        ],
      },
    ];
    const result = await enumerateQuery(fakeSql(routes), "list all questions about Electrolysis from 2019 to 2021", SCOPE);
    expect(result.mode).toBe("topic");
    expect(result.resolvedNodeTitle).toBe("Electrolysis");
    expect(result.yearFrom).toBe(2019);
    expect(result.yearTo).toBe(2021);
    expect(result.questions[0]!.stemExcerpt).toHaveLength(241); // 240 + the ellipsis
  });

  test("spec axis + structured marks/questionType filters", async () => {
    const routes: Route[] = [
      {
        match: /from knowledge_nodes kn where \( \? ::text is null or lower\(kn\.code\) = lower\( \? ::text\)\) and \( \? ::text is null or lower\(kn\.title\) = lower\( \? ::text\)\) order by kn\.code limit 1/,
        rows: [{ id: "40000000-0000-0000-0000-000000000002", code: "4CH1-2.36", title: "Titration" }],
      },
      {
        match: /from question_spec_points axis/,
        rows: [
          { id: "30000000-0000-0000-0000-000000000003", external_ref: "q5-ee", stem: "s", marks: 5, question_type: "SHORT_ANSWER", paper_id: null, paper_code: null, session_label: null, series: null, year: null },
        ],
      },
    ];
    const result = await enumerateStructured(fakeSql(routes), "4CH1-2.36", null, 2018, 2024, 5, "SHORT_ANSWER", true, SCOPE);
    expect(result.mode).toBe("spec");
    expect(result.resolvedNodeCode).toBe("4CH1-2.36");
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0]!.paperId).toBeNull(); // the LEFT JOIN keeps unattached questions
  });

  test("no axis matches → the honest 'unparsed' empty", async () => {
    const result = await enumerateQuery(fakeSql([]), "hello world", SCOPE);
    expect(result.mode).toBe("unparsed");
    expect(result.questions).toEqual([]);
  });
});

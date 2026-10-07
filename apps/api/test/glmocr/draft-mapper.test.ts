/**
 * GlmOcrDraftMapper unit tests (T-MIG-089) — the deterministic translation
 * points pinned against the frozen GlmOcrDraftMapper.java @ 6cad6ef:
 *   - BRIDGE_METHOD (:46) — the extraction-method identity (pinned on the
 *     wire by golden teacher-content-paper-review-realdata-200's
 *     "glm-ocr-qp-v1+glm-ocr-ms-v1")
 *   - markPointRef (:223-234) / normalizePart (:237-246) — the MS label →
 *     T-011 ref re-formatting ("11", "13(a)", "13(b)(i)", "*14", "bi")
 *   - toPastPaperDraft (:56-141) — paper identity from the MS side, session
 *     /paperReference from the QP side FIRST, subject never inferred,
 *     unknown marks → 0 (unknown), empty answer cells → one whole-entry
 *     point, pageNumber 1 (single-page Markdown exports)
 *   - assembleReviewFindings (:149-181) + duplicatePartLabelFindings
 *     (:191-217) — reconciliation findings verbatim, the paper-total
 *     conflict, QP/MS warnings, the fragmentation finding (exact detail
 *     strings)
 */
import { describe, expect, test } from "bun:test";
import {
  assembleReviewFindings,
  BRIDGE_METHOD,
  duplicatePartLabelFindings,
  markPointRef,
  normalizePart,
  toPastPaperDraft,
} from "../../src/services/glmocr/draft-mapper";
import {
  glmOcrMarkSchemeDraftSchema,
  glmOcrPaperDraftSchema,
  glmOcrReconciliationSchema,
  type GlmOcrMarkSchemeDraft,
  type GlmOcrPaperDraft,
} from "@syllabai/contracts";

const qpPaper = glmOcrPaperDraftSchema.parse({
  reviewRequired: true,
  paper: { session: "October 2025", paperReference: "4PH0/1P", canonicalDocumentId: "qp-doc-id" },
  questions: [
    {
      questionId: "q-1",
      number: 1,
      stem: "State the unit of charge.",
      marks: 4,
      parts: [{ label: "a", text: "define potential difference", marks: 2, confidence: 0.6 }],
      confidence: 0.7,
    },
    {
      questionId: "q-2",
      number: 2,
      stem: null,
      marks: 3,
      parts: [
        { label: "b", text: null, marks: null, confidence: 0.5 },
        { label: "b", text: "continuation row", marks: null, confidence: 0.5 },
      ],
      confidence: 0.5,
    },
  ],
  warnings: ["Q18: part marks sum (2) conflicts with printed total (8)"],
});

const msPaper = (overrides: Record<string, unknown> = {}): GlmOcrMarkSchemeDraft =>
  glmOcrMarkSchemeDraftSchema.parse({
    paper: {
      board: "Pearson Edexcel",
      qualification: "International GCSE",
      paperReference: "4PH0/1P",
      session: "June 2020",
      canonicalDocumentId: "ms-doc-id",
    },
    entries: [
      {
        label: "1(a)",
        number: 1,
        answerText: "accept any two from:",
        marks: null,
        markPoints: [
          { ordinal: 1, text: "coulomb", marks: 1, confidence: 0.9 },
          { ordinal: 2, text: "volt per ampere", marks: 1, confidence: 0.9 },
        ],
        confidence: 0.9,
      },
      {
        label: "2",
        number: 2,
        answerText: "C is the only correct answer",
        marks: 1,
        markPoints: [],
        confidence: 0.8,
      },
    ],
    figureRefs: null, // pre-figureRefs engine — the distinction is review-visible
    warnings: ["ms warning"],
    ...overrides,
  });

const reconciliation = glmOcrReconciliationSchema.parse({
  findings: [{ questionNumber: "18", qpMarks: 8, msMarks: 2, severity: "mismatch" }],
  qpPaperTotal: 80,
  msPaperTotal: 80,
  paperTotalConflict: false,
  mismatchCount: 1,
});

describe("BRIDGE_METHOD", () => {
  test("is the frozen bridge identity (paper-review capture)", () => {
    expect(BRIDGE_METHOD).toBe("glm-ocr-qp-v1+glm-ocr-ms-v1");
  });
});

describe("markPointRef / normalizePart", () => {
  test("question-level label stays whole", () => {
    expect(markPointRef({ label: "11", number: 11 })).toBe("11");
  });
  test("letter part → number-letter", () => {
    expect(markPointRef({ label: "13(a)", number: 13 })).toBe("13-a");
  });
  test("letter+roman part → number-letter-roman (the QP convention)", () => {
    expect(markPointRef({ label: "13(b)(i)", number: 13 })).toBe("13-b-i");
  });
  test("QWC asterisk stripped", () => {
    expect(markPointRef({ label: "*14", number: 14 })).toBe("14");
  });
  test("missing label falls back to the entry number", () => {
    expect(markPointRef({ label: null, number: 7 })).toBe("7");
  });
  test("blank part normalizes to x", () => {
    expect(normalizePart("")).toBe("x");
    expect(normalizePart(null)).toBe("x");
  });
  test("letter-then-roman splits; other shapes pass through", () => {
    expect(normalizePart("bi")).toBe("b-i");
    expect(normalizePart("bii")).toBe("b-ii");
    expect(normalizePart("a")).toBe("a");
    expect(normalizePart("z9")).toBe("z9");
  });
});

describe("toPastPaperDraft", () => {
  const draft = toPastPaperDraft(qpPaper, msPaper());

  test("paper identity: MS carries board/qualification, QP wins session/paperReference", () => {
    const paper = draft.paper!; // toPastPaperDraft always builds the T-011 paper
    expect(paper.board).toBe("Pearson Edexcel");
    expect(paper.qualification).toBe("International GCSE");
    expect(paper.sessionLabel).toBe("October 2025"); // QP side FIRST
    expect(paper.paperCode).toBe("4PH0/1P"); // QP side FIRST
    expect(paper.subject).toBeNull(); // never inferred
    expect(paper.unit).toBeNull(); // not extracted
    expect(paper.questionPaperDocumentId).toBe("qp-doc-id");
    expect(paper.markSchemeDocumentId).toBe("ms-doc-id");
  });

  test("session falls back to the MS side only when the QP cover is lost", () => {
    const qpNoSession = glmOcrPaperDraftSchema.parse({
      paper: { canonicalDocumentId: "qp-doc-id" },
      questions: [],
    });
    const d = toPastPaperDraft(qpNoSession, msPaper());
    expect(d.paper!.sessionLabel).toBe("June 2020"); // the 4CH1 November-2021 fallback
  });

  test("T-011 draft identity + single-page + reviewRequired OR", () => {
    const questions = draft.questions!; // the mapper always materializes the list
    expect(draft.schemaVersion).toBe("1.0");
    expect(draft.extractionMethod).toBe(BRIDGE_METHOD);
    expect(draft.reviewRequired).toBe(true);
    expect(questions[0]!.pageNumber).toBe(1);
    expect(questions[0]!.commandWord).toBeNull(); // not guessed
  });

  test("unknown part marks materialize as 0 (unknown), never a guess", () => {
    expect(draft.questions![1]!.parts![0]!.marks).toBe(0);
  });

  test("MS entries split into one point per (N) marker; empty cells → one whole-entry point", () => {
    const scheme = draft.markScheme!; // the mapper always builds the T-011 scheme
    expect(scheme.version).toBe("1");
    expect(scheme.points).toHaveLength(3);
    expect(scheme.points[0]).toMatchObject({
      questionRef: "1-a",
      order: 0,
      text: "coulomb",
      marks: 1,
    });
    expect(scheme.points[2]).toMatchObject({
      questionRef: "2",
      order: 0,
      text: "C is the only correct answer",
      marks: 1,
    });
  });
});

describe("assembleReviewFindings", () => {
  test("reconciliation finding: source/severity verbatim + the assembled detail line", () => {
    const findings = assembleReviewFindings(qpPaper, msPaper(), reconciliation);
    const first = findings[0]!;
    expect(first.source).toBe("RECONCILIATION");
    expect(first.severity).toBe("mismatch");
    expect(first.questionNumber).toBe("18");
    expect(first.qpMarks).toBe(8);
    expect(first.msMarks).toBe(2);
    expect(first.detail).toBe("Q18: QP total 8 vs MS total 2 (mismatch)");
  });

  test("paper-total conflict appends the evidence-first line with both totals", () => {
    const rec = glmOcrReconciliationSchema.parse({
      findings: [],
      qpPaperTotal: 80,
      msPaperTotal: 120,
      paperTotalConflict: true,
      mismatchCount: 0,
    });
    // a clean QP/MS pair (no warnings, no fragmentation, not review-required)
    const cleanQp = glmOcrPaperDraftSchema.parse({ questions: [] });
    const cleanMs = glmOcrMarkSchemeDraftSchema.parse({ entries: [] });
    const findings = assembleReviewFindings(cleanQp, cleanMs, rec);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toEqual({
      source: "RECONCILIATION",
      severity: "paper-total-conflict",
      questionNumber: null,
      qpMarks: 80,
      msMarks: 120,
      detail: "QP paper total 80 vs MS paper total 120 — both preserved, never merged (evidence-first)",
    });
  });

  test("QP + MS warnings relay verbatim; null question numbers render Q?", () => {
    const rec = glmOcrReconciliationSchema.parse({
      findings: [{ questionNumber: null, qpMarks: null, msMarks: null, severity: "gap" }],
      mismatchCount: 0,
    });
    const findings = assembleReviewFindings(qpPaper, msPaper(), rec);
    expect(findings[0]!.detail).toBe("Q?: QP total unknown vs MS total unknown (gap)");
    const qpWarn = findings.find((f) => f.source === "QP_WARNING")!;
    expect(qpWarn.detail).toBe("Q18: part marks sum (2) conflicts with printed total (8)");
    expect(qpWarn.severity).toBe("warning");
    const msWarn = findings.find((f) => f.source === "MS_WARNING")!;
    expect(msWarn.detail).toBe("ms warning");
  });

  test("duplicate part labels → the fragmentation finding (later rows relabelled)", () => {
    const findings = duplicatePartLabelFindings(qpPaper);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.source).toBe("QP_WARNING");
    expect(findings[0]!.severity).toBe("duplicate-part-label");
    expect(findings[0]!.questionNumber).toBe("2");
    expect(findings[0]!.detail).toBe(
      "Q2: part label 'b' occurs 2x (parser fragmentation) — later rows relabelled 'b.2', '.3' … for review; merge or reject",
    );
  });

  test("clean pair: zero findings is a legitimate empty list", () => {
    const cleanQp = glmOcrPaperDraftSchema.parse({ questions: [] });
    const cleanMs = glmOcrMarkSchemeDraftSchema.parse({ entries: [] });
    const cleanRec = glmOcrReconciliationSchema.parse({ findings: [], mismatchCount: 0 });
    expect(assembleReviewFindings(cleanQp, cleanMs, cleanRec)).toEqual([]);
  });
});

// silence the unused-type lint if the fixture type import moves
export type { GlmOcrPaperDraft };

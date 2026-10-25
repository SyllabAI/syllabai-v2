/**
 * ADR-040 §5.3 — the converter LEVELS mode end-to-end pins:
 *   mapper  (glm-ocr.ts toPastPaperDraft): band entries map VERBATIM, never
 *           fall through to the whole-entry point, refuse unmaterializable
 *           rows loudly;
 *   store   (past-paper.ts ingestPastPaperDraft): a bands-only question
 *           births a scheme_kind='LEVELS' scheme + verbatim mark_bands rows
 *           (SUGGESTED, exactly as the point mode births schemes), a
 *           both-kinds question refuses loudly, and the legacy point path
 *           is BYTE-IDENTICAL (the mark_schemes insert carries no
 *           scheme_kind param — the column default rides, guardrail §3.7).
 *
 * Harness: the captureSql pattern (past-paper-hygiene.test.ts) — every
 * SELECT resolves empty (fresh-ingest posture), inserts ride through with
 * their params captured per statement kind.
 */
import { describe, expect, test } from "bun:test";
import type { SqlFn } from "../../src/services/tutor/sql";
import { ingestPastPaperDraft } from "../../src/services/ingestion/past-paper";
import { toPastPaperDraft } from "../../src/services/ingestion/glm-ocr";
import type {
  GlmMarkSchemeDraft,
  GlmPaperDraft,
  PastPaperDraft,
} from "@syllabai/contracts";

type Row = Record<string, unknown>;

function captureSql() {
  // captured STATEMENTS: { text, params } per statement kind — the kind
  // discriminator ('LEVELS' vs the bare legacy column list) rides the TEXT
  // (SQL literals are not bound params), the verbatim band values ride the
  // params.
  const captured: Record<string, Array<{ text: string; params: unknown[] }>> = {
    "insert into mark_schemes": [],
    "insert into mark_bands": [],
    "insert into mark_points": [],
  };
  const fn = (async (strings: TemplateStringsArray, ...params: unknown[]) => {
    const text = strings
      .join("?")
      .replace(/\s+/g, " ")
      .trim();
    for (const key of Object.keys(captured)) {
      if (text.includes(key)) {
        captured[key]!.push({ text, params });
        break;
      }
    }
    // every SELECT resolves empty (fresh-ingest posture); inserts ride through
    return [];
  }) as unknown as SqlFn;
  return { sql: fn, captured };
}

// ── fixtures ────────────────────────────────────────────────────────────────

const qpDraft = (): GlmPaperDraft => ({
  schemaVersion: "1.0",
  extractionMethod: "glm-ocr-qp-v1",
  reviewRequired: false,
  paper: {
    board: "Cambridge International",
    qualification: "IGCSE",
    subject: "Economics",
    paperReference: "0455/22",
    logNumber: null,
    publicationCode: null,
    session: "June 2025",
    examDate: null,
    duration: null,
    canonicalDocumentId: "doc-qp-1",
  },
  questions: [
    {
      questionId: "q7",
      number: 7,
      numberingStyle: null,
      section: null,
      stem: "Discuss whether a government should impose a minimum price.",
      mcq: false,
      options: [],
      parts: [
        { partId: "p7a", label: "a", text: "Define minimum price.", marks: 2, qwc: false, figures: [], answerPrompts: [], confidence: 0.9 },
        { partId: "p7b", label: "b", text: "Discuss whether a government should impose a minimum price.", marks: 6, qwc: true, figures: [], answerPrompts: [], confidence: 0.9 },
      ],
      figures: [],
      tableElementIds: [],
      marks: 8,
      marksKnown: true,
      qwc: false,
      answerPrompts: [],
      confidence: 0.9,
    },
  ],
  questionTotals: { "7": 8 },
  paperTotal: 8,
  sectionTotals: {},
  frontMatterFigures: [],
  warnings: [],
});

const msDraft = (): GlmMarkSchemeDraft => ({
  schemaVersion: "1.0",
  extractionMethod: "glm-ocr-ms-v1",
  reviewRequired: false,
  paper: {
    board: "Cambridge International",
    qualification: "IGCSE",
    subject: "Economics",
    paperReference: "0455/22",
    logNumber: null,
    publicationCode: null,
    session: "June 2025",
    examDate: null,
    duration: null,
    canonicalDocumentId: "doc-ms-1",
  },
  entries: [
    {
      entryId: "e7a",
      label: "7(a)",
      number: 7,
      qwc: false,
      mcq: false,
      correctOption: null,
      answerText: "A minimum price is a legal price floor.",
      markPoints: [],
      guidance: [],
      marks: 2,
      marksCellSource: null,
      confidence: 0.9,
      bands: [],
    },
    {
      entryId: "e7b",
      label: "7(b)",
      number: 7,
      qwc: true,
      mcq: false,
      correctOption: null,
      answerText: null,
      markPoints: [],
      guidance: [],
      marks: 6,
      marksCellSource: null,
      confidence: 0.85,
      bands: [
        { level: 1, marksMin: 0, marksMax: 2, descriptor: "Level 1 (0-2): Isolated comments.", guidance: null },
        { level: 2, marksMin: 3, marksMax: 4, descriptor: "Level 2 (3-4): Accurate analysis.", guidance: "Accept accurate supply/diagram-based reasoning." },
        { level: 3, marksMin: 5, marksMax: 6, descriptor: "Level 3 (5-6): Balanced evaluation.", guidance: null },
      ],
    },
  ],
  questionTotals: { "7": 8 },
  paperTotal: 8,
  icTable: null,
  figureRefs: null,
  warnings: [],
});

// ── the mapper (toPastPaperDraft) ───────────────────────────────────────────

describe("ADR-040 §5.3 mapper — band entries map VERBATIM", () => {
  test("a levels entry becomes draft bands verbatim and NEVER the whole-entry point", () => {
    const draft = toPastPaperDraft(qpDraft(), msDraft());
    expect(draft.markScheme).not.toBeNull();
    const bands = draft.markScheme!.bands;
    expect(bands).toHaveLength(3);
    expect(bands.every((b) => b.questionRef === "7-b")).toBe(true);
    // verbatim: descriptor/guidance pass through untouched — never trimmed, never paraphrased
    expect(bands[0]).toMatchObject({
      questionRef: "7-b",
      levelIndex: 1,
      marksMin: 0,
      marksMax: 2,
      descriptor: "Level 1 (0-2): Isolated comments.",
      guidance: null,
      confidence: 0.85,
    });
    expect(bands[1]!.descriptor).toBe("Level 2 (3-4): Accurate analysis.");
    expect(bands[1]!.guidance).toBe("Accept accurate supply/diagram-based reasoning.");
    // the point stream is untouched by the levels entry (the 7(a) point row only)
    expect(draft.markScheme!.points).toHaveLength(1);
    expect(draft.markScheme!.points[0]!.questionRef).toBe("7-a");
  });

  test("a levels row with an unknown level or range refuses loudly (never a guess)", () => {
    const broken = msDraft();
    broken.entries[1]!.bands[1] = { level: null, marksMin: 3, marksMax: 4, descriptor: "d", guidance: null };
    expect(() => toPastPaperDraft(qpDraft(), broken)).toThrow(
      /carries a level band with an unknown level or mark range \(level=null, marks 3-4\)/,
    );
    const broken2 = msDraft();
    broken2.entries[1]!.bands[1] = { level: 2, marksMin: null, marksMax: 4, descriptor: "d", guidance: null };
    expect(() => toPastPaperDraft(qpDraft(), broken2)).toThrow(
      /marks \?-4\) — bands materialize only with the printed ordinal and printed range/,
    );
  });

  test("a levels row with no descriptor refuses loudly (bands materialize verbatim only)", () => {
    const broken = msDraft();
    broken.entries[1]!.bands[0] = { level: 1, marksMin: 0, marksMax: 2, descriptor: null, guidance: null };
    expect(() => toPastPaperDraft(qpDraft(), broken)).toThrow(
      /level 1 carries no descriptor — bands materialize verbatim only/,
    );
  });
});

// ── the store (ingestPastPaperDraft) ────────────────────────────────────────

/** A PURE bands-only question (7 carries ONLY the levels table — no point rows). */
const bandsOnlyDraft = (): PastPaperDraft => {
  const draft = toPastPaperDraft(qpDraft(), msDraft());
  draft.markScheme!.points = []; // drop 7(a)'s whole-entry point — question 7 is levels-only
  return draft;
};

/**
 * The REAL mixed-question shape (part a point-marked + part b levels-marked
 * in ONE question) — exactly what the kind guard refuses: the scheme (one
 * per question version) has no honest kind. The band-wave corpora must
 * split such questions (a receipt finding if the real 0455/4GE1/4BS1/9609
 * papers print them this way — never a silent guess).
 */
const mixedQuestionDraft = (): PastPaperDraft => toPastPaperDraft(qpDraft(), msDraft());

describe("ADR-040 §5.3 store — LEVELS schemes birth SUGGESTED with verbatim bands", () => {
  test("a bands-only question births scheme_kind='LEVELS' + verbatim mark_bands, no mark_points", async () => {
    const { sql, captured } = captureSql();
    const summary = await ingestPastPaperDraft(sql, bandsOnlyDraft(), null);
    // ONE scheme (question 7 carries the bands via its 7-b ref)
    expect(captured["insert into mark_schemes"]).toHaveLength(1);
    const schemeInsert = captured["insert into mark_schemes"]![0]!;
    // the LEVELS discriminator rides the TEXT: the column list names
    // scheme_kind and the values row carries the 'LEVELS' literal
    expect(schemeInsert.text).toContain("scheme_kind");
    expect(schemeInsert.text).toContain("'LEVELS'");
    // three verbatim band rows; descriptor/guidance ride untouched
    expect(captured["insert into mark_bands"]).toHaveLength(3);
    const first = captured["insert into mark_bands"]![0]!.params;
    // params: [0] id, [1] scheme_id, [2] level_index, [3] marks_min, [4] marks_max,
    // [5] descriptor_md, [6] guidance_md, [7] extraction_confidence, [8] created_at
    expect(first[2]).toBe(1);
    expect(first[3]).toBe(0);
    expect(first[4]).toBe(2);
    expect(first[5]).toBe("Level 1 (0-2): Isolated comments.");
    expect(first[6]).toBeNull();
    const second = captured["insert into mark_bands"]![1]!.params;
    expect(second[6]).toBe("Accept accurate supply/diagram-based reasoning.");
    expect(second[7]).toBe(0.85);
    // the point stream carries NO rows for the levels question
    expect(captured["insert into mark_points"]).toHaveLength(0);
    expect(summary.markPoints).toBe(0);
    expect(summary.markBands).toBe(3);
  });

  test("a question carrying BOTH kinds (point part + levels part, the real mixed shape) refuses loudly — ADR-040 §2.2", async () => {
    const { sql, captured } = captureSql();
    expect(ingestPastPaperDraft(sql, mixedQuestionDraft(), null)).rejects.toThrow(
      "question 7 carries both mark points (1) and level bands (3) — the marking kind is per-scheme (ADR-040 §2.2); split the question or correct the draft",
    );
    // the whole-draft transaction rolls back — no scheme rows captured
    expect(captured["insert into mark_schemes"]).toHaveLength(0);
  });

  test("the legacy point path is BYTE-IDENTICAL: no scheme_kind param (the column default rides)", async () => {
    const legacy = mixedQuestionDraft();
    legacy.markScheme!.bands = []; // the same paper, all-point (pre-ADR-040 shape)
    const { sql, captured } = captureSql();
    const summary = await ingestPastPaperDraft(sql, legacy, null);
    expect(captured["insert into mark_schemes"]).toHaveLength(1);
    const legacyInsert = captured["insert into mark_schemes"]![0]!;
    // BYTE-IDENTICAL legacy law: the column list carries NO scheme_kind and
    // the values row carries NO 'LEVELS' literal (the column default rides)
    expect(legacyInsert.text).not.toContain("scheme_kind");
    expect(legacyInsert.text).not.toContain("'LEVELS'");
    expect(legacyInsert.params).toHaveLength(7);
    expect(summary.markBands).toBe(0);
    expect(captured["insert into mark_bands"]).toHaveLength(0);
  });

  test("a draft with no mark scheme still ingests its questions (summary.markBands = 0)", async () => {
    const { sql, captured } = captureSql();
    const draft = bandsOnlyDraft();
    draft.markScheme = null;
    const summary = await ingestPastPaperDraft(sql, draft, null);
    expect(captured["insert into mark_schemes"]).toHaveLength(0);
    expect(summary.markBands).toBe(0);
    expect(summary.questions).toBe(1);
  });

  test("a bands ref that matches no question rides through silently (the points posture mirrored)", async () => {
    const { sql, captured } = captureSql();
    const draft = bandsOnlyDraft();
    for (const b of draft.markScheme!.bands) b.questionRef = "99-b";
    const summary = await ingestPastPaperDraft(sql, draft, null);
    expect(captured["insert into mark_bands"]).toHaveLength(0);
    expect(summary.markBands).toBe(0);
  });
});

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
  // ruling A (trace 1a1776dff15bb991): part-granular grids bind the part —
  // the part lookup resolves by the draft's printed labels (paren-less).
  const PART_A_ID = "60000000-0000-4000-8000-00000000000a";
  const PART_B_ID = "60000000-0000-4000-8000-00000000000b";
  const fn = (async (strings: TemplateStringsArray, ...params: unknown[]) => {
    const text = strings
      .join("?")
      .replace(/\s+/g, " ")
      .trim();
    if (text.startsWith("select id from question_parts")) {
      const label = params[1];
      if (label === "a") return [{ id: PART_A_ID }];
      if (label === "b") return [{ id: PART_B_ID }];
      return [];
    }
    for (const key of Object.keys(captured)) {
      if (text.includes(key)) {
        captured[key]!.push({ text, params });
        break;
      }
    }
    // every other SELECT resolves empty (fresh-ingest posture); inserts ride through
    return [];
  }) as unknown as SqlFn;
  return { sql: fn, captured, PART_A_ID, PART_B_ID };
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
        { level: 1, marksMin: 0, marksMax: 2, descriptor: "Level 1 (0-2): Isolated comments.", guidance: null, axis: null },
        { level: 2, marksMin: 3, marksMax: 4, descriptor: "Level 2 (3-4): Accurate analysis.", guidance: "Accept accurate supply/diagram-based reasoning.", axis: null },
        { level: 3, marksMin: 5, marksMax: 6, descriptor: "Level 3 (5-6): Balanced evaluation.", guidance: null, axis: null },
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
    broken.entries[1]!.bands[1] = { level: null, marksMin: 3, marksMax: 4, descriptor: "d", guidance: null, axis: null };
    expect(() => toPastPaperDraft(qpDraft(), broken)).toThrow(
      /carries a level band with an unknown level or mark range \(level=null, marks 3-4\)/,
    );
    const broken2 = msDraft();
    broken2.entries[1]!.bands[1] = { level: 2, marksMin: null, marksMax: 4, descriptor: "d", guidance: null, axis: null };
    expect(() => toPastPaperDraft(qpDraft(), broken2)).toThrow(
      /marks \?-4\) — bands materialize only with the printed ordinal and printed range/,
    );
  });

  test("a levels row with no descriptor refuses loudly (bands materialize verbatim only)", () => {
    const broken = msDraft();
    broken.entries[1]!.bands[0] = { level: 1, marksMin: 0, marksMax: 2, descriptor: null, guidance: null, axis: null };
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
 * in ONE question) — the exact shape that motivated ruling A (trace
 * 1a1776dff15bb991, receipt adr040-bandshape-fit-r0): the wave-1 printed
 * tables are PART-granular (437/437 staged grids), so the kind guard moved
 * to the printed grid's own ref and BOTH schemes birth — the point scheme
 * for the version, a part-bound LEVELS scheme for the grid's part.
 */
const mixedQuestionDraft = (): PastPaperDraft => toPastPaperDraft(qpDraft(), msDraft());

describe("ADR-040 §5.3 store — LEVELS schemes birth SUGGESTED with verbatim bands", () => {
  test("a bands-only question births ONE part-bound LEVELS scheme + verbatim mark_bands, no mark_points (ruling A)", async () => {
    const { sql, captured, PART_B_ID } = captureSql();
    const summary = await ingestPastPaperDraft(sql, bandsOnlyDraft(), null);
    // ONE scheme — the printed grid is its own binding unit (ref 7-b)
    expect(captured["insert into mark_schemes"]).toHaveLength(1);
    const schemeInsert = captured["insert into mark_schemes"]![0]!;
    // the LEVELS discriminator + the part binding ride the TEXT: the column
    // list names scheme_kind AND question_part_id, the values row carries
    // the 'LEVELS' literal and the bound part id
    expect(schemeInsert.text).toContain("scheme_kind");
    expect(schemeInsert.text).toContain("'LEVELS'");
    expect(schemeInsert.text).toContain("question_part_id");
    // params: [0] id, [1] version, [2] version_label(=ref), [3] source_doc,
    // [4] method, [5] created_at, [6] guidance, [7] part id ('SUGGESTED'/'LEVELS'
    // ride the TEXT as literals, not binds)
    expect(schemeInsert.params[7]).toBe(PART_B_ID);
    expect(schemeInsert.params[2]).toBe("7-b");
    // three verbatim band rows; descriptor/guidance ride untouched
    expect(captured["insert into mark_bands"]).toHaveLength(3);
    const first = captured["insert into mark_bands"]![0]!.params;
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

  test("the REAL mixed shape (7-a points + 7-b levels) births BOTH schemes under ruling A — per-kind, per-binding", async () => {
    const { sql, captured, PART_B_ID } = captureSql();
    const summary = await ingestPastPaperDraft(sql, mixedQuestionDraft(), null);
    // TWO schemes: the version's point scheme (legacy column list) + the
    // part-bound LEVELS scheme for the 7-b grid
    expect(captured["insert into mark_schemes"]).toHaveLength(2);
    const pointScheme = captured["insert into mark_schemes"]![0]!;
    const levelsScheme = captured["insert into mark_schemes"]![1]!;
    expect(pointScheme.text).not.toContain("scheme_kind");
    expect(levelsScheme.text).toContain("'LEVELS'");
    expect(levelsScheme.text).toContain("question_part_id");
    expect(levelsScheme.params[7]).toBe(PART_B_ID);
    // the point row rides the point scheme; the three bands ride the levels scheme
    expect(captured["insert into mark_points"]).toHaveLength(1);
    expect(captured["insert into mark_bands"]).toHaveLength(3);
    expect(summary.markPoints).toBe(1);
    expect(summary.markBands).toBe(3);
  });

  test("both kinds under the SAME printed ref refuses loudly — one binding, two kinds (ruling A kind guard)", async () => {
    const { sql, captured } = captureSql();
    const draft = mixedQuestionDraft();
    draft.markScheme!.points[0]!.questionRef = "7-b"; // the point row lands ON the grid's ref
    expect(ingestPastPaperDraft(sql, draft, null)).rejects.toThrow(
      /mark scheme entry 7-b carries both mark points \(1\) and level bands \(3\) — the marking kind is per-scheme at the printed grid's granularity/,
    );
    expect(captured["insert into mark_schemes"]).toHaveLength(0);
  });

  test("a question-granular grid cannot coexist with the version's point scheme (the unbound shape)", async () => {
    const { sql, captured } = captureSql();
    const draft = mixedQuestionDraft();
    for (const b of draft.markScheme!.bands) b.questionRef = "7"; // question-level grid
    expect(ingestPastPaperDraft(sql, draft, null)).rejects.toThrow(
      /question 7 carries a question-level levels grid and 1 mark points — an unbound LEVELS scheme cannot coexist/,
    );
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

  test("a bands ref that matches no question refuses loudly — printed band law never drops silently (ruling A)", async () => {
    const { sql, captured } = captureSql();
    const draft = bandsOnlyDraft();
    for (const b of draft.markScheme!.bands) b.questionRef = "99-b";
    expect(ingestPastPaperDraft(sql, draft, null)).rejects.toThrow(
      /band grids 99-b match no question in the paper draft/,
    );
    expect(captured["insert into mark_bands"]).toHaveLength(0);
  });

  test("a part-granular grid whose part is absent from the paper draft refuses — bands bind the part they mark, never a guess", async () => {
    const { sql, captured } = captureSql();
    const draft = bandsOnlyDraft();
    for (const b of draft.markScheme!.bands) b.questionRef = "7-z"; // part z exists nowhere
    expect(ingestPastPaperDraft(sql, draft, null)).rejects.toThrow(
      /band grid 7-z targets part "z" but the paper draft carries no such part under question 7/,
    );
    expect(captured["insert into mark_schemes"]).toHaveLength(0);
  });
});

// ── r2 axis extension (9609 corpus, ruling 7 of the r2 mirror) ──────────────

describe("ADR-040 §5.3 store — the r2 axis extension (multi-axis levels grids)", () => {
  /** The CIE 9609 P2 8-mark shape: ONE printed grid, TWO per-axis ladders
   *  (Knowledge 4 + Analysis 4). The converter passes the staged axis keys
   *  through; the birth splits each axis into its own LEVELS scheme on the
   *  SAME part, version_label `ref#aN`. */
  const twoAxisDraft = (): PastPaperDraft => {
    const draft = bandsOnlyDraft();
    draft.markScheme!.bands = [
      { questionRef: "7-b", levelIndex: 1, marksMin: 1, marksMax: 2, descriptor: "K: one point.", guidance: null, axisKey: "a1", confidence: 0.9 },
      { questionRef: "7-b", levelIndex: 2, marksMin: 3, marksMax: 4, descriptor: "K: two points.", guidance: null, axisKey: "a1", confidence: 0.9 },
      { questionRef: "7-b", levelIndex: 1, marksMin: 1, marksMax: 2, descriptor: "A: limited analysis.", guidance: null, axisKey: "a2", confidence: 0.9 },
      { questionRef: "7-b", levelIndex: 2, marksMin: 3, marksMax: 4, descriptor: "A: developed analysis.", guidance: null, axisKey: "a2", confidence: 0.9 },
    ];
    return draft;
  };

  test("a two-axis grid births TWO LEVELS schemes on the SAME part with #axis labels", async () => {
    const { sql, captured, PART_B_ID } = captureSql();
    const summary = await ingestPastPaperDraft(sql, twoAxisDraft(), null);
    expect(captured["insert into mark_schemes"]).toHaveLength(2);
    const labels = captured["insert into mark_schemes"]!.map((s) => s.params[2]).sort();
    expect(labels).toEqual(["7-b#a1", "7-b#a2"]);
    // both schemes bind the SAME printed part (the grid marks ONE part)
    for (const s of captured["insert into mark_schemes"]!) {
      expect(s.params[7]).toBe(PART_B_ID);
      expect(s.text).toContain("'LEVELS'");
    }
    // four verbatim band rows total (two per axis ladder)
    expect(captured["insert into mark_bands"]).toHaveLength(4);
    expect(summary.markBands).toBe(4);
  });

  test("a mixed axisless/axis-keyed ref refuses loudly — ambiguous grid identity", async () => {
    const { sql, captured } = captureSql();
    const draft = twoAxisDraft();
    draft.markScheme!.bands.push({
      questionRef: "7-b", levelIndex: 1, marksMin: 1, marksMax: 4,
      descriptor: "axisless row.", guidance: null, axisKey: null, confidence: 0.9,
    });
    expect(ingestPastPaperDraft(sql, draft, null)).rejects.toThrow(
      /mixes axisless and axis-keyed bands/,
    );
    expect(captured["insert into mark_schemes"]).toHaveLength(0);
  });

  test("the converter maps a staged axis band to the draft axisKey verbatim", () => {
    const ms = msDraft();
    ms.entries = [
      {
        ...ms.entries[1]!,
        label: "7(b)",
        bands: [
          { level: 1, marksMin: 1, marksMax: 2, descriptor: "K: one point.", guidance: null, axis: "a1" },
        ],
      },
    ];
    const draft = toPastPaperDraft(qpDraft(), ms);
    expect(draft.markScheme!.bands).toHaveLength(1);
    expect(draft.markScheme!.bands[0]!.axisKey).toBe("a1");
  });
});

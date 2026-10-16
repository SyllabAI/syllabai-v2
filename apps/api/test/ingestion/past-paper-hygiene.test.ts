/**
 * Parse-time stem-hygiene pins — the v2 deviation at the T-011 write
 * boundary (operator trace 1a14536e97f41425: "we should also update the
 * parser right? so it 'cleans' pdfs after parsing?").
 *
 * The frozen port wrote the OCR draft prompts VERBATIM into questions.stem /
 * question_versions.stem / question_parts.prompt — the measured entry point
 * of the draft bank's extraction furniture (118 rows / 201 hits), math-markup
 * leaks (167 stems) and printed front matter (46 rows) — census trace
 * 1a144b08a0dbcf0d. Post-cutover the SHIPPED hygiene law (run-004 proposal
 * #1, census-cited, content-preserving, FAIL-OPEN) runs at WRITE time: a
 * parsed paper lands clean at birth.
 *
 * Pinned here with the REAL measured junk classes (stem-hygiene.test.ts
 * expectations): the write-side captures must equal the law's output.
 */
import { describe, expect, test } from "bun:test";
import type { SqlFn } from "../../src/services/tutor/sql";
import { ingestPastPaperDraft } from "../../src/services/ingestion/past-paper";
import { hygienicStem } from "../../src/services/tutor/stem-hygiene";
import type { PastPaperDraft } from "@syllabai/contracts";

// ── the capturing fakeSql (insert params recorded per statement kind) ───────

type Row = Record<string, unknown>;

function captureSql() {
  const captured: Record<string, unknown[][]> = {
    "insert into questions": [],
    "insert into question_versions": [],
    "insert into question_parts": [],
  };
  const fn = (async (strings: TemplateStringsArray, ...params: unknown[]) => {
    const text = strings
      .join("?")
      .replace(/\s+/g, " ")
      .trim();
    for (const key of Object.keys(captured)) {
      if (text.includes(key)) {
        captured[key]!.push(params);
        break;
      }
    }
    // every SELECT in the path resolves empty (fresh-ingest posture); the
    // inserts ride through — the service only checks SELECT results for the
    // duplicate guard and the subject/anchor find-or-create lookups
    return [];
  }) as unknown as SqlFn;
  return { sql: fn, captured };
}

// ── the draft fixture: REAL measured junk classes ───────────────────────────

const draft = (): PastPaperDraft => ({
  schemaVersion: "1.0",
  paper: {
    board: "Edexcel",
    qualification: "Level 1/Level 2",
    subject: null,
    unit: null,
    sessionLabel: "June 2026",
    paperCode: "4CH1/1C",
    questionPaperDocumentId: "doc-qp-1",
    markSchemeDocumentId: "doc-ms-1",
  },
  questions: [
    {
      externalRef: "q06-cf68cf74",
      questionNumber: "6",
      // R1 write-in furniture + a real question line (the measured class)
      prompt:
        "The diagram shows the particles in an atom of an element.\nDO NOT WRITE IN THIS AREA\nDO NOT WRITE IN THIS AREA",
      commandWord: null,
      marks: 4,
      questionType: null,
      pageNumber: 1,
      confidence: 0.9,
      parts: [
        {
          label: "a",
          // R3 math-markup leak (the measured class, proposal #5 absorbed)
          prompt: "some of the ethanol in the wine turns to ethanoic acid, $ \\mathrm{C H_{3} C O O H} $",
          commandWord: null,
          marks: 2,
          confidence: 0.9,
        },
        {
          label: "b",
          prompt: "", // an empty part prompt stays empty (fail-open law)
          commandWord: null,
          marks: 2,
          confidence: 0.9,
        },
      ],
    },
  ],
  markScheme: null,
  extractionMethod: "glm-ocr-qp-v1+glm-ocr-ms-v1",
  reviewRequired: false,
});

// ── the pins ────────────────────────────────────────────────────────────────

describe("parse-time stem hygiene (v2 deviation, operator trace 1a14536e97f41425)", () => {
  test("the questions.stem capture is the hygiene law's output — furniture never lands at birth", async () => {
    const { sql, captured } = captureSql();
    const summary = await ingestPastPaperDraft(sql, draft(), null);
    expect(summary.questions).toBe(1);
    expect(summary.parts).toBe(2);
    expect(captured["insert into questions"]).toHaveLength(1);
    // params: [0] id, [1] external_ref, [2] stem ('STRUCTURED' is a literal)
    const stem = captured["insert into questions"]![0]![2];
    expect(stem).toBe("The diagram shows the particles in an atom of an element.");
  });

  test("question_versions.stem carries the SAME cleaned stem (one law, both rows)", async () => {
    const { sql, captured } = captureSql();
    await ingestPastPaperDraft(sql, draft(), null);
    expect(captured["insert into question_versions"]).toHaveLength(1);
    // params: [0] id, [1] question_id, [2] stem (version 1 is a literal)
    const versionStem = captured["insert into question_versions"]![0]![2];
    const questionStem = captured["insert into questions"]![0]![2];
    expect(versionStem).toBe(questionStem);
    expect(versionStem).toBe(hygienicStem(draft().questions![0]!.prompt ?? ""));
  });

  test("part prompts pass the same law: markup unwrapped, empties stay empty", async () => {
    const { sql, captured } = captureSql();
    await ingestPastPaperDraft(sql, draft(), null);
    const prompts = captured["insert into question_parts"]!.map((p) => p[3]); // [0] id, [1] version, [2] label, [3] prompt
    expect(prompts).toEqual([
      "some of the ethanol in the wine turns to ethanoic acid, CH3COOH",
      "",
    ]);
  });

  test("a clean draft passes through unchanged (content-preserving, never mangled)", async () => {
    const clean = draft();
    clean.questions![0]!.prompt = "Which gas is produced at the positive electrode?";
    clean.questions![0]!.parts![0]!.prompt = "Explain your answer.";
    const { sql, captured } = captureSql();
    await ingestPastPaperDraft(sql, clean, null);
    expect(captured["insert into questions"]![0]![2]).toBe(
      "Which gas is produced at the positive electrode?",
    );
    expect(captured["insert into question_parts"]![0]![3]).toBe("Explain your answer.");
  });

  test("a null prompt lands as the empty string (the frozen nullSafe posture, hygiene fail-open)", async () => {
    const nulled = draft();
    nulled.questions![0]!.prompt = null;
    const { sql, captured } = captureSql();
    await ingestPastPaperDraft(sql, nulled, null);
    expect(captured["insert into questions"]![0]![2]).toBe("");
  });
});

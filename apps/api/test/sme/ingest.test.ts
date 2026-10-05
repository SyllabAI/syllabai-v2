/**
 * SME ingest law pins (T-MIG-033 tranche-3) — the ADR-026 replace, the
 * fail-closed validation messages, the -pN/-s family emission and the
 * asset-store law, over a recording fake sql (service internals; the route
 * layer is routes.test.ts's surface). Every pin carries the frozen line
 * reference (SmeQuestionIngestService.java @ 6cad6ef).
 */
import { describe, expect, test } from "bun:test";
import {
  buildSmeModule,
  contentTypeOf,
  emittedRowRefs,
  SOURCE_DOCUMENT_ID,
  SUPPORTED_PACKAGE_VERSION,
  unzipSmePackage,
  validateSmePackage,
  type SmeTxSql,
} from "../../src/services/sme";
import { BadRequestError } from "../../src/services/selfmark";
import type { SmeQuestion } from "@syllabai/contracts";
import { buildZip, bytes, synthUuid } from "./helpers";

// ── the recording fake sql (tagged-template discipline preserved) ───────────

interface Stmt {
  text: string;
  values: unknown[];
}

function fakeSql(opts: { nodeIds?: (code: string) => string | null; deactivate?: number } = {}) {
  const stmts: Stmt[] = [];
  const events: string[] = [];
  const fn = ((strings: TemplateStringsArray, ...params: unknown[]) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    stmts.push({ text, values: params });
    if (text.includes("from knowledge_nodes")) {
      const code = params[0] as string;
      const id = opts.nodeIds ? opts.nodeIds(code) : synthUuid(code);
      return Promise.resolve(id === null ? [] : [{ id }]);
    }
    if (text.startsWith("update questions set active")) {
      return Promise.resolve(Array.from({ length: opts.deactivate ?? 2 }, () => ({ "?column?": 1 })));
    }
    return Promise.resolve([]);
  }) as unknown as SmeTxSql;
  fn.transaction = async <T>(body: (tx: SmeTxSql) => Promise<T>): Promise<T> => {
    events.push("begin");
    try {
      const result = await body(fn as never);
      events.push("commit");
      return result;
    } catch (e) {
      events.push("rollback");
      throw e;
    }
  };
  return { sql: fn, stmts, events };
}

const sqlOf = (s: Stmt) => s.text;
const valuesOf = (s: Stmt) => s.values;

function insertValues(stmts: Stmt[], table: string): unknown[][] {
  return stmts
    .filter((s) => s.text.startsWith(`insert into ${table} `))
    .map(valuesOf);
}

// ── package builders ────────────────────────────────────────────────────────

function mcqQuestion(overrides: Partial<SmeQuestion> = {}): SmeQuestion {
  return {
    externalRef: "B1-Q1",
    questionType: "MCQ_SINGLE",
    stem: "What is 2+2?",
    marks: 2,
    difficulty: 3,
    difficultySource: "SME",
    expectedTimeSeconds: 60,
    commandWord: "State",
    primaryTopicCode: "4CH1-S1-c",
    secondaryTopicCodes: ["4CH1-S1-d", "4CH1-S2-a"],
    options: [
      { label: "A", text: "4", isCorrect: true },
      { label: "B", text: "5", isCorrect: false },
    ],
    ...overrides,
  } as SmeQuestion;
}

function packageBytes(questions: SmeQuestion[], extra: Record<string, unknown> = {}, assets: Array<{ name: string; data: string }> = []): Uint8Array {
  const pkg = {
    packageVersion: "1.0",
    corpusVersion: "corpus-2026-10",
    generatedAt: "2026-10-05T00:00:00Z",
    source: "sme-eq-igcse-maths-a-18-higher",
    counts: {},
    questions,
    ...extra,
  };
  return buildZip([
    { name: "package.json", data: bytes(JSON.stringify(pkg)) },
    ...assets.map((a) => ({ name: `assets/${a.name}`, data: bytes(a.data) })),
  ]);
}

// ── unzip + package binding ────────────────────────────────────────────────

describe("unzipSmePackage — the :590-626 translation", () => {
  test("a valid package parses and collects assets/* entries", () => {
    const zip = buildZip([
      { name: "package.json", data: bytes(JSON.stringify({ packageVersion: "1.0", questions: [] })) },
      { name: "assets/a.png", data: bytes("PNG") },
      { name: "extras/ignore.txt", data: bytes("dropped") }, // not package.json, not assets/
    ]);
    const parsed = unzipSmePackage(zip);
    expect(parsed.pkg?.packageVersion).toBe("1.0");
    expect(parsed.assetBytes.has("a.png")).toBe(true);
    expect(parsed.assetBytes.size).toBe(1);
  });

  test("not a ZIP → the verbatim IOException translation (:613)", () => {
    expect(() => unzipSmePackage(bytes("this is not a zip"))).toThrow(
      new BadRequestError("could not read the corpus package (not a ZIP?)"),
    );
  });

  test("missing package.json → the verbatim message (:616)", () => {
    const zip = buildZip([{ name: "assets/a.png", data: bytes("PNG") }]);
    expect(() => unzipSmePackage(zip)).toThrow(
      new BadRequestError("package.json missing from the corpus package"),
    );
  });

  test("package.json with wrong JSON types → the JsonMappingException class (:620-624)", () => {
    const zip = buildZip([{ name: "package.json", data: bytes(JSON.stringify({ questions: 5 })) }]);
    expect(() => unzipSmePackage(zip)).toThrow(
      new BadRequestError("package.json is not valid sme-question-package JSON"),
    );
  });

  test("package.json literal null binds a null pkg (Jackson readValue('null') parity)", () => {
    const zip = buildZip([{ name: "package.json", data: bytes("null") }]);
    const parsed = unzipSmePackage(zip);
    expect(parsed.pkg).toBeNull();
    // and validate() — NOT the binding failure — answers (:438-440)
    expect(() => validateSmePackage(parsed.pkg, parsed.assetBytes)).toThrow(
      new BadRequestError("package carries no questions"),
    );
  });

  test("unknown JSON properties are ignored (ignoreUnknown parity)", () => {
    const zip = buildZip([
      { name: "package.json", data: bytes(JSON.stringify({ packageVersion: "1.0", questions: [], futureField: { nested: true } })) },
    ]);
    expect(unzipSmePackage(zip).pkg?.packageVersion).toBe("1.0");
  });
});

// ── validate() — the fail-closed laws (:437-559), messages verbatim ────────

describe("validateSmePackage — verbatim 400 messages", () => {
  const P = (questions: SmeQuestion[] | null) => (questions === null ? null : { packageVersion: SUPPORTED_PACKAGE_VERSION, questions, source: "s", corpusVersion: "c" } as never);
  const empty = new Map<string, Uint8Array>();

  test("package carries no questions (:438-440)", () => {
    expect(() => validateSmePackage(P([]), empty)).toThrow(new BadRequestError("package carries no questions"));
    expect(() => validateSmePackage(null, empty)).toThrow(new BadRequestError("package carries no questions"));
  });

  test("unsupported package version (:441-443)", () => {
    expect(() => validateSmePackage({ packageVersion: "2.0", questions: [mcqQuestion()] } as never, empty)).toThrow(
      new BadRequestError("unsupported package version: 2.0"),
    );
  });

  test("bad or duplicate externalRef — null/blank/over-80/duplicate (:447-450)", () => {
    expect(() => validateSmePackage(P([mcqQuestion({ externalRef: null })]), empty)).toThrow(
      new BadRequestError("bad or duplicate externalRef: null"),
    );
    expect(() => validateSmePackage(P([mcqQuestion({ externalRef: "   " })]), empty)).toThrow(
      new BadRequestError("bad or duplicate externalRef:    "),
    );
    expect(() => validateSmePackage(P([mcqQuestion({ externalRef: "x".repeat(81) })]), empty)).toThrow(
      new BadRequestError(`bad or duplicate externalRef: ${"x".repeat(81)}`),
    );
    expect(() => validateSmePackage(P([mcqQuestion(), mcqQuestion()]), empty)).toThrow(
      new BadRequestError("bad or duplicate externalRef: B1-Q1"),
    );
  });

  test("bad marks/difficulty/time — including Jackson primitive defaults (:451-454)", () => {
    expect(() => validateSmePackage(P([mcqQuestion({ marks: 0 })]), empty)).toThrow(
      new BadRequestError("bad marks/difficulty/time on B1-Q1"),
    );
    expect(() => validateSmePackage(P([mcqQuestion({ difficulty: 6 })]), empty)).toThrow(
      new BadRequestError("bad marks/difficulty/time on B1-Q1"),
    );
    expect(() => validateSmePackage(P([mcqQuestion({ expectedTimeSeconds: 0 })]), empty)).toThrow(
      new BadRequestError("bad marks/difficulty/time on B1-Q1"),
    );
    // marks ABSENT binds as Java int 0 → the same law
    const absent = { ...mcqQuestion() } as Record<string, unknown>;
    delete absent.marks;
    expect(() => validateSmePackage(P([absent as SmeQuestion]), empty)).toThrow(
      new BadRequestError("bad marks/difficulty/time on B1-Q1"),
    );
  });

  test("unknown questionType (:457-459)", () => {
    expect(() => validateSmePackage(P([mcqQuestion({ questionType: "SHORT_ANSWER" })]), empty)).toThrow(
      new BadRequestError("unknown questionType on B1-Q1"),
    );
  });

  test("missing primaryTopicCode (:460-462)", () => {
    expect(() => validateSmePackage(P([mcqQuestion({ primaryTopicCode: null })]), empty)).toThrow(
      new BadRequestError("missing primaryTopicCode on B1-Q1"),
    );
  });

  test("MCQ option laws (:463-479)", () => {
    expect(() => validateSmePackage(P([mcqQuestion({ options: [{ label: "A", text: "4", isCorrect: true }] })]), empty)).toThrow(
      new BadRequestError("MCQ needs >=2 options: B1-Q1"),
    );
    expect(() => validateSmePackage(P([mcqQuestion({ options: [{ label: "A", text: "4" }, { label: "B", text: "5" }] })]), empty)).toThrow(
      new BadRequestError("MCQ must have exactly one correct option: B1-Q1"),
    );
    expect(() => validateSmePackage(P([mcqQuestion({ options: [{ label: "A", text: "4", isCorrect: true }, { label: "A", text: "5", isCorrect: false }] })]), empty)).toThrow(
      new BadRequestError("bad/duplicate option label: B1-Q1"),
    );
  });

  test("STRUCTURED parts laws (:480-519)", () => {
    expect(() => validateSmePackage(P([mcqQuestion({ questionType: "STRUCTURED", parts: [] })]), empty)).toThrow(
      new BadRequestError("STRUCTURED needs parts: B1-Q1"),
    );
    const part = (label: string, marks: number, extra: Record<string, unknown> = {}) => ({ label, prompt: "p", marks, ...extra });
    expect(() => validateSmePackage(P([mcqQuestion({ questionType: "STRUCTURED", marks: 5, parts: [part("a", 2), part("b", 2)] })]), empty)).toThrow(
      new BadRequestError("part marks sum != question marks on B1-Q1"),
    );
    expect(() => validateSmePackage(P([mcqQuestion({ questionType: "STRUCTURED", marks: 4, parts: [part("a", 2), part("a", 2)] })]), empty)).toThrow(
      new BadRequestError("bad/duplicate part label: B1-Q1"),
    );
    expect(() => validateSmePackage(P([mcqQuestion({ questionType: "STRUCTURED", marks: 4, parts: [part("a", 2, { options: [{ label: "A", isCorrect: true }] }), part("b", 2)] })]), empty)).toThrow(
      new BadRequestError("option part needs >=2 options: B1-Q1 part a"),
    );
    expect(() => validateSmePackage(P([mcqQuestion({ questionType: "STRUCTURED", marks: 4, parts: [part("a", 2, { options: [{ label: "A" }, { label: "B" }] }), part("b", 2)] })]), empty)).toThrow(
      new BadRequestError("option part must have exactly one correct option: B1-Q1 part a"),
    );
    expect(() => validateSmePackage(P([mcqQuestion({ questionType: "STRUCTURED", marks: 4, parts: [part("a", 2, { options: [{ label: "A", isCorrect: true }, { label: "A" }] }), part("b", 2)] })]), empty)).toThrow(
      new BadRequestError("bad/duplicate option label on B1-Q1 part a"),
    );
  });

  test("bad spec point — blank code or non PRIMARY/SECONDARY role (:521-528)", () => {
    expect(() => validateSmePackage(P([mcqQuestion({ specPoints: [{ code: "   ", role: "PRIMARY" }] })]), empty)).toThrow(
      new BadRequestError("bad spec point on B1-Q1"),
    );
    expect(() => validateSmePackage(P([mcqQuestion({ specPoints: [{ code: "4CH1-S1-c", role: "TERTIARY" }] })]), empty)).toThrow(
      new BadRequestError("bad spec point on B1-Q1"),
    );
  });

  test("referenced asset missing from package (:549-553)", () => {
    expect(() => validateSmePackage(P([mcqQuestion({ stem: "see (assets/missing.png)" })]), empty)).toThrow(
      new BadRequestError("referenced asset missing from package: missing.png"),
    );
  });

  test("unsafe asset filename (:554-558)", () => {
    const assets = new Map([["../evil.png", bytes("x")]]);
    expect(() => validateSmePackage(P([mcqQuestion()]), assets)).toThrow(
      new BadRequestError("unsafe asset filename: ../evil.png"),
    );
  });

  test("derived -pN/-s member refs join the uniqueness set (:537-547)", () => {
    // a LATER question whose BASE ref collides with an earlier question's
    // derived ref hits the first check (:447-450) — same class, same message
    const mixed = mcqQuestion({
      questionType: "STRUCTURED",
      marks: 4,
      parts: [
        { label: "a", prompt: "p", marks: 2, options: [{ label: "A", isCorrect: true }, { label: "B" }] },
        { label: "b", prompt: "p", marks: 2 },
      ],
    });
    expect(() => validateSmePackage(P([mixed, mcqQuestion({ externalRef: "B1-Q1-p1" })]), empty)).toThrow(
      new BadRequestError("bad or duplicate externalRef: B1-Q1-p1"),
    );
    // the :543-546 branch proper: the derived ref of a LATER question
    // collides with an earlier question's base
    expect(() => validateSmePackage(P([mcqQuestion({ externalRef: "B1-Q1-p1" }), mixed]), empty)).toThrow(
      new BadRequestError("duplicate externalRef: B1-Q1-p1"),
    );
  });
});

// ── emittedRowRefs (:321-348) ───────────────────────────────────────────────

describe("emittedRowRefs — the family ref derivation", () => {
  test("MCQ emits only the base ref", () => {
    expect(emittedRowRefs(mcqQuestion())).toEqual(["B1-Q1"]);
  });

  test("pure structured emits only the base ref", () => {
    expect(emittedRowRefs(mcqQuestion({ questionType: "STRUCTURED", marks: 4, parts: [{ label: "a", prompt: "p", marks: 2 }, { label: "b", prompt: "p", marks: 2 }] }))).toEqual(["B1-Q1"]);
  });

  test("mixed emits base + -pK per option part + -s when plain parts exist", () => {
    expect(
      emittedRowRefs(mcqQuestion({
        questionType: "STRUCTURED",
        marks: 6,
        parts: [
          { label: "a", prompt: "p", marks: 2, options: [{ label: "A", isCorrect: true }, { label: "B" }] },
          { label: "b", prompt: "p", marks: 1, options: [{ label: "A", isCorrect: true }, { label: "B" }] },
          { label: "c", prompt: "p", marks: 3 },
        ],
      })),
    ).toEqual(["B1-Q1", "B1-Q1-p1", "B1-Q1-p2", "B1-Q1-s"]);
  });

  test("option parts WITHOUT plain parts emit NO -s row (:343-345)", () => {
    expect(
      emittedRowRefs(mcqQuestion({
        questionType: "STRUCTURED",
        marks: 4,
        parts: [
          { label: "a", prompt: "p", marks: 2, options: [{ label: "A", isCorrect: true }, { label: "B" }] },
          { label: "b", prompt: "p", marks: 2, options: [{ label: "A", isCorrect: true }, { label: "B" }] },
        ],
      })),
    ).toEqual(["B1-Q1", "B1-Q1-p1", "B1-Q1-p2"]);
  });
});

// ── ingest() — the one-transaction replace (:138-299) ───────────────────────

describe("buildSmeModule().ingest — MCQ emission over the fake sql", () => {
  test("insert order + values + summary counts", async () => {
    const fake = fakeSql({ deactivate: 3 });
    const module = buildSmeModule(fake.sql, { newId: () => synthUuid("id"), now: () => new Date(0) });
    const summary = await module.ingest(packageBytes([mcqQuestion({
      options: [{ label: "A", text: "4", isCorrect: true }, { label: "B", text: "5", isCorrect: false }],
      solutionMd: "worked solution",
      specPoints: [
        { code: "4CH1-S1-c", role: "PRIMARY", provenance: "SME" },
        { code: "4CH1-S1-d", role: "SECONDARY" },
      ],
    })]));

    expect(summary).toEqual({
      questions: 1,
      mcq: 1,
      structured: 0,
      parts: 0,
      options: 2,
      markPoints: 1,
      specPointMappings: 2,
      topicMappings: 2,
      assets: 0,
      deactivated: 3,
      corpusVersion: "corpus-2026-10",
    });

    const order = fake.stmts.map(sqlOf);
    // KG resolution BEFORE the deactivate, deactivate BEFORE every insert
    expect(order.findIndex((t) => t.includes("from knowledge_nodes"))).toBeLessThan(order.findIndex((t) => t.startsWith("update questions set active")));
    expect(order.findIndex((t) => t.startsWith("update questions set active"))).toBeLessThan(order.findIndex((t) => t.startsWith("insert into questions ")));
    expect(order.findIndex((t) => t.startsWith("insert into questions "))).toBeLessThan(order.findIndex((t) => t.startsWith("insert into question_versions ")));

    // the question row (bind params only — provenance/active/version/1/null
    // are inline literals in the template text): PAST_PAPER provenance,
    // SME difficulty source
    const qRow = insertValues(fake.stmts, "questions")[0]!;
    expect(qRow[1]).toBe("B1-Q1");
    expect(qRow[2]).toBe("MCQ_SINGLE");
    expect(qRow[3]).toBe("What is 2+2?");
    expect(qRow[4]).toBe(2);
    expect(qRow[5]).toBe(3);
    expect(qRow[6]).toBe(60);
    expect(qRow[7]).toBe("State");
    expect(qRow[8]).toBe(synthUuid("4CH1-S1-c"));
    expect(qRow[10]).toBe("SME"); // difficulty_source

    // the VALIDATED v1 version (literal) + scheme + the 'a' mark point
    const vRow = insertValues(fake.stmts, "question_versions")[0]!;
    expect(vRow[2]).toBe("What is 2+2?");
    expect(vRow[7]).toBe("sme-eq-igcse-maths-a-18-higher"); // the package's own source id
    expect(vRow[8]).toBe("sme-corpus-import-v1 (ADR-026)");
    const sRow = insertValues(fake.stmts, "mark_schemes")[0]!;
    expect(sRow[1]).toBe(vRow[0]); // the scheme hangs off that version
    expect(sRow[2]).toBe("sme-eq-igcse-maths-a-18-higher");
    const mpRow = insertValues(fake.stmts, "mark_points")[0]!;
    expect(mpRow[1]).toBe(sRow[0]); // the mark point hangs off that scheme
    expect(fake.stmts.find((s) => s.text.startsWith("insert into mark_points "))!.text).toContain("'a'");
    expect(mpRow[2]).toBe("worked solution"); // solutionMd wins over stem
    expect(mpRow[3]).toBe(2);

    // options in order, is_correct exactly once
    const oRows = insertValues(fake.stmts, "question_options");
    expect(oRows.map((v) => v[2])).toEqual(["A", "B"]);
    expect(oRows.map((v) => v[4])).toEqual([true, false]);
    expect(oRows.map((v) => v[5])).toEqual([0, 1]);

    // secondary topics carry node ids (is_primary is an inline false literal)
    const tRows = insertValues(fake.stmts, "question_topics");
    expect(tRows.map((v) => v[2])).toEqual([synthUuid("4CH1-S1-d"), synthUuid("4CH1-S2-a")]);
    expect(fake.stmts.find((s) => s.text.startsWith("insert into question_topics "))!.text).toContain("false");

    // spec points: provenance verbatim when present, AI_VALIDATED fallback
    // (QuestionSpecPoint.java :61-67); validation_state is an inline literal
    const spRows = insertValues(fake.stmts, "question_spec_points");
    expect(spRows.map((v) => v[3])).toEqual(["PRIMARY", "SECONDARY"]);
    expect(spRows.map((v) => v[4])).toEqual(["SME", "AI_VALIDATED"]);
    expect(fake.stmts.find((s) => s.text.startsWith("insert into question_spec_points "))!.text).toContain("'AI_VALIDATED'");

    expect(fake.events).toEqual(["begin", "commit"]);
  });

  test("a package that omits source falls back to the chemistry constant (:315-319)", async () => {
    const fake = fakeSql();
    const module = buildSmeModule(fake.sql, { newId: () => synthUuid("id"), now: () => new Date(0) });
    await module.ingest(packageBytes([mcqQuestion()], { source: undefined }));
    const vRow = insertValues(fake.stmts, "question_versions")[0]!;
    expect(vRow[7]).toBe(SOURCE_DOCUMENT_ID);
  });

  test("unknown KG code → 400 verbatim, transaction rolled back (:160-162)", async () => {
    const fake = fakeSql({ nodeIds: (code) => (code === "4CH1-NOPE" ? null : synthUuid(code)) });
    const module = buildSmeModule(fake.sql, { newId: () => synthUuid("id"), now: () => new Date(0) });
    expect(
      module.ingest(packageBytes([mcqQuestion({ secondaryTopicCodes: ["4CH1-NOPE"] })])),
    ).rejects.toThrow(new BadRequestError("unknown KG code: 4CH1-NOPE"));
    // the failure happens inside the tx — nothing committed
    await new Promise((r) => setTimeout(r, 10));
    expect(fake.events).toEqual(["begin", "rollback"]);
    expect(fake.stmts.some((s) => s.text.startsWith("insert into questions "))).toBe(false);
  });
});

describe("buildSmeModule().ingest — the MIXED -pN/-s family law (:226-268)", () => {
  const mixed = mcqQuestion({
    questionType: "STRUCTURED",
    stem: "The circuit below...",
    marks: 5,
    parts: [
      { label: "a", prompt: "Pick the correct units", marks: 2, commandWord: "Identify", solutionMd: "amps", options: [{ label: "A", text: "V", isCorrect: true }, { label: "B", text: "A", isCorrect: false }] },
      { label: "b", prompt: "Explain the trend", marks: 3, commandWord: "Explain" },
    ],
    secondaryTopicCodes: ["4CH1-S1-d"],
  });

  test("emits one -p1 MCQ row + one -s structured row; summary counts", async () => {
    const fake = fakeSql({ deactivate: 2 });
    const module = buildSmeModule(fake.sql, { newId: () => synthUuid("id"), now: () => new Date(0) });
    const summary = await module.ingest(packageBytes([mixed]));

    expect(summary.mcq).toBe(0); // the PACKAGE question is STRUCTURED
    expect(summary.structured).toBe(1);
    expect(summary.parts).toBe(1); // only the plain part b
    expect(summary.options).toBe(2); // part a's options
    expect(summary.markPoints).toBe(2); // one per emitted row
    expect(summary.topicMappings).toBe(2); // BOTH rows carry the same tags

    const qRefs = insertValues(fake.stmts, "questions").map((v) => v[1]);
    expect(qRefs).toEqual(["B1-Q1-p1", "B1-Q1-s"]);

    // -p1 row: the PART's prompt as stem, the part's marks, part commandWord
    const p1 = insertValues(fake.stmts, "questions")[0]!;
    expect(p1[2]).toBe("MCQ_SINGLE");
    expect(p1[3]).toBe("Pick the correct units");
    expect(p1[4]).toBe(2);
    const p1v = insertValues(fake.stmts, "question_versions")[0]!;
    expect(p1v[2]).toBe("Pick the correct units");
    expect(p1v[6]).toBe("Identify");

    // -s row: the question stem, the PLAIN part marks sum
    const sRow = insertValues(fake.stmts, "questions")[1]!;
    expect(sRow[2]).toBe("STRUCTURED");
    expect(sRow[3]).toBe("The circuit below...");
    expect(sRow[4]).toBe(3);

    // mark points: [0] = the -p1 MCQ row's ('a' literal ref, part-a solution,
    // part-a marks); [1] = the -s body's mark point for part b — the ONLY
    // part-level row, because part a became the -p1 MCQ row itself
    // (solutionOf falls back to the part prompt)
    const mpRows = insertValues(fake.stmts, "mark_points");
    expect(mpRows).toHaveLength(2);
    expect(mpRows[0]![2]).toBe("amps"); // -p1: solutionMd ?? prompt
    expect(mpRows[0]![3]).toBe(2); // -p1: the part's marks
    expect(mpRows[1]![3]).toBe("b");
    expect(mpRows[1]![5]).toBe("Explain the trend");
  });
});

describe("buildSmeModule().ingest — the asset store law (:279-289)", () => {
  test("an asset-bearing package replaces the store wholesale; SVG demoted", async () => {
    const fake = fakeSql({ deactivate: 0 });
    const module = buildSmeModule(fake.sql, { newId: () => synthUuid("id"), now: () => new Date(0) });
    const summary = await module.ingest(
      packageBytes(
        [mcqQuestion({ stem: "see (assets/diagram.png) and (assets/plot.svg) and (assets/doc.pdf)" })],
        {},
        [
          { name: "diagram.png", data: "PNG" },
          { name: "plot.svg", data: "<svg/>" },
          { name: "doc.pdf", data: "%PDF" },
        ],
      ),
    );
    expect(summary.assets).toBe(3);
    expect(fake.stmts.some((s) => s.text.startsWith("delete from question_asset"))).toBe(true);
    const aRows = insertValues(fake.stmts, "question_asset");
    expect(aRows.map((v) => v[0])).toEqual(["diagram.png", "plot.svg", "doc.pdf"]);
    expect(aRows.map((v) => v[1])).toEqual([
      "image/png",
      "application/octet-stream", // the R14 SVG demotion (:571-575)
      "application/pdf",
    ]);
    expect(aRows[0]![2]).toBe(3); // size_bytes
    expect(aRows[0]![3]).toBe("\\x" + Buffer.from("PNG").toString("hex")); // bytea hex binding
  });

  test("a package that ships NO assets leaves the store untouched", async () => {
    const fake = fakeSql({ deactivate: 0 });
    const module = buildSmeModule(fake.sql, { newId: () => synthUuid("id"), now: () => new Date(0) });
    await module.ingest(packageBytes([mcqQuestion()]));
    expect(fake.stmts.some((s) => s.text.includes("question_asset"))).toBe(false);
  });
});

// ── status (:425-433) ───────────────────────────────────────────────────────

describe("buildSmeModule().status — the live bank snapshot", () => {
  test("counts + the activeStructured derivation (:425-433)", async () => {
    // the four count queries in statement order: active, active-mcq,
    // spec points, assets
    const counts = [5, 3, 7, 1];
    const countingSql = (() => {
      const f = ((strings: TemplateStringsArray) => {
        const text = strings.join("?").replace(/\s+/g, " ").trim();
        if (text.includes("count(*)::int")) {
          return Promise.resolve([{ n: counts.shift() }]);
        }
        return Promise.resolve([]);
      }) as unknown as SmeTxSql;
      f.transaction = async <T,>(body: (tx: never) => Promise<T>) => body(f as never);
      return f;
    })();
    const module = buildSmeModule(countingSql, { newId: () => "x", now: () => new Date(0) });
    expect(await module.status()).toEqual({
      activeQuestions: 5,
      activeMcq: 3,
      activeStructured: 2, // active - mcq (:430)
      specPointMappings: 7,
      assets: 1,
    });
  });
});

// ── contentTypeOf (:576-584) ────────────────────────────────────────────────

describe("contentTypeOf — the R14 media-type law", () => {
  test("raster + pdf inline; everything else (incl. SVG) demoted", () => {
    expect(contentTypeOf("a.png")).toBe("image/png");
    expect(contentTypeOf("a.JPG")).toBe("image/jpeg");
    expect(contentTypeOf("a.jpeg")).toBe("image/jpeg");
    expect(contentTypeOf("a.gif")).toBe("image/gif");
    expect(contentTypeOf("a.webp")).toBe("image/webp");
    expect(contentTypeOf("a.pdf")).toBe("application/pdf");
    expect(contentTypeOf("a.svg")).toBe("application/octet-stream");
    expect(contentTypeOf("a.html")).toBe("application/octet-stream");
    expect(contentTypeOf("a.bin")).toBe("application/octet-stream");
  });
});

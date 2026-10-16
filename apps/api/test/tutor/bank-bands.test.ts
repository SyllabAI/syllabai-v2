/**
 * T-MIG-128/129 pins — the tutor bank bands (the operator's deterministic
 * bands, trace 1a14080256278b41).
 *
 * Pinned here: band (1) axis precedence (nodeId > spec > topic), the exact-
 * then-substring topic resolution, the subtree expansion (UNIT → TOPIC
 * children via the PART_OF CTE), the T-C07 surface fail-closed filter, the
 * honest empty on zero resolution, the limit/total census law, and the
 * SQL-carried laws (the V20 REJECTED/FLAGGED paper gate present, FETCH
 * active-AGNOSTIC — no `active = true` filter on the listing); band (2) the
 * first-unit-match binding ("paper 1" → 1C outranks 1CR; explicit code binds
 * exactly), the VALIDATED-only serving gate, the sibling disclosure, the
 * branch-1 document law (SUGGESTED documents serve, REJECTED top versions
 * never do, kind must match), chunk order = chunk_index, and the
 * active-agnostic bank rows with marks in external_ref order.
 */
import { describe, expect, test } from "bun:test";
import type { SqlFn } from "../../src/services/tutor/sql";
import { buildBankBands, MAX_PAPER_CHUNKS_PER_KIND } from "../../src/services/tutor/bank-bands";

// ── recording fakeSql (whitespace-collapsed substring dispatch) ─────────────

type Row = Record<string, unknown>;
type Responder = Row[] | ((params: unknown[]) => Row[]);

function fakeSql(responses: Record<string, Responder>) {
  const calls: Array<{ text: string; params: unknown[] }> = [];
  const fn = (async (strings: TemplateStringsArray, ...params: unknown[]) => {
    const text = strings
      .join("?")
      .replace(/\s+/g, " ")
      .trim();
    calls.push({ text, params });
    for (const key of Object.keys(responses)) {
      if (text.includes(key)) {
        const hit = responses[key]!;
        return typeof hit === "function" ? hit(params) : hit;
      }
    }
    return [];
  }) as unknown as SqlFn;
  return { sql: fn, calls };
}

const SCOPE = {
  curriculumVersionId: "cv-00000000-0000-0000-0000-000000000001",
  code: "4CH1-2017",
  surface: new Set(["unit-1", "topic-1", "topic-2", "spec-1"]),
};

const paperRow = (over: Partial<Row> = {}): Row => ({
  id: "p-1c",
  paper_code: "4CH1/1C",
  session_label: "June 2019",
  series: "JUN",
  year: 2019,
  validation_state: "VALIDATED",
  question_paper_document_id: "doc-qp-1",
  mark_scheme_document_id: "doc-ms-1",
  ...over,
});

const listingRow = (over: Partial<Row> = {}): Row => ({
  id: "q-1",
  external_ref: "q01-x",
  question_type: "STRUCTURED",
  stem: "The stem of question one.",
  marks: 4,
  command_word: null,
  paper_id: "p-1c",
  paper_title: "Chemistry Paper 1",
  paper_code: "4CH1/1C",
  session_label: "June 2019",
  paper_series: "JUN",
  paper_year: 2019,
  paper_state: "VALIDATED",
  ...over,
});

// ── band (1): the deterministic question listing ────────────────────────────

describe("bank band (1) — axis precedence + node resolution", () => {
  test("nodeId outranks spec and topic; the pin resolves through the surface", async () => {
    const { sql, calls } = fakeSql({
      "n.id = any": [
        { id: "topic-1", node_type: "TOPIC", title: "Crude oil", code: "4CH1-5.7" },
      ],
      "left join exam_papers ep": [listingRow()],
      "from question_spec_points qsp": [],
    });
    const bands = buildBankBands(sql);
    const view = await bands.listQuestions(
      { nodeId: "topic-1", spec: "2.44", topic: "Crude oil", limit: 200 },
      SCOPE,
    );
    expect(view.total).toBe(1);
    expect(view.resolvedNodes).toEqual([
      { id: "topic-1", nodeType: "TOPIC", title: "Crude oil", code: "4CH1-5.7" },
    ]);
    // the axis predicate runs in SPEC mode only when spec is the binding axis
    const listing = calls.find((c) => c.text.includes("left join exam_papers ep"))!;
    expect(listing.params).toContain(false); // isSpec = false (nodeId mode)
  });

  test("spec mode maps through question_spec_points (isSpec=true)", async () => {
    const { sql, calls } = fakeSql({
      "lower(n.code) = lower": [{ id: "spec-1", node_type: "SUBTOPIC", title: "Titration calculations", code: "4CH1-1.25" }],
      "n.id = any": [{ id: "spec-1", node_type: "SUBTOPIC", title: "Titration calculations", code: "4CH1-1.25" }],
      "left join exam_papers ep": [listingRow()],
      "from question_spec_points qsp": [{ question_id: "q-1", code: "4CH1-1.25" }],
    });
    const bands = buildBankBands(sql);
    const view = await bands.listQuestions({ spec: "4CH1-1.25", limit: 200 }, SCOPE);
    expect(view.total).toBe(1);
    expect(view.items[0]!.specPointCodes).toEqual(["4CH1-1.25"]);
    const listing = calls.find((c) => c.text.includes("left join exam_papers ep"))!;
    expect(listing.params).toContain(true); // isSpec = true
    expect(listing.text).toContain("question_spec_points qsp");
  });

  test("topic: exact wins over substring; the subtree expansion joins the mapping set", async () => {
    const { sql, calls } = fakeSql({
      "lower(n.title) = lower": [{ id: "unit-1" }],
      "SELECT id FROM subtree": [{ id: "topic-1" }, { id: "topic-2" }],
      "n.id = any": [
        { id: "unit-1", node_type: "UNIT", title: "Organic chemistry", code: "4CH1-U4" },
        { id: "topic-1", node_type: "TOPIC", title: "Crude oil", code: "4CH1-5.7" },
        { id: "topic-2", node_type: "TOPIC", title: "Alkanes and alkenes", code: null },
      ],
      "left join exam_papers ep": [listingRow(), listingRow({ id: "q-2", external_ref: "q02-x" })],
      "from question_spec_points qsp": [],
    });
    const bands = buildBankBands(sql);
    const view = await bands.listQuestions({ topic: "Organic chemistry", limit: 200 }, SCOPE);
    // matched ∪ subtree = 3 nodes, all inside the surface
    expect(view.resolvedNodes).toHaveLength(3);
    expect(view.total).toBe(2);
    // deterministic order: paper-anchored first, year desc, external_ref
    expect(view.items.map((i) => i.externalRef)).toEqual(["q01-x", "q02-x"]);
    expect(view.items[0]!.paper!.paperCode).toBe("4CH1/1C");
  });

  test("topic: no exact → the substring form resolves (disclosed superset)", async () => {
    const { sql } = fakeSql({
      "n.title ilike": [{ id: "topic-1" }],
      "SELECT id FROM subtree": [],
      "n.id = any": [{ id: "topic-1", node_type: "TOPIC", title: "Ionic bonding", code: null }],
      "left join exam_papers ep": [],
      "from question_spec_points qsp": [],
    });
    const bands = buildBankBands(sql);
    const view = await bands.listQuestions({ topic: "bonding", limit: 200 }, SCOPE);
    expect(view.resolvedNodes).toHaveLength(1);
    expect(view.total).toBe(0);
    expect(view.items).toEqual([]);
  });

  test("zero resolution → the honest empty census", async () => {
    const { sql } = fakeSql({
      "lower(n.title) = lower": [],
      "n.title ilike": [],
    });
    const bands = buildBankBands(sql);
    const view = await bands.listQuestions({ topic: "nothing matches this", limit: 200 }, SCOPE);
    expect(view).toEqual({ resolvedNodes: [], total: 0, items: [] });
  });

  test("T-C07 surface fail-closed: matched nodes outside the surface never resolve", async () => {
    const { sql } = fakeSql({
      "lower(n.title) = lower": [{ id: "unit-1" }],
      "SELECT id FROM subtree": [{ id: "topic-9" }],
      "n.id = any": [
        { id: "unit-1", node_type: "UNIT", title: "Organic chemistry", code: null },
        { id: "topic-9", node_type: "TOPIC", title: "Foreign topic", code: null },
      ],
    });
    const bands = buildBankBands(sql);
    const empty = { ...SCOPE, surface: new Set<string>() };
    const view = await bands.listQuestions({ topic: "Organic chemistry", limit: 200 }, empty);
    expect(view).toEqual({ resolvedNodes: [], total: 0, items: [] });
  });

  test("SQL law: the V20 REJECTED/FLAGGED paper gate is present; the listing is active-AGNOSTIC (no active filter)", async () => {
    const { sql, calls } = fakeSql({
      "lower(n.title) = lower": [{ id: "topic-1" }],
      "SELECT id FROM subtree": [],
      "n.id = any": [{ id: "topic-1", node_type: "TOPIC", title: "Crude oil", code: null }],
      "left join exam_papers ep": [],
      "from question_spec_points qsp": [],
    });
    const bands = buildBankBands(sql);
    await bands.listQuestions({ topic: "Crude oil", limit: 200 }, SCOPE);
    const listing = calls.find((c) => c.text.includes("left join exam_papers ep"))!;
    expect(listing.text).toContain("validation_state in ('REJECTED', 'FLAGGED')");
    expect(listing.text).not.toContain("active = true");
  });

  test("limit: the census (total) precedes the cut", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => listingRow({ id: `q-${i}`, marks: i + 1 }));
    const { sql } = fakeSql({
      "lower(n.title) = lower": [{ id: "topic-1" }],
      "SELECT id FROM subtree": [],
      "n.id = any": [{ id: "topic-1", node_type: "TOPIC", title: "Crude oil", code: null }],
      "left join exam_papers ep": rows,
      "from question_spec_points qsp": [],
    });
    const bands = buildBankBands(sql);
    const view = await bands.listQuestions({ topic: "Crude oil", limit: 2 }, SCOPE);
    expect(view.total).toBe(5);
    expect(view.items).toHaveLength(2);
  });
});

// ── band (2): the whole-paper one-view fetch ────────────────────────────────

function bankHarness(over: Record<string, Responder> = {}, pre: Record<string, Responder> = {}) {
  // `pre` lands BEFORE the base keys: the figures lane's canonical-JSON read
  // also contains the substring "from documents" — the more specific key
  // must win the fakeSql dispatch (first match wins).
  return fakeSql({
    ...pre,
    "from subjects s": [{ code: "4CH1" }],
    "from exam_papers ep join subjects s": [
      paperRow(),
      paperRow({ id: "p-1cr", paper_code: "4CH1/1CR" }),
      paperRow({ id: "p-2c", paper_code: "4CH1/2C" }),
      paperRow({ id: "p-2cr", paper_code: "4CH1/2CR" }),
    ],
    "select ep.title from exam_papers": [{ title: "Chemistry Paper 1C" }],
    "from documents": (params) => [
      params[0] === "doc-qp-1"
        ? { id: "row-qp", document_id: "doc-qp-1", doc_version: 1, kind: "QUESTION_PAPER", validation_state: "SUGGESTED" }
        : { id: "row-ms", document_id: "doc-ms-1", doc_version: 1, kind: "MARK_SCHEME", validation_state: "VALIDATED" },
    ],
    "from document_chunks": (params) =>
      (params[0] === "row-qp"
        ? [
            { id: "c2", chunk_index: 2, content: "question 3 (a) second", page_start: 6, page_end: 6, atom_number: "3" },
            { id: "c1", chunk_index: 1, content: "question 2 (a) first", page_start: 5, page_end: 5, atom_number: "2" },
          ]
        : [{ id: "c3", chunk_index: 0, content: "1 | (a) answer", page_start: 4, page_end: 4, atom_number: "1" }
      ]).sort((a, b) => a.chunk_index - b.chunk_index), // the DB's ORDER BY law
    "order by q.external_ref, q.id": [
      { id: "q-1", external_ref: "q01-x", question_type: "STRUCTURED", stem: "s1", marks: 4, command_word: null },
      { id: "q-2", external_ref: "q02-x", question_type: "STRUCTURED", stem: "s2", marks: 6, command_word: "Explain" },
    ],
    "from question_spec_points qsp": [{ question_id: "q-1", code: "4CH1-2.44" }],
    ...over,
  });
}

describe("bank band (2) — binding + serving laws", () => {
  test("the operator's example: 'full 2019 june paper 1 question paper' binds 1C (first-unit-match) with siblings disclosed", async () => {
    const { sql } = bankHarness();
    const bands = buildBankBands(sql);
    const result = await bands.fetchPaper("give me the full 2019 june paper 1 question paper", SCOPE);
    expect(result.status).toBe("FULL");
    const view = (result as { status: "FULL"; view: { paper: Row; siblings: Row[]; questionPaper: Row; markScheme: Row; questions: Row[] } }).view;
    expect(view.paper.paperCode).toBe("4CH1/1C");
    expect(view.paper.validationState).toBe("VALIDATED");
    expect(view.paper.title).toBe("Chemistry Paper 1C");
    // the regional variant + paper 2 candidates ride the view, never hidden
    expect(view.siblings.map((s) => s.paperCode)).toEqual(["4CH1/1CR", "4CH1/2C", "4CH1/2CR"]);
  });

  test("QP + MS in one view: chunk order = chunk_index; SUGGESTED QP serves, marks in external_ref order", async () => {
    const { sql } = bankHarness();
    const bands = buildBankBands(sql);
    const result = await bands.fetchPaper("2019 june paper 1", SCOPE);
    const view = (result as { status: "FULL"; view: { questionPaper: { chunks: Array<{ chunkIndex: number; documentId: string; content: string }> }; markScheme: { chunks: unknown[] }; questions: Array<{ externalRef: string; marks: number; specPointCodes: string[]; paper: { paperCode: string } }> } }).view;
    expect(view.questionPaper.chunks.map((c) => c.chunkIndex)).toEqual([1, 2]);
    expect(view.questionPaper.chunks[0]!.documentId).toBe("doc-qp-1");
    expect(view.markScheme.chunks).toHaveLength(1);
    // bank rows: active-agnostic, external_ref order, marks attached
    expect(view.questions.map((q) => [q.externalRef, q.marks])).toEqual([["q01-x", 4], ["q02-x", 6]]);
    expect(view.questions[0]!.specPointCodes).toEqual(["4CH1-2.44"]);
    expect(view.questions[0]!.paper!.paperCode).toBe("4CH1/1C");
  });

  test("explicit code binds exactly (4CH1/2C)", async () => {
    const { sql } = bankHarness();
    const bands = buildBankBands(sql);
    const result = await bands.fetchPaper("4CH1/2C june 2019", SCOPE);
    const view = (result as { status: "FULL"; view: { paper: { paperCode: string }; siblings: Row[] } }).view;
    expect(view.paper.paperCode).toBe("4CH1/2C");
    expect(view.siblings.map((s) => s.paperCode)).toEqual(["4CH1/1C", "4CH1/1CR", "4CH1/2CR"]);
  });

  test("REJECTED QP top version never serves — the honest empty document view", async () => {
    const { sql } = bankHarness({
      "from documents": (params) => [
        params[0] === "doc-qp-1"
          ? { id: "row-qp", document_id: "doc-qp-1", doc_version: 2, kind: "QUESTION_PAPER", validation_state: "REJECTED" }
          : { id: "row-ms", document_id: "doc-ms-1", doc_version: 1, kind: "MARK_SCHEME", validation_state: "VALIDATED" },
      ],
    });
    const bands = buildBankBands(sql);
    const result = await bands.fetchPaper("2019 june paper 1", SCOPE);
    const view = (result as { status: "FULL"; view: { questionPaper: { documentId: string; chunkCount: number; chunks: unknown[] }; markScheme: { chunkCount: number } } }).view;
    expect(view.questionPaper.documentId).toBe("doc-qp-1");
    expect(view.questionPaper.chunkCount).toBe(0);
    expect(view.questionPaper.chunks).toEqual([]);
    expect(view.markScheme.chunkCount).toBe(1);
  });

  test("kind-confected document never serves", async () => {
    const { sql } = bankHarness({
      "from documents": (params) => [
        params[0] === "doc-qp-1"
          ? { id: "row-qp", document_id: "doc-qp-1", doc_version: 1, kind: "MARK_SCHEME", validation_state: "VALIDATED" }
          : { id: "row-ms", document_id: "doc-ms-1", doc_version: 1, kind: "MARK_SCHEME", validation_state: "VALIDATED" },
      ],
    });
    const bands = buildBankBands(sql);
    const result = await bands.fetchPaper("2019 june paper 1", SCOPE);
    const view = (result as { status: "FULL"; view: { questionPaper: { chunkCount: number } } }).view;
    expect(view.questionPaper.chunkCount).toBe(0);
  });

  test("no VALIDATED candidate → honest NOT_FOUND; SUGGESTED papers never bind", async () => {
    const { sql } = bankHarness({
      "from exam_papers ep join subjects s": [paperRow({ validation_state: "SUGGESTED" })],
    });
    const bands = buildBankBands(sql);
    const result = await bands.fetchPaper("2019 june paper 1", SCOPE);
    expect(result.status).toBe("NOT_FOUND");
  });

  test("an unparseable identity → NOT_FOUND with the echoed label", async () => {
    const { sql } = bankHarness();
    const bands = buildBankBands(sql);
    const result = await bands.fetchPaper("hello there", SCOPE);
    expect(result.status).toBe("NOT_FOUND");
    expect((result as { label: string }).label).toBe("hello there");
  });

  test("chunk cap: the per-kind cap bounds the dump", async () => {
    const bigRows = Array.from({ length: MAX_PAPER_CHUNKS_PER_KIND + 5 }, (_, i) => ({
      id: `c${i}`,
      chunk_index: i,
      content: `chunk ${i}`,
      page_start: 1,
      page_end: 1,
      atom_number: null,
    }));
    const { sql } = bankHarness({
      "from document_chunks": (params) => (params[0] === "row-qp" ? bigRows : []),
    });
    const bands = buildBankBands(sql);
    const result = await bands.fetchPaper("2019 june paper 1", SCOPE);
    const view = (result as { status: "FULL"; view: { questionPaper: { chunkCount: number } } }).view;
    expect(view.questionPaper.chunkCount).toBe(MAX_PAPER_CHUNKS_PER_KIND);
  });

  // ── lane #3 (trace 1a14536e97f41425): figures + the F-022 row law ─────────

  test("lane #3: figure refs attach by external_ref number; the honest empty rides questions without refs", async () => {
    const draft = {
      questions: [
        { number: 1, figures: [{ elementId: "e1", sourceName: "assets/crop_1.png", format: "png", width: 338, height: 337, availability: "available" }], parts: [] },
        { number: 2, figures: [], parts: [] },
      ],
    };
    const { sql } = bankHarness({
      "select qp_document_row_id": [{ qp_document_row_id: "row-qp", qp_draft: JSON.stringify(draft) }],
    }, {
      // the SERVING-row lookup (keyed by paper id) — the citable address
      "from exam_papers ep where ep.id": (params) =>
        params[0] === "p-1c"
          ? [{ id: "row-qp", cj: JSON.stringify({ figures: [{ element_id: "e1", page_number: 4 }] }) }]
          : [],
    });
    const bands = buildBankBands(sql);
    const result = await bands.fetchPaper("2019 june paper 1", SCOPE);
    const view = (result as { status: "FULL"; view: { questions: Array<{ externalRef: string; figures: Array<Row> }> } }).view;
    expect(view.questions[0]!.figures).toHaveLength(1);
    expect(view.questions[0]!.figures[0]).toMatchObject({ page: 4, documentRowId: "row-qp" });
    expect(view.questions[1]!.figures).toEqual([]); // the honest empty, never a guess
  });

  test("lane #3: no bridge record → every question serves figures: [] (the honest empty)", async () => {
    const { sql } = bankHarness({
      "select qp_document_row_id": [],
    });
    const bands = buildBankBands(sql);
    const result = await bands.fetchPaper("2019 june paper 1", SCOPE);
    const view = (result as { status: "FULL"; view: { questions: Array<{ figures: unknown[] }> } }).view;
    expect(view.questions.every((q) => Array.isArray(q.figures) && q.figures.length === 0)).toBe(true);
  });

  test("the F-022 row law: a band chunk's documentRowId is the DOCUMENTS.id row (existsCitable resolves it) — the chunk id is not", async () => {
    const { sql } = bankHarness();
    const bands = buildBankBands(sql);
    const result = await bands.fetchPaper("2019 june paper 1", SCOPE);
    const view = (result as { status: "FULL"; view: { questionPaper: { chunks: Array<{ documentRowId: string }> } } }).view;
    // the fake chunks carry ids c1/c2 — the field of record must carry the
    // doc row (row-qp), the law the /sources reader and the citation bridge
    // both resolve (documents.id; paper-question evidence() convention)
    expect(view.questionPaper.chunks.every((c) => c.documentRowId === "row-qp")).toBe(true);
  });

  test("lane #3: the band-1 listing attaches figures for the SHOWN items' papers", async () => {
    const draft = {
      questions: [
        { number: 1, figures: [{ elementId: "e1", sourceName: "assets/crop_1.png", availability: "available" }], parts: [] },
      ],
    };
    const rows = [
      listingRow({ id: "q-1", external_ref: "q01-x", paper_id: "p-1c" }),
      listingRow({ id: "q-2", external_ref: "q02-x", paper_id: "p-2c" }),
    ];
    const { sql } = fakeSql({
      "lower(n.title) = lower": [{ id: "topic-1" }],
      "SELECT id FROM subtree": [],
      "n.id = any": [{ id: "topic-1", node_type: "TOPIC", title: "Crude oil", code: null }],
      "left join exam_papers ep": rows,
      "from question_spec_points qsp": [],
      "select qp_document_row_id": (params) =>
        params[0] === "p-1c" ? [{ qp_document_row_id: "row-qp", qp_draft: JSON.stringify(draft) }] : [],
      "from exam_papers ep where ep.id": (params) =>
        params[0] === "p-1c" ? [{ id: "row-qp", cj: JSON.stringify({ figures: [{ element_id: "e1", page_number: 2 }] }) }] : [],
    });
    const bands = buildBankBands(sql);
    const view = await bands.listQuestions({ topic: "Crude oil", limit: 10 }, SCOPE);
    expect(view.items[0]!.figures).toHaveLength(1);
    expect(view.items[0]!.figures[0]!.page).toBe(2);
    expect(view.items[1]!.figures).toEqual([]); // p-2c has no bridge record
  });
});

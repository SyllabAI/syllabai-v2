/**
 * T-MIG-060 tranche 1b pins — the paper-question resolver + its Fetch
 * parser/bank seam, line-against-line against the frozen core @ 6cad6ef.
 *
 * Pinned here: the parser vocabulary laws (FetchQueryParser :61-268 —
 * series words, full code / bare unit binding, keyword-led and ordinal-led
 * question numbers, word numbers with the hyphen fold + NFKC fold, the
 * letter-gated roman, the msSeeking default, partAtom), the identity echo
 * (identityLabel :252-290), the verdict laws (:183-234 — the L3 recovery on
 * a fetch failure, the fail-open guard on a complete-but-unbound identity,
 * the never-downgrade-on-mid-flight-failure law, ambiguity does NOT disarm
 * the guard), the serving law on every tier (bank VALIDATED / card
 * VALIDATED / store VALIDATED-top-version; REJECTED never serves), the
 * caps (seeking vs non-seeking allocation), the deterministic unit binding
 * + store sort + bound-unit filter, and the question-chunk selection laws
 * (atom first with zero-padding/q-prefix tolerance, part-atom preference,
 * the content-marker fallback with the "Total for Question" exclusion).
 */
import { describe, expect, test } from "bun:test";
import type { SqlFn } from "../../src/services/tutor/sql";
import {
  hasExplicitPaper,
  parseFetchQuery,
  parsedIsEmpty,
  partAtomOf,
} from "../../src/services/tutor/fetch-parser";
import {
  atomMatches,
  buildPaperQuestionResolver,
  completeIdentity,
  contentMarks,
  identityLabel,
  matchQuestion,
  subjectCode,
  unitCandidates,
  unitFromPaperCode,
} from "../../src/services/tutor/paper-question";

// ── fakeSql (whitespace-collapsed substring dispatch, the tutor-core style) ─

type Row = Record<string, unknown>;
type Responder = Row[] | ((params: unknown[]) => Row[]);
function fakeSql(responses: Record<string, Responder>) {
  const fn = (async (strings: TemplateStringsArray, ...params: unknown[]) => {
    const text = strings
      .join("?")
      .replace(/\s+/g, " ")
      .trim();
    for (const key of Object.keys(responses)) {
      if (text.includes(key)) {
        const hit = responses[key];
        return typeof hit === "function" ? hit(params) : hit;
      }
    }
    return [];
  }) as unknown as SqlFn;
  return fn;
}

const SCOPE = {
  surface: new Set<string>(),
  curriculumVersionId: "cv-00000000-0000-0000-0000-000000000001",
  code: "4CH1-2017", // subjectCode → "4CH1"
};

const paperRow = (over: Partial<Row> = {}): Row => ({
  id: "aa000000-0000-4000-8000-00000000 0001".replace(" ", ""),
  paper_code: "4CH1/2C",
  session_label: "June 2019",
  series: "JUN",
  year: 2019,
  validation_state: "VALIDATED",
  question_paper_document_id: "doc-qp-1",
  mark_scheme_document_id: null,
  ...over,
});

const docRow = (over: Partial<Row> = {}): Row => ({
  id: "row-1",
  document_id: "doc-qp-1",
  doc_version: 1,
  kind: "QUESTION_PAPER",
  validation_state: "SUGGESTED",
  file_name: null,
  ...over,
});

const chunkRow = (over: Partial<Row> = {}): Row => ({
  id: "ch-1",
  chunk_index: 0,
  content: "question 10 (a) The row is about electrolysis.",
  page_start: 12,
  page_end: 12,
  element_ids: [],
  atom_number: "q10",
  ...over,
});

// ── parser pins (FetchQueryParser :61-268) ──────────────────────────────────

describe("fetch query parser — series + year + paper vocabulary", () => {
  const p = (q: string) => parseFetchQuery(q);

  test("series words map to the canonical enum (§8.1)", () => {
    expect(p("summer 2019 question 2").series).toBe("JUN");
    expect(p("june 2019 question 2").series).toBe("JUN");
    expect(p("january 2022 question 4").series).toBe("JAN");
    expect(p("jan 2022 question 4").series).toBe("JAN");
    expect(p("november 2019 question 2").series).toBe("NOV");
    expect(p("october 2019 question 2").series).toBe("NOV");
  });

  test("year: first 4-digit match binds", () => {
    expect(p("question 6 from june 2019").year).toBe(2019);
    expect(p("question 6").year).toBe(null);
  });

  test("full paper code binds exactly (separator + space tolerant)", () => {
    expect(p("4CH1/2C june 2019 question 10").paperCode).toBe("4CH1/2C");
    expect(p("4ch0 - 1cr june 2019 question 10").paperCode).toBe("4CH0/1CR");
    expect(p("4CH1 / 2 C june 2019 question 10").paperCode).toBe("4CH1/2C");
  });

  test("bare unit binds only when no full code matched", () => {
    expect(p("explain the 1CR paper june 2019 question 3").unit).toBe("1CR");
    expect(p("paper 2C june 2019 question 3").unit).toBe("2C");
    expect(p("4CH1/2C june 2019 question 3").unit).toBe(null);
  });

  test("explicit paper = hasExplicitPaper; none = isEmpty parse defect", () => {
    expect(hasExplicitPaper(p("4CH1/2C june 2019 question 1"))).toBe(true);
    expect(hasExplicitPaper(p("the 2C paper june 2019 question 1"))).toBe(true);
    expect(hasExplicitPaper(p("june 2019 question 1"))).toBe(false);
    expect(parsedIsEmpty(p("the weather today is nice"))).toBe(true);
    expect(parsedIsEmpty(p("june 2019 question 4"))).toBe(false);
  });
});

describe("fetch query parser — question-number grammar", () => {
  const q = (s: string) => parseFetchQuery(s).qnum;
  const part = (s: string) => parseFetchQuery(s).part;
  const roman = (s: string) => parseFetchQuery(s).partRoman;

  test("keyword-led numbers: digits, ordinal suffix, no./number, word forms", () => {
    expect(q("question 6")).toBe(6);
    expect(q("q4")).toBe(4);
    expect(q("question number 3")).toBe(3);
    expect(q("question no. 10")).toBe(10);
    expect(q("question 10th")).toBe(10);
    expect(q("question ten")).toBe(10);
  });

  test("ordinal-led numbers bind the number alone", () => {
    expect(q("10th question")).toBe(10);
    expect(q("tenth question")).toBe(10);
    expect(part("10th question")).toBe(null);
  });

  test("part letter binds optionally parenthesized; romans are letter-gated", () => {
    expect(part("Q7b")).toBe("b");
    expect(part("question 9 (b)")).toBe("b");
    expect(part("question 9(b)(ii)")).toBe("b");
    expect(roman("question 9(b)(ii)")).toBe("ii");
    expect(roman("question 9 part b ii")).toBe("ii");
    // a bare roman without a letter NEVER binds (Edexcel prints romans
    // under a letter part; the pronoun risk outweighs the shorthand)
    expect(part("question 9 (ii)")).toBe(null);
    expect(roman("question 9 (ii)")).toBe(null);
    expect(part("question 9 (i think)")).toBe(null);
  });

  test("word numbers one to forty-nine, hyphen fold to spaces", () => {
    expect(q("question twenty one")).toBe(21);
    expect(q("question thirty-first")).toBe(31);
    expect(q("question forty")).toBe(40);
    expect(q("question nineteenth")).toBe(19);
  });

  test("NFKC folds full-width digits to ASCII (H1 paraphrase audit)", () => {
    expect(q("question \uFF11\uFF10")).toBe(10);
  });

  test("partAtom: the filterable identity shape", () => {
    expect(partAtomOf(parseFetchQuery("question 9(b)(ii) june 2019"))).toBe("9-b-ii");
    expect(partAtomOf(parseFetchQuery("question 9(b) june 2019"))).toBe("9-b");
    expect(partAtomOf(parseFetchQuery("question 9 june 2019"))).toBe(null);
  });

  test("msSeeking: answer/solution probes true; QP probes false; default true", () => {
    expect(parseFetchQuery("give me the answer of jan 2022 question 4").msSeeking).toBe(true);
    expect(parseFetchQuery("jan 2022 question 4 mark scheme").msSeeking).toBe(true);
    expect(parseFetchQuery("what did the june 2019 question 6 ask").msSeeking).toBe(false);
    expect(parseFetchQuery("explain question 10 from june 2019").msSeeking).toBe(true);
  });

  test("normalized echo keeps the frozen join shape", () => {
    expect(parseFetchQuery("4CH1/2C june 2019 question 10").normalized).toBe(
      "4CH1/2C JUN 2019 Q10",
    );
    expect(parseFetchQuery("question 9(b) june 2019").normalized).toBe("JUN 2019 Q9b");
  });
});

// ── identity echo + identity helpers (:241-290, :511-553) ───────────────────

describe("identityLabel — the honest-refusal echo", () => {
  test("complete identity with explicit unit reads 'paper 2C'", () => {
    const parsed = parseFetchQuery("question 10 2C june 2019");
    expect(identityLabel(parsed, "question 10 2C june 2019")).toBe(
      "question 10 from the June 2019 paper 2C",
    );
  });

  test("part + roman render the Edexcel shape", () => {
    const parsed = parseFetchQuery("question 9(b)(ii) jan 2023");
    expect(identityLabel(parsed, "question 9(b)(ii) jan 2023")).toBe(
      "question 9(b)(ii) from the January 2023 papers",
    );
  });

  test("the paper N hint answers an ask that named no unit/code", () => {
    const parsed = parseFetchQuery("explain question 10 from june 2019 paper 2");
    expect(identityLabel(parsed, "explain question 10 from june 2019 paper 2")).toBe(
      "question 10 from the June 2019 paper 2",
    );
  });

  test("no paper named at all reads 'papers'", () => {
    const parsed = parseFetchQuery("question 10 from june 2019");
    expect(identityLabel(parsed, "question 10 from june 2019")).toBe(
      "question 10 from the June 2019 papers",
    );
  });

  test("null parse degrades to the honest generic echo", () => {
    expect(identityLabel(null, null)).toBe("that paper question");
  });
});

describe("identity helpers — completeIdentity, unit binding, subject code", () => {
  test("completeIdentity = qnum + series + year (the card tier's bindable ask)", () => {
    expect(completeIdentity(parseFetchQuery("question 10 from june 2019"))).toBe(true);
    expect(completeIdentity(parseFetchQuery("question 10 from june"))).toBe(false);
    expect(completeIdentity(parseFetchQuery("from june 2019"))).toBe(false);
    expect(completeIdentity(null)).toBe(false);
  });

  test("unitCandidates: code → exact; unit → exact; hint → home+regional; else all four", () => {
    expect(unitCandidates(parseFetchQuery("4CH1/2C question 10"), "q")).toEqual(["2C"]);
    expect(unitCandidates(parseFetchQuery("the 1CR paper question 10"), "q")).toEqual(["1CR"]);
    expect(unitCandidates(parseFetchQuery("question 10 paper 1"), "question 10 paper 1")).toEqual([
      "1C",
      "1CR",
    ]);
    expect(unitCandidates(parseFetchQuery("question 10 paper number 2"), "question 10 paper number 2")).toEqual([
      "2C",
      "2CR",
    ]);
    expect(unitCandidates(parseFetchQuery("question 10 june 2019"), "question 10 june 2019")).toEqual([
      "1C",
      "2C",
      "1CR",
      "2CR",
    ]);
  });

  test("unitFromPaperCode: separator + space tolerant, [12]CR? gated", () => {
    expect(unitFromPaperCode("4CH1/2C")).toBe("2C");
    expect(unitFromPaperCode("4CH0-1CR")).toBe("1CR");
    expect(unitFromPaperCode("4CH1/2 C")).toBe("2C");
    expect(unitFromPaperCode("4CH1/2X")).toBe(null);
  });

  test("subjectCode: the dash-cut law", () => {
    expect(subjectCode({ surface: new Set(), curriculumVersionId: "cv", code: "4CH1-2017" })).toBe(
      "4CH1",
    );
    expect(subjectCode({ surface: new Set(), curriculumVersionId: "cv", code: "4CH1" })).toBe(
      "4CH1",
    );
    expect(subjectCode({ surface: new Set(), curriculumVersionId: "cv", code: "" })).toBe(null);
  });
});

// ── question-chunk selection (:555-628) ─────────────────────────────────────

describe("matchQuestion — atom first, part refinement, content fallback", () => {
  test("atomMatches normalizes q-prefix, zero padding, part suffixes", () => {
    expect(atomMatches("q10", 10)).toBe(true);
    expect(atomMatches("10-a", 10)).toBe(true);
    expect(atomMatches("010", 10)).toBe(true);
    expect(atomMatches("q9", 10)).toBe(false);
    expect(atomMatches(null, 10)).toBe(false);
  });

  test("atoms are authoritative when populated", () => {
    const rows = [chunkRow({ id: "ch-a", atom_number: "q9" }), chunkRow({ id: "ch-b", atom_number: "q10" })];
    const picked = matchQuestion(rows as never, 10, null);
    expect(picked).toHaveLength(1);
    expect(picked[0]!.id).toBe("ch-b");
  });

  test("more than three atom rows cap at three", () => {
    const rows = [1, 2, 3, 4, 5].map((i) => chunkRow({ id: `ch-${i}`, atom_number: "q10" }));
    expect(matchQuestion(rows as never, 10, null)).toHaveLength(3);
  });

  test("part-level atoms narrow when present, never starve when absent", () => {
    const rows = [
      chunkRow({ id: "ch-q", atom_number: "q9" }),
      chunkRow({ id: "ch-b", atom_number: "9-b" }),
    ];
    const refined = matchQuestion(rows as never, 9, "9-b");
    expect(refined).toHaveLength(1);
    expect(refined[0]!.id).toBe("ch-b");
    // question-level fallback when the document carries no part atoms
    const fallback = matchQuestion(
      [chunkRow({ id: "ch-q", atom_number: "q9" })] as never,
      9,
      "9-b",
    );
    expect(fallback).toHaveLength(1);
    expect(fallback[0]!.id).toBe("ch-q");
  });

  test("content markers: prose, header, table — but never the Total footer", () => {
    expect(contentMarks("At the start: question 10 asks about rates.", 10)).toBe(true);
    expect(contentMarks("10 (a) Define electrolysis.", 10)).toBe(true);
    expect(contentMarks("10 | (a) | one mark", 10)).toBe(true);
    expect(contentMarks("Total for Question 10 = 4 marks", 10)).toBe(false);
    expect(contentMarks("question 11 is next", 10)).toBe(false);
    expect(contentMarks(null, 10)).toBe(false);
  });

  test("content fallback only when no atoms exist", () => {
    const rows = [
      chunkRow({ id: "ch-1", atom_number: null, content: "Total for Question 10 = 4" }),
      chunkRow({ id: "ch-2", atom_number: null, content: "Question 10 begins here." }),
    ];
    const picked = matchQuestion(rows as never, 10, null);
    expect(picked).toHaveLength(1);
    expect(picked[0]!.id).toBe("ch-2");
  });
});

// ── the resolver flow (:183-234) over fakeSql ───────────────────────────────

function resolver(responses: Record<string, Responder>) {
  return buildPaperQuestionResolver(fakeSql(responses));
}

const subjects = { "from subjects s": [{ code: "4CH1" }] };

describe("resolveWithVerdict — the verdict laws", () => {
  test("not a paper ask: blank query / no scope → identityParsed=false", async () => {
    const r = resolver({});
    expect(await r("   ", SCOPE)).toEqual({ items: [], identityParsed: false, identityLabel: null });
    expect(await r("question 10 june 2019", null as never)).toEqual({
      items: [],
      identityParsed: false,
      identityLabel: null,
    });
  });

  test("parse-defect ask → notPaperAsk (the unmodified path serves)", async () => {
    const r = resolver(subjects);
    const out = await r("what is the boiling point of water", SCOPE);
    expect(out).toEqual({ items: [], identityParsed: false, identityLabel: null });
  });

  test("bank tier serves a single VALIDATED paper's question chunks", async () => {
    const r = resolver({
      ...subjects,
      "from exam_papers ep": [paperRow()],
      "from questions q": [{ id: "qq-1", external_ref: "q10-abc", stem: "s", marks: 4, question_type: "MCQ", command_word: "State" }],
      "where document_id =": [docRow({ id: "row-qp", document_id: "doc-qp-1", kind: "QUESTION_PAPER", validation_state: "SUGGESTED" })],
      "from document_chunks where document_row_id": [
        chunkRow({ id: "ch-1", atom_number: "q9" }),
        chunkRow({ id: "ch-2", atom_number: "q10", content: "Question 10 stem text." }),
        chunkRow({ id: "ch-3", atom_number: "q10", content: "Question 10 continued." }),
      ],
    });
    const out = await r("explain question 10 from june 2019 paper 2", SCOPE);
    expect(out.identityParsed).toBe(true);
    expect(out.identityLabel).toBe("question 10 from the June 2019 paper 2");
    expect(out.items).toHaveLength(2);
    // provenance: deterministic bind pins retrievalScore 1.0 + the resolver tag
    expect(out.items[0]!.retrievalScore).toBe(1.0);
    expect(out.items[0]!.documentId).toBe("doc-qp-1");
    expect(out.items[0]!.source).toBe("QUESTION_PAPER");
    // the SUGGESTED document row did NOT block (paper-VALIDATED branch 1)
  });

  test("bank MS chunks pin only on mark-scheme-seeking asks", async () => {
    const base = {
      ...subjects,
      "from exam_papers ep": [
        paperRow({
          mark_scheme_document_id: "doc-ms-1",
          question_paper_document_id: null,
        }),
      ],
      "from questions q": [{ id: "qq-1", external_ref: "q10-abc", stem: "s", marks: 4, question_type: "MCQ", command_word: "State" }],
      "where document_id =": [docRow({ id: "row-ms", document_id: "doc-ms-1", kind: "MARK_SCHEME" })],
      "from document_chunks where document_row_id": [chunkRow({ id: "ch-ms", atom_number: "q10" })],
    };
    const seeking = await resolver(base)("the answer of question 10 june 2019 paper 2", SCOPE);
    expect(seeking.items).toHaveLength(1);
    expect(seeking.items[0]!.source).toBe("MARK_SCHEME");
    // non-seeking: bank tier pins NO MS chunks (no non-seeking MS cap exists);
    // the QP probe ("what was") is what makes an ask non-seeking (default true)
    const explaining = await resolver(base)("what was question 10 june 2019 paper 2 about", SCOPE);
    expect(explaining.items).toHaveLength(0);
  });

  test("SUGGESTED bank rows never serve — and ambiguity does NOT disarm the guard", async () => {
    const r = resolver({
      ...subjects,
      "from exam_papers ep": [
        paperRow({ id: "p1", validation_state: "SUGGESTED" }),
        paperRow({ id: "p2", validation_state: "SUGGESTED" }),
      ],
      "from questions q": [],
    });
    const out = await r("explain question 10 from june 2019 paper 2", SCOPE);
    // the 09-27 G1 shape: the identity parsed, nothing VALIDATED bound it —
    // the fail-open guard fires (never a generic-retrieval fallback)
    expect(out).toEqual({
      items: [],
      identityParsed: true,
      identityLabel: "question 10 from the June 2019 paper 2",
    });
  });

  test("card tier pins VALIDATED card chunks by the V33 file name", async () => {
    const r = resolver({
      ...subjects,
      "from exam_papers ep": [],
      "where file_name =": [
        docRow({
          id: "card-row",
          document_id: "doc-card",
          kind: "EXTERNAL_QUESTIONS",
          validation_state: "VALIDATED",
          file_name: "qcard-4CH1-2C-JUN-2019.txt",
        }),
      ],
      "from document_chunks where document_row_id": [
        chunkRow({ id: "card-ch", atom_number: "q10", content: "Q10 markers: 4" }),
      ],
    });
    const out = await r("explain question 10 from june 2019 paper 2", SCOPE);
    expect(out.identityParsed).toBe(true);
    expect(out.items).toHaveLength(1);
    expect(out.items[0]!.documentId).toBe("doc-card");
    expect(out.items[0]!.source).toBe("CARD");
  });

  test("card tier skips SUGGESTED cards and unknown units stay honest", async () => {
    const r = resolver({
      ...subjects,
      "from exam_papers ep": [],
      "where file_name =": [
        docRow({
          id: "card-row",
          document_id: "doc-card",
          kind: "EXTERNAL_QUESTIONS",
          validation_state: "SUGGESTED",
        }),
      ],
    });
    const out = await r("explain question 10 from june 2019 paper 2", SCOPE);
    expect(out.items).toHaveLength(0);
    expect(out.identityParsed).toBe(true); // the guard still fires
  });

  test("store tier: only the VALIDATED top version pins; QP precedes MS", async () => {
    const qp = docRow({ id: "store-qp", document_id: "d-qp", kind: "QUESTION_PAPER", validation_state: "VALIDATED", doc_version: 2 });
    const ms = docRow({ id: "store-ms", document_id: "d-ms", kind: "MARK_SCHEME", validation_state: "VALIDATED", doc_version: 1 });
    const r = resolver({
      ...subjects,
      "from exam_papers ep": [],
      "from document_chunks where series =": [
        { document_row_id: "store-qp", paper_code: "4CH1/2C" },
        { document_row_id: "store-ms", paper_code: "4CH1/2C" },
      ],
      "from documents where id =": (params: unknown[]) =>
        params[0] === "store-qp" ? [qp] : [ms],
      "where document_id =": (params: unknown[]) =>
        params[0] === "d-qp" ? [qp] : [ms],
      "from document_chunks where document_row_id": (params: unknown[]) =>
        params[0] === "store-qp"
          ? [chunkRow({ id: "qp-ch", atom_number: "q10", content: "stem" })]
          : [chunkRow({ id: "ms-ch", atom_number: "q10", content: "answer" })],
    });
    const out = await r("give me the answer of question 10 june 2019 paper 2", SCOPE);
    expect(out.items.map((i) => i.source)).toEqual(["QUESTION_PAPER", "MARK_SCHEME"]);
    expect(out.items.every((i) => i.retrievalScore === 1.0)).toBe(true);
  });

  test("store tier: a superseded version row never pins", async () => {
    const r = resolver({
      ...subjects,
      "from exam_papers ep": [],
      "from document_chunks where series =": [{ document_row_id: "old-row", paper_code: "4CH1/2C" }],
      "from documents where id =": [
        docRow({ id: "old-row", document_id: "d-qp", doc_version: 1, validation_state: "VALIDATED" }),
      ],
      "where document_id =": [
        docRow({ id: "new-row", document_id: "d-qp", doc_version: 2, validation_state: "VALIDATED" }),
      ],
    });
    const out = await r("explain question 10 from june 2019 paper 2", SCOPE);
    expect(out.items).toHaveLength(0);
    expect(out.identityParsed).toBe(true);
  });

  test("store tier failure keeps the card-tier evidence (fail local, honest)", async () => {
    const fn = (async (strings: TemplateStringsArray) => {
      const text = strings.join("?").replace(/\s+/g, " ").trim();
      if (text.includes("from documents where id =")) {
        throw new Error("store unavailable");
      }
      if (text.includes("from document_chunks where series =")) {
        throw new Error("store unavailable");
      }
      if (text.includes("where file_name =")) {
        return [
          docRow({
            id: "card-row",
            document_id: "doc-card",
            kind: "EXTERNAL_QUESTIONS",
            validation_state: "VALIDATED",
            file_name: "qcard-4CH1-2C-JUN-2019.txt",
          }),
        ];
      }
      if (text.includes("from document_chunks where document_row_id")) {
        return [chunkRow({ id: "card-ch", atom_number: "q10" })];
      }
      if (text.includes("from exam_papers ep")) return [];
      if (text.includes("from subjects s")) return [{ code: "4CH1" }];
      return [];
    }) as unknown as SqlFn;
    const r = buildPaperQuestionResolver(fn);
    const out = await r("explain question 10 from june 2019 paper 2", SCOPE);
    expect(out.items).toHaveLength(1);
    expect(out.items[0]!.source).toBe("CARD");
    expect(out.identityParsed).toBe(true);
  });

  test("L3 recovery: a fetch failure under a COMPLETE identity keeps the guard armed", async () => {
    const fn = (async () => {
      throw new Error("db down");
    }) as unknown as SqlFn;
    const r = buildPaperQuestionResolver(fn);
    const out = await r("explain question 10 from june 2019 paper 2", SCOPE);
    expect(out).toEqual({
      items: [],
      identityParsed: true,
      identityLabel: "question 10 from the June 2019 paper 2",
    });
  });

  test("L3 legacy fallback: a fetch failure WITHOUT a complete identity is not a paper ask", async () => {
    const fn = (async () => {
      throw new Error("db down");
    }) as unknown as SqlFn;
    const r = buildPaperQuestionResolver(fn);
    const out = await r("what is electrolysis", SCOPE);
    expect(out).toEqual({ items: [], identityParsed: false, identityLabel: null });
  });

  test("mid-flight failure after a parsed identity NEVER downgrades the verdict", async () => {
    const fn = (async (strings: TemplateStringsArray) => {
      const text = strings.join("?").replace(/\s+/g, " ").trim();
      if (text.includes("from exam_papers ep")) return []; // bank resolves, binds nothing
      if (text.includes("where file_name =")) throw new Error("card read failed");
      if (text.includes("from subjects s")) return [{ code: "4CH1" }];
      return [];
    }) as unknown as SqlFn;
    const r = buildPaperQuestionResolver(fn);
    const out = await r("explain question 10 from june 2019 paper 2", SCOPE);
    expect(out).toEqual({
      items: [],
      identityParsed: true,
      identityLabel: "question 10 from the June 2019 paper 2",
    });
  });

  test("mid-flight failure WITHOUT a parsed identity → notPaperAsk (never gate on unknown)", async () => {
    const fn = (async (strings: TemplateStringsArray) => {
      const text = strings.join("?").replace(/\s+/g, " ").trim();
      if (text.includes("where file_name =")) throw new Error("card read failed");
      if (text.includes("from subjects s")) return [{ code: "4CH1" }];
      return [];
    }) as unknown as SqlFn;
    const r = buildPaperQuestionResolver(fn);
    // "the 2C paper june 2019" parses a unit but no question number —
    // identityParsed stays false
    const out = await r("the 2C paper june 2019 exam", SCOPE);
    expect(out).toEqual({ items: [], identityParsed: false, identityLabel: null });
  });
});

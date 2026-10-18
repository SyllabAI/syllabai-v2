/**
 * Run-013 pins — the session paper pin (trace 1a14e30a57a96385 "Proceed",
 * the 1a14dbf9ab8d7eb1 diagnosis defects (1)/(2)/(4)) and the honest
 * truncation disclosure law. The pin is ADVISORY UI state: it anchors
 * retrieval only when the ask names no complete paper identity of its own,
 * only VALIDATED in-scope papers resolve, and any failure degrades to the
 * unpinned ask. The truncation law discloses a token-cap finish on the
 * wire (blocking + streaming) — the text itself is never touched.
 */
import { describe, expect, test } from "bun:test";
import { prepare, isTruncationFinish, karagAsk, TUTOR_PIN_FILLER_CAP, type KaragDeps } from "../../src/services/tutor/karag";
import {
  buildPaperPinResolver,
  paperPinLabel,
} from "../../src/services/tutor/paper-question";
import { evidenceFromChunk, type EvidenceItem } from "../../src/services/tutor/evidence";
import { userPrompt } from "../../src/services/tutor/prompt";
import { buildTutorModule } from "../../src/services/tutor";
import type { SqlFn } from "../../src/services/tutor/sql";
import type { Clock } from "../../src/services/tutor/session-store";

// ── fakes ────────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;
function fakeSql(responses: Record<string, Row[]>) {
  const fn = (async (strings: TemplateStringsArray, ...params: unknown[]) => {
    const text = strings.join("?");
    void params;
    for (const key of Object.keys(responses)) {
      if (text.includes(key)) return responses[key];
    }
    return [];
  }) as unknown as SqlFn;
  return fn;
}

function failingSql(): SqlFn {
  return (async () => {
    throw new Error("db down");
  }) as unknown as SqlFn;
}

/** A pin-aware fake: evaluates the pin gate's own predicates (id match,
 *  VALIDATED state, curriculum-version match via the row's `cv` field) —
 *  the real Postgres enforces them in SQL; the fake mirrors them so the
 *  test proves the resolver honours an EMPTY gate result. */
function pinGateSql(rows: Row[]): SqlFn {
  return (async (strings: TemplateStringsArray, ...params: unknown[]) => {
    const text = strings.join("?");
    if (text.includes("from exam_papers ep")) {
      const [paperId, cvId] = params as string[];
      return rows.filter(
        (r) => r.id === paperId && r.validation_state === "VALIDATED" && r.cv === cvId,
      );
    }
    if (text.includes("from documents")) return QP_DOC_ROW;
    if (text.includes("from document_chunks")) return QP_CHUNKS;
    return [];
  }) as unknown as SqlFn;
}

const fixedClock: Clock = { now: () => new Date("2026-10-18T00:00:00Z") };

const emptyGraph = {
  async structureNodes() {
    return [];
  },
  async prerequisiteChains() {
    return new Map();
  },
  async misconceptionsForTopics() {
    return new Map();
  },
};

const scopes = {
  async resolveActive() {
    return { curriculumVersionId: "cv", code: "4CH1", surface: new Set<string>() };
  },
  async resolveForCourse() {
    return null;
  },
};

const chunkItem = (
  row: string,
  page: number | null,
  chunkId: string,
  kind: string,
  cosine = 0.9,
): EvidenceItem =>
  evidenceFromChunk({
    documentRowId: row,
    documentId: "doc-" + row,
    documentVersion: 1,
    chunkId,
    chunkIndex: 0,
    kind,
    content: `content-${chunkId}`,
    pageStart: page,
    pageEnd: null,
    elementIds: [],
    embeddingModel: "test",
    cosine,
  });

const nodeItem = (nodeId: string, title: string): EvidenceItem =>
  ({
    source: "KNOWLEDGE_NODE",
    content: title,
    documentRowId: null,
    documentId: null,
    documentVersion: null,
    chunkId: null,
    chunkIndex: null,
    nodeId,
    nodeCode: "4CH1-T" + nodeId,
    nodeType: "TOPIC",
    nodeTitle: title,
    pageStart: null,
    pageEnd: null,
    elementIds: [],
    topicIds: [nodeId],
    retrievalScore: 0.9,
    fusedScore: 0,
    rerankScore: null,
  }) as EvidenceItem;

// ── the pin resolver over fakeSql ────────────────────────────────────────────

const VALIDATED_PAPER_ROW: Row[] = [
  {
    id: "paper-2c",
    cv: "cv",
    paper_code: "4CH0/2C",
    session_label: "Summer 2016",
    series: "JUN",
    year: 2016,
    validation_state: "VALIDATED",
    question_paper_document_id: "docid-qp",
    mark_scheme_document_id: "docid-ms",
  },
];

const QP_DOC_ROW: Row[] = [
  { id: "row-qp", document_id: "docid-qp", doc_version: 1, kind: "QUESTION_PAPER", validation_state: "SUGGESTED", file_name: null },
];
const MS_DOC_ROW: Row[] = [
  { id: "row-ms", document_id: "docid-ms", doc_version: 1, kind: "MARK_SCHEME", validation_state: "SUGGESTED", file_name: null },
];
const QP_CHUNKS: Row[] = [
  { id: "c0", chunk_index: 0, content: "cover", page_start: 1, page_end: 1, element_ids: [], atom_number: null },
  { id: "c1", chunk_index: 1, content: "Q1 hydrated copper sulfate", page_start: 2, page_end: 3, element_ids: [], atom_number: "1" },
  { id: "c2", chunk_index: 2, content: "Q2 part", page_start: 4, page_end: 4, element_ids: [], atom_number: "2" },
];
const Q1_CHUNKS: Row[] = [
  { id: "c1", chunk_index: 1, content: "Q1 hydrated copper sulfate", page_start: 2, page_end: 3, element_ids: [], atom_number: "1" },
];
const Q1_MS_CHUNKS: Row[] = [
  { id: "m1", chunk_index: 0, content: "MS 1(a) accept…", page_start: 2, page_end: 2, element_ids: [], atom_number: "1-a" },
];

function pinSql(extra: Record<string, Row[]> = {}): SqlFn {
  return fakeSql({
    "from exam_papers ep": VALIDATED_PAPER_ROW,
    "from documents": QP_DOC_ROW, // findTopByDocumentId (keyed per document_id — fakes match first key)
    "from document_chunks": QP_CHUNKS,
    ...extra,
  });
}

describe("run-013 — the session paper pin resolver", () => {
  test("a VALIDATED in-scope paper pins the asked question's QP chunks (msSeeking default adds MS)", async () => {
    const sql = fakeSql({
      "from exam_papers ep": VALIDATED_PAPER_ROW,
      "from documents": QP_DOC_ROW,
      "from document_chunks": [...Q1_CHUNKS, ...Q1_MS_CHUNKS],
    });
    const pin = await buildPaperPinResolver(sql)("paper-2c", "explain question 1", {
      curriculumVersionId: "cv",
    });
    expect(pin).not.toBeNull();
    expect(pin!.paperCode).toBe("4CH0/2C");
    expect(pin!.validationState).toBe("VALIDATED");
    // QP pin + MS pin (msSeeking defaults true; the doc fake answers both
    // reads with the same rows — the chunk ids prove the reads happened)
    expect(pin!.items.length).toBeGreaterThanOrEqual(1);
    expect(pin!.items.every((i) => i.source === "QUESTION_PAPER" || i.source === "MARK_SCHEME")).toBe(true);
  });

  test("no question-number ref pins the paper's OPENING QP chunks by chunk_index (the quiz-me anchor)", async () => {
    const pin = await buildPaperPinResolver(pinSql())("paper-2c", "quiz me on this", {
      curriculumVersionId: "cv",
    });
    expect(pin).not.toBeNull();
    expect(pin!.items.map((i) => i.chunkId)).toEqual(["c0", "c1"]); // first 2 by chunk_index
    expect(paperPinLabel(pin!)).toBe("4CH0/2C Summer 2016");
  });

  test("the gate holds: out-of-scope, REJECTED and unknown ids never pin", async () => {
    // pinGateSql evaluates the gate's own predicates — a REJECTED row and a
    // row on another curriculum version both resolve empty, like real SQL
    const rows: Row[] = [
      { ...VALIDATED_PAPER_ROW[0] },
      { ...VALIDATED_PAPER_ROW[0], id: "paper-rej", validation_state: "REJECTED" },
      { ...VALIDATED_PAPER_ROW[0], id: "paper-othercv", cv: "cv-other" },
    ];
    const sql = pinGateSql(rows);
    expect(await buildPaperPinResolver(sql)("paper-2c", "explain question 1", { curriculumVersionId: "cv" })).not.toBeNull();
    expect(await buildPaperPinResolver(sql)("paper-rej", "explain question 1", { curriculumVersionId: "cv" })).toBeNull();
    expect(await buildPaperPinResolver(sql)("paper-othercv", "explain question 1", { curriculumVersionId: "cv" })).toBeNull();
    expect(await buildPaperPinResolver(sql)("paper-unknown", "explain question 1", { curriculumVersionId: "cv" })).toBeNull();
    expect(await buildPaperPinResolver(pinGateSql(rows))("  ", "explain question 1", { curriculumVersionId: "cv" })).toBeNull();
  });

  test("a pin-machinery failure degrades honestly to null — never gates the ask", async () => {
    expect(await buildPaperPinResolver(failingSql())("paper-2c", "explain question 1", { curriculumVersionId: "cv" })).toBeNull();
  });
});

// ── the pin tier inside prepare() ────────────────────────────────────────────

describe("run-013 — the pin tier in the ka-rag prepare()", () => {
  const baseDeps = (over: Partial<KaragDeps>): KaragDeps =>
    ({
      sql: fakeSql({}),
      clock: fixedClock,
      kgGraph: emptyGraph,
      scopes,
      vectorRetriever: async () => [],
      paperQuestionResolver: async () => ({ items: [], identityParsed: false, identityLabel: null }),
      generator: { generate: async () => ({ answer: "", model: "m", provider: "p", finishReason: null }), streamGenerate: async function* () {} },
      telemetry: () => {},
      ...over,
    }) as KaragDeps;

  test("pin chunks enter the LEAD pool (before RRF filler) and arm the filler cap", async () => {
    const pinItems = [chunkItem("rowPin", 2, "pin1", "QUESTION_PAPER")];
    const vector = [
      nodeItem("n1", "Reactivity"),
      chunkItem("rowD", 1, "d1", "EXTERNAL_NOTES", 0.6),
      chunkItem("rowE", 2, "d2", "EXTERNAL_NOTES", 0.5),
    ];
    let pinCalled = 0;
    const deps = baseDeps({
      vectorRetriever: async () => vector,
      paperPin: async () => {
        pinCalled++;
        return {
          paperId: "paper-2c",
          paperCode: "4CH0/2C",
          sessionLabel: "Summer 2016",
          series: "JUN",
          year: 2016,
          validationState: "VALIDATED",
          items: pinItems,
        };
      },
    });
    const prep = await prepare(deps, "l1", "quiz me on this", [], null, "paper-2c");
    expect(pinCalled).toBe(1);
    expect(prep.evidence.map((i) => i.chunkId ?? i.nodeId)).toEqual(["pin1", "n1", "d1"]);
    expect(prep.evidence.length).toBe(1 + TUTOR_PIN_FILLER_CAP);
    expect(prep.activePaperLabel).toBe("4CH0/2C Summer 2016");
  });

  test("a NAMED paper identity wins: the resolver's verdict stands and the pin never fires", async () => {
    const resolverPins = [chunkItem("rowNamed", 5, "named1", "QUESTION_PAPER")];
    let pinCalled = 0;
    const deps = baseDeps({
      paperQuestionResolver: async () => ({
        items: resolverPins,
        identityParsed: true,
        identityLabel: "question 3 from the June 2019 paper 2",
      }),
      paperPin: async () => {
        pinCalled++;
        return null;
      },
    });
    const prep = await prepare(
      deps,
      "l1",
      "explain question 3 from june 2019 paper 2",
      [],
      null,
      "paper-2c",
    );
    expect(pinCalled).toBe(0);
    expect(prep.evidence.map((i) => i.chunkId)).toEqual(["named1"]);
    expect(prep.identityParsed).toBe(true);
    expect(prep.activePaperLabel).toBeNull();
  });

  test("no pinId / no port / resolving-null all degrade to the unpinned ask byte-identically", async () => {
    const depsNoPin = baseDeps({});
    const unpinned = await prepare(depsNoPin, "l1", "explain question 1", [], null, "paper-2c");
    expect(unpinned.activePaperLabel).toBeNull();
    expect(unpinned.evidence).toEqual([]);
    let pinCalled = 0;
    const depsNullPin = baseDeps({
      paperPin: async () => {
        pinCalled++;
        return null;
      },
    });
    const nullPin = await prepare(depsNullPin, "l1", "explain question 1", [], null, "paper-2c");
    expect(pinCalled).toBe(1);
    expect(nullPin.evidence).toEqual([]);
    const depsThrowingPin = baseDeps({
      paperPin: async () => {
        throw new Error("boom");
      },
    });
    const thrown = await prepare(depsThrowingPin, "l1", "explain question 1", [], null, "paper-2c");
    expect(thrown.evidence).toEqual([]);
  });
});

// ── the honest truncation disclosure law ─────────────────────────────────────

describe("run-013 — the truncation disclosure", () => {
  test("isTruncationFinish: the provider token-cap vocabulary, normalized", () => {
    expect(isTruncationFinish("length")).toBe(true);
    expect(isTruncationFinish("max_tokens")).toBe(true);
    expect(isTruncationFinish(" LENGTH ")).toBe(true);
    expect(isTruncationFinish("stop")).toBe(false);
    expect(isTruncationFinish(null)).toBe(false);
    expect(isTruncationFinish(undefined)).toBe(false);
    expect(isTruncationFinish("")).toBe(false);
  });

  test("userPrompt renders the ACTIVE PAPER CONTEXT block only when pinned", () => {
    const context = {
      learnerBrief: "Learner state: nothing.",
      memoryBrief: null,
      knowledgeBrief: "Curriculum context: no topics matched this question.",
      evidence: [],
      interventionPlan: { type: "EXPLANATION", rationale: "r", actions: ["a"] },
    };
    const withPin = userPrompt("quiz me on this", [], { ...context, activePaperLabel: "4CH0/2C Summer 2016" }, "NONCE01");
    expect(withPin).toContain("ACTIVE PAPER CONTEXT:");
    expect(withPin).toContain('"4CH0/2C Summer 2016"');
    const withoutPin = userPrompt("quiz me on this", [], context, "NONCE01");
    expect(withoutPin).not.toContain("ACTIVE PAPER CONTEXT:");
  });

  test("blocking ask: finishReason length discloses truncated=true; refusals stay false", async () => {
    const deps: KaragDeps = {
      sql: fakeSql({}),
      clock: fixedClock,
      kgGraph: emptyGraph,
      scopes,
      // query-aware: an unanswerable ask honestly finds nothing (the refusal)
      vectorRetriever: async (q) =>
        q.includes("xyzzy") ? [] : [chunkItem("rowA", 1, "c1", "QUESTION_PAPER")],
      paperQuestionResolver: async () => ({ items: [], identityParsed: false, identityLabel: null }),
      generator: {
        generate: async () => ({ answer: "part answer…", model: "m", provider: "p", finishReason: "length" }),
        streamGenerate: async function* () {},
      },
      telemetry: () => {},
    };
    const result = await karagAsk(deps, "l1", "explain the rates topic", [], null, null);
    expect(result.truncated).toBe(true);
    const refusal = await karagAsk(deps, "l1", "unanswerable xyzzy", [], null, null);
    expect(refusal.truncated).toBe(false);
    expect(refusal.refused).toBe(true);
  });

  test("streaming ask: the finish reason rides the last delta; the completed event discloses", async () => {
    const deps: KaragDeps = {
      sql: fakeSql({}),
      clock: fixedClock,
      kgGraph: emptyGraph,
      scopes,
      vectorRetriever: async () => [chunkItem("rowA", 1, "c1", "QUESTION_PAPER")],
      paperQuestionResolver: async () => ({ items: [], identityParsed: false, identityLabel: null }),
      generator: {
        generate: async () => ({ answer: "", model: "m", provider: "p", finishReason: null }),
        async *streamGenerate() {
          yield { answer: "question 1: ", model: "m", provider: "p", finishReason: null };
          yield { answer: "what is…", model: null, provider: null, finishReason: "max_tokens" };
        },
      },
      telemetry: () => {},
    };
    const events = [];
    for await (const e of (await import("../../src/services/tutor/karag")).karagAskStream(deps, "l1", "quiz me on this", [], null, null)) {
      events.push(e);
    }
    const completed = events.at(-1) as { kind: string; truncated?: boolean };
    expect(completed.kind).toBe("completed");
    expect(completed.truncated).toBe(true);
  });

  test("the module wires the pin through ask/askStream (buildTutorModule seam)", async () => {
    let seenPinId: string | null | undefined;
    const mod = buildTutorModule(fakeSql({}), fixedClock, {
      scopes,
      vectorRetriever: async () => [],
      paperQuestionResolver: async () => ({ items: [], identityParsed: false, identityLabel: null }),
      paperPin: async (paperId: string) => {
        seenPinId = paperId;
        return null;
      },
      generator: {
        generate: async () => ({ answer: "", model: "m", provider: "p", finishReason: null }),
        streamGenerate: async function* () {},
      },
      telemetry: () => {},
    } as never);
    await mod.ask("l1", "explain question 1", [], null, null, "paper-2c");
    expect(seenPinId).toBe("paper-2c");
    for await (const e of mod.askStream("l1", "explain question 1", [], null, null, "paper-9")) {
      void e;
      break;
    }
    expect(seenPinId).toBe("paper-9");
  });
});

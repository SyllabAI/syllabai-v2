/**
 * Paper figures — lane #3 pins (trace 1a14536e97f41425). The resolver's
 * deterministic laws over REAL corpus shapes (the GLM draft figureRefs +
 * the canonical figure elements as measured by scripts/r0_figures_probe.mjs):
 *
 *   - attribution = the PARSER'S OWN (draft refs), page = the canonical
 *     element join (elementId → page_number) — zero inference;
 *   - no bridge record → the honest empty (46 of 95 papers, June 2019
 *     4CH1/2C among them — nothing guessed);
 *   - FAIL-OPEN: garbage draft/canonical JSON degrades to fewer figures,
 *     never a throw;
 *   - dedup (elementId, then sourceName), question-level before part-level,
 *     parser order, per-question cap;
 *   - a ref with neither page nor sourceName is dropped (nothing honest);
 *   - external_ref → question-number join ("q06-…" → "6").
 */
import { describe, expect, test } from "bun:test";
import type { SqlFn } from "../../src/services/tutor/sql";
import {
  figuresByQuestionNumber,
  MAX_FIGURES_PER_QUESTION,
  questionNumberOf,
} from "../../src/services/tutor/paper-figures";

// ── the same recording fakeSql law as bank-bands.test.ts ────────────────────

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
        const hit = responses[key]!;
        return typeof hit === "function" ? hit(params) : hit;
      }
    }
    return [];
  }) as unknown as SqlFn;
  return { sql: fn };
}

// ── fixtures: real corpus shapes (probe 2026-10-16) ─────────────────────────

const PAPER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const QP_ROW = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"; // the bridge's parse-generation row (REJECTED/degenerate in the real corpus)
const SERVE_ROW = "cccccccc-cccc-cccc-cccc-cccccccccccc"; // the SERVING doc row — the citable address

const draftOf = (questions: Row[]): Row => ({ questions });

const bridgeResponse = (draft: unknown, qpRowId: string | null = QP_ROW): Row[] =>
  draft === null
    ? []
    : [{ qp_document_row_id: qpRowId, qp_draft: typeof draft === "string" ? draft : JSON.stringify(draft) }];

const canonicalResponse = (figures: Row[] | string): Responder =>
  (params: unknown[]) =>
    // the SERVING-row lookup is keyed by the PAPER id
    params[0] === PAPER
      ? [{ id: SERVE_ROW, cj: typeof figures === "string" ? figures : JSON.stringify({ figures }) }]
      : [];

const ref = (elementId: string | null, over: Row = {}): Row => ({
  elementId,
  sourceName: `assets/crop_${elementId ?? "x"}.png`,
  format: "png",
  url: `assets/crop_${elementId ?? "x"}.png`,
  availability: "available",
  assetId: `img:${elementId ?? "x"}`,
  sha256: (elementId ?? "x").repeat(4),
  mimeType: "image/jpeg",
  width: 338,
  height: 337,
  formatMismatch: true,
  ...over,
});

const canonFig = (elementId: string, page: number): Row => ({
  element_id: elementId,
  page_number: page,
  text: `assets/crop_${elementId}.png`,
  format: "png",
  confidence: 1,
  source_name: `assets/crop_${elementId}.png`,
  alt: "OCR图片",
  bounding_box: null,
  element_type: "figure",
  reading_order: 18,
  source_engine: "glm-ocr-markdown",
  source_engine_version: "1.2.0",
});

// ── questionNumberOf ─────────────────────────────────────────────────────────

describe("questionNumberOf — the external_ref join", () => {
  test("q06-cf68cf74 → 6; q1 → 1; q010 → 10", () => {
    expect(questionNumberOf("q06-cf68cf74")).toBe("6");
    expect(questionNumberOf("q1-x")).toBe("1");
    expect(questionNumberOf("Q010-y")).toBe("10");
  });
  test("null/numberless refs join to nothing (the row serves no figures)", () => {
    expect(questionNumberOf(null)).toBe(null);
    expect(questionNumberOf("")).toBe(null);
    expect(questionNumberOf("sme-eq-abc")).toBe(null);
  });
});

// ── the resolver laws ────────────────────────────────────────────────────────

describe("figuresByQuestionNumber — the lane #3 projection", () => {
  test("the parser's own attribution, SERVING-row addressed: question-level + part-level refs, parser order", async () => {
    const draft = draftOf([
      {
        number: 2,
        figures: [ref("e000038"), ref("e000041")],
        parts: [{ label: "a", figures: [ref("e000044")] }, { label: "b", figures: [] }],
      },
      { number: 3, figures: [], parts: [] },
    ]);
    const { sql } = fakeSql({
      "select qp_document_row_id": bridgeResponse(draft),
      "from exam_papers ep where ep.id": canonicalResponse([
        canonFig("e000038", 1),
        canonFig("e000041", 2),
        canonFig("e000044", 2),
      ]),
    });
    const map = await figuresByQuestionNumber(sql, PAPER);
    expect(map.get("2")).toHaveLength(3);
    expect(map.get("2")!.map((f) => f.page)).toEqual([1, 2, 2]);
    expect(map.get("2")![0]).toEqual({
      documentRowId: SERVE_ROW, // the citable serving row — never the bridge row
      page: 1,
      sourceName: "assets/crop_e000038.png",
      format: "png",
      width: 338,
      height: 337,
      availability: "available",
    });
    // a question with no refs maps to nothing (never a phantom [])
    expect(map.has("3")).toBe(false);
  });

  test("no bridge record → the honest empty (the 46 pre-figureRefs papers)", async () => {
    const { sql } = fakeSql({ "select qp_document_row_id": [] });
    const map = await figuresByQuestionNumber(sql, PAPER);
    expect(map.size).toBe(0);
  });

  test("FAIL-OPEN: a garbage draft serves no figures and never throws", async () => {
    const { sql } = fakeSql({
      "select qp_document_row_id": bridgeResponse("{not json"),
      "canonical_json::text as cj": canonicalResponse([canonFig("e1", 1)]),
    });
    const map = await figuresByQuestionNumber(sql, PAPER);
    expect(map.size).toBe(0);
  });

  test("FAIL-OPEN: garbage canonical JSON → figures keep page=null, the source-name chip still serves", async () => {
    const draft = draftOf([{ number: 1, figures: [ref("e000038")], parts: [] }]);
    const { sql } = fakeSql({
      "select qp_document_row_id": bridgeResponse(draft),
      "from exam_papers ep where ep.id": canonicalResponse("{{not json"),
    });
    const map = await figuresByQuestionNumber(sql, PAPER);
    expect(map.get("1")!).toHaveLength(1);
    expect(map.get("1")![0]!.page).toBe(null);
    expect(map.get("1")![0]!.documentRowId).toBe(SERVE_ROW);
    expect(map.get("1")![0]!.sourceName).toBe("assets/crop_e000038.png");
  });

  test("ADDRESSING LAW: the bridge row's own (degenerate Markdown-generation) pages are NEVER used", async () => {
    // the measured real-corpus shape: the bridge row carries figures all on
    // page 1 (single-page Markdown generation); the serving doc has no
    // matching elements — the chip must NOT claim page 1. The fake has NO
    // responder keyed to the bridge ROW id: any bridge-row canonical query
    // would resolve [] and poison the expectation — the page law can only
    // pass if the resolver reads the SERVING doc alone.
    const draft = draftOf([{ number: 1, figures: [ref("e1"), ref("e2")], parts: [] }]);
    const { sql } = fakeSql({
      "select qp_document_row_id": bridgeResponse(draft, QP_ROW),
      "from exam_papers ep where ep.id": canonicalResponse([]),
    });
    const map = await figuresByQuestionNumber(sql, PAPER);
    expect(map.get("1")!.every((f) => f.page === null)).toBe(true);
    expect(map.get("1")!.every((f) => f.documentRowId === SERVE_ROW)).toBe(true);
  });

  test("the serving row unresolvable → chips ride as unlinked references (documentRowId null, honest)", async () => {
    const draft = draftOf([{ number: 1, figures: [ref("e1")], parts: [] }]);
    const { sql } = fakeSql({
      "select qp_document_row_id": bridgeResponse(draft),
      "from exam_papers ep where ep.id": (params) =>
        params[0] === PAPER ? [] : [], // no non-REJECTED serving version
    });
    const map = await figuresByQuestionNumber(sql, PAPER);
    expect(map.get("1")!).toHaveLength(1);
    expect(map.get("1")![0]!.documentRowId).toBe(null);
    expect(map.get("1")![0]!.sourceName).toBe("assets/crop_e1.png");
  });

  test("unresolvable element AND no source name → dropped (nothing honest to show)", async () => {
    const draft = draftOf([{ number: 1, figures: [ref("e9", { sourceName: null, url: null })], parts: [] }]);
    const { sql } = fakeSql({
      "select qp_document_row_id": bridgeResponse(draft),
      "from exam_papers ep where ep.id": canonicalResponse([canonFig("e1", 1)]),
    });
    const map = await figuresByQuestionNumber(sql, PAPER);
    expect(map.has("1")).toBe(false);
  });

  test("dedup by elementId, then sourceName; parser order preserved", async () => {
    const draft = draftOf([
      {
        number: 4,
        figures: [
          ref("e1"),
          ref("e1"), // element dup
          ref(null, { elementId: null, sourceName: "assets/crop_x.png", url: "assets/crop_x.png" }),
          ref(null, { elementId: null, sourceName: "assets/crop_x.png", url: "assets/crop_x.png" }), // name dup
          ref("e2"),
        ],
        parts: [],
      },
    ]);
    const { sql } = fakeSql({
      "select qp_document_row_id": bridgeResponse(draft),
      "from exam_papers ep where ep.id": canonicalResponse([canonFig("e1", 3), canonFig("e2", 4)]),
    });
    const map = await figuresByQuestionNumber(sql, PAPER);
    expect(map.get("4")!.map((f) => f.page)).toEqual([3, null, 4]);
  });

  test(`the per-question cap (${MAX_FIGURES_PER_QUESTION}) — a pathological draft loses tail figures, never floods the card`, async () => {
    const refs = Array.from({ length: MAX_FIGURES_PER_QUESTION + 6 }, (_, i) => ref(`e${String(i).padStart(3, "0")}`));
    const draft = draftOf([{ number: 5, figures: refs, parts: [] }]);
    const { sql } = fakeSql({
      "select qp_document_row_id": bridgeResponse(draft),
      "from exam_papers ep where ep.id": canonicalResponse(refs.map((_, i) => canonFig(`e${String(i).padStart(3, "0")}`, i + 1))),
    });
    const map = await figuresByQuestionNumber(sql, PAPER);
    expect(map.get("5")).toHaveLength(MAX_FIGURES_PER_QUESTION);
  });

  test("string-int coercion (width/height/page arrive as numbers of record; strings still coerce)", async () => {
    const draft = draftOf([{ number: 6, figures: [ref("e1", { width: "338", height: "337" })], parts: [] }]);
    const { sql } = fakeSql({
      "select qp_document_row_id": bridgeResponse(draft),
      "from exam_papers ep where ep.id": canonicalResponse([canonFig("e1", 7)]),
    });
    const map = await figuresByQuestionNumber(sql, PAPER);
    expect(map.get("6")![0]!.page).toBe(7);
    expect(map.get("6")![0]!.width).toBe(338);
    expect(map.get("6")![0]!.height).toBe(337);
  });

  test("the unavailable-signed-url availability rides verbatim (provenance, never re-claimed)", async () => {
    const draft = draftOf([{ number: 1, figures: [ref("e1", { availability: "unavailable-signed-url" })], parts: [] }]);
    const { sql } = fakeSql({
      "select qp_document_row_id": bridgeResponse(draft),
      "from exam_papers ep where ep.id": canonicalResponse([canonFig("e1", 2)]),
    });
    const map = await figuresByQuestionNumber(sql, PAPER);
    expect(map.get("1")![0]!.availability).toBe("unavailable-signed-url");
  });
});

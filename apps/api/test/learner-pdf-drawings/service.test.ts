/**
 * PdfDrawings service tests (T-MG-INK-1 run-002) — the §3.3 acceptance
 * pins over REAL services on stubbed sql (the 032 pattern):
 *   (a) schema pin — the doc container {schema:"syllabai-ink/1", shapes[]}
 *       round-trips through load/save (the run-001 container law);
 *   (b) identity pin — UNIQUE(learner, documentRefType, documentRefId):
 *       the drawing is the CALLING learner's only (the JWT posture);
 *   (c) fallback pin — a sourceUrl-keyed external-PDF drawing (null
 *       documentRefId) stores and loads;
 *   (d) revision law — base 0 seeds revision 1; an equal base advances
 *       base+1; an ahead base accepted (LWW); a STALE base conflicts with
 *       ZERO rows written; a lost CAS re-evaluates honestly.
 */
import { describe, expect, test } from "bun:test";
import { PdfDrawings } from "../../src/services/learner-pdf-drawings";
import type { SqlFn } from "../../src/services/learner-pdf-drawings/sql";
import { pdfDrawingLoadSchema, servedPdfDrawingSchema, type InkDoc } from "@syllabai/contracts";

const LEARNER = "aa645313-5930-4381-91ed-caff67a2f836";
const LEARNER2 = "aa645313-5930-4381-91ed-caff67a2f999";
const PAPER = "47000000-0000-4000-8000-000000000001";
const SOURCE = "https://www.mathsgenie.co.uk/resources/1f-jun2025-1ma1.pdf";
const ROW_ID = "57000000-0000-4000-8000-000000000001";

/** The run-001 container shape (the ink-native-ref.js doc law). */
const DOC: InkDoc = {
  schema: "syllabai-ink/1",
  shapes: [{ type: "stroke", page: 1, points: [[0.1, 0.2], [0.3, 0.4]] }],
};
const UPDATED_DOC: InkDoc = {
  schema: "syllabai-ink/1",
  shapes: [
    { type: "stroke", page: 1, points: [[0.1, 0.2]] },
    { type: "text", page: 2, text: "x = 55" },
  ],
};

const row = (over: Partial<Record<string, unknown>> = {}) => ({
  id: ROW_ID,
  document_ref_type: "paper_asset",
  document_ref_id: PAPER,
  source_url: null,
  doc: DOC,
  revision: 1,
  updated_at: "2026-10-30T00:00:00Z",
  ...over,
});

/** The two select forms share the FROM line — one route disambiguates by
 * params (docRef select: [learner, type, uuid]; sourceUrl select:
 * [learner, type, url]). */
const selectRoute = {
  match: /from learner_pdf_drawings/,
  rows: [] as Array<Record<string, unknown>>,
  rowsFor: (params: unknown[]) => {
    if (params[0] !== LEARNER) return []; // learner scoping: exact
    if (params[2] === PAPER) return [row()];
    if (params[2] === SOURCE) return [row({ document_ref_id: null, source_url: SOURCE, revision: 2 })];
    return [];
  },
};

const insertRoute = {
  match: /insert into learner_pdf_drawings/,
  rows: [] as Array<Record<string, unknown>>,
  rowsFor: (params: unknown[]) => [
    row({
      document_ref_id: params[2],
      source_url: params[3],
      doc: JSON.parse(params[4] as string),
      revision: params[5],
      updated_at: "2026-10-30T00:01:00Z",
    }),
  ],
};

const updateRoute = {
  match: /update learner_pdf_drawings/,
  rows: [] as Array<Record<string, unknown>>,
  rowsFor: (params: unknown[]) => [
    // params: 0=doc json, 1=base+1, 2=row id, 3=observed revision (CAS)
    row({ id: params[2], doc: JSON.parse(params[0] as string), revision: params[1], updated_at: "2026-10-30T00:02:00Z" }),
  ],
};

function makeSql(extra: Array<typeof selectRoute> = [], issued?: string[]) {
  const all = [...extra, updateRoute, insertRoute, selectRoute];
  return (async (strings: TemplateStringsArray, ...params: unknown[]) => {
    const text = strings.join(" ? ").replace(/\s+/g, " ").trim();
    issued?.push(text);
    const hit = all.find((r) => r.match.test(text));
    if (!hit) throw new Error("unexpected query: " + text);
    return hit.rowsFor ? hit.rowsFor(params) : hit.rows;
  }) as unknown as SqlFn;
}

const REF = { documentRefType: "paper_asset", documentRefId: PAPER, sourceUrl: null };
const EXT_REF = { documentRefType: "paper_asset", documentRefId: null, sourceUrl: SOURCE };

describe("T-MG-INK-1 run-002 — the §3.3 schema pin", () => {
  test("(a) container round-trip — {schema:'syllabai-ink/1', shapes[]} survives the storage seam (base 0 seeds revision 1)", async () => {
    const issued: string[] = [];
    // fresh document: the select comes back empty, the insert fires
    const drawings = new PdfDrawings(makeSql([{ ...selectRoute, rowsFor: () => [] }], issued));
    const result = await drawings.save(LEARNER, { ref: REF, doc: DOC, revision: 0 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const parsed = servedPdfDrawingSchema.parse(result.drawing);
    expect(parsed.doc).toEqual(DOC); // the container law: schema id + shapes[]
    expect(parsed.revision).toBe(1); // base 0 seeds revision 1 (the DEFAULT law)
    expect(issued.find((t) => /insert into learner_pdf_drawings/.test(t))).toBeDefined();
  });

  test("(b) identity pin — load serves the CALLING learner's row only (honest-empty for another learner)", async () => {
    const drawings = new PdfDrawings(makeSql());
    const own = pdfDrawingLoadSchema.parse(await drawings.load(LEARNER, REF));
    expect(own.drawing).not.toBeNull();
    expect(own.drawing!.documentRefId).toBe(PAPER);
    expect(own.drawing!.sourceUrl).toBeNull();
    const other = pdfDrawingLoadSchema.parse(await drawings.load(LEARNER2, REF));
    expect(other.drawing).toBeNull(); // honest-empty — never another learner's ink
  });

  test("(c) fallback pin — a sourceUrl-keyed external-PDF drawing (null documentRefId) stores and loads", async () => {
    const drawings = new PdfDrawings(makeSql());
    const loaded = pdfDrawingLoadSchema.parse(await drawings.load(LEARNER, EXT_REF));
    expect(loaded.sourceUrl).toBe(SOURCE);
    expect(loaded.documentRefId).toBeNull();
    expect(loaded.drawing!.revision).toBe(2);
    // the fresh external store path: insert with NULL documentRefId
    const issued: string[] = [];
    const fresh = new PdfDrawings(
      makeSql([{ ...selectRoute, rowsFor: (params: unknown[]) => (params[2] === SOURCE ? [] : selectRoute.rowsFor!(params)) }], issued),
    );
    const result = await fresh.save(LEARNER, { ref: EXT_REF, doc: DOC, revision: 0 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.drawing.documentRefId).toBeNull();
    expect(result.drawing.sourceUrl).toBe(SOURCE);
    expect(issued.find((t) => /insert into learner_pdf_drawings/.test(t))).toContain("document_ref_id, source_url");
  });
});

describe("T-MG-INK-1 run-002 — the §3.3 revision law (PUT carries revision — LWW, 409 on stale)", () => {
  test("(d1) equal base advances base+1 — the optimistic accept", async () => {
    const drawings = new PdfDrawings(makeSql([{ ...selectRoute, rowsFor: () => [row({ revision: 3 })] }]));
    const result = await drawings.save(LEARNER, { ref: REF, doc: UPDATED_DOC, revision: 3 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.drawing.revision).toBe(4); // base + 1
    expect(result.drawing.doc).toEqual(UPDATED_DOC);
  });

  test("(d2) ahead base accepted (LWW at the stamp the caller read)", async () => {
    const drawings = new PdfDrawings(makeSql([{ ...selectRoute, rowsFor: () => [row({ revision: 2 })] }]));
    const result = await drawings.save(LEARNER, { ref: REF, doc: UPDATED_DOC, revision: 5 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.drawing.revision).toBe(6);
  });

  test("(d3) STALE base → conflict with ZERO rows written (the 409 half of the law)", async () => {
    const issued: string[] = [];
    const drawings = new PdfDrawings(makeSql([{ ...selectRoute, rowsFor: () => [row({ revision: 3 })] }], issued));
    const result = await drawings.save(LEARNER, { ref: REF, doc: UPDATED_DOC, revision: 2 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.current.revision).toBe(3); // the row to rebase on
    // the stale path writes NOTHING: the select is the only statement
    expect(issued).toHaveLength(1);
    expect(issued[0]).toContain("from learner_pdf_drawings");
  });

  test("(d4) lost CAS → reload once → honest re-evaluation against the winner", async () => {
    const issued: string[] = [];
    let selects = 0;
    const sql = (async (strings: TemplateStringsArray, ...params: unknown[]) => {
      void params;
      const text = strings.join(" ? ").replace(/\s+/g, " ").trim();
      issued.push(text);
      if (/from learner_pdf_drawings/.test(text)) {
        selects += 1;
        return selects === 1 ? [row({ revision: 3 })] : [row({ revision: 9 })]; // the winner
      }
      if (/update learner_pdf_drawings/.test(text)) return []; // the lost CAS
      if (/insert into learner_pdf_drawings/.test(text)) return [row()];
      throw new Error("unexpected query: " + text);
    }) as unknown as SqlFn;
    const drawings = new PdfDrawings(sql);
    const result = await drawings.save(LEARNER, { ref: REF, doc: UPDATED_DOC, revision: 3 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.current.revision).toBe(9);
    expect(issued.filter((t) => /update learner_pdf_drawings/.test(t))).toHaveLength(1); // one CAS attempt, then the honest reload
  });
});

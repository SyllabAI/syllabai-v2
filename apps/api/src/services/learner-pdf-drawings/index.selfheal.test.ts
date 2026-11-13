/**
 * T-HUB-INK-BRK run-003 — the pdf-drawings SELF-HEAL law tests.
 *
 * Live incident of record (2026-11-13, api.syllab-ai.com prod): a stored
 * row whose fields fail servedPdfDrawingSchema made the (learner,
 * document) pair UNRECOVERABLE — load() threw (GET 500) AND every save()
 * path touching the stored row threw (the stale-base 409 envelope), so
 * no PUT could ever overwrite the poison. Proven live: GET 500 + PUT 500
 * on the wedged row while a nonexistent row served 200 honest-empty.
 *
 * The law pinned here: a parse-failing row serves the EMPTY container at
 * the PRESERVED revision (the shapes are honestly gone, the revision
 * truth is kept), so the client's next equal-or-ahead write overwrites
 * the poison and the pair heals itself. Valid rows serve verbatim.
 */
import { describe, expect, it } from "bun:test";

import { PdfDrawings, type SqlFn } from "./index";
import type { InkDoc } from "@syllabai/contracts";

const EMPTY_DOC: InkDoc = { schema: "syllabai-ink/1", shapes: [] };

const REF = {
  documentRefType: "paper_asset",
  documentRefId: null,
  sourceUrl: "https://raw.githubusercontent.com/SyllabAI/syllabai-pastpapers/main/qp.pdf",
};

const POISONED_ROW = {
  id: "row-1",
  document_ref_type: "paper_asset",
  document_ref_id: null,
  source_url: REF.sourceUrl,
  doc: { something: "that fails inkDocSchema" },
  revision: 7,
  updated_at: "2026-11-13T06:00:00.000Z",
};

const VALID_ROW = {
  ...POISONED_ROW,
  doc: EMPTY_DOC,
};

/** The fake adapter: returns the scripted row array per call, in order. */
function fakeSql(calls: Array<Array<Record<string, unknown>>>): SqlFn {
  let i = 0;
  return (async () => {
    const rows = calls[Math.min(i, calls.length - 1)]!;
    i += 1;
    return rows;
  }) as unknown as SqlFn;
}

describe("T-HUB-INK-BRK run-003 — the pdf-drawings self-heal law", () => {
  it("(a) load() on a poisoned row serves the EMPTY container at the PRESERVED revision (never throws)", async () => {
    const svc = new PdfDrawings(fakeSql([[POISONED_ROW]]));
    const out = await svc.load("learner-1", REF);
    expect(out.drawing).not.toBeNull();
    expect(out.drawing!.doc).toEqual({ schema: "syllabai-ink/1", shapes: [] });
    expect(out.drawing!.revision).toBe(7);
    expect(out.drawing!.sourceUrl).toBe(REF.sourceUrl);
  });

  it("(b) load() on a VALID row serves verbatim (the heal never rewrites healthy rows)", async () => {
    const svc = new PdfDrawings(fakeSql([[VALID_ROW]]));
    const out = await svc.load("learner-1", REF);
    expect(out.drawing!.doc).toEqual(VALID_ROW.doc);
    expect(out.drawing!.revision).toBe(7);
  });

  it("(c) save() stale-base on a poisoned row returns the HEALED 409 envelope (the rebase path no longer throws)", async () => {
    const svc = new PdfDrawings(fakeSql([[POISONED_ROW]]));
    const out = await svc.save("learner-1", {
      ref: REF,
      doc: EMPTY_DOC,
      revision: 1,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.current.doc).toEqual({ schema: "syllabai-ink/1", shapes: [] });
      expect(out.current.revision).toBe(7);
    }
  });

  it("(d) save() equal-or-ahead base on a poisoned row OVERWRITES the poison (the pair heals on the next write)", async () => {
    const clientDoc = EMPTY_DOC;
    const updatedRow = { ...POISONED_ROW, doc: clientDoc, revision: 1000 };
    const svc = new PdfDrawings(fakeSql([[POISONED_ROW], [updatedRow]]));
    const out = await svc.save("learner-1", {
      ref: REF,
      doc: clientDoc,
      revision: 999,
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.drawing.doc).toEqual(clientDoc);
      expect(out.drawing.revision).toBe(1000);
    }
  });
});

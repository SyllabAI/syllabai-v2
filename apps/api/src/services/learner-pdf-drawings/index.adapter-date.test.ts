/**
 * T-HUB-INK-BRK run-004 — the ADAPTER-DATE regression tests.
 *
 * Live incident of record (2026-11-13, api.syllab-ai.com prod, the
 * user-visible "ink sometimes does not save — toolbar error, Retry
 * sync"): BOTH real drivers (NeonWsClient over WebSocket, postgres.js
 * over TCP) return timestamptz as a JS **Date**; the wire contract
 * (servedPdfDrawingSchema.updatedAt: z.string()) rejected every real
 * row. Consequences, all reproduced live: every GET of an existing row
 * 500'd, every PUT **landed the write then 500'd on its receipt** (the
 * user's ink was saved server-side while the client showed the error),
 * and Retry sync could never succeed. CI stayed green because the run-003
 * test doubles returned `updated_at` as a STRING — the exact gap this
 * file pins shut: every serve path is exercised with the REAL driver
 * shape (updated_at as a Date), per the run-004 adapter-type repro
 * (workflow run 43407158728: `updated_at typeof=object ctor=Date`,
 * `VERDICT: FAIL ... Expected string, received date`).
 *
 * The law: served() normalizes timestamptz Dates to ISO strings at the
 * single row→wire boundary; the CAS-write receipt serves through
 * safeServed (a receipt may never 500 after its write landed).
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

/** The REAL driver shape (run-004 repro): timestamptz as a Date object. */
const REAL_DRIVER_ROW = {
  id: "row-1",
  document_ref_type: "paper_asset",
  document_ref_id: null,
  source_url: REF.sourceUrl,
  doc: EMPTY_DOC,
  revision: 7,
  updated_at: new Date("2026-11-13T06:12:54.456Z"),
};

function fakeSql(calls: Array<Array<Record<string, unknown>>>): SqlFn {
  let i = 0;
  return (async () => {
    const rows = calls[Math.min(i, calls.length - 1)]!;
    i += 1;
    return rows;
  }) as unknown as SqlFn;
}

describe("T-HUB-INK-BRK run-004 — the adapter-date law (timestamptz arrives as a Date)", () => {
  it("(a) load() on a Date-carrying row serves verbatim with the ISO-string updatedAt", async () => {
    const svc = new PdfDrawings(fakeSql([[REAL_DRIVER_ROW]]));
    const out = await svc.load("learner-1", REF);
    expect(out.drawing).not.toBeNull();
    expect(out.drawing!.doc).toEqual(EMPTY_DOC);
    expect(out.drawing!.revision).toBe(7);
    expect(out.drawing!.updatedAt).toBe("2026-11-13T06:12:54.456Z");
  });

  it("(b) save() CAS-write receipt with a Date updated_at is a 200 receipt (the pre-fix line threw AFTER the write landed)", async () => {
    const updatedRow = { ...REAL_DRIVER_ROW, doc: EMPTY_DOC, revision: 8 };
    const svc = new PdfDrawings(fakeSql([[REAL_DRIVER_ROW], [updatedRow]]));
    const out = await svc.save("learner-1", { ref: REF, doc: EMPTY_DOC, revision: 7 });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.drawing.revision).toBe(8);
      expect(out.drawing.updatedAt).toBe("2026-11-13T06:12:54.456Z");
    }
  });

  it("(c) save() stale-base with a Date updated_at renders the 409 envelope (the rebase path must not throw)", async () => {
    const svc = new PdfDrawings(fakeSql([[REAL_DRIVER_ROW]]));
    const out = await svc.save("learner-1", { ref: REF, doc: EMPTY_DOC, revision: 1 });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.current.revision).toBe(7);
      expect(out.current.updatedAt).toBe("2026-11-13T06:12:54.456Z");
    }
  });

  it("(d) the self-heal law holds under the real driver shape too (poisoned doc + Date updatedAt heals at the preserved revision)", async () => {
    const poisoned = { ...REAL_DRIVER_ROW, doc: { something: "that fails inkDocSchema" } };
    const svc = new PdfDrawings(fakeSql([[poisoned]]));
    const out = await svc.load("learner-1", REF);
    expect(out.drawing!.doc).toEqual(EMPTY_DOC);
    expect(out.drawing!.revision).toBe(7);
    expect(out.drawing!.updatedAt).toBe("2026-11-13T06:12:54.456Z");
  });
});

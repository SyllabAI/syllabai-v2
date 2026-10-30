/**
 * PdfDrawings — the annotation-ink persistence plane (T-MG-INK-1 run-002).
 * Plan of record: docs/MG-MARK-PARITY-PLAN.md §3.3; verdict record:
 * docs/MG-INK-SDK-GATE.md (run-001: native canvas ink on pdf-pane v4).
 *
 * The surface: GET/PUT /api/v1/learner/pdf-drawings — one FULL-DOC jsonb
 * container {schema:"syllabai-ink/1", shapes[]} per (learner, documentRef
 * | sourceUrl). E4 sizing law (run-001 evidence: 11,148 B / 17 shapes
 * observed live, single-writer): full-doc PUT + revision LWW 409 — NO
 * op-log, NO delta sync (the op-log solves multi-writer we do not have;
 * canvas.commit-style incremental sync is a stretch pin, not a Phase-3
 * gate, plan §3.3).
 *
 * REVISION LAW (the api pin "PUT carries revision — LWW, 409 on stale"):
 * the PUT `revision` is the BASE the write is cut against — 0 seeds a
 * fresh drawing; R rewrites the row last read at revision R. An accepted
 * write advances the stored revision to base + 1. base < stored → STALE:
 * 409, zero rows written, the client re-reads and re-applies. Equal-or-
 * ahead bases win (LWW at the stamp the caller read). The UPDATE is a CAS
 * on the observed revision — a lost CAS reloads once and re-evaluates
 * honestly; an insert race fails loud against the unique constraint
 * (single-writer E4 keeps both theoretical; see sql.ts).
 *
 * IDENTITY LAW (the plan §3.3 refine): exactly one of documentRef /
 * sourceUrl per request (the contracts refine validates the wire; this
 * service trusts the parsed pair). sourceUrl-keyed rows are the
 * external-PDF fallback (the fallback pin: external PDF drawings store
 * and load with documentRefId NULL).
 *
 * Posture (paper-marks parity): learnerId is a parameter sourced from the
 * JWT context in the routes — it never appears on any wire shape.
 */
import {
  pdfDrawingLoadSchema,
  servedPdfDrawingSchema,
  type InkDoc,
  type PdfDrawingLoad,
  type ServedPdfDrawing,
} from "@syllabai/contracts";
import type { SqlFn } from "./sql";

export type { SqlFn };

/** The resolved request identity — exactly one of documentRefId /
 * sourceUrl non-null (the contracts refine; null on the unused key). */
export interface PdfDrawingRef {
  documentRefType: string;
  documentRefId: string | null;
  sourceUrl: string | null;
}

interface DrawingRow {
  id: string;
  document_ref_type: string;
  document_ref_id: string | null;
  source_url: string | null;
  doc: unknown;
  revision: number;
  updated_at: string;
}

/** Row → served wire shape (contract-validated — the row IS the pin). */
function served(r: DrawingRow): ServedPdfDrawing {
  return servedPdfDrawingSchema.parse({
    documentRefType: r.document_ref_type,
    documentRefId: r.document_ref_id,
    sourceUrl: r.source_url,
    doc: r.doc,
    revision: r.revision,
    updatedAt: r.updated_at,
  });
}

export class PdfDrawings {
  constructor(private readonly sql: SqlFn) {}

  /** The row lookup by the request key — the two select forms mirror the
   * two identity laws (documentRef equality; sourceUrl equality). */
  private async selectRow(learnerId: string, ref: PdfDrawingRef): Promise<DrawingRow | null> {
    if (ref.documentRefId !== null) {
      const rows = (await this.sql`
        select id, document_ref_type, document_ref_id, source_url, doc, revision, updated_at
        from learner_pdf_drawings
        where learner_id = ${learnerId}
          and document_ref_type = ${ref.documentRefType}
          and document_ref_id = ${ref.documentRefId}
      `) as unknown as DrawingRow[];
      return rows[0] ?? null;
    }
    const rows = (await this.sql`
      select id, document_ref_type, document_ref_id, source_url, doc, revision, updated_at
      from learner_pdf_drawings
      where learner_id = ${learnerId}
        and document_ref_type = ${ref.documentRefType}
        and source_url = ${ref.sourceUrl}
    `) as unknown as DrawingRow[];
    return rows[0] ?? null;
  }

  /**
   * GET /api/v1/learner/pdf-drawings — honest-empty: no row serves
   * drawing:null (200, never an error; the paper-marks honest-empty law).
   */
  async load(learnerId: string, ref: PdfDrawingRef): Promise<PdfDrawingLoad> {
    const row = await this.selectRow(learnerId, ref);
    return pdfDrawingLoadSchema.parse({
      documentRefType: ref.documentRefType,
      documentRefId: ref.documentRefId,
      sourceUrl: ref.sourceUrl,
      drawing: row ? served(row) : null,
    });
  }

  /**
   * PUT /api/v1/learner/pdf-drawings — the full-doc write through the
   * revision law (see module header). ok → the stored row at base + 1;
   * conflict → the CURRENT stored row (the client rebases; the route
   * renders the 409 envelope — the row itself never rides the error
   * body, the ApiError envelope law holds).
   */
  async save(
    learnerId: string,
    input: { ref: PdfDrawingRef; doc: InkDoc; revision: number },
  ): Promise<{ ok: true; drawing: ServedPdfDrawing } | { ok: false; current: ServedPdfDrawing }> {
    const base = input.revision;
    let row = await this.selectRow(learnerId, input.ref);

    // STALE: the caller's base is behind the stored revision — zero rows
    // written, the current row returned for the rebase.
    if (row !== null && row.revision > base) {
      return { ok: false, current: served(row) };
    }

    if (row === null) {
      // Fresh document: the stored revision advances to base + 1 (base 0
      // seeds revision 1 — the schema DEFAULT law).
      const inserted = (await this.sql`
        insert into learner_pdf_drawings (id, learner_id, document_ref_type,
          document_ref_id, source_url, doc, revision)
        values (gen_random_uuid(), ${learnerId}, ${input.ref.documentRefType},
          ${input.ref.documentRefId}, ${input.ref.sourceUrl},
          ${JSON.stringify(input.doc)}::jsonb, ${base + 1})
        returning id, document_ref_type, document_ref_id, source_url, doc, revision, updated_at
      `) as unknown as DrawingRow[];
      if (inserted.length > 0) return { ok: true, drawing: served(inserted[0]!) };
      // Raced insert (the unique constraint absorbed it): re-evaluate
      // against the winner — fail-loud posture, see sql.ts.
      row = await this.selectRow(learnerId, input.ref);
      if (row === null) throw new Error("learner_pdf_drawings insert raced away");
      if (row.revision > base) return { ok: false, current: served(row) };
    }

    // CAS on the OBSERVED revision — the read-write window guard. A lost
    // CAS reloads once and re-evaluates (a second loss throws: with the
    // single-writer E4 law this path is theoretical, and a silent accept
    // would be the dishonest outcome).
    const updated = (await this.sql`
      update learner_pdf_drawings
      set doc = ${JSON.stringify(input.doc)}::jsonb,
          revision = ${base + 1},
          updated_at = now()
      where id = ${row.id} and revision = ${row.revision}
      returning id, document_ref_type, document_ref_id, source_url, doc, revision, updated_at
    `) as unknown as DrawingRow[];
    if (updated.length > 0) return { ok: true, drawing: served(updated[0]!) };

    const raced = await this.selectRow(learnerId, input.ref);
    if (raced !== null && raced.revision > base) return { ok: false, current: served(raced) };
    throw new Error("learner_pdf_drawings revision CAS lost twice (equal-or-older writer)");
  }
}

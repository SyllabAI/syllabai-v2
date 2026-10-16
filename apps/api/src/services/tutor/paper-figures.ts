/**
 * Paper figures — lane #3 of the run-004 diagnosis (operator trace
 * 1a14536e97f41425, "#3, and we should also update the parser right? so it
 * 'cleans' pdfs after parsing?").
 *
 * PROBLEM OF RECORD (diagnosis trace 1a144b08a0dbcf0d, P-c): "no figures
 * anywhere in the bank (every diagram/table/apparatus reference dangles)" —
 * a stem says "The diagram shows…" and the learner is given no hint a figure
 * exists, let alone where.
 *
 * THE DATA OF RECORD (SELECT-only census 2026-10-16, scripts/r0_figures_probe.mjs):
 *   - glm_ocr_bridge_records.qp_draft (the GLM-OCR pair's VERBATIM QP draft)
 *     carries the parser's OWN per-question figure attribution: 1,151
 *     figureRefs across 59 bridged papers (1,134 "available", every one with
 *     url/assetId/sha256/width/height, format png);
 *   - the QP canonical_json carries the figure ELEMENTS with page_number
 *     (634 elements on the 50 figure-bearing docs; group_key never fires —
 *     the draft ref is the only attribution spine);
 *   - the join draftRef.elementId -> canonicalFigure.element_id resolves
 *     1,145 of 1,151 refs AND every resolved ref carries its page;
 *   - the crop BINARIES are NOT stored of record (question_asset holds the
 *     585 SME-corpus assets, zero crops) — so this lane serves REFERENCES
 *     (page + source name + shape), never a fabricated <img> src.
 *
 * LAWS:
 *   - attribution is the PARSER'S OWN (the draft's figures/figureRefs) —
 *     zero inference, no page-range heuristics (precision-first);
 *   - papers without a bridge record (46 of 95 VALIDATED — the older
 *     pre-figureRefs ingest generation, June 2019 4CH1/2C among them) map
 *     to the HONEST EMPTY: no figures served, nothing guessed;
 *   - FAIL-OPEN everywhere: a missing/garbage draft or canonical JSON
 *     degrades to fewer figures, never a 500 — figures are an enhancement
 *     layer on a deterministic card (the band probe must never gate);
 *   - dedup by element (elementId, then sourceName), question-level refs
 *     before part-level, parser order preserved;
 *   - per-question cap MAX_FIGURES_PER_QUESTION (a pathological draft can
 *     only lose tail figures, never flood the card);
 *   - a ref with NEITHER a resolvable page NOR a source name is dropped
 *     (nothing honest to show);
 *   - zero LLM, zero writes — a read-side projection like stem-hygiene.
 */
import type { SqlFn } from "./sql";
import type { TutorQuestionFigure } from "@syllabai/contracts";

export const MAX_FIGURES_PER_QUESTION = 12;

interface BridgeRow {
  qp_document_row_id: string | null;
  qp_draft: string | null;
}

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v : null;

const int = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string" && /^\d+$/.test(v.trim())) return Number.parseInt(v.trim(), 10);
  return null;
};

/**
 * "q06-cf68cf74" → "6" — the deterministic join between a structured bank
 * row's external_ref and the draft's question number (the draft numbers are
 * the printed question numbers; the external refs carry them zero-padded).
 * Null when the ref carries no leading q-number (the row then serves no
 * figures — honest).
 */
export function questionNumberOf(externalRef: string | null): string | null {
  if (externalRef == null) return null;
  const m = /^q\s*0*(\d+)/i.exec(externalRef.trim());
  return m ? String(Number.parseInt(m[1]!, 10)) : null;
}

/**
 * The paper's per-question figure map: paperId -> (question number ->
 * TutorQuestionFigure[]). Two reads (the bridge record, the QP canonical
 * row), both fail-open. No bridge record → an EMPTY map (the honest empty).
 */
export async function figuresByQuestionNumber(
  sql: SqlFn,
  paperId: string,
): Promise<Map<string, TutorQuestionFigure[]>> {
  const map = new Map<string, TutorQuestionFigure[]>();

  const bridges = (await sql`
    select qp_document_row_id, qp_draft::text as qp_draft
    from glm_ocr_bridge_records
    where paper_id = ${paperId}::uuid
    limit 1`) as unknown as BridgeRow[];
  const bridge = bridges[0];
  if (bridge == null || bridge.qp_draft == null) return map;

  // canonical figure elements: element_id -> page_number (the page spine)
  const pages = new Map<string, number>();
  if (bridge.qp_document_row_id != null) {
    try {
      const docRows = (await sql`
        select canonical_json::text as cj
        from documents
        where id = ${bridge.qp_document_row_id}::uuid
        limit 1`) as unknown as Array<{ cj: string | null }>;
      const cj = docRows[0]?.cj;
      if (cj != null) {
        const doc = JSON.parse(cj) as { figures?: unknown };
        for (const f of Array.isArray(doc.figures) ? doc.figures : []) {
          if (f == null || typeof f !== "object") continue;
          const el = str((f as Record<string, unknown>).element_id);
          const page = int((f as Record<string, unknown>).page_number);
          if (el != null && page != null) pages.set(el, page);
        }
      }
    } catch {
      // fail-open: figures keep page=null; the source-name chip still serves
    }
  }

  // the draft's per-question refs (question-level first, then parts)
  let draft: unknown;
  try {
    draft = JSON.parse(String(bridge.qp_draft));
  } catch {
    return map; // a garbage draft serves no figures — never a 500
  }
  const questions = Array.isArray((draft as Record<string, unknown>)?.questions)
    ? ((draft as Record<string, unknown>).questions as unknown[])
    : [];

  for (const q of questions) {
    if (q == null || typeof q !== "object") continue;
    const qRec = q as Record<string, unknown>;
    const num = qRec.number;
    if (num == null) continue;
    const key = String(num);

    const refs: unknown[] = [];
    if (Array.isArray(qRec.figures)) refs.push(...qRec.figures);
    if (Array.isArray(qRec.parts)) {
      for (const p of qRec.parts) {
        if (p != null && typeof p === "object" && Array.isArray((p as Record<string, unknown>).figures)) {
          refs.push(...((p as Record<string, unknown>).figures as unknown[]));
        }
      }
    }

    const seen = new Set<string>();
    const figures: TutorQuestionFigure[] = [];
    for (const r of refs) {
      if (figures.length >= MAX_FIGURES_PER_QUESTION) break;
      if (r == null || typeof r !== "object") continue;
      const ref = r as Record<string, unknown>;
      const elementId = str(ref.elementId);
      const sourceName = str(ref.sourceName) ?? str(ref.url);
      // dedup: element identity first, then the asset name
      const dedupKey = elementId ?? sourceName;
      if (dedupKey != null) {
        if (seen.has(dedupKey)) continue;
        seen.add(dedupKey);
      }
      const page = elementId != null ? (pages.get(elementId) ?? null) : null;
      // nothing honest to show: no page, no source name
      if (page == null && sourceName == null) continue;
      figures.push({
        documentRowId: bridge.qp_document_row_id,
        page,
        sourceName,
        format: str(ref.format),
        width: int(ref.width),
        height: int(ref.height),
        availability: str(ref.availability),
      });
    }
    if (figures.length > 0) map.set(key, figures);
  }

  return map;
}

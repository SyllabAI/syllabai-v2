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
 * THE DATA OF RECORD (SELECT-only census 2026-10-16, scripts/r0_figures_probe.mjs
 * + the serving-row re-measurement after the first live probe):
 *   - glm_ocr_bridge_records.qp_draft (the GLM-OCR pair's VERBATIM QP draft)
 *     carries the parser's OWN per-question figure attribution: 1,151
 *     figureRefs across 59 bridged papers (1,134 "available", every one with
 *     url/assetId/sha256/width/height, format png);
 *   - the crop BINARIES are NOT stored of record (question_asset holds the
 *     585 SME-corpus assets, zero crops) — so this lane serves REFERENCES
 *     (source name + shape), never a fabricated <img> src;
 *   - ADDRESSING LAW (the serving-row fix, measured live 2026-10-16): for
 *     48 of 49 bridged papers the bridge's QP row is a DIFFERENT, older
 *     generation than the paper's serving QP doc (often REJECTED, and the
 *     Markdown generation is single-page — every figure page_number is the
 *     degenerate 1), and element ids NEVER match across generations (0/39
 *     measured). The ONLY citable address is the SERVING row (bank-bands
 *     law: exam_papers.question_paper_document_id -> top non-REJECTED
 *     version) — the row the F-022 reader resolves (existsCitable). A
 *     figure's page is therefore claimed ONLY from the SERVING doc's own
 *     canonical figures (the rare same-element case); the bridge row's
 *     degenerate pages are NEVER used; otherwise the chip links the
 *     serving doc's entry page (the same address the card's QP DocRow
 *     opens) and stays a REFERENCE chip (source name + dims).
 *
 * LAWS:
 *   - attribution is the PARSER'S OWN (the draft's figures/figureRefs) —
 *     zero content inference, no page-span heuristics (precision-first;
 *     the same-page alternative measured ~10 usable pages corpus-wide and
 *     was rejected as inference debt);
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
 * The deterministic join between a structured bank row's external_ref and
 * the draft's question number (the draft numbers are the printed question
 * numbers; the external refs carry them). TWO ref generations of record:
 *   - "q06-cf68cf74" / "q1-x" — the bridged (glm-ocr pair) ingest era;
 *   - "4ch0-1c-201801#q9" / "4ch1/past-papers/2023-01/4CH1-1C#q1" — the 46
 *     bridge-less papers' era, where the printed number rides the "#q"
 *     fragment (the figure re-parse lane, trace 1a145d4901bbf61d).
 * Null when the ref carries neither (the row then serves no figures —
 * honest).
 */
export function questionNumberOf(externalRef: string | null): string | null {
  if (externalRef == null) return null;
  const trimmed = externalRef.trim();
  const m = /^q\s*0*(\d+)/i.exec(trimmed);
  if (m) return String(Number.parseInt(m[1]!, 10));
  const frag = /#q\s*0*(\d+)\s*$/i.exec(trimmed);
  if (frag) return String(Number.parseInt(frag[1]!, 10));
  return null;
}

/**
 * The paper's per-question figure map: paperId -> (question number ->
 * TutorQuestionFigure[]). Two reads (the bridge record, the SERVING QP
 * row), both fail-open. No bridge record → an EMPTY map (the honest empty).
 *
 * Addressing law (see module header): documentRowId = the SERVING QP doc
 * row (the row the F-022 reader resolves); page = the figure's page ONLY
 * from the serving doc's own canonical figures — the bridge row's pages are
 * the degenerate Markdown generation's (all 1) and are never used.
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

  // the SERVING QP doc row (bank-bands law verbatim posture: the paper's
  // question_paper_document_id, top non-REJECTED version) — the citable
  // address of record for every chip of this paper
  let servingRowId: string | null = null;
  const servingPages = new Map<string, number>();
  try {
    const serveRows = (await sql`
      select d.id, d.canonical_json::text as cj
      from documents d
      where d.document_id = (select ep.question_paper_document_id from exam_papers ep where ep.id = ${paperId}::uuid)
        and d.validation_state <> 'REJECTED'
      order by d.doc_version desc
      limit 1`) as unknown as Array<{ id: string; cj: string | null }>;
    const serving = serveRows[0];
    if (serving != null) {
      servingRowId = String(serving.id);
      if (serving.cj != null) {
        const doc = JSON.parse(serving.cj) as { figures?: unknown };
        for (const f of Array.isArray(doc.figures) ? doc.figures : []) {
          if (f == null || typeof f !== "object") continue;
          const el = str((f as Record<string, unknown>).element_id);
          const page = int((f as Record<string, unknown>).page_number);
          if (el != null && page != null) servingPages.set(el, page);
        }
      }
    }
  } catch {
    // fail-open: chips stay unlinked references; never a 500
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
      const page = elementId != null ? (servingPages.get(elementId) ?? null) : null;
      // nothing honest to show: no page, no source name
      if (page == null && sourceName == null) continue;
      figures.push({
        // the CITABLE address: the serving QP doc row the F-022 reader
        // resolves — never the bridge's (often REJECTED, page-degenerate)
        // parse-generation row
        documentRowId: servingRowId,
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

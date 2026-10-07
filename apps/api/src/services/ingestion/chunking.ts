/**
 * ChunkingService + ChunkHeaderBuilder ports — deterministic canonical-
 * document chunking (T-013 stage; T-MIG-082 tranche B2). Byte-faithful
 * ports of the frozen content/ChunkingService.java (182 lines) and
 * content/ChunkHeaderBuilder.java (205 lines) @ 6cad6ef, verified
 * line-against-line 2026-10-07.
 *
 * Ported laws (all deterministic — no model access, no clocks, no
 * randomness):
 *   - text source: textBlocks + tables + equations (equations fall back to
 *     latex when text is absent), ordered by (page_number, reading_order,
 *     element_id); figures carry no text and are skipped;
 *   - atom-boundary mode: a group_key change is a HARD chunk boundary — no
 *     chunk ever crosses an atom; token packing continues WITHIN a group;
 *   - block boundaries respected; an oversized block (> maxTokens) is its
 *     own chunk; a chunk closes when the next block would exceed
 *     targetTokens; sizes 300/800 (the kind-agnostic global defaults);
 *   - token estimate = ceil(chars/4), min 1 (the documented stable proxy);
 *   - every chunk keeps its element ids in reading order and a header line
 *     built by the header builder (subject | series year | paperCode |
 *     label | spec range | unit | [MS ]Q<atom> | pages), prepended to the
 *     chunk text before storage — content-preserving;
 *   - the estimate constructor guard (target < 50 || max < target) throws
 *     at construction (the frozen fail-fast).
 */
import type { CanonicalDocument } from "@syllabai/contracts";
import type { DocumentKind } from "@syllabai/contracts";

export const CHUNK_TARGET_TOKENS = 300;
export const CHUNK_MAX_TOKENS = 800;

export interface ChunkDraft {
  /** the header-prepended content as stored/embedded */
  content: string;
  pageStart: number | null;
  pageEnd: number | null;
  elementIds: string[];
  tokenEstimate: number;
  groupKey: string | null;
}

export interface RawChunkDraft extends ChunkDraft {
  /** the header is stored separately — the service prepends */
  header: string;
  body: string;
}

// ── ChunkHeaderBuilder (:18-205) ────────────────────────────────────────────

type RetrievalMeta = NonNullable<CanonicalDocument["retrieval"]>;

interface DocKindHolder {
  kind: DocumentKind | null;
}

function notBlank(s: string | null | undefined): s is string {
  return s != null && s.trim() !== "";
}
function blankToNull(s: string | null | undefined): string | null {
  return notBlank(s) ? s : null;
}

/** "JAN"→"Jan", "JUN"→"Jun", "NOV"→"Nov", else "" (:79-89). */
export function displaySeries(series: string | null | undefined): string {
  if (series === "JAN") return "Jan";
  if (series === "JUN") return "Jun";
  if (series === "NOV") return "Nov";
  return "";
}

/** Numeric-dot spec-code comparator ("2.9" < "2.10") — numeric segments (:91-113). */
export function specCodeOrder(a: string, b: string): number {
  const pa = parts(a);
  const pb = parts(b);
  const n = Math.min(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    if (pa[i] !== pb[i]) return (pa[i] ?? 0) < (pb[i] ?? 0) ? -1 : 1;
  }
  return pa.length === pb.length ? 0 : pa.length < pb.length ? -1 : 1;
}

function parts(code: string): number[] {
  return code
    .trim()
    .split(".")
    .map((seg) => (/^\d+$/.test(seg) ? Number.parseInt(seg, 10) : 0));
}

/** Distinct, blank-filtered, spec-ordered range ("Spec 2.9" / "Spec 2.9–2.14"). */
export function specRangeSegment(specCodes: string[] | null | undefined): string {
  if (specCodes == null || specCodes.length === 0) return "";
  const codes = [...new Set(specCodes.filter((c) => notBlank(c)).map((c) => c.trim()))].sort(
    specCodeOrder,
  );
  if (codes.length === 0) return "";
  return codes.length === 1 ? `Spec ${codes[0]}` : `Spec ${codes[0]}–${codes[codes.length - 1]!}`;
}

/**
 * "q3" → "3" (leading q/Q stripped, trimmed); blank → null (:180-189).
 * The atom number column derives from THIS normalization.
 */
export function normalizeAtom(groupKey: string | null | undefined): string | null {
  if (!notBlank(groupKey)) return null;
  const trimmed = groupKey.trim();
  const lowered = trimmed.toLowerCase().startsWith("q") ? trimmed.slice(1).trim() : trimmed;
  return lowered === "" ? null : lowered;
}

function qRefSegment(
  kindHolder: DocKindHolder,
  meta: RetrievalMeta | null,
  groupKey: string | null,
): string {
  const atom = normalizeAtom(groupKey);
  if (atom === null) return "";
  const explicitLabel = meta != null && notBlank(meta.label);
  const prefix = kindHolder.kind === "MARK_SCHEME" && !explicitLabel ? "MS " : "";
  return `${prefix}Q${atom}`;
}

function pagesSegment(pageStart: number | null, pageEnd: number | null): string {
  if (pageStart === null) return "";
  if (pageEnd === null || pageEnd === pageStart) return `p.${pageStart}`;
  return `pp.${pageStart}–${pageEnd}`;
}

function subjectSegment(meta: RetrievalMeta): string {
  const title = blankToNull(meta?.subjectTitle ?? null);
  const code = blankToNull(meta?.subjectCode ?? null);
  if (title !== null && code !== null) return `${title.trim()} ${code.trim()}`;
  return title !== null ? title.trim() : code !== null ? code.trim() : "";
}

function seriesYearSegment(meta: RetrievalMeta): string {
  if (meta?.year == null) return "";
  return `${displaySeries(meta.series ?? null)} ${meta.year}`;
}

/**
 * build (:20-77): identity segments joined " | " with the pages tail. Empty
 * when no segment fires (the header-less body chunk).
 */
export function buildChunkHeader(
  kind: DocumentKind | null,
  meta: RetrievalMeta | null,
  groupKey: string | null,
  pageStart: number | null,
  pageEnd: number | null,
): string {
  const segments: string[] = [];
  if (meta != null) {
    const subject = subjectSegment(meta);
    if (subject !== "") segments.push(subject);
    const seriesYear = seriesYearSegment(meta);
    if (seriesYear !== "") segments.push(seriesYear);
    if (notBlank(meta.paperCode)) segments.push(meta.paperCode!.trim());
    if (notBlank(meta.label)) segments.push(meta.label!.trim());
    const specRange = specRangeSegment(meta.specCodes ?? null);
    if (specRange !== "") segments.push(specRange);
    if (notBlank(meta.unit)) segments.push(meta.unit!.trim());
  }
  const qRef = qRefSegment({ kind }, meta, groupKey);
  if (qRef !== "") segments.push(qRef);
  if (segments.length === 0) return "";
  const pages = pagesSegment(pageStart, pageEnd);
  if (pages !== "") segments.push(pages);
  return segments.join(" | ");
}

// ── ChunkingService (:60-181) ────────────────────────────────────────────────

interface ChunkCandidate {
  elementId: string;
  pageNumber: number;
  readingOrder: number;
  text: string;
  groupKey: string | null;
}

/** ceil(chars/4), min 1 (:178-180). */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.trunc((text.length + 3) / 4));
}

export function chunkCanonicalDocument(
  doc: CanonicalDocument,
  kind: DocumentKind | null,
  opts: { targetTokens?: number; maxTokens?: number } = {},
): RawChunkDraft[] {
  const targetTokens = opts.targetTokens ?? CHUNK_TARGET_TOKENS;
  const maxTokens = opts.maxTokens ?? CHUNK_MAX_TOKENS;
  if (targetTokens < 50 || maxTokens < targetTokens) {
    throw new Error(
      `chunking sizes invalid: target=${targetTokens} max=${maxTokens}`,
    );
  }

  const candidates: ChunkCandidate[] = [];
  for (const e of doc.textBlocks ?? []) {
    if (e != null && e.text != null && e.text.trim() !== "") {
      candidates.push({
        elementId: e.element_id ?? "",
        pageNumber: e.page_number ?? 0,
        readingOrder: e.reading_order ?? 0,
        text: e.text.trim(),
        groupKey: e.group_key ?? null,
      });
    }
  }
  for (const e of doc.tables ?? []) {
    if (e != null && e.text != null && e.text.trim() !== "") {
      candidates.push({
        elementId: e.element_id ?? "",
        pageNumber: e.page_number ?? 0,
        readingOrder: e.reading_order ?? 0,
        text: e.text.trim(),
        groupKey: e.group_key ?? null,
      });
    }
  }
  for (const e of doc.equations ?? []) {
    const text =
      e == null
        ? null
        : e.text != null && e.text.trim() !== ""
          ? e.text
          : e.latex != null && e.latex.trim() !== ""
            ? e.latex
            : null;
    if (text != null) {
      candidates.push({
        elementId: e.element_id ?? "",
        pageNumber: e.page_number ?? 0,
        readingOrder: e.reading_order ?? 0,
        text: text.trim(),
        groupKey: e.group_key ?? null,
      });
    }
  }
  // canonical reading order: page, then reading_order; element id breaks ties
  candidates.sort(
    (a, b) =>
      a.pageNumber - b.pageNumber ||
      a.readingOrder - b.readingOrder ||
      (a.elementId < b.elementId ? -1 : a.elementId > b.elementId ? 1 : 0),
  );

  const chunks: RawChunkDraft[] = [];
  let current: ChunkCandidate[] = [];
  let currentTokens = 0;
  let currentGroupKey: string | null = null;

  const flush = () => {
    if (current.length > 0) {
      chunks.push(build(doc, kind, current, currentTokens, currentGroupKey));
      current = [];
      currentTokens = 0;
    }
  };

  for (const candidate of candidates) {
    const candidateTokens = estimateTokens(candidate.text);
    if (candidateTokens > maxTokens) {
      // oversized block: flush what we have, then emit it as its own chunk
      flush();
      chunks.push(build(doc, kind, [candidate], candidateTokens, candidate.groupKey));
      continue;
    }
    // atom-boundary mode: a group-key change is a hard boundary
    if (current.length > 0 && currentGroupKey !== candidate.groupKey) {
      flush();
    }
    if (currentTokens + candidateTokens > targetTokens && current.length > 0) {
      flush();
    }
    if (current.length === 0) {
      currentGroupKey = candidate.groupKey;
    }
    current.push(candidate);
    currentTokens += candidateTokens;
  }
  flush();
  return chunks;
}

function build(
  doc: CanonicalDocument,
  kind: DocumentKind | null,
  blocks: ChunkCandidate[],
  tokenEstimate: number,
  groupKey: string | null,
): RawChunkDraft {
  const pageNumbers = blocks.map((b) => b.pageNumber).filter((n) => n != null);
  const minPage = pageNumbers.length === 0 ? null : Math.min(...pageNumbers);
  const maxPage = pageNumbers.length === 0 ? null : Math.max(...pageNumbers);
  const header = buildChunkHeader(kind, doc.retrieval ?? null, groupKey, minPage, maxPage);
  const content: string[] = [];
  const elementIds: string[] = [];
  let pageStart = Number.MAX_SAFE_INTEGER;
  let pageEnd = Number.MIN_SAFE_INTEGER;
  for (const b of blocks) {
    content.push(b.text);
    elementIds.push(b.elementId);
    pageStart = Math.min(pageStart, b.pageNumber);
    pageEnd = Math.max(pageEnd, b.pageNumber);
  }
  const body = content.join("\n");
  const withHeader = header === "" ? body : `${header}\n${body}`;
  return {
    content: withHeader,
    header,
    body,
    pageStart: pageStart === Number.MAX_SAFE_INTEGER ? null : pageStart,
    pageEnd: pageEnd === Number.MIN_SAFE_INTEGER ? null : pageEnd,
    elementIds,
    tokenEstimate: Math.max(1, tokenEstimate),
    groupKey,
  };
}

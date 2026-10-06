/**
 * T-MIG-060 tranche 1b — the deterministic paper-question resolver (frozen
 * law @ 6cad6ef).
 *
 * Line-against-line port of tutor/PaperQuestionResolver.java :92-649 (T-024
 * KA-RAG). When a learner asks "explain question 10 from june 2019 paper 2"
 * or "give me the answer of jan 2022 question 4 paper 1", pure vector
 * similarity dilutes the session/paper/number constraints across the whole
 * corpus. This resolver binds them deterministically and produces LEAD
 * evidence that KaRagService pins at the head of the pool — outside RRF
 * (plan §7 lead-item pattern). Zero vector calls on the happy path:
 * resolution is metadata + document rows only.
 *
 * Three anchors — the bank resolves first (first match wins); the card and
 * content-store anchors compose below it (:38-66):
 *   1. Bank anchor — the Fetch bank (R4 plan §7 FETCH) resolves a single
 *      paper within the ask's curriculum scope. Served only when the paper
 *      row is VALIDATED — exactly branch 1 of the serving law
 *      (ChunkVectorRepository#searchServingEligible): paper-anchored QP/MS
 *      chunks gate on the exam_papers row, and the linked document rows may
 *      still sit at SUGGESTED in the documents table (they do in production
 *      — the 09-26 live probes proved a paper-VALIDATED + document-SUGGESTED
 *      doc serves through the vector arm). A REJECTED document row never
 *      serves. Evidence is the question-number-matching chunks (QP stems,
 *      MS answers when the ask is mark-scheme-seeking).
 *   2. Question-card anchor — the per-session card document
 *      qcard-{code}-{unit}-{SERIES}-{year}.txt (uniquely named per session,
 *      covering sessions the structured bank does not). Served only when the
 *      card document is VALIDATED; the question's card chunk is selected by
 *      the chunk's atomNumber column (zero-padding and q-prefix tolerant)
 *      or, when unpopulated, by question-number markers in the card text.
 *   3. Content-store paper anchor — the real QP/MS documents of the bound
 *      identity (V33 chunk mirror: series + year + paper code). Runs
 *      whenever the identity binds, composing with the card tier: the card
 *      pins its metadata pointer chunks and the store pins the question's
 *      own stem and mark-scheme answer chunks. Served only when the
 *      candidate document row is the VALIDATED top version (branch-2 law,
 *      the card gate).
 *
 * Serving law (T-C20) holds on every tier: REJECTED never serves. Emptiness
 * is honest and two-valued, and resolveWithVerdict separates the cases: a
 * not-a-paper ask (no parseable identity) returns empty with
 * identityParsed=false and the unmodified vector+KG path serves the ask
 * exactly as before; a COMPLETE paper-question identity (question number +
 * series + year) that binds NOT ONE validated anchor returns empty with
 * identityParsed=true — the fail-open guard (09-27 adjudication, direction
 * (a)): the caller must refuse honestly instead of letting generic
 * retrieval answer a named paper question from textually-similar
 * wrong-paper chunks. Bank ambiguity does NOT disarm the guard: a question
 * that exists only in SUGGESTED bank rows is unservable by the serving law,
 * and the 09-27 G1 probe proved that shape serves wrong-paper bleed when
 * the guard is silenced. The resolver never guesses, never widens.
 *
 * "paper 1 / paper 2" phrasing maps to the home-unit candidates 1C/2C with
 * the regional variants as deterministic tiebreak (R last, first match
 * wins); an explicit unit ("2CR") or full code ("4CH1/2C") binds exactly
 * through the shared FetchQueryParser (:85-89).
 */
import type { SqlFn } from "./sql";
import { evidenceFromChunk, type EvidenceItem } from "./evidence";
import { partAtomOf, parseFetchQuery, type ParsedFetchQuery } from "./fetch-parser";
import {
  buildTutorFetchBank,
  type BankFetchResult,
  type BankPaperHit,
  type TutorFetchPort,
} from "./fetch-bank";

// ── pinned evidence caps (:96-116) ──────────────────────────────────────────

/** Pinned evidence per tier — lead items must leave room for KG+vector
 *  evidence. (The bank tier pins MS chunks only on mark-scheme-seeking
 *  asks, so its MS cap lives in MAX_MS_ITEMS_SEEKING; there is no
 *  non-seeking MS cap.) */
export const MAX_QP_ITEMS = 2;
export const MAX_CARD_ITEMS = 2;
/** Content-store companion caps (card ≤2 + QP ≤2 + MS ≤2 ≤ the pool limit of 6). */
export const MAX_STORE_QP_ITEMS = 2;
export const MAX_STORE_MS_ITEMS = 2;

/** Mark-scheme-seeking allocation (2026-10-03 live finding): a multi-part
 *  question's mark scheme spans several chunks and the old flat caps (bank
 *  MS 1, store MS 2) pinned only the first parts — later parts (e.g.
 *  graphite in 4CH1 Jan-2023 1C Q9) were left to survive fusion on their
 *  own, where the paper's own front-matter chunks (vector-similar to the
 *  title tokens in the ask) outcompete them. When the ask seeks answers,
 *  the QP stem shrinks (the card already carries marks + a truncated stem)
 *  and the MS grows, keeping the same worst-case bound: card ≤2 + QP ≤1 +
 *  MS ≤3 ≤ the pool limit of 6. Non-seeking asks keep the old allocation
 *  byte-identically. */
export const MAX_MS_ITEMS_SEEKING = 2;
export const MAX_STORE_QP_ITEMS_SEEKING = 1;
export const MAX_STORE_MS_ITEMS_SEEKING = 3;

/** "paper 1" / "paper 2" (optionally "paper number 1") — the parser does
 *  not bind this phrasing (:118-120). */
const PAPER_HINT = /\bpaper\s*(?:number\s*)?([12])\b/i;

// ── row shapes (the documents/document_chunks projections) ──────────────────

interface DocumentRow {
  id: string;
  document_id: string;
  doc_version: number;
  kind: string | null;
  validation_state: string;
  file_name: string | null;
}

interface ChunkRow {
  id: string;
  chunk_index: number;
  content: string;
  page_start: number | null;
  page_end: number | null;
  element_ids: unknown;
  atom_number: string | null;
}

/** The document kinds the resolver binds (Document.Kind members). */
const KIND_QUESTION_PAPER = "QUESTION_PAPER";
const KIND_MARK_SCHEME = "MARK_SCHEME";

/** PaperQuestionResolver.Resolution :149-161. */
export interface PaperResolutionResult {
  items: EvidenceItem[];
  identityParsed: boolean;
  identityLabel: string | null;
}

/** The scope the resolver reads: the subject code drives the card file
 *  names + the store code ranking; the version id scopes the bank
 *  (CurriculumScopePort satisfies this structurally). */
export interface ResolverScope {
  surface: ReadonlySet<string>;
  curriculumVersionId: string;
  code: string;
}

// ── document/chunk repo ports (JdbcTemplate query parity) ───────────────────

async function findTopByDocumentId(
  sql: SqlFn,
  documentId: string,
): Promise<DocumentRow | null> {
  const rows = (await sql`
    select id, document_id, doc_version, kind, validation_state, file_name
    from documents
    where document_id = ${documentId}
    order by doc_version desc
    limit 1`) as unknown as DocumentRow[];
  return rows[0] ?? null;
}

async function findTopByFileName(
  sql: SqlFn,
  fileName: string,
): Promise<DocumentRow | null> {
  const rows = (await sql`
    select id, document_id, doc_version, kind, validation_state, file_name
    from documents
    where file_name = ${fileName}
    order by doc_version desc
    limit 1`) as unknown as DocumentRow[];
  return rows[0] ?? null;
}

async function findDocumentById(sql: SqlFn, rowId: string): Promise<DocumentRow | null> {
  const rows = (await sql`
    select id, document_id, doc_version, kind, validation_state, file_name
    from documents
    where id = ${rowId}`) as unknown as DocumentRow[];
  return rows[0] ?? null;
}

async function chunksByRowId(sql: SqlFn, rowId: string): Promise<ChunkRow[]> {
  return (await sql`
    select id, chunk_index, content, page_start, page_end, element_ids, atom_number
    from document_chunks
    where document_row_id = ${rowId}
    order by chunk_index asc`) as unknown as ChunkRow[];
}

/** DocumentChunkRepository.findRowIdsByPaperIdentity :29-33 — [row_id,
 *  paper_code] pairs (a row appears once per matching chunk; callers
 *  de-duplicate and apply the serving law). */
async function findRowIdsByPaperIdentity(
  sql: SqlFn,
  series: string,
  year: number,
  paperCodes: string[],
): Promise<Array<{ rowId: string; paperCode: string }>> {
  const rows = (await sql`
    select document_row_id, paper_code
    from document_chunks
    where series = ${series} and year = ${year} and paper_code = any(${paperCodes}::text[])`) as Array<{
    document_row_id: string;
    paper_code: string;
  }>;
  return rows.map((r) => ({ rowId: String(r.document_row_id), paperCode: String(r.paper_code) }));
}

// ── the verdict (:163-234) ──────────────────────────────────────────────────

/**
 * A complete paper-question identity: question number + series + year —
 * exactly the card tier's "bindable paper-style ask" definition (:241-244).
 * (A parseDefect fetch has an empty parse, which cannot satisfy this.)
 */
export function completeIdentity(parsed: ParsedFetchQuery | null): boolean {
  return (
    parsed != null &&
    parsed.qnum != null &&
    parsed.year != null &&
    parsed.series != null &&
    parsed.series.trim() !== ""
  );
}

/**
 * Human-readable echo of the parsed identity for the honest-refusal
 * sentence (:252-290): "question 10 from the June 2019 paper 2". The paper
 * suffix follows the binding priority (explicit code → bare unit → "paper
 * N" hint); an ask that named no paper reads "… the June 2019 papers".
 */
export function identityLabel(parsed: ParsedFetchQuery | null, query: string | null): string {
  if (parsed == null) {
    return "that paper question";
  }
  const seriesToken = parsed.series == null ? "" : parsed.series.trim();
  let series: string;
  switch (seriesToken) {
    case "JAN":
      series = "January";
      break;
    case "JUN":
      series = "June";
      break;
    case "NOV":
      series = "November";
      break;
    default:
      series = seriesToken;
  }
  let label = `question ${parsed.qnum}`;
  if (parsed.part != null) {
    label += `(${parsed.part})`;
    if (parsed.partRoman != null) {
      label += `(${parsed.partRoman})`;
    }
  }
  if (series !== "") {
    label += ` from the ${series}`;
  }
  if (parsed.year != null) {
    label += `${series === "" ? " from " : " "}${parsed.year}`;
  }
  let unit =
    parsed.paperCode != null ? unitFromPaperCode(parsed.paperCode) : parsed.unit;
  if (unit == null || unit.trim() === "") {
    const hint = PAPER_HINT.exec(query ?? "");
    if (hint) {
      unit = hint[1] ?? null;
    }
  }
  if (unit != null && unit.trim() !== "") {
    label += ` paper ${unit.toUpperCase()}`;
  } else {
    label += " papers";
  }
  return label;
}

// ── tier 1: bank anchor (:292-338) ──────────────────────────────────────────

async function documentQuestionChunksAsync(
  sql: SqlFn,
  canonicalDocumentId: string,
  qnum: number,
  partAtom: string | null,
  expectedKind: string,
  cap: number,
): Promise<EvidenceItem[]> {
  // Serving law branch 1 (paper-anchored) :323-327 — the paper row's
  // VALIDATED state was already checked by the caller; the document row's
  // own SUGGESTED state must NOT block (production: every documents row is
  // SUGGESTED while 11 exam_papers rows are VALIDATED, and the vector arm
  // serves exactly those docs). Only a REJECTED document row is excluded —
  // and the filter applies to the TOP version row, never to a hunt for an
  // older clean version.
  const top = await findTopByDocumentId(sql, canonicalDocumentId);
  const doc = top != null && top.validation_state !== "REJECTED" ? top : null;
  if (doc == null || doc.kind !== expectedKind) {
    return [];
  }
  const rows = await chunksByRowId(sql, doc.id);
  return matchQuestion(rows, qnum, partAtom)
    .slice(0, cap)
    .map((chunk) => evidence(doc, chunk));
}

// ── tier 2: question-card anchor (:340-373) ─────────────────────────────────

async function cardAnchored(
  sql: SqlFn,
  query: string,
  parsed: ParsedFetchQuery,
  scope: ResolverScope,
): Promise<EvidenceItem[]> {
  if (
    parsed == null ||
    parsed.qnum == null ||
    parsed.year == null ||
    parsed.series == null ||
    parsed.series.trim() === ""
  ) {
    return []; // not a bindable paper-style ask
  }
  const subject = subjectCode(scope);
  const units = unitCandidates(parsed, query);
  if (subject == null || units.length === 0) {
    return [];
  }
  for (const code of [subject, "4CH0"]) {
    // 4CH0 = legacy alias, second
    for (const unit of units) {
      const fileName = `qcard-${code}-${unit}-${parsed.series}-${parsed.year}.txt`;
      const top = await findTopByFileName(sql, fileName);
      const card = top != null && servesUnderServingLaw(top) ? top : null;
      if (card == null) {
        continue;
      }
      const rows = await chunksByRowId(sql, card.id);
      const matched = matchQuestion(rows, parsed.qnum, partAtomOf(parsed));
      if (matched.length > 0) {
        return matched.slice(0, MAX_CARD_ITEMS).map((chunk) => evidence(card, chunk));
      }
    }
  }
  return [];
}

// ── tier 2b: content-store paper anchor (:375-464) ──────────────────────────

/**
 * The ingested QUESTION_PAPER / MARK_SCHEME documents of the exact paper
 * identity the ask binds (:377-399). Question cards are metadata pointers
 * (marks + truncated stem, never answer-bearing); the paired QP/MS chunks
 * are the question's own stem and mark-scheme answers, so they pin as lead
 * evidence right after the card — with or without a surviving card.
 *
 * Identity is the V33 chunk mirror (series + year + paper code, e.g.
 * "4CH1/1C" for "jan 2022 question 4 paper 1"): exact column matching, no
 * content regex — a 1C ask can never bind a 2C/2CR/1CR document, and
 * wrong-paper front-matter chunks (the 09-26 live-pool pollution) are
 * structurally excluded. Exactly one unit wins (the first unit candidate
 * with an accepted document — the card tier's first-match-wins posture);
 * the scope subject code outranks the legacy alias; QP items precede MS
 * items.
 *
 * Serving law (branch-2 posture, the card tier's gate): only the VALIDATED
 * top version of a candidate document pins — SUGGESTED and REJECTED rows
 * are invisible. Both kinds pin whenever the identity binds. Failure is
 * honest and local: a store error keeps the card-tier evidence and serves
 * it alone.
 */
async function contentStoreAnchored(
  sql: SqlFn,
  query: string,
  parsed: ParsedFetchQuery,
  scope: ResolverScope,
): Promise<EvidenceItem[]> {
  if (
    parsed == null ||
    parsed.qnum == null ||
    parsed.year == null ||
    parsed.series == null ||
    parsed.series.trim() === ""
  ) {
    return []; // not a bindable paper-style ask
  }
  try {
    const subject = subjectCode(scope);
    const units = unitCandidates(parsed, query);
    if (subject == null || units.length === 0) {
      return [];
    }
    const codes = paperCodes(subject, units);
    const identityRows = await findRowIdsByPaperIdentity(sql, parsed.series, parsed.year, codes);
    if (identityRows.length === 0) {
      return [];
    }
    // LinkedHashMap putIfAbsent parity: first occurrence wins, insertion
    // order preserved (:419-422)
    const matchedCode = new Map<string, string>();
    for (const row of identityRows) {
      if (!matchedCode.has(row.rowId)) {
        matchedCode.set(row.rowId, row.paperCode);
      }
    }
    const accepted: DocumentRow[] = [];
    for (const rowId of matchedCode.keys()) {
      const row = await findDocumentById(sql, rowId);
      const doc = row;
      if (doc == null || !servesUnderServingLaw(doc)) {
        continue; // branch-2 gate: SUGGESTED/REJECTED rows never pin
      }
      if (doc.kind !== KIND_QUESTION_PAPER && doc.kind !== KIND_MARK_SCHEME) {
        continue; // question cards resolve through the card tier
      }
      const top = await findTopByDocumentId(sql, doc.document_id);
      if (top == null || rowId !== top.id) {
        continue; // a superseded version row never pins; the top one does
      }
      accepted.push(doc);
    }
    if (accepted.length === 0) {
      return [];
    }
    // :444-447 — unitIndex asc, subject-prefix outranks the legacy alias,
    // docVersion desc
    accepted.sort((a, b) => {
      const uiA = unitIndex(units, unitOf(matchedCode.get(a.id) ?? ""));
      const uiB = unitIndex(units, unitOf(matchedCode.get(b.id) ?? ""));
      if (uiA !== uiB) return uiA - uiB;
      const pA = (matchedCode.get(a.id) ?? "").startsWith(`${subject}/`) ? 0 : 1;
      const pB = (matchedCode.get(b.id) ?? "").startsWith(`${subject}/`) ? 0 : 1;
      if (pA !== pB) return pA - pB;
      return b.doc_version - a.doc_version;
    });
    const boundUnit = unitOf(matchedCode.get(accepted[0]!.id) ?? "");
    const bound = accepted.filter(
      (d) => unitOf(matchedCode.get(d.id) ?? "") === boundUnit,
    );
    const items: EvidenceItem[] = [];
    const partAtom = partAtomOf(parsed);
    await pinKind(
      sql,
      bound,
      KIND_QUESTION_PAPER,
      parsed.qnum,
      partAtom,
      parsed.msSeeking ? MAX_STORE_QP_ITEMS_SEEKING : MAX_STORE_QP_ITEMS,
      items,
    );
    await pinKind(
      sql,
      bound,
      KIND_MARK_SCHEME,
      parsed.qnum,
      partAtom,
      parsed.msSeeking ? MAX_STORE_MS_ITEMS_SEEKING : MAX_STORE_MS_ITEMS,
      items,
    );
    return items;
  } catch (e) {
    // :459-463 — a store error keeps the card-tier evidence and serves it
    // alone (fail-closed under a parsed identity: the guard still fires)
    return [];
  }
}

/** Scope subject first, legacy alias second, units in candidate order
 *  (:466-478). */
function paperCodes(subjectCode: string, unitCandidates: string[]): string[] {
  const codes: string[] = [];
  for (const code of [subjectCode, "4CH0"]) {
    for (const unit of unitCandidates) {
      const candidate = `${code}/${unit}`;
      if (!codes.includes(candidate)) {
        codes.push(candidate);
      }
    }
  }
  return codes;
}

/** Match the question's chunks in each document of one kind, capped in
 *  total (:480-497). */
async function pinKind(
  sql: SqlFn,
  docs: DocumentRow[],
  kind: string,
  qnum: number,
  partAtom: string | null,
  cap: number,
  items: EvidenceItem[],
): Promise<void> {
  let pinned = 0;
  for (const doc of docs) {
    if (doc.kind !== kind || pinned >= cap) {
      continue;
    }
    for (const chunk of matchQuestion(await chunksByRowId(sql, doc.id), qnum, partAtom)) {
      if (pinned >= cap) {
        break;
      }
      items.push(evidence(doc, chunk));
      pinned++;
    }
  }
}

/** "4CH1/1C" → candidate-list index of "1C"; unknown units sort last
 *  (:499-503). */
function unitIndex(unitCandidates: string[], paperCode: string): number {
  const idx = unitCandidates.indexOf(unitOf(paperCode));
  return idx < 0 ? Number.MAX_SAFE_INTEGER : idx;
}

/** "4CH1/1C" → "1C" (:505-509). */
function unitOf(paperCode: string): string {
  const cut = paperCode.indexOf("/");
  return cut < 0 ? paperCode : paperCode.substring(cut + 1);
}

/** Scope code "4CH1-2017" → subject code "4CH1" (the card file-name
 *  prefix) (:511-520). */
export function subjectCode(scope: ResolverScope): string | null {
  const code = scope.code;
  if (code == null || code.trim() === "") {
    return null;
  }
  const dash = code.indexOf("-");
  const subject = dash < 0 ? code : code.substring(0, dash);
  return subject.trim() === "" ? null : subject;
}

/**
 * Unit binding, deterministic (:522-545): explicit full code → exact unit;
 * explicit bare unit → exact unit; "paper N" phrasing → home unit then
 * regional variant; nothing → both home units then both regional variants
 * (only a single surviving card with a question match is pinned — first
 * match wins by construction, so a corpus holding exactly one session
 * paper resolves and a corpus holding several stays honest via the first).
 */
export function unitCandidates(parsed: ParsedFetchQuery, query: string): string[] {
  if (parsed.paperCode != null) {
    const unit = unitFromPaperCode(parsed.paperCode);
    if (unit != null) {
      return [unit];
    }
  }
  if (parsed.unit != null && parsed.unit.trim() !== "") {
    return [parsed.unit.trim().toUpperCase()];
  }
  const m = PAPER_HINT.exec(query ?? "");
  if (m) {
    return m[1] === "1" ? ["1C", "1CR"] : ["2C", "2CR"];
  }
  return ["1C", "2C", "1CR", "2CR"];
}

/** "4CH1/2C" or "4CH0-1CR" → "2C" / "1CR" (separator and spaces tolerant)
 *  (:547-553). */
export function unitFromPaperCode(paperCode: string): string | null {
  const cut = Math.max(paperCode.lastIndexOf("/"), paperCode.lastIndexOf("-"));
  const unit = (cut < 0 ? paperCode : paperCode.substring(cut + 1))
    .replace(/ /g, "")
    .toUpperCase();
  return /^[12]CR?$/.test(unit) ? unit : null;
}

// ── question-chunk selection (:555-628) ─────────────────────────────────────

/**
 * The chunks of a per-question document that carry the asked question
 * number (:557-597): the atomNumber column first (authoritative when
 * populated), question-number markers in the text as the fallback. Never
 * more than a few rows — the pool must keep room for the retrieval arms.
 *
 * Part-level asks (2026-10-04 parser feature): when the ask bound a part —
 * partAtom like "9-b" or "9-b-ii" — chunks whose atom equals the ref
 * exactly are preferred, narrowing the pins to that printed sub-part. The
 * store's atom column is question-level today (the parser emits "q9"-style
 * group keys only), so the exact-part match usually misses and selection
 * falls back to the question-level result — a part-level ask refines pins
 * ONLY where part atoms exist, never starves them (honouring the PR #72
 * contract: every part of a resolved question's mark scheme pins).
 */
export function matchQuestion(rows: ChunkRow[], qnum: number, partAtom: string | null): ChunkRow[] {
  if (partAtom != null) {
    const ref = partAtom.trim().toLowerCase();
    const byPart = rows.filter(
      (c) => c.atom_number != null && ref === c.atom_number.trim().toLowerCase(),
    );
    if (byPart.length > 0) {
      return byPart;
    }
    // no part-level atoms in this document — question-level selection below
  }
  const byAtom = rows.filter((c) => atomMatches(c.atom_number, qnum));
  if (byAtom.length > 0) {
    return byAtom.length <= 3 ? byAtom : byAtom.slice(0, 3);
  }
  return rows.filter((c) => contentMarks(c.content, qnum)).slice(0, 3);
}

/** "q10", "10-a", "010" all normalize to 10; null/other questions never
 *  match (:599-606). */
export function atomMatches(atomNumber: string | null, qnum: number): boolean {
  if (atomNumber == null) {
    return false;
  }
  const m = /q?\s*0*(\d+)/.exec(atomNumber.trim().toLowerCase());
  return m != null && parseInt(m[1]!, 10) === qnum;
}

/**
 * Text markers that a chunk is about question N (:608-628):
 *   1. "question 10" (QP and card prose) — but never the "Total for
 *      Question 10" footer of the previous question;
 *   2. "10 (a)" / "10(a)" — the QP header with a part letter;
 *   3. "10 | (a)" — the MS answer-table row.
 */
export function contentMarks(content: string | null, qnum: number): boolean {
  if (content == null || content.trim() === "") {
    return false;
  }
  const n = String(qnum);
  // Java "(?i)" inline flag → the JS `i` flag argument (JS has no inline flags)
  const prose = new RegExp(`(?<!total for )\\bquestion\\s*0*${n}\\b`, "i");
  const header = new RegExp(`\\b0*${n}\\s*\\((?=[a-h]\\))`);
  const table = new RegExp(`\\b0*${n}\\s*\\|\\s*\\(`);
  return prose.test(content) || header.test(content) || table.test(content);
}

// ── serving law + evidence construction (:630-648) ──────────────────────────

/**
 * The T-C20 learner-serving gate, branch 2 (knowledge-layer / document
 * branch — used by the card tier): a VALIDATED document serves; a
 * SUGGESTED or REJECTED one never does (:632-640). The paper branch
 * (tier 1) does NOT go through here — see documentQuestionChunks.
 */
function servesUnderServingLaw(doc: DocumentRow): boolean {
  return doc.validation_state === "VALIDATED";
}

/** EvidenceItem.fromChunk with the resolver's fixed provenance :642-648:
 *  retrievalScore = 1.0 (a deterministic bind, not a similarity), the
 *  embedding-model slot carries the provenance tag. */
function evidence(doc: DocumentRow, chunk: ChunkRow): EvidenceItem {
  return evidenceFromChunk({
    documentRowId: doc.id,
    documentId: doc.document_id,
    documentVersion: doc.doc_version,
    chunkId: chunk.id,
    chunkIndex: chunk.chunk_index,
    kind: doc.kind,
    content: chunk.content,
    pageStart: chunk.page_start,
    pageEnd: chunk.page_end,
    elementIds: jsonbStringArray(chunk.element_ids),
    embeddingModel: "paper-question-resolver",
    cosine: 1.0,
  });
}

/** jsonb element_ids — the driver may hand an array or a JSON string. */
function jsonbStringArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string" && raw.trim() !== "") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      /* fall through to the honest empty */
    }
  }
  return [];
}

// ── the orchestrator (:183-234, async over the DB ports) ────────────────────

async function resolveWithVerdict(
  sql: SqlFn,
  bank: TutorFetchPort,
  query: string | null,
  scope: ResolverScope | null,
): Promise<PaperResolutionResult> {
  if (query == null || query.trim() === "" || scope == null) {
    return { items: [], identityParsed: false, identityLabel: null };
  }
  let fetch: BankFetchResult;
  try {
    fetch = await bank(query, scope);
  } catch (e) {
    // L3 (audit 2026-10-02) :191-208 — a fetch failure used to degrade the
    // whole verdict to notPaperAsk, disarming the fail-open guard exactly
    // when the corpus was unavailable. The parse is a pure in-memory step
    // (FetchQueryParser.parse), so the identity verdict is recovered
    // locally: a COMPLETE identity under a DB error is a KNOWN state
    // (nothing bound — the store could not be asked), and the guard's
    // deterministic paper refusal fires instead of the ask silently
    // degrading to generic retrieval. A query that does not parse a
    // complete identity keeps the legacy honest fallback (the vector+KG
    // path serves).
    const reparsed = parseFetchQuery(query);
    if (completeIdentity(reparsed)) {
      return { items: [], identityParsed: true, identityLabel: identityLabel(reparsed, query) };
    }
    return { items: [], identityParsed: false, identityLabel: null };
  }

  const parsed = fetch.parsed;
  const identityParsed = completeIdentity(parsed);
  try {
    const bankAnchoredItems = await bankAnchoredAsync(sql, fetch);
    if (bankAnchoredItems.length > 0) {
      return {
        items: bankAnchoredItems,
        identityParsed: true,
        identityLabel: identityLabel(parsed, query),
      };
    }
    const pinned: EvidenceItem[] = [...(await cardAnchored(sql, query, parsed, scope))];
    pinned.push(...(await contentStoreAnchored(sql, query, parsed, scope)));
    return {
      items: pinned,
      identityParsed,
      identityLabel: identityParsed ? identityLabel(parsed, query) : null,
    };
  } catch (e) {
    if (identityParsed) {
      // L3 :224-229 — the anchor state is KNOWN-bad mid-flight
      // (infrastructure failure after a complete identity parsed) — the
      // fail-open guard refuses deterministically; the verdict is never
      // downgraded to "not a paper ask"
      return { items: [], identityParsed: true, identityLabel: identityLabel(parsed, query) };
    }
    // anchor state unknown mid-flight — never gate the ask on unknown
    return { items: [], identityParsed: false, identityLabel: null };
  }
}

/** bankAnchored with the async chunk reads awaited (the frozen tier is
 *  synchronous over already-loaded repositories; the v2 sql port awaits). */
async function bankAnchoredAsync(sql: SqlFn, fetch: BankFetchResult): Promise<EvidenceItem[]> {
  const parsed = fetch.parsed;
  if (parsed.qnum == null || fetch.ambiguous || fetch.parseDefect || fetch.papers.length !== 1) {
    return [];
  }
  const paper: BankPaperHit = fetch.papers[0]!;
  if (paper.validationState !== "VALIDATED") {
    return []; // serving law: SUGGESTED bank rows never serve to learners
  }
  const items: EvidenceItem[] = [];
  const partAtom = partAtomOf(parsed);
  if (paper.qpDocumentId != null) {
    items.push(
      ...(await documentQuestionChunksAsync(
        sql,
        paper.qpDocumentId,
        parsed.qnum,
        partAtom,
        KIND_QUESTION_PAPER,
        MAX_QP_ITEMS,
      )),
    );
  }
  if (parsed.msSeeking && paper.msDocumentId != null) {
    items.push(
      ...(await documentQuestionChunksAsync(
        sql,
        paper.msDocumentId,
        parsed.qnum,
        partAtom,
        KIND_MARK_SCHEME,
        MAX_MS_ITEMS_SEEKING,
      )),
    );
  }
  return items;
}

/**
 * buildPaperQuestionResolver — the composition root for the REQUIRED
 * port (module factory header, tranche-1 disclosure): the sql-backed bank
 * + document/chunk reads behind the PaperQuestionResolver seam. Routes
 * (tranche-2) wire this; tests may inject fakes. There is deliberately NO
 * "notPaperAsk" default in the factory — defaulting would disable the
 * fail-open guard without anyone deciding to.
 */
export function buildPaperQuestionResolver(sql: SqlFn) {
  const bank = buildTutorFetchBank(sql);
  return async (
    retrievalQueryText: string,
    scope: ResolverScope,
  ): Promise<PaperResolutionResult> => resolveWithVerdict(sql, bank, retrievalQueryText, scope);
}

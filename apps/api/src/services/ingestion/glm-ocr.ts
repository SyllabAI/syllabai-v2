/**
 * GlmOcrDraftMapper + GlmOcrIngestionService ports — the T-C02 controlled
 * bridge (T-MIG-082 tranche B2). Byte-faithful ports of the frozen
 * teacher/ingestion/GlmOcrDraftMapper.java (267 lines) and
 * teacher/ingestion/GlmOcrIngestionService.java (321 lines) @ 6cad6ef,
 * verified line-against-line 2026-10-07.
 *
 * ONE entry point, ONE transaction: parser canonical QP+MS JSON → the T-013
 * store (validate → checksum dedup → JSONB → deterministic chunks — never
 * embeds) → the drafts mapped onto the T-011 past-paper draft (every row
 * SUGGESTED, the ingestion-anchor topic) → the V13 bridge record (verbatim
 * drafts + reconciliation + assembled findings — nothing discarded).
 *
 * Determinism: canonical document ids are the parser's derived identities
 * (checksum+engine+version); reruns resolve to the existing rows and report
 * DUPLICATE — never a second copy. embeddingSkipped is ALWAYS true.
 *
 * Mapping decisions (docs/t-c02-bridge.md, nothing inferred):
 *   - paper identity from the QP side first (session + paperReference), MS
 *     fallback (MS covers of newer series print the PUBLICATION month);
 *     subject is NEVER inferred from the paper code (T-011 resolves an
 *     honest generic subject; teachers remap in review);
 *   - mark points: MS entries split on "(N)" markers → one point each;
 *     entries with no markers → ONE whole-entry point (every question keeps
 *     its marking evidence); unknown marks (null) materialize as 0 — never
 *     a guess;
 *   - part refs: MS labels "13(b)(i)" → refs "13-b-i" (mechanical
 *     re-formatting of the printed structure);
 *   - command words are NOT guessed from stems;
 *   - the parser's reconciliation is CONSUMED verbatim — never re-implemented.
 */
import type { SqlFn } from "../identity/users";
import { ConflictException } from "../identity/errors";
import type {
  CanonicalDocument,
  GlmPaperDraft,
  GlmMarkSchemeDraft,
  GlmReconciliation,
  PastPaperDraft,
} from "@syllabai/contracts";
import {
  ingestCanonicalDocument,
  findDocumentByChecksum,
  type IngestionResult,
} from "./canonical";
import { ingestPastPaperDraft } from "./past-paper";

export const BRIDGE_METHOD = "glm-ocr-qp-v1+glm-ocr-ms-v1";

export interface ReviewFinding {
  source: string | null;
  severity: string | null;
  questionNumber: string | null;
  qpMarks: number | null;
  msMarks: number | null;
  detail: string | null;
}

// ── the mapper (:44-251) ─────────────────────────────────────────────────────

/** MS part string "bi" (parens already stripped) → QP label convention "b-i". */
const LETTER_THEN_ROMAN = /^([a-h])([ivx]+)$/;

/** "a" → "a"; "bi" → "b-i" (letter + roman subpart, QP label convention) (:237-246). */
export function normalizePart(part: string | null): string {
  if (part == null || part.trim() === "") return "x";
  const m = LETTER_THEN_ROMAN.exec(part);
  if (m) return `${m[1]}-${m[2]}`;
  return part;
}

/**
 * MS entry label → T-011 mark-point ref (:223-234): "11" → "11"
 * (question-level); "13(a)" → "13-a"; "*14" strips the leading QWC
 * asterisk; "13(b)(i)" → "13-b-i".
 */
export function markPointRef(entry: {
  label: string | null;
  number: number;
}): string {
  const printed = entry.label === null ? String(entry.number) : entry.label;
  const noStar = printed.startsWith("*") ? printed.slice(1) : printed;
  const paren = noStar.indexOf("(");
  const number = String(entry.number);
  if (paren < 0) return noStar.trim() === "" ? number : noStar;
  const part = noStar.slice(paren).replace(/[()]/g, "");
  return `${number}-${normalizePart(part)}`;
}

/**
 * GLM-OCR QP + MS drafts → the T-011 past-paper draft (:56-141). Fed
 * straight into ingestPastPaperDraft — every SUGGESTED validation
 * guarantee of that path applies unchanged.
 */
export function toPastPaperDraft(
  qpDraft: GlmPaperDraft,
  msDraft: GlmMarkSchemeDraft,
): PastPaperDraft {
  const qpMeta = qpDraft.paper;
  const msMeta = msDraft.paper;

  // Session and paper reference come from the QUESTION PAPER side first
  // (:61-70); the MS session is only a fallback for papers whose QP cover
  // the OCR lost entirely.
  const session =
    qpMeta !== null && qpMeta.session !== null
      ? qpMeta.session
      : msMeta === null
        ? null
        : msMeta.session;
  const paperReference =
    qpMeta !== null && qpMeta.paperReference !== null
      ? qpMeta.paperReference
      : msMeta === null
        ? null
        : msMeta.paperReference;

  const paper: PastPaperDraft["paper"] = {
    board: msMeta === null ? null : msMeta.board,
    qualification: msMeta === null ? null : msMeta.qualification,
    subject: null, // subject: never inferred
    unit: null, // unit: not extracted
    sessionLabel: session,
    paperCode: paperReference,
    questionPaperDocumentId: qpMeta === null ? null : qpMeta.canonicalDocumentId,
    markSchemeDocumentId: msMeta === null ? null : msMeta.canonicalDocumentId,
  };

  const questions: PastPaperDraft["questions"] = [];
  for (const q of qpDraft.questions) {
    const parts = q.parts.map((p) => ({
      label: p.label,
      prompt: p.text === null ? "" : p.text,
      commandWord: null, // command word: not guessed
      marks: p.marks === null ? 0 : p.marks, // null = unknown, not zero-credit
      confidence: p.confidence,
    }));
    questions.push({
      externalRef: q.questionId,
      questionNumber: String(q.number),
      prompt: q.stem === null ? "" : q.stem,
      commandWord: null, // command word: not guessed
      marks: q.marks,
      questionType: null, // T-011 ingests STRUCTURED
      pageNumber: 1, // GLM-OCR Markdown exports are single-page
      confidence: q.confidence,
      parts,
    });
  }

  const points: NonNullable<PastPaperDraft["markScheme"]>["points"] = [];
  for (const entry of msDraft.entries) {
    const ref = markPointRef({ label: entry.label, number: entry.number });
    if (entry.markPoints.length === 0) {
      // no "(N)" markers in the cell: the whole entry is the marking
      // statement (MCQ rationale rows, unsplit cells) — one point keeps it
      points.push({
        questionRef: ref,
        order: 0,
        text: entry.answerText === null ? "" : entry.answerText,
        marks: entry.marks === null ? 0 : entry.marks,
        acceptance: [],
        confidence: entry.confidence,
      });
    } else {
      for (const mp of entry.markPoints) {
        points.push({
          questionRef: ref,
          order: mp.ordinal - 1,
          text: mp.text === null ? "" : mp.text,
          marks: mp.marks === null ? 0 : mp.marks,
          acceptance: [],
          confidence: entry.confidence,
        });
      }
    }
  }

  const scheme: PastPaperDraft["markScheme"] = {
    version: "1",
    sourceDocumentId: msMeta === null ? null : msMeta.canonicalDocumentId,
    points,
    generalGuidance: null,
  };

  return {
    schemaVersion: PastPaperDraftSUPPORTED_SCHEMA,
    paper,
    questions,
    markScheme: scheme,
    extractionMethod: BRIDGE_METHOD,
    reviewRequired: qpDraft.reviewRequired || msDraft.reviewRequired,
  };
}

const PastPaperDraftSUPPORTED_SCHEMA = "1.0";

function nullSafeFallback(value: string | null, fallback: string): string {
  return value == null || value.trim() === "" ? fallback : value;
}

/**
 * Assembles the review-visible findings for the bridge record (:149-181):
 * the parser reconciliation findings verbatim, the paper-total conflict (if
 * any), the QP/MS draft warnings, and the duplicate-part-label findings.
 * Parser warnings are relayed, never repaired.
 */
export function assembleReviewFindings(
  qpDraft: GlmPaperDraft,
  msDraft: GlmMarkSchemeDraft,
  reconciliation: GlmReconciliation,
): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  for (const f of reconciliation.findings) {
    findings.push({
      source: "RECONCILIATION",
      severity: f.severity,
      questionNumber: f.questionNumber,
      qpMarks: f.qpMarks,
      msMarks: f.msMarks,
      detail: `Q${f.questionNumber ?? "?"}: QP total ${f.qpMarks ?? "unknown"} vs MS total ${
        f.msMarks ?? "unknown"
      } (${f.severity ?? "?"})`,
    });
  }
  if (reconciliation.paperTotalConflict) {
    findings.push({
      source: "RECONCILIATION",
      severity: "paper-total-conflict",
      questionNumber: null,
      qpMarks: reconciliation.qpPaperTotal,
      msMarks: reconciliation.msPaperTotal,
      detail: `QP paper total ${reconciliation.qpPaperTotal} vs MS paper total ${reconciliation.msPaperTotal} — both preserved, never merged (evidence-first)`,
    });
  }
  for (const warning of qpDraft.warnings) {
    findings.push({
      source: "QP_WARNING", severity: "warning", questionNumber: null,
      qpMarks: null, msMarks: null, detail: warning,
    });
  }
  for (const warning of msDraft.warnings) {
    findings.push({
      source: "MS_WARNING", severity: "warning", questionNumber: null,
      qpMarks: null, msMarks: null, detail: warning,
    });
  }
  findings.push(...duplicatePartLabelFindings(qpDraft));
  return findings;
}

/**
 * Parser fragmentation findings (:191-217): the same part label appearing
 * twice within one question. The persistence layer keeps both rows and
 * suffixes later labels deterministically (b-ii → b-ii.2); this finding
 * tells the reviewer WHERE that happened.
 */
export function duplicatePartLabelFindings(qpDraft: GlmPaperDraft): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  for (const q of qpDraft.questions) {
    const counts = new Map<string, number>();
    for (const p of q.parts) {
      if (p.label !== null) counts.set(p.label, (counts.get(p.label) ?? 0) + 1);
    }
    for (const [label, count] of counts) {
      if (count > 1) {
        findings.push({
          source: "QP_WARNING",
          severity: "duplicate-part-label",
          questionNumber: String(q.number),
          qpMarks: null,
          msMarks: null,
          detail: `Q${q.number}: part label '${label}' occurs ${count}x (parser fragmentation) — later rows relabelled '${label}.2', '.3' … for review; merge or reject`,
        });
      }
    }
  }
  return findings;
}

// ── the bridge service (:54-320) ─────────────────────────────────────────────

export interface GlmPairRequestTyped {
  qpCanonical: CanonicalDocument;
  qpCanonicalJson: string;
  msCanonical: CanonicalDocument;
  msCanonicalJson: string;
  qpDraft: GlmPaperDraft;
  msDraft: GlmMarkSchemeDraft;
  reconciliation: GlmReconciliation;
}

export interface GlmPairResult {
  qpDocument: { duplicate: boolean; documentId: string; rowId: string; chunks: number };
  msDocument: { duplicate: boolean; documentId: string; rowId: string; chunks: number };
  examPaper: { duplicate: boolean; paperId: string; title: string | null };
  questions: number;
  parts: number;
  markSchemes: number;
  markPoints: number;
  qpChunks: number;
  msChunks: number;
  reconciliation: {
    status: string;
    mismatchCount: number;
    paperTotalConflict: boolean;
    qpPaperTotal: number | null;
    msPaperTotal: number | null;
  };
  reviewFindings: ReviewFinding[];
  embeddingSkipped: boolean;
}

/**
 * Fail-loud bundle checks (:186-221, never guess): the drafts must
 * reference the very canonical documents supplied, and the reconciliation
 * must be ABOUT this pair (its paper totals must match the drafts it
 * claims to reconcile). A null component is the requireNonNull NPE → the
 * catch-all 500 (the caller-side typed parse rejects it earlier only if
 * the SUBTREE is malformed — a JSON null subtree passes z.unknown and
 * reaches here, exactly like Jackson).
 */
function validateBundle(pair: GlmPairRequestTyped): void {
  for (const [name, value] of [
    ["qpCanonical", pair.qpCanonical],
    ["msCanonical", pair.msCanonical],
    ["qpDraft", pair.qpDraft],
    ["msDraft", pair.msDraft],
    ["reconciliation", pair.reconciliation],
  ] as const) {
    if (value == null) {
      // Objects.requireNonNull → NPE → the unhandled 500
      throw new Error(`${name} is required`);
    }
  }
  const qpDocId = pair.qpCanonical.documentId;
  const msDocId = pair.msCanonical.documentId;
  const qpClaimed = pair.qpDraft.paper === null ? null : pair.qpDraft.paper.canonicalDocumentId;
  const msClaimed = pair.msDraft.paper === null ? null : pair.msDraft.paper.canonicalDocumentId;
  if (qpClaimed === null || qpClaimed !== qpDocId) {
    throw new ConflictException(
      `qp draft claims canonical document ${qpClaimed} but the supplied QP canonical document is ${qpDocId} — the bundle mixes documents from different sources`,
    );
  }
  if (msClaimed === null || msClaimed !== msDocId) {
    throw new ConflictException(
      `ms draft claims canonical document ${msClaimed} but the supplied MS canonical document is ${msDocId} — the bundle mixes documents from different sources`,
    );
  }
  if (pair.reconciliation.qpPaperTotal !== pair.qpDraft.paperTotal) {
    throw new ConflictException(
      `reconciliation qpPaperTotal (${pair.reconciliation.qpPaperTotal}) does not match the QP draft paperTotal (${pair.qpDraft.paperTotal}) — is this reconciliation for this pair?`,
    );
  }
  if (pair.reconciliation.msPaperTotal !== pair.msDraft.paperTotal) {
    throw new ConflictException(
      `reconciliation msPaperTotal (${pair.reconciliation.msPaperTotal}) does not match the MS draft paperTotal (${pair.msDraft.paperTotal}) — is this reconciliation for this pair?`,
    );
  }
}

interface BridgeRecordRow {
  paperId: string;
  qpDocumentId: string;
  msDocumentId: string;
  reconciliationStatus: string;
  reviewFindings: string;
  reconciliation: string;
}

/** rerun spine lookup: findByQpDocumentIdAndMsDocumentId (uq_glm_ocr_bridge_pair) */
async function findBridgeRecordByPair(
  sql: SqlFn,
  qpDocumentId: string,
  msDocumentId: string,
): Promise<BridgeRecordRow | null> {
  const rows = await sql`
    select paper_id, qp_document_id, ms_document_id, reconciliation_status,
           review_findings::text as review_findings, reconciliation::text as reconciliation
    from glm_ocr_bridge_records
    where qp_document_id = ${qpDocumentId} and ms_document_id = ${msDocumentId}
    limit 1`;
  if (rows.length === 0 || !rows[0]) return null;
  const r = rows[0];
  return {
    paperId: String(r.paper_id),
    qpDocumentId: String(r.qp_document_id),
    msDocumentId: String(r.ms_document_id),
    reconciliationStatus: String(r.reconciliation_status),
    reviewFindings: String(r.review_findings),
    reconciliation: String(r.reconciliation),
  };
}

/** reviewFindingsForPaper (:175-179): MISSING record = null; existing = the findings list (possibly empty). */
export async function reviewFindingsForPaper(
  sql: SqlFn,
  paperId: string,
): Promise<ReviewFinding[] | null> {
  const rows = await sql`
    select review_findings::text as review_findings
    from glm_ocr_bridge_records where paper_id = ${paperId}::uuid limit 1`;
  if (rows.length === 0 || !rows[0]) return null;
  const stored = rows[0].review_findings;
  try {
    const parsed = JSON.parse(String(stored));
    if (!Array.isArray(parsed)) throw new Error("not a list");
    return parsed.map((f: Record<string, unknown>) => ({
      source: f.source == null ? null : String(f.source),
      severity: f.severity == null ? null : String(f.severity),
      questionNumber: f.questionNumber == null ? null : String(f.questionNumber),
      qpMarks: f.qpMarks == null ? null : Number(f.qpMarks),
      msMarks: f.msMarks == null ? null : Number(f.msMarks),
      detail: f.detail == null ? null : String(f.detail),
    }));
  } catch {
    throw new Error("stored review findings are unreadable");
  }
}

/**
 * ingestPair (:96-166) — ONE entry point, ONE transaction. Safe to re-run:
 * the second run reports DUPLICATE for both documents and the paper and
 * creates no new rows.
 */
export async function ingestGlmOcrPair(
  sql: SqlFn,
  pair: GlmPairRequestTyped,
  ingestedBy: string | null,
  now: Date,
): Promise<GlmPairResult> {
  validateBundle(pair);

  // Step 1 — canonical documents through the EXISTING T-013 path
  // (idempotent by source checksum; a second call reports the existing row)
  const qpDoc: IngestionResult = await ingestCanonicalDocument(
    sql, pair.qpCanonical, pair.qpCanonicalJson, "QUESTION_PAPER", ingestedBy, now,
  );
  const msDoc: IngestionResult = await ingestCanonicalDocument(
    sql, pair.msCanonical, pair.msCanonicalJson, "MARK_SCHEME", ingestedBy, now,
  );

  // Step 2 — rerun spine: an already-bridged pair resolves to its record
  const existing = await findBridgeRecordByPair(sql, qpDoc.documentId, msDoc.documentId);
  if (existing !== null) {
    return duplicatePairResult(sql, existing, qpDoc, msDoc);
  }

  // Step 3 — assessment content through the EXISTING T-011 path (all SUGGESTED)
  const t011Draft = toPastPaperDraft(pair.qpDraft, pair.msDraft);
  const created = await ingestPastPaperDraft(sql, t011Draft, ingestedBy);

  // Step 4 — the bridge record: verbatim drafts + reconciliation + findings
  const findings = assembleReviewFindings(pair.qpDraft, pair.msDraft, pair.reconciliation);
  const reconciliationStatus = pair.reconciliation.mismatchCount > 0 || pair.reconciliation.paperTotalConflict
    ? "REVIEW_REQUIRED"
    : "OK";
  await sql`
    insert into glm_ocr_bridge_records (
      id, paper_id, bridge, qp_document_id, ms_document_id,
      qp_document_row_id, ms_document_row_id, qp_checksum, ms_checksum,
      extraction_methods, reconciliation_status, review_findings,
      qp_draft, ms_draft, reconciliation, created_by, created_at
    ) values (
      ${crypto.randomUUID()}::uuid,
      ${created.paperId}::uuid,
      ${"glm-ocr-v1"},
      ${qpDoc.documentId},
      ${msDoc.documentId},
      ${qpDoc.id}::uuid,
      ${msDoc.id}::uuid,
      ${pair.qpCanonical.source!.checksum!},
      ${pair.msCanonical.source!.checksum!},
      ${BRIDGE_METHOD},
      ${reconciliationStatus},
      ${JSON.stringify(findings)}::jsonb,
      ${JSON.stringify(pair.qpDraft)}::jsonb,
      ${JSON.stringify(pair.msDraft)}::jsonb,
      ${JSON.stringify(pair.reconciliation)}::jsonb,
      ${ingestedBy}::uuid,
      ${now.toISOString()}
    )`;

  const paperRows = await sql`
    select title from exam_papers where id = ${created.paperId}::uuid limit 1`;
  const title = paperRows.length > 0 && paperRows[0]!.title != null ? String(paperRows[0]!.title) : null;
  const schemeCount = await sql`
    select count(*) as n from mark_schemes ms
    join question_versions qv on qv.id = ms.question_version_id
    join questions q on q.id = qv.question_id
    where q.exam_paper_id = ${created.paperId}::uuid`;
  const markSchemes = Number((schemeCount[0] as Record<string, unknown>)!.n);

  return {
    qpDocument: { duplicate: qpDoc.duplicate, documentId: qpDoc.documentId, rowId: qpDoc.id, chunks: qpDoc.chunks },
    msDocument: { duplicate: msDoc.duplicate, documentId: msDoc.documentId, rowId: msDoc.id, chunks: msDoc.chunks },
    examPaper: { duplicate: false, paperId: created.paperId, title },
    questions: created.questions,
    parts: created.parts,
    markSchemes,
    markPoints: created.markPoints,
    qpChunks: qpDoc.chunks,
    msChunks: msDoc.chunks,
    reconciliation: {
      status: reconciliationStatus,
      mismatchCount: pair.reconciliation.mismatchCount,
      paperTotalConflict: pair.reconciliation.paperTotalConflict,
      qpPaperTotal: pair.reconciliation.qpPaperTotal,
      msPaperTotal: pair.reconciliation.msPaperTotal,
    },
    reviewFindings: findings,
    embeddingSkipped: true, // embedding is a separate explicit T-013 operation
  };
}

/** rerun: report the state as imported (from the record), create nothing (:224-253). */
async function duplicatePairResult(
  sql: SqlFn,
  record: BridgeRecordRow,
  qpDoc: IngestionResult,
  msDoc: IngestionResult,
): Promise<GlmPairResult> {
  const paperId = record.paperId;
  const versionRows = await sql`
    select qv.id, qv.question_id from question_versions qv
    join questions q on q.id = qv.question_id
    where q.exam_paper_id = ${paperId}::uuid`;
  let parts = 0;
  for (const v of versionRows) {
    const n = await sql`
      select count(*) as n from question_parts where question_version_id = ${String(v.id)}::uuid`;
    parts += Number((n[0] as Record<string, unknown>)!.n);
  }
  const schemeRows = await sql`
    select ms.id from mark_schemes ms
    join question_versions qv on qv.id = ms.question_version_id
    join questions q on q.id = qv.question_id
    where q.exam_paper_id = ${paperId}::uuid`;
  let points = 0;
  for (const s of schemeRows) {
    const n = await sql`
      select count(*) as n from mark_points where mark_scheme_id = ${String(s.id)}::uuid`;
    points += Number((n[0] as Record<string, unknown>)!.n);
  }
  const paperRows = await sql`
    select title from exam_papers where id = ${paperId}::uuid limit 1`;
  const title = paperRows.length > 0 && paperRows[0]!.title != null ? String(paperRows[0]!.title) : null;
  const findings = deserializeFindings(record.reviewFindings);
  const imported = JSON.parse(record.reconciliation) as {
    mismatchCount?: number;
    paperTotalConflict?: boolean;
    qpPaperTotal?: number | null;
    msPaperTotal?: number | null;
  };

  return {
    qpDocument: { duplicate: qpDoc.duplicate, documentId: qpDoc.documentId, rowId: qpDoc.id, chunks: qpDoc.chunks },
    msDocument: { duplicate: msDoc.duplicate, documentId: msDoc.documentId, rowId: msDoc.id, chunks: msDoc.chunks },
    examPaper: { duplicate: true, paperId, title },
    questions: versionRows.length,
    parts,
    markSchemes: schemeRows.length,
    markPoints: points,
    qpChunks: qpDoc.chunks,
    msChunks: msDoc.chunks,
    reconciliation: {
      status: record.reconciliationStatus,
      mismatchCount: imported.mismatchCount ?? 0,
      paperTotalConflict: imported.paperTotalConflict ?? false,
      qpPaperTotal: imported.qpPaperTotal ?? null,
      msPaperTotal: imported.msPaperTotal ?? null,
    },
    reviewFindings: findings,
    embeddingSkipped: true, // embedding intentionally skipped on reruns too
  };
}

function deserializeFindings(stored: string): ReviewFinding[] {
  try {
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) throw new Error("not a list");
    return parsed.map((f: Record<string, unknown>) => ({
      source: f.source == null ? null : String(f.source),
      severity: f.severity == null ? null : String(f.severity),
      questionNumber: f.questionNumber == null ? null : String(f.questionNumber),
      qpMarks: f.qpMarks == null ? null : Number(f.qpMarks),
      msMarks: f.msMarks == null ? null : Number(f.msMarks),
      detail: f.detail == null ? null : String(f.detail),
    }));
  } catch {
    throw new Error("stored review findings are unreadable");
  }
}

// the reconciliation reviewRequired derivation (GlmOcrReconciliationDto :55-57)
export function reconciliationReviewRequired(r: GlmReconciliation): boolean {
  return r.mismatchCount > 0 || r.paperTotalConflict;
}


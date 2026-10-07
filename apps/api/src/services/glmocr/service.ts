/**
 * GlmOcrIngestionService port — the controlled bridge from VERIFIED GLM-OCR
 * parser outputs into the existing ingestion fabric (T-MIG-089; frozen
 * source: teacher/ingestion/GlmOcrIngestionService.java @ 6cad6ef, plus
 * GlmOcrBridgeRecord.java / GlmOcrBridgeRecordRepository.java — the OBSERVED
 * repository call sequence, R-LAZY doctrine).
 *
 * One pair, one entry point (the frozen :97-166 sequence):
 *   parser canonical QP JSON ┐
 *   parser canonical MS JSON ┴→ ContentIngestionService (T-013: validate →
 *                              checksum dedup → JSONB → deterministic chunks)
 *                              [NEVER embeds]
 *   parser QP draft ┐
 *   parser MS draft ┴→ GlmOcrDraftMapper → PastPaperIngestionService (T-011:
 *                      ExamPaper/Question/QuestionVersion/QuestionPart/
 *                      MarkScheme/MarkPoint, all SUGGESTED)
 *   parser reconciliation ─→ preserved verbatim + assembled review findings
 *                      └→ glm_ocr_bridge_records (V13) — nothing discarded
 *
 * DETERMINISM: canonical document ids are the parser's deterministic
 * identities (checksum + engine + version); the bridge never generates one.
 * Reruns resolve to the existing rows and report everything as DUPLICATE.
 *
 * WRITE-BAND SEAM (honest, disclosed): the two UPSTREAM ingestion services
 * (T-013 ContentIngestionService + T-011 PastPaperIngestionService) are
 * separate porting families — the v2 content write surfaces answer 501
 * "owned by T-MIG-023" today (routes/content/index.ts). The composition
 * root therefore wires this service WITHOUT the two ports and the route
 * answers the honest 501 after the deterministic prefix (binding → bundle
 * validation). The full call sequence below is ported and test-gated so the
 * flip to a 201-backed surface is a wire-up, never a rewrite. THIS IS NOT
 * AN LLM SEAM — the GLM-OCR bridge is deterministic parser-output
 * plumbing; no provider call exists anywhere in the frozen family (ADR-023
 * is unaffected: the bridge never generates).
 *
 * DB reality (packages/db/src/schema/schema.ts:982-1010): glm_ocr_bridge_records
 * exists in the Flyway-frozen baseline (uq_glm_ocr_bridge_pair + unique
 * paper_id + the OK/REVIEW_REQUIRED/SUPERSEDED check) — NO drizzle migration.
 */
import type { GlmOcrFindingView, GlmOcrPairRequest } from "@syllabai/contracts";
import type { PastPaperDraft } from "@syllabai/contracts";
import { ConflictException } from "../identity/errors";
import { assembleReviewFindings, BRIDGE_METHOD, toPastPaperDraft } from "./draft-mapper";
import type { SqlFn } from "./sql";

/** Document.Kind names (Document.java) — the T-013 kinds the bridge uses. */
export type DocumentKind = "QUESTION_PAPER" | "MARK_SCHEME";

/**
 * ContentIngestionService.ingest — the T-013 port surface (write band).
 * IngestionResult (:162-164) subset the bridge consumes: id (the row id),
 * documentId (the deterministic parser identity), duplicate (checksum
 * idempotency), chunks.
 */
export interface ContentIngestionPort {
  ingest(
    doc: GlmOcrPairRequest["qpCanonical"],
    rawJson: string,
    kind: DocumentKind,
    ingestedBy: string | null,
  ): Promise<{ id: string; documentId: string; duplicate: boolean; chunks: number }>;
}

/**
 * PastPaperIngestionService.ingest — the T-011 port surface (write band).
 * IngestionSummary subset the bridge consumes (:118-119, :152-157).
 */
export interface PastPaperIngestionPort {
  ingest(
    draft: PastPaperDraft,
    ingestedBy: string | null,
  ): Promise<{ paperId: string; questions: number; parts: number; markPoints: number }>;
}

/** glm_ocr_bridge_records row (the bridge-record entity, camelCase). */
export interface BridgeRecordRow {
  id: string;
  paperId: string;
  bridge: string;
  qpDocumentId: string;
  msDocumentId: string;
  qpDocumentRowId: string | null;
  msDocumentRowId: string | null;
  qpChecksum: string;
  msChecksum: string;
  extractionMethods: string;
  reconciliationStatus: string;
  reviewFindings: string; // jsonb ::text — the assembled findings JSON
  qpDraft: string; // jsonb ::text — the verbatim parser QP draft
  msDraft: string; // jsonb ::text — the verbatim parser MS draft
  reconciliation: string; // jsonb ::text — the verbatim parser reconciliation
}

/**
 * GlmOcrBridgeRecordRepository port — the OBSERVED finders of the frozen
 * repository (findByQpDocumentIdAndMsDocumentId — the idempotency spine;
 * findByPaperId — the review surface; save — the @PrePersist id/createdAt).
 */
export class GlmOcrBridgeRepository {
  constructor(private readonly sql: SqlFn) {}

  async findByQpDocumentIdAndMsDocumentId(
    qpDocumentId: string,
    msDocumentId: string,
  ): Promise<BridgeRecordRow | null> {
    const rows = await this.sql`
      select id, paper_id, bridge, qp_document_id, ms_document_id,
             qp_document_row_id, ms_document_row_id, qp_checksum, ms_checksum,
             extraction_methods, reconciliation_status,
             review_findings::text as review_findings,
             qp_draft::text as qp_draft, ms_draft::text as ms_draft,
             reconciliation::text as reconciliation
      from glm_ocr_bridge_records
      where qp_document_id = ${qpDocumentId} and ms_document_id = ${msDocumentId}
      limit 1`;
    return rows.length === 0 || !rows[0] ? null : toBridgeRecordRow(rows[0]);
  }

  async findByPaperId(paperId: string): Promise<BridgeRecordRow | null> {
    const rows = await this.sql`
      select id, paper_id, bridge, qp_document_id, ms_document_id,
             qp_document_row_id, ms_document_row_id, qp_checksum, ms_checksum,
             extraction_methods, reconciliation_status,
             review_findings::text as review_findings,
             qp_draft::text as qp_draft, ms_draft::text as ms_draft,
             reconciliation::text as reconciliation
      from glm_ocr_bridge_records
      where paper_id = ${paperId}::uuid
      limit 1`;
    return rows.length === 0 || !rows[0] ? null : toBridgeRecordRow(rows[0]);
  }

  /** save (GlmOcrBridgeRecord.java:129-137 @PrePersist — id + createdAt here). */
  async save(record: Omit<BridgeRecordRow, "id" | "bridge">, createdBy: string | null): Promise<void> {
    await this.sql`
      insert into glm_ocr_bridge_records (id, paper_id, bridge, qp_document_id,
              ms_document_id, qp_document_row_id, ms_document_row_id,
              qp_checksum, ms_checksum, extraction_methods,
              reconciliation_status, review_findings, qp_draft, ms_draft,
              reconciliation, created_by, created_at)
      values (${crypto.randomUUID()}::uuid, ${record.paperId}::uuid, 'glm-ocr-v1',
              ${record.qpDocumentId}, ${record.msDocumentId},
              ${record.qpDocumentRowId}::uuid, ${record.msDocumentRowId}::uuid,
              ${record.qpChecksum}, ${record.msChecksum}, ${record.extractionMethods},
              ${record.reconciliationStatus}, ${record.reviewFindings}::jsonb,
              ${record.qpDraft}::jsonb, ${record.msDraft}::jsonb,
              ${record.reconciliation}::jsonb, ${createdBy}::uuid,
              ${new Date().toISOString()})`;
  }
}

function toBridgeRecordRow(r: Record<string, unknown>): BridgeRecordRow {
  return {
    id: String(r.id),
    paperId: String(r.paper_id),
    bridge: String(r.bridge),
    qpDocumentId: String(r.qp_document_id),
    msDocumentId: String(r.ms_document_id),
    qpDocumentRowId: r.qp_document_row_id == null ? null : String(r.qp_document_row_id),
    msDocumentRowId: r.ms_document_row_id == null ? null : String(r.ms_document_row_id),
    qpChecksum: String(r.qp_checksum),
    msChecksum: String(r.ms_checksum),
    extractionMethods: String(r.extraction_methods),
    reconciliationStatus: String(r.reconciliation_status),
    reviewFindings: String(r.review_findings),
    qpDraft: String(r.qp_draft),
    msDraft: String(r.ms_draft),
    reconciliation: String(r.reconciliation),
  };
}

// ── duplicate-rerun read-model repos (the frozen :223-253 call sequence) ────

/** ExamPaperRepository.findById subset — title for the PaperStatus view. */
export class ExamPaperReadRepository {
  constructor(private readonly sql: SqlFn) {}
  async findById(paperId: string): Promise<{ id: string; title: string } | null> {
    const rows = await this.sql`
      select id, title from exam_papers where id = ${paperId}::uuid limit 1`;
    if (rows.length === 0 || !rows[0]) return null;
    return { id: String(rows[0].id), title: String(rows[0].title) };
  }
}

/** QuestionVersionRepository.findByPaperId — versions with their parts sizes. */
export class QuestionVersionReadRepository {
  constructor(private readonly sql: SqlFn) {}
  async findByPaperId(paperId: string): Promise<Array<{ id: string; partsCount: number }>> {
    const rows = await this.sql`
      select v.id, (select count(*) from question_parts p where p.question_version_id = v.id) as parts_count
      from question_versions v
      join questions q on q.id = v.question_id
      where q.exam_paper_id = ${paperId}::uuid
      order by q.external_ref asc nulls last, v.version desc`;
    return rows.map((r) => ({ id: String(r.id), partsCount: Number(r.parts_count) }));
  }
}

/** MarkSchemeRepository.findByPaperId — the paper's schemes. */
export class MarkSchemeReadRepository {
  constructor(private readonly sql: SqlFn) {}
  async findByPaperId(paperId: string): Promise<Array<{ id: string }>> {
    const rows = await this.sql`
      select s.id
      from mark_schemes s
      join question_versions v on v.id = s.question_version_id
      join questions q on q.id = v.question_id
      where q.exam_paper_id = ${paperId}::uuid
      order by s.created_at asc`;
    return rows.map((r) => ({ id: String(r.id) }));
  }
}

/** MarkPointRepository.findByMarkSchemeIdOrderByOrdering. */
export class MarkPointReadRepository {
  constructor(private readonly sql: SqlFn) {}
  async findByMarkSchemeIdOrderByOrdering(schemeId: string): Promise<Array<{ id: string }>> {
    const rows = await this.sql`
      select id from mark_points where mark_scheme_id = ${schemeId}::uuid order by ordering asc`;
    return rows.map((r) => ({ id: String(r.id) }));
  }
}

// ── service records (GlmOcrIngestionService.java :273-319) ──────────────────

export interface DocumentStatus {
  duplicate: boolean;
  documentId: string;
  rowId: string;
  chunks: number;
}

export interface PaperStatus {
  duplicate: boolean;
  paperId: string;
  title: string | null;
}

export interface ReconciliationStatus {
  status: string;
  mismatchCount: number;
  paperTotalConflict: boolean;
  qpPaperTotal: number | null;
  msPaperTotal: number | null;
}

/** PairResult (:306-319) — embeddingSkipped always true by design. */
export interface PairResult {
  qpDocument: DocumentStatus;
  msDocument: DocumentStatus;
  examPaper: PaperStatus;
  questions: number;
  parts: number;
  markSchemes: number;
  markPoints: number;
  qpChunks: number;
  msChunks: number;
  reconciliation: ReconciliationStatus;
  reviewFindings: GlmOcrFindingView[];
  embeddingSkipped: boolean;
}

/** The write-band ports as an injected bundle (see the seam note above). */
export interface GlmOcrWritePath {
  contentIngestion: ContentIngestionPort;
  pastPaperIngestion: PastPaperIngestionPort;
}

export class GlmOcrIngestionService {
  constructor(
    private readonly sql: SqlFn,
    private readonly bridgeRecords: GlmOcrBridgeRepository,
    private readonly examPapers: ExamPaperReadRepository,
    private readonly questionVersions: QuestionVersionReadRepository,
    private readonly markSchemes: MarkSchemeReadRepository,
    private readonly markPoints: MarkPointReadRepository,
    private readonly writePath: GlmOcrWritePath | null,
  ) {}

  /**
   * ingestPair (:97-166) — one verified QP/MS pair. Safe to re-run: the
   * second run reports DUPLICATE for both documents and the paper and
   * creates no new rows.
   */
  async ingestPair(pair: GlmOcrPairRequest, ingestedBy: string | null): Promise<PairResult> {
    // the frozen call order: validateBundle runs FIRST (the deterministic
    // prefix — a mixed or incomplete bundle answers 409/500 exactly as the
    // frozen service does, write band wired or not), THEN the write-band
    // seam (the lane's disclosed 501 when T-013/T-011 are unported).
    const bundle = validateBundle(pair);
    if (this.writePath == null) {
      // the honest write-band seam — never a fabricated 200
      throw new GlmOcrWritePathNotPortedError();
    }

    // Step 1 — canonical documents through the EXISTING T-013 path.
    // Idempotent by source checksum: a second call reports the existing row.
    const qpDoc = await this.writePath.contentIngestion.ingest(
      bundle.qpCanonical,
      JSON.stringify(bundle.qpCanonical),
      "QUESTION_PAPER",
      ingestedBy,
    );
    const msDoc = await this.writePath.contentIngestion.ingest(
      bundle.msCanonical,
      JSON.stringify(bundle.msCanonical),
      "MARK_SCHEME",
      ingestedBy,
    );

    // Step 2 — rerun spine: an already-bridged pair resolves to its record.
    const existing = await this.bridgeRecords.findByQpDocumentIdAndMsDocumentId(
      qpDoc.documentId,
      msDoc.documentId,
    );
    if (existing != null) {
      return this.duplicatePairResult(existing, qpDoc, msDoc);
    }

    // Step 3 — assessment content through the EXISTING T-011 path (all SUGGESTED).
    const t011Draft = toPastPaperDraft(bundle.qpDraft, bundle.msDraft);
    const created = await this.writePath.pastPaperIngestion.ingest(t011Draft, ingestedBy);

    // Step 4 — the bridge record: verbatim drafts + reconciliation + findings.
    const findings = assembleReviewFindings(bundle.qpDraft, bundle.msDraft, bundle.reconciliation);
    const reconciliationStatus = bundle.reconciliation.mismatchCount > 0 ||
        bundle.reconciliation.paperTotalConflict
      ? "REVIEW_REQUIRED"
      : "OK";
    await this.bridgeRecords.save(
      {
        paperId: created.paperId,
        qpDocumentId: qpDoc.documentId,
        msDocumentId: msDoc.documentId,
        qpDocumentRowId: qpDoc.id,
        msDocumentRowId: msDoc.id,
        qpChecksum: checksumOf(bundle.qpCanonical), // §8 provenance spine
        msChecksum: checksumOf(bundle.msCanonical),
        extractionMethods: BRIDGE_METHOD,
        reconciliationStatus,
        reviewFindings: JSON.stringify(findings),
        qpDraft: JSON.stringify(bundle.qpDraft),
        msDraft: JSON.stringify(bundle.msDraft),
        reconciliation: JSON.stringify(bundle.reconciliation),
      },
      ingestedBy,
    );

    const paper = await this.examPapers.findById(created.paperId);
    return {
      qpDocument: { duplicate: qpDoc.duplicate, documentId: qpDoc.documentId, rowId: qpDoc.id, chunks: qpDoc.chunks },
      msDocument: { duplicate: msDoc.duplicate, documentId: msDoc.documentId, rowId: msDoc.id, chunks: msDoc.chunks },
      examPaper: { duplicate: false, paperId: created.paperId, title: paper == null ? null : paper.title },
      questions: created.questions,
      parts: created.parts,
      markSchemes: (await this.markSchemes.findByPaperId(created.paperId)).length,
      markPoints: created.markPoints,
      qpChunks: qpDoc.chunks,
      msChunks: msDoc.chunks,
      reconciliation: {
        status: reconciliationStatus,
        mismatchCount: bundle.reconciliation.mismatchCount,
        paperTotalConflict: bundle.reconciliation.paperTotalConflict,
        qpPaperTotal: bundle.reconciliation.qpPaperTotal,
        msPaperTotal: bundle.reconciliation.msPaperTotal,
      },
      reviewFindings: findings,
      embeddingSkipped: true, // embedding skipped — explicit T-013 operation remains available
    };
  }

  /**
   * reviewFindingsForPaper (:175-179) — the persisted findings for one
   * imported paper. null distinguishes a MISSING bridge record (the caller
   * decides, e.g. HTTP 404) from an existing record whose findings list is
   * legitimately empty (present, []): a clean pair has zero findings and
   * that is NOT "not found".
   */
  async reviewFindingsForPaper(paperId: string): Promise<GlmOcrFindingView[] | null> {
    const record = await this.bridgeRecords.findByPaperId(paperId);
    if (record == null) return null;
    return deserializeFindings(record.reviewFindings);
  }

  /** rerun (:223-253): report the state as imported (from the record), create nothing */
  private async duplicatePairResult(
    record: BridgeRecordRow,
    qpDoc: { documentId: string; duplicate: boolean; id: string; chunks: number },
    msDoc: { documentId: string; duplicate: boolean; id: string; chunks: number },
  ): Promise<PairResult> {
    const paperId = record.paperId;
    const versions = await this.questionVersions.findByPaperId(paperId);
    const parts = versions.reduce((sum, v) => sum + v.partsCount, 0);
    const schemes = await this.markSchemes.findByPaperId(paperId);
    let points = 0;
    for (const s of schemes) {
      points += (await this.markPoints.findByMarkSchemeIdOrderByOrdering(s.id)).length;
    }
    const paper = await this.examPapers.findById(paperId);
    const findings = deserializeFindings(record.reviewFindings);
    const imported = deserializeReconciliation(record.reconciliation);

    return {
      qpDocument: { duplicate: qpDoc.duplicate, documentId: qpDoc.documentId, rowId: qpDoc.id, chunks: qpDoc.chunks },
      msDocument: { duplicate: msDoc.duplicate, documentId: msDoc.documentId, rowId: msDoc.id, chunks: msDoc.chunks },
      examPaper: { duplicate: true, paperId, title: paper == null ? null : paper.title },
      questions: versions.length,
      parts,
      markSchemes: schemes.length,
      markPoints: points,
      qpChunks: qpDoc.chunks,
      msChunks: msDoc.chunks,
      reconciliation: {
        status: record.reconciliationStatus,
        mismatchCount: imported.mismatchCount,
        paperTotalConflict: imported.paperTotalConflict,
        qpPaperTotal: imported.qpPaperTotal,
        msPaperTotal: imported.msPaperTotal,
      },
      reviewFindings: findings,
      embeddingSkipped: true, // embedding intentionally skipped on reruns too
    };
  }
}

/**
 * validateBundle (:186-221) — fail-loud bundle checks (never guess): the
 * drafts must reference the very canonical documents supplied, and the
 * reconciliation must be ABOUT this pair. Objects.requireNonNull NPE parity
 * (plain Error → 500 internal_error) and the ConflictException 409 messages
 * verbatim (Java string concat renders null as "null"). Returns the narrowed
 * bundle (the frozen method's precondition guarantee).
 */
export interface ValidatedGlmOcrBundle {
  qpCanonical: NonNullable<GlmOcrPairRequest["qpCanonical"]>;
  msCanonical: NonNullable<GlmOcrPairRequest["msCanonical"]>;
  qpDraft: NonNullable<GlmOcrPairRequest["qpDraft"]>;
  msDraft: NonNullable<GlmOcrPairRequest["msDraft"]>;
  reconciliation: NonNullable<GlmOcrPairRequest["reconciliation"]>;
}

export function validateBundle(pair: GlmOcrPairRequest): ValidatedGlmOcrBundle {
  const qpCanonical = require(pair.qpCanonical, "qpCanonical is required");
  const msCanonical = require(pair.msCanonical, "msCanonical is required");
  const qpDraft = require(pair.qpDraft, "qpDraft is required");
  const msDraft = require(pair.msDraft, "msDraft is required");
  const reconciliation = require(pair.reconciliation, "reconciliation is required");

  const qpDocId = qpCanonical.documentId;
  const msDocId = msCanonical.documentId;
  const qpClaimed = qpDraft.paper == null ? null : qpDraft.paper.canonicalDocumentId;
  const msClaimed = msDraft.paper == null ? null : msDraft.paper.canonicalDocumentId;
  if (qpClaimed == null || qpClaimed !== qpDocId) {
    throw new ConflictException(
      "qp draft claims canonical document " + String(qpClaimed) +
        " but the supplied QP canonical document is " + String(qpDocId) +
        " — the bundle mixes documents from different sources",
    );
  }
  if (msClaimed == null || msClaimed !== msDocId) {
    throw new ConflictException(
      "ms draft claims canonical document " + String(msClaimed) +
        " but the supplied MS canonical document is " + String(msDocId) +
        " — the bundle mixes documents from different sources",
    );
  }
  if (reconciliation.qpPaperTotal !== qpDraft.paperTotal) {
    throw new ConflictException(
      "reconciliation qpPaperTotal (" + String(reconciliation.qpPaperTotal) +
        ") does not match the QP draft paperTotal (" + String(qpDraft.paperTotal) +
        ") — is this reconciliation for this pair?",
    );
  }
  if (reconciliation.msPaperTotal !== msDraft.paperTotal) {
    throw new ConflictException(
      "reconciliation msPaperTotal (" + String(reconciliation.msPaperTotal) +
        ") does not match the MS draft paperTotal (" + String(msDraft.paperTotal) +
        ") — is this reconciliation for this pair?",
    );
  }
  return { qpCanonical, msCanonical, qpDraft, msDraft, reconciliation };
}

/** Objects.requireNonNull parity (NPE with the named message → 500). */
function require<T>(value: T | null, message: string): T {
  if (value == null) throw new Error(message);
  return value;
}

/** CanonicalDocumentDto.source().checksum() dereference (NPE parity). */
function checksumOf(doc: NonNullable<GlmOcrPairRequest["qpCanonical"]>): string {
  if (doc.source == null) throw new Error("source is required");
  if (doc.source.checksum == null) throw new Error("checksum is required");
  return doc.source.checksum;
}

/** deserialize (:255-262) — IllegalStateException parity on unreadable JSONB. */
export function deserializeFindings(stored: string): GlmOcrFindingView[] {
  try {
    const parsed = JSON.parse(stored) as unknown;
    if (!Array.isArray(parsed)) throw new Error("not an array");
    return parsed as GlmOcrFindingView[];
  } catch {
    throw new Error("stored review findings are unreadable");
  }
}

/** deserializeReconciliation (:264-270) — IllegalStateException parity. */
export function deserializeReconciliation(stored: string): {
  mismatchCount: number;
  paperTotalConflict: boolean;
  qpPaperTotal: number | null;
  msPaperTotal: number | null;
} {
  try {
    const parsed = JSON.parse(stored) as Record<string, unknown>;
    return {
      mismatchCount: Number(parsed.mismatchCount ?? 0),
      paperTotalConflict: parsed.paperTotalConflict === true,
      qpPaperTotal: parsed.qpPaperTotal == null ? null : Number(parsed.qpPaperTotal),
      msPaperTotal: parsed.msPaperTotal == null ? null : Number(parsed.msPaperTotal),
    };
  } catch {
    throw new Error("stored reconciliation is unreadable");
  }
}

/** The honest write-band seam error (→ 501 not_implemented at the route). */
export class GlmOcrWritePathNotPortedError extends Error {
  constructor() {
    super(
      "glm-ocr pair ingestion requires the T-013 ContentIngestionService and T-011 " +
        "PastPaperIngestionService ports (content write band, owned by T-MIG-023)",
    );
    this.name = "GlmOcrWritePathNotPortedError";
  }
}

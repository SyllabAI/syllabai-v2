/**
 * Content read-surface repositories — the OBSERVED query surfaces of the
 * frozen repositories against the Flyway-owned schema (R-LAZY doctrine:
 * port the repository call sequence, not the entity map). Sources
 * (syllabai-core @ main, frozen, verified 2026-10-05, T-MIG-020):
 *   content/DocumentRepository.java       content/DocumentChunkRepository.java
 *   content/ChunkVectorRepository.java    assessment/ExamPaperRepository.java
 *   assessment/QuestionVersionRepository.java  assessment/MarkSchemeRepository.java
 *   assessment/QuestionRepository.java (+ topic finders)
 *   sme/QuestionAssetRepository.java      teacher/GlmOcrBridgeRecordRepository.java
 *   teacher/ContentReviewAuditRepository.java
 *
 * Every query is row-level read/write against Flyway-owned tables
 * (BASELINE_DB.md §4 — structure never altered). Multi-row selects mirror
 * the Java finder ordering exactly where the Java finder declares one;
 * derived queries without OrderBy stay unordered here too.
 */
import type { SqlFn } from "../identity/users";
import { javaInstant } from "./instant";

// W2-F1: timestamps leave the database as UTC-pinned text —
//   to_char(<col> at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')
// — so micros survive the transport (postgres.js would otherwise parse
// timestamptz into a millis Date, the exact F-1 divergence class) and
// javaInstant renders them with Jackson's Instant.toString() fraction
// rule. ORDER BY clauses keep referencing the raw column — the cast is
// select-list only, so the Java finder ordering is untouched.

type Row = Record<string, unknown>;


/** documents row → the columns the read surfaces consume. */
export interface DocumentRow {
  id: string;
  documentId: string;
  docVersion: number;
  kind: string;
  fileName: string | null;
  sourceUri: string;
  pageCount: number;
  elementCount: number;
  textElementCount: number;
  chunkCount: number;
  sourceEngine: string;
  sourceEngineVersion: string;
  checksum: string;
  checksumAlgorithm: string;
  canonicalJson: unknown;
  createdAt: string;
}

const DOCUMENT_COLUMNS = `
  id, document_id, doc_version, kind, file_name, source_uri, page_count,
  element_count, text_element_count, chunk_count, source_engine,
  source_engine_version, checksum, checksum_algorithm, canonical_json, created_at`;

function toDocumentRow(r: Row): DocumentRow {
  return {
    id: String(r.id),
    documentId: String(r.document_id),
    docVersion: Number(r.doc_version),
    kind: String(r.kind),
    fileName: r.file_name == null ? null : String(r.file_name),
    sourceUri: String(r.source_uri),
    pageCount: Number(r.page_count),
    elementCount: Number(r.element_count),
    textElementCount: Number(r.text_element_count),
    chunkCount: Number(r.chunk_count),
    sourceEngine: String(r.source_engine),
    sourceEngineVersion: String(r.source_engine_version),
    checksum: String(r.checksum),
    checksumAlgorithm: String(r.checksum_algorithm),
    canonicalJson: r.canonical_json,
    createdAt: javaInstant(r.created_at),
  };
}

export class DocumentRepository {
  constructor(private readonly sql: SqlFn) {}

  /** Port of findAllByOrderByCreatedAtDesc. */
  async findAllByOrderByCreatedAtDesc(): Promise<DocumentRow[]> {
    const rows: Row[] = await this.sql`
      select id, document_id, doc_version, kind, file_name, source_uri, page_count,
             element_count, text_element_count, chunk_count, source_engine,
             source_engine_version, checksum, checksum_algorithm, canonical_json, to_char(created_at at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US') as created_at
      from documents
      order by created_at desc`;
    return rows.map(toDocumentRow);
  }

  /** Port of findById. */
  async findById(id: string): Promise<DocumentRow | null> {
    const rows: Row[] = await this.sql`
      select id, document_id, doc_version, kind, file_name, source_uri, page_count,
             element_count, text_element_count, chunk_count, source_engine,
             source_engine_version, checksum, checksum_algorithm, canonical_json, to_char(created_at at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US') as created_at
      from documents where id = ${id}::uuid limit 1`;
    return rows.length === 0 || !rows[0] ? null : toDocumentRow(rows[0]);
  }

  /**
   * Port of the canonical endpoint's data access — the sealed JSON exactly
   * as stored, fetched as PG's own jsonb text rendering (`::text`) so the
   * response bytes match what the Java core's String-mapped entity returns
   * (no JS re-serialization drift). Null when the row is unknown.
   */
  async canonicalJsonText(id: string): Promise<string | null> {
    const rows: Row[] = await this.sql`
      select canonical_json::text as canonical from documents where id = ${id}::uuid limit 1`;
    return rows.length === 0 || !rows[0] ? null : String(rows[0].canonical);
  }

  /** Port of findTopByDocumentIdOrderByDocVersionDesc (provenance identity). */
  async findTopByDocumentIdOrderByDocVersionDesc(documentId: string): Promise<DocumentRow | null> {
    const rows: Row[] = await this.sql`
      select id, document_id, doc_version, kind, file_name, source_uri, page_count,
             element_count, text_element_count, chunk_count, source_engine,
             source_engine_version, checksum, checksum_algorithm, canonical_json, to_char(created_at at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US') as created_at
      from documents where document_id = ${documentId}
      order by doc_version desc limit 1`;
    return rows.length === 0 || !rows[0] ? null : toDocumentRow(rows[0]);
  }

  /**
   * Port of existsCitable — the citation-view gate (L5) with the corpus law
   * on both branches, SQL VERBATIM from DocumentRepository.java:44-54: the
   * question paper / mark scheme of a VALIDATED exam paper (paper branch),
   * or itself VALIDATED (knowledge-layer branch). A corpus import nothing
   * serves is an honest 404, byte-identical to the unknown-id response.
   */
  async existsCitable(rowId: string): Promise<boolean> {
    const rows: Row[] = await this.sql`
      select count(*) > 0 as citable
      from documents d
      where d.id = ${rowId}::uuid
        and (exists (select 1 from exam_papers p
                     where p.validation_state = 'VALIDATED'
                       and (p.question_paper_document_id = d.document_id
                         or p.mark_scheme_document_id = d.document_id))
             or d.validation_state = 'VALIDATED')`;
    return rows[0]?.citable === true;
  }
}

export interface ExamPaperRow {
  id: string;
  subjectId: string;
  title: string;
  paperCode: string | null;
  sessionLabel: string | null;
  board: string;
  qualification: string;
  validationState: string;
  questionPaperDocumentId: string | null;
  markSchemeDocumentId: string | null;
  createdAt: string;
}

const PAPER_COLUMNS = `
  id, subject_id, title, paper_code, session_label, board, qualification,
  validation_state, question_paper_document_id, mark_scheme_document_id, created_at`;

function toPaperRow(r: Row): ExamPaperRow {
  return {
    id: String(r.id),
    subjectId: String(r.subject_id),
    title: String(r.title),
    paperCode: r.paper_code == null ? null : String(r.paper_code),
    sessionLabel: r.session_label == null ? null : String(r.session_label),
    board: String(r.board),
    qualification: String(r.qualification),
    validationState: String(r.validation_state),
    questionPaperDocumentId:
      r.question_paper_document_id == null ? null : String(r.question_paper_document_id),
    markSchemeDocumentId:
      r.mark_scheme_document_id == null ? null : String(r.mark_scheme_document_id),
    createdAt: javaInstant(r.created_at),
  };
}

export class ExamPaperRepository {
  constructor(private readonly sql: SqlFn) {}

  /** Port of findById. */
  async findById(id: string): Promise<ExamPaperRow | null> {
    const rows: Row[] = await this.sql`
      select id, subject_id, title, paper_code, session_label, board, qualification,
             validation_state, question_paper_document_id, mark_scheme_document_id, to_char(created_at at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US') as created_at
      from exam_papers where id = ${id}::uuid limit 1`;
    return rows.length === 0 || !rows[0] ? null : toPaperRow(rows[0]);
  }

  /** Port of findSuggested (derived query, no OrderBy — unordered here too). */
  async findSuggested(): Promise<ExamPaperRow[]> {
    const rows: Row[] = await this.sql`
      select id, subject_id, title, paper_code, session_label, board, qualification,
             validation_state, question_paper_document_id, mark_scheme_document_id, to_char(created_at at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US') as created_at
      from exam_papers where validation_state = 'SUGGESTED'`;
    return rows.map(toPaperRow);
  }

  /** Port of findValidated (v3 practicable-topic census). */
  async findValidated(): Promise<ExamPaperRow[]> {
    const rows: Row[] = await this.sql`
      select id, subject_id, title, paper_code, session_label, board, qualification,
             validation_state, question_paper_document_id, mark_scheme_document_id, to_char(created_at at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US') as created_at
      from exam_papers where validation_state = 'VALIDATED'`;
    return rows.map(toPaperRow);
  }

  /** Port of existsBySubjectId (scope-ownership paper branch). */
  async existsBySubjectId(subjectId: string): Promise<boolean> {
    const rows: Row[] = await this.sql`
      select exists (select 1 from exam_papers where subject_id = ${subjectId}::uuid) as present`;
    return rows[0]?.present === true;
  }

  /**
   * Port of findAllByLinkedDocumentId — the T-011/T-013 join by BUSINESS
   * document id (ContentReaderController.paperRefOf :85-95). Bounded by
   * construction (the bridge writes the link exactly once per imported
   * pair); findFirst() parity = limit 1.
   */
  async findAllByLinkedDocumentId(documentId: string): Promise<ExamPaperRow[]> {
    const rows: Row[] = await this.sql`
      select id, subject_id, title, paper_code, session_label, board, qualification,
             validation_state, question_paper_document_id, mark_scheme_document_id, to_char(created_at at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US') as created_at
      from exam_papers
      where question_paper_document_id = ${documentId}
         or mark_scheme_document_id = ${documentId}
      limit 1`;
    return rows.map(toPaperRow);
  }
}

export class QuestionAssetRepository {
  constructor(private readonly sql: SqlFn) {}

  /** Port of findByFilename — binary content by stored filename, no dir semantics. */
  async findByFilename(
    filename: string,
  ): Promise<{ contentType: string; sizeBytes: number; bytes: Uint8Array } | null> {
    const rows: Row[] = await this.sql`
      select content_type, size_bytes, bytes
      from question_asset where filename = ${filename} limit 1`;
    if (rows.length === 0 || !rows[0]) return null;
    const raw = rows[0].bytes;
    const bytes =
      raw instanceof Uint8Array ? raw : new Uint8Array(raw as ArrayBuffer);
    return {
      contentType: String(rows[0].content_type),
      sizeBytes: Number(rows[0].size_bytes),
      bytes,
    };
  }
}

/** glm_ocr_bridge_records row — only what the review enrichment consumes. */
export interface BridgeRecordRow {
  reconciliationStatus: string | null;
  reviewFindings: string | null;
}

export class GlmOcrBridgeRepository {
  constructor(private readonly sql: SqlFn) {}

  /** Port of findByPaperId (uq_glm_ocr_bridge_paper: at most one row per paper). */
  async findByPaperId(paperId: string): Promise<BridgeRecordRow | null> {
    const rows: Row[] = await this.sql`
      select reconciliation_status, review_findings::text as review_findings
      from glm_ocr_bridge_records where paper_id = ${paperId}::uuid limit 1`;
    if (rows.length === 0 || !rows[0]) return null;
    return {
      reconciliationStatus:
        rows[0].reconciliation_status == null ? null : String(rows[0].reconciliation_status),
      reviewFindings: rows[0].review_findings == null ? null : String(rows[0].review_findings),
    };
  }
}

export interface AuditRowRecord {
  occurredAt: string | null;
  actorLabel: string;
  action: string;
  targetType: string;
  targetId: string;
  fromState: string | null;
  toState: string | null;
  detail: string;
}

export class ContentReviewAuditRepository {
  constructor(private readonly sql: SqlFn) {}

  /**
   * Port of findPaperAudit(paperId, versionIds, schemeIds, questionIds) —
   * the paper's own audit rows plus every row of its question versions,
   * mark schemes and questions (V22). Java orders by occurredAt (the audit
   * view is a history projection; the repository finder orders
   * chronologically ascending — V22 spec "WHO decided WHAT and WHEN").
   */
  async findPaperAudit(
    paperId: string,
    versionIds: string[],
    schemeIds: string[],
    questionIds: string[],
  ): Promise<AuditRowRecord[]> {
    const rows: Row[] = await this.sql`
      select to_char(occurred_at at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US') as occurred_at, actor_label, action, target_type, target_id, from_state, to_state, detail
      from content_review_audit
      where (target_type = 'exam_paper' and target_id = ${paperId}::uuid)
         or (target_type = 'question_version' and target_id = any(${versionIds}::uuid[]))
         or (target_type = 'mark_scheme' and target_id = any(${schemeIds}::uuid[]))
         or (target_type = 'question' and target_id = any(${questionIds}::uuid[]))
      order by occurred_at asc`;
    return rows.map((r) => ({
      occurredAt: r.occurred_at == null ? null : javaInstant(r.occurred_at),
      actorLabel: String(r.actor_label),
      action: String(r.action),
      targetType: String(r.target_type),
      targetId: String(r.target_id),
      fromState: r.from_state == null ? null : String(r.from_state),
      toState: r.to_state == null ? null : String(r.to_state),
      detail: String(r.detail),
    }));
  }
}

/**
 * DocumentRepository port — the OBSERVED query surface of the frozen
 * DocumentRepository.java against the Flyway-owned `documents` table
 * (R-LAZY doctrine: port the repository call sequence, not the entity map).
 *
 * Table (V11__content_documents.sql:17-38, Flyway-owned — row-level read
 * only per BASELINE_DB.md §4):
 *   documents(id uuid PK, document_id varchar(80) NOT NULL,
 *     schema_version varchar(10) NOT NULL, doc_version int NOT NULL DEFAULT 1,
 *     kind varchar(20) NOT NULL, source_uri varchar(500) NOT NULL,
 *     file_name varchar(300), mime_type varchar(100) NOT NULL,
 *     checksum varchar(128) NOT NULL, checksum_algorithm varchar(20) NOT NULL,
 *     page_count int NOT NULL, element_count int NOT NULL,
 *     text_element_count int NOT NULL, chunk_count int NOT NULL DEFAULT 0,
 *     source_engine varchar(60) NOT NULL, source_engine_version varchar(40) NOT NULL,
 *     extracted_at timestamptz, canonical_json jsonb NOT NULL,
 *     ingested_by uuid, created_at timestamptz NOT NULL)
 *   (+ validation_state varchar — added by the validation-workflow migration,
 *   default 'SUGGESTED'; read via the same row-level surface.)
 *
 * Behaviour parity notes:
 *   - findAllByOrderByCreatedAtDesc: NO pagination — the list view is the
 *     full store, newest first (ContentDocumentController.java:78-83).
 *   - existsCitable: the T-C20 corpus-law gate verbatim from the native
 *     query (DocumentRepository.java:67-79) — a row is citable iff it sits
 *     on the SERVING side: the QP or MS of a VALIDATED exam paper, or itself
 *     VALIDATED. The curriculum dimension belongs to retrieval; validation
 *     is load-bearing here.
 *   - Kind: the Java enum has 7 values (V29 T-C06 corpus roles added
 *     TEXTBOOK / EXTERNAL_NOTES / EXTERNAL_QUESTIONS); the port treats kind
 *     as the stored string — the DB CHECK constrains it, not this layer.
 */
import type { SqlFn } from "./sql";

export type DocumentKind =
  | "QUESTION_PAPER"
  | "MARK_SCHEME"
  | "SYLLABUS"
  | "OTHER"
  | "TEXTBOOK"
  | "EXTERNAL_NOTES"
  | "EXTERNAL_QUESTIONS";

export interface DocumentRow {
  id: string;
  documentId: string;
  schemaVersion: string;
  docVersion: number;
  kind: DocumentKind;
  sourceUri: string;
  fileName: string | null;
  mimeType: string;
  checksum: string;
  checksumAlgorithm: string;
  pageCount: number;
  elementCount: number;
  textElementCount: number;
  chunkCount: number;
  sourceEngine: string;
  sourceEngineVersion: string;
  extractedAt: Date | null;
  canonicalJson: string;
  ingestedBy: string | null;
  validationState: string;
  createdAt: Date;
}

const mapDocument = (r: Record<string, unknown>): DocumentRow => ({
  id: String(r.id),
  documentId: String(r.document_id),
  schemaVersion: String(r.schema_version),
  docVersion: Number(r.doc_version),
  kind: String(r.kind) as DocumentKind,
  sourceUri: String(r.source_uri),
  fileName: r.file_name == null ? null : String(r.file_name),
  mimeType: String(r.mime_type),
  checksum: String(r.checksum),
  checksumAlgorithm: String(r.checksum_algorithm),
  pageCount: Number(r.page_count),
  elementCount: Number(r.element_count),
  textElementCount: Number(r.text_element_count),
  chunkCount: Number(r.chunk_count),
  sourceEngine: String(r.source_engine),
  sourceEngineVersion: String(r.source_engine_version),
  extractedAt: r.extracted_at == null ? null : new Date(r.extracted_at as string),
  // jsonb arrives as a parsed value over the wire? — the Neon driver returns
  // jsonb as a string exactly as stored; keep it VERBATIM either way, because
  // the canonical endpoint re-serves the sealed bytes and the reader parses
  // the same text. (String coercion of an object would lose key order.)
  canonicalJson:
    typeof r.canonical_json === "string"
      ? r.canonical_json
      : JSON.stringify(r.canonical_json),
  ingestedBy: r.ingested_by == null ? null : String(r.ingested_by),
  validationState: r.validation_state == null ? "SUGGESTED" : String(r.validation_state),
  createdAt: new Date(r.created_at as string),
});

/** Port of DocumentSummaryView (ContentDocumentController.java:199-212). */
export interface DocumentSummaryView {
  id: string;
  documentId: string;
  docVersion: number;
  kind: DocumentKind;
  title: string;
  pageCount: number;
  elementCount: number;
  textElementCount: number;
  chunkCount: number;
  sourceEngine: string;
  sourceEngineVersion: string;
  checksum: string;
  createdAt: string;
}

/**
 * Instant → string per Jackson JSR-310 (ISO-8601 UTC). Date.toISOString()
 * matches to millisecond precision (identity/errors.ts isoNow precedent;
 * golden tolerance treats timestamps as volatile).
 */
export const iso = (d: Date): string => d.toISOString();

export function documentSummaryView(d: DocumentRow): DocumentSummaryView {
  return {
    id: d.id,
    documentId: d.documentId,
    docVersion: d.docVersion,
    kind: d.kind,
    // title fallback is load-bearing: d.fileName() == null ? d.sourceUri() : d.fileName()
    title: d.fileName == null ? d.sourceUri : d.fileName,
    pageCount: d.pageCount,
    elementCount: d.elementCount,
    textElementCount: d.textElementCount,
    chunkCount: d.chunkCount,
    sourceEngine: d.sourceEngine,
    sourceEngineVersion: d.sourceEngineVersion,
    checksum: d.checksum,
    createdAt: iso(d.createdAt),
  };
}

export class DocumentsRepository {
  constructor(private readonly sql: SqlFn) {}

  /** findAllByOrderByCreatedAtDesc (DocumentRepository.java:36). */
  async findAllByOrderByCreatedAtDesc(): Promise<DocumentRow[]> {
    const rows = await this.sql`
      select * from documents order by created_at desc`;
    return rows.map(mapDocument);
  }

  /** findById (JpaRepository derived, by PK). */
  async findById(id: string): Promise<DocumentRow | null> {
    const rows = await this.sql`
      select * from documents where id = ${id}`;
    const row = rows[0];
    return row == null ? null : mapDocument(row);
  }

  /**
   * The latest content-store row for a business document id — the imported
   * source identity provenance pins (DocumentRepository.java:27-28; used by
   * the teacher provenance view, T-MIG-020 tranche 2).
   */
  async findTopByDocumentIdOrderByDocVersionDesc(documentId: string): Promise<DocumentRow | null> {
    const rows = await this.sql`
      select * from documents where document_id = ${documentId}
      order by doc_version desc limit 1`;
    const row = rows[0];
    return row == null ? null : mapDocument(row);
  }

  /**
   * existsCitable — the native corpus-law query VERBATIM
   * (DocumentRepository.java:67-79): VALIDATED paper linkage on the business
   * document id, or a VALIDATED knowledge-layer row. Nothing else serves.
   */
  async existsCitable(rowId: string): Promise<boolean> {
    const rows = await this.sql`
      select count(*) > 0 as citable
      from documents d
      where d.id = ${rowId}
        and (exists (select 1 from exam_papers p
                     where p.validation_state = 'VALIDATED'
                       and (p.question_paper_document_id = d.document_id
                         or p.mark_scheme_document_id = d.document_id))
             or d.validation_state = 'VALIDATED')`;
    const row = rows[0];
    return row != null && row.citable === true;
  }
}

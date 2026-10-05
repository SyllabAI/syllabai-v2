/**
 * DocumentRepository port (T-MIG-020) — the read surface the canonical
 * document store serves. Sources (frozen core @ 6cad6ef):
 *   content/DocumentRepository.java  — findAllByOrderByCreatedAtDesc:22,
 *     existsCitable:40-54 (native SQL ported VERBATIM — corpus law),
 *     findTopByDocumentIdOrderByDocVersionDesc (provenance "latest version")
 *   content/ContentDocumentController.java — DocumentSummaryView.from:205-212
 *     (title = fileName ?? sourceUri; createdAt = Instant.toString())
 */
import { createSql } from "../identity/users";

type Sql = ReturnType<typeof createSql>;

export interface DocumentRow {
  id: string;
  documentId: string;
  docVersion: number;
  kind: string;
  sourceUri: string;
  fileName: string | null;
  pageCount: number;
  elementCount: number;
  textElementCount: number;
  chunkCount: number;
  sourceEngine: string | null;
  sourceEngineVersion: string | null;
  checksum: string;
  checksumAlgorithm: string;
  canonicalJson: string;
  validationState: string;
  createdAt: string;
}

/** DocumentSummaryView.from (ContentDocumentController.java:205-212). */
export function toSummaryView(d: DocumentRow) {
  return {
    id: d.id,
    documentId: d.documentId,
    docVersion: d.docVersion,
    kind: d.kind,
    title: d.fileName ?? d.sourceUri,
    pageCount: d.pageCount,
    elementCount: d.elementCount,
    textElementCount: d.textElementCount,
    chunkCount: d.chunkCount,
    sourceEngine: d.sourceEngine,
    sourceEngineVersion: d.sourceEngineVersion,
    checksum: d.checksum,
    createdAt: d.createdAt,
  };
}

const DOC_COLUMNS = `id, document_id, doc_version, kind, source_uri, file_name,
  page_count, element_count, text_element_count, chunk_count, source_engine,
  source_engine_version, checksum, checksum_algorithm, canonical_json,
  validation_state, created_at`;
void DOC_COLUMNS;

function mapRow(r: Record<string, unknown>): DocumentRow {
  return {
    id: r.id as string,
    documentId: r.document_id as string,
    docVersion: Number(r.doc_version),
    kind: r.kind as string,
    sourceUri: r.source_uri as string,
    fileName: (r.file_name as string | null) ?? null,
    pageCount: Number(r.page_count),
    elementCount: Number(r.element_count),
    textElementCount: Number(r.text_element_count),
    chunkCount: Number(r.chunk_count),
    sourceEngine: (r.source_engine as string | null) ?? null,
    sourceEngineVersion: (r.source_engine_version as string | null) ?? null,
    checksum: r.checksum as string,
    checksumAlgorithm: (r.checksum_algorithm as string) ?? "SHA-256",
    canonicalJson: r.canonical_json as string,
    validationState: r.validation_state as string,
    // Java Instant.toString() carries nanoseconds; JS strings carry millis —
    // the value is ISO-8601 either way; golden fixtures tolerate createdAt.
    createdAt: new Date(r.created_at as string).toISOString(),
  };
}

export class DocumentsRepository {
  constructor(private sql: Sql) {}

  /** findAllByOrderByCreatedAtDesc (DocumentRepository.java:22). */
  async findAllByOrderByCreatedAtDesc(): Promise<DocumentRow[]> {
    const rows = await this.sql`select id, document_id, doc_version, kind, source_uri, file_name, page_count, element_count, text_element_count, chunk_count, source_engine, source_engine_version, checksum, checksum_algorithm, canonical_json, validation_state, created_at from documents order by created_at desc`;
    return rows.map(mapRow);
  }

  /** findById (JpaRepository derived). */
  async findById(id: string): Promise<DocumentRow | null> {
    const rows = await this.sql`select id, document_id, doc_version, kind, source_uri, file_name, page_count, element_count, text_element_count, chunk_count, source_engine, source_engine_version, checksum, checksum_algorithm, canonical_json, validation_state, created_at from documents where id = ${id}::uuid`;
    return rows[0] ? mapRow(rows[0]) : null;
  }

  /** findTopByDocumentIdOrderByDocVersionDesc (provenance path,
   *  ContentController.java:150-153 — "the imported source identity is its
   *  latest version"). */
  async findTopByDocumentIdOrderByDocVersionDesc(documentId: string): Promise<DocumentRow | null> {
    const rows = await this.sql`select id, document_id, doc_version, kind, source_uri, file_name, page_count, element_count, text_element_count, chunk_count, source_engine, source_engine_version, checksum, checksum_algorithm, canonical_json, validation_state, created_at from documents where document_id = ${documentId} order by doc_version desc limit 1`;
    return rows[0] ? mapRow(rows[0]) : null;
  }

  /**
   * existsCitable — DocumentRepository.java:40-54 native query ported
   * VERBATIM (corpus law: only a document on the SERVING side of the
   * validation gates is readable on the learner citation surface; a corpus
   * import nothing serves is an honest 404 identical to unknown-id).
   */
  async existsCitable(rowId: string): Promise<boolean> {
    const rows = await this.sql`
      select count(*) > 0 as ok
      from documents d
      where d.id = ${rowId}::uuid
        and (exists (select 1 from exam_papers p
                     where p.validation_state = 'VALIDATED'
                       and (p.question_paper_document_id = d.document_id
                         or p.mark_scheme_document_id = d.document_id))
             or d.validation_state = 'VALIDATED')`;
    return rows[0]?.ok === true;
  }
}

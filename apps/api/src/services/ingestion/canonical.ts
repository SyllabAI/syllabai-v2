/**
 * ContentIngestionService port — the T-013 canonical-document store
 * (T-MIG-082 tranche B2). Byte-faithful port of the frozen
 * content/ContentIngestionService.java (165 lines) @ 6cad6ef, verified
 * line-against-line 2026-10-07.
 *
 * Pipeline: validate (the T-MIG-006 canonicalDocumentViolations port — the
 * core-side mirror of the parser's §8 invariants, all violations collected
 * into ONE 400 invalid_document) → dedup by source checksum (idempotent
 * corpus loads; a kind mismatch on the same checksum is a 409) → persist
 * the document (raw JSON via JSONB, content-preserving) → chunk
 * deterministically (chunking.ts) → persist chunks with the Embedding-v2
 * identity mirror (subject/series/year/paperCode/atomNumber/specCodes/
 * embedRev=2). Embedding is NEVER part of this operation — content lands
 * with zero API keys.
 *
 * Transactionality: the frozen @Transactional joins the CALLER's
 * transaction (the glm-ocr pair's one transaction) — this port therefore
 * takes the caller's SqlFn (a tx handle under the bridge) and issues no
 * BEGIN/COMMIT of its own.
 *
 * Error vocabulary (the frozen GlobalExceptionHandler law):
 *   - InvalidDocumentError → 400 invalid_document (the full violation list)
 *   - ConflictException    → 409 "checksum … already ingested as kind …"
 *   - NotFoundException    → 404 "Subject (retrieval.subjectCode) {code}
 *                             not found" (a present-but-unresolvable
 *                             subject code is a LOUD rejection — an
 *                             invisible corpus must not be creatable)
 */
import {
  canonicalDocumentViolations,
  type CanonicalDocument,
} from "@syllabai/contracts";
import type { SqlFn } from "../identity/users";
import { CURRENT_EMBED_REV } from "../content/retrieval";
import { NotFoundException, ConflictException } from "../identity/errors";
import { chunkCanonicalDocument, normalizeAtom } from "./chunking";

type Row = Record<string, unknown>;

/** The validator's rejection (GlobalExceptionHandler: InvalidDocumentException → 400 invalid_document). */
export class InvalidDocumentError extends Error {
  readonly violations: string[];
  constructor(message: string, violations: string[]) {
    super(message);
    this.violations = violations;
  }
}

export interface IngestionResult {
  id: string;
  documentId: string;
  duplicate: boolean;
  chunks: number;
  elements: number;
  pages: number;
  totalChunks: number;
}

export interface ExistingDocumentRow {
  id: string;
  documentId: string;
  kind: string;
  chunkCount: number;
  elementCount: number;
  pageCount: number;
}

/** The dedup lookup (DocumentRepository.findByChecksum — uq_documents_checksum). */
export async function findDocumentByChecksum(
  sql: SqlFn,
  checksum: string,
): Promise<ExistingDocumentRow | null> {
  const rows: Row[] = await sql`
    select id, document_id, kind::text as kind, chunk_count, element_count, page_count
    from documents where checksum = ${checksum} limit 1`;
  if (rows.length === 0 || !rows[0]) return null;
  const r = rows[0];
  return {
    id: String(r.id),
    documentId: String(r.document_id),
    kind: String(r.kind),
    chunkCount: Number(r.chunk_count),
    elementCount: Number(r.element_count),
    pageCount: Number(r.page_count),
  };
}

/** ISO-8601 from the parser provenance; unparsable values stay null (:113-123). */
export function parseExtractedAt(extractedAt: string | null): string | null {
  if (extractedAt == null || extractedAt.trim() === "") return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(extractedAt)) {
    return null;
  }
  const t = Date.parse(extractedAt);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

function trimOrNull(s: string | null): string | null {
  return s == null || s.trim() === "" ? null : s.trim();
}

/**
 * Resolves retrieval.subjectCode to a subjects.id (:130-139). A present
 * but unresolvable code is a hard 404; an absent code resolves to null
 * (legacy-tolerant path).
 */
async function resolveSubjectId(sql: SqlFn, doc: CanonicalDocument): Promise<string | null> {
  const code = doc.retrieval?.subjectCode ?? null;
  if (code == null || code.trim() === "") return null;
  const trimmed = code.trim();
  const rows: Row[] = await sql`select id from subjects where code = ${trimmed} limit 1`;
  if (rows.length === 0 || !rows[0]) {
    throw new NotFoundException("Subject (retrieval.subjectCode)", trimmed);
  }
  return String(rows[0].id);
}

/** draft group key → the atom number column ("q3" → "3"), capped at 10 (:150-156). */
function atomNumber(groupKey: string | null): string | null {
  const normalized = normalizeAtom(groupKey);
  if (normalized === null) return null;
  return normalized.length > 10 ? normalized.slice(0, 10) : normalized;
}

/**
 * ingest (:47-111): validate → dedup → document row → chunk rows. The
 * rawJson is the request body as received (content-preserving JSONB); the
 * source checksum (§8) is the provenance spine for the original file.
 */
export async function ingestCanonicalDocument(
  sql: SqlFn,
  doc: CanonicalDocument,
  rawJson: string,
  kind: "QUESTION_PAPER" | "MARK_SCHEME",
  ingestedBy: string | null,
  now: Date,
): Promise<IngestionResult> {
  // validate (core-side, never trust across a process boundary)
  const violations = canonicalDocumentViolations(doc);
  if (violations.length > 0) {
    throw new InvalidDocumentError(
      `canonical document ${JSON.stringify(doc.documentId ?? null)} failed validation: ${violations.join("; ")}`,
      violations,
    );
  }

  const checksum = doc.source!.checksum;
  const existing = await findDocumentByChecksum(sql, checksum!);
  if (existing !== null) {
    if (existing.kind !== kind) {
      throw new ConflictException(
        `checksum ${checksum} already ingested as kind ${existing.kind} (requested ${kind})`,
      );
    }
    return {
      id: existing.id,
      documentId: existing.documentId,
      duplicate: true,
      chunks: existing.chunkCount,
      elements: existing.elementCount,
      pages: existing.pageCount,
      totalChunks: existing.chunkCount,
    };
  }

  const drafts = chunkCanonicalDocument(doc, kind);

  // Embedding-v2 identity mirror (V33): subject resolved ONCE per document
  const subjectId = await resolveSubjectId(sql, doc);
  const series =
    doc.retrieval?.series == null || doc.retrieval.series.trim() === ""
      ? null
      : doc.retrieval.series.trim(); // validator already enum-checked
  const year = doc.retrieval?.year ?? null;
  const paperCode = doc.retrieval == null ? null : trimOrNull(doc.retrieval.paperCode ?? null);
  const specCodes = doc.retrieval?.specCodes ?? null;

  const textElementCount =
    (doc.textBlocks?.length ?? 0) + (doc.tables?.length ?? 0) + (doc.equations?.length ?? 0);
  const totalElementCount = textElementCount + (doc.figures?.length ?? 0);

  const rowId = crypto.randomUUID();
  await sql`
    insert into documents (
      id, document_id, schema_version, doc_version, kind, source_uri, file_name,
      mime_type, checksum, checksum_algorithm, page_count, element_count,
      text_element_count, chunk_count, source_engine, source_engine_version,
      extracted_at, canonical_json, ingested_by, created_at
    ) values (
      ${rowId}::uuid,
      ${doc.documentId!},
      ${doc.schemaVersion!},
      ${doc.version ?? 1},
      ${kind},
      ${doc.source!.uri!},
      ${doc.source!.fileName ?? null},
      ${doc.source!.mimeType!},
      ${checksum!},
      ${doc.source!.checksumAlgorithm == null || doc.source!.checksumAlgorithm.trim() === "" ? "SHA-256" : doc.source!.checksumAlgorithm},
      ${doc.pageCount!},
      ${totalElementCount},
      ${textElementCount},
      ${drafts.length},
      ${doc.provenance!.engine!},
      ${doc.provenance!.engineVersion!},
      ${parseExtractedAt(doc.provenance!.extractedAt ?? null)},
      ${rawJson}::jsonb,
      ${ingestedBy}::uuid,
      ${now.toISOString()}
    )`;

  for (let i = 0; i < drafts.length; i++) {
    const draft = drafts[i]!;
    await sql`
      insert into document_chunks (
        id, document_row_id, chunk_index, content, page_start, page_end,
        element_ids, token_estimate, created_at, kind, subject_id, series,
        year, paper_code, atom_number, spec_codes, embed_rev
      ) values (
        ${crypto.randomUUID()}::uuid,
        ${rowId}::uuid,
        ${i},
        ${draft.content},
        ${draft.pageStart},
        ${draft.pageEnd},
        ${JSON.stringify(draft.elementIds)}::jsonb,
        ${draft.tokenEstimate},
        ${now.toISOString()},
        ${kind},
        ${subjectId}::uuid,
        ${series},
        ${year},
        ${paperCode},
        ${atomNumber(draft.groupKey)},
        ${specCodes === null ? null : JSON.stringify(specCodes)}::jsonb,
        ${CURRENT_EMBED_REV}
      )`;
  }

  return {
    id: rowId,
    documentId: doc.documentId!,
    duplicate: false,
    chunks: drafts.length,
    elements: totalElementCount,
    pages: doc.pageCount!,
    totalChunks: drafts.length,
  };
}

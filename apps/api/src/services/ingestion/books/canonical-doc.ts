/**
 * T-MIG-133 band 133b (r0) — the synthetic CanonicalDocument builder: the
 * v3 rows ride the EXISTING ingestion law (canonicalDocumentViolations +
 * ChunkingService via ingestCanonicalDocument) — zero forks of the frozen
 * code, the book is just another canonical corpus member (kind TEXTBOOK).
 *
 * Element law: snake_case wire names, element_type "text_block", role =
 * the v3 content_type (provenance), page_number = the VIEWER numbering
 * (pdf_pages[0] — the corpus-pdf/pdf.js coordinate law), reading_order =
 * the JSONL order, group_key = the book group law (toc.ts). Element ids
 * are the v3 chunk ids — asserted unique (the shared id-universe law).
 *
 * Identity: documentId is DERIVED (P-6 mirror) from
 * sha256:<pdf-checksum>|engine|engineVersion — free-form ids are illegal.
 */
import {
  canonicalDocumentViolations,
  derivedDocumentId,
  type BookChunk,
  type CanonicalDocument,
} from "@syllabai/contracts";
import { groupKeyOf } from "./toc";

export interface CanonicalBuild {
  doc: CanonicalDocument;
  documentId: string;
  /** element id → group key (the chunk→chapter overlay map). */
  groupByElementId: Map<string, string>;
  includedRows: number;
}

export interface CanonicalBuildInput {
  rows: BookChunk[];
  checksum: string;
  uri: string;
  fileName: string;
  pageCount: number;
  subjectTitle: string;
  subjectCode: string;
  label: string;
  engine: string;
  engineVersion: string;
}

export function buildCanonicalDocument(input: CanonicalBuildInput): CanonicalBuild {
  const seen = new Set<string>();
  const groupByElementId = new Map<string, string>();
  const textBlocks = input.rows.map((row, i) => {
    if (seen.has(row.id)) throw new Error(`duplicate v3 chunk id ${row.id}`);
    seen.add(row.id);
    const gk = groupKeyOf(row);
    groupByElementId.set(row.id, gk);
    return {
      element_id: row.id,
      element_type: "text_block",
      page_number: row.pdf_pages[0],
      text: row.text,
      reading_order: i,
      confidence: null,
      source_engine: input.engine,
      source_engine_version: input.engineVersion,
      group_key: gk,
      role: row.content_type,
      heading_level: null,
    };
  });

  const documentId = derivedDocumentId(input.checksum, input.engine, input.engineVersion);
  const doc: CanonicalDocument = {
    documentId,
    schemaVersion: "1.0",
    version: 1,
    source: {
      uri: input.uri,
      checksum: input.checksum,
      checksumAlgorithm: "SHA-256",
      mimeType: "application/pdf",
      fileName: input.fileName,
    },
    pageCount: input.pageCount,
    pages: null,
    sections: null,
    textBlocks,
    tables: null,
    figures: null,
    equations: null,
    provenance: {
      engine: input.engine,
      engineVersion: input.engineVersion,
      extractedAt: null,
      extractionParams: null,
      application: "syllabai-v2 t-mig-133b",
      schemaVersion: null,
    },
    retrieval: {
      subjectTitle: input.subjectTitle,
      subjectCode: input.subjectCode,
      series: null,
      year: null,
      paperCode: null,
      label: input.label,
      unit: null,
      specCodes: null,
    },
  };
  const violations = canonicalDocumentViolations(doc);
  if (violations.length > 0) {
    throw new Error(`synthetic canonical document failed validation: ${violations.join("; ")}`);
  }
  return { doc, documentId, groupByElementId, includedRows: input.rows.length };
}

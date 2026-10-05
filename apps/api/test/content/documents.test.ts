/**
 * T-MIG-020 tranche-1 unit tests — the content module's contract-independent
 * surface (repos + view mappings + service law), stubbed-sql (no Neon).
 *
 * The stub dispatches on the rendered query text so every test also PINS the
 * SQL shape its repository issues (order-by clauses and gate predicates are
 * load-bearing parity, not implementation detail).
 */
import { describe, expect, test } from "bun:test";
import { DocumentsRepository, documentSummaryView } from "../../src/services/content/documents";
import { fakeSql } from "./helpers";

const DOC = {
  id: "00000000-0000-4000-8000-00000000000a",
  document_id: "doc-abc-1",
  schema_version: "1.0",
  doc_version: 2,
  kind: "QUESTION_PAPER",
  source_uri: "file:///corpus/qp.pdf",
  file_name: "qp-june-2024.pdf",
  mime_type: "application/pdf",
  checksum: "deadbeef",
  checksum_algorithm: "SHA-256",
  page_count: 12,
  element_count: 340,
  text_element_count: 300,
  chunk_count: 44,
  source_engine: "syllabai-parser",
  source_engine_version: "1.0.0",
  extracted_at: null,
  canonical_json: "{}",
  ingested_by: null,
  validation_state: "SUGGESTED",
  created_at: "2026-10-04T19:02:13Z",
};

describe("DocumentsRepository — observed query surface", () => {
  test("list is unpaged, newest-first; rows map to summary views", async () => {
    const sql = fakeSql([{ match: /from documents order by created_at desc/i, rows: [DOC] }]);
    const docs = new DocumentsRepository(sql);
    const list = await docs.findAllByOrderByCreatedAtDesc();
    expect(list).toHaveLength(1);
    expect(list[0]!.documentId).toBe("doc-abc-1");
    expect(list[0]!.kind).toBe("QUESTION_PAPER");
    // summary mapping rides the same shape (view port, controller :199-212)
    const view = documentSummaryView(list[0]!);
    expect(view).toEqual({
      id: DOC.id,
      documentId: "doc-abc-1",
      docVersion: 2,
      kind: "QUESTION_PAPER",
      title: "qp-june-2024.pdf",
      pageCount: 12,
      elementCount: 340,
      textElementCount: 300,
      chunkCount: 44,
      sourceEngine: "syllabai-parser",
      sourceEngineVersion: "1.0.0",
      checksum: "deadbeef",
      createdAt: "2026-10-04T19:02:13.000Z",
    });
  });

  test("summary title falls back to source_uri when file_name is null (:207)", async () => {
    const row = {
      id: DOC.id,
      documentId: "doc-abc-1",
      schemaVersion: "1.0",
      docVersion: 2,
      kind: "QUESTION_PAPER" as const,
      sourceUri: "file:///corpus/qp.pdf",
      fileName: null,
      mimeType: "application/pdf",
      checksum: "deadbeef",
      checksumAlgorithm: "SHA-256",
      pageCount: 12,
      elementCount: 340,
      textElementCount: 300,
      chunkCount: 44,
      sourceEngine: "syllabai-parser",
      sourceEngineVersion: "1.0.0",
      extractedAt: null,
      canonicalJson: "{}",
      ingestedBy: null,
      validationState: "SUGGESTED",
      createdAt: new Date("2026-10-04T19:02:13Z"),
    };
    expect(documentSummaryView(row).title).toBe("file:///corpus/qp.pdf");
  });

  test("findById issues a PK lookup; unknown row → null", async () => {
    const sql = fakeSql([{ match: /select \* from documents where id = \?$/i, rows: [] }]);
    const docs = new DocumentsRepository(sql);
    expect(await docs.findById("00000000-0000-4000-8000-0000000000d1")).toBeNull();
  });

  test("existsCitable carries the T-C20 corpus-law predicate verbatim", async () => {
    const sql = fakeSql([{ match: /count\(\*\) > 0/i, rows: [{ citable: true }] }]);
    const docs = new DocumentsRepository(sql);
    expect(await docs.existsCitable(DOC.id)).toBe(true);
    const q = sql.queries[0]!;
    // the SERVING-side gate: VALIDATED paper linkage on the business id, or a
    // VALIDATED knowledge-layer row (DocumentRepository.java:67-79)
    expect(q).toContain("p.validation_state = 'VALIDATED'");
    expect(q).toContain("p.question_paper_document_id = d.document_id");
    expect(q).toContain("p.mark_scheme_document_id = d.document_id");
    expect(q).toContain("d.validation_state = 'VALIDATED'");
  });

  test("existsCitable → false maps the count>0 boolean, not truthy rows", async () => {
    const sql = fakeSql([{ match: /count\(\*\) > 0/i, rows: [{ citable: false }] }]);
    const docs = new DocumentsRepository(sql);
    expect(await docs.existsCitable(DOC.id)).toBe(false);
  });

  test("top-by-document-id pins the doc_version desc limit-1 shape", async () => {
    const sql = fakeSql([
      { match: /where document_id = \?\s*order by doc_version desc limit 1/i, rows: [] },
    ]);
    const docs = new DocumentsRepository(sql);
    expect(await docs.findTopByDocumentIdOrderByDocVersionDesc("doc-abc-1")).toBeNull();
  });
});

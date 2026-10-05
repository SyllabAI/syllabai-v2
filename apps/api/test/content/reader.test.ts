/**
 * ContentReaderService unit tests — the citation-read law (L5 / T-C20),
 * pinned against the captured golden shapes:
 *   - content-reader-unknown-doc-404        "Document <id> not found"
 *   - content-reader-unknown-doc-page-404   same message (unknown doc wins
 *     before any page check)
 * The out-of-range-page message ("Document page N <id> not found") and the
 * existsCitable indistinguishable-404 law are Java-faithful ports whose
 * real-data parity cases land with the F-5 tranche.
 */
import { describe, expect, test } from "bun:test";
import { ContentReaderService } from "../../src/services/content/reader";
import { DocumentsRepository } from "../../src/services/content/documents";
import { ExamPapersRepository } from "../../src/services/content";
import { documentPageText } from "../../src/services/content/page-text";
import { fakeSql, type Route } from "./helpers";

const ID = "00000000-0000-4000-8000-0000000000d1";
const UNKNOWN = "00000000-0000-4000-8000-0000000000ff";

const CANONICAL = {
  documentId: "doc-abc-1",
  textBlocks: [
    { element_id: "t3", page_number: 2, reading_order: 30, text: "later block" },
    { element_id: "t1", page_number: 2, reading_order: 10, text: "first block" },
    { element_id: "t2", page_number: 2, reading_order: null, text: "unordered tail" },
    { element_id: "t4", page_number: 1, reading_order: 5, text: "page one" },
    { element_id: "t5", page_number: 2, reading_order: 20, text: null }, // no text layer
  ],
  tables: [{ element_id: "tb1", page_number: 2, reading_order: 20, text: "a table" }],
  equations: [{ element_id: "e1", page_number: 3, reading_order: 1, text: "E=mc^2" }],
};

const DOC = (overrides: Record<string, unknown> = {}) => ({
  id: ID,
  document_id: "doc-abc-1",
  schema_version: "1.0",
  doc_version: 1,
  kind: "SYLLABUS",
  source_uri: "file:///corpus/syl.pdf",
  file_name: "syllabus.pdf",
  mime_type: "application/pdf",
  checksum: "cafe",
  checksum_algorithm: "SHA-256",
  page_count: 3,
  element_count: 5,
  text_element_count: 5,
  chunk_count: 0,
  source_engine: "syllabai-parser",
  source_engine_version: "1.0.0",
  extracted_at: null,
  canonical_json: JSON.stringify(CANONICAL),
  ingested_by: null,
  validation_state: "VALIDATED",
  created_at: "2026-10-04T19:02:13Z",
  ...overrides,
});

function build(routes: Route[]) {
  const sql = fakeSql(routes);
  return new ContentReaderService(new DocumentsRepository(sql), new ExamPapersRepository(sql));
}

describe("ContentReaderService — the citation-read law", () => {
  test("unknown id → 404 'Document <id> not found' (golden: content-reader-unknown-doc-404)", async () => {
    const svc = build([{ match: /from documents where id/i, rows: [] }]);
    await expect(svc.get(UNKNOWN, null)).rejects.toThrow(`Document ${UNKNOWN} not found`);
  });

  test("non-citable row → the SAME 404 (corpus law: no state leak, T-C20)", async () => {
    const svc = build([
      { match: /from documents where id/i, rows: [DOC()] },
      { match: /count\(\*\) > 0/i, rows: [{ citable: false }] },
    ]);
    let message = "";
    await svc.get(ID, null).catch((e) => (message = e.message));
    expect(message).toBe(`Document ${ID} not found`);
  });

  test("header shape: page/text null; non-paper kind → paper null", async () => {
    const svc = build([
      { match: /from documents where id/i, rows: [DOC()] },
      { match: /count\(\*\) > 0/i, rows: [{ citable: true }] },
      // paperRefOf must NOT be called for non-paper kinds — if it were, the
      // exam_papers query below would miss and the stub would throw
    ]);
    const view = await svc.get(ID, null);
    expect(view).toMatchObject({
      id: ID,
      documentId: "doc-abc-1",
      docVersion: 1,
      kind: "SYLLABUS",
      title: "syllabus.pdf",
      pageCount: 3,
      page: null,
      text: null,
      paper: null,
    });
  });

  test("QP row resolves PaperRef through the business-document-id join (role QP)", async () => {
    const paperId = "00000000-0000-4000-8000-0000000000e1";
    const svc = build([
      { match: /from documents where id/i, rows: [DOC({ kind: "QUESTION_PAPER" })] },
      { match: /count\(\*\) > 0/i, rows: [{ citable: true }] },
      {
        match: /from exam_papers where question_paper_document_id = \?/i,
        rows: [
          {
            id: paperId,
            paper_code: "0417/22",
            session_label: "June 2024",
            created_at: "2026-10-04T10:00:00Z",
          },
        ],
      },
    ]);
    const view = await svc.get(ID, null);
    expect(view.paper).toEqual({
      paperId,
      paperCode: "0417/22",
      sessionLabel: "June 2024",
      role: "QP",
    });
  });

  test("MARK_SCHEME row with no linked paper → paper null (hand-registered document)", async () => {
    const svc = build([
      { match: /from documents where id/i, rows: [DOC({ kind: "MARK_SCHEME" })] },
      { match: /count\(\*\) > 0/i, rows: [{ citable: true }] },
      { match: /from exam_papers/i, rows: [] },
    ]);
    const view = await svc.get(ID, null);
    expect(view.paper).toBeNull();
  });

  test("out-of-range page → 404 'Document page N <id> not found' (page < 1 and > pageCount)", async () => {
    const gate = [
      { match: /from documents where id/i, rows: [DOC()] },
      { match: /count\(\*\) > 0/i, rows: [{ citable: true }] },
    ];
    let message = "";
    await build(gate).get(ID, 0).catch((e) => (message = e.message));
    expect(message).toBe(`Document page 0 ${ID} not found`);
    await build(gate).get(ID, 4).catch((e) => (message = e.message));
    expect(message).toBe(`Document page 4 ${ID} not found`);
  });

  test("page text: families collected, reading_order asc with nulls last, joined by \\n", async () => {
    const svc = build([
      { match: /from documents where id/i, rows: [DOC()] },
      { match: /count\(\*\) > 0/i, rows: [{ citable: true }] },
    ]);
    const view = await svc.get(ID, 2);
    // page 2: t1(10) → tb1(20) → t3(30) → t2(null, last); t4 is page 1; t5 has no text
    expect(view.text).toBe("first block\na table\nlater block\nunordered tail");
    expect(view.page).toBe(2);
  });

  test("text-free page → the EMPTY STRING (honest no-text-layer, never a placeholder)", async () => {
    const svc = build([
      { match: /from documents where id/i, rows: [DOC()] },
      { match: /count\(\*\) > 0/i, rows: [{ citable: true }] },
    ]);
    // page 1 has an element but its text is on page 2... t4 is page 1 with text.
    // Use page 3: equation only. A page with NO text-bearing elements (e.g. a
    // figure-only page) must yield "".
    const onlyFigures = { textBlocks: [], tables: [], equations: [] };
    expect(documentPageText(onlyFigures, 1)).toBe("");
    const view = await svc.get(ID, 3);
    expect(view.text).toBe("E=mc^2");
  });

  test("corrupted canonical JSON → plain Error (500 fallthrough), message never echoes content (R10)", async () => {
    const svc = build([
      {
        match: /from documents where id/i,
        rows: [DOC({ canonical_json: "{not json" })],
      },
      { match: /count\(\*\) > 0/i, rows: [{ citable: true }] },
    ]);
    let message = "";
    await svc.get(ID, 1).catch((e) => (message = e.message));
    expect(message).toBe(`stored canonical JSON failed to parse for document ${ID}`);
    expect(message).not.toContain("not json");
  });
});

/**
 * ContentReaderService — port of ContentReaderController.java:59-95 (the
 * learner-facing citation read surface, L5).
 *
 * Route: GET /api/v1/content/documents/{id} (authenticated surface — the
 * role gate lives in the route layer; this module owns the CONTENT law).
 *
 * Parity contract (each branch maps to a captured golden case or a
 * documented pending tranche):
 *   - unknown id                → NotFoundException("Document", id) → 404
 *                                 "Document <id> not found"
 *                                 (content-reader-unknown-doc-404)
 *   - non-citable row           → the SAME 404, byte-identical message —
 *                                 corpus law T-C20: an import nothing serves
 *                                 is indistinguishable from unknown (no
 *                                 state leak)
 *   - page == null              → header view (page/text/paper null-able)
 *   - page < 1 or > pageCount   → NotFoundException("Document page " + page,
 *                                 id) → 404 "Document page N <id> not found"
 *   - page text                 → DocumentPageText over the parsed sealed
 *                                 canonical JSON (verbatim law)
 *   - corrupted canonical JSON  → plain Error ( IllegalStateException port)
 *                                 → app-level 500 internal_error; the fixed
 *                                 client message never echoes row content
 *                                 (R10)
 *   - paper ref                 → QP/MS rows only, resolved through the
 *                                 T-011/T-013 join by BUSINESS document id;
 *                                 metadata only — never a serving authority
 *
 * The existsCitable gate runs BEFORE any parse cost (the controller pays the
 * parse only for requests that already passed the gate, :75).
 */
import { NotFoundException } from "../identity/errors";
import { DocumentsRepository, documentSummaryView, type DocumentRow } from "./documents";
import { documentPageText } from "./page-text";

/** Port of PaperRef (F-022 tranche 2, ContentReaderController.java:135). */
export interface PaperRef {
  paperId: string;
  paperCode: string;
  sessionLabel: string;
  role: "QP" | "MS";
}

/** Port of CitationDocumentView (ContentReaderController.java:117-119). */
export interface CitationDocumentView {
  id: string;
  documentId: string;
  docVersion: number;
  kind: DocumentRow["kind"];
  title: string;
  pageCount: number;
  page: number | null;
  text: string | null;
  paper: PaperRef | null;
}

/** The exam-paper join the PaperRef resolution needs (tranche-2-owned SQL). */
export interface LinkedPaperLookup {
  findAllByLinkedDocumentId(documentId: string): Promise<
    Array<{ id: string; paperCode: string; sessionLabel: string; createdAt: Date }>
  >;
}

export class ContentReaderService {
  constructor(
    private readonly documents: DocumentsRepository,
    private readonly examPapers: LinkedPaperLookup,
  ) {}

  async get(id: string, page: number | null): Promise<CitationDocumentView> {
    const doc = await this.documents.findById(id);
    if (doc == null) {
      throw new NotFoundException("Document", id);
    }
    if (!(await this.documents.existsCitable(id))) {
      // corpus law: nothing serves without human validation — an honest 404
      // identical to the unknown-id response (no state leak)
      throw new NotFoundException("Document", id);
    }
    if (page == null) {
      // header shape STILL carries the paper identity (ContentReaderController
      // .java:69-72 — paperRefOf runs for the header too)
      const paper = await this.paperRefOf(doc);
      return this.view(doc, null, null, paper);
    }
    if (page < 1 || page > doc.pageCount) {
      throw new NotFoundException(`Document page ${page}`, id);
    }
    const text = this.pageText(doc, page);
    const paper = await this.paperRefOf(doc);
    return this.view(doc, page, text, paper);
  }

  /**
   * Port of paperRefOf (:85-95): null for every non-paper kind and for
   * paper rows no exam paper links (a hand-registered document). Newest
   * paper row wins (the query orders by created_at desc; findFirst).
   */
  private async paperRefOf(doc: DocumentRow): Promise<PaperRef | null> {
    if (doc.kind !== "QUESTION_PAPER" && doc.kind !== "MARK_SCHEME") {
      return null;
    }
    const papers = await this.examPapers.findAllByLinkedDocumentId(doc.documentId);
    const first = papers[0];
    if (first == null) {
      return null;
    }
    return {
      paperId: first.id,
      paperCode: first.paperCode,
      sessionLabel: first.sessionLabel,
      role: doc.kind === "QUESTION_PAPER" ? "QP" : "MS",
    };
  }

  /**
   * Port of pageText (:100-108): the parse cost is paid only by requests
   * that already passed the gate; parse errors are a corrupted-row condition
   * — fail loud server-side (500), never echo row content (R10).
   */
  private pageText(doc: DocumentRow, page: number): string {
    let canonical: Parameters<typeof documentPageText>[0];
    try {
      canonical = JSON.parse(doc.canonicalJson);
    } catch {
      throw new Error(
        `stored canonical JSON failed to parse for document ${doc.id}`,
      );
    }
    return documentPageText(canonical, page);
  }

  /** Port of CitationDocumentView.from (:121-125) — title fallback rides on
   *  the summary mapping (fileName == null → sourceUri). */
  private view(
    doc: DocumentRow,
    page: number | null,
    text: string | null,
    paper: PaperRef | null,
  ): CitationDocumentView {
    const summary = documentSummaryView(doc);
    return {
      id: summary.id,
      documentId: summary.documentId,
      docVersion: summary.docVersion,
      kind: summary.kind,
      title: summary.title,
      pageCount: summary.pageCount,
      page,
      text,
      paper,
    };
  }
}

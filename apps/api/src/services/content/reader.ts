/**
 * Learner citation read surface port — the corpus-law gate and the page
 * text assembly. Sources (syllabai-core @ main, frozen, verified
 * 2026-10-05, T-MIG-020):
 *   content/ContentReaderController.java   content/DocumentPageText.java
 *   content/DocumentRepository.java        (existsCitable — see repositories.ts)
 *
 * Corpus law parity (T-C20, ContentReaderController.java:27-34): only a
 * document on the SERVING side of the validation gates is readable — the
 * question paper / mark scheme of a VALIDATED exam paper, or a VALIDATED
 * knowledge-layer document (existsCitable). A corpus import nothing serves
 * is an honest 404, byte-identical to the unknown-id response — no state
 * leak. The page range check (:72-74) runs AFTER the gate; page text parse
 * failures are a corrupted-row condition — fail loud 500, never echo row
 * content (R10, :97-99 fixed client message lives in the response mapping).
 */
import type { DocumentRow } from "./repositories";
import type { CitationDocumentView, PaperRef } from "@syllabai/contracts";

/**
 * Verbatim port of DocumentPageText.of — verbatim law, no rewrap/reorder.
 *
 * F-2 (T-MIG-023): the canonical jsonb follows the §8 ingestion contract
 * exactly as CanonicalDocumentDto.java:13-14 states — "top-level camelCase,
 * per-element snake_case" — so the element fields are `page_number` and
 * `reading_order` (@JsonProperty mappings at CanonicalDocumentDto.java
 * :105/:108, :121/:124, :138/:141, :155/:158; `text` is plain in both
 * conventions). run-001 read camelCase keys that do not exist in the
 * stored jsonb → the page filter matched nothing → honest-looking empty
 * text on pages the capture proves carry text.
 */
export function documentPageText(canonical: unknown, page: number): string {
  const doc = canonical as {
    textBlocks?: Array<{ text?: string | null; page_number?: number | null; reading_order?: number | null } | null>;
    tables?: Array<{ text?: string | null; page_number?: number | null; reading_order?: number | null } | null>;
    equations?: Array<{ text?: string | null; page_number?: number | null; reading_order?: number | null } | null>;
  } | null;
  const pieces: Array<{ readingOrder: number | null; text: string }> = [];
  const collect = (
    elements: Array<{ text?: string | null; page_number?: number | null; reading_order?: number | null } | null> | undefined,
  ) => {
    if (elements == null) return;
    for (const element of elements) {
      if (element != null && element.text != null && element.page_number === page) {
        pieces.push({
          readingOrder: element.reading_order == null ? null : Number(element.reading_order),
          text: element.text,
        });
      }
    }
  };
  collect(doc?.textBlocks);
  collect(doc?.tables);
  collect(doc?.equations);
  // stable sort: equal reading_order keeps canonical document order; a
  // missing reading_order sorts last within the page, never first
  pieces.sort((a, b) => {
    if (a.readingOrder === null && b.readingOrder === null) return 0;
    if (a.readingOrder === null) return 1;
    if (b.readingOrder === null) return -1;
    return a.readingOrder - b.readingOrder;
  });
  // text-free page yields the empty string — honest "no text layer"
  return pieces.map((p) => p.text).join("\n");
}

/** Port of CitationDocumentView.from (:121-125) — title falls back to sourceUri. */
export function toCitationView(
  doc: DocumentRow,
  page: number | null,
  text: string | null,
  paper: PaperRef | null,
): CitationDocumentView {
  return {
    id: doc.id,
    documentId: doc.documentId,
    docVersion: doc.docVersion,
    kind: doc.kind as CitationDocumentView["kind"],
    title: doc.fileName == null ? doc.sourceUri : doc.fileName,
    pageCount: doc.pageCount,
    page,
    text,
    paper,
  };
}

/**
 * Port of ContentReaderController.paperRefOf (:85-95): the paper identity
 * behind a QP/MS row — null for every other kind and for QP/MS rows no exam
 * paper links. role is "QP" or "MS" (which side of the pair this row is).
 */
export async function paperRefOf(
  doc: DocumentRow,
  findLinked: (documentId: string) => Promise<
    Array<{ id: string; paperCode: string | null; sessionLabel: string | null }>
  >,
): Promise<PaperRef | null> {
  if (doc.kind !== "QUESTION_PAPER" && doc.kind !== "MARK_SCHEME") return null;
  const papers = await findLinked(doc.documentId);
  const first = papers[0];
  if (!first) return null;
  return {
    paperId: first.id,
    paperCode: first.paperCode,
    sessionLabel: first.sessionLabel,
    role: doc.kind === "QUESTION_PAPER" ? "QP" : "MS",
  };
}

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
 * Verbatim port of ContentReaderController.pageText (:97-105) +
 * DocumentPageText.of — verbatim law, no rewrap/reorder.
 *
 * §8 WIRE BINDING (F-2, T-MIG-022 run-001 diagnosis): the sealed canonical
 * JSON binds camelCase family keys at the TOP level (textBlocks/tables/
 * equations) but SNAKE_CASE keys on the elements (page_number, reading_order;
 * CanonicalDocumentDto.java:102-114, mirrored by packages/contracts
 * content-writes canonicalElementBase). The frozen controller binds the full
 * DTO via Jackson (JSON.readValue → CanonicalDocumentDto.class) BEFORE
 * assembling — the element walk below mirrors that binding for the two
 * fields the assembly consumes: Jackson's int coercion law (exact-integer
 * numeric strings, _parse_int_primitive parity with contracts javaJsonInt)
 * with a bind violation failing loud (R10: the error boundary renders the
 * fixed 500 client message — never row content), and [null] elements skipped
 * (Jackson binds them; Java's `element != null` guard skips).
 */
const NUMERIC_TEXT = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/; // contracts content-writes.ts:66 (module-private there)

/** Jackson Integer binding parity: null binds; exact-integer numbers bind;
 * numeric-text strings coerce (_parse_int_primitive); anything else is a
 * binding violation → corrupted row (IllegalStateException parity → 500). */
function bindCanonicalInt(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const t = value.trim();
    if (NUMERIC_TEXT.test(t) && Number.isInteger(Number(t))) return Number(t);
  } else if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  throw new Error(
    "stored canonical JSON failed to bind an element integer (CanonicalDocumentDto parity)",
  );
}

export function documentPageText(canonical: unknown, page: number): string {
  const doc = canonical as {
    textBlocks?: Array<{ text?: unknown; page_number?: unknown; reading_order?: unknown } | null>;
    tables?: Array<{ text?: unknown; page_number?: unknown; reading_order?: unknown } | null>;
    equations?: Array<{ text?: unknown; page_number?: unknown; reading_order?: unknown } | null>;
  } | null;
  const pieces: Array<{ readingOrder: number | null; text: string }> = [];
  const collect = (
    elements: Array<{ text?: unknown; page_number?: unknown; reading_order?: unknown } | null> | undefined,
  ) => {
    if (elements == null) return;
    for (const element of elements) {
      if (element == null) continue; // Jackson binds [null]; Java's `element != null` skips
      if (element.text == null) continue; // element.text() != null law
      const pageNumber = bindCanonicalInt(element.page_number); // §8 wire name
      if (pageNumber !== page) continue; // Integer.valueOf(page).equals(element.pageNumber())
      pieces.push({
        readingOrder: bindCanonicalInt(element.reading_order), // nullsLast comparator input
        text: String(element.text), // Jackson scalar→String coercion parity
      });
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

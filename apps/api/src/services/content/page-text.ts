/**
 * DocumentPageText port — verbatim page-scoped text extraction from the
 * sealed canonical document (DocumentPageText.java, L5 citation read).
 *
 * Verbatim law: element text is joined, never rewrapped, re-trimmed or
 * re-ordered beyond the canonical reading_order. Text-bearing families only
 * (text blocks + tables + equations — the set the retrieval index embeds);
 * figures carry no text layer and contribute nothing. A text-free page
 * yields the EMPTY STRING — an honest "no text layer", never a placeholder.
 *
 * Canonical JSON shapes (CanonicalDocumentDto.java — the parser's sealed
 * schema 1.0): top-level properties are camelCase (textBlocks / tables /
 * equations); element properties are snake_case (page_number / reading_order
 * / text). The port reads exactly those names — both alias families are
 * load-bearing wire format, not style.
 *
 * Pure function over the parsed DTO — no repository, no I/O, no cache.
 */

interface CanonicalElement {
  text?: unknown;
  page_number?: unknown;
  reading_order?: unknown;
}

interface CanonicalDocument {
  textBlocks?: CanonicalElement[] | null;
  tables?: CanonicalElement[] | null;
  equations?: CanonicalElement[] | null;
}

interface Piece {
  readingOrder: number | null;
  text: string;
}

const isPage = (element: CanonicalElement | undefined | null, page: number): element is CanonicalElement & { text: string; page_number: number } =>
  element != null &&
  typeof element.text === "string" &&
  element.page_number != null &&
  Number(element.page_number) === page;

/**
 * Port of DocumentPageText.of: collect the page's text-bearing elements in
 * family order (text blocks, tables, equations), stable-sort by
 * reading_order with nulls LAST (equal keys keep canonical document order —
 * Java List.sort is TimSort-stable; ES2019+ Array.sort is spec-stable), join
 * with "\n".
 */
export function documentPageText(canonical: CanonicalDocument, page: number): string {
  const pieces: Piece[] = [];
  const collect = (elements: CanonicalElement[] | null | undefined) => {
    if (elements == null) return;
    for (const element of elements) {
      if (isPage(element, page)) {
        pieces.push({
          readingOrder:
            element.reading_order == null ? null : Number(element.reading_order),
          text: element.text as string,
        });
      }
    }
  };
  collect(canonical.textBlocks);
  collect(canonical.tables);
  collect(canonical.equations);

  pieces.sort((a, b) => {
    if (a.readingOrder == null && b.readingOrder == null) return 0;
    if (a.readingOrder == null) return 1; // nullsLast — never first
    if (b.readingOrder == null) return -1;
    return a.readingOrder - b.readingOrder;
  });

  return pieces.map((p) => p.text).join("\n");
}

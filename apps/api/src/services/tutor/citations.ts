/**
 * Citation resolution port (T-MIG-060 tranche 1) — frozen source @ 6cad6ef:
 * SimpleCitationResolver.java :22-73 (+ the CitationResolver.Citation record
 * :24-28), line-against-line.
 *
 * Renders evidence items into concrete, resolvable citations — "Mark scheme
 * — p6" with a deep link into the content API, or "Specification — Topic 3
 * (U1-T3)" with a link into the KG API. Never a vague "according to the
 * syllabus". Deep links target the learner-accessible citation surface
 * (/api/v1/content/documents/{row}?page=N — L5): the corpus-law validation
 * gates make the link honest for every role — a document nothing serves is
 * an honest 404.
 */
import type { EvidenceItem } from "./evidence";

export interface Citation {
  /** 1-based citation number ([n] markers in the answer) */
  index: number;
  label: string;
  sourceType: string;
  /** canonical document id (null for KG citations) */
  documentId: string | null;
  /** source page when known */
  page: number | null;
  /** KG node id for spec-topic citations (null for chunks) */
  nodeId: string | null;
  /** resolvable link into the content/KG API */
  deepLink: string | null;
}

/**
 * One citation per evidence item, same order (citation index = list order).
 * SimpleCitationResolver.resolve :31-43.
 */
export function resolveCitations(evidence: ReadonlyArray<EvidenceItem>): Citation[] {
  const citations: Citation[] = [];
  for (let i = 0; i < evidence.length; i++) {
    const item = evidence[i];
    if (item == null) continue;
    citations.push({
      index: i + 1,
      label: labelOf(item),
      sourceType: item.source,
      documentId: item.documentId,
      page: item.pageStart,
      nodeId: item.nodeId,
      deepLink: deepLinkOf(item),
    });
  }
  return citations;
}

/** labelOf :45-59 — the exact per-source labels. */
function labelOf(item: EvidenceItem): string {
  switch (item.source) {
    case "MARK_SCHEME":
      return "Mark scheme" + pageSuffix(item);
    case "QUESTION_PAPER":
      return "Question paper" + pageSuffix(item);
    case "SYLLABUS":
      return "Specification" + pageSuffix(item);
    case "OTHER":
      return "Source document" + pageSuffix(item);
    case "KNOWLEDGE_NODE":
      // Java String.format(Locale.ROOT, "Specification topic %s — %s", ...)
      return `Specification topic ${item.nodeCode} — ${item.nodeTitle}`;
    case "LEARNER_WORK":
      return "Your submitted answer";
    case "NOTE":
      return "Revision notes" + pageSuffix(item);
    case "TEXTBOOK":
      return "Textbook" + pageSuffix(item);
    case "CARD":
      return "Question card";
  }
}

/** pageSuffix :61-68 — " — pp6–8" for ranges, " — p6" for a single page. */
function pageSuffix(item: EvidenceItem): string {
  if (item.pageStart == null) return "";
  if (item.pageEnd != null && item.pageEnd !== item.pageStart) {
    return ` — pp${item.pageStart}\u2013${item.pageEnd}`;
  }
  return ` — p${item.pageStart}`;
}

/**
 * deepLinkOf :70-81 — KG nodes link into the KG API; document chunks into
 * the content API with the page param; an item with no content-store row
 * (e.g. the CLA's synthesized question-stem evidence) gets an honest null
 * link, never a fabricated path.
 *
 * T-MIG-133 band 133d (r0) — the TEXTBOOK branch: book evidence deep-links
 * the books serving surface of record (the 133c books routes + the hub's
 * in-app viewer mapping):
 *
 *   /api/v1/content/books/{documentId}?page={pdf}&course={courseId}
 *
 *   - page rides the PDF-page-true viewer coordinate (sourcePageStart, the
 *     133d translation law: the label is book-true, the link is viewer-true
 *     — the hub's books viewer resolves ?page via the F-022 nearest-chapter
 *     law, and the API's own citation-target route serves the same
 *     resolution so the link is honest on BOTH planes).
 *   - course rides the book_chapters.course_id binding when the item carries
 *     it (the hub viewer's path segment space — the 133c shelf binding of
 *     record); the hub falls back to the ask's own course context, else the
 *     honest null link (its existing law).
 *   - the link is honest on the API plane too: the 133d citation-target
 *     route (GET /api/v1/content/books/:documentId) resolves the page under
 *     the same T-C20 gate — an unknown/unvalidated book is an honest 404,
 *     never a fabricated path.
 */
function deepLinkOf(item: EvidenceItem): string | null {
  if (item.source === "KNOWLEDGE_NODE") {
    return `/api/v1/knowledge/nodes/${item.nodeId}`;
  }
  if (item.source === "TEXTBOOK" && item.documentId != null) {
    const params = new URLSearchParams();
    const page = item.sourcePageStart ?? item.pageStart;
    if (page != null) params.set("page", String(page));
    if (item.bookCourseId != null) params.set("course", item.bookCourseId);
    const qs = params.toString();
    return `/api/v1/content/books/${item.documentId}${qs === "" ? "" : `?${qs}`}`;
  }
  if (item.documentRowId == null) return null;
  const link = `/api/v1/content/documents/${item.documentRowId}`;
  return item.pageStart == null ? link : `${link}?page=${item.pageStart}`;
}

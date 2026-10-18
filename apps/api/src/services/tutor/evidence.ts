/**
 * EvidenceItem port (T-MIG-060 tranche 1) — frozen source @ 6cad6ef:
 * src/main/java/com/syllabai/tutor/EvidenceItem.java :37-135, line-against-line.
 *
 * A retrieval candidate that survived fusion — the unit of KA-RAG evidence
 * (Master Spec §13, T-024). The tutor operates on EVIDENCE, never on raw
 * strings: every item carries document grounding (canonical chunk) or KG
 * grounding (curriculum node), page/element provenance, associated topics
 * and its scores through the pipeline (retrieval → fused → reranked).
 *
 * PARITY PIN — the EvidenceSource enum ORDER is load-bearing: the fusion
 * tiebreak compares `source().ordinal()` (ReciprocalRankFusion.java :127),
 * so this union's member order must never be reordered (MARK_SCHEME first,
 * CARD last, NOTE/TEXTBOOK appended after the original members so existing
 * ordinals stay stable — EvidenceItem.java :72-75).
 *
 * T-MIG-133 band 133d (r0) — ADDITIVE fields only (the enum-extension
 * precedent: NOTE/TEXTBOOK were appended of record; ordinals untouched):
 *   - specCodes: the chunk's spine spec-point official codes (document_chunks
 *     .spec_codes, the corpus-wide column — books carry the chapter-scoped
 *     overlay, papers their parse codes). Feeds the 133d spec-scoped fusion
 *     boost; [] when the column is null (never an untyped null).
 *   - sourcePageStart/sourcePageEnd: the RAW document-page coordinates when
 *     the serving coords were translated. Band 133d translation law: a
 *     TEXTBOOK chunk's pageStart/pageEnd serve BOOK-page-true values (the
 *     intake decision of record: "citations: book_pages") while the deep
 *     link needs the PDF-page-true viewer coordinate — so the arm keeps the
 *     raw PDF coords here. null for every non-translated item.
 *   - bookCourseId: the book_chapters.course_id binding for TEXTBOOK items
 *     (the books deep link's course hint). null otherwise.
 */

export type EvidenceSource =
  | "MARK_SCHEME" // 0 — canonical mark-scheme chunk
  | "QUESTION_PAPER" // 1 — canonical question-paper chunk
  | "SYLLABUS" // 2 — canonical syllabus/specification chunk
  | "OTHER" // 3 — other canonical document chunk
  | "KNOWLEDGE_NODE" // 4 — a matched KG curriculum node
  | "LEARNER_WORK" // 5 — the learner's OWN submitted attempt content (§7.3)
  | "NOTE" // 6 — SME revision-note chunk (plan §7 EXPLAIN leg ≈ 1.0)
  | "TEXTBOOK" // 7 — textbook chunk (plan §7 ≈ 0.7, tier-3 background)
  | "CARD"; // 8 — question-card chunk (plan §7 ≈ 0.3, identity pointers)

/** The Java enum's implicit ordinals, mirrored for the fusion tiebreak. */
export const EVIDENCE_SOURCE_ORDINAL: Record<EvidenceSource, number> = {
  MARK_SCHEME: 0,
  QUESTION_PAPER: 1,
  SYLLABUS: 2,
  OTHER: 3,
  KNOWLEDGE_NODE: 4,
  LEARNER_WORK: 5,
  NOTE: 6,
  TEXTBOOK: 7,
  CARD: 8,
};

export interface EvidenceItem {
  source: EvidenceSource;
  /** the citable text (chunk content / node title + description) */
  content: string;
  /** documents.id row (null for KNOWLEDGE_NODE) */
  documentRowId: string | null;
  /** parser-issued canonical document id (null for KG nodes) */
  documentId: string | null;
  /** canonical document version (null for KG nodes) */
  documentVersion: number | null;
  /** document_chunks.id (null for KG nodes) */
  chunkId: string | null;
  /** deterministic chunk order within the document (null for KG) */
  chunkIndex: number | null;
  /** knowledge_nodes.id (null for chunks) */
  nodeId: string | null;
  /** KG code, e.g. IALCHEM2018-U1-T3 (null for chunks) */
  nodeCode: string | null;
  /** UNIT/TOPIC/SUBTOPIC (null for chunks) */
  nodeType: string | null;
  /** node title (null for chunks) */
  nodeTitle: string | null;
  /** 1-based source page (null when unknown) — BOOK-page-true for TEXTBOOK
   *  items (the 133d translation law), document-page-true otherwise */
  pageStart: number | null;
  /** inclusive end page (null when single-page/unknown) */
  pageEnd: number | null;
  /** spine spec-point official codes riding the chunk ([] when none — 133d) */
  specCodes: string[];
  /** raw PDF-page coordinates when pageStart/pageEnd were translated to the
   *  book numbering (null when not translated — 133d) */
  sourcePageStart: number | null;
  sourcePageEnd: number | null;
  /** book_chapters.course_id binding for TEXTBOOK items (null otherwise) */
  bookCourseId: string | null;
  /** canonical elements backing this evidence (§17) */
  elementIds: string[];
  /** KG topics this evidence is associated with (v0: the intent-matched topics) */
  topicIds: string[];
  /** raw retrieval score (cosine for chunks, match specificity for KG nodes) */
  retrievalScore: number;
  /** reciprocal-rank-fusion score (comparable; rank basis) */
  fusedScore: number;
  /** post-rerank score (null until a reranker runs; NoReranker copies fused) */
  rerankScore: number | null;
}

const kindToSource: Record<string, EvidenceSource> = {
  MARK_SCHEME: "MARK_SCHEME",
  QUESTION_PAPER: "QUESTION_PAPER",
  SYLLABUS: "SYLLABUS",
  EXTERNAL_NOTES: "NOTE",
  TEXTBOOK: "TEXTBOOK",
  EXTERNAL_QUESTIONS: "CARD",
};

/**
 * Build evidence from a vector chunk hit (retrievalScore = cosine similarity).
 * EvidenceItem.fromChunk :84-102 — the kind switch is EXACT ("OTHER" default).
 */
export function evidenceFromChunk(args: {
  documentRowId: string;
  documentId: string;
  documentVersion: number;
  chunkId: string;
  chunkIndex: number;
  kind: string | null | undefined;
  content: string;
  pageStart: number | null;
  pageEnd: number | null;
  elementIds: string[] | null;
  embeddingModel: string | null;
  cosine: number;
  /** 133d additive: spine spec codes riding the chunk (default []) */
  specCodes?: string[] | null;
  /** 133d additive: raw PDF coords + course binding for translated TEXTBOOK items */
  sourcePageStart?: number | null;
  sourcePageEnd?: number | null;
  bookCourseId?: string | null;
}): EvidenceItem {
  const source = kindToSource[args.kind == null ? "OTHER" : args.kind] ?? "OTHER";
  return {
    source,
    content: args.content,
    documentRowId: args.documentRowId,
    documentId: args.documentId,
    documentVersion: args.documentVersion,
    chunkId: args.chunkId,
    chunkIndex: args.chunkIndex,
    nodeId: null,
    nodeCode: null,
    nodeType: null,
    nodeTitle: null,
    pageStart: args.pageStart,
    pageEnd: args.pageEnd,
    specCodes: args.specCodes == null ? [] : [...args.specCodes],
    sourcePageStart: args.sourcePageStart == null ? null : args.sourcePageStart,
    sourcePageEnd: args.sourcePageEnd == null ? null : args.sourcePageEnd,
    bookCourseId: args.bookCourseId == null ? null : args.bookCourseId,
    elementIds: args.elementIds == null ? [] : [...args.elementIds],
    topicIds: [],
    retrievalScore: args.cosine,
    fusedScore: 0.0,
    rerankScore: null,
  };
}

/**
 * Build evidence from a matched KG structure node (retrievalScore = match
 * specificity). EvidenceItem.fromNode :105-112 — the content join is
 * `title` + (description present ? " — " + description : "").
 */
export function evidenceFromNode(args: {
  nodeId: string;
  code: string;
  nodeType: string;
  title: string;
  description: string | null;
  matchScore: number;
}): EvidenceItem {
  // Java isBlank() == null, empty, or whitespace-only
  const descBlank =
    args.description == null || args.description.trim().length === 0;
  const content =
    (args.title == null ? "" : args.title) +
    (descBlank ? "" : ` — ${args.description}`);
  return {
    source: "KNOWLEDGE_NODE",
    content,
    documentRowId: null,
    documentId: null,
    documentVersion: null,
    chunkId: null,
    chunkIndex: null,
    nodeId: args.nodeId,
    nodeCode: args.code,
    nodeType: args.nodeType,
    nodeTitle: args.title,
    pageStart: null,
    pageEnd: null,
    specCodes: [],
    sourcePageStart: null,
    sourcePageEnd: null,
    bookCourseId: null,
    elementIds: [],
    topicIds: [args.nodeId],
    retrievalScore: args.matchScore,
    fusedScore: 0.0,
    rerankScore: null,
  };
}

/** v0 semantics: chunk evidence is associated with the intent-matched topics. */
export function withTopicIds(item: EvidenceItem, topics: string[] | null): EvidenceItem {
  return { ...item, topicIds: topics == null ? [] : [...topics] };
}

/** Fused position (used by the fusion stage; keeps the retrieval score). */
export function withFusedScore(item: EvidenceItem, fused: number): EvidenceItem {
  return { ...item, fusedScore: fused };
}

/** Reranked position (used by the reranker stage). */
export function withRerankScore(item: EvidenceItem, rerank: number): EvidenceItem {
  return { ...item, rerankScore: rerank };
}

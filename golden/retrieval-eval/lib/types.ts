/**
 * Fixture shapes for the retrieval eval harness (Card C) — the RECORDED
 * corpus contract. Everything here is data, not behavior: the vector arm's
 * cosine math, the gates, the fusion and the metrics live in lib/ (and the
 * fusion itself is the REAL serving module — see harness.ts).
 *
 * PROVIDER-FREE LAW: vectors are RECORDED fixtures (the same posture as the
 * serving corpus: chunk_vectors rows carry their generation's embedding —
 * CURRENT_EMBED_REV = 2). The harness embeds NOTHING, calls NOTHING: a
 * query's "embedding" is its recorded fixture vector, and cosine runs
 * locally. CI stays provider-free by construction.
 *
 * LABEL LAW: the eval labels come from the question_topics anchoring —
 * `anchors` mirrors the provisioned table's shape (question_id, node_id,
 * is_primary; uq_question_topic). A retrieved item is CORRECT for a question
 * iff it grounds an anchored node: KNOWLEDGE_NODE items ground their nodeId;
 * chunk items ground their fixture groundTruthTopics. That ground truth is
 * deliberately NOT the serving EvidenceItem.topicIds field — in the frozen
 * v0 serving shape those are QUERY-level (the intent-matched topics attached
 * to every chunk, karag.ts :364) and would make every retrieved chunk a
 * "hit". The fixture carries the honest per-chunk association instead; the
 * harness still populates topicIds query-level for shape fidelity.
 */
export interface FixtureNode {
  nodeId: string;
  /** KG code, e.g. IALCHEM2018-U1-T3 (the stableKey tiebreak input) */
  code: string;
  title: string;
}

export interface FixtureChunk {
  chunkId: string;
  documentId: string;
  documentRowId: string;
  documentVersion: number;
  chunkIndex: number;
  /** documents.kind — mapped through the frozen kindToSource switch */
  kind: string | null;
  content: string;
  pageStart: number | null;
  pageEnd: number | null;
  embeddingModel: string;
  /** the recorded generation this vector was embedded at (2 = serving CURRENT) */
  embedRev: number;
  /** documents.validation_state — the dual-EXISTS gate's subject leg */
  validationState: "VALIDATED" | "UNVALIDATED";
  /** the exam_papers dual-EXISTS leg: a question/mark-scheme doc linked to a
   *  VALIDATED paper is serving-eligible regardless of its own doc state */
  paperLinked: boolean;
  /** the RECORDED chunk embedding (EMBED_REV 2) */
  vector: number[];
  /** THE LABEL SURFACE — the chunk's true topic associations (see header) */
  groundTruthTopics: string[];
}

export interface FixtureAnchor {
  nodeId: string;
  isPrimary: boolean;
}

export interface FixtureQuestion {
  questionId: string;
  text: string;
  /** the question_topics anchoring — the label source */
  anchors: FixtureAnchor[];
  /** the RECORDED query embedding (EMBED_REV 2) */
  queryVector: number[];
  /** the KG arm's recorded output for this question (match specificity) */
  kgMatches: Array<{ nodeId: string; matchScore: number }>;
}

export interface FixtureCorpus {
  schema: "retrieval-eval/v1";
  embedRev: 2;
  notes: string;
  nodes: FixtureNode[];
  chunks: FixtureChunk[];
  questions: FixtureQuestion[];
}

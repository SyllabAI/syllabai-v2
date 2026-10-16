/**
 * The retrieval eval harness (Card C) — the fusion-layer evaluator.
 *
 * WHAT IS REAL HERE (the no-drift law): the fusion IS the serving module —
 * this file imports apps/api/src/services/tutor/rrf.ts (fuse, planWeightOf,
 * PLAN_V2_WEIGHTS) and tutor/evidence.ts (evidenceFromChunk, evidenceFromNode)
 * verbatim. rrf.ts and evidence.ts are PURE (no db, no env, no provider —
 * their import graphs terminate in type shapes), which is exactly what makes
 * a CI provider-free harness over the REAL fusion possible. A copied fusion
 * would drift; an imported one cannot.
 *
 * WHAT IS FIXTURE HERE: the two arms' INPUTS. The serving arms are SQL-bound
 * (KG CTE + the searchServingEligible vector SQL); CI has no database, so
 * the harness replays each arm's OBSERVABLE contract over recorded fixture
 * data — the same recorded-embeddings posture the serving corpus itself uses
 * (chunk vectors are stored rows at CURRENT_EMBED_REV = 2, never recomputed):
 *
 *   vector arm (ContentVectorRetriever + vector-arm.ts parity): cosine of the
 *     RECORDED query vector against RECORDED chunk vectors, the dual-EXISTS
 *     serving-eligibility gate (a VALIDATED paper-linked question/mark-scheme
 *     doc OR a subject-linked VALIDATED doc), the MIN_COSINE 0.50 floor
 *     (karag.ts :106), deterministic order, the TUTOR_VECTOR_CANDIDATES 12
 *     cap (karag.ts :70), then evidenceFromChunk.
 *   KG arm (GraphKnowledgeRetriever parity): recorded per-question match
 *     specificities, the 0.50 specificity floor, deterministic order, the
 *     TUTOR_MAX_TOPICS 5 cap (karag.ts :69), then evidenceFromNode.
 *
 * The eval itself: per question, fuse the two arms TWICE — plan-v2 weights
 * (the serving posture, fuseWithPlanWeights) and uniform weights (the
 * ablation control) — truncate to TUTOR_EVIDENCE_LIMIT 6 (karag.ts :71, the
 * serving budget), and score against the question_topics anchors:
 * recall@budget, MRR, hit@1 (lib/metrics.ts). Zero-anchor questions are
 * UNMEASURABLE (no labels exist) and are reported, never averaged.
 *
 * DETERMINISM: every sort carries a total-order tiebreak; cosine is pure;
 * the fusion's tiebreaks are the frozen ones. Same corpus in, byte-identical
 * report out — the gates pin it.
 */
import { fuse, fuseWithPlanWeights, PLAN_V2_WEIGHTS } from "../../../apps/api/src/services/tutor/rrf.ts";
import { evidenceFromChunk, evidenceFromNode } from "../../../apps/api/src/services/tutor/evidence.ts";
import type { EvidenceItem } from "../../../apps/api/src/services/tutor/evidence.ts";
import {
  cosine,
  aggregate,
  evaluateRanking,
  type AggregateVerdict,
  type GroundedItem,
  type RankingVerdict,
} from "./metrics.ts";
import type { FixtureChunk, FixtureCorpus, FixtureQuestion } from "./types.ts";

// ── serving constants (cited, not re-decided) ────────────────────────────────

/** ContentVectorRetriever.MIN_COSINE :52 (karag.ts :106) — the calibrated floor. */
export const MIN_COSINE = 0.5;
/** GraphKnowledgeRetriever match-specificity floor (the KG-RAG audit of record). */
export const MIN_SPECIFICITY = 0.5;
/** syllabai.tutor.vector-candidates (karag.ts :70). */
export const TUTOR_VECTOR_CANDIDATES = 12;
/** syllabai.tutor.max-topics (karag.ts :69). */
export const TUTOR_MAX_TOPICS = 5;
/** syllabai.tutor.evidence-limit (karag.ts :71) — the serving post-fusion budget. */
export const TUTOR_EVIDENCE_LIMIT = 6;
/** CURRENT_EMBED_REV = 2 (ChunkVectorRepository.java:64; vector-arm.ts :39). */
export const EMBED_REV = 2;

// ── the vector arm over recorded vectors ─────────────────────────────────────

/**
 * The dual-EXISTS serving-eligibility gate (searchServingEligible verbatim
 * shape): a chunk is eligible iff its document rides a VALIDATED paper (the
 * question_paper/mark_scheme document linkage) OR its subject-linked document
 * is VALIDATED. Fixture approximation: paperLinked (paper leg — only
 * meaningful for the paper-carried kinds) or validationState VALIDATED.
 */
function servingEligible(chunk: FixtureChunk): boolean {
  const paperCarried = chunk.kind === "QUESTION_PAPER" || chunk.kind === "MARK_SCHEME";
  if (chunk.paperLinked && paperCarried) return true;
  return chunk.validationState === "VALIDATED";
}

/** The vector arm: gates → cosine → floor → deterministic order → cap → evidence. */
export function vectorArm(corpus: FixtureCorpus, question: FixtureQuestion): EvidenceItem[] {
  const scored = corpus.chunks
    .filter((c) => c.embedRev === EMBED_REV)
    .filter(servingEligible)
    .map((c) => ({ chunk: c, score: cosine(question.queryVector, c.vector) }))
    .filter((s) => s.score >= MIN_COSINE)
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.chunk.chunkIndex - b.chunk.chunkIndex ||
        (a.chunk.chunkId < b.chunk.chunkId ? -1 : 1),
    )
    .slice(0, TUTOR_VECTOR_CANDIDATES);
  const anchorTopicIds = question.anchors.map((a) => a.nodeId);
  return scored.map((s) =>
    evidenceFromChunk({
      documentRowId: s.chunk.documentRowId,
      documentId: s.chunk.documentId,
      documentVersion: s.chunk.documentVersion,
      chunkId: s.chunk.chunkId,
      chunkIndex: s.chunk.chunkIndex,
      kind: s.chunk.kind,
      content: s.chunk.content,
      pageStart: s.chunk.pageStart,
      pageEnd: s.chunk.pageEnd,
      elementIds: [],
      embeddingModel: s.chunk.embeddingModel,
      cosine: s.score,
    }),
  ).map((item) => ({ ...item, topicIds: [...anchorTopicIds] })); // the serving v0 query-level shape (karag.ts :364)
}

/** The KG arm: recorded specificities → floor → deterministic order → cap → evidence. */
export function kgArm(corpus: FixtureCorpus, question: FixtureQuestion): EvidenceItem[] {
  const byId = new Map(corpus.nodes.map((n) => [n.nodeId, n]));
  return question.kgMatches
    .filter((m) => m.matchScore >= MIN_SPECIFICITY)
    .sort(
      (a, b) =>
        b.matchScore - a.matchScore ||
        (byId.get(a.nodeId)!.code < byId.get(b.nodeId)!.code ? -1 : 1),
    )
    .slice(0, TUTOR_MAX_TOPICS)
    .map((m) => {
      const node = byId.get(m.nodeId)!;
      return evidenceFromNode({
        nodeId: node.nodeId,
        code: node.code,
        nodeType: "TOPIC",
        title: node.title,
        description: null,
        matchScore: m.matchScore,
      });
    });
}

// ── the evaluation ───────────────────────────────────────────────────────────

export interface QuestionVerdict {
  questionId: string;
  anchors: string[];
  /** the fused, budget-truncated list reduced to (key, source, fusedScore, grounds) */
  evaluated: Array<{ key: string; source: string; fusedScore: number; grounds: string[] }>;
  recallAtBudget: number;
  mrr: number;
  hit1: number;
  /** true when the fused top-1 KEY differs between the two weightings —
   *  forensics only: benign anchor-led reorders (q2-class) flag alongside the
   *  damaging anchor-loses-the-lead flip (q5-class); the quality signal is
   *  MRR/hit1, never this field alone */
  top1Flipped: boolean;
}

export interface EvalReport {
  schema: "retrieval-eval/report/v1";
  embedRev: 2;
  budget: number;
  weights: { mode: string; values: Record<string, number> };
  plan: AggregateVerdict;
  uniform: AggregateVerdict;
  ablation: {
    deltaRecall: number;
    deltaMrr: number;
    deltaHit1: number;
    flippedQuestions: string[];
  };
  sufficiency: {
    questionsTotal: number;
    questionsEvaluated: number;
    unmeasurable: string[];
    /** anchors absent from every arm candidate (coverage gaps, honestly counted) */
    coverageGaps: number;
  };
  questions: QuestionVerdict[];
}

/** The grounding set of a fused item under the fixture ground truth. */
function groundsOf(item: EvidenceItem, groundTruthByChunk: Map<string, string[]>): string[] {
  if (item.nodeId != null) return [item.nodeId];
  if (item.chunkId != null) return groundTruthByChunk.get(item.chunkId) ?? [];
  return [];
}

/** Evaluate one corpus: arms → fuse ×2 weightings → budget → metrics. */
export function evaluateCorpus(corpus: FixtureCorpus): EvalReport {
  const groundTruthByChunk = new Map(corpus.chunks.map((c) => [c.chunkId, c.groundTruthTopics]));
  const questions: QuestionVerdict[] = [];
  const planVerdicts: RankingVerdict[] = [];
  const uniformVerdicts: RankingVerdict[] = [];
  const unmeasurable: string[] = [];
  let coverageGaps = 0;
  const flipped: string[] = [];

  for (const question of corpus.questions) {
    const anchors = question.anchors.map((a) => a.nodeId);
    if (anchors.length === 0) {
      unmeasurable.push(question.questionId);
      continue; // no labels — reported, never averaged
    }
    const kg = kgArm(corpus, question);
    const vec = vectorArm(corpus, question);

    // coverage: every anchor must be reachable by at least one arm candidate
    const reachable = new Set<string>();
    for (const item of [...kg, ...vec]) {
      for (const g of groundsOf(item, groundTruthByChunk)) reachable.add(g);
    }
    for (const a of anchors) {
      if (!reachable.has(a)) coverageGaps++;
    }

    const toGrounded = (items: EvidenceItem[]): GroundedItem[] =>
      items.map((it) => ({
        key: (it.nodeId ?? it.chunkId)!,
        grounds: groundsOf(it, groundTruthByChunk),
      }));

    const fusedPlan = fuseWithPlanWeights([kg, vec]).slice(0, TUTOR_EVIDENCE_LIMIT);
    const fusedUniform = fuse([kg, vec], { weightOf: () => 1.0 }).slice(0, TUTOR_EVIDENCE_LIMIT);

    const vPlan = evaluateRanking(toGrounded(fusedPlan), anchors, TUTOR_EVIDENCE_LIMIT);
    const vUniform = evaluateRanking(toGrounded(fusedUniform), anchors, TUTOR_EVIDENCE_LIMIT);
    planVerdicts.push(vPlan);
    uniformVerdicts.push(vUniform);

    const top1Plan = toGrounded(fusedPlan)[0]?.key ?? null;
    const top1Uniform = toGrounded(fusedUniform)[0]?.key ?? null;
    if (top1Plan !== top1Uniform) flipped.push(question.questionId);

    questions.push({
      questionId: question.questionId,
      anchors,
      evaluated: fusedPlan.map((it) => ({
        key: (it.nodeId ?? it.chunkId)!,
        source: it.source,
        fusedScore: it.fusedScore,
        grounds: groundsOf(it, groundTruthByChunk),
      })),
      recallAtBudget: vPlan.recall,
      mrr: vPlan.mrr,
      hit1: vPlan.hit1,
      top1Flipped: top1Plan !== top1Uniform,
    });
  }

  const plan = aggregate("plan-v2", planVerdicts);
  const uniform = aggregate("uniform", uniformVerdicts);
  return {
    schema: "retrieval-eval/report/v1",
    embedRev: EMBED_REV as 2,
    budget: TUTOR_EVIDENCE_LIMIT,
    weights: {
      mode: "PLAN_V2_WEIGHTS vs uniform(1.0)",
      values: Object.fromEntries(Object.entries(PLAN_V2_WEIGHTS)),
    },
    plan,
    uniform,
    ablation: {
      deltaRecall: plan.meanRecallAtBudget - uniform.meanRecallAtBudget,
      deltaMrr: plan.meanMrr - uniform.meanMrr,
      deltaHit1: plan.meanHit1 - uniform.meanHit1,
      flippedQuestions: flipped,
    },
    sufficiency: {
      questionsTotal: corpus.questions.length,
      questionsEvaluated: plan.questionsEvaluated,
      unmeasurable,
      coverageGaps,
    },
    questions,
  };
}

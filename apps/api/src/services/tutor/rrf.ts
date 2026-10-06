/**
 * ReciprocalRankFusion port (T-MIG-060 tranche 1) — frozen source @ 6cad6ef:
 * src/main/java/com/syllabai/tutor/ReciprocalRankFusion.java :22-138,
 * line-against-line.
 *
 * Deterministic candidate fusion (Master Spec §13 "Evidence fusion", T-024):
 * reciprocal rank fusion over the KG and vector candidate rankings. RRF is
 * deliberately score-free — cosine similarities and KG match scores live on
 * different scales, so fusing raw numbers would silently privilege one
 * source; ranks are the only honest common currency. Ties break
 * deterministically (score, then source ORDINAL, then stable id) so
 * identical inputs always fuse identically (§19 reproducibility).
 */
import {
  EVIDENCE_SOURCE_ORDINAL,
  withFusedScore,
  type EvidenceItem,
  type EvidenceSource,
} from "./evidence";

/** RRF smoothing constant (standard 60); larger k flattens rank differences. */
export const DEFAULT_RRF_K = 60;

/**
 * Plan §7 per-kind RRF weights — the canonical home (RetrievalFabric aliases
 * this map). The v2 routing stance: knowledge-layer evidence leads, question
 * evidence is verbatim context, mark schemes surface only when policy allows
 * (ClaLeakagePolicy governs the answer surface), cards are identity pointers.
 * Sources absent from this map (KNOWLEDGE_NODE, LEARNER_WORK, OTHER) weigh
 * 1.0 — KG topic anchors keep their full pre-weights rank influence.
 * ReciprocalRankFusion.PLAN_V2_WEIGHTS :51-57.
 */
export const PLAN_V2_WEIGHTS: Readonly<Record<EvidenceSource, number>> = {
  MARK_SCHEME: 0.6,
  QUESTION_PAPER: 0.8,
  SYLLABUS: 0.9,
  OTHER: 1.0, // absent from the Java map → getOrDefault 1.0
  KNOWLEDGE_NODE: 1.0, // absent from the Java map → 1.0 (anchors keep 1.0)
  LEARNER_WORK: 1.0, // absent from the Java map → 1.0
  NOTE: 1.0,
  TEXTBOOK: 0.7,
  CARD: 0.3,
};

/** Per-candidate weight over PLAN_V2_WEIGHTS; absent sources weigh 1.0 (:72-74). */
export function planWeightOf(item: EvidenceItem): number {
  return PLAN_V2_WEIGHTS[item.source] ?? 1.0;
}

export interface FuseOptions {
  /** RRF smoothing constant (the Spring `syllabai.tutor.rrf-k` binding). */
  k?: number;
  /** per-candidate weight (non-negative; 0 removes influence, never the candidate) */
  weightOf?: (item: EvidenceItem) => number;
}

/**
 * Weighted RRF (plan §7 per-kind weights): each rank contribution is scaled
 * by the weight of the candidate's EvidenceSource — NOTE ≈ 1.0,
 * SYLLABUS ≈ 0.9, QUESTION_PAPER ≈ 0.8, TEXTBOOK ≈ 0.7, MARK_SCHEME ≈ 0.6,
 * CARDS ≈ 0.3. Rank order inside a list is untouched; only the list's
 * influence on the fused score is scaled. ReciprocalRankFusion.fuse :102-130.
 *
 *   contribution = weightOf(candidate) / (k + rank + 1)   // rank is 0-based
 *   keyed by nodeId for KG nodes, chunkId for chunks (no grounding → skipped)
 *   fused sort: fusedScore DESC, then source ordinal ASC, then stableKey ASC
 */
export function fuse(
  rankedLists: ReadonlyArray<ReadonlyArray<EvidenceItem>>,
  opts: FuseOptions = {},
): EvidenceItem[] {
  const k = opts.k ?? DEFAULT_RRF_K;
  if (k <= 0) throw new Error("rrf-k must be positive");
  const weightOf = opts.weightOf ?? planWeightOf;

  const order: string[] = []; // insertion order of first sight (LinkedHashMap)
  const seen = new Set<string>();
  const byKey = new Map<string, EvidenceItem>();
  const scores = new Map<string, number>();

  for (const ranking of rankedLists) {
    for (let rank = 0; rank < ranking.length; rank++) {
      const candidate = ranking[rank];
      if (candidate == null) continue;
      const key = candidate.nodeId ?? candidate.chunkId;
      if (key == null) continue; // evidence without grounding cannot be fused
      if (!seen.has(key)) {
        seen.add(key);
        order.push(key);
      }
      const contribution = weightOf(candidate) / (k + rank + 1);
      scores.set(key, (scores.get(key) ?? 0) + contribution);
      byKey.set(key, candidate);
    }
  }

  const fused: EvidenceItem[] = [];
  for (const key of order) {
    const item = byKey.get(key);
    const score = scores.get(key);
    if (item == null || score == null) continue;
    fused.push(withFusedScore(item, score));
  }
  fused.sort(
    (a, b) =>
      b.fusedScore - a.fusedScore ||
      EVIDENCE_SOURCE_ORDINAL[a.source] - EVIDENCE_SOURCE_ORDINAL[b.source] ||
      compareStrings(stableKey(a), stableKey(b)),
  );
  return fused;
}

/** The serving fusion posture (plan §7): weighted fuse with the canonical
 *  plan weights — exactly `fuse(rankedLists, planWeights())`. :84-86 */
export function fuseWithPlanWeights(
  rankedLists: ReadonlyArray<ReadonlyArray<EvidenceItem>>,
  opts: FuseOptions = {},
): EvidenceItem[] {
  return fuse(rankedLists, { ...opts, weightOf: planWeightOf });
}

/** ReciprocalRankFusion.stableKey :132-137 — nodeCode, else docId#chunkIndex,
 *  else String.valueOf(chunkId). */
function stableKey(item: EvidenceItem): string {
  if (item.nodeCode != null) return item.nodeCode;
  if (item.documentId != null) return `${item.documentId}#${item.chunkIndex}`;
  return String(item.chunkId);
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

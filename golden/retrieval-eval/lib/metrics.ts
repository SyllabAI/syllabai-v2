/**
 * Pure ranking metrics for the retrieval eval harness (Card C) — the layer
 * the selftest pins with hand-computed values (the GOLDEN_MASTER §5
 * anti-tautology device: a parity gate with a broken comparator is worse
 * than no gate).
 *
 * LABEL LAW (lib/types.ts header): a question's anchors are its
 * question_topics node ids; a candidate grounds an anchor iff the anchor is
 * in the candidate's grounding set (nodeId for KG evidence, the fixture
 * ground-truth topics for chunks).
 *
 *   recall@budget = |{a ∈ anchors : some item in the top-budget list grounds a}| / |anchors|
 *   mrr           = 1 / (1-based rank of the FIRST item grounding ANY anchor), 0 if none
 *   hit@1         = 1 iff the top-1 item grounds any anchor
 *
 * A question with ZERO anchors has no labels — it is unmeasurable and must
 * be excluded upstream (the harness reports it, never averages it).
 */

/** The measured unit: a fused candidate reduced to its grounding set. */
export interface GroundedItem {
  /** the fuse key (nodeId for KG evidence, chunkId for chunks) */
  key: string;
  /** every anchor this item could honestly ground */
  grounds: string[];
}

export interface RankingVerdict {
  /** fraction of anchors grounded by at least one top-budget item */
  recall: number;
  /** mean-reciprocal-rank of the first anchor-grounding item */
  mrr: number;
  /** 1 iff the top-1 item grounds any anchor */
  hit1: number;
  /** the anchors actually grounded within the budget (for forensics) */
  groundedAnchors: string[];
}

export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / Math.sqrt(na * nb);
}

/** One ranking's verdict against one anchor set, at the given budget. */
export function evaluateRanking(
  items: GroundedItem[],
  anchors: string[],
  budget: number,
): RankingVerdict {
  if (anchors.length === 0) {
    // no labels — the caller must not average this; 0/0 renders as 0 here
    // and the harness routes zero-anchor questions to `unmeasurable`.
    return { recall: 0, mrr: 0, hit1: 0, groundedAnchors: [] };
  }
  const top = items.slice(0, Math.max(0, budget));
  const grounded = new Set<string>();
  let mrr = 0;
  for (let rank = 0; rank < top.length; rank++) {
    const item = top[rank]!;
    if (item.grounds.some((g) => anchors.includes(g))) {
      if (grounded.size === 0) mrr = 1 / (rank + 1);
      for (const g of item.grounds) {
        if (anchors.includes(g)) grounded.add(g);
      }
    }
  }
  return {
    recall: grounded.size / anchors.length,
    mrr,
    hit1: top.length > 0 && top[0]!.grounds.some((g) => anchors.includes(g)) ? 1 : 0,
    groundedAnchors: [...grounded],
  };
}

/** The per-weighting aggregate over measurable questions only. */
export interface AggregateVerdict {
  weightMode: "plan-v2" | "uniform";
  questionsEvaluated: number;
  meanRecallAtBudget: number;
  meanMrr: number;
  meanHit1: number;
}

export function aggregate(
  weightMode: "plan-v2" | "uniform",
  verdicts: RankingVerdict[],
): AggregateVerdict {
  const n = verdicts.length;
  if (n === 0) {
    return { weightMode, questionsEvaluated: 0, meanRecallAtBudget: 0, meanMrr: 0, meanHit1: 0 };
  }
  const sum = verdicts.reduce(
    (acc, v) => ({ recall: acc.recall + v.recall, mrr: acc.mrr + v.mrr, hit1: acc.hit1 + v.hit1 }),
    { recall: 0, mrr: 0, hit1: 0 },
  );
  return {
    weightMode,
    questionsEvaluated: n,
    meanRecallAtBudget: sum.recall / n,
    meanMrr: sum.mrr / n,
    meanHit1: sum.hit1 / n,
  };
}

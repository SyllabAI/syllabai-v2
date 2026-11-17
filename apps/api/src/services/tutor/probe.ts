/**
 * T-TUTOR-AIM-P2 (DC10 §7.6): the single optional post-answer probe.
 *
 * Deterministic selection over the reads `assembleContext` already holds —
 * NO new learner read (the M3 law stands), no LLM, no schema change. The
 * offer rides the ask result AFTER the full answer and claims NOTHING
 * (§13.2 offer-not-claim): the wire carries metadata only — the gap node's
 * id and its corpus title (KG data, the same class as the citation/topic
 * titles already on the wire) — never learner-derived free text, and
 * nothing is consumed until the learner's explicit tap. Ignoring it does
 * nothing. At most ONE probe per ask — the ceiling the plan names; sessions
 * accumulate the bracketing behaviour naturally.
 *
 * THE GAP LAW (deterministic, test-pinned): a DIRECT (depth-1) prerequisite
 * node of the answered topics carries an active gap signal when
 *   (a) its skill state shows practice with weak mastery
 *       (attempts >= 1 AND mastery < PROBE_WEAK_MASTERY), or
 *   (b) an active misconception reading (effective >= the assembler's
 *       active threshold) attaches to it — live when the KG retrieval
 *       surfaced misconception signals for that node (a node can be both a
 *       matched topic and another topic's direct prerequisite).
 * The weakest proven signal wins: misconception-gap first (a named wrong
 * model is the stronger signal), then lowest mastery (unpractised last),
 * then node id asc — a deterministic total order, two asks over the same
 * state offer the same probe.
 *
 * The §10 retirement test is a one-line call-site change: the offer is
 * additive on the wire, optional on the view, and nothing upstream waits
 * for it.
 */

import type {
  KnowledgeContext,
  MisconceptionReading,
  SkillState,
} from "./context";

/** P2 selection constant (test-pinned, disclosed in the run record): the
 *  mastery floor under which a practised prerequisite counts as weak. */
export const PROBE_WEAK_MASTERY = 0.5;

/** the assembler's active-misconception gate reuses context.ts's constant —
 *  re-declared here as the per-module seam (the ADR-032 copy doctrine) */
const ACTIVE_MISCONCEPTION_THRESHOLD = 0.5;

export interface ProbeOffer {
  /** the gap node's id (corpus metadata — §13.2: never learner free text) */
  nodeId: string;
  /** the gap node's corpus title (KG data, already learner-visible on the
   *  wire's topics[] class) */
  title: string;
}

interface GapCandidate {
  offer: ProbeOffer;
  misconceptionGap: boolean;
  mastery: number | null;
}

/**
 * Select the one probe offer for this ask, or null when no direct
 * prerequisite carries an active gap signal (the honest empty — most asks
 * have nothing to offer and the wire is unchanged).
 */
export function selectProbe(
  knowledge: KnowledgeContext,
  states: ReadonlyArray<SkillState>,
  readings: ReadonlyArray<MisconceptionReading>,
): ProbeOffer | null {
  // (b) — the misconception readings that are ACTIVE, as a set of node ids
  const activeMisconceptionIds = new Set(
    readings.filter((r) => r.effective >= ACTIVE_MISCONCEPTION_THRESHOLD).map((r) => r.misconceptionNodeId),
  );
  const masteryByNode = new Map<string, number>();
  for (const s of states) {
    if (!masteryByNode.has(s.nodeId)) masteryByNode.set(s.nodeId, s.mastery);
  }
  const attemptsByNode = new Map<string, number>();
  for (const s of states) {
    if (!attemptsByNode.has(s.nodeId)) attemptsByNode.set(s.nodeId, s.attempts);
  }

  const candidates: GapCandidate[] = [];
  for (const p of knowledge.prerequisites) {
    if (p.depth !== 1) continue; // DIRECT prerequisites only ("adjacent")
    const misconceptionGap = knowledge.misconceptions.some(
      (m) => m.forTopicId === p.nodeId && activeMisconceptionIds.has(m.nodeId),
    );
    const mastery = masteryByNode.get(p.nodeId) ?? null;
    const attempts = attemptsByNode.get(p.nodeId) ?? 0;
    const weakSkill = mastery != null && mastery < PROBE_WEAK_MASTERY && attempts >= 1;
    if (!misconceptionGap && !weakSkill) continue;
    candidates.push({
      offer: { nodeId: p.nodeId, title: p.title },
      misconceptionGap,
      mastery,
    });
  }
  if (candidates.length === 0) return null;

  // the deterministic total order (see header): misconception-gap first,
  // then lowest mastery (null/never-practised LAST), then node id asc
  candidates.sort((a, b) => {
    if (a.misconceptionGap !== b.misconceptionGap) return a.misconceptionGap ? -1 : 1;
    const ma = a.mastery ?? Number.POSITIVE_INFINITY;
    const mb = b.mastery ?? Number.POSITIVE_INFINITY;
    if (ma !== mb) return ma - mb;
    return a.offer.nodeId < b.offer.nodeId ? -1 : a.offer.nodeId > b.offer.nodeId ? 1 : 0;
  });
  return candidates[0]!.offer;
}

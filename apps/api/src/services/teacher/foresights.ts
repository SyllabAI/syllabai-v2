/**
 * T-FORESIGHT-V0-PLAN-1 Stage A — the deterministic pre-assignment readiness
 * read model (foresights/v1), scoped by docs/FORESIGHTS-V0-PLAN.md and
 * governed by ADR-CLASS-0002 (the comprehension-first law for prediction
 * surfaces — this service is the law's first applicant).
 *
 * THE ONE-SENTENCE DERIVATION (ADR-CLASS-0002 C5 — the plan's §0): Foresights
 * answers "who is likely to struggle, who looks ready, and what cannot be
 * honestly predicted yet" for one class and one not-yet-practiced topic,
 * derived read-only from THIS class's own skill_states + misconception_states
 * on the topic's prerequisite chain, banded by the same learner-engine numbers
 * the learners themselves see.
 *
 * THE BINDING LAWS (plan §2–§5 — each pinned by foresights.test.ts):
 *
 *   COMPREHENSION-FIRST (ADR-CLASS-0002): the view LEADS with the C1 headline
 *     template sentence (frozen strings below — reviewable code, never
 *     generated prose) and carries the C3 disclosure string assembled
 *     server-side ("a readiness prior — not a measurement") so every client
 *     renders prior-vs-evidence honestly. Band-level encodings reuse the
 *     §13.3 shared vocabulary; there is NO numeric prediction anywhere
 *     (plan §2.1/§2.2) — the classification IS the prediction.
 *   HONEST CANNOT-PREDICT (C4): NOT_ASSESSABLE is a first-class state with
 *     its own headline and, where the missing evidence is class-wide, an
 *     unlockPath — the first unmeasured direct prerequisite in code order,
 *     i.e. the single assignment that would restore assessability. The CK-12
 *     fine-print cold-start gate made first-class.
 *   TWO-LEVEL HONESTY (§5): the class can be ASSESSABLE while an individual
 *     learner is NOT_ASSESSABLE — each level states only what its own
 *     evidence supports. A learner with no skill_states row on a direct
 *     prerequisite is UNMEASURED_PREREQ, never a fabricated band.
 *   READ-ONLY BY CONSTRUCTION: 2 evidence queries (skill_states with
 *     last_practiced_at, misconception_states) — the SAME tables the learner
 *     model writes; this service never writes, and tutor engagement /
 *     review schedules / attempts windows are DELIBERATELY absent (the
 *     never-conflate-engagement-with-mastery law; plan §2.3). No numeric
 *     projection, no cohort pooling, no LLM in the derivation (§2.4/§2.6).
 *   SHARED THRESHOLDS ONLY (C6): bandOf + decayedMastery + relaxedToPrior +
 *     LEARNER_ENGINE_PAPER_DEFAULTS from services/learner(-model) — the SAME
 *     numbers the learner surfaces use; weak flags inherit the frozen CONFIG
 *     law (weakMasteryCeiling 0.45 = the decay LOW ceiling,
 *     minAttemptsForWeakness 2) exactly as T-MIG-053's engineOf pins it.
 *     Zero new tuned constants exist in this file.
 *   CLASS-SCOPED ROSTER (the independent-student rule, F-072 law): the
 *     aggregation roster is EXACTLY this class's enabled member rows via the
 *     EXPORTED-verbatim graphOwnedClass/memberStudentIds/enabledRoster —
 *     a non-member never moves a single number; the gate order is the F-072
 *     gate order verbatim (404 class not found → 403 this class belongs to
 *     another teacher → root 404-first via the tree read → target 404 +
 *     subject isolation). NO archived-class gate on reads (409 is a write
 *     gate — a teacher may inspect a past class's foresights).
 *   DIRECT-SET CLASSIFICATION (§5): only DIRECT (depth-1, post-T-C11-
 *     projection) prerequisites classify; the depth ≥ 2 chain rides along as
 *     contextChain rows with ZERO classification influence (no weighting —
 *     a weighted propagation would introduce tuned parameters, banned by C6;
 *     plan §2.7). A CONCEPT-typed depth-1 prerequisite projects onto its
 *     validated anchor SpecificationPoints (conceptAnchorsWithin), carrying
 *     derived=true + derivedViaConceptCodes; self-projections collapse; a
 *     concept with no anchors passes through as itself (the weakPrerequisites
 *     passthrough law).
 *   EFFECTIVE, NOT RAW (the disclosed F-072 divergence): cells band
 *     EFFECTIVE mastery — decayedMastery at the single asOf anchor — because
 *     a prediction must see the class as the learners see themselves NOW
 *     (plan §4); T-MIG-053 t2's raw-mastery cell law governs THAT surface,
 *     not this one. ONE clock anchor feeds decay, relaxation and the wire
 *     asOf (ADR-031 posture).
 *   BATCHED BY CONSTRUCTION (§11 posture inherited): ONE skill_states query
 *     and ONE misconception_states query over roster × (target ∪ chain ∪
 *     anchors), everything else grouped in memory; empty IN lists issue NO
 *     query (the frozen empty-list semantics). Read-on-demand: no cron, no
 *     materialized views, no write path (Neon $0-tier posture, plan §10).
 *   DETERMINISM: cells sort code-asc; contextChain keeps the CTE's frozen
 *     order (depth desc, node_id); learners sort AT_RISK (reason lexical →
 *     meanEffective asc (null→1.0) → displayName case-folded) → READY
 *     (displayName) → NOT_ASSESSABLE (displayName) — the T-MIG-053
 *     attention-queue pattern; same inputs → byte-identical view.
 */
import type {
  ClassForesightsView,
  ForesightsClassReason,
  ForesightsContextChainRow,
  ForesightsLearnerReason,
  ForesightsLearnerRow,
  ForesightsLearnerState,
  ForesightsPrerequisiteCellView,
  ForesightsState,
} from "@syllabai/contracts";
import {
  KnowledgeNotFoundError,
  knowledgeTree,
  type KnowledgeDeps,
  type NodeView,
} from "../knowledge";
import {
  LEARNER_ENGINE_PAPER_DEFAULTS,
  bandOf,
  decayedMastery,
  relaxedToPrior,
  type LearnerBdtParams,
  type LearnerDecayParams,
} from "../learner";
import { enabledRoster, graphOwnedClass, memberStudentIds } from "../knowledge/graphs";
import { conceptAnchorsWithin, prerequisiteChain, type KgEdgeRow } from "./kg";

// ── constants (the plan §3/§6 wire) ──────────────────────────────────────────

/** read-model marker — the deterministic aggregation contract. */
export const FORESIGHTS_POLICY = "foresights/v1";

const round4 = (v: number): number => Math.round(v * 10000.0) / 10000.0;
const mapDate = (v: unknown): Date => (v instanceof Date ? v : new Date(v as string));

// ── engine params (the SAME learner-facing tuning — C6, no foresights variant) ─

export type ForesightsEngineParams = {
  decay: LearnerDecayParams;
  bdt: LearnerBdtParams;
  /** RecommendationProperties.weakMasteryCeiling (the frozen CONFIG 0.45) */
  weakMasteryCeiling: number;
  /** RecommendationProperties.minAttemptsForWeakness (the frozen CONFIG 2) */
  minAttemptsForWeakness: number;
};

export type ForesightsDeps = KnowledgeDeps & { engine?: ForesightsEngineParams };

const engineOf = (deps: ForesightsDeps): ForesightsEngineParams & { now: Date } => {
  const now = deps.clock.now();
  return {
    decay: deps.engine?.decay ?? LEARNER_ENGINE_PAPER_DEFAULTS.decay,
    bdt: deps.engine?.bdt ?? LEARNER_ENGINE_PAPER_DEFAULTS.bdt,
    weakMasteryCeiling: deps.engine?.weakMasteryCeiling ?? 0.45,
    minAttemptsForWeakness: deps.engine?.minAttemptsForWeakness ?? 2,
    now,
  };
};

// ── scope (the T-MIG-053 collect pattern — the third private walk, disclosed:
//    graphs.collectClassStructure and analytics.collect are the two prior
//    walks; this one additionally needs misconceptionsOf for misco scoping
//    under DIRECT cells, which the t2 collect already builds) ─────────────────

type Scope = {
  structureById: Map<string, NodeView>;
  misconceptionsOf: Map<string, NodeView[]>;
};

function collect(node: NodeView, parent: NodeView | null, scope: Scope): void {
  if (node.type === "MISCONCEPTION") {
    if (parent != null) {
      const list = scope.misconceptionsOf.get(parent.id) ?? [];
      list.push(node);
      scope.misconceptionsOf.set(parent.id, list);
    }
    return;
  }
  scope.structureById.set(node.id, node);
  for (const child of node.children ?? []) collect(child, node, scope);
}

function scopeOf(tree: NodeView): Scope {
  const scope: Scope = { structureById: new Map(), misconceptionsOf: new Map() };
  collect(tree, null, scope);
  return scope;
}

// ── the skill-state row + in-memory rollups ──────────────────────────────────

type SkillRow = {
  learner_id: string;
  node_id: string;
  mastery: number;
  attempts: number;
  correct_count: number;
  last_practiced_at: string | Date;
};

type MisconceptionRow = {
  learner_id: string;
  misconception_node_id: string;
  probability: number;
  evidence_count: number;
  last_evidence_at: string | Date;
};

/** per-learner evidence on one node, EFFECTIVE at the anchor. */
type LearnerCell = { learnerId: string; effective: number; attempts: number };

// ── the C1 headline templates (ADR-CLASS-0002: frozen reviewable strings) ────

function headlineFor(
  classState: ForesightsState,
  classReason: ForesightsClassReason | null,
  targetTitle: string,
  weakCodes: string[],
  totalDirect: number,
  unmeasuredCodes: string[],
  unlockCode: string | null,
): string {
  if (classState === "ASSESSABLE_READY") {
    return (
      `This class looks ready for ${targetTitle}: every prerequisite it has ` +
      `practiced sits at DEVELOPING or above.`
    );
  }
  if (classState === "ASSESSABLE_AT_RISK") {
    const codes = weakCodes.join(", ");
    return (
      `Expect ${targetTitle} to land hard: ${weakCodes.length} of ${totalDirect} ` +
      `prerequisites sit below the class's ready line (${codes}).`
    );
  }
  // NOT_ASSESSABLE — the honest cannot-predict sentence (C4)
  if (classReason === "NO_PREREQUISITE_CHAIN") {
    return (
      `The concept graph records no prerequisites for ${targetTitle}, so ` +
      `there is nothing to project from.`
    );
  }
  const codes = unmeasuredCodes.join(", ");
  const verb = unmeasuredCodes.length === 1 ? "has" : "have";
  return (
    `This cannot be honestly predicted yet: ${codes} ${verb} no class ` +
    `evidence. Assign ${unlockCode ?? "the unmeasured prerequisite"} practice ` +
    `to unlock a prediction.`
  );
}

/** the C3 disclosure string — wire-level provenance (every client renders it). */
function disclosureFor(targetTitle: string, asOf: string): string {
  return (
    `Derived read-only from this class's own practice evidence on ` +
    `${targetTitle}'s prerequisite topics at ${asOf}; banded by the same ` +
    `thresholds learners see. A readiness prior — not a measurement of ` +
    `${targetTitle}.`
  );
}

// ── the endpoint (Stage A: service only — the route mount is Stage B) ────────

export async function classForesights(
  deps: ForesightsDeps,
  teacherId: string,
  classId: string,
  rootId: string,
  nodeId: string,
): Promise<ClassForesightsView> {
  const engine = engineOf(deps);
  const asOf = engine.now.toISOString();

  // gate 1 — class exists + owned by this teacher (F-072 gate order verbatim)
  await graphOwnedClass(deps, teacherId, classId);

  // gate 2 — the root 404-first tree read, WITH the misconception fold
  const tree = await knowledgeTree(deps, rootId, true);
  const scope = scopeOf(tree);

  // gate 3 — target 404 + subject isolation (never a silent cross-subject hop)
  const target = scope.structureById.get(nodeId);
  if (target == null) {
    throw new KnowledgeNotFoundError(
      "curriculum topic in this subject not found: " + nodeId,
    );
  }

  // the roster: exactly this class's enabled members (independent-student rule)
  const memberIds = await memberStudentIds(deps, classId);
  const { roster, names } = await enabledRoster(deps, memberIds);

  // the depth-tagged prerequisite chain (CTE depth ≤ 10, deepest-first)
  const chain = await prerequisiteChain(deps, nodeId);

  // concept → anchor SPs (validated V15 PART_OF sourced at CONCEPT)
  const anchorsByConcept = new Map<string, KgEdgeRow[]>();
  for (const anchor of await conceptAnchorsWithin(deps, rootId)) {
    const list = anchorsByConcept.get(anchor.source_node_id) ?? [];
    list.push(anchor);
    anchorsByConcept.set(anchor.source_node_id, list);
  }

  // the DIRECT set (§5): depth-1 chain rows; a CONCEPT-typed prereq projects
  // onto its anchor SPs (derived=true + concept codes); self-projections
  // collapse; a concept with no anchors passes through as itself.
  type Direct = { nodeId: string; derived: boolean; via: Set<string> };
  const directMap = new Map<string, Direct>();
  const upsertDirect = (id: string, derived: boolean, via: string | null) => {
    const cur = directMap.get(id);
    if (cur == null) {
      directMap.set(id, { nodeId: id, derived, via: new Set(via == null ? [] : [via]) });
      return;
    }
    cur.derived = cur.derived || derived;
    if (via != null) cur.via.add(via);
  };
  for (const p of chain) {
    if (p.depth !== 1) continue;
    const anchors = anchorsByConcept.get(p.id);
    if (anchors == null || anchors.length === 0) {
      upsertDirect(p.id, false, null);
      continue;
    }
    const conceptCode = anchors[0]!.source_code;
    for (const anchor of anchors) {
      if (anchor.target_node_id === nodeId) continue; // self-projection collapse
      upsertDirect(anchor.target_node_id, true, conceptCode);
    }
  }

  // ── Query A — ONE skill_states read over roster × (target ∪ chain ∪ anchors)
  const nodeSet = new Set<string>([nodeId]);
  for (const p of chain) nodeSet.add(p.id);
  for (const id of directMap.keys()) nodeSet.add(id);
  const nodeIds = [...nodeSet];
  const skills: SkillRow[] =
    roster.length > 0 && nodeIds.length > 0
      ? ((await deps.sql`
      select learner_id, node_id, mastery, attempts, correct_count, last_practiced_at
      from skill_states
      where learner_id = any(${roster}::uuid[]) and node_id = any(${nodeIds}::uuid[])`) as SkillRow[])
      : [];

  const cellsByLearnerByNode = new Map<string, Map<string, LearnerCell>>();
  for (const s of skills) {
    const byNode = cellsByLearnerByNode.get(s.learner_id) ?? new Map<string, LearnerCell>();
    byNode.set(s.node_id, {
      learnerId: s.learner_id,
      effective: decayedMastery(Number(s.mastery), mapDate(s.last_practiced_at), engine.now, engine.decay),
      attempts: Number(s.attempts),
    });
    cellsByLearnerByNode.set(s.learner_id, byNode);
  }
  const byNodeCells = new Map<string, LearnerCell[]>();
  for (const byNode of cellsByLearnerByNode.values()) {
    for (const [nodeIdKey, cell] of byNode) {
      const list = byNodeCells.get(nodeIdKey) ?? [];
      list.push(cell);
      byNodeCells.set(nodeIdKey, list);
    }
  }

  // ── Query B — ONE misconception_states read over roster × misco-under-direct
  const miscoIds = new Set<string>();
  for (const d of directMap.keys()) {
    for (const m of scope.misconceptionsOf.get(d) ?? []) miscoIds.add(m.id);
  }
  const miscoIdList = [...miscoIds];
  const misconceptions: MisconceptionRow[] =
    roster.length > 0 && miscoIdList.length > 0
      ? ((await deps.sql`
      select learner_id, misconception_node_id, probability, evidence_count, last_evidence_at
      from misconception_states
      where learner_id = any(${roster}::uuid[]) and misconception_node_id = any(${miscoIdList}::uuid[])`) as MisconceptionRow[])
      : [];

  // active misco learners per DIRECT node (BDT relaxed at the anchor)
  const miscoNodeById = new Map<string, NodeView>();
  for (const d of directMap.keys()) {
    for (const m of scope.misconceptionsOf.get(d) ?? []) miscoNodeById.set(m.id, m);
  }
  const activeMiscoLearnersByNode = new Map<string, Set<string>>();
  const activeMiscoNodesByLearner = new Map<string, Set<string>>();
  for (const m of misconceptions) {
    const relaxed = relaxedToPrior(
      Number(m.probability),
      engine.bdt.prior,
      mapDate(m.last_evidence_at),
      engine.now,
      engine.bdt.stalenessTauDays,
    );
    if (relaxed < engine.bdt.activeThreshold) continue;
    // the misconception node's PARENT is the direct cell it signals on
    for (const [parentNode, list] of scope.misconceptionsOf) {
      if (!list.some((n) => n.id === m.misconception_node_id)) continue;
      const learners = activeMiscoLearnersByNode.get(parentNode) ?? new Set<string>();
      learners.add(m.learner_id);
      activeMiscoLearnersByNode.set(parentNode, learners);
      const nodes = activeMiscoNodesByLearner.get(m.learner_id) ?? new Set<string>();
      nodes.add(parentNode);
      activeMiscoNodesByLearner.set(m.learner_id, nodes);
    }
  }

  // ── the DIRECT cells (code-asc deterministic) — structure-missing chain
  // nodes are graph inconsistencies: skipped, never guessed (the T-MIG-053
  // weakPrerequisites law verbatim) ─────────────────────────────────────────
  const directNodes = [...directMap.values()]
    .map((d) => ({ d, node: scope.structureById.get(d.nodeId) }))
    .filter((x): x is { d: Direct; node: NodeView } => x.node != null);
  directNodes.sort((a, b) => a.node.code.localeCompare(b.node.code));

  const prerequisites: ForesightsPrerequisiteCellView[] = directNodes.map(
    ({ d, node }): ForesightsPrerequisiteCellView => {
      const cells = byNodeCells.get(node.id) ?? [];
      const measured = cells.length;
      const mean =
        measured === 0 ? null : round4(cells.reduce((a, c) => a + c.effective, 0) / measured);
      return {
        nodeId: node.id,
        code: node.code,
        title: node.title,
        depth: 1,
        derived: d.derived,
        derivedViaConceptCodes: [...d.via].sort(),
        learnersMeasured: measured,
        meanEffectiveMastery: mean,
        masteryBand: mean == null ? "UNMEASURED" : bandOf(mean, engine.decay),
        weak: mean != null && mean < engine.weakMasteryCeiling,
        learnersWithActiveMisconception: activeMiscoLearnersByNode.get(node.id)?.size ?? 0,
      };
    },
  );

  // ── the context chain (depth ≥ 2, RAW rows, zero classification influence) ──
  const contextChain: ForesightsContextChainRow[] = chain
    .filter((p) => p.depth >= 2)
    .map((p): ForesightsContextChainRow => {
      const cells = byNodeCells.get(p.id) ?? [];
      const measured = cells.length;
      const mean =
        measured === 0 ? null : round4(cells.reduce((a, c) => a + c.effective, 0) / measured);
      return {
        nodeId: p.id,
        code: p.code,
        title: p.title,
        depth: p.depth,
        learnersMeasured: measured,
        meanEffectiveMastery: mean,
        masteryBand: mean == null ? "UNMEASURED" : bandOf(mean, engine.decay),
      };
    });

  // ── the class-level decision table (§5, first match wins) ──────────────────
  const targetMeasured = (byNodeCells.get(nodeId) ?? []).length > 0;
  let classState: ForesightsState;
  let classReason: ForesightsClassReason | null;
  let unlockPath: ClassForesightsView["unlockPath"] = null;
  if (prerequisites.length === 0) {
    classState = "NOT_ASSESSABLE";
    classReason = "NO_PREREQUISITE_CHAIN";
  } else {
    const unmeasured = prerequisites.filter((c) => c.learnersMeasured === 0);
    if (unmeasured.length > 0) {
      classState = "NOT_ASSESSABLE";
      classReason = "UNMEASURED_PREREQUISITES";
      const unlockNode = scope.structureById.get(unmeasured[0]!.nodeId)!;
      unlockPath = { nodeId: unlockNode.id, code: unlockNode.code, title: unlockNode.title };
    } else if (prerequisites.some((c) => c.weak)) {
      classState = "ASSESSABLE_AT_RISK";
      classReason = "WEAK_PREREQUISITES";
    } else {
      classState = "ASSESSABLE_READY";
      classReason = null;
    }
  }
  const weakCodes = prerequisites.filter((c) => c.weak).map((c) => c.code);
  const unmeasuredCodes = prerequisites
    .filter((c) => c.learnersMeasured === 0)
    .map((c) => c.code);

  // ── the per-learner decision table (§5, first match wins) ──────────────────
  const learnerRows: ForesightsLearnerRow[] = roster.map((id) => {
    const displayName = names.get(id) ?? "unknown";
    const byNode = cellsByLearnerByNode.get(id) ?? new Map<string, LearnerCell>();
    const weakPrereqCodes: string[] = [];
    const miscoPrereqCodes: string[] = [];
    const unmeasuredPrereqCodes: string[] = [];
    const effectiveList: number[] = [];
    for (const cell of prerequisites) {
      const lc = byNode.get(cell.nodeId);
      if (lc == null) {
        unmeasuredPrereqCodes.push(cell.code);
        continue;
      }
      effectiveList.push(lc.effective);
      if (lc.attempts >= engine.minAttemptsForWeakness && lc.effective < engine.weakMasteryCeiling) {
        weakPrereqCodes.push(cell.code);
      }
      if (activeMiscoNodesByLearner.get(id)?.has(cell.nodeId) ?? false) {
        miscoPrereqCodes.push(cell.code);
      }
    }
    let state: ForesightsLearnerState;
    let reason: ForesightsLearnerReason | null;
    if (unmeasuredPrereqCodes.length > 0) {
      state = "NOT_ASSESSABLE";
      reason = "UNMEASURED_PREREQ";
    } else if (weakPrereqCodes.length > 0 && miscoPrereqCodes.length > 0) {
      state = "AT_RISK";
      reason = "LOW_MASTERY_AND_ACTIVE_MISCONCEPTION_PREREQ";
    } else if (weakPrereqCodes.length > 0) {
      state = "AT_RISK";
      reason = "LOW_MASTERY_PREREQ";
    } else if (miscoPrereqCodes.length > 0) {
      state = "AT_RISK";
      reason = "ACTIVE_MISCONCEPTION_PREREQ";
    } else {
      state = "READY";
      reason = null;
    }
    return {
      learnerId: id,
      displayName,
      state,
      reason,
      weakPrereqCodes,
      miscoPrereqCodes,
      unmeasuredPrereqCodes,
      meanEffectiveMastery:
        effectiveList.length === 0
          ? null
          : round4(effectiveList.reduce((a, v) => a + v, 0) / effectiveList.length),
    };
  });
  learnerRows.sort((a, b) => {
    const stateRank = (s: ForesightsLearnerState) => (s === "AT_RISK" ? 0 : s === "READY" ? 1 : 2);
    if (stateRank(a.state) !== stateRank(b.state)) return stateRank(a.state) - stateRank(b.state);
    if (a.state === "AT_RISK") {
      // AT_RISK reasons are non-null by construction (§5 first-match table)
      if (a.reason !== b.reason) return (a.reason ?? "").localeCompare(b.reason ?? "");
      const am = a.meanEffectiveMastery ?? 1.0;
      const bm = b.meanEffectiveMastery ?? 1.0;
      if (am !== bm) return am - bm;
    }
    return a.displayName.toLowerCase().localeCompare(b.displayName.toLowerCase());
  });

  // ── the §13.3 distribution (a polarized class must not hide behind an average)
  const prereqBandCounts = { LOW: 0, DEVELOPING: 0, SECURE: 0 };
  for (const c of prerequisites) {
    if (c.learnersMeasured === 0 || c.masteryBand === "UNMEASURED") continue;
    prereqBandCounts[c.masteryBand] += 1;
  }

  return {
    policy: FORESIGHTS_POLICY,
    classId,
    rootId,
    asOf,
    targetTopic: { nodeId: target.id, code: target.code, title: target.title },
    targetMeasured,
    classState,
    classReason,
    headline: headlineFor(
      classState,
      classReason,
      target.title,
      weakCodes,
      prerequisites.length,
      unmeasuredCodes,
      unlockPath?.code ?? null,
    ),
    disclosure: disclosureFor(target.title, asOf),
    unlockPath,
    prerequisites,
    contextChain,
    distribution: {
      ready: learnerRows.filter((l) => l.state === "READY").length,
      atRisk: learnerRows.filter((l) => l.state === "AT_RISK").length,
      notAssessable: learnerRows.filter((l) => l.state === "NOT_ASSESSABLE").length,
      prereqBandCounts,
    },
    learners: learnerRows,
  };
}

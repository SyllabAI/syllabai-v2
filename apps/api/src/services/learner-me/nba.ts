/**
 * T-MIG-043 tranche 2 — the deterministic next-best-learning-action engine.
 * Port of NextBestActionService.java :79-554 (syllabai-core @ 6cad6ef,
 * policy nba-rules/v1.3) line-against-line.
 *
 * Hard constraints before any ranking (RECOMMENDATION_SYSTEM_ARCHITECTURE §4,
 * ADR-017): every candidate is drawn from the requested subject root's
 * subtree (subject/curriculum isolation), question references are gated
 * through the servable-question rule (content validation), and reasons are
 * structured codes with evidence-derived details — never LLM-invented, never
 * causal claims. Ranking is fully deterministic (same learner state + same
 * clock ⇒ same actions).
 *
 * Rule tiers, most pedagogically urgent first:
 *   T1  due retrieval (decay-triggered reviews), overdue first
 *   T2  prerequisite remediation (dependent established-weak + prerequisite
 *       measured weak ⇒ remediate the prerequisite)
 *   T2b validated prerequisite chain (T-C11 REQUIRES_PREREQUISITE,
 *       learner-evidence-gated — the graph only NOMINATES)
 *   T3  low-mark problem questions (still servable, primary topic in-subtree)
 *   T4  suspected misconceptions (BDT active, staleness-relaxed probability)
 *   T4b validated misconception remediation (T-C11 REMEDIATED_BY)
 *   T5  timed-vs-untimed fluency gaps (SIGNED gap: only a POSITIVE gap
 *       justifies timed practice — StruggleInferenceService semantics)
 *   T6  weak measured mastery (established evidence only)
 *   T7a tutor engagement (V21/P7: recent asks with no attempt evidence; the
 *       learner's own interest outranks generic exploration; v1.3 detail
 *       carries the per-topic signal-type mix)
 *   T7  uncovered topics (constrained exploration — curriculum-order DFS)
 *
 * One action per target topic keeps the portfolio diverse; output is capped
 * at maxActions (8). Read-only by construction: no new persistence, no
 * parallel tracking model; every decay/relaxation/countdown is COMPUTED at
 * read from the stored anchors and never persisted (ADR-031/032).
 *
 * SEAM COMPOSITION (disclosed):
 *   - The servable-question rule is composed, never mirrored: the frozen
 *     javadoc makes ServableQuestionService the ONE owner of the boundary
 *     rule and the NBA a consumer of it; this port composes the landed
 *     questions module's ServableQuestions (T-MIG-031) for isServable +
 *     countServableByTopic (activeByTopic().size()).
 *   - The decay/BDT pure math (bandOf / decayedMastery / relaxedToPrior) is
 *     ported LOCALLY under the per-module structural-seam doctrine (the
 *     same posture as tranche-1's ExamTargetReader copy) — RULED OF RECORD
 *     (T-MIG-066, the 043 consolidation band, merged via PR #106): ONE
 *     canonical owner now exists for the learner-model laws
 *     (services/learner-model), and this module consumes the consolidated
 *     exports; the local copies below remain the disclosed per-module
 *     structural-seam posture pending the 066 consolidation follow-through.
 *   - The engine's now comes from the injected clock (the frozen service
 *     calls Instant.now() internally; the port's injected clock is the
 *     disclosed determinism deviation — same law the rest of this module
 *     ships, and what makes the unit pins possible at all).
 *
 * Rendering deviations (disclosed, none golden-pinned — the W4 capture's
 * agenda case carries actions: null, so no captured body pins any NBA
 * detail string; the unit pins fix both sides):
 *   - fmt() renders Java's %.2f as JS toFixed(2) (half-even vs HALF_UP ties
 *     on exact .005 boundaries — none reachable from the stored doubles'
 *     value ranges in practice).
 *   - Timestamps embedded in reasonDetail render as ISO-8601 millis
 *     (new Date().toISOString()) where the frozen embeds Instant.toString()
 *     (variable precision).
 */
import type { NextBestActionView, NextBestActionsView } from "@syllabai/contracts";
import type { SqlFn } from "../assessment/sql";
import type { SubmitClock } from "../selfmark";
import { ServableQuestions } from "../questions/servable";
import { LearnerMeNotFoundError } from "./index";
import { NBA_CONCEPT_GRAPH, type ConceptDependencyGraph, type SemanticRelation } from "./nba-concept-graph";

// ── frozen constants ─────────────────────────────────────────────────────────

/** v1.3 (sprint-2 §9): T7a detail carries the per-topic signal-type mix. */
export const NBA_POLICY = "nba-rules/v1.3";

/** RecommendationProperties.java — documented v0 engineering defaults. */
export interface RecommendationParams {
  weakMasteryCeiling: number; // matches decay LOW band ceiling
  fluencyGapThreshold: number;
  problemMarkRatio: number;
  minAttemptsForWeakness: number;
  maxActions: number;
  uncoveredTopicCap: number;
  problemQuestionCap: number;
  tutorEngagementWindowDays: number; // P7: recency of a tutor ask
}

/** The paper defaults (every field's frozen <= 0 fallback). */
export const RECOMMENDATION_PAPER_DEFAULTS: RecommendationParams = {
  weakMasteryCeiling: 0.45,
  fluencyGapThreshold: 0.2,
  problemMarkRatio: 0.5,
  minAttemptsForWeakness: 2,
  maxActions: 8,
  uncoveredTopicCap: 2,
  problemQuestionCap: 2,
  tutorEngagementWindowDays: 14,
};

const fmt = (v: number): string => v.toFixed(2);

// ── row shapes (snake_case columns as the selects read them) ────────────────

interface SkillStateRow {
  node_id: string;
  mastery: number;
  attempts: number;
  correct_count: number;
  last_practiced_at: string;
  procedural_fluency_gap: number | null;
}

interface MisconceptionStateRow {
  misconception_node_id: string;
  probability: number;
  evidence_count: number;
  last_evidence_at: string;
}

interface ReviewRow {
  node_id: string;
  due_at: string;
  reason: string;
}

interface RecentAnswerRow {
  id: string;
  marking_state: string;
  marks_awarded: number | null;
  created_at: string;
  part_marks: number;
  part_label: string;
  question_id: string;
  primary_topic_node_id: string | null;
}

/** KG node projection (NodeView.flat fields the engine consumes). */
export interface NbaNode {
  id: string;
  code: string;
  type: string;
  title: string;
  children: NbaNode[];
}

interface KnowledgeNodeRow {
  id: string;
  code: string;
  node_type: string;
  title: string;
}

interface EdgeRow {
  source_node_id: string;
  target_node_id: string;
}

interface MisconceptionFamilyEdgeRow extends EdgeRow {
  relation_type: string;
  source_code: string;
  source_title: string;
  source_type: string;
}

// T-MIG-066: the decay/BDT pure math is owned by the canonical
// services/learner-model/decay.ts (the 043 consolidation band) — the former
// per-module NBA_-prefixed copies (line-against-line matches, R0-verified
// zero behavioral divergence) are retired; the canonical names serve here.
import {
  bandOf,
  decayedMastery,
  relaxedToPrior,
  LEARNER_BDT_PAPER_DEFAULTS,
  LEARNER_DECAY_PAPER_DEFAULTS,
  type LearnerDecayParams,
} from "../learner-model/decay";

const DAY_MS = 86_400_000; // the tutor-window read's own implementation const

// ── the engine deps ──────────────────────────────────────────────────────────

export interface NbaDeps {
  sql: SqlFn;
  clock: SubmitClock;
  decay?: LearnerDecayParams;
  bdt?: { prior: number; activeThreshold: number; stalenessTauDays: number };
  recommendation?: Partial<RecommendationParams>;
  /** test fixture injection (the frozen tests build fixture graphs) */
  conceptGraph?: ConceptDependencyGraph;
}

function fullParams(deps: NbaDeps): {
  decay: LearnerDecayParams;
  bdt: { prior: number; activeThreshold: number; stalenessTauDays: number };
  rec: RecommendationParams;
} {
  return {
    decay: deps.decay ?? LEARNER_DECAY_PAPER_DEFAULTS,
    bdt: deps.bdt ?? LEARNER_BDT_PAPER_DEFAULTS,
    rec: { ...RECOMMENDATION_PAPER_DEFAULTS, ...deps.recommendation },
  };
}

// ── the KG read seam (KnowledgeGraphService.treeWithMisconceptions) ─────────

async function requireNode(sql: SqlFn, rootId: string): Promise<void> {
  const rows = (await sql`
    select id from knowledge_nodes where id = ${rootId}`) as unknown as Array<{ id: string }>;
  if (rows.length === 0) {
    // the frozen NotFoundException("knowledge node", rootId) → 404, agenda
    // javadoc: "the NBA engine owns its own scoping/validation contract
    // (404 on an unknown root, deterministic ranked advice otherwise)"
    throw new LearnerMeNotFoundError(`knowledge node ${rootId} not found`);
  }
}

/** KnowledgeNodeRepository.findSubtreeIds — the recursive PART_OF CTE, verbatim. */
async function subtreeIds(sql: SqlFn, rootId: string): Promise<string[]> {
  const rows = (await sql`
    WITH RECURSIVE subtree AS (
      SELECT n.id FROM knowledge_nodes n WHERE n.id = ${rootId}
      UNION
      SELECT e.source_node_id FROM knowledge_edges e
      JOIN subtree s ON e.target_node_id = s.id
      WHERE e.relation_type = 'PART_OF'
    )
    SELECT n.id FROM knowledge_nodes n WHERE n.id IN (SELECT id FROM subtree)`) as unknown as Array<{ id: string }>;
  return rows.map((r) => r.id);
}

async function nodesByIds(sql: SqlFn, ids: string[]): Promise<Map<string, KnowledgeNodeRow>> {
  const byId = new Map<string, KnowledgeNodeRow>();
  if (ids.length === 0) return byId;
  const rows = (await sql`
    select id, code, node_type, title from knowledge_nodes
    where id = any(${ids}::uuid[])`) as unknown as KnowledgeNodeRow[];
  for (const r of rows) byId.set(r.id, r);
  return byId;
}

/**
 * treeWithMisconceptions + collect (:136-158 + :517-528): the PART_OF tree
 * with misconception-family nodes folded in as children of their targets —
 * TOPIC/SUBTOPIC fold MISCONCEPTION_OF only, CONCEPT folds the whole family
 * (V15: 13 of 15 settled misconceptions carry no MISCONCEPTION_OF edge);
 * deduped per target, each fold sorted by source code; folded nodes are
 * FLAT (NodeView.flat — no children).
 */
export async function kgTreeWithMisconceptions(sql: SqlFn, rootId: string): Promise<NbaNode> {
  await requireNode(sql, rootId);
  const ids = await subtreeIds(sql, rootId);
  const byId = await nodesByIds(sql, ids);

  const partOfEdges = ids.length
    ? ((await sql`
      select source_node_id, target_node_id from knowledge_edges
      where relation_type = 'PART_OF'
        and source_node_id = any(${ids}::uuid[])
        and target_node_id = any(${ids}::uuid[])`) as unknown as EdgeRow[])
    : [];

  // join fetch e.source: misconception sources are NOT subtree members —
  // resolve their code/type/title through the fetched source row
  const familyEdges = ids.length
    ? ((await sql`
      select e.source_node_id, e.target_node_id, e.relation_type,
             n.code as source_code, n.title as source_title, n.node_type as source_type
      from knowledge_edges e
      join knowledge_nodes n on n.id = e.source_node_id
      where e.relation_type in ('MISCONCEPTION_OF', 'REMEDIATED_BY', 'WRONG_ANSWER_PATTERN')
        and e.target_node_id = any(${ids}::uuid[])`) as unknown as MisconceptionFamilyEdgeRow[])
    : [];

  const childrenByParent = new Map<string, EdgeRow[]>();
  for (const e of partOfEdges) {
    const list = childrenByParent.get(e.target_node_id);
    if (list) list.push(e);
    else childrenByParent.set(e.target_node_id, [e]);
  }
  const attachmentsByTarget = new Map<string, MisconceptionFamilyEdgeRow[]>();
  for (const e of familyEdges) {
    const list = attachmentsByTarget.get(e.target_node_id);
    if (list) list.push(e);
    else attachmentsByTarget.set(e.target_node_id, [e]);
  }

  const codeOf = (id: string): string => byId.get(id)?.code ?? "";
  const assemble = (nodeId: string): NbaNode => {
    const row = byId.get(nodeId)!;
    const node: NbaNode = { id: row.id, code: row.code, type: row.node_type, title: row.title, children: [] };
    const kids = [...(childrenByParent.get(nodeId) ?? [])].sort((a, b) => codeOf(a.source_node_id).localeCompare(codeOf(b.source_node_id)));
    for (const e of kids) {
      if (byId.has(e.source_node_id)) {
        // dangling edge → skipped, matching the walk contract
        node.children.push(assemble(e.source_node_id));
      }
    }
    const topicLike = row.node_type === "TOPIC" || row.node_type === "SUBTOPIC";
    if (topicLike || row.node_type === "CONCEPT") {
      const attached = new Set<string>();
      const attachments = [...(attachmentsByTarget.get(nodeId) ?? [])]
        // TOPIC/SUBTOPIC fold MISCONCEPTION_OF only (V6 contract); CONCEPT
        // folds the whole family (V15 widening)
        .filter((e) => (topicLike ? e.relation_type === "MISCONCEPTION_OF" : true))
        .sort((a, b) => a.source_code.localeCompare(b.source_code));
      for (const e of attachments) {
        if (attached.add(e.source_node_id)) {
          node.children.push({
            id: e.source_node_id,
            code: e.source_code,
            type: e.source_type,
            title: e.source_title,
            children: [],
          });
        }
      }
    }
    return node;
  };
  return assemble(rootId);
}

/**
 * prerequisiteRelations (:246-260): REQUIRES_PREREQUISITE edges with BOTH
 * endpoints in the subtree; edge convention (V6 seed + T-C11): source = the
 * DEPENDENT node, target = the PREREQUISITE — the record is
 * (prerequisiteId = target, dependentNodeId = source).
 */
export async function prerequisiteRelations(
  sql: SqlFn,
  rootId: string,
): Promise<Array<{ prerequisiteId: string; dependentNodeId: string }>> {
  await requireNode(sql, rootId);
  const ids = await subtreeIds(sql, rootId);
  if (ids.length === 0) return [];
  const rows = (await sql`
    select source_node_id, target_node_id from knowledge_edges
    where relation_type = 'REQUIRES_PREREQUISITE'
      and source_node_id = any(${ids}::uuid[])
      and target_node_id = any(${ids}::uuid[])`) as unknown as EdgeRow[];
  return rows.map((e) => ({ prerequisiteId: e.target_node_id, dependentNodeId: e.source_node_id }));
}

// ── the learner-state read seams (LearnerModelService) ──────────────────────

/** findByLearnerIdOrderByLastPracticedAtDesc. */
export async function skillStatesFor(sql: SqlFn, learnerId: string): Promise<SkillStateRow[]> {
  return (await sql`
    select node_id, mastery, attempts, correct_count, last_practiced_at,
           procedural_fluency_gap
    from skill_states
    where learner_id = ${learnerId}
    order by last_practiced_at desc`) as unknown as SkillStateRow[];
}

/**
 * misconceptionReadings (:225-236): stored posteriors relaxed toward the
 * prior (MED-2/ADR-032) and RE-SORTED by the relaxed value DESC — "a fresh
 * 0.6 outranks a stale 0.9".
 */
export async function misconceptionReadingsFor(
  sql: SqlFn,
  learnerId: string,
  now: Date,
  bdt: { prior: number; activeThreshold: number; stalenessTauDays: number },
): Promise<Array<MisconceptionStateRow & { effective: number }>> {
  const rows = (await sql`
    select misconception_node_id, probability, evidence_count, last_evidence_at
    from misconception_states
    where learner_id = ${learnerId}
    order by probability desc`) as unknown as MisconceptionStateRow[];
  return rows
    .map((r) => ({
      ...r,
      effective: relaxedToPrior(
        r.probability,
        bdt.prior,
        new Date(r.last_evidence_at),
        now,
        bdt.stalenessTauDays,
      ),
    }))
    .sort((a, b) => b.effective - a.effective);
}

/** AnswerRepository.findByLearnerIdOrderByCreatedAtDesc — the T3 read. */
async function recentAnswers(sql: SqlFn, learnerId: string): Promise<RecentAnswerRow[]> {
  return (await sql`
    select a.id, a.marking_state, a.marks_awarded, a.created_at,
           p.marks as part_marks, p.label as part_label,
           at.question_id, q.primary_topic_node_id
    from answers a
    join question_parts p on p.id = a.question_part_id
    join attempts at on at.id = a.attempt_id
    join questions q on q.id = at.question_id
    where a.learner_id = ${learnerId}
    order by a.created_at desc`) as unknown as RecentAnswerRow[];
}

// ── the engine ───────────────────────────────────────────────────────────────

/** §9: the evidence sentence for a topic's signal mix — counts only, no interpretation. */
function signalMixNote(mix: Map<string, number> | undefined): string {
  if (!mix || mix.size === 0) return "";
  const joined = [...mix.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([signal, count]) => `${count} ${signal}`)
    .join(", ");
  return ` (${joined})`;
}

/** %.2f parity helper on the two-decimal reason strings. */
const lowerNamed = (name: string): string => name.toLowerCase().replace(/_/g, " ");

/**
 * The port of NextBestActionService.actionsFor (:132-501). Deterministic:
 * same learner state + same clock ⇒ same actions.
 */
export async function nbaActionsFor(
  deps: NbaDeps,
  learnerId: string,
  rootId: string,
): Promise<NextBestActionsView> {
  const { sql, clock } = deps;
  const now = clock.now();
  const { decay, bdt, rec } = fullParams(deps);
  const graph = deps.conceptGraph ?? NBA_CONCEPT_GRAPH;
  const servable = new ServableQuestions(sql);

  const tree = await kgTreeWithMisconceptions(sql, rootId);

  // subject-scoped evidence maps (nodes outside the subtree are ignored —
  // hard subject/curriculum isolation, not a filter applied after ranking)
  const skills = new Map<string, SkillStateRow>();
  for (const s of await skillStatesFor(sql, learnerId)) skills.set(s.node_id, s);
  const misconceptions = new Map<string, (MisconceptionStateRow & { effective: number })>();
  for (const r of await misconceptionReadingsFor(sql, learnerId, now, bdt)) {
    misconceptions.set(r.misconception_node_id, r);
  }

  // flatten the subtree once: node registry + parent-of (misconceptions
  // attach as children of topics) + effective mastery for practised nodes +
  // the code registry the T-C11 concept graph joins against
  const byId = new Map<string, NbaNode>();
  const parentOf = new Map<string, string>();
  const byCode = new Map<string, NbaNode>();
  const collect = (node: NbaNode, parentId: string | null): void => {
    byId.set(node.id, node);
    if (!byCode.has(node.code)) byCode.set(node.code, node);
    if (parentId !== null) parentOf.set(node.id, parentId);
    for (const child of node.children) collect(child, node.id);
  };
  collect(tree, null);

  const effective = new Map<string, number>();
  for (const [nodeId, s] of skills) {
    if (byId.has(nodeId)) {
      effective.set(
        nodeId,
        decayedMastery(s.mastery, new Date(s.last_practiced_at), now, decay),
      );
    }
  }
  const servableCountCache = new Map<string, number>(); // per-request cache
  const topicsWithActions = new Set<string>(); // one action per topic
  const ranked: NextBestActionView[] = [];

  // Java `if (!topicsWithActions.add(id)) continue;` semantics — JS Set.add
  // returns the set (truthy), so the claim is explicit: first tier wins,
  // later tiers skip an already-claimed topic (portfolio diversity, §16).
  const claimTopic = (id: string): boolean => {
    if (topicsWithActions.has(id)) return false;
    topicsWithActions.add(id);
    return true;
  };

  const servableCount = async (node: NbaNode): Promise<number> => {
    if (node.type === "MISCONCEPTION") return 0; // questions never map to misconceptions
    const cached = servableCountCache.get(node.id);
    if (cached !== undefined) return cached;
    const count = (await servable.activeByTopic(node.id)).length;
    servableCountCache.set(node.id, count);
    return count;
  };

  // T1 — due retrieval (decay-triggered reviews), overdue first
  // (sorted here rather than trusting the repository's ordering contract,
  // so the "overdue first" rule is self-contained and testable)
  const pendingRows = (await sql`
    select node_id, due_at, reason from review_schedules
    where learner_id = ${learnerId} and status = 'PENDING'
    order by due_at asc`) as unknown as ReviewRow[];
  const pending = pendingRows
    .filter((r) => byId.has(r.node_id))
    .sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime());
  for (const r of pending) {
    if (ranked.length >= rec.maxActions) break;
    const node = byId.get(r.node_id)!;
    if (!claimTopic(node.id)) continue;
    const overdue = new Date(r.due_at).getTime() < now.getTime();
    ranked.push({
      rank: 0,
      actionType: "REVIEW_TOPIC",
      reasonCode: "DUE_REVIEW",
      targetNodeId: node.id,
      targetCode: node.code,
      targetTitle: node.title,
      questionId: null,
      servableQuestionCount: await servableCount(node),
      reasonDetail:
        "Retrieval practice due (scheduled " +
        new Date(r.due_at).toISOString() +
        ", " +
        lowerNamed(r.reason) +
        (overdue ? ", overdue" : "") +
        ")",
    });
  }

  // T2 — prerequisite remediation: dependent topic established weak AND its
  // prerequisite measured weak ⇒ remediate the prerequisite (§4.4
  // pedagogical safety: prerequisite support outranks downstream practice)
  const relations = await prerequisiteRelations(sql, rootId);
  interface PrereqCandidate {
    dependentCode: string;
    dependentTitle: string;
    dependentEff: number;
    prerequisiteId: string;
  }
  const prereqCandidates: PrereqCandidate[] = [];
  for (const rel of relations) {
    const dep = skills.get(rel.dependentNodeId);
    const pre = skills.get(rel.prerequisiteId);
    if (!dep || !pre) continue;
    const depEff = effective.get(dep.node_id);
    const preEff = effective.get(pre.node_id);
    if (depEff === undefined || preEff === undefined) continue;
    if (dep.attempts < rec.minAttemptsForWeakness || pre.attempts < 1) continue;
    if (depEff >= rec.weakMasteryCeiling || preEff >= rec.weakMasteryCeiling) continue;
    const depNode = byId.get(rel.dependentNodeId)!;
    prereqCandidates.push({
      dependentCode: depNode.code,
      dependentTitle: depNode.title,
      dependentEff: depEff,
      prerequisiteId: rel.prerequisiteId,
    });
  }
  prereqCandidates.sort((a, b) => a.dependentCode.localeCompare(b.dependentCode));
  for (const c of prereqCandidates) {
    if (ranked.length >= rec.maxActions) break;
    const node = byId.get(c.prerequisiteId)!;
    if (!claimTopic(node.id)) continue;
    const preEff = effective.get(c.prerequisiteId)!;
    ranked.push({
      rank: 0,
      actionType: "REVIEW_PREREQUISITE",
      reasonCode: "PREREQUISITE_WEAK",
      targetNodeId: node.id,
      targetCode: node.code,
      targetTitle: node.title,
      questionId: null,
      servableQuestionCount: await servableCount(node),
      reasonDetail:
        "Prerequisite of " +
        c.dependentCode +
        " (" +
        c.dependentTitle +
        "); measured mastery " +
        fmt(preEff) +
        " here and " +
        fmt(c.dependentEff) +
        " on the dependent topic",
    });
  }

  // T2b — validated prerequisite chain (T-C11 concept graph): the dependent
  // topic is established-weak from measured evidence AND a HUMAN_VALIDATED
  // REQUIRES_PREREQUISITE edge names its prerequisite ⇒ remediate toward the
  // prerequisite. The graph only NOMINATES the target; deterministic learner
  // evidence gates it — a prerequisite measured strong is skipped in favour
  // of the evidence, and an unmeasured prerequisite is reported honestly as
  // unmeasured, never as weak. Both endpoints must resolve inside this
  // subject's subtree (hard subject isolation for graph candidates too).
  interface ChainCandidate {
    dependentCode: string;
    dependentTitle: string;
    dependentEff: number;
    dependentAttempts: number;
    prerequisiteId: string;
    prerequisiteState: string;
  }
  const chainByPrerequisite = new Map<string, ChainCandidate>();
  for (const edge of graph.edges("REQUIRES_PREREQUISITE")) {
    const dependent = byCode.get(edge.source);
    const prerequisite = byCode.get(edge.target);
    if (!dependent || !prerequisite) continue; // not in this subtree
    const dep = skills.get(dependent.id);
    if (!dep) continue; // no learner evidence on the dependent — the graph alone never acts
    const depEff = effective.get(dependent.id);
    if (depEff === undefined || dep.attempts < rec.minAttemptsForWeakness || depEff >= rec.weakMasteryCeiling) {
      continue; // dependent not established-weak
    }
    const pre = skills.get(prerequisite.id);
    let prerequisiteState: string;
    if (!pre) {
      prerequisiteState = "not yet measured for this learner";
    } else {
      const preEff = effective.get(prerequisite.id);
      if (preEff !== undefined && pre.attempts >= 1 && preEff >= rec.weakMasteryCeiling) {
        continue; // measured strength overrides the graph's nomination
      }
      prerequisiteState =
        "measured mastery " + fmt(preEff === undefined ? pre.mastery : preEff) + " over " + pre.attempts + " attempt(s)";
    }
    if (!chainByPrerequisite.has(prerequisite.id)) {
      chainByPrerequisite.set(prerequisite.id, {
        dependentCode: dependent.code,
        dependentTitle: dependent.title,
        dependentEff: depEff,
        dependentAttempts: dep.attempts,
        prerequisiteId: prerequisite.id,
        prerequisiteState,
      });
    }
  }
  const chainCandidates = [...chainByPrerequisite.values()].sort((a, b) =>
    byId.get(a.prerequisiteId)!.code.localeCompare(byId.get(b.prerequisiteId)!.code),
  );
  for (const c of chainCandidates) {
    if (ranked.length >= rec.maxActions) break;
    const node = byId.get(c.prerequisiteId)!;
    if (!claimTopic(node.id)) continue;
    ranked.push({
      rank: 0,
      actionType: "REVIEW_PREREQUISITE",
      reasonCode: "VALIDATED_PREREQUISITE_CHAIN",
      targetNodeId: node.id,
      targetCode: node.code,
      targetTitle: node.title,
      questionId: null,
      servableQuestionCount: await servableCount(node),
      reasonDetail:
        "Validated prerequisite chain: " +
        c.dependentCode +
        " (" +
        c.dependentTitle +
        ") measured " +
        fmt(c.dependentEff) +
        " over " +
        c.dependentAttempts +
        " attempts requires " +
        node.code +
        " — prerequisite " +
        c.prerequisiteState +
        "; strengthen the foundation first",
    });
  }

  // T3 — low-mark problem questions: most recent graded answers at/below the
  // ratio threshold, only where the question is still servable and its
  // primary topic is inside this subject (conservative isolation — secondary
  // question_topics mappings are a documented v1 limitation)
  const recent = await recentAnswers(sql, learnerId);
  let problemAdded = 0;
  for (const a of recent) {
    if (problemAdded >= rec.problemQuestionCap) break;
    if (ranked.length >= rec.maxActions) break;
    if (a.marking_state === "PENDING" || a.marks_awarded === null) continue;
    const max = a.part_marks;
    if (max <= 0 || a.marks_awarded > max) continue;
    if (a.marks_awarded / max > rec.problemMarkRatio) continue;
    const topicId = a.primary_topic_node_id;
    if (topicId === null || !byId.has(topicId)) continue;
    if (!(await servable.findById(a.question_id))) continue;
    const node = byId.get(topicId)!;
    if (!claimTopic(node.id)) continue;
    problemAdded++;
    ranked.push({
      rank: 0,
      actionType: "RETRY_PROBLEM_QUESTION",
      reasonCode: "PROBLEM_QUESTION",
      targetNodeId: node.id,
      targetCode: node.code,
      targetTitle: node.title,
      questionId: a.question_id,
      servableQuestionCount: await servableCount(node),
      reasonDetail:
        "Last marked " +
        a.marks_awarded +
        "/" +
        max +
        " on part " +
        a.part_label +
        " (" +
        lowerNamed(a.marking_state) +
        ")",
    });
  }

  // T4 — suspected misconceptions (BDT): active probability at/above the
  // same threshold the learner-state view uses; the Tutor is the Cycle-1
  // intervention surface for a grounded explanation
  interface MisconceptionCandidate {
    probability: number;
    node: NbaNode;
    parentTopic: NbaNode | null;
  }
  const misconceptionCandidates: MisconceptionCandidate[] = [];
  for (const [nodeId, r] of misconceptions) {
    const node = byId.get(nodeId);
    if (!node) continue;
    if (r.effective < bdt.activeThreshold) continue;
    const parent = byId.get(parentOf.get(nodeId) ?? "") ?? null;
    misconceptionCandidates.push({ probability: r.effective, node, parentTopic: parent });
  }
  misconceptionCandidates.sort(
    (a, b) => b.probability - a.probability || a.node.code.localeCompare(b.node.code),
  );
  for (const mc of misconceptionCandidates) {
    if (ranked.length >= rec.maxActions) break;
    const node = mc.node;
    if (!claimTopic(node.id)) continue;
    const parent =
      mc.parentTopic === null ? "" : " on " + mc.parentTopic.code + " (" + mc.parentTopic.title + ")";
    const r = misconceptions.get(node.id)!;
    ranked.push({
      rank: 0,
      actionType: "ASK_TUTOR",
      reasonCode: "MISCONCEPTION_SUSPECTED",
      targetNodeId: node.id,
      targetCode: node.code,
      targetTitle: node.title,
      questionId: null,
      servableQuestionCount: 0,
      reasonDetail:
        "Misconception probability " +
        fmt(r.effective) +
        " from " +
        r.evidence_count +
        " evidence item(s)" +
        parent +
        " — ask the Tutor for a grounded explanation",
    });
  }

  // T4b — validated misconception remediation (T-C11 concept graph): the
  // learner's BDT evidence is active on a misconception AND a
  // HUMAN_VALIDATED REMEDIATED_BY edge names its corrective concept ⇒
  // surface the corrective action on that concept. The misconception node
  // itself keeps its ASK_TUTOR action above (existing behaviour); this adds
  // the graph-directed leg — what to STUDY to correct it.
  interface CorrectiveCandidate {
    probability: number;
    evidenceCount: number;
    misconception: NbaNode;
    corrective: NbaNode;
  }
  const correctiveCandidates: CorrectiveCandidate[] = [];
  for (const edge of graph.edges("REMEDIATED_BY")) {
    const misNode = byCode.get(edge.source);
    const corrective = byCode.get(edge.target);
    if (!misNode || !corrective) continue; // not in this subtree
    const r = misconceptions.get(misNode.id);
    if (!r || r.effective < bdt.activeThreshold) {
      continue; // no active learner evidence — the graph alone never acts
    }
    correctiveCandidates.push({
      probability: r.effective,
      evidenceCount: r.evidence_count,
      misconception: misNode,
      corrective,
    });
  }
  correctiveCandidates.sort(
    (a, b) =>
      b.probability - a.probability ||
      a.misconception.code.localeCompare(b.misconception.code) ||
      a.corrective.code.localeCompare(b.corrective.code),
  );
  for (const cc of correctiveCandidates) {
    if (ranked.length >= rec.maxActions) break;
    const node = cc.corrective;
    if (!claimTopic(node.id)) continue;
    ranked.push({
      rank: 0,
      actionType: "REMEDIATE_MISCONCEPTION",
      reasonCode: "MISCONCEPTION_REMEDIATION",
      targetNodeId: node.id,
      targetCode: node.code,
      targetTitle: node.title,
      questionId: null,
      servableQuestionCount: await servableCount(node),
      reasonDetail:
        "Misconception " +
        cc.misconception.code +
        " (" +
        cc.misconception.title +
        ") probability " +
        fmt(cc.probability) +
        " from " +
        cc.evidenceCount +
        " evidence item(s)" +
        " — validated remediation: study " +
        node.code +
        " (" +
        node.title +
        "), then ask the Tutor for the corrective explanation",
    });
  }

  // T5 — timed-vs-untimed fluency gaps (Paper B §16 / F-162). Signed
  // semantics, matching StruggleInferenceService: the gap is untimed − timed
  // accuracy, so only a POSITIVE gap (the learner does WORSE under timed
  // conditions) justifies a timed-practice action.
  interface FluencyCandidate {
    gap: number;
    skill: SkillStateRow;
    node: NbaNode;
  }
  const fluencyCandidates: FluencyCandidate[] = [];
  for (const [nodeId, s] of skills) {
    const node = byId.get(nodeId);
    if (!node || node.type === "MISCONCEPTION") continue;
    const gap = s.procedural_fluency_gap;
    if (gap === null || gap < rec.fluencyGapThreshold) continue;
    fluencyCandidates.push({ gap, skill: s, node });
  }
  fluencyCandidates.sort(
    (a, b) => Math.abs(b.gap) - Math.abs(a.gap) || a.node.code.localeCompare(b.node.code),
  );
  for (const fc of fluencyCandidates) {
    if (ranked.length >= rec.maxActions) break;
    if (!claimTopic(fc.node.id)) continue;
    ranked.push({
      rank: 0,
      actionType: "TIMED_EXERCISE",
      reasonCode: "FLUENCY_GAP",
      targetNodeId: fc.node.id,
      targetCode: fc.node.code,
      targetTitle: fc.node.title,
      questionId: null,
      servableQuestionCount: await servableCount(fc.node),
      reasonDetail:
        "Untimed-vs-timed accuracy gap " +
        fmt(fc.gap) +
        " over " +
        fc.skill.attempts +
        " attempts — practise under timed conditions",
    });
  }

  // T6 — weak measured mastery (only with established evidence)
  interface WeakCandidate {
    eff: number;
    skill: SkillStateRow;
    node: NbaNode;
  }
  const weakCandidates: WeakCandidate[] = [];
  for (const [nodeId, s] of skills) {
    const node = byId.get(nodeId);
    if (!node || node.type === "MISCONCEPTION") continue;
    if (s.attempts < rec.minAttemptsForWeakness) continue;
    const eff = effective.get(s.node_id);
    if (eff === undefined || eff >= rec.weakMasteryCeiling) continue;
    weakCandidates.push({ eff, skill: s, node });
  }
  weakCandidates.sort((a, b) => a.eff - b.eff || a.node.code.localeCompare(b.node.code));
  for (const wc of weakCandidates) {
    if (ranked.length >= rec.maxActions) break;
    if (!claimTopic(wc.node.id)) continue;
    const band = bandOf(wc.eff, decay);
    ranked.push({
      rank: 0,
      actionType: "PRACTISE_QUESTIONS",
      reasonCode: "LOW_MASTERY",
      targetNodeId: wc.node.id,
      targetCode: wc.node.code,
      targetTitle: wc.node.title,
      questionId: null,
      servableQuestionCount: await servableCount(wc.node),
      reasonDetail:
        "Measured mastery " +
        fmt(wc.eff) +
        " (band " +
        band +
        ") over " +
        wc.skill.attempts +
        " attempts, last practiced " +
        new Date(wc.skill.last_practiced_at).toISOString(),
    });
  }

  // T7a — tutor engagement (V21, P7): topics the learner recently asked the
  // Tutor about (deterministic matcher output, windowed) with no attempt
  // evidence yet — the learner's own interest is the strongest exploration
  // prior we have, so it outranks generic curriculum-order uncovered topics.
  // No mastery is invented: an ask is engagement, not competence. §9 (v1.3):
  // the detail states the signal mix — doubt/clarification/explanation —
  // as evidence, without changing the ordering (still ask-count desc).
  const since = new Date(now.getTime() - rec.tutorEngagementWindowDays * DAY_MS);
  const askRows = (await sql`
    select node_id, count(*)::int as ask_count
    from tutor_topic_engagements
    where learner_id = ${learnerId} and occurred_at >= ${since.toISOString()}
    group by node_id`) as unknown as Array<{ node_id: string; ask_count: number }>;
  const signalRows = (await sql`
    select node_id, coalesce(signal_type, 'TOPIC_ENGAGEMENT') as signal_type, count(*)::int as ask_count
    from tutor_topic_engagements
    where learner_id = ${learnerId} and occurred_at >= ${since.toISOString()}
    group by node_id, signal_type`) as unknown as Array<{ node_id: string; signal_type: string; ask_count: number }>;
  const signalMix = new Map<string, Map<string, number>>();
  for (const r of signalRows) {
    let perNode = signalMix.get(r.node_id);
    if (!perNode) {
      perNode = new Map<string, number>();
      signalMix.set(r.node_id, perNode);
    }
    perNode.set(r.signal_type, (perNode.get(r.signal_type) ?? 0) + r.ask_count);
  }
  const askedUnpractised = askRows
    .filter((e) => byId.has(e.node_id)) // subject isolation: ignore out-of-subtree asks
    .filter((e) => !skills.has(e.node_id))
    .sort((a, b) => b.ask_count - a.ask_count);
  for (const asked of askedUnpractised) {
    if (ranked.length >= rec.maxActions) break;
    const node = byId.get(asked.node_id)!;
    if (node.type !== "TOPIC" && node.type !== "SUBTOPIC") continue;
    const count = await servableCount(node);
    if (count <= 0) continue; // nothing validated to practise — no action
    if (!claimTopic(node.id)) continue;
    ranked.push({
      rank: 0,
      actionType: "PRACTISE_QUESTIONS",
      reasonCode: "TUTOR_ENGAGED",
      targetNodeId: node.id,
      targetCode: node.code,
      targetTitle: node.title,
      questionId: null,
      servableQuestionCount: count,
      reasonDetail:
        "Asked the Tutor " +
        asked.ask_count +
        " time(s) in the last " +
        rec.tutorEngagementWindowDays +
        " days" +
        signalMixNote(signalMix.get(node.id)) +
        ", no attempt evidence yet; " +
        count +
        " validated question(s) available",
    });
  }

  // T7 — uncovered topics (constrained exploration): curriculum-order topics
  // with no attempt evidence that actually have validated questions to
  // practise
  let uncoveredAdded = 0;
  const walkOrder = (node: NbaNode, out: NbaNode[]): void => {
    out.push(node);
    for (const child of node.children) walkOrder(child, out);
  };
  const curriculumOrder: NbaNode[] = [];
  walkOrder(tree, curriculumOrder);
  for (const node of curriculumOrder) {
    if (uncoveredAdded >= rec.uncoveredTopicCap) break;
    if (ranked.length >= rec.maxActions) break;
    if (node.type !== "TOPIC" && node.type !== "SUBTOPIC") continue;
    if (skills.has(node.id)) continue;
    const count = await servableCount(node);
    if (count <= 0) continue;
    if (!claimTopic(node.id)) continue;
    uncoveredAdded++;
    ranked.push({
      rank: 0,
      actionType: "PRACTISE_QUESTIONS",
      reasonCode: "UNCOVERED_TOPIC",
      targetNodeId: node.id,
      targetCode: node.code,
      targetTitle: node.title,
      questionId: null,
      servableQuestionCount: count,
      reasonDetail: "No attempt evidence yet; " + count + " validated question(s) available",
    });
  }

  const actions = ranked.map((a, i) => ({ ...a, rank: i + 1 }));
  return {
    learnerId,
    rootId,
    asOf: now.toISOString(),
    policy: NBA_POLICY,
    actions,
  };
}

// ── the composition seam ─────────────────────────────────────────────────────

/**
 * The module-factory seam: the same SqlFn the learner-me module owns, the
 * shared clock, the frozen thresholds, and the packaged T-C11 snapshot (a
 * test fixture graph may override the last).
 */
export function buildNbaEngine(
  sql: SqlFn,
  clock: SubmitClock,
  opts?: {
    decay?: LearnerDecayParams;
    bdt?: { prior: number; activeThreshold: number; stalenessTauDays: number };
    recommendation?: Partial<RecommendationParams>;
    conceptGraph?: ConceptDependencyGraph;
  },
): (learnerId: string, rootId: string) => Promise<NextBestActionsView> {
  return (learnerId, rootId) =>
    nbaActionsFor(
      {
        sql,
        clock,
        decay: opts?.decay,
        bdt: opts?.bdt,
        recommendation: opts?.recommendation,
        conceptGraph: opts?.conceptGraph,
      },
      learnerId,
      rootId,
    );
}

export type { SemanticRelation };

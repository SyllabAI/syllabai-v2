/**
 * T-MIG-053 tranche-2 (r3a) — the teacher class-intelligence read model.
 * Port of the frozen law (syllabai-core @ 6cad6ef):
 *
 *   - teacher/ClassAnalyticsController.java :27-71: GET /api/v1/teacher/class
 *     /overview?rootId=, /learners?rootId=, /topics/{nodeId}/drill-down?rootId=
 *     (route security TEACHER/ADMIN is SecurityConfig's rule — the t2 tranche
 *     is contracts+services+fakeSql pins, NO routes/mounts, doctrine);
 *   - teacher/ClassAnalyticsService.java :42-758. The binding laws:
 *
 *   EVIDENCE SEMANTICS (§4, non-negotiable):
 *     every aggregate is built from the EXISTING evidence tables and stays
 *     separated by kind — raw attempt activity (14-day window), evidence-
 *     backed practice (skill_states rows exist only where BKT reacted to
 *     graded evidence), tutor engagement (interest or doubt signal — NEVER
 *     mastery, reported in its own fields), BKT mastery estimates, BDT
 *     misconception probabilities, coverage, review state. Unmeasured is
 *     honest: means are null and bands read "UNMEASURED" — nothing is
 *     fabricated for learners or topics without evidence.
 *   READ-ONLY BY CONSTRUCTION: analytics consume the learner model, they do
 *     not become a second implementation of it. Bands and thresholds are the
 *     SAME parameters the learner-facing surfaces use (the learner decay
 *     bands + BDT active threshold + the recommendation weak-mastery ceiling
 *     and evidence floor) — no teacher-specific tuning. REUSE-not-redeclare:
 *     bandOf/relaxedToPrior come from services/learner (the 041/043/053-t1
 *     machinery-reuse precedent).
 *   BATCHED BY CONSTRUCTION (§11): one tree query, then ONE query per
 *     evidence table for the whole cohort; every per-topic and per-learner
 *     aggregate is grouped in memory. No per-learner or per-topic loop
 *     touches the database.
 *   THE ROSTER: `users.findEnabledByRole(STUDENT)` — ALL enabled students
 *     (identity projection ordered displayName asc, email asc). This surface
 *     predates class scoping: unlike the F-072 heatmap trio there is NO
 *     class-membership filter and NO classId parameter — only rootId
 *     (subject isolation).
 *   THE T-C11 PROJECTION (§ weakPrerequisites, the "12 skipped required-
 *     practical edges" fix): the settled store expresses prerequisites at
 *     concept level while class surfaces aggregate mastery per STRUCTURE
 *     node — a concept is never directly measured. Each concept-level
 *     prerequisite is projected onto the SpecificationPoint(s) that teach it
 *     via the concept's VALIDATED PART_OF anchor edges
 *     (conceptAnchorsWithin). Self-projections collapse (a node is not its
 *     own prerequisite); every projected pair is flagged `derived` with the
 *     concept codes that carry it; unmeasured prerequisites are never
 *     claimed weak.
 *   DETERMINISM: sorts are the frozen Comparators verbatim (learner rows:
 *     UNMEASURED last → mean asc → displayName case-folded; weak
 *     prerequisites: mean asc → dependents size desc → code; dependents by
 *     code; affected learners: reason → mastery(null→1.0) → displayName).
 *   SUBJECT ISOLATION: a topic outside the root's subtree is a 404
 *     ("curriculum topic in this subject") — never a silent cross-subject
 *     hop; the root node's own 404 is the tree read's (404-first).
 *   CLOCK (ADR-031 posture, disclosed): ONE `clock.now()` anchor per public
 *     call feeds the recent window, the due-review predicate and the BDT
 *     relaxation. The frozen calls `Instant.now()` per aggregate pass and
 *     per relaxed(m) row; the single anchor is the t1 trio's disclosed
 *     wire-invisible determinism posture (stale-relaxation differences of
 *     one instant are below the tau-day grain).
 */
import {
  KnowledgeNotFoundError,
  knowledgeTree,
  prerequisiteRelations,
  type ClassGraphEdgeView,
  type KnowledgeDeps,
  type NodeView,
} from "../knowledge";
import {
  LEARNER_ENGINE_PAPER_DEFAULTS,
  bandOf,
  relaxedToPrior,
  type LearnerDecayParams,
} from "../learner";
import { ServableQuestions } from "../questions";
import {
  conceptAnchorsWithin,
  prerequisiteChain,
  type KgEdgeRow,
} from "./kg";

// ── constants (ClassAnalyticsService :75-82) ─────────────────────────────────

/** read-model marker — the deterministic aggregation contract */
export const CLASS_ANALYTICS_POLICY = "class-analytics/v1";

export const RECENT_WINDOW_DAYS = 14;
export const WEAK_PREREQUISITE_CAP = 10;
export const WEAKEST_TOPICS_PER_LEARNER = 3;
export const MISCONCEPTION_SIGNALS_PER_LEARNER = 5;
export const DRILL_DOWN_EVIDENCE_CAP = 20;

// ── engine params (the SAME learner-facing tuning — no teacher variants) ─────

export type AnalyticsEngineParams = {
  /** the learner decay bands + BDT params (LearnerProperties) */
  decay: LearnerDecayParams;
  bdt: { prior: number; stalenessTauDays: number; activeThreshold: number };
  /** RecommendationProperties.weakMasteryCeiling */
  weakMasteryCeiling: number;
  /** RecommendationProperties.minAttemptsForWeakness */
  minAttemptsForWeakness: number;
};

export type AnalyticsDeps = KnowledgeDeps & { engine?: AnalyticsEngineParams };

const DAY_MS = 86_400_000;

const round4 = (v: number): number => Math.round(v * 10000.0) / 10000.0;
const mapDate = (v: unknown): Date => (v instanceof Date ? v : new Date(v as string));
const iso = (v: unknown): string => new Date(v as string | Date).toISOString();

// ── scope (Scope :337-346 + scope() + collect() :367-401) ────────────────────

type Scope = {
  rootId: string;
  rootCode: string;
  structureById: Map<string, NodeView>; // PART_OF nodes, curriculum order
  parentOf: Map<string, string>;
  misconceptionById: Map<string, NodeView>;
  misconceptionParentOf: Map<string, string>;
  misconceptionsOf: Map<string, NodeView[]>;
  structureIds: string[];
};

function collect(node: NodeView, parent: NodeView | null, scope: Scope): void {
  if (node.type === "MISCONCEPTION") {
    scope.misconceptionById.set(node.id, node);
    if (parent != null) {
      scope.misconceptionParentOf.set(node.id, parent.id);
      const list = scope.misconceptionsOf.get(parent.id) ?? [];
      list.push(node);
      scope.misconceptionsOf.set(parent.id, list);
    }
    return;
  }
  scope.structureById.set(node.id, node);
  if (parent != null) scope.parentOf.set(node.id, parent.id);
  for (const child of node.children ?? []) collect(child, node, scope);
}

async function scopeOf(deps: KnowledgeDeps, rootId: string): Promise<Scope> {
  // treeWithMisconceptions(:368) — the knowledge seam WITH the fold
  const tree = await knowledgeTree(deps, rootId, true);
  const scope: Scope = {
    rootId,
    rootCode: tree.code,
    structureById: new Map(),
    parentOf: new Map(),
    misconceptionById: new Map(),
    misconceptionParentOf: new Map(),
    misconceptionsOf: new Map(),
    structureIds: [],
  };
  collect(tree, null, scope);
  scope.structureIds = [...scope.structureById.keys()];
  return scope;
}

// ── evidence rows (thin sql shapes) ──────────────────────────────────────────

export type SkillStateRow = {
  learner_id: string;
  node_id: string;
  mastery: number;
  attempts: number;
  correct_count: number;
};

export type MisconceptionStateRow = {
  learner_id: string;
  misconception_node_id: string;
  probability: number;
  evidence_count: number;
  last_evidence_at: string | Date;
};

export type TutorEngagementRow = {
  learner_id: string;
  node_id: string;
  signal_type: string;
  occurred_at: string | Date;
};

export type DueReviewRow = {
  learner_id: string;
  node_id: string;
};

type Aggregates = {
  skills: SkillStateRow[];
  misconceptions: MisconceptionStateRow[];
  engagements: TutorEngagementRow[];
  dueReviews: DueReviewRow[];
  recentByLearner: Map<string, { attempts: number; correct: number }>;
  lastActivityByLearner: Map<string, string>;
  recentTotal: number;
  windowStart: string;
  servableByPrimaryTopic: Map<string, number>;
  byTopic: Map<string, { learnersMeasured: number; meanMastery: number; attempts: number; states: SkillStateRow[] }>;
};

async function aggregatesOf(
  deps: AnalyticsDeps,
  scope: Scope,
  now: Date,
): Promise<Aggregates> {
  const ids = scope.structureIds;
  const miscoIds = [...scope.misconceptionById.keys()];

  // ONE query per evidence table, whole cohort (§11) — the frozen repository
  // queries verbatim, IN-bind via any(${}::uuid[])
  const skills = ids.length
    ? ((await deps.sql`
      select learner_id, node_id, mastery, attempts, correct_count from skill_states
      where node_id = any(${ids}::uuid[])`) as SkillStateRow[])
    : [];
  const misconceptions = miscoIds.length
    ? ((await deps.sql`
      select learner_id, misconception_node_id, probability, evidence_count, last_evidence_at
      from misconception_states
      where misconception_node_id = any(${miscoIds}::uuid[])`) as MisconceptionStateRow[])
    : [];
  const engagements = ids.length
    ? ((await deps.sql`
      select learner_id, node_id, signal_type, occurred_at from tutor_topic_engagements
      where node_id = any(${ids}::uuid[])`) as TutorEngagementRow[])
    : [];
  const dueReviews = ids.length
    ? ((await deps.sql`
      select learner_id, node_id from review_schedules
      where status = 'PENDING' and due_at <= ${now.toISOString()}::timestamptz
        and node_id = any(${ids}::uuid[])`) as DueReviewRow[])
    : [];

  const windowStart = new Date(now.getTime() - RECENT_WINDOW_DAYS * DAY_MS);
  const recentByLearner = new Map<string, { attempts: number; correct: number }>();
  const lastActivityByLearner = new Map<string, string>();
  let recentTotal = 0;
  if (ids.length) {
    // attempts.aggregateByLearnerSinceWithin (AttemptRepository :100-116)
    const rows = (await deps.sql`
      select a.learner_id as learner_id,
             count(*) as total,
             sum(case when a.correct then 1 else 0 end) as correct,
             max(a.created_at) as last_activity
      from attempts a
      join questions q on q.id = a.question_id
      where a.created_at >= ${windowStart.toISOString()}::timestamptz
        and (q.primary_topic_node_id = any(${ids}::uuid[]) or exists (
          select 1 from question_topics qt
          where qt.question_id = q.id and qt.node_id = any(${ids}::uuid[])))
      group by a.learner_id`) as Array<{
      learner_id: string;
      total: number | string;
      correct: number | string | null;
      last_activity: string | Date;
    }>;
    for (const r of rows) {
      const total = Number(r.total);
      recentByLearner.set(r.learner_id, { attempts: total, correct: Number(r.correct ?? 0) });
      lastActivityByLearner.set(r.learner_id, iso(r.last_activity));
      recentTotal += total;
    }
  }

  const servableByPrimaryTopic = new Map<string, number>();
  if (ids.length) {
    // servableQuestions.activeWithin(:427-431) — primary-topic rollup
    const servable = new ServableQuestions(deps.sql);
    for (const q of await servable.activeWithin(ids)) {
      if (q.primaryTopicNodeId != null) {
        servableByPrimaryTopic.set(
          q.primaryTopicNodeId,
          (servableByPrimaryTopic.get(q.primaryTopicNodeId) ?? 0) + 1,
        );
      }
    }
  }

  // the in-memory per-topic rollup (:433-445) — RAW stored mastery, 4-dp
  const byNode = new Map<string, SkillStateRow[]>();
  for (const s of skills) {
    const list = byNode.get(s.node_id) ?? [];
    list.push(s);
    byNode.set(s.node_id, list);
  }
  const byTopic = new Map<string, { learnersMeasured: number; meanMastery: number; attempts: number; states: SkillStateRow[] }>();
  for (const [nodeId, states] of byNode) {
    const total = states.reduce((acc, s) => acc + Number(s.mastery), 0);
    byTopic.set(nodeId, {
      learnersMeasured: states.length,
      meanMastery: round4(total / states.length),
      attempts: states.reduce((acc, s) => acc + Number(s.attempts), 0),
      states,
    });
  }

  return {
    skills,
    misconceptions,
    engagements,
    dueReviews,
    recentByLearner,
    lastActivityByLearner,
    recentTotal,
    windowStart: windowStart.toISOString(),
    servableByPrimaryTopic,
    byTopic,
  };
}

// ── user cohort (users.findEnabledByRole(STUDENT) :130 + :184) ───────────────

export type AnalyticsUserRow = {
  id: string;
  display_name: string;
  created_at: string | Date;
};

async function enabledStudents(deps: KnowledgeDeps): Promise<AnalyticsUserRow[]> {
  // UserRepository :25-28 — displayName asc, email asc
  return (await deps.sql`
    select u.id, u.display_name, u.created_at
    from users u
    join user_roles r on r.user_id = u.id
    where r.role = 'STUDENT' and u.enabled = true
    group by u.id, u.display_name, u.created_at
    order by u.display_name asc, u.email asc`) as AnalyticsUserRow[];
}

async function namesFor(deps: KnowledgeDeps, ids: Iterable<string>): Promise<Map<string, string>> {
  const list = [...ids];
  const names = new Map<string, string>();
  if (list.length === 0) return names;
  const rows = (await deps.sql`
    select id, display_name from users where id = any(${list}::uuid[])`) as Array<{
    id: string;
    display_name: string;
  }>;
  for (const r of rows) names.set(r.id, r.display_name);
  return names;
}

// ── the topic aggregate (one heatmap cell :452-489) ──────────────────────────

function topicAggregate(
  node: NodeView,
  scope: Scope,
  agg: Aggregates,
  engine: AnalyticsEngineParams,
  now: Date,
): TopicAggregate {
  const t = agg.byTopic.get(node.id);
  const learnersMeasured = t == null ? 0 : t.learnersMeasured;
  const meanMastery = t == null || t.learnersMeasured === 0 ? null : t.meanMastery;

  // active misconception signals attached under this topic (BDT estimates)
  const affectedLearners = new Set<string>();
  let activeSignals = 0;
  for (const misco of scope.misconceptionsOf.get(node.id) ?? []) {
    for (const m of agg.misconceptions) {
      if (m.misconception_node_id === misco.id) {
        const relaxed = relaxedToPrior(
          Number(m.probability),
          engine.bdt.prior,
          mapDate(m.last_evidence_at),
          now,
          engine.bdt.stalenessTauDays,
        );
        if (relaxed >= engine.bdt.activeThreshold) {
          activeSignals++;
          affectedLearners.add(m.learner_id);
        }
      }
    }
  }

  const engagementCount = agg.engagements.filter((e) => e.node_id === node.id).length;
  const due = agg.dueReviews.filter((r) => r.node_id === node.id).length;

  const parentId = scope.parentOf.get(node.id);
  const parent = parentId == null ? null : scope.structureById.get(parentId) ?? null;

  return {
    nodeId: node.id,
    code: node.code,
    title: node.title,
    parentCode: parent == null ? null : parent.code,
    parentTitle: parent == null ? null : parent.title,
    learnersMeasured,
    meanMastery,
    masteryBand: meanMastery == null ? "UNMEASURED" : bandOf(meanMastery, engine.decay),
    evidenceBackedAttempts: t == null ? 0 : t.attempts,
    learnersWithActiveMisconception: affectedLearners.size,
    activeMisconceptionSignals: activeSignals,
    tutorEngagements: engagementCount,
    dueReviews: due,
    servableQuestions: agg.servableByPrimaryTopic.get(node.id) ?? 0,
  };
}

// ── weak prerequisites (the T-C11 projection :513-583) ───────────────────────

type Dependent = {
  nodeId: string;
  code: string;
  title: string;
  meanMastery: number | null;
};

type WeakPrerequisite = {
  prerequisiteNodeId: string;
  prerequisiteCode: string;
  prerequisiteTitle: string;
  learnersMeasured: number;
  meanMastery: number | null;
  masteryBand: string;
  dependents: Dependent[];
  derived: boolean;
  derivedViaConceptCodes: string[];
};

async function weakPrerequisites(
  deps: AnalyticsDeps,
  scope: Scope,
  agg: Aggregates,
  engine: AnalyticsEngineParams,
): Promise<WeakPrerequisite[]> {
  const weakCeiling = engine.weakMasteryCeiling;

  // concept → anchor SpecificationPoints (validated V15 anchor edges, :518-522)
  const anchorsByConcept = new Map<string, KgEdgeRow[]>();
  for (const anchor of await conceptAnchorsWithin(deps, scope.rootId)) {
    const list = anchorsByConcept.get(anchor.source_node_id) ?? [];
    list.push(anchor);
    anchorsByConcept.set(anchor.source_node_id, list);
  }

  // group dependent relations under their structure-level prerequisite:
  // a concept prerequisite projects onto each of its anchor SPs; a direct
  // structure-level prerequisite passes through as-is (:528-548)
  const dependentsOf = new Map<string, Array<{ prerequisiteId: string; nodeId: string }>>();
  const derivedVia = new Map<string, Set<string>>();
  // prerequisiteRelations — the SAME drawable-relation derivation the t1
  // heatmap uses (exported reuse). The registry passed is scope.structureById
  // — the FULL non-MISCONCEPTION subtree INCLUDING CONCEPT nodes (concepts
  // anchor via PART_OF, so the CTE contains them and collect() keeps them),
  // which is exactly what lets the concept-level relations through to the
  // projection (the frozen :246-262 resolves no registry at all — raw pairs;
  // the t1 function resolves codes and the full registry means zero drops).
  const relations: ClassGraphEdgeView[] = await prerequisiteRelations(deps, scope.rootId, null, scope.structureById);
  for (const r of relations) {
    const conceptAnchors = anchorsByConcept.get(r.prerequisiteId);
    if (conceptAnchors == null || conceptAnchors.length === 0) {
      const list = dependentsOf.get(r.prerequisiteId) ?? [];
      list.push(r);
      dependentsOf.set(r.prerequisiteId, list);
      continue;
    }
    const conceptCode = conceptAnchors[0]!.source_code;
    for (const anchor of conceptAnchors) {
      const anchorSpId = anchor.target_node_id;
      if (anchorSpId === r.nodeId) continue; // self-projection collapse
      const list = dependentsOf.get(anchorSpId) ?? [];
      list.push(r);
      dependentsOf.set(anchorSpId, list);
      const via = derivedVia.get(anchorSpId) ?? new Set<string>();
      via.add(conceptCode);
      derivedVia.set(anchorSpId, via);
    }
  }

  const weak: WeakPrerequisite[] = [];
  for (const [prerequisiteId, rels] of dependentsOf) {
    const t = agg.byTopic.get(prerequisiteId);
    const node = scope.structureById.get(prerequisiteId);
    if (node == null || t == null || t.learnersMeasured === 0 || t.meanMastery >= weakCeiling) {
      continue; // unmeasured prerequisites are never claimed weak (:555-558)
    }
    const dependents: Dependent[] = [];
    for (const r of rels) {
      const d = scope.structureById.get(r.nodeId);
      if (d == null) continue;
      const dt = agg.byTopic.get(d.id);
      dependents.push({
        nodeId: d.id,
        code: d.code,
        title: d.title,
        meanMastery: dt == null || dt.learnersMeasured === 0 ? null : dt.meanMastery,
      });
    }
    dependents.sort((a, b) => a.code.localeCompare(b.code));
    const derived = derivedVia.has(prerequisiteId);
    const via = derived ? [...derivedVia.get(prerequisiteId)!].sort() : [];
    weak.push({
      prerequisiteNodeId: node.id,
      prerequisiteCode: node.code,
      prerequisiteTitle: node.title,
      learnersMeasured: t.learnersMeasured,
      meanMastery: t.meanMastery,
      masteryBand: bandOf(t.meanMastery, engine.decay),
      dependents,
      derived,
      derivedViaConceptCodes: via,
    });
  }
  weak.sort(
    (a, b) =>
      (a.meanMastery ?? 0) - (b.meanMastery ?? 0) ||
      b.dependents.length - a.dependents.length ||
      a.prerequisiteCode.localeCompare(b.prerequisiteCode),
  );
  return weak.slice(0, WEAK_PREREQUISITE_CAP);
}

// ── the learner row (:585-651) ───────────────────────────────────────────────

type TopicMastery = {
  nodeId: string;
  code: string;
  title: string;
  mastery: number;
  band: string;
  attempts: number;
};

type MisconceptionSignal = {
  misconceptionNodeId: string;
  code: string;
  title: string;
  probability: number;
  evidenceCount: number;
  parentTopicNodeId: string | null;
  parentTopicCode: string | null;
};

type ClassLearnerRow = {
  learnerId: string;
  displayName: string;
  createdAt: string;
  evidenceState: "MEASURED" | "UNMEASURED";
  topicsMeasured: number;
  meanMastery: number | null;
  evidenceBackedAttempts: number;
  recentAttempts: number;
  recentCorrect: number;
  lastActivityAt: string | null;
  weakestTopics: TopicMastery[];
  activeMisconceptions: number;
  misconceptionSignals: MisconceptionSignal[];
  tutorEngagements: number;
  tutorSignalCounts: Record<string, number>;
  lastTutorEngagementAt: string | null;
  dueReviews: number;
};

function learnerRow(
  u: AnalyticsUserRow,
  scope: Scope,
  agg: Aggregates,
  skillsByLearner: Map<string, SkillStateRow[]>,
  miscoByLearner: Map<string, MisconceptionStateRow[]>,
  engagementByLearner: Map<string, TutorEngagementRow[]>,
  dueByLearner: Map<string, number>,
  engine: AnalyticsEngineParams & { now: Date },
): ClassLearnerRow {
  const learnerSkills = skillsByLearner.get(u.id) ?? [];
  const learnerMisco = miscoByLearner.get(u.id) ?? [];
  const learnerEngagements = engagementByLearner.get(u.id) ?? [];

  const meanMastery =
    learnerSkills.length === 0
      ? null
      : round4(learnerSkills.reduce((acc, s) => acc + Number(s.mastery), 0) / learnerSkills.length);
  const attemptsTotal = learnerSkills.reduce((acc, s) => acc + Number(s.attempts), 0);

  // weakest measured topics (same evidence floor as NBA weakness advice, :600-612)
  const weakest: TopicMastery[] = learnerSkills
    .filter((s) => Number(s.attempts) >= engine.minAttemptsForWeakness)
    .sort((a, b) => Number(a.mastery) - Number(b.mastery))
    .slice(0, WEAKEST_TOPICS_PER_LEARNER)
    .map((s) => {
      const n = scope.structureById.get(s.node_id);
      return {
        nodeId: s.node_id,
        code: n == null ? "?" : n.code,
        title: n == null ? "?" : n.title,
        mastery: round4(Number(s.mastery)),
        band: bandOf(Number(s.mastery), engine.decay),
        attempts: Number(s.attempts),
      };
    });

  // active misconception signals, strongest first (BDT estimates, :614-629)
  const signals: MisconceptionSignal[] = learnerMisco
    .map((m) => ({
      m,
      relaxed: relaxedToPrior(
        Number(m.probability),
        engine.bdt.prior,
        mapDate(m.last_evidence_at),
        engine.now,
        engine.bdt.stalenessTauDays,
      ),
    }))
    .filter((x) => x.relaxed >= engine.bdt.activeThreshold)
    .sort((a, b) => b.relaxed - a.relaxed)
    .slice(0, MISCONCEPTION_SIGNALS_PER_LEARNER)
    .map(({ m, relaxed }) => {
      const n = scope.misconceptionById.get(m.misconception_node_id);
      const parentTopic = scope.misconceptionParentOf.get(m.misconception_node_id) ?? null;
      const p = parentTopic == null ? null : scope.structureById.get(parentTopic) ?? null;
      return {
        misconceptionNodeId: m.misconception_node_id,
        code: n == null ? "?" : n.code,
        title: n == null ? "?" : n.title,
        probability: round4(relaxed),
        evidenceCount: Number(m.evidence_count),
        parentTopicNodeId: parentTopic,
        parentTopicCode: p == null ? null : p.code,
      };
    });

  const signalCounts: Record<string, number> = {};
  for (const e of learnerEngagements) {
    signalCounts[e.signal_type] = (signalCounts[e.signal_type] ?? 0) + 1;
  }
  const lastEngagement = learnerEngagements
    .map((e) => mapDate(e.occurred_at).getTime())
    .reduce<number | null>((acc, t) => (acc == null || t > acc ? t : acc), null);

  const recent = agg.recentByLearner.get(u.id) ?? { attempts: 0, correct: 0 };

  const measured =
    learnerSkills.length > 0 || learnerMisco.length > 0 || learnerEngagements.length > 0;

  return {
    learnerId: u.id,
    displayName: u.display_name,
    createdAt: iso(u.created_at),
    evidenceState: measured ? "MEASURED" : "UNMEASURED",
    topicsMeasured: learnerSkills.length,
    meanMastery,
    evidenceBackedAttempts: attemptsTotal,
    recentAttempts: recent.attempts,
    recentCorrect: recent.correct,
    lastActivityAt: agg.lastActivityByLearner.get(u.id) ?? null,
    weakestTopics: weakest,
    activeMisconceptions: signals.length,
    misconceptionSignals: signals,
    tutorEngagements: learnerEngagements.length,
    tutorSignalCounts: signalCounts,
    lastTutorEngagementAt: lastEngagement == null ? null : new Date(lastEngagement).toISOString(),
    dueReviews: dueByLearner.get(u.id) ?? 0,
  };
}

// ── affected learners (:653-705) ─────────────────────────────────────────────

type AffectedLearner = {
  learnerId: string;
  displayName: string;
  mastery: number | null;
  reason: "LOW_MASTERY_AND_ACTIVE_MISCONCEPTION" | "LOW_MASTERY" | "ACTIVE_MISCONCEPTION";
  misconceptions: MisconceptionSignal[];
};

function affectedLearners(
  topic: NodeView,
  scope: Scope,
  agg: Aggregates,
  engine: AnalyticsEngineParams & { now: Date },
): AffectedLearner[] {
  const weakCeiling = engine.weakMasteryCeiling;
  const minAttempts = engine.minAttemptsForWeakness;
  const masteryOf = new Map<string, number>();
  const signalsOf = new Map<string, MisconceptionSignal[]>();
  const t = agg.byTopic.get(topic.id);
  if (t != null) {
    for (const s of t.states) {
      if (Number(s.attempts) >= minAttempts && Number(s.mastery) < weakCeiling) {
        masteryOf.set(s.learner_id, round4(Number(s.mastery)));
      }
    }
  }
  for (const misco of scope.misconceptionsOf.get(topic.id) ?? []) {
    for (const m of agg.misconceptions) {
      if (m.misconception_node_id === misco.id) {
        const relaxed = relaxedToPrior(
          Number(m.probability),
          engine.bdt.prior,
          mapDate(m.last_evidence_at),
          engine.now,
          engine.bdt.stalenessTauDays,
        );
        if (relaxed >= engine.bdt.activeThreshold) {
          const list = signalsOf.get(m.learner_id) ?? [];
          list.push({
            misconceptionNodeId: m.misconception_node_id,
            code: misco.code,
            title: misco.title,
            probability: round4(relaxed),
            evidenceCount: Number(m.evidence_count),
            parentTopicNodeId: topic.id,
            parentTopicCode: topic.code,
          });
          signalsOf.set(m.learner_id, list);
        }
      }
    }
  }
  const ids = new Set<string>([...masteryOf.keys(), ...signalsOf.keys()]);
  if (ids.size === 0) return [];
  const affected: AffectedLearner[] = [];
  for (const id of ids) {
    const weak = masteryOf.has(id);
    const misco = signalsOf.has(id);
    affected.push({
      learnerId: id,
      // names resolve below via one batched user lookup (namesFor)
      displayName: "",
      mastery: masteryOf.get(id) ?? null,
      reason:
        weak && misco
          ? "LOW_MASTERY_AND_ACTIVE_MISCONCEPTION"
          : weak
            ? "LOW_MASTERY"
            : "ACTIVE_MISCONCEPTION",
      misconceptions: signalsOf.get(id) ?? [],
    });
  }
  return affected;
}

// ── representative evidence (:707-728) ───────────────────────────────────────

type EvidenceItem = {
  attemptId: string;
  learnerId: string;
  learnerDisplayName: string;
  questionId: string;
  questionRef: string | null;
  correct: boolean;
  marksAwarded: number | null;
  questionMarks: number;
  markingState: string;
  createdAt: string;
};

async function representativeEvidence(
  deps: KnowledgeDeps,
  nodeId: string,
): Promise<EvidenceItem[]> {
  // attempts.findRecentByTopicNode(:126-133) — primary topic OR question_topics
  const rows = (await deps.sql`
    select a.id as attempt_id, a.learner_id, a.correct, a.marks_awarded,
           a.marking_state, a.created_at,
           q.id as question_id, q.external_ref, q.marks as question_marks
    from attempts a
    join questions q on q.id = a.question_id
    where q.primary_topic_node_id = ${nodeId}::uuid or exists (
        select 1 from question_topics qt
        where qt.question_id = a.question_id and qt.node_id = ${nodeId}::uuid)
    order by a.created_at desc
    limit ${DRILL_DOWN_EVIDENCE_CAP}`) as Array<{
    attempt_id: string;
    learner_id: string;
    correct: boolean;
    marks_awarded: number | null;
    marking_state: string;
    created_at: string | Date;
    question_id: string;
    external_ref: string | null;
    question_marks: number;
  }>;
  if (rows.length === 0) return [];
  const names = await namesFor(deps, rows.map((r) => r.learner_id));
  return rows.map((r) => ({
    attemptId: r.attempt_id,
    learnerId: r.learner_id,
    learnerDisplayName: names.get(r.learner_id) ?? "unknown",
    questionId: r.question_id,
    questionRef: r.external_ref,
    correct: r.correct === true,
    marksAwarded: r.marks_awarded == null ? null : Number(r.marks_awarded),
    questionMarks: Number(r.question_marks),
    markingState: r.marking_state,
    createdAt: iso(r.created_at),
  }));
}

// ── the endpoints ────────────────────────────────────────────────────────────

const engineOf = (deps: AnalyticsDeps): AnalyticsEngineParams & { now: Date } => {
  const now = deps.clock.now();
  // the SAME engine numbers the learner surfaces use (LEARNER_ENGINE_PAPER_DEFAULTS
  // — no teacher-specific tuning, § read-only-by-construction)
  return {
    decay: deps.engine?.decay ?? LEARNER_ENGINE_PAPER_DEFAULTS.decay,
    bdt: deps.engine?.bdt ?? LEARNER_ENGINE_PAPER_DEFAULTS.bdt,
    weakMasteryCeiling: deps.engine?.weakMasteryCeiling ?? 0.5,
    minAttemptsForWeakness: deps.engine?.minAttemptsForWeakness ?? 3,
    now,
  };
};

type TopicAggregate = {
  nodeId: string;
  code: string;
  title: string;
  parentCode: string | null;
  parentTitle: string | null;
  learnersMeasured: number;
  meanMastery: number | null;
  masteryBand: string;
  evidenceBackedAttempts: number;
  learnersWithActiveMisconception: number;
  activeMisconceptionSignals: number;
  tutorEngagements: number;
  dueReviews: number;
  servableQuestions: number;
};

/** §2 class overview — ClassOverviewView (:126-159). */
export async function classOverview(
  deps: AnalyticsDeps,
  rootId: string,
): Promise<{
  rootId: string;
  rootCode: string;
  policy: string;
  enrolledLearners: number;
  learnersWithEvidence: number;
  learnersRecentlyActive: number;
  totalTopics: number;
  measuredTopics: number;
  topics: TopicAggregate[];
  weakPrerequisites: WeakPrerequisite[];
  recentActivity: {
    recentAttempts: number;
    learnersActive: number;
    tutorAsks: number;
    structuredAnswersPendingMarking: number;
    windowStart: string;
  };
}> {
  const engine = engineOf(deps);
  const scope = await scopeOf(deps, rootId);
  const agg = await aggregatesOf(deps, scope, engine.now);

  const roster = await enabledStudents(deps);

  const topics = [...scope.structureById.values()].map((node) =>
    topicAggregate(node, scope, agg, engine, engine.now),
  );

  const weak = await weakPrerequisites(deps, scope, agg, engine);

  const withEvidence = new Set<string>();
  for (const s of agg.skills) withEvidence.add(s.learner_id);
  for (const m of agg.misconceptions) withEvidence.add(m.learner_id);
  for (const e of agg.engagements) withEvidence.add(e.learner_id);

  const measuredTopics = topics.filter((t) => t.learnersMeasured > 0).length;

  // answers.countByMarkingStateWithin(PENDING, structureIds) (:156-157) —
  // skipped entirely on an empty tree (the frozen IN () empty-list semantics)
  const pending = scope.structureIds.length
    ? Number(
        (
          (await deps.sql`
      select count(*) as n
      from answers a
      join attempts at on at.id = a.attempt_id
      join questions q on q.id = at.question_id
      where a.marking_state = 'PENDING'
        and (q.primary_topic_node_id = any(${scope.structureIds}::uuid[]) or exists (
          select 1 from question_topics qt
          where qt.question_id = q.id and qt.node_id = any(${scope.structureIds}::uuid[])))`) as Array<{ n: number | string }>
        )[0]!.n,
      )
    : 0;

  return {
    rootId,
    rootCode: scope.rootCode,
    policy: CLASS_ANALYTICS_POLICY,
    enrolledLearners: roster.length,
    learnersWithEvidence: withEvidence.size,
    learnersRecentlyActive: agg.recentByLearner.size,
    totalTopics: scope.structureById.size,
    measuredTopics,
    topics,
    weakPrerequisites: weak,
    recentActivity: {
      recentAttempts: agg.recentTotal,
      learnersActive: agg.recentByLearner.size,
      tutorAsks: agg.engagements.length,
      structuredAnswersPendingMarking: pending,
      windowStart: agg.windowStart,
    },
  };
}

/** §2 learner list — ClassLearnerView rows (:163-195). */
export async function classLearners(
  deps: AnalyticsDeps,
  rootId: string,
): Promise<ClassLearnerRow[]> {
  const engine = engineOf(deps);
  const scope = await scopeOf(deps, rootId);
  const agg = await aggregatesOf(deps, scope, engine.now);

  const skillsByLearner = new Map<string, SkillStateRow[]>();
  for (const s of agg.skills) {
    const list = skillsByLearner.get(s.learner_id) ?? [];
    list.push(s);
    skillsByLearner.set(s.learner_id, list);
  }
  const miscoByLearner = new Map<string, MisconceptionStateRow[]>();
  for (const m of agg.misconceptions) {
    const list = miscoByLearner.get(m.learner_id) ?? [];
    list.push(m);
    miscoByLearner.set(m.learner_id, list);
  }
  const engagementByLearner = new Map<string, TutorEngagementRow[]>();
  for (const e of agg.engagements) {
    const list = engagementByLearner.get(e.learner_id) ?? [];
    list.push(e);
    engagementByLearner.set(e.learner_id, list);
  }
  const dueByLearner = new Map<string, number>();
  for (const r of agg.dueReviews) {
    dueByLearner.set(r.learner_id, (dueByLearner.get(r.learner_id) ?? 0) + 1);
  }

  const rows: ClassLearnerRow[] = [];
  for (const u of await enabledStudents(deps)) {
    rows.push(
      learnerRow(u, scope, agg, skillsByLearner, miscoByLearner, engagementByLearner, dueByLearner, engine),
    );
  }
  // deterministic order (:188-193): measured learners first, weakest mean
  // mastery first (the teacher's attention queue), then unmeasured by name
  rows.sort((a, b) => {
    const aUn = a.evidenceState === "UNMEASURED" ? 1 : 0;
    const bUn = b.evidenceState === "UNMEASURED" ? 1 : 0;
    if (aUn !== bUn) return aUn - bUn;
    const am = a.meanMastery ?? 0.0;
    const bm = b.meanMastery ?? 0.0;
    if (am !== bm) return am - bm;
    return a.displayName.toLowerCase().localeCompare(b.displayName.toLowerCase());
  });
  return rows;
}

/** §5 topic drill-down — TopicDrillDownView (:199-232). */
export async function topicDrillDown(
  deps: AnalyticsDeps,
  rootId: string,
  nodeId: string,
): Promise<{
  rootId: string;
  topic: TopicAggregate;
  prerequisiteChain: Array<{
    nodeId: string;
    code: string;
    title: string;
    depth: number;
    learnersMeasured: number;
    meanMastery: number | null;
    masteryBand: string;
  }>;
  affectedLearners: AffectedLearner[];
  representativeEvidence: EvidenceItem[];
  servableQuestions: Array<{
    id: string;
    externalRef: string | null;
    type: string;
    marks: number;
    difficulty: number;
  }>;
}> {
  const engine = engineOf(deps);
  const scope = await scopeOf(deps, rootId);
  const topic = scope.structureById.get(nodeId);
  if (topic == null) {
    // hard subject isolation (:202-205): a topic outside this root is a 404
    throw new KnowledgeNotFoundError(
      "curriculum topic in this subject not found: " + nodeId,
    );
  }
  const agg = await aggregatesOf(deps, scope, engine.now);

  const aggregate = topicAggregate(topic, scope, agg, engine, engine.now);

  // prerequisite chain with the class-level mastery per link (:210-221)
  // (KG direction: dependent → prerequisite; the chain lists prerequisites)
  const chain: Array<{
    nodeId: string;
    code: string;
    title: string;
    depth: number;
    learnersMeasured: number;
    meanMastery: number | null;
    masteryBand: string;
  }> = [];
  for (const p of await prerequisiteChain(deps, nodeId)) {
    const t = agg.byTopic.get(p.id);
    chain.push({
      nodeId: p.id,
      code: p.code,
      title: p.title,
      depth: p.depth,
      learnersMeasured: t == null ? 0 : t.learnersMeasured,
      meanMastery: t == null || t.learnersMeasured === 0 ? null : t.meanMastery,
      masteryBand:
        t == null || t.learnersMeasured === 0 ? "UNMEASURED" : bandOf(t.meanMastery, engine.decay),
    });
  }

  const affected = affectedLearners(topic, scope, agg, engine);
  if (affected.length > 0) {
    const names = await namesFor(deps, affected.map((a) => a.learnerId));
    for (const a of affected) a.displayName = names.get(a.learnerId) ?? "unknown";
    // reason → mastery(null→1.0) → displayName case-folded (:700-703)
    affected.sort(
      (a, b) =>
        a.reason.localeCompare(b.reason) ||
        (a.mastery ?? 1.0) - (b.mastery ?? 1.0) ||
        a.displayName.toLowerCase().localeCompare(b.displayName.toLowerCase()),
    );
  }

  const evidence = await representativeEvidence(deps, nodeId);

  const servable = new ServableQuestions(deps.sql);
  const servableRefs = (await servable.activeByTopic(nodeId)).map((q) => ({
    id: q.id,
    externalRef: q.externalRef,
    type: q.type,
    marks: q.marks,
    difficulty: q.difficulty,
  }));

  return {
    rootId,
    topic: aggregate,
    prerequisiteChain: chain,
    affectedLearners: affected,
    representativeEvidence: evidence,
    servableQuestions: servableRefs,
  };
}

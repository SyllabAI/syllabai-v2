/**
 * Test-builder service — faithful port of TestBuilderService.java
 * (syllabai-core @ 6cad6ef, frozen; T-MIG-034). DETERMINISTIC surface →
 * the normal golden path (the four R6 captures are the standing gate; the
 * port is capture-ready for future full-body captures).
 *
 * Ported laws (frozen source line refs in the javadocs below):
 *   - assembly through the ONE serving boundary (ServableQuestions — the
 *     T-MIG-031 port of ServableQuestionService), so a generated test can
 *     never contain SUGGESTED/FLAGGED/REJECTED content;
 *   - subject isolation: only topics inside the root's PART_OF subtree are
 *     honoured (subtreeIds + per-topic node lookup, 404 on unknown root);
 *   - first-selected-topic-wins attribution (LinkedHashMap putIfAbsent);
 *   - difficulty-then-id deterministic ordering;
 *   - selectByMarks: no target → first cap in difficulty order; with a
 *     target → greedy in difficulty order while it fits, then repeatedly
 *     add the candidate landing closest to the target, but ONLY when the
 *     addition is strictly closer than stopping short (honest undershoot
 *     beats overshoot for its own sake); the cap ALWAYS applies;
 *   - clamps: maxQuestions 1..50 (default 20), targetMarks 1..200;
 *   - per-topic availability BEFORE the cap (the honest number);
 *   - answer key: includeAnswers && STRUCTURED only, current version
 *     (version desc), current scheme (created_at desc), schemeState
 *     reported — the teacher knows what they are printing;
 *   - weakness options: class-evidence derivation with EXPLICIT reasons
 *     (LOW_MEAN_MASTERY / ACTIVE_MISCONCEPTION_PRESENT /
 *     BLOCKED_BY_WEAK_PREREQUISITE), no composite score, unmeasured topics
 *     NEVER claimed weak (coverage gaps with servable content only),
 *     targeting counts via the /preview assembly rule (primary + secondary
 *     mappings, batched), deterministic ordering meanMastery asc (nulls
 *     last) → learnersWithActiveMisconception desc → code asc.
 *
 * The ClassAnalyticsService.overview dependency is UNPORTED in v2 (not
 * T-MIG-033's surface — that is teachermarking/sme). The selection law is
 * ported here behind the ClassAnalyticsPort seam; the route honest-501s
 * until R0 routes the analytics port (no self-filing per the round-6 rule).
 */
import type { StudentQuestionView } from "@syllabai/contracts";
import type { ServableQuestions } from "../questions/servable";
import type { SqlFn } from "../questions/sql";
import { NotFoundException } from "../identity/errors";
import {
  findNode,
  findQuestionTopicsIn,
  findSchemeWithPoints,
  findSubtreeIds,
  findVersionsByQuestionDesc,
  type KnowledgeNodeRow,
} from "./sql";
import type {
  TestAnswerView,
  TestPreviewView,
  TestQuestionView,
  TopicCoverage,
  WeaknessOptionsView,
} from "@syllabai/contracts";

/** Weak-selection ceiling — RecommendationProperties.weakMasteryCeiling default 0.45 ("matches decay LOW band ceiling"; ≤0 resets to 0.45 in the frozen config too). */
export const WEAK_MASTERY_CEILING_DEFAULT = 0.45;

export const WEAKNESS_POLICY = "test-builder-weakness/v1";

const DEFAULT_MAX = 20;
const HARD_MAX = 50;
const HARD_MAX_MARKS = 200;

/** The slice of ClassAnalyticsService.TopicAggregateView weaknessOptions consumes. */
export interface TopicAggregate {
  nodeId: string;
  code: string;
  title: string;
  learnersMeasured: number;
  meanMastery: number | null;
  masteryBand: string | null;
  learnersWithActiveMisconception: number;
  activeMisconceptionSignals: number;
  evidenceBackedAttempts: number;
  tutorEngagements: number;
  dueReviews: number;
}

/**
 * The slice of ClassAnalyticsService.ClassOverviewView weaknessOptions
 * consumes. The future analytics port satisfies this structurally — the
 * full view (rootCode, policy, recentActivity, …) may carry more.
 */
export interface ClassAnalyticsPort {
  overview(rootId: string): Promise<{
    enrolledLearners: number;
    learnersWithEvidence: number;
    topics: TopicAggregate[];
    weakPrerequisites: Array<{
      prerequisiteCode: string;
      dependents: Array<{ nodeId: string }>;
    }>;
  }>;
}

export interface TestBuilderModule {
  servable: ServableQuestions;
  sql: SqlFn;
  analytics: ClassAnalyticsPort | null;
  weakMasteryCeiling: number;
}

/** TestBuilderService.selectByMarks — verbatim deterministic selection. */
export function selectByMarks(
  ordered: StudentQuestionView[],
  cap: number,
  target: number | null,
): StudentQuestionView[] {
  if (target === null) {
    return ordered.slice(0, cap);
  }
  const remaining = [...ordered];
  const chosen: StudentQuestionView[] = [];
  let total = 0;
  for (const q of ordered) {
    if (chosen.length >= cap || remaining.length === 0) break;
    if (total + q.marks <= target) {
      chosen.push(q);
      remaining.splice(remaining.indexOf(q), 1);
      total += q.marks;
    }
  }
  while (total < target && chosen.length < cap && remaining.length > 0) {
    let best: StudentQuestionView | null = null;
    let bestDistance = Number.MAX_SAFE_INTEGER; // Java Integer.MAX_VALUE
    for (const q of remaining) {
      const distance = Math.abs(total + q.marks - target);
      if (distance < bestDistance) {
        best = q;
        bestDistance = distance;
      }
    }
    if (best === null) break;
    // add only when the addition lands strictly closer to the target than
    // stopping short — overshooting for its own sake is worse than an
    // honest undershoot (TestBuilderService.java:345-349)
    if (bestDistance >= target - total) break;
    chosen.push(best);
    remaining.splice(remaining.indexOf(best), 1);
    total += best.marks;
  }
  return chosen;
}

export class TestBuilder {
  constructor(private readonly deps: TestBuilderModule) {}

  /**
   * TestBuilderService.preview(rootId, topicNodeIds, maxQuestions,
   * targetMarks, includeAnswers) — the deterministic assembly.
   */
  async preview(
    rootId: string,
    topicNodeIds: string[] | null,
    maxQuestions: number | null,
    targetMarks: number | null,
    includeAnswers: boolean,
  ): Promise<TestPreviewView> {
    const { servable, sql } = this.deps;

    // subject isolation: node 404 parity + PART_OF subtree filter
    const node = await findNode(sql, rootId);
    if (node === null) {
      throw new NotFoundException("knowledge node", rootId);
    }
    const subtree = new Set(await findSubtreeIds(sql, rootId));
    const topics = (topicNodeIds ?? []).filter((t) => subtree.has(t));
    const distinct = [...new Set(topics)];

    // topic code/title lookup for attribution + coverage summary
    const codeByTopic = new Map<string, string>();
    const titleByTopic = new Map<string, string>();
    for (const topic of distinct) {
      const n: KnowledgeNodeRow | null = await findNode(sql, topic);
      if (n !== null) {
        codeByTopic.set(topic, n.code);
        titleByTopic.set(topic, n.title);
      }
    }

    // assemble through the serving boundary; first selected topic wins
    // attribution (LinkedHashMap putIfAbsent law)
    const byQuestion = new Map<string, StudentQuestionView>();
    const topicByQuestion = new Map<string, string>();
    for (const topic of distinct) {
      for (const q of await servable.activeByTopic(topic)) {
        if (!byQuestion.has(q.id)) {
          byQuestion.set(q.id, q);
          topicByQuestion.set(q.id, topic);
        }
      }
    }

    const cap =
      maxQuestions === null
        ? DEFAULT_MAX
        : Math.max(1, Math.min(HARD_MAX, maxQuestions));
    const marksTarget =
      targetMarks === null
        ? null
        : Math.max(1, Math.min(HARD_MAX_MARKS, targetMarks));
    const difficultyOrdered = [...byQuestion.values()].sort((a, b) =>
      a.difficulty !== b.difficulty
        ? a.difficulty - b.difficulty
        : a.id < b.id
          ? -1
          : a.id > b.id
            ? 1
            : 0,
    );
    const selected = selectByMarks(difficultyOrdered, cap, marksTarget);

    // per-topic availability BEFORE the cap (the honest number)
    const availableByTopic = new Map<string, number>();
    for (const topic of distinct) {
      availableByTopic.set(topic, (await servable.activeByTopic(topic)).length);
    }

    const totalMarks = selected.reduce((sum, q) => sum + q.marks, 0);

    const questions: TestQuestionView[] = [];
    for (const q of selected) {
      const topic = topicByQuestion.get(q.id);
      let answers: TestAnswerView[] = [];
      let schemeState: TestQuestionView["schemeState"] = null;
      if (includeAnswers && q.type === "STRUCTURED") {
        const versions = await findVersionsByQuestionDesc(sql, q.id);
        const current = versions[0] ?? null;
        if (current !== null) {
          const found = await findSchemeWithPoints(sql, current.id);
          if (found !== null) {
            schemeState = found.scheme.validation_state as TestQuestionView["schemeState"];
            answers = found.points.map((p) => ({
              partLabel: p.part_label,
              ref: p.ref,
              text: p.text,
              marks: p.marks,
              acceptanceCriteria: p.acceptance_criteria ?? [],
            }));
          }
        }
      }
      questions.push({
        id: q.id,
        type: q.type,
        stem: q.stem,
        marks: q.marks,
        commandWord: q.commandWord,
        difficulty: q.difficulty,
        // topicCode is never null on the frozen wire (R0 T-MIG-034 intake
        // ruling): every selected question is attributed in the same pass
        // that fills byQuestion, and codeByTopic holds every attributed
        // topic with NOT NULL code values (frozen TestBuilderService.java
        // :95-99 and :153-156; KnowledgeNode.java:35). The assertion encodes
        // that structural invariant; a violation reaches the route's
        // response validation and fails loudly (the frozen hard-errors).
        topicCode: (topic !== undefined ? codeByTopic.get(topic) : undefined)!,
        parts: q.parts,
        options: q.options,
        answers,
        schemeState,
      });
    }

    // coverage code/title are never null on the frozen wire (R0 T-MIG-034
    // intake ruling): distinct topics are exactly the codeByTopic/titleByTopic
    // population set (frozen TestBuilderService.java :95-99 vs :159-162) and
    // knowledge_nodes.code/title are NOT NULL columns (KnowledgeNode.java
    // :35,:42). Assertions encode the invariant; violations fail loudly at
    // the route's response validation.
    const coverage: TopicCoverage[] = distinct.map((t) => ({
      topicNodeId: t,
      code: codeByTopic.get(t)!,
      title: titleByTopic.get(t)!,
      servableQuestions: availableByTopic.get(t) ?? 0,
    }));

    return {
      rootId,
      questionCount: selected.length,
      totalMarks,
      targetMarks: marksTarget,
      topics: coverage,
      questions,
    };
  }

  /**
   * TestBuilderService.weaknessOptions(rootId) — the class-evidence
   * targeting options. Requires the analytics port; absent port is the
   * route's 501-with-task-id state (the dependency is unported, not
   * weakened).
   */
  async weaknessOptions(rootId: string): Promise<WeaknessOptionsView> {
    const analytics = this.deps.analytics;
    if (analytics === null) {
      throw new AnalyticsUnavailable();
    }
    const ceiling = this.deps.weakMasteryCeiling;
    const overview = await analytics.overview(rootId);

    // weak prerequisites (class-level): dependent topic -> weak prerequisite codes
    const blockedBy = new Map<string, string[]>();
    for (const wp of overview.weakPrerequisites) {
      for (const d of wp.dependents) {
        const list = blockedBy.get(d.nodeId) ?? [];
        list.push(wp.prerequisiteCode);
        blockedBy.set(d.nodeId, list);
      }
    }

    // first pass: derive candidates from the class evidence
    const reasonsByTopic = new Map<string, WeaknessOptionsView["weakTopics"][number]["reasons"]>();
    const weakCandidates: TopicAggregate[] = [];
    const gapCandidates: TopicAggregate[] = [];
    for (const t of overview.topics) {
      const reasons: string[] = [];
      if (
        t.learnersMeasured > 0 &&
        t.meanMastery !== null &&
        t.meanMastery < ceiling
      ) {
        reasons.push("LOW_MEAN_MASTERY");
      }
      if (t.learnersWithActiveMisconception > 0) {
        reasons.push("ACTIVE_MISCONCEPTION_PRESENT");
      }
      if (blockedBy.has(t.nodeId)) {
        reasons.push("BLOCKED_BY_WEAK_PREREQUISITE");
      }
      if (reasons.length > 0) {
        reasonsByTopic.set(
          t.nodeId,
          reasons as WeaknessOptionsView["weakTopics"][number]["reasons"],
        );
        weakCandidates.push(t);
      } else if (
        t.learnersMeasured === 0 &&
        (t.evidenceBackedAttempts > 0 || t.tutorEngagements > 0)
      ) {
        // unmeasured but with some class activity worth noticing — an
        // honest coverage-gap candidate, never claimed weak
        gapCandidates.push(t);
      }
    }

    // second pass: the targeting counts (builder rule, batched)
    const scope = new Set<string>();
    weakCandidates.forEach((t) => scope.add(t.nodeId));
    gapCandidates.forEach((t) => scope.add(t.nodeId));
    const targetingCounts = await this.targetingServableCounts(scope);

    const weak: WeaknessOptionsView["weakTopics"] = [];
    for (const t of weakCandidates) {
      weak.push({
        topicNodeId: t.nodeId,
        code: t.code,
        title: t.title,
        reasons: reasonsByTopic.get(t.nodeId) ?? [],
        learnersMeasured: t.learnersMeasured,
        meanMastery: t.meanMastery,
        masteryBand: t.masteryBand,
        learnersWithActiveMisconception: t.learnersWithActiveMisconception,
        activeMisconceptionSignals: t.activeMisconceptionSignals,
        evidenceBackedAttempts: t.evidenceBackedAttempts,
        tutorEngagements: t.tutorEngagements,
        dueReviews: t.dueReviews,
        servableQuestions: targetingCounts.get(t.nodeId) ?? 0,
        blockedByPrerequisiteCodes: [...(blockedBy.get(t.nodeId) ?? [])],
      });
    }
    const gaps: WeaknessOptionsView["coverageGaps"] = [];
    for (const t of gapCandidates) {
      const targetable = targetingCounts.get(t.nodeId) ?? 0;
      if (targetable > 0) {
        gaps.push({
          topicNodeId: t.nodeId,
          code: t.code,
          title: t.title,
          servableQuestions: targetable,
          evidenceBackedAttempts: t.evidenceBackedAttempts,
          tutorEngagements: t.tutorEngagements,
        });
      }
    }
    weak.sort((a, b) => {
      // meanMastery asc, nulls last → learnersWithActiveMisconception desc
      // → code asc (the frozen comparator law)
      if (a.meanMastery === null && b.meanMastery !== null) return 1;
      if (a.meanMastery !== null && b.meanMastery === null) return -1;
      if (a.meanMastery !== null && b.meanMastery !== null && a.meanMastery !== b.meanMastery) {
        return a.meanMastery - b.meanMastery;
      }
      if (a.learnersWithActiveMisconception !== b.learnersWithActiveMisconception) {
        return b.learnersWithActiveMisconception - a.learnersWithActiveMisconception;
      }
      return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
    });

    return {
      rootId,
      policy: WEAKNESS_POLICY,
      enrolledLearners: overview.enrolledLearners,
      learnersWithEvidence: overview.learnersWithEvidence,
      weakTopics: weak,
      coverageGaps: gaps,
      selectionHint:
        "Pass weakTopics[].topicNodeId values as topicNodeIds to GET /api/v1/teacher/tests/preview" +
        " — assembly stays VALIDATED-only, marks-targeted and deterministic.",
    };
  }

  /**
   * Per-topic counts of servable questions reachable through primary OR
   * secondary mappings — the /preview assembly rule, batched
   * (TestBuilderService.targetingServableCounts; §14 no per-topic queries).
   */
  private async targetingServableCounts(
    topicIds: Set<string>,
  ): Promise<Map<string, number>> {
    if (topicIds.size === 0) return new Map();
    const servable = await this.deps.servable.activeWithin([...topicIds]);
    const byTopic = new Map<string, Set<string>>();
    const questionIds: string[] = [];
    for (const q of servable) {
      questionIds.push(q.id);
      if (q.primaryTopicNodeId !== null && topicIds.has(q.primaryTopicNodeId)) {
        const set = byTopic.get(q.primaryTopicNodeId) ?? new Set<string>();
        set.add(q.id);
        byTopic.set(q.primaryTopicNodeId, set);
      }
    }
    if (questionIds.length > 0) {
      for (const qt of await findQuestionTopicsIn(this.deps.sql, questionIds)) {
        if (topicIds.has(qt.node_id)) {
          const set = byTopic.get(qt.node_id) ?? new Set<string>();
          set.add(qt.question_id);
          byTopic.set(qt.node_id, set);
        }
      }
    }
    const counts = new Map<string, number>();
    byTopic.forEach((ids, topic) => counts.set(topic, ids.size));
    return counts;
  }
}

/** The route maps this to 501 with the analytics task reference (the dependency is unported — honest gap, never a fabricated body). */
export class AnalyticsUnavailable extends Error {
  readonly status = 501;
  readonly code = "not_implemented";
}

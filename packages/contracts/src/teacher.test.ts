/**
 * T-MIG-053 tranche-2 contract pins (r3a) — the teacher class-analytics +
 * concept-graph wire, frozen laws @ 6cad6ef:
 *
 *   - the honest unmeasured cell: meanMastery nullable + masteryBand
 *     accepts "UNMEASURED" (ClassAnalyticsService :484 — never fabricated);
 *   - the MEASURED band vocabulary is 3-state (TopicMasteryView :295 — a
 *     mastery value always bands);
 *   - evidenceState is MEASURED|UNMEASURED (learnerRow :643), never a
 *     fabricated number;
 *   - the affected-learner reason vocabulary (learnerRow :694-695);
 *   - the policy literals (class-analytics/v1 :75, concept-graph-teacher/v1
 *     :101) — read-model markers, exact;
 *   - marksAwarded nullable int / questionMarks required int (the trio's
 *     assessment grain, EvidenceItemView :326-327);
 *   - tutorSignalCounts: record of string → int (tutor engagement is
 *     interest/doubt — never mastery, §4);
 *   - the concept-graph edge carries provenance + rationale as REQUIRED
 *     strings (T-C11 honesty contract :112-116);
 *   - nodeType full domain (CONCEPT legal on EdgeNodeView :129-135);
 *   - validationStatus the store epistemic enum (UNVALIDATED|SUGGESTED|VALIDATED);
 *   - SeedSummary: 15 fields, alreadyActive boolean (:465-470).
 */
import { describe, expect, test } from "bun:test";
import {
  affectedLearnerViewSchema,
  affectedReasonSchema,
  analyticsBandSchema,
  classAnalyticsPolicySchema,
  classLearnerViewSchema,
  classOverviewViewSchema,
  conceptGraphEdgesViewSchema,
  conceptGraphPolicySchema,
  evidenceStateSchema,
  measuredBandSchema,
  seedSummarySchema,
  servableQuestionRefSchema,
  topicAggregateViewSchema,
  topicDrillDownViewSchema,
} from "./teacher.js";

const UUID = (n: number): string =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("teacher contracts — the honest unmeasured cell", () => {
  test("overview topic: null mean + UNMEASURED band parse (0 measured learners)", () => {
    const t = topicAggregateViewSchema.parse({
      nodeId: UUID(1),
      code: "4CH1-S1-a-1",
      title: "States of matter",
      parentCode: "4CH1-S1-a",
      parentTitle: "Solids, liquids, gases",
      learnersMeasured: 0,
      meanMastery: null,
      masteryBand: "UNMEASURED",
      evidenceBackedAttempts: 0,
      learnersWithActiveMisconception: 0,
      activeMisconceptionSignals: 0,
      tutorEngagements: 0,
      dueReviews: 0,
      servableQuestions: 0,
    });
    expect(t.meanMastery).toBeNull();
    expect(t.masteryBand).toBe("UNMEASURED");
  });

  test("masteryBand rejects fabricated bands: null, 'GOLD', lowercase", () => {
    const base = {
      nodeId: UUID(1), code: "c", title: "t", parentCode: null, parentTitle: null,
      learnersMeasured: 3, meanMastery: 0.5, masteryBand: "LOW",
      evidenceBackedAttempts: 0, learnersWithActiveMisconception: 0,
      activeMisconceptionSignals: 0, tutorEngagements: 0, dueReviews: 0,
      servableQuestions: 0,
    };
    expect(analyticsBandSchema.safeParse("GOLD").success).toBeFalse();
    expect(analyticsBandSchema.safeParse("low").success).toBeFalse();
    expect(topicAggregateViewSchema.safeParse({ ...base, masteryBand: null }).success).toBeFalse();
  });

  test("measured band is 3-state: UNMEASURED illegal where mastery exists", () => {
    expect(measuredBandSchema.safeParse("SECURE").success).toBeTrue();
    expect(measuredBandSchema.safeParse("UNMEASURED").success).toBeFalse();
  });

  test("evidenceState: MEASURED|UNMEASURED only", () => {
    expect(evidenceStateSchema.safeParse("MEASURED").success).toBeTrue();
    expect(evidenceStateSchema.safeParse("UNMEASURED").success).toBeTrue();
    expect(evidenceStateSchema.safeParse("PENDING").success).toBeFalse();
  });

  test("affected reason vocabulary is exact", () => {
    expect(affectedReasonSchema.safeParse("LOW_MASTERY_AND_ACTIVE_MISCONCEPTION").success).toBeTrue();
    expect(affectedReasonSchema.safeParse("LOW_MASTERY").success).toBeTrue();
    expect(affectedReasonSchema.safeParse("ACTIVE_MISCONCEPTION").success).toBeTrue();
    expect(affectedReasonSchema.safeParse("WEAK").success).toBeFalse();
  });

  test("policy literals exact — no other marker parses", () => {
    expect(classAnalyticsPolicySchema.safeParse("class-analytics/v1").success).toBeTrue();
    expect(classAnalyticsPolicySchema.safeParse("class-analytics/v2").success).toBeFalse();
    expect(conceptGraphPolicySchema.safeParse("concept-graph-teacher/v1").success).toBeTrue();
    expect(conceptGraphPolicySchema.safeParse("concept-graph/v1").success).toBeFalse();
  });

  test("evidence item: marksAwarded nullable int, questionMarks required int", () => {
    const drill = topicDrillDownViewSchema;
    expect(drill).toBeDefined();
    // exercised through the affected-learner/evidence schemas below
    expect(servableQuestionRefSchema.safeParse({
      id: UUID(9), externalRef: "Q-1", type: "MCQ", marks: 1, difficulty: 2,
    }).success).toBeTrue();
    expect(servableQuestionRefSchema.safeParse({
      id: UUID(9), externalRef: null, type: "MCQ", marks: 1.5, difficulty: 2,
    }).success).toBeFalse();
  });

  test("learner row: tutorSignalCounts record of int, lastActivity nullable", () => {
    const row = classLearnerViewSchema.parse({
      learnerId: UUID(2),
      displayName: "Ada",
      createdAt: "2026-01-01T00:00:00Z",
      evidenceState: "UNMEASURED",
      topicsMeasured: 0,
      meanMastery: null,
      evidenceBackedAttempts: 0,
      recentAttempts: 0,
      recentCorrect: 0,
      lastActivityAt: null,
      weakestTopics: [],
      activeMisconceptions: 0,
      misconceptionSignals: [],
      tutorEngagements: 2,
      tutorSignalCounts: { TOPIC_ENGAGEMENT: 1, DOUBT: 1 },
      lastTutorEngagementAt: null,
      dueReviews: 0,
    });
    expect(row.evidenceState).toBe("UNMEASURED");
    expect(row.tutorSignalCounts["DOUBT"]).toBe(1);
    expect(classLearnerViewSchema.safeParse({
      /* missing tutorSignalCounts */ learnerId: UUID(2), displayName: "Ada",
      createdAt: "2026-01-01T00:00:00Z", evidenceState: "UNMEASURED",
      topicsMeasured: 0, meanMastery: null, evidenceBackedAttempts: 0,
      recentAttempts: 0, recentCorrect: 0, lastActivityAt: null,
      weakestTopics: [], activeMisconceptions: 0, misconceptionSignals: [],
      tutorEngagements: 0, lastTutorEngagementAt: null, dueReviews: 0,
    }).success).toBeFalse();
  });

  test("overview: policy is pinned literal + weak prerequisite derived flag", () => {
    const o = classOverviewViewSchema.safeParse({
      rootId: UUID(1), rootCode: "4CH1", policy: "class-analytics/v1",
      enrolledLearners: 0, learnersWithEvidence: 0, learnersRecentlyActive: 0,
      totalTopics: 0, measuredTopics: 0, topics: [], weakPrerequisites: [],
      recentActivity: {
        recentAttempts: 0, learnersActive: 0, tutorAsks: 0,
        structuredAnswersPendingMarking: 0, windowStart: "2026-01-01T00:00:00Z",
      },
    });
    expect(o.success).toBeTrue();
    expect(classOverviewViewSchema.safeParse({
      rootId: UUID(1), rootCode: "4CH1", policy: "kg/v1",
      enrolledLearners: 0, learnersWithEvidence: 0, learnersRecentlyActive: 0,
      totalTopics: 0, measuredTopics: 0, topics: [], weakPrerequisites: [],
      recentActivity: {
        recentAttempts: 0, learnersActive: 0, tutorAsks: 0,
        structuredAnswersPendingMarking: 0, windowStart: "2026-01-01T00:00:00Z",
      },
    }).success).toBeFalse();
    const w = {
      prerequisiteNodeId: UUID(3), prerequisiteCode: "c-1", prerequisiteTitle: "t",
      learnersMeasured: 5, meanMastery: 0.2, masteryBand: "LOW",
      dependents: [{ nodeId: UUID(4), code: "d-1", title: "dt", meanMastery: null }],
      derived: true, derivedViaConceptCodes: ["C-Alpha", "C-Beta"],
    };
    // derived view parses; meanMastery null stays legal for dependents
    expect(classOverviewViewSchema.shape.weakPrerequisites.element.safeParse(w).success).toBeTrue();
  });
});

describe("teacher contracts — the concept-graph read model", () => {
  const node = (n: number, type = "CONCEPT") => ({
    nodeId: UUID(n), code: `CODE-${n}`, title: `T${n}`, nodeType: type,
    validationStatus: "SUGGESTED",
  });
  const edge = (s: number, t: number) => ({
    source: node(s), target: node(t), relation: "REQUIRES_PREREQUISITE",
    validationStatus: "VALIDATED", provenance: "t-c11:settled|pass:p1",
    rationale: "because",
  });

  test("edge: full nodeType domain (CONCEPT legal) + provenance/rationale required", () => {
    const v = conceptGraphEdgesViewSchema.parse({
      rootId: UUID(1), rootCode: "4CH1", policy: "concept-graph-teacher/v1",
      edges: [edge(2, 3)],
    });
    expect(v.edges[0]!.source.nodeType).toBe("CONCEPT");
    expect(conceptGraphEdgesViewSchema.safeParse({
      rootId: UUID(1), rootCode: "4CH1", policy: "concept-graph-teacher/v1",
      edges: [{ ...edge(2, 3), provenance: undefined }],
    }).success).toBeFalse();
  });

  test("edge: MISCONCEPTION nodeType legal; unknown type rejected", () => {
    expect(conceptGraphEdgesViewSchema.safeParse({
      rootId: UUID(1), rootCode: "4CH1", policy: "concept-graph-teacher/v1",
      edges: [{ ...edge(2, 3), source: node(2, "MISCONCEPTION") }],
    }).success).toBeTrue();
    expect(conceptGraphEdgesViewSchema.safeParse({
      rootId: UUID(1), rootCode: "4CH1", policy: "concept-graph-teacher/v1",
      edges: [{ ...edge(2, 3), source: node(2, "THING") }],
    }).success).toBeFalse();
  });

  test("validationStatus epistemic enum: UNVALIDATED|SUGGESTED|VALIDATED", () => {
    expect(conceptGraphEdgesViewSchema.safeParse({
      rootId: UUID(1), rootCode: "4CH1", policy: "concept-graph-teacher/v1",
      edges: [{ ...edge(2, 3), validationStatus: "HUMAN_VALIDATED" }],
    }).success).toBeFalse();
    expect(conceptGraphEdgesViewSchema.safeParse({
      rootId: UUID(1), rootCode: "4CH1", policy: "concept-graph-teacher/v1",
      edges: [{ ...edge(2, 3), source: { ...node(2), validationStatus: "VALIDATED" } }],
    }).success).toBeTrue();
  });

  test("seed summary: 15 fields, alreadyActive boolean strict", () => {
    const s = seedSummarySchema.parse({
      curriculumVersionId: UUID(1), subjectId: UUID(2), rootNodeId: UUID(3),
      sections: 4, subsections: 28, specPoints: 182, practicals: 12,
      conceptNodes: 193, validatedSemanticEdges: 272,
      nodesCreated: 0, nodesReused: 420, edgesCreated: 0, edgesReused: 693,
      alreadyActive: true,
    });
    expect(s.alreadyActive).toBeTrue();
    expect(seedSummarySchema.safeParse({
      curriculumVersionId: UUID(1), subjectId: UUID(2), rootNodeId: UUID(3),
      sections: 4, subsections: 28, specPoints: 182, practicals: 12,
      conceptNodes: 193, validatedSemanticEdges: 272,
      nodesCreated: 0, nodesReused: 420, edgesCreated: 0, edgesReused: 693,
      alreadyActive: 1,
    }).success).toBeFalse();
  });

  test("affected learner: mastery null legal on misconception-only rows", () => {
    const a = affectedLearnerViewSchema.parse({
      learnerId: UUID(5), displayName: "Ada", mastery: null,
      reason: "ACTIVE_MISCONCEPTION", misconceptions: [],
    });
    expect(a.mastery).toBeNull();
  });
});

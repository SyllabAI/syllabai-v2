/**
 * T-MIG-053 tranche-2 (r3a) — the teacher class-analytics + concept-graph
 * wire (Wave-5 remainder band). Port of the frozen views @ 6cad6ef:
 *
 *   - teacher/ClassAnalyticsService.java :122-332 (the view records) — the
 *     class-analytics/v1 read model: evidence kinds stay SEPARATED (§4),
 *     unmeasured is honest (null means, "UNMEASURED" bands — nothing
 *     fabricated for learners or topics without evidence);
 *   - teacher/TeacherConceptGraphController.java :105-136 (the view records)
 *     — concept-graph-teacher/v1: semantic edges BETWEEN nodes, PART_OF
 *     excluded (curriculum structure is the tree read model's authority);
 *   - teacher/ConceptGraphSeedService.java :449-471 (SeedSummary) — the
 *     idempotent seed activation report.
 *
 * REUSE-not-redeclare (the 010/034/053-t1 precedent): javaInstantSchema from
 * assessment.ts, knowledgeNodeTypeSchema from curriculum.ts,
 * validationStatusSchema + applicabilitySchema from knowledge.ts. New wire:
 * masteryBand re-declared here ONLY as the analytics 4-state honest cell
 * (LOW/DEVELOPING/SECURE/UNMEASURED) — same shape as knowledge.ts
 * meanBandSchema (the §13.3 shared band vocabulary + the UNMEASURED
 * absence state); TopicMasteryView's band is the 3-state MEASURED band
 * (a mastery value always has a band).
 */
import { z } from "zod";

import { javaInstantSchema } from "./assessment.js";
import { knowledgeNodeTypeSchema } from "./curriculum.js";
import { applicabilitySchema, validationStatusSchema } from "./knowledge.js";

/** ClassAnalyticsService :75 — the deterministic aggregation contract. */
export const classAnalyticsPolicySchema = z.literal("class-analytics/v1");
/** TeacherConceptGraphController :101 — the concept-graph read-model marker. */
export const conceptGraphPolicySchema = z.literal("concept-graph-teacher/v1");

/** the shared §13.3 band vocabulary + the honest absence state (UNMEASURED) */
export const analyticsBandSchema = z.enum(["LOW", "DEVELOPING", "SECURE", "UNMEASURED"]);
/** a MEASURED mastery value always bands — the 3-state measured vocabulary */
export const measuredBandSchema = z.enum(["LOW", "DEVELOPING", "SECURE"]);

/** ClassLearnerView :285 — measured = has ANY evidence (skills, misconceptions
 *  or tutor engagements); UNMEASURED rows carry null mastery honestly (§4). */
export const evidenceStateSchema = z.enum(["MEASURED", "UNMEASURED"]);

/** AffectedLearnerView :319 — why this learner is in the drill-down panel. */
export const affectedReasonSchema = z.enum([
  "LOW_MASTERY_AND_ACTIVE_MISCONCEPTION",
  "LOW_MASTERY",
  "ACTIVE_MISCONCEPTION",
]);

/** MisconceptionSignalView :299 — a BDT estimate on a misconception node
 *  attached under a topic; parentTopicCode is null only when the parent
 *  topic vanished from the tree (structural drift — reported, not guessed). */
export const misconceptionSignalViewSchema = z.object({
  misconceptionNodeId: z.string().uuid(),
  code: z.string(),
  title: z.string(),
  probability: z.number(),
  evidenceCount: z.number().int(),
  parentTopicNodeId: z.string().uuid().nullable(),
  parentTopicCode: z.string().nullable(),
});
export type MisconceptionSignalView = z.infer<typeof misconceptionSignalViewSchema>;

/** TopicMasteryView :294 — one measured topic of one learner (per-skill-state
 *  grain; mastery is the stored estimate, band the shared vocabulary). */
export const topicMasteryViewSchema = z.object({
  nodeId: z.string().uuid(),
  code: z.string(),
  title: z.string(),
  mastery: z.number(),
  band: measuredBandSchema,
  attempts: z.number().int(),
});
export type TopicMasteryView = z.infer<typeof topicMasteryViewSchema>;

/** DependentView :275 — a dependent that needs a weak prerequisite. */
export const dependentViewSchema = z.object({
  nodeId: z.string().uuid(),
  code: z.string(),
  title: z.string(),
  meanMastery: z.number().nullable(),
});
export type DependentView = z.infer<typeof dependentViewSchema>;

/** WeakPrerequisiteView :268 — a prerequisite the CLASS measures weak. The
 *  T-C11 projection honesty: derived=true + derivedViaConceptCodes carries
 *  the concept codes behind a concept→SP projection (an inferred-only pair
 *  with no settled structure-level edge); direct structure-level pairs report
 *  derived=false with an empty list. */
export const weakPrerequisiteViewSchema = z.object({
  prerequisiteNodeId: z.string().uuid(),
  prerequisiteCode: z.string(),
  prerequisiteTitle: z.string(),
  learnersMeasured: z.number().int(),
  meanMastery: z.number().nullable(),
  masteryBand: analyticsBandSchema,
  dependents: z.array(dependentViewSchema),
  derived: z.boolean(),
  derivedViaConceptCodes: z.array(z.string()),
});
export type WeakPrerequisiteView = z.infer<typeof weakPrerequisiteViewSchema>;

/** RecentActivityView :278 — the raw recent-window counts (§2). */
export const recentActivityViewSchema = z.object({
  recentAttempts: z.number().int(),
  learnersActive: z.number().int(),
  tutorAsks: z.number().int(),
  structuredAnswersPendingMarking: z.number().int(),
  windowStart: javaInstantSchema,
});
export type RecentActivityView = z.infer<typeof recentActivityViewSchema>;

/** TopicAggregateView :237 — one heatmap cell: topic/spec-point × class
 *  evidence and mastery. meanMastery null + "UNMEASURED" band when 0
 *  measured learners (honest absence, never zero — §4). */
export const topicAggregateViewSchema = z.object({
  nodeId: z.string().uuid(),
  code: z.string(),
  title: z.string(),
  parentCode: z.string().nullable(),
  parentTitle: z.string().nullable(),
  learnersMeasured: z.number().int(),
  meanMastery: z.number().nullable(),
  masteryBand: analyticsBandSchema,
  evidenceBackedAttempts: z.number().int(),
  learnersWithActiveMisconception: z.number().int(),
  activeMisconceptionSignals: z.number().int(),
  tutorEngagements: z.number().int(),
  dueReviews: z.number().int(),
  servableQuestions: z.number().int(),
});
export type TopicAggregateView = z.infer<typeof topicAggregateViewSchema>;

/** ClassOverviewView :245 — §2 class overview (cohort, coverage, heatmap
 *  aggregates, weak prerequisites, recent activity). */
export const classOverviewViewSchema = z.object({
  rootId: z.string().uuid(),
  rootCode: z.string(),
  policy: classAnalyticsPolicySchema,
  enrolledLearners: z.number().int(),
  learnersWithEvidence: z.number().int(),
  learnersRecentlyActive: z.number().int(),
  totalTopics: z.number().int(),
  measuredTopics: z.number().int(),
  topics: z.array(topicAggregateViewSchema),
  weakPrerequisites: z.array(weakPrerequisiteViewSchema),
  recentActivity: recentActivityViewSchema,
});
export type ClassOverviewView = z.infer<typeof classOverviewViewSchema>;

/** ClassLearnerView :284 — one evidence-separated per-learner row (§2).
 *  tutorSignalCounts keys are the engagement signal types (tutor interest
 *  or doubt — NEVER mastery, §4). */
export const classLearnerViewSchema = z.object({
  learnerId: z.string().uuid(),
  displayName: z.string(),
  createdAt: javaInstantSchema,
  evidenceState: evidenceStateSchema,
  topicsMeasured: z.number().int(),
  meanMastery: z.number().nullable(),
  evidenceBackedAttempts: z.number().int(),
  recentAttempts: z.number().int(),
  recentCorrect: z.number().int(),
  lastActivityAt: javaInstantSchema.nullable(),
  weakestTopics: z.array(topicMasteryViewSchema),
  activeMisconceptions: z.number().int(),
  misconceptionSignals: z.array(misconceptionSignalViewSchema),
  tutorEngagements: z.number().int(),
  tutorSignalCounts: z.record(z.string(), z.number().int()),
  lastTutorEngagementAt: javaInstantSchema.nullable(),
  dueReviews: z.number().int(),
});
export type ClassLearnerView = z.infer<typeof classLearnerViewSchema>;

/** PrerequisiteLinkView :313 — one link of the KG prerequisite chain with the
 *  class-level mastery estimate (UNMEASURED when the link is unmeasured). */
export const prerequisiteLinkViewSchema = z.object({
  nodeId: z.string().uuid(),
  code: z.string(),
  title: z.string(),
  depth: z.number().int(),
  learnersMeasured: z.number().int(),
  meanMastery: z.number().nullable(),
  masteryBand: analyticsBandSchema,
});
export type PrerequisiteLinkView = z.infer<typeof prerequisiteLinkViewSchema>;

/** AffectedLearnerView :318 — drill-down affected learner (§5). mastery null
 *  when the learner is affected ONLY through an active misconception. */
export const affectedLearnerViewSchema = z.object({
  learnerId: z.string().uuid(),
  displayName: z.string(),
  mastery: z.number().nullable(),
  reason: affectedReasonSchema,
  misconceptions: z.array(misconceptionSignalViewSchema),
});
export type AffectedLearnerView = z.infer<typeof affectedLearnerViewSchema>;

/** EvidenceItemView :324 — one recent attempt, the raw evidence a teacher
 *  inspects before intervening. marksAwarded null while unmarked (the trio's
 *  marksAwarded-nullable law, same assessment grain). */
export const evidenceItemViewSchema = z.object({
  attemptId: z.string().uuid(),
  learnerId: z.string().uuid(),
  learnerDisplayName: z.string(),
  questionId: z.string().uuid(),
  questionRef: z.string().nullable(),
  correct: z.boolean(),
  marksAwarded: z.number().int().nullable(),
  questionMarks: z.number().int(),
  markingState: z.string(),
  createdAt: javaInstantSchema,
});
export type EvidenceItemView = z.infer<typeof evidenceItemViewSchema>;

/** ServableQuestionRef :330 — the intervention hand-off (§5): validated
 *  questions the Test Builder can serve for the drill-down topic. */
export const servableQuestionRefSchema = z.object({
  id: z.string().uuid(),
  externalRef: z.string().nullable(),
  type: z.string(),
  marks: z.number().int(),
  difficulty: z.number().int(),
});
export type ServableQuestionRef = z.infer<typeof servableQuestionRefSchema>;

/** TopicDrillDownView :304 — class → topic → learners → evidence →
 *  intervention (§5). */
export const topicDrillDownViewSchema = z.object({
  rootId: z.string().uuid(),
  topic: topicAggregateViewSchema,
  prerequisiteChain: z.array(prerequisiteLinkViewSchema),
  affectedLearners: z.array(affectedLearnerViewSchema),
  representativeEvidence: z.array(evidenceItemViewSchema),
  servableQuestions: z.array(servableQuestionRefSchema),
});
export type TopicDrillDownView = z.infer<typeof topicDrillDownViewSchema>;

// ── the concept-graph read model (TeacherConceptGraphController :105-136) ────

/** EdgeNodeView :129 — one endpoint of a semantic edge. */
export const edgeNodeViewSchema = z.object({
  nodeId: z.string().uuid(),
  code: z.string(),
  title: z.string(),
  nodeType: knowledgeNodeTypeSchema,
  validationStatus: validationStatusSchema,
});
export type EdgeNodeView = z.infer<typeof edgeNodeViewSchema>;

/** ConceptGraphEdgeView :117 — one semantic relationship, teacher-facing.
 *  provenance keeps the T-C11 honesty contract (extraction pass, derivation
 *  method, operator validation visible); rationale the derivation notes. */
export const conceptGraphEdgeViewSchema = z.object({
  source: edgeNodeViewSchema,
  target: edgeNodeViewSchema,
  relation: z.string(),
  validationStatus: validationStatusSchema,
  provenance: z.string(),
  rationale: z.string(),
});
export type ConceptGraphEdgeView = z.infer<typeof conceptGraphEdgeViewSchema>;

/** ConceptGraphEdgesView :107 — the graph-derived semantic edges within a
 *  subject subtree; PART_OF excluded by contract. */
export const conceptGraphEdgesViewSchema = z.object({
  rootId: z.string().uuid(),
  rootCode: z.string(),
  policy: conceptGraphPolicySchema,
  edges: z.array(conceptGraphEdgeViewSchema),
});
export type ConceptGraphEdgesView = z.infer<typeof conceptGraphEdgesViewSchema>;

/** SeedSummary (ConceptGraphSeedService :465-470) — the idempotent activation
 *  report: snapshot counts + this run's created/reused counters; alreadyActive
 *  true when the whole seed was already present (the structural no-op). */
export const seedSummarySchema = z.object({
  curriculumVersionId: z.string().uuid(),
  subjectId: z.string().uuid(),
  rootNodeId: z.string().uuid(),
  sections: z.number().int(),
  subsections: z.number().int(),
  specPoints: z.number().int(),
  practicals: z.number().int(),
  conceptNodes: z.number().int(),
  validatedSemanticEdges: z.number().int(),
  nodesCreated: z.number().int(),
  nodesReused: z.number().int(),
  edgesCreated: z.number().int(),
  edgesReused: z.number().int(),
  alreadyActive: z.boolean(),
});
export type SeedSummary = z.infer<typeof seedSummarySchema>;

/** applicability passthrough (T-C24) re-pinned here for the seed's spec-point
 *  path: the store's own object copied key-for-key — never interpreted,
 *  normalized, or defaulted; absent stays null. */
export const teacherApplicabilitySchema = applicabilitySchema;

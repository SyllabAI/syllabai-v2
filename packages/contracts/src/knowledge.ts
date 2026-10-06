/**
 * Knowledge-graph + teaching-coverage wire — the T-MIG-053 tranche-1 band
 * (frozen @ 6cad6ef, syllabai-core). REUSE over re-declare: the NodeType
 * enum lives in curriculum.ts (knowledgeNodeTypeSchema), the F-034
 * learner-KG view + the shared band vocabulary live in learner.ts — the
 * class-KG endpoint composes them (imports below, NO re-export, so the
 * index namespace stays single-owned).
 *
 *   - NodeView / PrerequisiteView
 *       (src/main/java/com/syllabai/knowledge/dto/{NodeView,PrerequisiteView}.java
 *        over KnowledgeController :17-46, /api/v1/knowledge — the 4 GETs
 *        nodes/{id} | tree?includeMisconceptions | prerequisites |
 *        misconceptions; type = nodeType().name() (curriculum.ts's
 *        knowledgeNodeTypeSchema — full domain incl. CONCEPT);
 *        validationStatus = the ValidationStatus enum NAME (UNVALIDATED |
 *        SUGGESTED | VALIDATED); applicability (T-C24/V39) is the node's
 *        official paper/unit/tier scope VERBATIM, null on every non-spec
 *        node; children is populated ONLY in tree views (flat = empty).
 *        NodeView is a RECURSIVE record — mirrored with z.lazy).
 *   - ClassKnowledgeGraphView / ClassGraphNodeView / ClassGraphEdgeView /
 *     ClassNodeStudentsView / ClassNodeStudentView /
 *     StudentMisconceptionView / StudentEvidenceItemView
 *       (src/main/java/com/syllabai/classroom/dto/ClassKnowledgeGraphViews.java
 *        — the F-072 class KG heatmap, §13.3/§13.4). LAWS pinned here:
 *        coverageState is "taught" | "not-taught" | "unrecorded" — grey =
 *        ABSENT TEACHING COVERAGE, never low understanding, and
 *        "unrecorded" is the honest absence state; meanBand is the 4-state
 *        union LOW | DEVELOPING | SECURE | UNMEASURED and is NEVER null —
 *        the frozen service defaults it to "UNMEASURED" (:504) and only
 *        then bandOf(meanMastery) when learnersMeasured > 0 (:528);
 *        meanMastery IS null when nobody measured (never a fabricated
 *        zero); the struggling/developing/proficient counts distribute the
 *        measured students by band so a polarized class cannot hide behind
 *        the mean; learnersEnrolled counts ENABLED members only — the
 *        independent-student rule lives here; drill-down students carry
 *        raw BKT mastery + EFFECTIVE decayed mastery + bounded
 *        recent-attempt evidence, unmeasured = null mastery/band + empty
 *        evidence, honestly (learner band fields reuse learner.ts's
 *        3-state masteryBandSchema — the class-level UNMEASURED literal is
 *        a meanBand-only state, not a student-band state).
 *   - CoverageRowView / CoverageEventView
 *       (src/main/java/com/syllabai/classroom/dto/TeachingCoverageViews.java
 *        over TeachingCoverageController :56-192 — V52). status is the
 *        Status.wire() canonical form "taught" | "not-taught" (the parse
 *        is tolerant — "not_taught" accepted at the SERVICE boundary, wire
 *        is canonical; that law lands in services/knowledge); 
 *        previousStatus null on the first event of a trail; absence of a
 *        row is the honest "unrecorded" state.
 *   - Request body (TeachingCoverageController :188-191):
 *       MarkRequest  status @NotBlank, note @Size(max 500) OPTIONAL.
 *   - Instant fields use javaInstantSchema (assessment.ts) — the
 *     established Instant wire law.
 *
 * Contracts-first rule 1: constraints copied EXACTLY; the Java record wins.
 * The 404-first node law, the idempotent identical-re-mark no-op, the
 * archived-class 409 and the spec-point 400 gate (the V39 invariant:
 * applicability populated ONLY on seed-owned spec-point rows) are SERVICE
 * law — they land in services/knowledge next to their pin tests.
 * OWNED BY T-MIG-053 (r3a) — id ratification requested at PR #84 review.
 */
import { z } from "zod";
import { javaInstantSchema } from "./assessment.js";
import { knowledgeNodeTypeSchema } from "./curriculum.js";
import { masteryBandSchema } from "./learner.js";

// re-exported for the /api/v1/knowledge surface's own consumption; the
// learner-KG view itself stays single-owned in learner.ts (no re-export —
// the class endpoint serves the SAME F-034 shape the learner state band
// already ratified, nodeWithStateViewSchema + prerequisiteEdgeViewSchema).
import {
  learnerKnowledgeGraphViewSchema,
  nodeWithStateViewSchema,
  prerequisiteEdgeViewSchema,
} from "./learner.js";

// ── shared vocabulary (new wire, this band) ─────────────────────────────────

/** ValidationStatus — the seed/lifecycle state of a knowledge node. */
export const validationStatusSchema = z.enum(["UNVALIDATED", "SUGGESTED", "VALIDATED"]);
export type ValidationStatus = z.infer<typeof validationStatusSchema>;

/** Coverage wire form (TeachingCoverage.Status.wire() canonical). */
export const coverageStatusSchema = z.enum(["taught", "not-taught"]);
export type CoverageStatus = z.infer<typeof coverageStatusSchema>;

/** The heatmap coverage state — includes the honest ABSENCE state (§13.4). */
export const coverageStateSchema = z.enum(["taught", "not-taught", "unrecorded"]);
export type CoverageState = z.infer<typeof coverageStateSchema>;

/**
 * meanBand — the 4-state union on the class heatmap cell. NEVER null on
 * the wire: the frozen service defaults "UNMEASURED" (:504) and upgrades
 * to bandOf(meanMastery) only when somebody measured (:528).
 */
export const meanBandSchema = z.enum(["LOW", "DEVELOPING", "SECURE", "UNMEASURED"]);
export type MeanBand = z.infer<typeof meanBandSchema>;

/** applicability (T-C24/T-C28, V39): official paper/unit/tier scope, verbatim. */
export const applicabilitySchema = z.record(z.string(), z.any()).nullable();
export type Applicability = z.infer<typeof applicabilitySchema>;

// ── /api/v1/knowledge (KnowledgeController :17-46) ───────────────────────────

/** NodeView — flat projection, children populated only in tree views. */
export interface NodeView {
  id: string;
  code: string;
  type: z.infer<typeof knowledgeNodeTypeSchema>;
  title: string;
  description: string | null;
  validationStatus: ValidationStatus;
  provenance: string | null;
  applicability: Record<string, unknown> | null;
  children: NodeView[];
}

export const nodeViewSchema: z.ZodType<NodeView> = z.lazy(() =>
  z.object({
    id: z.string().uuid(),
    code: z.string(),
    type: knowledgeNodeTypeSchema,
    title: z.string(),
    description: z.string().nullable(),
    validationStatus: validationStatusSchema,
    provenance: z.string().nullable(),
    applicability: applicabilitySchema,
    children: z.array(nodeViewSchema),
  })
);

/** PrerequisiteView — depth 1 = direct prerequisite, deeper = transitive. */
export const prerequisiteViewSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  type: knowledgeNodeTypeSchema,
  title: z.string(),
  depth: z.number().int(),
});
export type PrerequisiteView = z.infer<typeof prerequisiteViewSchema>;

// ── class knowledge-graph (ClassKnowledgeGraphController :37-113) ────────────

/** ClassGraphEdgeView — prerequisite edge over the subtree (student-KG shape). */
export const classGraphEdgeViewSchema = z.object({
  prerequisiteId: z.string().uuid(),
  prerequisiteCode: z.string(),
  nodeId: z.string().uuid(),
  nodeCode: z.string(),
});
export type ClassGraphEdgeView = z.infer<typeof classGraphEdgeViewSchema>;

/** StudentMisconceptionView — one misconception estimate on a node. */
export const studentMisconceptionViewSchema = z.object({
  misconceptionNodeId: z.string().uuid(),
  code: z.string(),
  title: z.string(),
  probability: z.number(),
  active: z.boolean(),
});
export type StudentMisconceptionView = z.infer<typeof studentMisconceptionViewSchema>;

/** StudentEvidenceItemView — one recent attempt (raw evidence, verbatim). */
export const studentEvidenceItemViewSchema = z.object({
  attemptId: z.string().uuid(),
  questionId: z.string().uuid(),
  questionRef: z.string(),
  correct: z.boolean(),
  marksAwarded: z.number().int().nullable(),
  questionMarks: z.number().int(),
  markingState: z.string(),
  createdAt: javaInstantSchema,
});
export type StudentEvidenceItemView = z.infer<typeof studentEvidenceItemViewSchema>;

/** ClassNodeStudentView — one affected student (§13.5 student grain). */
export const classNodeStudentViewSchema = z.object({
  learnerId: z.string().uuid(),
  displayName: z.string(),
  mastery: z.number().nullable(),
  effectiveMastery: z.number().nullable(),
  band: masteryBandSchema.nullable(),
  attempts: z.number().int().nullable(),
  correctCount: z.number().int().nullable(),
  lastPracticedAt: javaInstantSchema.nullable(),
  misconceptions: z.array(studentMisconceptionViewSchema),
  recentAttempts: z.array(studentEvidenceItemViewSchema),
});
export type ClassNodeStudentView = z.infer<typeof classNodeStudentViewSchema>;

/** ClassNodeStudentsView — the TFA-07 drill-down payload. */
export const classNodeStudentsViewSchema = z.object({
  classId: z.string().uuid(),
  className: z.string(),
  rootId: z.string().uuid(),
  nodeId: z.string().uuid(),
  nodeCode: z.string(),
  nodeTitle: z.string(),
  nodeType: knowledgeNodeTypeSchema,
  coverageState: coverageStateSchema,
  learnersEnrolled: z.number().int(),
  strugglingCount: z.number().int(),
  developingCount: z.number().int(),
  proficientCount: z.number().int(),
  asOf: javaInstantSchema,
  students: z.array(classNodeStudentViewSchema),
});
export type ClassNodeStudentsView = z.infer<typeof classNodeStudentsViewSchema>;

/** ClassGraphNodeView — one heatmap cell (node × class evidence + coverage). */
export const classGraphNodeViewSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  type: knowledgeNodeTypeSchema,
  title: z.string(),
  description: z.string().nullable(),
  childIds: z.array(z.string().uuid()),
  coverageState: coverageStateSchema,
  specPoints: z.number().int(),
  recordedSpecPoints: z.number().int(),
  taughtSpecPoints: z.number().int(),
  learnersMeasured: z.number().int(),
  meanMastery: z.number().nullable(),
  meanBand: meanBandSchema,
  strugglingCount: z.number().int(),
  developingCount: z.number().int(),
  proficientCount: z.number().int(),
  attempts: z.number().int(),
  correctCount: z.number().int(),
  learnersWithActiveMisconception: z.number().int(),
});
export type ClassGraphNodeView = z.infer<typeof classGraphNodeViewSchema>;

/** ClassKnowledgeGraphView — the F-072 heatmap payload (one read model). */
export const classKnowledgeGraphViewSchema = z.object({
  classId: z.string().uuid(),
  className: z.string(),
  rootId: z.string().uuid(),
  rootCode: z.string(),
  rootTitle: z.string(),
  learnersEnrolled: z.number().int(),
  asOf: javaInstantSchema,
  nodes: z.array(classGraphNodeViewSchema),
  prerequisiteEdges: z.array(classGraphEdgeViewSchema),
});
export type ClassKnowledgeGraphView = z.infer<typeof classKnowledgeGraphViewSchema>;

// ── teaching coverage (TeachingCoverageController :56-192, V52) ──────────────

/** CoverageRowView — one recorded row joined with its spec-point identity. */
export const coverageRowViewSchema = z.object({
  specPointNodeId: z.string().uuid(),
  code: z.string().nullable(),
  title: z.string().nullable(),
  status: coverageStatusSchema,
  markedBy: z.string().uuid(),
  markedAt: javaInstantSchema,
  note: z.string().nullable(),
  firstMarkedAt: javaInstantSchema,
});
export type CoverageRowView = z.infer<typeof coverageRowViewSchema>;

/** CoverageEventView — one append-only audit event, newest first upstream. */
export const coverageEventViewSchema = z.object({
  status: coverageStatusSchema,
  previousStatus: coverageStatusSchema.nullable(),
  actorId: z.string().uuid(),
  note: z.string().nullable(),
  createdAt: javaInstantSchema,
});
export type CoverageEventView = z.infer<typeof coverageEventViewSchema>;

/** MarkRequest (TeachingCoverageController :188-191) — exact constraints. */
export const coverageMarkRequestSchema = z.object({
  status: z.string().min(1),
  note: z.string().max(500).optional(),
});
export type CoverageMarkRequest = z.infer<typeof coverageMarkRequestSchema>;

// ── consumed (single-owned elsewhere, NOT re-exported) ──────────────────────
// learnerKnowledgeGraphViewSchema / nodeWithStateViewSchema /
// prerequisiteEdgeViewSchema — the F-034 wire the class endpoint's third
// route serves; ratified in learner.ts (038/041/043 band). Consumed here so
// services/knowledge composes ONE source of truth per shape.

export {
  learnerKnowledgeGraphViewSchema as classServedLearnerKnowledgeGraphViewSchema,
  nodeWithStateViewSchema as classServedNodeWithStateViewSchema,
  prerequisiteEdgeViewSchema as classServedPrerequisiteEdgeViewSchema,
};
export type {
  LearnerKnowledgeGraphView as ClassServedLearnerKnowledgeGraphView,
  NodeWithStateView as ClassServedNodeWithStateView,
  PrerequisiteEdgeView as ClassServedPrerequisiteEdgeView,
} from "./learner.js";

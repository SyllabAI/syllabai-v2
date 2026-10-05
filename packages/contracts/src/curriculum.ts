/**
 * Wave-2 curriculum contracts — ported from the frozen Java core.
 *
 * Sources (syllabai-core @ main, frozen, verified 2026-10-05 by T-MIG-005):
 *   src/main/java/com/syllabai/curriculum/CurriculumController.java
 *       (/api/v1/curriculum — versions, subjects, subject by id)
 *   src/main/java/com/syllabai/curriculum/dto/CurriculumVersionView.java
 *   src/main/java/com/syllabai/curriculum/dto/SubjectView.java
 *   src/main/java/com/syllabai/teacher/TeacherCurriculumController.java
 *       (/api/v1/teacher/curriculum — GET /versions overview list, GET
 *        /versions/{id}/nodes; write flows excluded, see content.ts scope)
 *   src/main/java/com/syllabai/teacher/CurriculumReviewService.java:214-235
 *       (CurriculumOverview, NodeView)
 *   src/main/java/com/syllabai/curriculum/CurriculumVersion.java:22 (Status)
 *   src/main/java/com/syllabai/knowledge/KnowledgeNode.java:28 (ValidationStatus)
 *   src/main/java/com/syllabai/knowledge/NodeType.java
 *
 * Cross-checks: curriculum-versions-student-200 (CurriculumVersionView with
 * status "ACTIVE"), curriculum-subject-by-id-student-200 (SubjectView with
 * the nested version), teacher-curriculum-versions-teacher-200 and
 * teacher-curriculum-nodes-suggested-200 ([] with the status filter) pin
 * the shapes that have captures; the real-node tranche is F-5-gated.
 *
 * Note for the T-MIG-021 port: teacher-curriculum-nodes-unknown-version-200
 * captures that GET /versions/{unknown}/nodes returns 200 [] (no existence
 * check — T-MIG-004 F-1); the contracts express only shapes, the divergence
 * call belongs to R0.
 */
import { z } from "zod";

/** CurriculumVersion.java:22 — Status. */
export const curriculumVersionStatusSchema = z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]);
export type CurriculumVersionStatus = z.infer<typeof curriculumVersionStatusSchema>;

/** KnowledgeNode.java:28 — ValidationStatus. */
export const knowledgeNodeValidationStatusSchema = z.enum([
  "UNVALIDATED",
  "SUGGESTED",
  "VALIDATED",
]);
export type KnowledgeNodeValidationStatus = z.infer<typeof knowledgeNodeValidationStatusSchema>;

/**
 * NodeType.java — full value domain incl. MISCONCEPTION and the T-C11
 * CONCEPT nodes (V15). NodeView serializes nodeType().name(), so a
 * node view can carry any of these even on curriculum-structure reads.
 */
export const knowledgeNodeTypeSchema = z.enum([
  "SUBJECT",
  "UNIT",
  "TOPIC",
  "SUBTOPIC",
  "MISCONCEPTION",
  "CONCEPT",
]);
export type KnowledgeNodeType = z.infer<typeof knowledgeNodeTypeSchema>;

// ── query parameter binding (Spring @RequestParam semantics) ───────────────

/**
 * GET /api/v1/curriculum/versions params — includeArchived is
 * @RequestParam(defaultValue = "false") boolean. Binding is Spring's
 * StringToBooleanConverter: trimmed "true"/"false" case-INSENSITIVE,
 * anything else fails conversion → 400. The captures only ever omit the
 * param (default); non-canonical forms are binding-derived, not
 * capture-proven — if a golden case ever hits one, record it.
 */
export const curriculumVersionsQuerySchema = z.object({
  includeArchived: z.preprocess(
    (v) => (v === undefined ? "false" : v),
    z
      .string()
      .refine((s) => /^(?:true|false)$/i.test(s.trim()), "must be a boolean")
      .transform((s) => s.trim().toLowerCase() === "true"),
  ),
});
export type CurriculumVersionsQuery = z.infer<typeof curriculumVersionsQuerySchema>;

/** GET /api/v1/curriculum/subjects params — versionId: optional UUID (bad uuid → 400 binding). */
export const curriculumSubjectsQuerySchema = z.object({
  versionId: z.string().uuid().optional(),
});
export type CurriculumSubjectsQuery = z.infer<typeof curriculumSubjectsQuerySchema>;

/**
 * GET /api/v1/teacher/curriculum/versions/{id}/nodes params — status is an
 * optional ValidationStatus; unknown values fail enum conversion → 400
 * (valueOf is case-sensitive).
 */
export const teacherCurriculumNodesQuerySchema = z.object({
  // same StringToEnumConverterFactory trim-before-valueOf semantics as search `kind`
  status: z
    .preprocess((v) => (typeof v === "string" ? v.trim() : v), knowledgeNodeValidationStatusSchema)
    .optional(),
});
export type TeacherCurriculumNodesQuery = z.infer<typeof teacherCurriculumNodesQuerySchema>;

// ── CurriculumController views ─────────────────────────────────────────────

/**
 * CurriculumVersionView (CurriculumVersionView.java:6-8) — pinned by the
 * versions capture (status "ACTIVE", fixed seed uuid).
 */
export const curriculumVersionViewSchema = z.object({
  id: z.string().uuid(),
  board: z.string(),
  qualification: z.string(),
  code: z.string(),
  title: z.string(),
  status: curriculumVersionStatusSchema,
});
export type CurriculumVersionView = z.infer<typeof curriculumVersionViewSchema>;

/** GET /api/v1/curriculum/versions body (archived excluded by default — service behavior, not schema). */
export const curriculumVersionsResponseSchema = z.array(curriculumVersionViewSchema);

/**
 * SubjectView (SubjectView.java:6-8) — pinned by the subject capture.
 * knowledgeNodeId is nullable when a subject has no KG root (capture
 * shows a populated value; the column allows null — capture-unproven for
 * the null case).
 */
export const subjectViewSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  knowledgeNodeId: z.string().uuid().nullable() /* nullability: capture-unproven */,
  curriculumVersion: curriculumVersionViewSchema,
});
export type SubjectView = z.infer<typeof subjectViewSchema>;

/** GET /api/v1/curriculum/subjects and /subjects/{id} bodies. */
export const curriculumSubjectsResponseSchema = z.array(subjectViewSchema);
export const curriculumSubjectResponseSchema = subjectViewSchema;

// ── TeacherCurriculumController read views ─────────────────────────────────

/**
 * CurriculumOverview (CurriculumReviewService.java:214-217) — GET
 * /api/v1/teacher/curriculum/versions rows: node counts by validation
 * state per version. `status` is CurriculumVersion.Status.name().
 */
export const curriculumOverviewSchema = z.object({
  id: z.string().uuid(),
  board: z.string(),
  qualification: z.string(),
  code: z.string(),
  title: z.string(),
  status: curriculumVersionStatusSchema,
  validatedNodes: z.number().int(),
  suggestedNodes: z.number().int(),
  unvalidatedNodes: z.number().int(),
});
export type CurriculumOverview = z.infer<typeof curriculumOverviewSchema>;

/** GET /api/v1/teacher/curriculum/versions body (pinned [] empty-state on main). */
export const teacherCurriculumVersionsResponseSchema = z.array(curriculumOverviewSchema);

/**
 * NodeView (CurriculumReviewService.java:228-235) — GET
 * /versions/{id}/nodes rows. provenance is the §17 draft fingerprint
 * (nullable); parentId is the PART_OF parent (null for roots —
 * capture-unproven until the real-node tranche lands).
 */
export const knowledgeNodeViewSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  nodeType: knowledgeNodeTypeSchema,
  title: z.string(),
  validationStatus: knowledgeNodeValidationStatusSchema,
  provenance: z.string().nullable() /* nullability: capture-unproven */,
  parentId: z.string().uuid().nullable() /* nullability: capture-unproven (roots) */,
});
export type KnowledgeNodeView = z.infer<typeof knowledgeNodeViewSchema>;

/** GET /api/v1/teacher/curriculum/versions/{id}/nodes body (pinned [] with ?status=SUGGESTED). */
export const teacherCurriculumNodesResponseSchema = z.array(knowledgeNodeViewSchema);

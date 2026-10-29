/**
 * Seneca resource packs wire (T-SENECA-001) — the v2-native assignment
 * content OPTION that rides beside the frozen T-MIG-117 assignments family
 * without touching it.
 *
 * WHY A SEPARATE CONTRACT: the frozen CreateRequest (@NotBlank specRefs
 * @Size(min 1..60), fail-closed curriculum-structure target gate) is
 * golden-pinned wire parity with the archived Java core. A Seneca resource
 * has no curriculum code — the option therefore travels its own wire here,
 * and the pack create-path writes the SAME `assignments` row (spec_refs [],
 * marks/count derived) plus side-table tasks, so every EXISTING surface
 * (learner list, agenda, hand-in submissions, roster, close/reopen) works
 * unchanged. This is the deliberate divergence of record (the T-TEACH-006
 * mold): frozen payloads behave byte-identically; this module only ADDS.
 *
 * Resource rows come from the operator-approved Seneca Resource Hub harvest
 * (SyllabAI/syllabai-experimental @ d67bc1e3, PII-scrubbed), linked ONLY to
 * hub courses that exist (courses.json; pilot: igcse-chemistry-19 4CH1).
 * Kinds: "courseSection" (study notes) | "examQuestion" (marks-aware) |
 * "quiz" (teacher/Seneca quiz summary).
 *
 * Zero-LLM seam: this family touches no LLM path (the §9 honesty law the
 * assignments family already carries).
 */
import { z } from "zod";

/** the three Seneca resource kinds the corpus carries. */
export const assignmentPackResourceKindSchema = z.enum([
  "courseSection",
  "examQuestion",
  "quiz",
]);
export type AssignmentPackResourceKind = z.infer<typeof assignmentPackResourceKindSchema>;

// ── teacher: browse the course-linked library (the picker feed) ─────────────

/** One picker row. `content` is intentionally absent — the picker never
 *  ships question bodies; the learner pack detail does. */
export const assignmentPackResourceRowSchema = z.object({
  id: z.string().min(1),
  kind: assignmentPackResourceKindSchema,
  title: z.string().nullish(),
  topicPath: z.string().nullish(),
  marksTotal: z.number().int().nullish(),
  questionType: z.string().nullish(),
});
export type AssignmentPackResourceRow = z.infer<typeof assignmentPackResourceRowSchema>;

export const assignmentPackLibraryViewSchema = z.object({
  courseSlug: z.string().min(1),
  /** verbatim hub course label (courses.json) for the picker header. */
  courseLabel: z.string(),
  total: z.number().int().min(0),
  topics: z.array(z.string()),
  resources: z.array(assignmentPackResourceRowSchema),
});
export type AssignmentPackLibraryView = z.infer<typeof assignmentPackLibraryViewSchema>;

// ── teacher: create a pack assignment ───────────────────────────────────────

export const assignmentPackCreateRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    courseSlug: z
      .string()
      .regex(/^[a-z0-9-]+$/, "course slug must be the hub course slug")
      .min(1)
      .max(64),
    courseLabel: z.string().trim().min(1).max(120),
    /** ISO-8601 instant (the frozen dueAt law shape; strict parse in the
     *  service with the verbatim message). */
    dueAt: z.string().min(1),
    classId: z.union([z.string().uuid(), z.null()]).optional(),
    /** the ordered task list — Seneca resource ids, deduped server-side
     *  (insertion order preserved, the frozen LinkedHashSet law's mold).
     *  1..60 (the frozen specRefs size band). */
    resourceIds: z.array(z.string().min(1).max(64)).min(1).max(60),
  })
  .superRefine((v, ctx) => {
    const seen = new Set<string>();
    for (const id of v.resourceIds) {
      if (seen.has(id)) {
        ctx.addIssue({ code: "custom", message: "resourceIds must not repeat" });
        return;
      }
      seen.add(id);
    }
  });
export type AssignmentPackCreateRequest = z.infer<typeof assignmentPackCreateRequestSchema>;

// ── shared: the pack task view (teacher preview + learner detail) ───────────

/** Full task content. `questionMd` is the RAW Seneca template (may carry
 *  $var placeholders + a generationScript) — instantiation is CLIENT-side
 *  (D8: the API never evals corpus scripts). `markSchemeMd` is reveal-on-
 *  demand. Sections carry `notesMd`; quizzes carry `quizSummaryMd`. */
export const assignmentPackTaskSchema = z.object({
  resourceId: z.string().min(1),
  position: z.number().int().min(1),
  kind: assignmentPackResourceKindSchema,
  title: z.string().nullish(),
  topicPath: z.string().nullish(),
  marksTotal: z.number().int().nullish(),
  questionType: z.string().nullish(),
  questionMd: z.string().nullish(),
  markSchemeMd: z.string().nullish(),
  notesMd: z.string().nullish(),
  quizSummaryMd: z.string().nullish(),
  generationScript: z.string().nullish(),
});
export type AssignmentPackTask = z.infer<typeof assignmentPackTaskSchema>;

// ── teacher + learner: pack detail (tasks + my/roster state rides the
//    EXISTING submissions endpoints, so this view is stateless) ─────────────

export const assignmentPackDetailViewSchema = z.object({
  assignmentId: z.string().uuid(),
  title: z.string(),
  courseSlug: z.string(),
  courseLabel: z.string(),
  marksTotal: z.number().int().min(1),
  questionCount: z.number().int().min(1),
  dueAt: z.string(),
  status: z.string(),
  tasks: z.array(assignmentPackTaskSchema),
});
export type AssignmentPackDetailView = z.infer<typeof assignmentPackDetailViewSchema>;

// ── learner: per-task state + completion ────────────────────────────────────

export const assignmentPackTaskStateSchema = z.object({
  resourceId: z.string(),
  status: z.enum(["todo", "complete"]),
  marksAwarded: z.number().int().nullish(),
  score: z.number().nullish(),
  completedAt: z.string().nullish(),
});
export type AssignmentPackTaskState = z.infer<typeof assignmentPackTaskStateSchema>;

export const assignmentPackStatesViewSchema = z.object({
  assignmentId: z.string().uuid(),
  states: z.array(assignmentPackTaskStateSchema),
});
export type AssignmentPackStatesView = z.infer<typeof assignmentPackStatesViewSchema>;

export const assignmentPackCompleteRequestSchema = z
  .object({
    /** exam questions only — clamped 0..marksTotal server-side; sections
     *  and quizzes ignore it (completion = full credit). */
    marksAwarded: z.number().int().min(0).max(1000).nullish(),
  })
  .superRefine((v, ctx) => {
    if (v.marksAwarded != null && v.marksAwarded < 0) {
      ctx.addIssue({ code: "custom", message: "marksAwarded must be >= 0" });
    }
  });
export type AssignmentPackCompleteRequest = z.infer<typeof assignmentPackCompleteRequestSchema>;

export const assignmentPackCompleteResponseSchema = z.object({
  state: assignmentPackTaskStateSchema,
  /** derived pack-level numbers the learner hands in (questionsCompleted =
   *  tasks complete, score = integer marks) — the SAME derive-then-hand-in
   *  shape the practice flow uses. */
  questionsCompleted: z.number().int().min(0),
  score: z.number().int().min(0),
});
export type AssignmentPackCompleteResponse = z.infer<typeof assignmentPackCompleteResponseSchema>;

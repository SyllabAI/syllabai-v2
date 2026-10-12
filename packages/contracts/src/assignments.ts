/**
 * Teacher assignments wire — the B2 decommission band (T-MIG-117; frozen
 * @ 6cad6ef, syllabai-core TeacherAssignmentController.java :271-288):
 *
 *   - CreateRequest  title @NotBlank @Size(min 1, max 200)
 *                    courseSlug @NotBlank @Size(min 1, max 64)
 *                      @Pattern ^[a-z0-9-]+$ "course slug must be the hub
 *                      course slug"
 *                    courseLabel @NotBlank @Size(min 1, max 120)
 *                    specRefs @NotNull @Size(min 1, max 60) List of
 *                      @NotBlank @Size(min 2, max 40)
 *                      @Pattern ^[A-Za-z0-9._-]+$ "spec refs are
 *                      curriculum codes"
 *                    marksTotal @NotNull @Min(1) @Max(1000)
 *                    questionCount @NotNull @Min(1) @Max(200)
 *                    dueAt @NotBlank (ISO-8601 instant — SERVICE law,
 *                      "dueAt must be an ISO-8601 instant: {raw}")
 *                    classId optional UUID (V51; null = the V49
 *                      whole-cohort default)
 *   - StatusRequest  status @NotBlank (tolerant parse in the service:
 *                      "open"/"closed" trim+lowercase else
 *                      'status must be "open" or "closed": {raw}')
 *   - The RESPONSE views REUSE the canonical shapes already ported in
 *     learner.ts (the same Java file, AssignmentViews.java): AssignmentView
 *     (:17-36) + AssignmentSubmissionView (:62-70). This module adds the
 *     TEACHER-side envelopes the learner wire never carried:
 *     AssignmentSummaryView (:39-45) + AssignmentRosterRow/View (:47-58).
 *
 * Contracts-first rule 1: constraints copied EXACTLY; the Java record wins.
 * The parse/resolve laws (Assignment.Status.parse, the structural target
 * gate, the V51 class gate, the dueAt parse) are SERVICE law — they live
 * in services/teacher-assignments next to their pin tests.
 *
 * JACKSON SCALAR-COERCION LAW (captured of record, golden-captures/
 * t-mig-117/g07/g14/g15/g17/g18/g19/g20 — the rig boots of 2026-10-12):
 * Jackson's default scalar coercion binds a JSON number/boolean INTO a
 * String field (title: 7 → "7" serves 201; status: 3 → the service parse
 * sees "3"), and a JSON numeric string/decimal INTO an int field
 * (marksTotal: 10.5 → 10, "10" → 10 — both 201), while booleans do NOT
 * coerce into int (malformed_body) and UUID fields stay strict (number →
 * malformed_body). The schemas below reproduce that binding layer with an
 * explicit coerce union BEFORE the constraint pipe; the notBlank/notNull
 * null-laws render from the classifier on the null/undefined received.
 * The constraint laws render via superRefine blocks in the jakarta
 * first-error order (refine() would break the zod chain AND evaluate
 * after the format checks — the captured order is @NotBlank first).
 *
 * OUT-OF-FENCE FLAG (T-MIG-117, R0 ratification requested): this file +
 * the index.ts export one-liner are the contracts the two-envelope route
 * law requires (the #58 contracts precedent for the marking band; the
 * 010/034/043-t1 out-of-fence precedent). The T-MIG-117 card's
 * scope.allowed did not list packages/contracts — flagged here and in the
 * PR for the desk.
 */
import { z } from "zod";
import { assignmentViewSchema } from "./learner";

/** Jackson's default scalar coercion into String (g07/g14/g15/g19/g20). */
const jacksonString = z
  .union([z.string(), z.number(), z.boolean()])
  .transform((v) => String(v));

/** Jackson's int binding: numbers truncate toward zero (g17: 10.5 → 10),
 *  numeric strings coerce (g18: "10" → 10), booleans/objects bind-fail
 *  (g16) — the sentinel message marks the binding class for the route
 *  classifier (exported; the classifier keys on it). */
export const JACKSON_BINDING = "__jackson_binding_failure__";
const jacksonInt = z
  .union([
    z.number().transform((n) => Math.trunc(n)),
    z
      .string()
      .refine((s) => /^-?\d+(\.\d+)?$/.test(s), { message: JACKSON_BINDING }),
  ])
  .transform((v) => (typeof v === "number" ? v : Number(v)));

/** An ordered single-issue checker: jakarta evaluates constraints in
 *  declaration order and @Valid reports the FIRST violation — the
 *  superRefine block reproduces that exactly (code "custom" renders
 *  verbatim through the classifier). */
const ordered = (law: (s: string) => string | null) =>
  z.string().superRefine((s, ctx) => {
    const violation = law(s);
    if (violation != null) {
      ctx.addIssue({ code: "custom", message: violation });
    }
  });

const sizeMsg = (min: number, max: number) => `size must be between ${min} and ${max}`;

/** spec ref element — jakarta order: @NotBlank, @Size(2,40), @Pattern
 *  (the captured first-error order: "" → "must not be blank", "x" →
 *  "size must be between 2 and 40", "bad ref!" → "spec refs are
 *  curriculum codes", 41 chars → the size message). */
const specRefSchema = jacksonString.pipe(
  ordered((s) => {
    if (s.trim().length === 0) return "must not be blank";
    if (s.length > 40 || s.length < 2) return sizeMsg(2, 40);
    if (!/^[A-Za-z0-9._-]+$/.test(s)) return "spec refs are curriculum codes";
    return null;
  }),
);

const titleSchema = jacksonString.pipe(
  ordered((s) => {
    if (s.trim().length === 0) return "must not be blank";
    if (s.length > 200) return sizeMsg(1, 200);
    return null;
  }),
);

const courseSlugSchema = jacksonString.pipe(
  ordered((s) => {
    if (s.trim().length === 0) return "must not be blank";
    if (s.length > 64) return sizeMsg(1, 64);
    if (!/^[a-z0-9-]+$/.test(s)) return "course slug must be the hub course slug";
    return null;
  }),
);

const courseLabelSchema = jacksonString.pipe(
  ordered((s) => {
    if (s.trim().length === 0) return "must not be blank";
    if (s.length > 120) return sizeMsg(1, 120);
    return null;
  }),
);

const dueAtSchema = jacksonString.pipe(
  ordered((s) => (s.trim().length === 0 ? "must not be blank" : null)),
);

export const assignmentCreateRequestSchema = z.object({
  title: titleSchema,
  courseSlug: courseSlugSchema,
  courseLabel: courseLabelSchema,
  specRefs: z
    .array(specRefSchema)
    .min(1, sizeMsg(1, 60))
    .max(60, sizeMsg(1, 60)),
  marksTotal: jacksonInt.pipe(
    z
      .number()
      .int()
      .min(1, "must be greater than or equal to 1")
      .max(1000, "must be less than or equal to 1000"),
  ),
  questionCount: jacksonInt.pipe(
    z
      .number()
      .int()
      .min(1, "must be greater than or equal to 1")
      .max(200, "must be less than or equal to 200"),
  ),
  dueAt: dueAtSchema,
  classId: z.union([z.string().uuid(), z.null()]).optional(),
});
export type AssignmentCreateRequest = z.infer<typeof assignmentCreateRequestSchema>;

export const assignmentStatusRequestSchema = z.object({
  status: jacksonString.pipe(
    ordered((s) => (s.trim().length === 0 ? "must not be blank" : null)),
  ),
});
export type AssignmentStatusRequest = z.infer<typeof assignmentStatusRequestSchema>;

// ── the teacher-side response envelopes (AssignmentViews :39-58) ────────────

/** AssignmentSummaryView — list-row stats over the enabled STUDENT cohort
 *  (or the V51 class target); meanScore null until a scored hand-in. */
export const assignmentSummaryViewSchema = z.object({
  assignment: assignmentViewSchema,
  submitted: z.number().int().min(0),
  late: z.number().int().min(0),
  missing: z.number().int().min(0),
  meanScore: z.union([z.number(), z.null()]),
});
export type AssignmentSummaryView = z.infer<typeof assignmentSummaryViewSchema>;

/** AssignmentRosterRow — one roster row per enabled cohort member;
 *  state "complete" | "late" | "missing" (the hub's roster vocabulary). */
export const assignmentRosterRowSchema = z.object({
  learnerId: z.string().uuid(),
  displayName: z.string(),
  state: z.string(),
  submittedAt: z.union([z.string(), z.null()]),
  score: z.union([z.number().int(), z.null()]),
  questionsCompleted: z.union([z.number().int(), z.null()]),
});
export type AssignmentRosterRow = z.infer<typeof assignmentRosterRowSchema>;

/** AssignmentRosterView (:58). */
export const assignmentRosterViewSchema = z.object({
  assignment: assignmentViewSchema,
  rows: z.array(assignmentRosterRowSchema),
});
export type AssignmentRosterView = z.infer<typeof assignmentRosterViewSchema>;

/**
 * Classroom/teacher foundation wire — the V51/TFA-01/TFA-02 classes+rosters
 * band (T-MIG-052 tranche 1; frozen @ 6cad6ef, syllabai-core):
 *
 *   - TeacherClassView / ClassMemberView / TeacherClassDetailView /
 *     TeacherAnnouncementView
 *       (src/main/java/com/syllabai/classroom/dto/ClassroomViews.java —
 *        the teacher-side records over /api/v1/teacher/classes; status is
 *        the SchoolClass.Status WIRE form "active" | "archived"; category
 *        is the Announcement.Category WIRE form kebab-case
 *        "exam-reminder"; course refs are OPAQUE hub-owned strings —
 *        core has no course registry and does not pretend to).
 *   - LearnerClassView / LearnerAnnouncementView / LearnerClassroomView
 *       (ClassroomViews.java — the learner overlay; the independent-
 *        student rule makes the EMPTY overview an honest empty, never an
 *        error).
 *   - LearnerRosterView
 *       (src/main/java/com/syllabai/teacher/dto/TeacherViews.java :28-35 —
 *        the identity-projection roster GET /api/v1/teacher/learners
 *        serves; the residual the T-MIG-049 W3-remainder contracts lane
 *        disclosed as NOT claimed. No learning data on this wire by the
 *        V49 ruling — the marking queue and /state carry that).
 *   - Request bodies (TeacherClassController :265-290):
 *       CreateRequest  courseSlug @NotBlank @Size(max 64),
 *                      courseLabel @NotBlank @Size(max 120),
 *                      name @NotBlank @Size(max 120)
 *       EnrollRequest  email @NotBlank @Size(max 254)
 *       PublishRequest title @NotBlank @Size(max 200), body @NotBlank,
 *                      category @Size(max 20) — OPTIONAL (null/blank
 *                      parses to GENERAL per Announcement.Category.parse)
 *       StatusRequest  status @NotBlank (tolerant parse in the service;
 *                      the schema validates shape only)
 *   - ReadResult (LearnerClassroomController :150-151 — the markRead wire:
 *        { id, read: true }).
 *
 * Contracts-first rule 1: constraints copied EXACTLY; the Java record wins.
 * The parse/wire laws (Status.parse/.wire, Category.parse/.wire) are
 * SERVICE law — they live in services/classroom next to their pin tests,
 * per the parseFlashcardRating precedent (services/learner-me).
 * OWNED BY T-MIG-052 (r9-hubx) — id ratification requested at PR review.
 *
 * T-MIG-056 AMENDMENT (r0 lane, the registered follow-up on the 052 DONE
 * card; adopted from the closed #90 branch's disclosed contracts amendment
 * with prior-art credit): the four request schemas swap bare `.min(1)` for
 * the auth.ts `notBlank` refine — the @NotBlank-exact port. jakarta
 * @NotBlank rejects null, "" AND whitespace-only values at @Valid (BEFORE
 * the controller body), so the frozen wire answers 400 validation_failed
 * "field: must not be blank"; .min(1) let "   " through to the service's
 * trim-blank 400 (bad_request envelope) — a status-correct but
 * envelope-divergent shortcut. Chain order per the auth.ts zod-3 note:
 * max FIRST, refine LAST (zod skips refinements when an earlier check
 * fails; jakarta evaluates all constraints and rejects on any violation —
 * accept/reject sets match). `category` widens to nullish(): Jackson binds
 * an explicit JSON null the same as an absent field, and
 * Announcement.Category.parse(null) -> GENERAL — both are the frozen 201.
 * The t1 service verbatim 400s stay as the controller-law defense (frozen
 * dead-code through @Valid; pinned at the service level by tranche-1).
 */
import { z } from "zod";
import { notBlank } from "./auth";

// ── teacher side ─────────────────────────────────────────────────────────────

/** TeacherClassView — the list row: the class + live member count. */
export const teacherClassViewSchema = z.object({
  id: z.string().uuid(),
  courseSlug: z.string(),
  courseLabel: z.string(),
  name: z.string(),
  status: z.string(),
  memberCount: z.number().int().min(0),
  createdAt: z.string(),
});
export type TeacherClassView = z.infer<typeof teacherClassViewSchema>;

/** ClassMemberView — one roster row: the student + enrollment provenance. */
export const classMemberViewSchema = z.object({
  studentId: z.string().uuid(),
  displayName: z.string(),
  email: z.string(),
  enrolledBy: z.string().uuid(),
  enrolledAt: z.string(),
});
export type ClassMemberView = z.infer<typeof classMemberViewSchema>;

/** TeacherClassDetailView — the class + its full roster. */
export const teacherClassDetailViewSchema = z.object({
  id: z.string().uuid(),
  courseSlug: z.string(),
  courseLabel: z.string(),
  name: z.string(),
  status: z.string(),
  createdAt: z.string(),
  members: z.array(classMemberViewSchema),
});
export type TeacherClassDetailView = z.infer<typeof teacherClassDetailViewSchema>;

/** TeacherAnnouncementView — content + read-state count over the roster. */
export const teacherAnnouncementViewSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  body: z.string(),
  category: z.string(),
  readCount: z.number().int().min(0),
  memberCount: z.number().int().min(0),
  createdAt: z.string(),
});
export type TeacherAnnouncementView = z.infer<typeof teacherAnnouncementViewSchema>;

// ── learner side (the classroom overlay) ─────────────────────────────────────

/** LearnerClassView — my-class row: the class + MY unread count. */
export const learnerClassViewSchema = z.object({
  id: z.string().uuid(),
  courseSlug: z.string(),
  courseLabel: z.string(),
  name: z.string(),
  teacherName: z.string(),
  unreadAnnouncements: z.number().int().min(0),
  enrolledAt: z.string(),
});
export type LearnerClassView = z.infer<typeof learnerClassViewSchema>;

/** LearnerAnnouncementView — content + whether THIS student has read it. */
export const learnerAnnouncementViewSchema = z.object({
  id: z.string().uuid(),
  classId: z.string().uuid(),
  className: z.string(),
  courseSlug: z.string(),
  teacherName: z.string(),
  title: z.string(),
  body: z.string(),
  category: z.string(),
  read: z.boolean(),
  createdAt: z.string(),
});
export type LearnerAnnouncementView = z.infer<typeof learnerAnnouncementViewSchema>;

/** LearnerClassroomView — my classes + the flattened unread badge. */
export const learnerClassroomViewSchema = z.object({
  classes: z.array(learnerClassViewSchema),
  unreadAnnouncements: z.number().int().min(0),
});
export type LearnerClassroomView = z.infer<typeof learnerClassroomViewSchema>;

// ── roster (the V49 ruling surface) ──────────────────────────────────────────

/** TeacherViews.LearnerRosterView (:28-35) — identity projection ONLY. */
export const learnerRosterViewSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string(),
  email: z.string(),
  createdAt: z.string(),
});
export type LearnerRosterView = z.infer<typeof learnerRosterViewSchema>;

// ── request bodies (TeacherClassController :265-290 — constraints verbatim) ──

/** POST /api/v1/teacher/classes body — CreateRequest (@NotBlank @Size 64/120/120). */
export const classCreateRequestSchema = z.object({
  courseSlug: z.string().max(64).refine(notBlank("must not be blank"), "must not be blank"),
  courseLabel: z.string().max(120).refine(notBlank("must not be blank"), "must not be blank"),
  name: z.string().max(120).refine(notBlank("must not be blank"), "must not be blank"),
});
export type ClassCreateRequest = z.infer<typeof classCreateRequestSchema>;

/** POST /api/v1/teacher/classes/{id}/status body — StatusRequest. */
export const classStatusRequestSchema = z.object({
  status: z.string().refine(notBlank("must not be blank"), "must not be blank"),
});
export type ClassStatusRequest = z.infer<typeof classStatusRequestSchema>;

/** POST /api/v1/teacher/classes/{id}/members body — EnrollRequest (@NotBlank @Size(max 254)). */
export const classEnrollRequestSchema = z.object({
  email: z.string().max(254).refine(notBlank("must not be blank"), "must not be blank"),
});
export type ClassEnrollRequest = z.infer<typeof classEnrollRequestSchema>;

/**
 * POST /api/v1/teacher/classes/{id}/announcements body — PublishRequest.
 * category OPTIONAL: absent/blank parses to GENERAL (Announcement.Category
 * .parse null/blank → GENERAL); the 400 on an UNKNOWN value is service law
 * (the frozen verbatim message), not schema law.
 */
export const classPublishRequestSchema = z.object({
  title: z.string().max(200).refine(notBlank("must not be blank"), "must not be blank"),
  body: z.string().refine(notBlank("must not be blank"), "must not be blank"),
  category: z.string().max(20).nullish(),
});
export type ClassPublishRequest = z.infer<typeof classPublishRequestSchema>;

/** POST /api/v1/learners/me/classroom/announcements/{id}/read response —
 *  LearnerClassroomController.ReadResult (:150-151). */
export const announcementReadResultSchema = z.object({
  id: z.string().uuid(),
  read: z.boolean(),
});
export type AnnouncementReadResult = z.infer<typeof announcementReadResultSchema>;

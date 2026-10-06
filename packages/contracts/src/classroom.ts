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
 */
import { z } from "zod";

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

/** POST /api/v1/teacher/classes body — CreateRequest. */
export const classCreateRequestSchema = z.object({
  courseSlug: z.string().min(1).max(64),
  courseLabel: z.string().min(1).max(120),
  name: z.string().min(1).max(120),
});
export type ClassCreateRequest = z.infer<typeof classCreateRequestSchema>;

/** POST /api/v1/teacher/classes/{id}/status body — StatusRequest. */
export const classStatusRequestSchema = z.object({
  status: z.string().min(1),
});
export type ClassStatusRequest = z.infer<typeof classStatusRequestSchema>;

/** POST /api/v1/teacher/classes/{id}/members body — EnrollRequest. */
export const classEnrollRequestSchema = z.object({
  email: z.string().min(1).max(254),
});
export type ClassEnrollRequest = z.infer<typeof classEnrollRequestSchema>;

/**
 * POST /api/v1/teacher/classes/{id}/announcements body — PublishRequest.
 * category OPTIONAL: absent/blank parses to GENERAL (Announcement.Category
 * .parse null/blank → GENERAL); the 400 on an UNKNOWN value is service law
 * (the frozen verbatim message), not schema law.
 */
export const classPublishRequestSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1),
  category: z.string().max(20).optional(),
});
export type ClassPublishRequest = z.infer<typeof classPublishRequestSchema>;

/** POST /api/v1/learners/me/classroom/announcements/{id}/read response —
 *  LearnerClassroomController.ReadResult (:150-151). */
export const announcementReadResultSchema = z.object({
  id: z.string().uuid(),
  read: z.boolean(),
});
export type AnnouncementReadResult = z.infer<typeof announcementReadResultSchema>;

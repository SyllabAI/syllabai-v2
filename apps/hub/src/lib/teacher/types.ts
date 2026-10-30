import type { ClassOverview } from "./class-sim";

/**
 * Shared API payload types for the teacher lens surfaces (TEACHER-2).
 * Mirrors GET /api/teacher/course-data.
 */

export interface BankStats {
  totalQuestions: number;
  totalMarks: number;
}

export interface SwitchableCourse {
  slug: string;
  label: string;
  code: string;
  level: string;
  /** CD-A-hub: the explicit core curriculum-version code (courses.json,
   *  V53/ADR-030) — the ONLY of-record input to the weakness lane's
   *  slug→rootId bridge. Absent = the course is not registered with the
   *  core; the live lane fail-closes to the labeled sample fallback. */
  curriculumCode?: string;
}

export interface TeacherCourseData {
  class: ClassOverview;
  bank: BankStats;
  switchable: SwitchableCourse[];
}

/**
 * Study-Plan Builder — the pure view mappers (spec §5.3; prereg of record
 * docs/STUDY-PLAN-BUILDER-PLAN.md).
 *
 * Api-free and React-free BY DESIGN: these functions are pure functions of
 * the server payload (the DC-7 subscription's wire shape), so the pins can
 * run without instantiating the api module (whose module-level env binding
 * is the api.v2-surface.test.ts dual-run posture's to set). The counters
 * are the API's — the client never recomputes them ("never a local
 * counter").
 */

export interface StudyPlanSeason {
  label: string;
  examYear: number;
  examMonth: number;
}

export interface StudyPlanConfig {
  courses: string[];
  seasons: Record<string, StudyPlanSeason>;
  weekdayMinutes: number;
  weekendMinutes: number;
  createdAt: string;
  updatedAt: string;
}

export interface PlanTaskView {
  taskId: string;
  type: "REVISE" | "PRACTISE";
  courseSlug: string;
  subtopicCode: string;
  subtopicTitle: string;
  noteId?: string;
  minutes: number;
  date: string;
  complete: boolean;
  autoCompletedBy: "NOTE_CHECK" | "MARKED_PARTS" | null;
  markedParts?: number;
  threshold?: number;
}

export interface PlanDayView {
  date: string;
  dayOfWeek: number;
  tasks: PlanTaskView[];
}

export interface PlanCourseView {
  courseSlug: string;
  label: string | null;
  season: StudyPlanSeason;
  subtopicCount: number;
  cycleEndsOn: string | null;
}

export interface PlanWeekView {
  weekStart: string;
  weekEnd: string;
  today: string;
  days: PlanDayView[];
  courses: PlanCourseView[];
  counters: {
    todayTotal: number;
    todayCompleted: number;
    weekTotal: number;
    weekCompleted: number;
    percentToday: number;
  };
  goal: { coversInTime: boolean; cyclesNeeded: number };
}

export interface StudyPlanPayload {
  plan: StudyPlanConfig;
  week: PlanWeekView;
  builtAt: string;
}

export interface StudyPlanDefaults {
  courses: Array<{
    courseSlug: string;
    label: string | null;
    level: string | null;
    board: string | null;
    selected: boolean;
  }>;
  seasons: Record<string, StudyPlanSeason>;
  weekdayMinutes: number;
  weekendMinutes: number;
}

export interface StudyPlanUpsertBody {
  courses: string[];
  seasons: Record<string, StudyPlanSeason>;
  weekdayMinutes: number;
  weekendMinutes: number;
}

/** the rail's counter copy of record (spec §5.3: "You've completed 1 of 4
 * tasks today") — null when there is no plan payload to count from. */
export function railTodayCopy(payload: StudyPlanPayload | null): string | null {
  if (!payload) return null;
  const { todayCompleted, todayTotal } = payload.week.counters;
  return `You've completed ${todayCompleted} of ${todayTotal} tasks today`;
}

/** the goal card's honest claim (prereg §2.3): the observed "covers every
 * topic in time for exams" only when the measured coverage says so. */
export function goalCopy(payload: StudyPlanPayload): string {
  return payload.week.goal.coversInTime
    ? "Your plan covers every topic in time for exams"
    : `Your plan covers every topic in ${payload.week.goal.cyclesNeeded} ${payload.week.goal.cyclesNeeded === 1 ? "cycle" : "cycles"}`;
}

/** the deep link of record: Revise lands on the actual note page (the
 * observed product's "clicking the revise chip landed on the actual note
 * page"); Practise lands on the course's exam-questions surface. */
export function taskHref(task: PlanTaskView): string {
  if (task.type === "REVISE" && task.noteId) {
    return `/courses/${task.courseSlug}/revision-notes/${task.noteId}`;
  }
  return `/courses/${task.courseSlug}/exam-questions`;
}

/** the task's completion provenance microcopy (the projection's evidence) */
export function completionCopy(task: PlanTaskView): string | null {
  if (!task.complete || !task.autoCompletedBy) return null;
  if (task.autoCompletedBy === "NOTE_CHECK") return "Auto-completed — the revision note is checked";
  return `Auto-completed — ${task.markedParts ?? 0} of ${task.threshold ?? 5} marked parts`;
}

/** the weekday label of record for the day strip (UTC dates, Sun=0) */
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function dayName(dayOfWeek: number): string {
  return DAY_NAMES[dayOfWeek] ?? "";
}

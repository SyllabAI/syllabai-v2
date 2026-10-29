/**
 * Study-Plan Builder — hub view-mapping pins (lib/study-plan-client.ts;
 * spec §5.3, prereg docs/STUDY-PLAN-BUILDER-PLAN.md).
 *
 * The rail copy, the goal card's honest claim, the deep links of record and
 * the completion provenance microcopy are pure functions of the server
 * payload — pinned here so the wire shape and the copy laws cannot drift.
 * The counters themselves are the API's (pinned server-side); the client
 * never recomputes them ("never a local counter").
 */
import { describe, expect, test } from "bun:test";
import {
  completionCopy,
  dayName,
  goalCopy,
  railTodayCopy,
  taskHref,
  type PlanTaskView,
  type StudyPlanPayload,
} from "./study-plan-view";

const payload = (counters?: Partial<StudyPlanPayload["week"]["counters"]>, goal?: Partial<StudyPlanPayload["week"]["goal"]>): StudyPlanPayload => ({
  plan: {
    courses: ["igcse-chemistry-19"],
    seasons: { "igcse-chemistry-19": { label: "Summer", examYear: 2028, examMonth: 6 } },
    weekdayMinutes: 120,
    weekendMinutes: 0,
    createdAt: "2026-10-19T09:00:00.000Z",
    updatedAt: "2026-10-19T09:00:00.000Z",
  },
  week: {
    weekStart: "2026-10-19",
    weekEnd: "2026-10-25",
    today: "2026-10-23",
    days: [],
    courses: [
      {
        courseSlug: "igcse-chemistry-19",
        label: "IGCSE Chemistry",
        season: { label: "Summer", examYear: 2028, examMonth: 6 },
        subtopicCount: 2,
        cycleEndsOn: "2026-10-19",
      },
    ],
    counters: {
      todayTotal: 4,
      todayCompleted: 1,
      weekTotal: 20,
      weekCompleted: 5,
      percentToday: 25,
      ...counters,
    },
    goal: { coversInTime: true, cyclesNeeded: 1, ...goal },
  },
  builtAt: "2026-10-23T08:00:00.000Z",
});

const task = (overrides: Partial<PlanTaskView>): PlanTaskView => ({
  taskId: "practise:4CH1-S1-a",
  type: "PRACTISE",
  courseSlug: "igcse-chemistry-19",
  subtopicCode: "4CH1-S1-a",
  subtopicTitle: "The Microscope in Cell Studies",
  minutes: 45,
  date: "2026-10-23",
  complete: false,
  autoCompletedBy: null,
  ...overrides,
});

describe("Study-Plan Builder hub — the rail copy of record", () => {
  test("the observed 'You've completed 1 of 4 tasks today' derives from the payload", () => {
    expect(railTodayCopy(payload())).toBe("You've completed 1 of 4 tasks today");
    expect(railTodayCopy(payload({ todayCompleted: 0, todayTotal: 4, percentToday: 0 }))).toBe(
      "You've completed 0 of 4 tasks today",
    );
  });

  test("no payload → no copy (the rail's Create posture, never an invented count)", () => {
    expect(railTodayCopy(null)).toBeNull();
  });
});

describe("Study-Plan Builder hub — the goal card's honest claim", () => {
  test("coversInTime renders the observed copy only when the measurement says so", () => {
    expect(goalCopy(payload())).toBe("Your plan covers every topic in time for exams");
    expect(goalCopy(payload(undefined, { coversInTime: false, cyclesNeeded: 2 }))).toBe(
      "Your plan covers every topic in 2 cycles",
    );
    expect(goalCopy(payload(undefined, { coversInTime: false, cyclesNeeded: 1 }))).toBe(
      "Your plan covers every topic in 1 cycle",
    );
  });
});

describe("Study-Plan Builder hub — the deep links of record", () => {
  test("the Revise chip lands on the actual note page (the observed product's law)", () => {
    expect(taskHref(task({ type: "REVISE", noteId: "note-1", minutes: 15, taskId: "revise:note-1" }))).toBe(
      "/courses/igcse-chemistry-19/revision-notes/note-1",
    );
  });

  test("the Practise chip lands on the course's exam-questions surface", () => {
    expect(taskHref(task({ type: "PRACTISE" }))).toBe("/courses/igcse-chemistry-19/exam-questions");
    // a REVISE ref without a note id (no notes in the subtopic — the pairing
    // law) falls back to the exam-questions surface, never a broken link
    expect(taskHref(task({ type: "REVISE" }))).toBe("/courses/igcse-chemistry-19/exam-questions");
  });
});

describe("Study-Plan Builder hub — the completion provenance microcopy", () => {
  test("auto-completed tasks disclose their projection evidence", () => {
    expect(completionCopy(task({ complete: true, autoCompletedBy: "NOTE_CHECK" }))).toBe(
      "Auto-completed — the revision note is checked",
    );
    expect(
      completionCopy(task({ complete: true, autoCompletedBy: "MARKED_PARTS", markedParts: 5, threshold: 5 })),
    ).toBe("Auto-completed — 5 of 5 marked parts");
    expect(completionCopy(task({ complete: false, autoCompletedBy: null }))).toBeNull();
  });

  test("the day strip's weekday labels", () => {
    expect(dayName(1)).toBe("Mon");
    expect(dayName(5)).toBe("Fri");
    expect(dayName(0)).toBe("Sun");
  });
});

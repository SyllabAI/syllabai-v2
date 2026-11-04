/**
 * Probe-fixture source-filter tests (tier-3 follow-up item 3, dashboard UX
 * review 2026-11-04): join-code probe rows were seeded with class_id = NULL
 * and the V49 law makes NULL-class rows visible to EVERY student, so the
 * probe account's homework leaked into every learner's assignment list and
 * agenda. fetchAssignmentLists now drops synthetic titles at the source —
 * the single choke point both surfaces read.
 *
 * deps.sql is faked by template-string match; rows are pre-ordered the way
 * the real queries return them (list: created_at desc) so the ordering laws
 * are exercised, not assumed.
 */
import { describe, expect, it } from "bun:test";
import { buildAgenda, learnerAssignments } from "./index";
import type { FlashcardRatingRecordDeps } from "./index";

const ROW = (
  id: string,
  title: string,
  dueAt: string,
  createdAt: string,
  classId: string | null = null,
) => ({
  id,
  title,
  course_slug: "igcse-chemistry-19",
  course_label: "Chemistry",
  spec_refs: [],
  marks_total: 20,
  question_count: 10,
  due_at: dueAt,
  status: "open",
  class_id: classId,
  created_at: createdAt,
});

// created_at desc — the list endpoint's order of record.
const ASSIGNMENT_ROWS = [
  ROW("a7", "probe late asprobe_999", "1970-01-01T00:00:00.000Z", "2026-10-04T10:00:00Z", "cls-2"),
  ROW("a6", "Class homework", "2026-11-20T09:00:00Z", "2026-10-03T10:00:00Z", "cls-1"),
  ROW("a5", "Probe design lab", "2026-12-02T09:00:00Z", "2026-10-02T10:00:00Z"),
  ROW("a4", "Temperature probes", "2026-12-01T09:00:00Z", "2026-10-01T10:00:00Z"),
  ROW("a3", "probe assignment asprobe_1790628651", "2026-10-05T20:51:03Z", "2026-09-25T10:00:00Z"),
  ROW("a2", "Chemistry - Targeted Practice", "2026-10-05T17:59:00Z", "2026-09-20T10:00:00Z"),
  ROW("a1", "probe late asprobe_1790628651", "1970-01-01T00:00:00.000Z", "2026-09-01T10:00:00Z"),
];

const deps: FlashcardRatingRecordDeps = {
  clock: {
    now: () => new Date("2026-11-04T12:00:00Z"),
    newId: () => "00000000-0000-4000-8000-000000000000",
  },
  sql: (async (strings: TemplateStringsArray) => {
    const q = strings.join("?").toLowerCase();
    if (q.includes("from assignment_submissions")) return [];
    if (q.includes("from assignments")) return ASSIGNMENT_ROWS;
    if (q.includes("from class_members")) return [{ one: 1 }]; // member of every class
    return []; // review_schedules / knowledge_nodes / exam-series helpers
  }) as unknown as FlashcardRatingRecordDeps["sql"],
};

describe("learner assignment surfaces — synthetic probe rows stop at the source", () => {
  it("GET /assignments: probe fixtures filtered, real work survives", async () => {
    const rows = await learnerAssignments(deps, "learner-1");
    expect(rows.map((r) => r.assignment.title)).toEqual([
      "Class homework",
      "Temperature probes",
      "Chemistry - Targeted Practice",
    ]);
  });

  it("GET /agenda: same filter, agenda re-order intact (dueAt asc)", async () => {
    const agenda = await buildAgenda(deps, "learner-1");
    expect(agenda.assignments.map((r) => r.assignment.title)).toEqual([
      "Chemistry - Targeted Practice", // due 2026-10-05T17:59
      "Class homework", // due 2026-11-20
      "Temperature probes", // due 2026-12-01
    ]);
    expect(agenda.assignments.some((r) => r.assignment.title.includes("asprobe"))).toBe(false);
    expect(agenda.assignments.some((r) => r.assignment.dueAt.startsWith("1970"))).toBe(false);
  });

  it("a real title with 'probes' inside survives the filter", async () => {
    const rows = await learnerAssignments(deps, "learner-1");
    expect(rows.map((r) => r.assignment.title)).toContain("Temperature probes");
  });
});

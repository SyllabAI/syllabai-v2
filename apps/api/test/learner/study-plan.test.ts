/**
 * Study-Plan Builder pins (services/learner/study-plan.ts; spec §5.3 +
 * roadmap Table 3 P2 row, prereg docs/STUDY-PLAN-BUILDER-PLAN.md).
 *
 * The Table-3 gate of record, pinned here over the repo's fakeSql module
 * harness (the engagement-recorder.test.ts / progress-rollup.test.ts style):
 *   "Generated week from tree; Revise auto-complete; Practise threshold"
 *
 * Fixture: course igcse-chemistry-19 (code 4CH1) — subject 4CH1 → topic
 * 4CH1-S1 → subtopics 4CH1-S1-a ("The Microscope in Cell Studies") /
 * 4CH1-S1-b ("Cell Structure") → spec points 4CH1-1.1 / 4CH1-2.1; note-1
 * maps 4CH1-1.1, note-2 maps 4CH1-2.1; q1 (MCQ) touches topic 4CH1-S1 +
 * spec point 4CH1-1.1, q2 (structured) touches 4CH1-2.1. Second course
 * cie-a-level-physics-25 (code 9702): subtopic 9702-S1-a ("Kinematics"),
 * note-3 maps 9702-1.1.
 *
 * Clock of record: NOW = Friday 2026-10-23T08:00:00Z (UTC); the plan anchor
 * is Monday 2026-10-19T09:00:00Z — the rendered week is 2026-10-19..25 and
 * today is 2026-10-23.
 */
import { describe, expect, test } from "bun:test";
import {
  STUDY_PLAN_DEFAULT_WEEKDAY_MINUTES,
  STUDY_PLAN_DEFAULT_WEEKEND_MINUTES,
  STUDY_PLAN_PRACTISE_MINUTES,
  STUDY_PLAN_REVISE_MINUTES,
  defaultExamSeason,
  generatePlanWeek,
  getStudyPlanDefaults,
  loadStudyPlan,
  naturalCompareCodes,
  StudyPlanValidationError,
  upsertStudyPlan,
  type StudyPlanConfig,
  type StudyPlanUpsertBody,
} from "../../src/services/learner/study-plan";
import type { SqlFn } from "../../src/services/tutor/sql";

const NOW = new Date("2026-10-23T08:00:00Z"); // a Friday
const NOW_ISO = "2026-10-23T08:00:00.000Z";
const ANCHOR = "2026-10-19T09:00:00.000Z"; // the Monday of NOW's week
const TODAY = "2026-10-23";
const LEARNER = "cc000000-0000-4000-8000-000000000001";

const N_SUBJECT = "a0000000-0000-4000-8000-000000000001";
const N_TOPIC = "a0000000-0000-4000-8000-000000000002";
const N_ST_A = "a0000000-0000-4000-8000-000000000003";
const N_ST_B = "a0000000-0000-4000-8000-000000000004";
const N_SP1 = "a0000000-0000-4000-8000-000000000005";
const N_SP2 = "a0000000-0000-4000-8000-000000000006";
const P_SUBJECT = "a0000000-0000-4000-8000-000000000101";
const P_TOPIC = "a0000000-0000-4000-8000-000000000102";
const P_ST_A = "a0000000-0000-4000-8000-000000000103";
const P_SP1 = "a0000000-0000-4000-8000-000000000104";
const Q1 = "b0000000-0000-4000-8000-000000000001";
const Q2 = "b0000000-0000-4000-8000-000000000002";

const REGISTRY = [
  {
    course_slug: "cie-a-level-physics-25",
    code: "9702",
    curriculum_code: "9702-2025",
    level: "A-Level",
    board: "Cambridge International",
    label: "A Level Physics",
  },
  {
    course_slug: "igcse-chemistry-19",
    code: "4CH1",
    curriculum_code: "4CH1-2017",
    level: "IGCSE",
    board: "Edexcel",
    label: "IGCSE Chemistry",
  },
];

const NODES = [
  { id: N_SUBJECT, code: "4CH1", node_type: "SUBJECT", title: "4CH1" },
  { id: N_TOPIC, code: "4CH1-S1", node_type: "TOPIC", title: "S1" },
  { id: N_ST_A, code: "4CH1-S1-a", node_type: "SUBTOPIC", title: "The Microscope in Cell Studies" },
  { id: N_ST_B, code: "4CH1-S1-b", node_type: "SUBTOPIC", title: "Cell Structure" },
  { id: N_SP1, code: "4CH1-1.1", node_type: "SPEC_POINT", title: "4CH1-1.1" },
  { id: N_SP2, code: "4CH1-2.1", node_type: "SPEC_POINT", title: "4CH1-2.1" },
  { id: P_SUBJECT, code: "9702", node_type: "SUBJECT", title: "9702" },
  { id: P_TOPIC, code: "9702-S1", node_type: "TOPIC", title: "S1" },
  { id: P_ST_A, code: "9702-S1-a", node_type: "SUBTOPIC", title: "Kinematics" },
  { id: P_SP1, code: "9702-1.1", node_type: "SPEC_POINT", title: "9702-1.1" },
];

const EDGES = [
  { source_node_id: N_SP1, target_node_id: N_ST_A },
  { source_node_id: N_ST_A, target_node_id: N_TOPIC },
  { source_node_id: N_TOPIC, target_node_id: N_SUBJECT },
  { source_node_id: N_SP2, target_node_id: N_ST_B },
  { source_node_id: N_ST_B, target_node_id: N_TOPIC },
  { source_node_id: P_SP1, target_node_id: P_ST_A },
  { source_node_id: P_ST_A, target_node_id: P_TOPIC },
  { source_node_id: P_TOPIC, target_node_id: P_SUBJECT },
];

const NOTES = [
  { note_id: "note-1", spec_point_codes: "4CH1-1.1" },
  { note_id: "note-2", spec_point_codes: "4CH1-2.1" },
  { note_id: "note-3", spec_point_codes: "9702-1.1" },
];

function planOf(overrides: Partial<StudyPlanConfig> = {}): StudyPlanConfig {
  return {
    courses: ["igcse-chemistry-19"],
    seasons: { "igcse-chemistry-19": { label: "Summer", examYear: 2028, examMonth: 6 } },
    weekdayMinutes: 120,
    weekendMinutes: 0,
    createdAt: ANCHOR,
    updatedAt: ANCHOR,
    ...overrides,
  };
}

function fixture(opts: {
  viewed?: Array<{ note_id: string; viewed_at: string }>;
  marks?: Array<{ question_id: string; created_at: string }>;
  attempts?: Array<{ question_id: string; created_at: string; question_type: string }>;
  planRows?: unknown[];
  registry?: typeof REGISTRY;
  capture?: string[];
} = {}) {
  const registry = opts.registry ?? REGISTRY;
  const rows = {
    viewed: opts.viewed ?? [],
    marks: opts.marks ?? [],
    attempts: opts.attempts ?? [],
    planRows: opts.planRows ?? [],
    qTopics: [{ node_id: N_TOPIC, question_id: Q1 }],
    qSpecPoints: [
      { node_id: N_SP1, question_id: Q1 },
      { node_id: N_SP2, question_id: Q2 },
    ],
  };
  const fn = (async (strings: TemplateStringsArray, ...params: unknown[]) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    opts.capture?.push(text);
    // most specific keys first ("revision_note_viewed" contains
    // "revision_note"; the upsert and the select share the study_plans band)
    if (text.includes("on conflict (learner_id) do update")) {
      return [{ created_at: ANCHOR, updated_at: NOW_ISO }]; // anchor immutability: created_at rides the insert only
    }
    if (text.includes("from study_plans where learner_id")) return rows.planRows;
    if (text.includes("from course_registry where course_slug")) {
      return registry.filter((r) => r.course_slug === params[0]);
    }
    if (text.includes("order by course_slug asc")) {
      return [...registry].sort((a, b) => (a.course_slug < b.course_slug ? -1 : 1));
    }
    if (text.includes("from knowledge_nodes")) {
      // emulate the SQL course filter (code = ? or code like 'SUBJ-%'):
      // the subject param and the LIKE param both carry the subject code
      const subject = [params[0], params[1]]
        .find((p): p is string => typeof p === "string")
        ?.replace(/-%$/, "");
      return subject ? NODES.filter((n) => n.code === subject || n.code.startsWith(`${subject}-`)) : NODES;
    }
    if (text.includes("from knowledge_edges")) return EDGES;
    if (text.includes("from revision_note_viewed")) return rows.viewed;
    if (text.includes("from revision_note")) return NOTES;
    if (text.includes("from attempts a join questions")) return rows.attempts;
    if (text.includes("from ai_mark_events")) return rows.marks;
    // T-MG-FEEDBACK-1: the region-award join (the SECOND marked-part fact
    // source of the same projection) — this fixture exercises no paper
    // marks, so it serves the honest empty.
    if (text.includes("from mark_awards a")) return [];
    if (text.includes("from question_topics")) return rows.qTopics;
    if (text.includes("from question_spec_points")) return rows.qSpecPoints;
    throw new Error(`study-plan.test fixture: unmatched query: ${text.slice(0, 140)}`);
  }) as unknown as SqlFn;
  return fn;
}

const taskIdsOf = (week: Awaited<ReturnType<typeof generatePlanWeek>>, date: string): string[] =>
  (week.days.find((d) => d.date === date)?.tasks ?? []).map((t) => t.taskId);

describe("Study-Plan Builder — generated week from tree (Table 3 gate)", () => {
  test("the week is spec-ordered, capacity-honoured and deterministic", async () => {
    const sql = fixture();
    const week1 = await generatePlanWeek(sql, LEARNER, planOf(), NOW);
    const week2 = await generatePlanWeek(sql, LEARNER, planOf(), NOW);
    expect(JSON.stringify(week1)).toBe(JSON.stringify(week2)); // ADR-031: same clock, byte-identical weeks

    expect(week1.weekStart).toBe("2026-10-19"); // the Monday of NOW's UTC week
    expect(week1.weekEnd).toBe("2026-10-25");
    expect(week1.today).toBe(TODAY);
    expect(week1.days).toHaveLength(7); // the day strip renders the full week

    // Monday (the anchor day): two pairs — spec-ordered subtopics, each
    // paired exactly one Revise (15 min) + one Practise (45 min)
    const monday = week1.days[0]!;
    expect(monday.tasks.map((t) => t.taskId)).toEqual([
      "revise:note-1",
      "practise:4CH1-S1-a",
      "revise:note-2",
      "practise:4CH1-S1-b",
    ]);
    expect(monday.tasks.map((t) => t.minutes)).toEqual([15, 45, 15, 45]);
    expect(monday.tasks[0]!.subtopicTitle).toBe("The Microscope in Cell Studies");
    expect(monday.tasks[0]!.noteId).toBe("note-1");

    // capacity law: 120 weekday minutes = 2 pairs = 4 tasks/day, five days;
    // weekend minutes 0 = the weekend day strip stays empty
    for (const day of week1.days) {
      const dow = day.dayOfWeek;
      expect(day.tasks).toHaveLength(dow === 0 || dow === 6 ? 0 : 4);
    }
    expect(week1.counters.weekTotal).toBe(20);
    expect(week1.courses[0]!.subtopicCount).toBe(2);
    expect(week1.courses[0]!.cycleEndsOn).toBe("2026-10-19"); // both subtopics served on day 1
    expect(week1.goal).toEqual({ coversInTime: true, cyclesNeeded: 1 });
  });

  test("today's slice is the injected day's slots (the '1 of 4' rail law)", async () => {
    const sql = fixture();
    const week = await generatePlanWeek(sql, LEARNER, planOf(), NOW);
    expect(taskIdsOf(week, TODAY)).toEqual([
      "revise:note-1",
      "practise:4CH1-S1-a",
      "revise:note-2",
      "practise:4CH1-S1-b",
    ]);
    expect(week.counters.todayTotal).toBe(4);
    expect(week.counters.todayCompleted).toBe(0);
    expect(week.counters.percentToday).toBe(0);
  });

  test("natural code order beats lexicographic (the S10/S2 trap)", () => {
    const codes = ["4CH1-S10-a", "4CH1-S2-a", "4CH1-S1-a"];
    codes.sort(naturalCompareCodes);
    expect(codes).toEqual(["4CH1-S1-a", "4CH1-S2-a", "4CH1-S10-a"]);
  });

  test("round-robin balances two courses; seasons map by level; cycle ends are exact", async () => {
    const sql = fixture();
    const week = await generatePlanWeek(
      sql,
      LEARNER,
      planOf({
        courses: ["igcse-chemistry-19", "cie-a-level-physics-25"],
        seasons: {
          "igcse-chemistry-19": { label: "Summer", examYear: 2028, examMonth: 6 },
          "cie-a-level-physics-25": { label: "May/June", examYear: 2028, examMonth: 6 },
        },
      }),
      NOW,
    );
    // pair 1 goes to chemistry, pair 2 to physics — the step-1 balance law
    expect(taskIdsOf(week, TODAY)).toEqual([
      "revise:note-1",
      "practise:4CH1-S1-a",
      "revise:note-3",
      "practise:9702-S1-a",
    ]);
    // chemistry serves one pair/day → its 2-subtopic cycle completes Tuesday
    expect(week.courses[0]!.cycleEndsOn).toBe("2026-10-20");
    // physics has one subtopic → its cycle completes on day 1
    expect(week.courses[1]!.cycleEndsOn).toBe("2026-10-19");
    expect(week.courses[0]!.label).toBe("IGCSE Chemistry");
  });

  test("the goal card's coverage arithmetic is measured, never asserted", async () => {
    const sql = fixture();
    // starved plan: zero capacity → nothing before the season
    const starved = await generatePlanWeek(sql, LEARNER, planOf({ weekdayMinutes: 0 }), NOW);
    expect(starved.goal.coversInTime).toBe(false);
    expect(starved.goal.cyclesNeeded).toBe(2); // ceil(2 subtopics / 0 slots → floor 1)
    const ok = await generatePlanWeek(sql, LEARNER, planOf(), NOW);
    expect(ok.goal.coversInTime).toBe(true);
    expect(ok.goal.cyclesNeeded).toBe(1);
  });
});

describe("Study-Plan Builder — the DC-7 subscription (Revise auto-complete; Practise threshold)", () => {
  test("a Revise task auto-completes when its note is checked — never a local counter", async () => {
    const sql = fixture({
      viewed: [{ note_id: "note-1", viewed_at: `${TODAY}T07:30:00Z` }],
    });
    const week = await generatePlanWeek(sql, LEARNER, planOf(), NOW);
    const today = week.days.find((d) => d.date === TODAY)!.tasks;
    const revise = today.find((t) => t.taskId === "revise:note-1")!;
    expect(revise.complete).toBe(true);
    expect(revise.autoCompletedBy).toBe("NOTE_CHECK");
    // the sibling pair and both Practise tasks stay open
    expect(today.find((t) => t.taskId === "revise:note-2")!.complete).toBe(false);
    for (const t of today.filter((x) => x.type === "PRACTISE")) {
      expect(t.complete).toBe(false);
    }
    expect(week.counters.todayCompleted).toBe(1);
    expect(week.counters.todayTotal).toBe(4);
    expect(week.counters.percentToday).toBe(25);
  });

  test("the Practise threshold is the FIFTH marked part; attempts alone never flip it", async () => {
    // three MCQ submits (attempts) — the observed product's strongest link:
    // a single submit does NOT complete the 45-minute Practise task
    const attemptsOnly = fixture({
      attempts: [1, 2, 3].map((i) => ({
        question_id: Q1,
        created_at: `2026-10-2${i}T07:00:00Z`,
        question_type: "MCQ",
      })),
    });
    const w0 = await generatePlanWeek(attemptsOnly, LEARNER, planOf(), NOW);
    const t0 = w0.days.find((d) => d.date === TODAY)!.tasks;
    expect(t0.find((x) => x.taskId === "practise:4CH1-S1-a")!.complete).toBe(false);

    // four marked parts — still under the threshold of record
    const marks = (n: number) =>
      fixture({ marks: Array.from({ length: n }, (_, i) => ({ question_id: Q1, created_at: `2026-10-2${i + 1}T06:00:00Z` })) });
    const w4 = await generatePlanWeek(marks(4), LEARNER, planOf(), NOW);
    const t4 = w4.days.find((d) => d.date === TODAY)!.tasks;
    const under = t4.find((x) => x.taskId === "practise:4CH1-S1-a")!;
    expect(under.complete).toBe(false);
    expect(under.markedParts).toBe(4);
    expect(under.threshold).toBe(5);

    // the fifth marked part flips it (and ONLY its subtree: S1-b stays open)
    const w5 = await generatePlanWeek(marks(5), LEARNER, planOf(), NOW);
    const t5 = w5.days.find((d) => d.date === TODAY)!.tasks;
    const done = t5.find((x) => x.taskId === "practise:4CH1-S1-a")!;
    expect(done.complete).toBe(true);
    expect(done.autoCompletedBy).toBe("MARKED_PARTS");
    expect(done.markedParts).toBe(5);
    expect(done.threshold).toBe(5);
    expect(t5.find((x) => x.taskId === "practise:4CH1-S1-b")!.complete).toBe(false);
  });

  test("counters and the day slice derive from ONE build (the consistency law)", async () => {
    const sql = fixture({
      viewed: [{ note_id: "note-1", viewed_at: `${TODAY}T07:30:00Z` }],
    });
    const week = await generatePlanWeek(sql, LEARNER, planOf(), NOW);
    const todayTasks = week.days.find((d) => d.date === TODAY)!.tasks;
    expect(week.counters.todayTotal).toBe(todayTasks.length);
    expect(week.counters.todayCompleted).toBe(todayTasks.filter((t) => t.complete).length);
    const weekTasks = week.days.flatMap((d) => d.tasks);
    expect(week.counters.weekTotal).toBe(weekTasks.length);
    expect(week.counters.weekCompleted).toBe(weekTasks.filter((t) => t.complete).length);
  });
});

describe("Study-Plan Builder — the three cheap defaults (spec §5.3 steps 1–3)", () => {
  test("registry courses slug-ASC with level-mapped seasons and 120/0 minutes", async () => {
    const sql = fixture();
    const d = await getStudyPlanDefaults(sql, NOW);
    expect(d.courses.map((c) => c.courseSlug)).toEqual(["cie-a-level-physics-25", "igcse-chemistry-19"]);
    expect(d.courses.every((c) => c.selected)).toBe(true);
    expect(d.seasons["cie-a-level-physics-25"]).toEqual({ label: "May/June", examYear: 2028, examMonth: 6 });
    expect(d.seasons["igcse-chemistry-19"]).toEqual({ label: "Summer", examYear: 2028, examMonth: 6 });
    expect(d.weekdayMinutes).toBe(STUDY_PLAN_DEFAULT_WEEKDAY_MINUTES);
    expect(d.weekendMinutes).toBe(STUDY_PLAN_DEFAULT_WEEKEND_MINUTES);
  });

  test("season default maps the registry levels of record (two years out)", () => {
    expect(defaultExamSeason("A-Level", NOW)).toEqual({ label: "May/June", examYear: 2028, examMonth: 6 });
    expect(defaultExamSeason("IAL", NOW).label).toBe("May/June");
    expect(defaultExamSeason("AS", NOW).label).toBe("May/June");
    expect(defaultExamSeason("IGCSE", NOW)).toEqual({ label: "Summer", examYear: 2028, examMonth: 6 });
    expect(defaultExamSeason(null, NOW).examYear).toBe(2028);
  });
});

describe("Study-Plan Builder — the upsert (the lane's ONLY write)", () => {
  const body: StudyPlanUpsertBody = {
    courses: ["igcse-chemistry-19"],
    seasons: { "igcse-chemistry-19": { label: "Summer", examYear: 2028, examMonth: 6 } },
    weekdayMinutes: 120,
    weekendMinutes: 0,
  };

  test("validation pins: unknown course, empty courses, minute bounds, season keys", async () => {
    const sql = fixture();
    await expect(upsertStudyPlan(sql, LEARNER, { ...body, courses: [] }, NOW)).rejects.toBeInstanceOf(
      StudyPlanValidationError,
    );
    await expect(
      upsertStudyPlan(sql, LEARNER, { ...body, courses: ["no-such-course"], seasons: {} }, NOW),
    ).rejects.toThrow(/unknown course/);
    await expect(
      upsertStudyPlan(sql, LEARNER, { ...body, weekdayMinutes: 601 }, NOW),
    ).rejects.toThrow(/integers in 0..600/);
    await expect(
      upsertStudyPlan(sql, LEARNER, { ...body, weekendMinutes: -1 }, NOW),
    ).rejects.toBeInstanceOf(StudyPlanValidationError);
    await expect(
      upsertStudyPlan(
        sql,
        LEARNER,
        { ...body, seasons: { "cie-a-level-physics-25": { label: "X", examYear: 2028, examMonth: 6 } } },
        NOW,
      ),
    ).rejects.toThrow(/not in courses/);
  });

  test("anchor immutability: the upsert never touches created_at (the SQL-level pin)", async () => {
    const capture: string[] = [];
    const sql = fixture({ capture });
    const plan = await upsertStudyPlan(sql, LEARNER, body, NOW);
    const upsertSql = capture.find((t) => t.includes("on conflict (learner_id) do update"))!;
    expect(upsertSql).toContain("updated_at = excluded.updated_at");
    expect(upsertSql).not.toContain("created_at = excluded");
    // the config row returns the DB's created_at — the day-walk anchor
    expect(plan.createdAt).toBe(ANCHOR);
    expect(plan.updatedAt).toBe(NOW_ISO);
    expect(plan.courses).toEqual(["igcse-chemistry-19"]);
    expect(plan.weekdayMinutes).toBe(120);
    expect(plan.weekendMinutes).toBe(0);
  });

  test("courses missing from the seasons map get the level default (the step-2 fill law)", async () => {
    const sql = fixture();
    const plan = await upsertStudyPlan(sql, LEARNER, { ...body, seasons: {} }, NOW);
    expect(plan.seasons["igcse-chemistry-19"]).toEqual({ label: "Summer", examYear: 2028, examMonth: 6 });
  });

  test("course slugs dedupe preserving order", async () => {
    const sql = fixture();
    const plan = await upsertStudyPlan(
      sql,
      LEARNER,
      { ...body, courses: ["igcse-chemistry-19", "igcse-chemistry-19", "cie-a-level-physics-25"] },
      NOW,
    );
    expect(plan.courses).toEqual(["igcse-chemistry-19", "cie-a-level-physics-25"]);
  });
});

describe("Study-Plan Builder — the read side", () => {
  test("no plan row → null (the rail's Create Study Plan state)", async () => {
    const sql = fixture({ planRows: [] });
    expect(await loadStudyPlan(sql, LEARNER)).toBeNull();
  });

  test("the stored config round-trips into the generated week", async () => {
    const stored = planOf();
    const sql = fixture({
      planRows: [
        {
          courses: stored.courses,
          seasons: stored.seasons,
          weekday_minutes: stored.weekdayMinutes,
          weekend_minutes: stored.weekendMinutes,
          created_at: stored.createdAt,
          updated_at: stored.updatedAt,
        },
      ],
    });
    const plan = await loadStudyPlan(sql, LEARNER);
    expect(plan).not.toBeNull();
    const week = await generatePlanWeek(sql, LEARNER, plan!, NOW);
    expect(week.counters.todayTotal).toBe(4);
  });
});

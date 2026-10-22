/**
 * Study-Plan Builder — the deterministic week generator (spec §5.3 + roadmap
 * Table 3 P2 row; prereg of record docs/STUDY-PLAN-BUILDER-PLAN.md, launch
 * trace 1a1658959017ed4d).
 *
 * THE LAW (Table 3, verbatim): "Generated week from tree; Revise
 * auto-complete; Practise threshold." The three builder steps are cheap and
 * defaulted (spec §5.3): courses pre-selected, per-course exam seasons
 * defaulted, two hours per weekday with weekend add controls. The result is
 * a weekly page of per-course task groups, each group pairing exactly one
 * Revise task (Revision Notes, 15 minutes) with one Practise task (Exam
 * Questions, 45 minutes) per topic.
 *
 * THE SUBSCRIPTION (DC-7, byte-for-byte): every task completion state comes
 * from buildPlanProjection over THIS lane's generated task refs — the "P2
 * builder's future input" the DC-7 code named. Thresholds, threshold
 * semantics and the today block stay DC-7's; nothing is re-implemented here
 * and nothing completion-shaped is ever stored ("the tree wrote the plan,
 * not the learner"). The ONLY persisted state of the lane is the plan-config
 * row (packages/db 0012_study_plans — courses, seasons, minutes).
 *
 * THE SCHEDULER (open question (c) resolution of record, prereg §0):
 * deterministic, spec-ordered. Pair slots ride a day walk anchored at the
 * plan's created_at (immutable — editing never re-anchors history): weekday
 * capacity floor(weekday_minutes / 60) pairs, weekend capacity
 * floor(weekend_minutes / 60); pairs round-robin across the plan's courses
 * in stored order (step 1's "balances revision across the subjects you
 * pick"); a course's subtopics are consumed in natural curriculum-code order
 * and wrap per cycle. DETERMINISM (ADR-031): the clock is injected; two
 * builds on the same instant return byte-identical weeks.
 */
import { NotFoundError } from "../selfmark";
import type { SqlFn } from "../tutor/sql";
import {
  dayStartOf,
  buildPlanProjection,
} from "./progress-rollup";

/** the observed durations, pinned as the constants of record (prereg §1) */
export const STUDY_PLAN_REVISE_MINUTES = 15;
export const STUDY_PLAN_PRACTISE_MINUTES = 45;
/** step 3 defaults of record: two hours per weekday, weekend off */
export const STUDY_PLAN_DEFAULT_WEEKDAY_MINUTES = 120;
export const STUDY_PLAN_DEFAULT_WEEKEND_MINUTES = 0;
/** the spec's "two years out" exam-season default */
export const STUDY_PLAN_DEFAULT_EXAM_YEARS_AHEAD = 2;
/** PUT validation bound (0..600 minutes per day type) */
export const STUDY_PLAN_MINUTES_CAP = 600;
/** day-walk fail-safe horizon (the season end caps the walk first) */
const WALK_HORIZON_DAYS = 800;

/** PUT validation failure — the route maps to 400 */
export class StudyPlanValidationError extends Error {}

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
  /** REVISE: the note the task revises (deep link of record) */
  noteId?: string;
  minutes: number;
  /** UTC yyyy-mm-dd of the slot */
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
  /** the UTC date the course's first full cycle completes (null: no subtopics) */
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

/** step 2 default of record: May/June for A-Level/IAL/AS, Summer for the
 * IGCSE (the registry's GCSE-analogue level — prereg §1 mapping). */
export function defaultExamSeason(level: string | null | undefined, now: Date): StudyPlanSeason {
  const normalized = (level ?? "").trim().toLowerCase();
  const mayJune = normalized === "a-level" || normalized === "ial" || normalized === "as";
  return {
    label: mayJune ? "May/June" : "Summer",
    examYear: now.getUTCFullYear() + STUDY_PLAN_DEFAULT_EXAM_YEARS_AHEAD,
    examMonth: 6,
  };
}

/** natural (numeric-aware) curriculum-code order of record — lexicographic
 * sort alone breaks at 10+ units (S10 sorts before S2); pinned by test. */
export function naturalCompareCodes(a: string, b: string): number {
  const ra = a.match(/\d+|\D+/g) ?? [];
  const rb = b.match(/\d+|\D+/g) ?? [];
  for (let i = 0; i < Math.max(ra.length, rb.length); i++) {
    const ta = ra[i];
    const tb = rb[i];
    if (ta === undefined) return -1;
    if (tb === undefined) return 1;
    const na = /^\d+$/.test(ta) ? Number(ta) : null;
    const nb = /^\d+$/.test(tb) ? Number(tb) : null;
    if (na !== null && nb !== null) {
      if (na !== nb) return na - nb;
    } else if (ta !== tb) {
      return ta < tb ? -1 : 1;
    }
  }
  return 0;
}

const utcDateIso = (d: Date): string => dayStartOf(d).toISOString().slice(0, 10);

const nextUtcDay = (d: Date): Date =>
  new Date(d.getTime() + 24 * 60 * 60 * 1000);

/** Monday..Sunday UTC calendar week containing the injected instant */
function utcWeekOf(now: Date): { weekStart: Date; weekEnd: Date } {
  const start = dayStartOf(now);
  const dow = start.getUTCDay();
  const backToMonday = (dow + 6) % 7;
  const weekStart = new Date(start.getTime() - backToMonday * 24 * 60 * 60 * 1000);
  const weekEnd = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);
  return { weekStart, weekEnd };
}

/** the season's end instant of record (examMonth 6 → June 30) */
const seasonEndDate = (s: StudyPlanSeason): Date =>
  new Date(Date.UTC(s.examYear, s.examMonth - 1, 30));

// ── the course tree (same laws as the DC-7 universe, read-only here) ──────

const TREE_NODE_TYPES = new Set(["SUBJECT", "UNIT", "TOPIC", "SUBTOPIC", "SPEC_POINT"]);

interface CourseTree {
  label: string | null;
  level: string | null;
  subtopics: Array<{ code: string; title: string }>; // natural order
  /** the pairing rule's single note per subtopic: the subtopic's first note
   * by note_id ASC (the deterministic single-note law, prereg §5) */
  firstNoteBySubtopic: Map<string, string>;
}

async function loadCourseTree(sql: SqlFn, courseSlug: string): Promise<CourseTree> {
  const courseRows = (await sql`
    select code, level, label from course_registry where course_slug = ${courseSlug}
  `) as unknown as Array<{ code: string; level: string | null; label: string | null }>;
  if (courseRows.length === 0) throw new NotFoundError("course", courseSlug);
  const subjectCode = courseRows[0]!.code;

  const nodeRows = (await sql`
    select id, code, node_type, title from knowledge_nodes
    where code = ${subjectCode} or code like ${subjectCode + "-%"}
  `) as unknown as Array<{ id: string; code: string; node_type: string; title: string }>;

  const idByCode = new Map<string, string>();
  const codeById = new Map<string, string>();
  /** node id -> node_type (ID-keyed — the ancestor walk is id-based, the
   * DC-7 loadUniverse law) */
  const typeById = new Map<string, string>();
  const titleByCode = new Map<string, string>();
  const nodeIds = new Set<string>();
  for (const n of nodeRows) {
    if (!TREE_NODE_TYPES.has(n.node_type)) continue;
    idByCode.set(n.code, n.id);
    codeById.set(n.id, n.code);
    typeById.set(n.id, n.node_type);
    titleByCode.set(n.code, n.title);
    nodeIds.add(n.id);
  }

  const edgeRows = (await sql`
    select source_node_id, target_node_id from knowledge_edges where relation_type = ${"PART_OF"}
  `) as unknown as Array<{ source_node_id: string; target_node_id: string }>;
  const parentOf = new Map<string, string>();
  for (const e of edgeRows) {
    if (nodeIds.has(e.source_node_id) && nodeIds.has(e.target_node_id)) {
      parentOf.set(e.source_node_id, e.target_node_id);
    }
  }

  // subtopics in natural curriculum-code order (the spec order of record)
  const subtopics = [...typeById.entries()]
    .filter(([, t]) => t === "SUBTOPIC")
    .map(([id]) => {
      const code = codeById.get(id)!;
      return { code, title: titleByCode.get(code) ?? code };
    })
    .sort((a, b) => naturalCompareCodes(a.code, b.code));

  // note → subtopic bridge: the note's first resolvable spec-point code,
   // walked upward to the first SUBTOPIC ancestor (deepest-first); first
  // note by note_id ASC wins (the single-note pairing law)
  const noteRows = (await sql`
    select note_id, spec_point_codes from revision_note order by note_id asc
  `) as unknown as Array<{ note_id: string; spec_point_codes: string }>;
  const firstNoteBySubtopic = new Map<string, string>();
  for (const r of noteRows) {
    const codes = (r.spec_point_codes ?? "")
      .split(",")
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    for (const code of codes) {
      let cur: string | undefined = idByCode.get(code);
      const seen = new Set<string>();
      let resolved: string | undefined;
      while (cur && !seen.has(cur)) {
        seen.add(cur);
        if (typeById.get(cur) === "SUBTOPIC") {
          resolved = cur;
          break;
        }
        cur = parentOf.get(cur);
      }
      if (resolved && !firstNoteBySubtopic.has(codeById.get(resolved)!)) {
        firstNoteBySubtopic.set(codeById.get(resolved)!, r.note_id);
      }
      if (resolved) break; // the FIRST resolvable code owns the note
    }
  }

  return { label: courseRows[0]!.label, level: courseRows[0]!.level, subtopics, firstNoteBySubtopic };
}

// ── the day walk (deterministic slots; never stored) ──────────────────────

interface PairSlot {
  courseSlug: string;
  subtopicCode: string;
  date: string; // yyyy-mm-dd
}

interface WalkResult {
  slots: PairSlot[];
  cycleEndsOn: Map<string, string | null>;
  /** pair slots the course receives from anchor to its season end (the goal
   * card's exact coverage arithmetic — measured, not approximated) */
  slotsBeforeSeason: Map<string, number>;
}

function walkSlots(
  plan: StudyPlanConfig,
  trees: Map<string, CourseTree>,
  seasons: Record<string, StudyPlanSeason>,
  now: Date,
): WalkResult {
  // only courses with at least one subtopic participate in the round-robin
  const courseSlugs = plan.courses.filter((c) => (trees.get(c)?.subtopics.length ?? 0) > 0);
  const cycleEndsOn = new Map<string, string | null>();
  const slotsBeforeSeason = new Map<string, number>();
  for (const c of plan.courses) {
    cycleEndsOn.set(c, null);
    slotsBeforeSeason.set(c, 0);
  }

  const todayIso = utcDateIso(now);
  const seasonEnds = plan.courses
    .map((c) => seasons[c])
    .filter((s): s is StudyPlanSeason => Boolean(s))
    .map(seasonEndDate);
  const horizon = seasonEnds.length
    ? new Date(Math.min(new Date(Math.max(...seasonEnds.map((d) => d.getTime()))).getTime(), dayStartOf(now).getTime() + WALK_HORIZON_DAYS * 24 * 60 * 60 * 1000))
    : new Date(dayStartOf(now).getTime() + WALK_HORIZON_DAYS * 24 * 60 * 60 * 1000);

  const slots: PairSlot[] = [];
  if (courseSlugs.length === 0) return { slots, cycleEndsOn, slotsBeforeSeason };

  // the goal card's exact coverage window: each course counts slots up to
  // ITS season end (the walk horizon is the LATEST season end, capped)
  const seasonEndByCourse = new Map<string, Date>();
  for (const c of plan.courses) {
    const s = seasons[c];
    if (s) seasonEndByCourse.set(c, seasonEndDate(s));
  }

  const cursors = new Map<string, number>(courseSlugs.map((c) => [c, 0]));
  let day = new Date(`${plan.createdAt.slice(0, 10)}T00:00:00Z`);
  let globalPairIndex = 0;

  while (day.getTime() <= horizon.getTime()) {
    const dow = day.getUTCDay(); // 0 = Sunday, 6 = Saturday
    const minutes = dow === 0 || dow === 6 ? plan.weekendMinutes : plan.weekdayMinutes;
    const pairs = Math.floor(minutes / 60);
    const dateIso = utcDateIso(day);
    for (let p = 0; p < pairs; p++, globalPairIndex++) {
      const courseSlug = courseSlugs[globalPairIndex % courseSlugs.length]!;
      const tree = trees.get(courseSlug)!;
      const idx = cursors.get(courseSlug)!;
      const count = tree.subtopics.length;
      const subtopic = tree.subtopics[idx % count]!;
      cursors.set(courseSlug, idx + 1);
      if (cycleEndsOn.get(courseSlug) === null && (idx + 1) % count === 0 && idx < count) {
        cycleEndsOn.set(courseSlug, dateIso); // the first full pass completes
      }
      const seasonEnd = seasonEndByCourse.get(courseSlug);
      if (!seasonEnd || day.getTime() <= seasonEnd.getTime()) {
        slotsBeforeSeason.set(courseSlug, (slotsBeforeSeason.get(courseSlug) ?? 0) + 1);
      }
      slots.push({ courseSlug, subtopicCode: subtopic.code, date: dateIso });
    }
    day = nextUtcDay(day);
  }
  return { slots, cycleEndsOn, slotsBeforeSeason };
}

// ── the generated week (the Table 3 gate, end to end) ─────────────────────

export async function generatePlanWeek(
  sql: SqlFn,
  learnerId: string,
  plan: StudyPlanConfig,
  now: Date,
): Promise<PlanWeekView> {
  const trees = new Map<string, CourseTree>();
  const seasons: Record<string, StudyPlanSeason> = {};
  for (const slug of plan.courses) {
    trees.set(slug, await loadCourseTree(sql, slug));
    seasons[slug] = plan.seasons[slug] ?? defaultExamSeason(trees.get(slug)!.level, now);
  }

  const { slots, cycleEndsOn, slotsBeforeSeason } = walkSlots(plan, trees, seasons, now);
  const { weekStart, weekEnd } = utcWeekOf(now);
  const weekStartIso = utcDateIso(weekStart);
  const weekEndIso = utcDateIso(weekEnd);
  const todayIso = utcDateIso(now);

  // the week's rendered tasks: EVERY slot in the window renders — a wrapped
  // subtopic is a REPEAT PASS of the same task (same taskId; the projection
  // guarantees the completion state is identical), which is what the wrap
  // means for a revision plan. Counters count slot-instances (prereg §2.2).
  interface RenderedRef {
    slot: PairSlot;
    type: "REVISE" | "PRACTISE";
    taskId: string;
    noteId?: string;
  }
  const rendered: RenderedRef[] = [];
  for (const slot of slots) {
    if (slot.date < weekStartIso || slot.date > weekEndIso) continue;
    const tree = trees.get(slot.courseSlug)!;
    const noteId = tree.firstNoteBySubtopic.get(slot.subtopicCode);
    if (noteId !== undefined) {
      rendered.push({ slot, type: "REVISE", taskId: `revise:${noteId}`, noteId });
    }
    rendered.push({ slot, type: "PRACTISE", taskId: `practise:${slot.subtopicCode}` });
  }

  // THE SUBSCRIPTION: per course, the DC-7 plan projection decides over THIS
  // week's refs — thresholds and today stay DC-7's, byte-for-byte.
  const decisionByTaskId = new Map<string, Awaited<ReturnType<typeof buildPlanProjection>>["tasks"][number]>();
  const byCourse = new Map<string, RenderedRef[]>();
  for (const ref of rendered) {
    const list = byCourse.get(ref.slot.courseSlug) ?? [];
    list.push(ref);
    byCourse.set(ref.slot.courseSlug, list);
  }
  for (const [slug, refs] of byCourse) {
    const taskRefs = refs.map((r) =>
      r.type === "REVISE"
        ? { taskId: r.taskId, type: "REVISE" as const, noteId: r.noteId }
        : { taskId: r.taskId, type: "PRACTISE" as const, nodeCode: r.slot.subtopicCode },
    );
    const projection = await buildPlanProjection(sql, learnerId, slug, now, taskRefs);
    for (const d of projection.tasks) decisionByTaskId.set(d.taskId, d);
  }

  const titleOf = (slug: string, code: string): string =>
    trees.get(slug)?.subtopics.find((s) => s.code === code)?.title ?? code;

  const taskView = (ref: RenderedRef): PlanTaskView => {
    const decision = decisionByTaskId.get(ref.taskId);
    return {
      taskId: ref.taskId,
      type: ref.type,
      courseSlug: ref.slot.courseSlug,
      subtopicCode: ref.slot.subtopicCode,
      subtopicTitle: titleOf(ref.slot.courseSlug, ref.slot.subtopicCode),
      ...(ref.noteId !== undefined ? { noteId: ref.noteId } : {}),
      minutes: ref.type === "REVISE" ? STUDY_PLAN_REVISE_MINUTES : STUDY_PLAN_PRACTISE_MINUTES,
      date: ref.slot.date,
      complete: decision?.complete ?? false,
      autoCompletedBy: decision?.autoCompletedBy ?? null,
      ...(decision?.markedParts !== undefined ? { markedParts: decision.markedParts } : {}),
      ...(decision?.threshold !== undefined ? { threshold: decision.threshold } : {}),
    };
  };

  const days: PlanDayView[] = [];
  for (let d = new Date(weekStart); d.getTime() <= weekEnd.getTime(); d = nextUtcDay(d)) {
    const dateIso = utcDateIso(d);
    days.push({
      date: dateIso,
      dayOfWeek: d.getUTCDay(),
      tasks: rendered.filter((r) => r.slot.date === dateIso).map(taskView),
    });
  }

  const allTasks = days.flatMap((d) => d.tasks);
  const todayTasks = allTasks.filter((t) => t.date === todayIso);
  const todayTotal = todayTasks.length;
  const todayCompleted = todayTasks.filter((t) => t.complete).length;
  const weekTotal = allTasks.length;
  const weekCompleted = allTasks.filter((t) => t.complete).length;

  const courses: PlanCourseView[] = plan.courses.map((slug) => {
    const tree = trees.get(slug)!;
    const subtopicCount = tree.subtopics.length;
    const slots = slotsBeforeSeason.get(slug) ?? 0;
    return {
      courseSlug: slug,
      label: tree.label,
      season: seasons[slug]!,
      subtopicCount,
      cycleEndsOn: cycleEndsOn.get(slug) ?? null,
    };
  });

  // the goal card's honest arithmetic: coverage measured from the exact
  // slot counts (prereg §2.3) — never asserted, always computed
  const coversInTime = plan.courses.every((slug) => {
    const tree = trees.get(slug)!;
    if (tree.subtopics.length === 0) return true; // nothing to cover
    return (slotsBeforeSeason.get(slug) ?? 0) >= tree.subtopics.length;
  });
  const cyclesNeeded = Math.max(
    1,
    ...plan.courses.map((slug) => {
      const tree = trees.get(slug)!;
      if (tree.subtopics.length === 0) return 1;
      return Math.ceil(tree.subtopics.length / Math.max(1, slotsBeforeSeason.get(slug) ?? 0));
    }),
  );

  return {
    weekStart: weekStartIso,
    weekEnd: weekEndIso,
    today: todayIso,
    days,
    courses,
    counters: {
      todayTotal,
      todayCompleted,
      weekTotal,
      weekCompleted,
      percentToday: todayTotal > 0 ? Math.round((todayCompleted / todayTotal) * 100) : 0,
    },
    goal: { coversInTime, cyclesNeeded },
  };
}

// ── the three cheap defaults (spec §5.3 steps 1–3) ────────────────────────

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

export async function getStudyPlanDefaults(sql: SqlFn, now: Date): Promise<StudyPlanDefaults> {
  const rows = (await sql`
    select course_slug, level, board, label from course_registry order by course_slug asc
  `) as unknown as Array<{
    course_slug: string;
    level: string | null;
    board: string | null;
    label: string | null;
  }>;
  const seasons: Record<string, StudyPlanSeason> = {};
  for (const r of rows) seasons[r.course_slug] = defaultExamSeason(r.level, now);
  return {
    courses: rows.map((r) => ({
      courseSlug: r.course_slug,
      label: r.label,
      level: r.level,
      board: r.board,
      selected: true, // step 1 pre-selects (the hub narrows to its saved set)
    })),
    seasons,
    weekdayMinutes: STUDY_PLAN_DEFAULT_WEEKDAY_MINUTES,
    weekendMinutes: STUDY_PLAN_DEFAULT_WEEKEND_MINUTES,
  };
}

// ── the upsert (the plan-config row: the lane's ONLY write) ───────────────

export interface StudyPlanUpsertBody {
  courses: string[];
  seasons: Record<string, StudyPlanSeason>;
  weekdayMinutes: number;
  weekendMinutes: number;
}

export async function upsertStudyPlan(
  sql: SqlFn,
  learnerId: string,
  body: StudyPlanUpsertBody,
  now: Date,
): Promise<StudyPlanConfig> {
  const courses = [...new Set(body.courses)]; // dedupe, order preserved
  if (courses.length === 0) {
    throw new StudyPlanValidationError("courses must include at least one course");
  }
  const minutesOk = (n: number) => Number.isInteger(n) && n >= 0 && n <= STUDY_PLAN_MINUTES_CAP;
  if (!minutesOk(body.weekdayMinutes) || !minutesOk(body.weekendMinutes)) {
    throw new StudyPlanValidationError(
      `weekdayMinutes/weekendMinutes must be integers in 0..${STUDY_PLAN_MINUTES_CAP}`,
    );
  }
  for (const [slug, season] of Object.entries(body.seasons)) {
    if (!courses.includes(slug)) {
      throw new StudyPlanValidationError(`seasons key ${slug} is not in courses`);
    }
    if (
      !season ||
      typeof season.examYear !== "number" ||
      !Number.isInteger(season.examYear) ||
      season.examYear < 2026 ||
      season.examYear > 2100 ||
      typeof season.examMonth !== "number" ||
      !Number.isInteger(season.examMonth) ||
      season.examMonth < 1 ||
      season.examMonth > 12
    ) {
      throw new StudyPlanValidationError(`season for ${slug} must carry examYear 2026..2100 and examMonth 1..12`);
    }
  }
  for (const slug of courses) {
    const rows = (await sql`
      select course_slug from course_registry where course_slug = ${slug}
    `) as unknown as Array<{ course_slug: string }>;
    if (rows.length === 0) throw new StudyPlanValidationError(`unknown course: ${slug}`);
  }

  // courses missing from the seasons map get the level default (the step-2
  // fill law of record) — resolved per registry level
  const seasons: Record<string, StudyPlanSeason> = { ...body.seasons };
  for (const slug of courses) {
    if (seasons[slug]) continue;
    const rows = (await sql`
      select level from course_registry where course_slug = ${slug}
    `) as unknown as Array<{ level: string | null }>;
    seasons[slug] = defaultExamSeason(rows[0]?.level ?? null, now);
  }

  const nowIso = now.toISOString();
  const planId = crypto.randomUUID();
  const rows = (await sql`
    insert into study_plans (id, learner_id, courses, seasons, weekday_minutes, weekend_minutes, created_at, updated_at)
    values (${planId}::uuid, ${learnerId}::uuid, ${JSON.stringify(courses)}::jsonb, ${JSON.stringify(seasons)}::jsonb,
            ${body.weekdayMinutes}, ${body.weekendMinutes}, ${nowIso}, ${nowIso})
    on conflict (learner_id) do update set
      courses = excluded.courses,
      seasons = excluded.seasons,
      weekday_minutes = excluded.weekday_minutes,
      weekend_minutes = excluded.weekend_minutes,
      updated_at = excluded.updated_at
    returning created_at, updated_at
  `) as unknown as Array<{ created_at: string; updated_at: string }>;

  return {
    courses,
    seasons,
    weekdayMinutes: body.weekdayMinutes,
    weekendMinutes: body.weekendMinutes,
    createdAt: rows[0]!.created_at,
    updatedAt: rows[0]!.updated_at,
  };
}

// ── the read side (GET shape shared by both routes) ───────────────────────

export async function loadStudyPlan(sql: SqlFn, learnerId: string): Promise<StudyPlanConfig | null> {
  const rows = (await sql`
    select courses, seasons, weekday_minutes, weekend_minutes, created_at, updated_at
    from study_plans where learner_id = ${learnerId}::uuid
  `) as unknown as Array<{
    courses: string[];
    seasons: Record<string, StudyPlanSeason>;
    weekday_minutes: number;
    weekend_minutes: number;
    created_at: string;
    updated_at: string;
  }>;
  if (rows.length === 0) return null;
  const r = rows[0]!;
  return {
    courses: Array.isArray(r.courses) ? r.courses : [],
    seasons: r.seasons ?? {},
    weekdayMinutes: r.weekday_minutes,
    weekendMinutes: r.weekend_minutes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export interface StudyPlanPayload {
  plan: StudyPlanConfig;
  week: PlanWeekView;
  builtAt: string;
}

export async function buildStudyPlanPayload(
  sql: SqlFn,
  learnerId: string,
  plan: StudyPlanConfig,
  now: Date,
): Promise<StudyPlanPayload> {
  const week = await generatePlanWeek(sql, learnerId, plan, now);
  return { plan, week, builtAt: now.toISOString() };
}

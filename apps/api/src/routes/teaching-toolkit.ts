/**
 * Teaching Toolkit router — the 4 educator-ai generators in the Teacher
 * Dashboard (T-TEACH-012; plan of record: docs/TEACHING_TOOLKIT_PLAN.md §5;
 * contracts: packages/contracts/src/teaching-toolkit.ts, T-TEACH-010).
 *
 * Wires (mounted once at "/api/v1/teacher/toolkit" in src/index.ts):
 *   POST /generate        {toolType, classId?, courseId?, data} → 200
 *   GET  /context         ?classId= (&courseId=) (&topicId=) → chips + topics + outcomes
 *   GET  /resources       ?limit=50&type=&classId= (own rows only)
 *   GET  /resources/:id   detail (ownership-checked)
 *
 * THE OPERATOR DIRECTIVE (plan §1/§3): the tool data schemas carry NO
 * subject/board/level — the class context resolves them server-side from
 * the JWT-authenticated teacher's OWN class row (classes.teacher_id law,
 * the teacher-assignments resolveClassTarget ladder: 404 unknown → 403
 * other's → 409 archived). Ad-hoc courseId generations (no class) are the
 * documented exception — they resolve the course_registry chips directly
 * and persist class_id NULL.
 *
 * Generation law (the recreation's proven loop, 4/4 tools 100% structural
 * fidelity — znotes/research/2026-10-22-recreation.md):
 *   1. resolve context (+ ADR-CLASS-0001 gate: coalesce(ai_toolkit, true))
 *   2. provider availability check (a dead chain consumes nothing)
 *   3. quota consume (atomic upsert, SYLLABAI_TOOLKIT_DAILY_LIMIT default
 *      25/day/teacher — failed attempts still spent tokens, so the counter
 *      consumes BEFORE the chain call; 429 toolkit_quota_exhausted)
 *   4. prompt from prompt_versions (registry law — migration 0008 seeds
 *      teaching-toolkit/* v1.0; {token} interpolation + pure-token empty
 *      line collapse here; the interpolated template rides the chain's
 *      system slot, the user slot carries the fixed go line — DISCLOSED
 *      adaptation: the recreation proved the CONTENT, not the message slot)
 *   5. generate → zod wall (the T-TEACH-010 output schemas) + structure
 *      laws (lesson-plan timing sum, rubric criteria count, sow lesson
 *      count) → ONE self-heal retry feeding the violations back → hard
 *      failure persists a FAILED row and answers 502
 *   6. silent pins (deterministic fields the model must not decide):
 *      subject/topic/duration/objectives VERBATIM (lesson-plan),
 *      assessor/marks/criteria names + COMPUTED level scores 100/75/50/25
 *      (rubric), persona "Curriculum Planning Expert"/v1.0 + per-lesson
 *      duration (sow)
 *   7. persist append-only row (smart_mark_results posture) → 200
 *      {resource, output, elapsedMs, model, providerName, quota}
 *
 * This file is intentionally SELF-CONTAINED (route + module + prompt
 * builder): the T-TEACH-012 fence allows only this file, the one mount
 * line, the one ratelimit line, and test/teachingtoolkit/**.
 */
import { Hono, type Context } from "hono";
import type { ZodError } from "zod";
import {
  coachInputSchema,
  coachOutputSchema,
  lessonPlanInputSchema,
  lessonPlanOutputSchema,
  rubricInputSchema,
  rubricOutputSchema,
  sowInputSchema,
  sowOutputSchema,
  toolkitGenerateRequestSchema,
  toolkitToolTypeSchema,
  toolkitToolTypeToDb,
  toolkitLevelScores,
  TOOLKIT_PROMPT_REGISTRY,
  type CoachInput,
  type CoachOutput,
  type LessonPlanInput,
  type LessonPlanOutput,
  type RubricInput,
  type RubricOutput,
  type SowInput,
  type SowOutput,
  type ToolkitCoverageGap,
  type ToolkitGrounding,
  type ToolkitPassage,
  type ToolkitSowResume,
  type ToolkitClassContext,
  type ToolkitGenerateResponse,
  type ToolkitInputByTool,
  type ToolkitOutput,
  type ToolkitQuota,
  type ToolkitToolType,
} from "@syllabai/contracts";
import { requireDatabaseUrl } from "@syllabai/db";
import { apiError } from "../services/identity/errors";
import { getAuth, requireRole } from "../middleware/auth";
import { createSql } from "../services/identity/users";
import type { SqlFn } from "../services/assessment/sql";
import { buildLlmChain } from "../services/llmchain";
import {
  chainAsToolkitGenerator,
  ToolkitGenerationError,
  type ToolkitGenerator,
} from "../services/llmchain";
import type { FailoverLlmChain } from "../services/llmchain";

// ── environment ──────────────────────────────────────────────────────────────

/** ratelimitInt law (services/identity/config.ts): blank/invalid → fallback. */
function envInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number.parseInt(raw.trim(), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

/** plan §5: SYLLABAI_TOOLKIT_DAILY_LIMIT, default 25/day/teacher. */
const TOOLKIT_DAILY_LIMIT_DEFAULT = 25;
const TOOLKIT_LIST_MAX = 50;

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

// ── schema maps ──────────────────────────────────────────────────────────────

const TOOL_INPUT_SCHEMAS = {
  "lesson-plan": lessonPlanInputSchema,
  rubric: rubricInputSchema,
  sow: sowInputSchema,
  coach: coachInputSchema,
} as const;

const TOOL_OUTPUT_SCHEMAS = {
  "lesson-plan": lessonPlanOutputSchema,
  rubric: rubricOutputSchema,
  sow: sowOutputSchema,
  coach: coachOutputSchema,
} as const;

/** wire toolType → persistence tool_type (contracts law). */
function dbToolTypeToWire(db: string): ToolkitToolType {
  return (db === "lesson_plan" ? "lesson-plan" : db) as ToolkitToolType;
}

// ── errors (the onError vocabulary) ──────────────────────────────────────────

export class ToolkitClassNotFoundError extends Error {
  constructor(message = "class not found") {
    super(message);
    this.name = "ToolkitClassNotFoundError";
  }
}
export class ToolkitCourseNotFoundError extends Error {
  constructor(message = "course not found") {
    super(message);
    this.name = "ToolkitCourseNotFoundError";
  }
}
export class ToolkitResourceNotFoundError extends Error {
  constructor(message = "resource not found") {
    super(message);
    this.name = "ToolkitResourceNotFoundError";
  }
}
export class ToolkitForbiddenError extends Error {
  constructor(message = "this class belongs to another teacher") {
    super(message);
    this.name = "ToolkitForbiddenError";
  }
}
export class ToolkitArchivedError extends Error {
  constructor(message = "this class is archived") {
    super(message);
    this.name = "ToolkitArchivedError";
  }
}
export class ToolkitBadRequestError extends Error {
  constructor(message = "malformed request") {
    super(message);
    this.name = "ToolkitBadRequestError";
  }
}
/** 403 feature_disabled_by_teacher — the feature-gate.ts:190-194 code, FIXED text. */
export class ToolkitFeatureDisabledError extends Error {
  constructor() {
    super("the Teaching Toolkit is switched off for this class");
    this.name = "ToolkitFeatureDisabledError";
  }
}
/** 429 — carries the reset instants for the Retry-After header. */
export class ToolkitQuotaError extends Error {
  readonly used: number;
  readonly limit: number;
  readonly resetsAtMs: number;
  constructor(used: number, limit: number, resetsAtMs: number) {
    super(
      `daily toolkit quota exhausted (${limit}/${limit} used) — resets at ${new Date(
        resetsAtMs,
      ).toISOString()}`,
    );
    this.name = "ToolkitQuotaError";
    this.used = used;
    this.limit = limit;
    this.resetsAtMs = resetsAtMs;
  }
  get retryAfterSeconds(): number {
    return Math.max(1, Math.ceil((this.resetsAtMs - Date.now()) / 1000));
  }
}
/** 503 toolkit_unavailable — the tutor's honest-unavailable precedent, FIXED text. */
export class ToolkitUnavailableError extends Error {
  constructor() {
    super("the Teaching Toolkit is unavailable right now — the AI chain is not answering");
    this.name = "ToolkitUnavailableError";
  }
}
/** 502 — both generation attempts failed the wall; the FAILED row is self-forensic. */
export class ToolkitGenerationFailedError extends Error {
  constructor() {
    super("the generated document failed validation twice — please try again");
    this.name = "ToolkitGenerationFailedError";
  }
}
/** 500 — migration 0008's prompt_versions rows are missing (deployment error). */
export class ToolkitPromptRegistryError extends Error {
  constructor(registryKey: string) {
    super(`toolkit prompt template not registered: ${registryKey} (migration 0008 rows missing)`);
    this.name = "ToolkitPromptRegistryError";
  }
}

// ── the two-envelope body law (the teachermarking/assignments shape) ─────────

const malformedBody = () =>
  apiError(400, "malformed_body", "request body is not readable (check field types and enum values)");

async function readJsonBody(c: Context): Promise<{ ok: true; value: unknown } | { ok: false }> {
  try {
    return { ok: true, value: await c.req.json() };
  } catch {
    return { ok: false }; // syntax error / empty body
  }
}

/** Null laws (the assignments NULL_LAW map): null/undefined BINDS render the
 *  constraint message; wrong-type scalars/objects are the binding class. */
const NULL_LAW: Record<string, string> = {
  toolType: "must not be null",
  data: "must not be null",
};

function renderField(path: PropertyKey[]): string {
  return path.reduce<string>(
    (acc, seg) =>
      typeof seg === "number"
        ? `${acc}[${seg}]`
        : acc
          ? `${acc}.${String(seg)}`
          : String(seg),
    "",
  );
}

type BodyError = { kind: "malformed" } | { kind: "validation"; message: string };

/** prefix = the envelope's nested body (the generate handler passes "data"
 *  so its field failures render "data.duration: ..."). */
function classifyBodyError(error: ZodError, prefix = ""): BodyError {
  const first = error.issues[0];
  if (!first) return { kind: "validation", message: "request invalid" };
  const rendered = renderField(first.path);
  const field = prefix ? (rendered ? `${prefix}.${rendered}` : prefix) : rendered;
  if (first.code === "invalid_type") {
    const received = (first as { received?: string }).received;
    if (received === "null" || received === "undefined") {
      const nullMsg = NULL_LAW[field];
      return { kind: "validation", message: nullMsg ? `${field}: ${nullMsg}` : "request invalid" };
    }
    return { kind: "malformed" };
  }
  return { kind: "validation", message: `${field}: ${first.message ?? "request invalid"}` };
}

function bodyErrorResponse(c: Context, error: ZodError, prefix = ""): Response {
  const verdict = classifyBodyError(error, prefix);
  if (verdict.kind === "malformed") return c.json(malformedBody(), 400);
  return c.json(apiError(400, "validation_failed", verdict.message), 400);
}

// ── prompt interpolation (the migration 0008 token grammar) ──────────────────

/**
 * {token} interpolation with the PURE-TOKEN collapse law: a template line
 * that IS exactly one token and renders empty is dropped (the conditional
 * emphasis/preferences/style lines); every other line survives verbatim —
 * so a quoted PASSAGE with blank lines keeps them.
 */
export function interpolateTemplate(template: string, tokens: Record<string, string>): string {
  return template
    .split("\n")
    .flatMap((line) => {
      const rendered = line.replace(/\{(\w+)\}/g, (match, key: string) =>
        key in tokens ? tokens[key]! : match,
      );
      const pure = /^\{(\w+)\}$/.exec(line.trim());
      if (pure && (tokens[pure[1]!] ?? "") === "") return [];
      return [rendered];
    })
    .join("\n");
}

/** The user-slot go line (the system slot carries the interpolated template). */
const TOOLKIT_GO_LINE =
  "Generate the document now. Respond with ONLY the JSON object — no markdown fences, no commentary.";

type ResolvedContext = {
  classId: string | null;
  classLabel: string | null;
  courseId: string;
  subject: string;
  board: string | null;
  level: string;
  curriculumCode: string | null;
  aiToolkit: boolean;
};

/** The per-tool token fill (the recreation's prompt-fn logic, tokenized). */
function buildTokens(
  tool: ToolkitToolType,
  input: ToolkitInputByTool[ToolkitToolType],
  ctx: ResolvedContext,
): Record<string, string> {
  if (tool === "lesson-plan") {
    const lp = input as LessonPlanInput;
    const objectives = lp.learningObjectives.length
      ? lp.learningObjectives
      : [`Understand the core ideas of ${lp.topic}`];
    return {
      subject: ctx.subject,
      topic: lp.topic,
      duration: String(lp.duration),
      objectivesList: objectives.map((o, i) => `${i + 1}. ${o}`).join("\n"),
      teachingStyleLine: lp.teachingStyle ? `Preferred teaching style: ${lp.teachingStyle}.` : "",
      abilityLine: lp.studentAbility ? `Class ability: ${lp.studentAbility}.` : "",
      homework: lp.homework,
    };
  }
  if (tool === "rubric") {
    const rb = input as RubricInput;
    return {
      subject: ctx.subject,
      topic: rb.topic,
      assignmentType: rb.assignmentType,
      assignmentTypeLower: rb.assignmentType.toLowerCase(),
      taskDescription: rb.taskDescription,
      assessmentType: rb.assessmentType,
      marksPerCriterion: String(rb.marksPerCriterion),
      criteriaJson: JSON.stringify(rb.criteria),
      criteriaCount: String(rb.criteria.length),
    };
  }
  if (tool === "sow") {
    const sw = input as SowInput;
    return {
      subject: ctx.subject,
      board: ctx.board ?? "unspecified board",
      level: ctx.level,
      topic: sw.topic,
      totalLessons: String(sw.totalLessons),
      lessonDuration: String(sw.lessonDuration),
      difficultyLevel: sw.difficultyLevel,
      emphasisLine: sw.emphasisAreas.length
        ? `Emphasis areas to weave in: ${sw.emphasisAreas.join(", ")}.`
        : "",
      preferencesLine: sw.userPreferences ? `Teacher preferences: ${sw.userPreferences}` : "",
    };
  }
  const cc = input as CoachInput;
  const taskVerb =
    cc.mode === "clarify"
      ? "EXPLAIN the passage clearly, unpacking difficult ideas step by step"
      : "CHALLENGE the passage: extend it, stress-test it, surface misconceptions, and push understanding further";
  const audienceNote =
    cc.audience === "Teacher"
      ? "for a teacher who will re-teach this content"
      : cc.audience === "Parent"
        ? "for a parent supporting learning at home, plain language, minimal jargon"
        : `for a ${cc.audience.toLowerCase()} student`;
  return {
    subject: ctx.subject,
    taskVerb,
    audienceNote,
    inputText: cc.inputText,
    modeNote:
      cc.mode === "challenge"
        ? "For challenge mode, key_concepts descriptions should also flag common misconceptions and edge cases."
        : "For clarify mode, key_concepts descriptions should build from simple to precise.",
  };
}

// ── structure laws + silent pins (step 5/6 of the header law) ────────────────

/** Retryable structure laws — count/sum contracts the prompt demands and the
 *  fidelity anchors proved. Violations feed the self-heal retry. */
function structureLawIssues(
  tool: ToolkitToolType,
  input: ToolkitInputByTool[ToolkitToolType],
  output: ToolkitOutput,
): string[] {
  const issues: string[] = [];
  if (tool === "lesson-plan") {
    const lp = output as LessonPlanOutput;
    const li = input as LessonPlanInput;
    const total =
      lp.lessonPlan.starterActivity.duration +
      lp.lessonPlan.mainActivities.reduce((sum, a) => sum + a.duration, 0) +
      lp.lessonPlan.plenary.duration;
    if (total !== li.duration) {
      issues.push(`timing law: stages sum to ${total} minutes, expected exactly ${li.duration}`);
    }
  }
  if (tool === "rubric") {
    const ro = output as RubricOutput;
    const ri = input as RubricInput;
    if (ro.rubric.criteria.length !== ri.criteria.length) {
      issues.push(
        `criteria law: ${ro.rubric.criteria.length} rubric rows, expected exactly ${ri.criteria.length}`,
      );
    }
  }
  if (tool === "sow") {
    const so = output as SowOutput;
    const si = input as SowInput;
    if (so.lessons.length !== si.totalLessons) {
      issues.push(`lessons law: ${so.lessons.length} lessons, expected exactly ${si.totalLessons}`);
    }
  }
  return issues;
}

/** Silent pins — deterministic fields the model must NEVER decide (the
 *  no-subject law + the verbatim-objectives grounding law + the computed
 *  rubric scores + the fixed sow persona). Mutates the parsed output. */
function postProcess(
  tool: ToolkitToolType,
  input: ToolkitInputByTool[ToolkitToolType],
  output: ToolkitOutput,
  ctx: ResolvedContext,
  todayUtc: string,
): void {
  if (tool === "lesson-plan") {
    const lp = output as LessonPlanOutput;
    const li = input as LessonPlanInput;
    lp.overview.subject = ctx.subject;
    lp.overview.topic = li.topic;
    lp.overview.duration = li.duration;
    lp.overview.teachingStyle = li.teachingStyle ?? null;
    lp.overview.learningObjectives = [...li.learningObjectives];
    return;
  }
  if (tool === "rubric") {
    const ro = output as RubricOutput;
    const ri = input as RubricInput;
    ro.metadata.subject = ctx.subject;
    ro.metadata.topic = ri.topic;
    ro.metadata.assignmentType = ri.assignmentType;
    ro.metadata.assessmentType = ri.assessmentType;
    ro.metadata.assessor = "Teacher";
    ro.metadata.marksPerCriterion = ri.marksPerCriterion;
    ro.overview.criteriaAssessed = ri.criteria.length;
    const scores = toolkitLevelScores(ri.marksPerCriterion);
    ro.rubric.criteria.forEach((criterion, i) => {
      const name = ri.criteria[i];
      if (name !== undefined) criterion.name = name;
      criterion.levels.advanced.score = scores.advanced;
      criterion.levels.proficient.score = scores.proficient;
      criterion.levels.basic.score = scores.basic;
      criterion.levels.emerging.score = scores.emerging;
    });
    return;
  }
  if (tool === "sow") {
    const so = output as SowOutput;
    const si = input as SowInput;
    so.subject = ctx.subject;
    so.topic = si.topic;
    so.lessons.forEach((lesson, i) => {
      lesson.lessonNumber = i + 1;
      lesson.duration = si.lessonDuration;
    });
    so.metadata.author = "Curriculum Planning Expert";
    so.metadata.version = "1.0";
    so.metadata.createdAt = todayUtc;
    return;
  }
  void (output as CoachOutput); // coach: the document is the model's — no pins
}

// ── rows ─────────────────────────────────────────────────────────────────────

interface ToolkitResourceRow {
  id: string;
  teacher_id: string;
  class_id: string | null;
  course_slug: string;
  tool_type: string;
  input_metadata: unknown;
  output: unknown;
  status: string;
  model: string | null;
  provider_name: string | null;
  failure_reason: string | null;
  elapsed_ms: number | null;
  created_at: string | Date;
}

function isoCreatedAt(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapSummary(row: ToolkitResourceRow) {
  return {
    id: row.id,
    toolType: dbToolTypeToWire(row.tool_type),
    courseId: row.course_slug,
    classId: row.class_id,
    status: row.status === "FAILED" ? "FAILED" : "SUCCESS",
    model: row.model,
    providerName: row.provider_name,
    elapsedMs: row.elapsed_ms,
    createdAt: isoCreatedAt(row.created_at),
    input: (row.input_metadata ?? {}) as Record<string, unknown>,
  };
}

/**
 * Natural spec-code comparator (T-TEACH-015) — the syllabus order the dotted
 * codes imply, which plain lexicographic ordering breaks ('1.10' sorts before
 * '1.2'). Tokenize digit/non-digit runs; digit runs compare numerically, and
 * a digit run sorts before a letter run at the same slot ('4MB1-S1-1A' vs
 * '4MB1-S1-1B' rides the numeric prefix then the letter tiebreak).
 */
export function specCodeCompare(a: string, b: string): number {
  const tokens = (s: string): string[] => s.match(/\d+|\D+/g) ?? [];
  const at = tokens(a);
  const bt = tokens(b);
  const len = Math.max(at.length, bt.length);
  for (let i = 0; i < len; i++) {
    const x = at[i];
    const y = bt[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const xNum = /^\d+$/.test(x);
    const yNum = /^\d+$/.test(y);
    if (xNum && yNum) {
      const d = Number(x) - Number(y);
      if (d !== 0) return d;
      continue;
    }
    if (xNum !== yNum) {
      // mixed slot: the run STARTING with a digit goes first, then the
      // plain string tiebreak keeps the order total
      const xLead = /^\d/.test(x);
      const yLead = /^\d/.test(y);
      if (xLead !== yLead) return xLead ? -1 : 1;
    }
    const c = x.localeCompare(y);
    if (c !== 0) return c;
  }
  return 0;
}

/** coach inputText cap (the passage rides it; the ellipsis is the honest
 *  truncation disclosure). */
const PASSAGE_BODY_MAX = 2000;

function trimPassageBody(body: string): string {
  const clean = body.trim();
  if (clean.length <= PASSAGE_BODY_MAX) return clean;
  return `${clean.slice(0, PASSAGE_BODY_MAX - 1).trimEnd()}\u2026`;
}

function utcDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

function nextUtcMidnightMs(at: Date): number {
  return Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate() + 1);
}

// ── the module (service law; the route binds, the module enforces) ───────────

export interface ToolkitClock {
  newId(): string;
  now(): Date;
}

export interface GenerateCommand {
  toolType: ToolkitToolType;
  classId: string | null;
  courseId: string | null;
  input: ToolkitInputByTool[ToolkitToolType];
}

export interface TeachingToolkitModule {
  generate(teacherId: string, command: GenerateCommand): Promise<ToolkitGenerateResponse>;
  context(
    teacherId: string,
    params: { classId: string | null; courseId: string | null; topicId: string | null },
  ): Promise<{
    context: ToolkitClassContext;
    quota: ToolkitQuota;
    topics: Array<{ topicId: string; title: string; learningObjective: string | null; source: string }>;
    topic?: { topicId: string; title: string; learningObjective: string | null; source: string };
    outcomes?: Array<{ nodeId: string | null; title: string; coverage: string | null }>;
    grounding?: ToolkitGrounding;
  }>;
  listResources(
    teacherId: string,
    params: { limit: number; type: ToolkitToolType | null; classId: string | null },
  ): Promise<Array<ReturnType<typeof mapSummary>>>;
  resourceDetail(teacherId: string, id: string): Promise<Record<string, unknown>>;
}

export function buildTeachingToolkitModule(deps: {
  sql: SqlFn;
  generator: ToolkitGenerator;
  clock?: ToolkitClock;
  dailyLimit?: number;
}): TeachingToolkitModule {
  const clock: ToolkitClock = deps.clock ?? {
    newId: () => crypto.randomUUID(),
    now: () => new Date(),
  };
  const dailyLimit = deps.dailyLimit ?? TOOLKIT_DAILY_LIMIT_DEFAULT;
  const templateCache = new Map<ToolkitToolType, string>();

  const classContextQuery = async (classId: string) => {
    const rows = (await deps.sql`
      select c.id, c.teacher_id, c.course_slug, c.course_label, c.name, c.status,
             coalesce(f.ai_toolkit, true) as ai_toolkit
      from classes c left join class_features f on f.class_id = c.id
      where c.id = ${classId}::uuid`) as Array<{
      id: string;
      teacher_id: string;
      course_slug: string;
      course_label: string;
      name: string;
      status: string;
      ai_toolkit: boolean;
    }>;
    return rows[0];
  };

  const courseContextQuery = async (courseSlug: string) => {
    const rows = (await deps.sql`
      select course_slug, subject, board, level, curriculum_code, code, label
      from course_registry where course_slug = ${courseSlug}`) as Array<{
      course_slug: string;
      subject: string;
      board: string | null;
      level: string;
      curriculum_code: string | null;
      code: string;
      label: string | null;
    }>;
    return rows[0];
  };

  const toResolved = (
    cls: { ai_toolkit: boolean; course_label: string; id: string } | null,
    course: {
      course_slug: string;
      subject: string;
      board: string | null;
      level: string;
      curriculum_code: string | null;
      label: string | null;
    },
  ): ResolvedContext => ({
    classId: cls?.id ?? null,
    classLabel: cls?.course_label ?? null,
    courseId: course.course_slug,
    subject: course.subject,
    board: course.board,
    level: course.level,
    curriculumCode: course.curriculum_code,
    aiToolkit: cls ? cls.ai_toolkit : true,
  });

  /** the ownership ladder (resolveClassTarget parity, parametrized for reads) */
  const resolveClassContext = async (
    teacherId: string,
    classId: string,
    allowArchived: boolean,
  ): Promise<ResolvedContext> => {
    const cls = await classContextQuery(classId);
    if (!cls) throw new ToolkitClassNotFoundError(`unknown class target: ${classId}`);
    if (cls.teacher_id !== teacherId) {
      throw new ToolkitForbiddenError("this class belongs to another teacher");
    }
    if (!allowArchived && cls.status !== "ACTIVE") {
      throw new ToolkitArchivedError("this class is archived");
    }
    const course = await courseContextQuery(cls.course_slug);
    if (!course) throw new ToolkitCourseNotFoundError(`unknown course: ${cls.course_slug}`);
    return toResolved(cls, course);
  };

  const resolveAdHocContext = async (courseSlug: string): Promise<ResolvedContext> => {
    const course = await courseContextQuery(courseSlug);
    if (!course) throw new ToolkitCourseNotFoundError(`unknown course: ${courseSlug}`);
    return toResolved(null, course);
  };

  const consumeQuota = async (teacherId: string, day: string): Promise<ToolkitQuota> => {
    const rows = (await deps.sql`
      insert into teaching_toolkit_usage (teacher_id, usage_day, used)
      values (${teacherId}::uuid, ${day}::date, 1)
      on conflict (teacher_id, usage_day) do update
        set used = teaching_toolkit_usage.used + 1
        where teaching_toolkit_usage.used < ${dailyLimit}
      returning used`) as Array<{ used: number }>;
    const resetsAtMs = nextUtcMidnightMs(clock.now());
    if (!rows[0]) throw new ToolkitQuotaError(dailyLimit, dailyLimit, resetsAtMs);
    return { used: rows[0].used, limit: dailyLimit, resetsAt: new Date(resetsAtMs).toISOString() };
  };

  const readQuota = async (teacherId: string): Promise<ToolkitQuota> => {
    const day = utcDay(clock.now());
    const rows = (await deps.sql`
      select used from teaching_toolkit_usage
      where teacher_id = ${teacherId}::uuid and usage_day = ${day}::date`) as Array<{
      used: number;
    }>;
    const resetsAtMs = nextUtcMidnightMs(clock.now());
    return {
      used: rows[0]?.used ?? 0,
      limit: dailyLimit,
      resetsAt: new Date(resetsAtMs).toISOString(),
    };
  };

  const loadTemplate = async (tool: ToolkitToolType): Promise<string> => {
    const hit = templateCache.get(tool);
    if (hit !== undefined) return hit;
    const reg = TOOLKIT_PROMPT_REGISTRY[tool];
    const rows = (await deps.sql`
      select template from prompt_versions
      where registry_key = ${reg.registryKey} and version = ${reg.version}`) as Array<{
      template: string;
    }>;
    const template = rows[0]?.template;
    if (!template) throw new ToolkitPromptRegistryError(reg.registryKey);
    templateCache.set(tool, template);
    return template;
  };

  // ── T-TEACH-015 grounding depth (READ-ONLY over teaching_coverage) ────────
  //
  // The spec join of record: the course's curriculum_code FIRST token is the
  // code prefix BOTH seeding styles share — qualification-code trees
  // ('4MB1-2016' → '4MB1-S1-1A', '4CH1-2017' → '4CH1-1.1') and full-code
  // trees ('0500-2024-2026' → '0500-2024-2026-S1.001') alike. The spec
  // points ride knowledge_edges PART_OF onto their TOPIC parent; coverage
  // rides teaching_coverage rows for THIS class (the heatmap's read lane).
  const buildGrounding = async (
    classId: string,
    curriculumCode: string,
    chapters: Array<{ id: string; title: string; learning_objective: string | null }>,
  ): Promise<ToolkitGrounding> => {
    const prefix = `${curriculumCode.split("-")[0]}-`;

    const specRows = (await deps.sql`
      select n.id, n.code, n.title, t.id as topic_id, t.title as topic_title
      from knowledge_nodes n
      join knowledge_edges e on e.source_node_id = n.id and e.relation_type = 'PART_OF'
      join knowledge_nodes t on t.id = e.target_node_id
      where n.node_type = 'SPEC_POINT' and n.code like ${prefix} || '%'`) as Array<{
      id: string;
      code: string;
      title: string;
      topic_id: string;
      topic_title: string;
    }>;

    const covRows = (await deps.sql`
      select spec_point_node_id, status from teaching_coverage
      where class_id = ${classId}::uuid`) as Array<{
      spec_point_node_id: string;
      status: string;
    }>;

    const noteRows = (await deps.sql`
      select rn.note_id, rn.title, rn.topic_title, rn.body_md, rn.spec_point_codes
      from revision_note rn
      where exists (
        select 1 from unnest(string_to_array(rn.spec_point_codes, ',')) as code
        join knowledge_nodes n on n.code = code
        where n.code like ${prefix} || '%')
      order by rn.topic_order asc, rn.subtopic_order asc, rn.note_order asc
      limit 12`) as Array<{
      note_id: string;
      title: string;
      topic_title: string;
      body_md: string;
      spec_point_codes: string;
    }>;

    const taughtByPoint = new Map<string, string>();
    for (const row of covRows) taughtByPoint.set(row.spec_point_node_id, row.status);
    const isTaught = (nodeId: string): boolean => taughtByPoint.get(nodeId) === "TAUGHT";

    const specs = specRows
      .map((row) => ({ ...row, title: row.title.slice(0, 300) }))
      .sort((a, b) => specCodeCompare(a.code, b.code));

    const taughtCount = specs.filter((s) => isTaught(s.id)).length;
    const firstUn = specs.find((s) => !isTaught(s.id)) ?? null;
    const sowResume: ToolkitSowResume | null = firstUn
      ? {
          specPointNodeId: firstUn.id,
          specCode: firstUn.code,
          specTitle: firstUn.title,
          topicNodeId: firstUn.topic_id,
          topicTitle: firstUn.topic_title.slice(0, 300),
        }
      : null;

    // coverage gaps: topics in syllabus order (by their first untaught spec
    // point), biggest run of untaught content first in the TEACHER's reading
    // order — NOT a mastery claim (the weakness lane stays with T-MIG-034)
    const byTopic = new Map<string, { title: string; total: number; untaught: number }>();
    for (const s of specs) {
      const agg = byTopic.get(s.topic_id) ?? { title: s.topic_title, total: 0, untaught: 0 };
      agg.total += 1;
      if (!isTaught(s.id)) agg.untaught += 1;
      byTopic.set(s.topic_id, agg);
    }
    const coverageGaps: ToolkitCoverageGap[] = [];
    for (const [topicId, agg] of byTopic) {
      if (agg.untaught > 0 && coverageGaps.length < 8) {
        coverageGaps.push({
          topicNodeId: topicId,
          topicTitle: agg.title.slice(0, 300),
          untaughtCount: agg.untaught,
          totalCount: agg.total,
        });
      }
    }

    // coach note cards: the course's revision notes (body_md — the real
    // content source) first, then chapter learning objectives; the body cap
    // rides the coach inputText contract
    const passages: ToolkitPassage[] = [];
    for (const n of noteRows) {
      if (passages.length >= 12) break;
      passages.push({
        passageId: `rn:${n.note_id}`.slice(0, 80),
        source: "revision_note",
        title: n.title.slice(0, 300),
        body: trimPassageBody(n.body_md),
        ref: n.spec_point_codes ? n.spec_point_codes.slice(0, 160) : null,
      });
    }
    for (const ch of chapters) {
      if (passages.length >= 12) break;
      if (!ch.learning_objective?.trim()) continue;
      passages.push({
        passageId: `bc:${ch.id}`.slice(0, 80),
        source: "book_chapter",
        title: ch.title.slice(0, 300),
        body: trimPassageBody(ch.learning_objective),
        ref: null,
      });
    }

    return {
      specPointsTaught: taughtCount,
      specPointsTotal: specs.length,
      sowResume,
      coverageGaps,
      passages,
    };
  };

  const persistRow = async (row: {
    teacherId: string;
    classId: string | null;
    courseSlug: string;
    toolType: ToolkitToolType;
    inputMetadata: unknown;
    output: unknown;
    status: "SUCCESS" | "FAILED";
    model: string | null;
    providerName: string | null;
    failureReason: string | null;
    elapsedMs: number;
  }): Promise<string> => {
    const id = clock.newId();
    await deps.sql`
      insert into teaching_toolkit_resources
        (id, teacher_id, class_id, course_slug, tool_type, input_metadata, output,
         status, model, provider_name, failure_reason, elapsed_ms, created_at)
      values (${id}::uuid, ${row.teacherId}::uuid, ${row.classId}, ${row.courseSlug},
        ${toolkitToolTypeToDb(row.toolType)}, ${JSON.stringify(row.inputMetadata)},
        ${row.output === null ? null : JSON.stringify(row.output)}, ${row.status},
        ${row.model}, ${row.providerName}, ${row.failureReason}, ${row.elapsedMs},
        ${clock.now().toISOString()})`;
    return id;
  };

  return {
    async generate(teacherId, command) {
      const startedAt = Date.now();
      // 1. context + gate (the no-subject law: the chips come from HERE)
      const ctx = command.classId
        ? await resolveClassContext(teacherId, command.classId, false)
        : await resolveAdHocContext(command.courseId!);
      if (command.classId && !ctx.aiToolkit) throw new ToolkitFeatureDisabledError();
      // 2. a dead chain consumes nothing
      if (!deps.generator.available()) throw new ToolkitUnavailableError();
      // 3. quota consumes BEFORE the spend (failed attempts still cost tokens)
      const quota = await consumeQuota(teacherId, utcDay(clock.now()));

      const inputMetadataOnly = {
        toolType: command.toolType,
        data: command.input,
        context: {
          classId: ctx.classId,
          classLabel: ctx.classLabel,
          courseId: ctx.courseId,
          subject: ctx.subject,
          board: ctx.board,
          level: ctx.level,
          curriculumCode: ctx.curriculumCode,
        },
      };

      const template = await loadTemplate(command.toolType);
      const system = interpolateTemplate(template, buildTokens(command.toolType, command.input, ctx));
      const outputSchema = TOOL_OUTPUT_SCHEMAS[command.toolType];

      let issues: string[] = [];
      let user = TOOLKIT_GO_LINE;
      for (let attempt = 1; attempt <= 2; attempt++) {
        let generation;
        try {
          generation = await deps.generator.generate(system, user);
        } catch (err) {
          const reason =
            err instanceof ToolkitGenerationError ? err.reason : "PROVIDER_UNAVAILABLE";
          if (reason === "PROVIDER_UNAVAILABLE") {
            // the chain died mid-flight — terminal, self-forensic row, honest 503
            await persistRow({
              teacherId,
              classId: ctx.classId,
              courseSlug: ctx.courseId,
              toolType: command.toolType,
              inputMetadata: inputMetadataOnly,
              output: null,
              status: "FAILED",
              model: null,
              providerName: null,
              failureReason: reason,
              elapsedMs: Date.now() - startedAt,
            });
            throw new ToolkitUnavailableError();
          }
          // UNPARSEABLE_OUTPUT / TRUNCATED_OUTPUT: the bridge refused the raw
          // text BEFORE the zod wall could — this is an ATTEMPT failure and
          // MUST ride the same self-heal retry as a wall failure (the
          // recreation's proven loop: parse failures get one corrected pass)
          issues = [reason];
          if (attempt === 2) {
            await persistRow({
              teacherId,
              classId: ctx.classId,
              courseSlug: ctx.courseId,
              toolType: command.toolType,
              inputMetadata: inputMetadataOnly,
              output: null,
              status: "FAILED",
              model: null,
              providerName: null,
              failureReason: `${reason} on both attempts`.slice(0, 500),
              elapsedMs: Date.now() - startedAt,
            });
            throw new ToolkitGenerationFailedError();
          }
          user = `Your previous response failed schema validation: ${reason} — no usable JSON object came back. Return the corrected COMPLETE JSON object only — same contract, no commentary.`;
          continue;
        }
        const parsed = outputSchema.safeParse(generation.root);
        if (parsed.success) {
          issues = structureLawIssues(command.toolType, command.input, parsed.data);
          if (issues.length === 0 || attempt === 2) {
            if (issues.length > 0) {
              // both attempts violated a structure law — self-forensic row
              await persistRow({
                teacherId,
                classId: ctx.classId,
                courseSlug: ctx.courseId,
                toolType: command.toolType,
                inputMetadata: inputMetadataOnly,
                output: null,
                status: "FAILED",
                model: generation.model,
                providerName: generation.providerName,
                failureReason: issues.join("; ").slice(0, 500),
                elapsedMs: Date.now() - startedAt,
              });
              throw new ToolkitGenerationFailedError();
            }
            postProcess(command.toolType, command.input, parsed.data, ctx, utcDay(clock.now()));
            const elapsedMs = Date.now() - startedAt;
            const resourceId = await persistRow({
              teacherId,
              classId: ctx.classId,
              courseSlug: ctx.courseId,
              toolType: command.toolType,
              inputMetadata: inputMetadataOnly,
              output: parsed.data,
              status: "SUCCESS",
              model: generation.model,
              providerName: generation.providerName,
              failureReason: null,
              elapsedMs,
            });
            return {
              resource: {
                id: resourceId,
                toolType: command.toolType,
                courseId: ctx.courseId,
                classId: ctx.classId,
                status: "SUCCESS" as const,
                model: generation.model,
                providerName: generation.providerName,
                elapsedMs,
                createdAt: clock.now().toISOString(),
                input: inputMetadataOnly as Record<string, unknown>,
              },
              output: parsed.data,
              elapsedMs,
              model: generation.model,
              providerName: generation.providerName,
              quota,
            };
          }
          // attempt 1 failed the wall — feed the violations back (the proven
          // self-heal loop) and retry
          user = `Your previous response failed validation: ${issues
            .slice(0, 4)
            .join("; ")}. Return the corrected COMPLETE JSON object only — same contract, no commentary.`;
          continue;
        }
        // zod wall failure — render the first issues for the retry feed
        issues = parsed.error.issues
          .slice(0, 4)
          .map((issue) => `${renderField(issue.path)}: ${issue.message}`);
        if (attempt === 2) {
          await persistRow({
            teacherId,
            classId: ctx.classId,
            courseSlug: ctx.courseId,
            toolType: command.toolType,
            inputMetadata: inputMetadataOnly,
            output: null,
            status: "FAILED",
            model: generation.model,
            providerName: generation.providerName,
            failureReason: issues.join("; ").slice(0, 500),
            elapsedMs: Date.now() - startedAt,
          });
          throw new ToolkitGenerationFailedError();
        }
        user = `Your previous response failed schema validation: ${issues.join("; ")}. Return the corrected COMPLETE JSON object only — same contract, no commentary.`;
      }
      // unreachable (the loop returns or throws on both paths)
      throw new ToolkitGenerationFailedError();
    },

    async context(teacherId, params) {
      // context is a READ — archived classes stay readable (the assignments
      // list posture); generation alone 409s
      const ctx = params.classId
        ? await resolveClassContext(teacherId, params.classId, true)
        : await resolveAdHocContext(params.courseId!);
      const quota = await readQuota(teacherId);
      const topicRows = (await deps.sql`
        select id, title, learning_objective from book_chapters
        where course_id = ${ctx.courseId}
        order by chapter_index asc limit 60`) as Array<{
        id: string;
        title: string;
        learning_objective: string | null;
      }>;
      const topics = topicRows.map((row) => ({
        topicId: row.id,
        title: row.title,
        learningObjective: row.learning_objective,
        source: "book_chapter",
      }));
      const wireContext: ToolkitClassContext = {
        classId: ctx.classId,
        courseId: ctx.courseId,
        classLabel: ctx.classLabel,
        subject: ctx.subject,
        board: ctx.board,
        level: ctx.level,
        curriculumCode: ctx.curriculumCode,
      };

      // grounding depth (T-TEACH-015) — class-bound only (ad-hoc contexts
      // have no coverage to ground in). Additive depth: a build failure
      // degrades to the block's ABSENCE — logged, never silent — so the
      // primary context (chips/topics/outcomes) stays bulletproof.
      let grounding: ToolkitGrounding | undefined;
      if (ctx.classId && ctx.curriculumCode) {
        try {
          grounding = await buildGrounding(ctx.classId, ctx.curriculumCode, topicRows);
        } catch (err) {
          console.error("[teaching-toolkit] grounding build failed:", err);
        }
      }

      if (!params.topicId) return { context: wireContext, quota, topics, grounding };

      // topic outcomes: the book-chapter lane first, then the spec-tree lane
      const chapterRows = (await deps.sql`
        select id, title, learning_objective from book_chapters
        where id = ${params.topicId}::uuid and course_id = ${ctx.courseId}`) as Array<{
        id: string;
        title: string;
        learning_objective: string | null;
      }>;
      const chapter = chapterRows[0];
      if (chapter) {
        const topic = {
          topicId: chapter.id,
          title: chapter.title,
          learningObjective: chapter.learning_objective,
          source: "book_chapter",
        };
        const outcomes = chapter.learning_objective
          ? [{ nodeId: null, title: chapter.learning_objective, coverage: null }]
          : [];
        return { context: wireContext, quota, topics, topic, outcomes, grounding };
      }
      const nodeRows = (await deps.sql`
        select id, title, node_type from knowledge_nodes where id = ${params.topicId}::uuid`) as Array<{
        id: string;
        title: string;
        node_type: string;
      }>;
      const node = nodeRows[0];
      if (!node) throw new ToolkitResourceNotFoundError(`topic ${params.topicId} not found`);
      const specRows = (await deps.sql`
        select n.id, n.title, tc.status as coverage
        from knowledge_edges e
        join knowledge_nodes n on n.id = e.target_node_id and n.node_type = 'SPEC_POINT'
        left join teaching_coverage tc on tc.spec_point_node_id = n.id and tc.class_id = ${ctx.classId}::uuid
        where e.source_node_id = ${params.topicId}::uuid and e.relation_type = 'PART_OF'
        order by n.title asc limit 60`) as Array<{
        id: string;
        title: string;
        coverage: string | null;
      }>;
      return {
        context: wireContext,
        quota,
        topics,
        grounding,
        topic: {
          topicId: node.id,
          title: node.title,
          learningObjective: null,
          source: "spec_tree",
        },
        outcomes: specRows.map((row) => ({
          nodeId: row.id,
          title: row.title,
          coverage: row.coverage ?? null,
        })),
      };
    },

    async listResources(teacherId, params) {
      const rows = (await deps.sql`
        select id, tool_type, course_slug, class_id, status, model, provider_name,
               elapsed_ms, created_at, input_metadata
        from teaching_toolkit_resources
        where teacher_id = ${teacherId}::uuid
          and (${params.classId}::uuid is null or class_id = ${params.classId}::uuid)
          and (${params.type === null ? null : toolkitToolTypeToDb(params.type)}::text is null or tool_type = ${params.type === null ? null : toolkitToolTypeToDb(params.type)}::text)
        order by created_at desc limit ${params.limit}`) as unknown as ToolkitResourceRow[];
      return rows.map(mapSummary);
    },

    async resourceDetail(teacherId, id) {
      const rows = (await deps.sql`
        select id, teacher_id, tool_type, course_slug, class_id, status, model,
               provider_name, failure_reason, elapsed_ms, created_at, input_metadata, output
        from teaching_toolkit_resources where id = ${id}::uuid`) as unknown as ToolkitResourceRow[];
      const row = rows[0];
      if (!row) throw new ToolkitResourceNotFoundError(`unknown resource: ${id}`);
      if (row.teacher_id !== teacherId) {
        throw new ToolkitForbiddenError("this resource belongs to another teacher");
      }
      const outputSchema = TOOL_OUTPUT_SCHEMAS[dbToolTypeToWire(row.tool_type)];
      const parsedOutput = row.output === null ? null : outputSchema.safeParse(row.output);
      return {
        ...mapSummary(row),
        output: parsedOutput?.success ? parsedOutput.data : null,
        failureReason: row.failure_reason,
      };
    },
  };
}

// ── the router ───────────────────────────────────────────────────────────────

function toolkitOnError(err: unknown, c: Context): Response {
  if (err instanceof ToolkitClassNotFoundError) {
    return c.json(apiError(404, "class_not_found", err.message), 404);
  }
  if (err instanceof ToolkitCourseNotFoundError) {
    return c.json(apiError(404, "course_not_found", err.message), 404);
  }
  if (err instanceof ToolkitResourceNotFoundError) {
    return c.json(apiError(404, "not_found", err.message), 404);
  }
  if (err instanceof ToolkitForbiddenError) {
    return c.json(apiError(403, "forbidden", err.message), 403);
  }
  if (err instanceof ToolkitFeatureDisabledError) {
    return c.json(apiError(403, "feature_disabled_by_teacher", err.message), 403);
  }
  if (err instanceof ToolkitArchivedError) {
    return c.json(apiError(409, "conflict", err.message), 409);
  }
  if (err instanceof ToolkitBadRequestError) {
    return c.json(apiError(400, "bad_request", err.message), 400);
  }
  if (err instanceof ToolkitQuotaError) {
    c.header("Retry-After", String(err.retryAfterSeconds));
    return c.json(apiError(429, "toolkit_quota_exhausted", err.message), 429);
  }
  if (err instanceof ToolkitUnavailableError) {
    return c.json(apiError(503, "toolkit_unavailable", err.message), 503);
  }
  if (err instanceof ToolkitGenerationFailedError) {
    return c.json(apiError(502, "toolkit_generation_failed", err.message), 502);
  }
  if (err instanceof ToolkitPromptRegistryError) {
    console.error("[teaching-toolkit] prompt registry hole:", err.message);
    return c.json(apiError(500, "internal_error", "an internal error occurred"), 500);
  }
  console.error("[teaching-toolkit] unhandled error:", err);
  return c.json(apiError(500, "internal_error", "an internal error occurred"), 500);
}

/** query-param uuid law (the @PathVariable parity): shape-checked, 400. */
function requireUuidParam(raw: string | undefined, label: string): string | null {
  if (raw === undefined || raw === "") return null;
  if (!UUID_RE.test(raw)) throw new ToolkitBadRequestError("malformed request");
  return raw;
}

export function createTeachingToolkitRouter(module: TeachingToolkitModule): Hono {
  const r = new Hono();

  r.onError((err, c) => toolkitOnError(err, c));

  // Authz shell: TEACHER/ADMIN answers the Boot body before every handler
  // (SecurityConfig /api/v1/teacher/** parity — the assignments shape).
  r.use("*", async (c, next) => {
    const gate = requireRole(c, "TEACHER", "ADMIN");
    if (gate instanceof Response) return gate;
    await next();
  });

  // POST /generate — envelope parse → per-tool data parse → module law
  r.post("/generate", async (c) => {
    const auth = getAuth(c)!; // shell invariant: authenticated
    const raw = await readJsonBody(c);
    if (!raw.ok) return c.json(malformedBody(), 400);
    const envelope = toolkitGenerateRequestSchema.safeParse(raw.value);
    if (!envelope.success) return bodyErrorResponse(c, envelope.error);
    const tool = envelope.data.toolType;
    const dataParsed = TOOL_INPUT_SCHEMAS[tool].safeParse(envelope.data.data);
    if (!dataParsed.success) return bodyErrorResponse(c, dataParsed.error, "data");
    const payload = await module.generate(auth.userId, {
      toolType: tool,
      classId: envelope.data.classId,
      courseId: envelope.data.courseId,
      input: dataParsed.data as ToolkitInputByTool[ToolkitToolType],
    });
    return c.json(payload, 200);
  });

  // GET /context — chips + topics (+ outcomes when ?topicId=)
  r.get("/context", async (c) => {
    const auth = getAuth(c)!;
    const classId = requireUuidParam(c.req.query("classId"), "classId");
    const courseId = c.req.query("courseId") ?? null;
    const topicId = requireUuidParam(c.req.query("topicId"), "topicId");
    if (!classId && !courseId) {
      return c.json(
        apiError(400, "validation_failed", "classId: must not be null (or pass courseId for an ad-hoc context)"),
        400,
      );
    }
    return c.json(
      await module.context(auth.userId, {
        classId,
        courseId: classId ? null : courseId,
        topicId,
      }),
      200,
    );
  });

  // GET /resources — the teacher's OWN newest rows (own-rows-only law)
  r.get("/resources", async (c) => {
    const auth = getAuth(c)!;
    const rawLimit = Number.parseInt(c.req.query("limit") ?? "50", 10);
    const limit = Number.isNaN(rawLimit) ? TOOLKIT_LIST_MAX : Math.min(Math.max(rawLimit, 1), TOOLKIT_LIST_MAX);
    const rawType = c.req.query("type");
    let type: ToolkitToolType | null = null;
    if (rawType !== undefined && rawType !== "") {
      const parsed = toolkitToolTypeSchema.safeParse(rawType);
      if (!parsed.success) throw new ToolkitBadRequestError("malformed request");
      type = parsed.data;
    }
    const classId = requireUuidParam(c.req.query("classId"), "classId");
    return c.json(await module.listResources(auth.userId, { limit, type, classId }), 200);
  });

  // GET /resources/:id — detail, ownership-checked (404 unknown, 403 not-yours)
  r.get("/resources/:id", async (c) => {
    const auth = getAuth(c)!;
    const raw = c.req.param("id");
    if (!UUID_RE.test(raw)) throw new ToolkitBadRequestError("malformed request");
    return c.json(await module.resourceDetail(auth.userId, raw), 200);
  });

  return r;
}

// ── the factory (the fleet seam shape) ───────────────────────────────────────

export function buildTeachingToolkitRouters(
  env: Record<string, string | undefined> = process.env,
  seams: {
    chain?: FailoverLlmChain;
    /** direct generator seam — tests; wins over chain when present */
    generator?: ToolkitGenerator;
    clock?: ToolkitClock;
    dailyLimit?: number;
  } = {},
) {
  const databaseUrl = requireDatabaseUrl(env as { DATABASE_URL?: string });
  const sql = createSql(databaseUrl);
  const chain = seams.chain ?? buildLlmChain(env);
  const generator = seams.generator ?? chainAsToolkitGenerator(chain);
  const module = buildTeachingToolkitModule({
    sql,
    generator,
    clock: seams.clock,
    dailyLimit: seams.dailyLimit,
  });
  return {
    module,
    toolkitRoute: createTeachingToolkitRouter(module),
  };
}

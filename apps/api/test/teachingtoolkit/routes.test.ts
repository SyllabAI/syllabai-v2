/**
 * Teaching Toolkit route tests (T-TEACH-012) — the observable HTTP contract
 * of the 4 generator wires over /api/v1/teacher/toolkit, over an IN-MEMORY
 * Hono app wiring the REAL module over stubbed sql (no Neon) with a FAKE
 * ToolkitGenerator seam — the T-MIG-052-t2 / T-MIG-117 route-test pattern.
 *
 * Pinned here:
 *   - the Boot 401/403 authz shells (requireRole TEACHER/ADMIN)
 *   - the TWO-ENVELOPE law (malformed_body vs validation_failed "field: message")
 *   - the class-context ownership ladder: 404 class_not_found → 403
 *     forbidden → 409 conflict (archived) — the resolveClassTarget parity
 *   - the ADR-CLASS-0001 gate (ai_toolkit false → 403 feature_disabled_by_teacher)
 *   - the quota law (atomic consume; 429 toolkit_quota_exhausted + Retry-After;
 *     a dead chain consumes NOTHING — 503 toolkit_unavailable)
 *   - the generation law: zod wall + ONE self-heal retry (parse garbage →
 *     corrected output), structure-law retry (sow lesson count), hard
 *     failure → 502 + a FAILED append-only row
 *   - the silent pins: class-resolved subject (THE no-subject-picker law),
 *     verbatim learningObjectives, computed rubric level scores (100/75/50/25),
 *     the fixed sow persona
 *   - context (chips + book-chapter topics + spec-tree outcomes with
 *     teaching_coverage) and resources (own-rows-only list + ownership detail)
 */
import { describe, expect, test } from "bun:test";
import { Hono, type Context } from "hono";
import { createTeachingToolkitRouter, buildTeachingToolkitModule } from "../../src/routes/teaching-toolkit";
import { ToolkitGenerationError, type ToolkitGenerator, type ToolkitGeneration } from "../../src/services/llmchain";
import { toErrorResponse } from "../../src/services/identity/errors";
import { fakeSql, type Route } from "../assessment/helpers";

// ── fixtures (fixed-constant uuids, the golden law) ──────────────────────────

const TEACHER = "aa000000-0000-4000-8000-000000000001";
const OTHER_TEACHER = "aa000000-0000-4000-8000-000000000002";
const CLASS_A = "cc000000-0000-4000-8000-000000000001";
const RESOURCE_A = "dd000000-0000-4000-8000-000000000001";
const NEW_ID = "7e571d00-0000-4000-8000-000000000001";
const CHAPTER_ID = "ee000000-0000-4000-8000-000000000001";
const TOPIC_NODE = "20000000-0000-4000-8000-000000000012";
const SPEC_POINT = "21000000-0000-4000-8000-000000000001";
const COURSE = "igcse-biology-06";

const NOW = new Date("2026-10-22T09:00:00Z");
const clock = { newId: () => NEW_ID, now: () => NOW };

const authRow = (userId = TEACHER, roles = ["TEACHER"]) => ({
  email: `${userId.slice(0, 8)}@syllabai.test`,
  userId,
  roles,
  tokenVersion: 1,
});

const classRow = (over: Partial<Record<string, unknown>> = {}) => ({
  id: CLASS_A,
  teacher_id: TEACHER,
  course_slug: COURSE,
  course_label: "IGCSE Biology",
  name: "10B",
  status: "ACTIVE",
  ai_toolkit: true,
  ...over,
});

const courseRow = (over: Partial<Record<string, unknown>> = {}) => ({
  course_slug: COURSE,
  subject: "Biology",
  board: "CAIE",
  level: "IGCSE",
  curriculum_code: "0610",
  code: "06",
  label: "IGCSE Biology",
  ...over,
});

// captured-shape outputs (small, law-satisfying)

const lessonPlanOutput = (subject: string) => ({
  overview: {
    subject,
    topic: "WRONG-SUBJECT-SHOULD-BE-PINNED",
    duration: 999,
    teachingStyle: "Inquiry-based",
    learningObjectives: ["MODEL-SHOULD-BE-PINNED"],
    initialPrompts: ["Why does food need digesting?"],
  },
  lessonPlan: {
    starterActivity: { description: "d", duration: 5, materials: ["m"], instructions: ["i"] },
    mainActivities: [{
      description: "d", duration: 30, materials: ["m"], instructions: ["i"],
      differentiation: { support: ["s"], core: ["c"], extension: ["e"] },
    }],
    plenary: {
      description: "d", duration: 10, materials: ["m"], instructions: ["i"],
      teacherFollowUp: ["f"], successIndicators: ["s"],
    },
  },
  reflectionSuggestions: ["r"],
  differentiationAndSEN: {
    differentiation: { support: ["s"], core: ["c"], extension: ["e"] },
    senSupport: ["sen"],
  },
  crossCurricularLinks: ["Chemistry — enzyme kinetics"],
  assessmentQuestions: ["q"],
  additionalNotes: ["note"],
});

const rubricOutput = () => ({
  metadata: {
    subject: "WRONG", topic: "WRONG", assignmentType: "Lab Report",
    taskDescription: "Write up the amylase practical.", assessmentType: "Summative Assessment",
    assessor: "MODEL", marksPerCriterion: 1,
  },
  overview: {
    assignmentPurpose: "p", submissionFormat: "f", criteriaAssessed: 99,
    performanceScale: "Emerging -> Basic -> Proficient -> Advanced",
  },
  rubric: {
    criteria: ["Accuracy", "Analysis", "Use of Evidence"].map((name) => ({
      name: "MODEL-NAME",
      criterionIntent: "i",
      levels: {
        advanced: { score: 999, description: "d", feedback: "f" },
        proficient: { score: 999, description: "d", feedback: "f" },
        basic: { score: 999, description: "d", feedback: "f" },
        emerging: { score: 999, description: "d", feedback: "f" },
      },
      __criterionName: name,
    })),
  },
  moderationGuidance: ["m"],
});

const sowOutput = (lessonCount: number) => ({
  subject: "WRONG",
  topic: "WRONG",
  overarchingObjectives: ["o"],
  lessons: Array.from({ length: lessonCount }, (_, i) => ({
    lessonNumber: 99,
    title: `Lesson ${i}`,
    duration: 1,
    learningObjectives: ["o"],
    activities: [{ title: "a", description: "d", duration: 60, resources: ["r"] }],
    assessment: ["a"],
    differentiation: { support: ["s"], core: ["c"], extension: ["e"] },
    scaffoldingStrategies: ["s"],
    reflectionPrompts: ["r"],
    crossCurricularLinks: ["l"],
    stretchTasks: ["t"],
  })),
  metadata: { author: "MODEL", createdAt: "2000-01-01", version: "9.9" },
});

const LESSON_PLAN_TEMPLATE =
  "You are an expert secondary-school lesson designer for {subject}.\n" +
  "Design ONE lesson on \"{topic}\" lasting exactly {duration} minutes.\n" +
  "{teachingStyleLine}\n" +
  "{abilityLine}\n" +
  "Homework requested: {homework}.\n" +
  "{objectivesList}";

const lessonPlanInput = {
  topic: "Enzymes",
  duration: 45,
  learningObjectives: ["Describe enzymes as biological catalysts"],
  homework: "Yes",
  teachingStyle: null,
  studentAbility: null,
};

// ── the fake generator (the bridge-shaped seam) ──────────────────────────────

type Page = { root?: unknown; text?: string; throwReason?: "UNPARSEABLE_OUTPUT" | "PROVIDER_UNAVAILABLE" };

interface CountingGenerator extends ToolkitGenerator {
  calls: Array<{ system: string; user: string }>;
  readonly callCount: number;
}

function fakeGenerator(pages: Page[]): CountingGenerator {
  let call = 0;
  const calls: Array<{ system: string; user: string }> = [];
  const generator: CountingGenerator = {
    available: () => true,
    calls,
    get callCount() {
      return call;
    },
    async generate(system: string, user: string): Promise<ToolkitGeneration> {
      const page = pages[Math.min(call, pages.length - 1)]!;
      calls.push({ system, user });
      call++;
      if (page.throwReason) throw new ToolkitGenerationError(page.throwReason, page.text ?? "garbage");
      const text = page.text ?? JSON.stringify(page.root);
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      return {
        root: JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>,
        model: "fake-model",
        providerName: "fake-provider",
        raw: text,
      };
    },
  };
  return generator;
}

function deadGenerator(): ToolkitGenerator {
  return { available: () => false, generate: async () => { throw new Error("unreachable"); } };
}

// ── sql routes ───────────────────────────────────────────────────────────────

const classRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /from classes c left join class_features f on f\.class_id = c\.id where c\.id = \? ::uuid$/,
  rows,
});

const courseRoute = (rows: Array<Record<string, unknown>> = [courseRow()]): Route => ({
  match: /from course_registry where course_slug = \?$/,
  rows,
});

const quotaConsumeRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /insert into teaching_toolkit_usage/,
  rows,
});

const quotaReadRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /select used from teaching_toolkit_usage where teacher_id = \? ::uuid and usage_day = \? ::date$/,
  rows,
});

const promptRoute = (template: string): Route => ({
  match: /select template from prompt_versions/,
  rows: [{ template }],
});

const insertResourceRoute = (): Route => ({
  match: /insert into teaching_toolkit_resources/,
  rows: [],
});

const chapterTopicsRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /select id, title, learning_objective from book_chapters where course_id = \? order by chapter_index asc limit 60$/,
  rows,
});

const chapterByIdRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /select id, title, learning_objective from book_chapters where id = \? ::uuid and course_id = \?$/,
  rows,
});

const nodeByIdRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /select id, title, node_type from knowledge_nodes where id = \? ::uuid$/,
  rows,
});

const specPointsRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /relation_type = 'PART_OF' order by n\.title asc limit 60$/,
  rows,
});

const resourcesListRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /from teaching_toolkit_resources where teacher_id = \? ::uuid and \(/,
  rows,
});

const resourceById = (byId: Record<string, Array<Record<string, unknown>>>): Route => ({
  match: /from teaching_toolkit_resources where id = \? ::uuid$/,
  rows: [],
  rowsFor: (params) => byId[params[0] as string] ?? [],
});

// ── app assembly (the assignments test pattern: auth injection + the real
//    error boundary; the router at the REAL mount prefix) ────────────────────

function makeApp(
  routes: Route[],
  generator: ToolkitGenerator,
  auth: Record<string, unknown> | null = authRow(),
) {
  const sql = fakeSql(routes);
  const module = buildTeachingToolkitModule({ sql, generator, clock, dailyLimit: 25 });
  const app = new Hono();
  app.use("*", async (c: Context, next) => {
    if (auth) c.set("syllabai.auth" as never, auth as never);
    await next();
  });
  app.route("/api/v1/teacher/toolkit", createTeachingToolkitRouter(module));
  app.onError((err, c) => {
    const mapped = toErrorResponse(err);
    if (mapped) return c.json(mapped.body, mapped.status as 400);
    console.error("[test] unhandled error:", err);
    return c.json({ status: 500, error: "internal_error", message: "unhandled" }, 500);
  });
  return { app, sql };
}

const generateBody = (toolType: string, data: unknown, classId: string | null = CLASS_A) =>
  JSON.stringify(classId ? { toolType, classId, data } : { toolType, courseId: COURSE, data });

// ── shells + envelopes ───────────────────────────────────────────────────────

describe("authz shells + envelope law", () => {
  test("anonymous callers get the Boot 401 before any handler", async () => {
    const { app } = makeApp([], fakeGenerator([]), null);
    const res = await app.request("/api/v1/teacher/toolkit/generate", {
      method: "POST",
      body: generateBody("coach", {}),
    });
    expect(res.status).toBe(401);
  });

  test("a STUDENT token gets the Boot 403", async () => {
    const { app } = makeApp([], fakeGenerator([]), authRow(TEACHER, ["STUDENT"]));
    const res = await app.request("/api/v1/teacher/toolkit/generate", {
      method: "POST",
      body: generateBody("coach", {}),
    });
    expect(res.status).toBe(403);
  });

  test("a non-JSON body answers 400 malformed_body", async () => {
    const { app } = makeApp([], fakeGenerator([]));
    const res = await app.request("/api/v1/teacher/toolkit/generate", {
      method: "POST",
      body: "not json",
      headers: { "content-type": "application/json" },
    });
    const body = (await res.json()) as { error: string };
    expect(res.status).toBe(400);
    expect(body.error).toBe("malformed_body");
  });

  test("an unknown toolType is a closed-enum validation failure", async () => {
    const { app } = makeApp([], fakeGenerator([]));
    const res = await app.request("/api/v1/teacher/toolkit/generate", {
      method: "POST",
      body: generateBody("slides", {}),
    });
    const body = (await res.json()) as { error: string };
    expect(res.status).toBe(400);
    expect(body.error).toBe("validation_failed");
  });

  test("a missing data object answers validation_failed naming data", async () => {
    const { app } = makeApp([], fakeGenerator([]));
    const res = await app.request("/api/v1/teacher/toolkit/generate", {
      method: "POST",
      body: JSON.stringify({ toolType: "coach", classId: CLASS_A }),
    });
    const body = (await res.json()) as { error: string; message: string };
    expect(res.status).toBe(400);
    expect(body.error).toBe("validation_failed");
    expect(body.message).toContain("data");
  });

  test("a duration outside 30..60 answers validation_failed naming the field", async () => {
    const { app } = makeApp([], fakeGenerator([]));
    const res = await app.request("/api/v1/teacher/toolkit/generate", {
      method: "POST",
      body: generateBody("lesson-plan", { ...lessonPlanInput, duration: 25 }),
    });
    const body = (await res.json()) as { error: string; message: string };
    expect(res.status).toBe(400);
    expect(body.error).toBe("validation_failed");
    expect(body.message).toContain("data.duration");
  });

  test("a request with NEITHER classId NOR courseId is refused", async () => {
    const { app } = makeApp([], fakeGenerator([]));
    const res = await app.request("/api/v1/teacher/toolkit/generate", {
      method: "POST",
      body: JSON.stringify({ toolType: "coach", data: { mode: "clarify", audience: "Beginner", inputText: "x" } }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("validation_failed");
  });
});

// ── the class-context ladder + gates ─────────────────────────────────────────

describe("class-context ownership ladder + gates", () => {
  test("an unknown class answers 404 class_not_found", async () => {
    const { app } = makeApp([classRoute([]), courseRoute()], fakeGenerator([]));
    const res = await app.request("/api/v1/teacher/toolkit/generate", {
      method: "POST",
      body: generateBody("lesson-plan", lessonPlanInput),
    });
    const body = (await res.json()) as { error: string };
    expect(res.status).toBe(404);
    expect(body.error).toBe("class_not_found");
  });

  test("another teacher's class answers 403 forbidden", async () => {
    const { app } = makeApp(
      [classRoute([classRow({ teacher_id: OTHER_TEACHER })]), courseRoute()],
      fakeGenerator([]),
    );
    const res = await app.request("/api/v1/teacher/toolkit/generate", {
      method: "POST",
      body: generateBody("lesson-plan", lessonPlanInput),
    });
    const body = (await res.json()) as { error: string };
    expect(res.status).toBe(403);
    expect(body.error).toBe("forbidden");
  });

  test("an archived class answers 409 conflict on generate but stays readable on context", async () => {
    const gen = fakeGenerator([]);
    const { app } = makeApp(
      [classRoute([classRow({ status: "ARCHIVED" })]), courseRoute(), quotaConsumeRoute([{ used: 1 }]), promptRoute(LESSON_PLAN_TEMPLATE), insertResourceRoute()],
      gen,
    );
    const genRes = await app.request("/api/v1/teacher/toolkit/generate", {
      method: "POST",
      body: generateBody("lesson-plan", lessonPlanInput),
    });
    expect(genRes.status).toBe(409);

    const { app: readApp } = makeApp(
      [classRoute([classRow({ status: "ARCHIVED" })]), courseRoute(), quotaReadRoute([{ used: 2 }]), chapterTopicsRoute([])],
      fakeGenerator([]),
    );
    const ctxRes = await readApp.request(`/api/v1/teacher/toolkit/context?classId=${CLASS_A}`);
    expect(ctxRes.status).toBe(200);
  });

  test("ai_toolkit=false answers 403 feature_disabled_by_teacher", async () => {
    const { app } = makeApp(
      [classRoute([classRow({ ai_toolkit: false })]), courseRoute()],
      fakeGenerator([]),
    );
    const res = await app.request("/api/v1/teacher/toolkit/generate", {
      method: "POST",
      body: generateBody("lesson-plan", lessonPlanInput),
    });
    const body = (await res.json()) as { error: string };
    expect(res.status).toBe(403);
    expect(body.error).toBe("feature_disabled_by_teacher");
  });
});

// ── the quota + availability law ─────────────────────────────────────────────

describe("quota + availability law", () => {
  test("a dead chain answers 503 toolkit_unavailable and consumes NO quota", async () => {
    const { app, sql } = makeApp(
      [classRoute([classRow()]), courseRoute()],
      deadGenerator(),
    );
    const res = await app.request("/api/v1/teacher/toolkit/generate", {
      method: "POST",
      body: generateBody("lesson-plan", lessonPlanInput),
    });
    const body = (await res.json()) as { error: string };
    expect(res.status).toBe(503);
    expect(body.error).toBe("toolkit_unavailable");
    expect(sql.queries.some((q) => q.includes("teaching_toolkit_usage"))).toBe(false);
  });

  test("an exhausted quota answers 429 toolkit_quota_exhausted with Retry-After", async () => {
    const { app } = makeApp(
      [classRoute([classRow()]), courseRoute(), quotaConsumeRoute([])],
      fakeGenerator([]),
    );
    const res = await app.request("/api/v1/teacher/toolkit/generate", {
      method: "POST",
      body: generateBody("lesson-plan", lessonPlanInput),
    });
    const body = (await res.json()) as { error: string };
    expect(res.status).toBe(429);
    expect(body.error).toBe("toolkit_quota_exhausted");
    expect(res.headers.get("Retry-After")).not.toBeNull();
  });
});

// ── the generation law ───────────────────────────────────────────────────────

describe("the generation law", () => {
  const happyRoutes = () => [
    classRoute([classRow()]),
    courseRoute(),
    quotaConsumeRoute([{ used: 1 }]),
    promptRoute(LESSON_PLAN_TEMPLATE),
    insertResourceRoute(),
  ];

  test("lesson-plan happy path: class-resolved subject, verbatim objectives, SUCCESS row", async () => {
    const gen = fakeGenerator([{ root: lessonPlanOutput("WRONG") }]);
    const { app, sql } = makeApp(happyRoutes(), gen);
    const res = await app.request("/api/v1/teacher/toolkit/generate", {
      method: "POST",
      body: generateBody("lesson-plan", lessonPlanInput),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      resource: { status: string; toolType: string; courseId: string; model: string };
      output: { overview: { subject: string; duration: number; learningObjectives: string[]; topic: string } };
      quota: { used: number; limit: number; resetsAt: string };
    };
    // THE no-subject-picker law: the model's subject is PINNED to the class's
    expect(body.output.overview.subject).toBe("Biology");
    expect(body.output.overview.topic).toBe("Enzymes");
    expect(body.output.overview.duration).toBe(45);
    expect(body.output.overview.learningObjectives).toEqual(lessonPlanInput.learningObjectives);
    expect(body.resource.status).toBe("SUCCESS");
    expect(body.resource.toolType).toBe("lesson-plan");
    expect(body.resource.courseId).toBe(COURSE);
    expect(body.resource.model).toBe("fake-model");
    expect(body.quota).toEqual({ used: 1, limit: 25, resetsAt: "2026-10-23T00:00:00.000Z" });
    expect(sql.queries.some((q) => q.startsWith("insert into teaching_toolkit_resources"))).toBe(true);
    expect(gen.callCount).toBe(1);
    // the interpolated template rode the system slot (tokens resolved)
    expect(gen.calls[0]!.system).toContain('Design ONE lesson on "Enzymes" lasting exactly 45 minutes');
    expect(gen.calls[0]!.system).toContain("Homework requested: Yes.");
    expect(gen.calls[0]!.system).toContain("1. Describe enzymes as biological catalysts");
  });

  test("self-heal retry: parse garbage then corrected output → 200, two calls", async () => {
    const gen = fakeGenerator([
      { text: "I cannot do that", throwReason: "UNPARSEABLE_OUTPUT" },
      { root: lessonPlanOutput("WRONG") },
    ]);
    const { app, sql } = makeApp(happyRoutes(), gen);
    const res = await app.request("/api/v1/teacher/toolkit/generate", {
      method: "POST",
      body: generateBody("lesson-plan", lessonPlanInput),
    });
    expect(res.status).toBe(200);
    expect(gen.callCount).toBe(2);
    expect(gen.calls[1]!.user).toContain("failed schema validation");
    expect(sql.queries.some((q) => q.startsWith("insert into teaching_toolkit_resources"))).toBe(true);
  });

  test("hard failure: both attempts fail the wall → 502 + a FAILED row", async () => {
    const gen = fakeGenerator([{ text: "garbage", throwReason: "UNPARSEABLE_OUTPUT" }]);
    const { app, sql } = makeApp(happyRoutes(), gen);
    const res = await app.request("/api/v1/teacher/toolkit/generate", {
      method: "POST",
      body: generateBody("lesson-plan", lessonPlanInput),
    });
    const body = (await res.json()) as { error: string };
    expect(res.status).toBe(502);
    expect(body.error).toBe("toolkit_generation_failed");
    expect(gen.callCount).toBe(2);
    expect(sql.queries.some((q) => q.startsWith("insert into teaching_toolkit_resources"))).toBe(true);
  });

  test("structure-law retry: sow lesson count feeds back and the second pass passes", async () => {
    const sowTemplate =
      "Scheme of work: {totalLessons} lesson(s) of {lessonDuration} minutes for {level} {subject} ({board}), topic \"{topic}\".\n{emphasisLine}\n{preferencesLine}";
    const sowInput = {
      topic: "Enzymes", totalLessons: 2, lessonDuration: 60,
      difficultyLevel: "Intermediate", emphasisAreas: [], userPreferences: null,
    };
    const gen = fakeGenerator([{ root: sowOutput(1) }, { root: sowOutput(2) }]);
    const { app } = makeApp(
      [
        classRoute([classRow()]),
        courseRoute(),
        quotaConsumeRoute([{ used: 1 }]),
        promptRoute(sowTemplate),
        insertResourceRoute(),
      ],
      gen,
    );
    const res = await app.request("/api/v1/teacher/toolkit/generate", {
      method: "POST",
      body: generateBody("sow", sowInput),
    });
    expect(res.status).toBe(200);
    expect(gen.callCount).toBe(2);
    expect(gen.calls[1]!.user).toContain("lessons law: 1 lessons, expected exactly 2");
    const body = (await res.json()) as {
      output: {
        subject: string;
        lessons: Array<{ lessonNumber: number; duration: number }>;
        metadata: { author: string; version: string; createdAt: string };
      };
    };
    // the silent pins: subject, per-lesson duration, the fixed persona
    expect(body.output.subject).toBe("Biology");
    expect(body.output.lessons.map((l) => l.lessonNumber)).toEqual([1, 2]);
    expect(body.output.lessons.every((l) => l.duration === 60)).toBe(true);
    expect(body.output.metadata.author).toBe("Curriculum Planning Expert");
    expect(body.output.metadata.version).toBe("1.0");
    expect(body.output.metadata.createdAt).toBe("2026-10-22");
  });

  test("rubric: level scores are COMPUTED (100/75/50/25) and names/assessor pinned", async () => {
    const rubricTemplate = "Rubric for a {assignmentType} in {subject} on \"{topic}\". Criteria: {criteriaJson}";
    const rubricInput = {
      topic: "Enzymes", assignmentType: "Lab Report",
      assessmentType: "Summative Assessment", taskDescription: "Write up the amylase practical.",
      marksPerCriterion: 8, criteria: ["Accuracy", "Analysis", "Use of Evidence"],
    };
    const root = rubricOutput() as unknown as Record<string, unknown>;
    const { app } = makeApp(
      [
        classRoute([classRow()]),
        courseRoute(),
        quotaConsumeRoute([{ used: 1 }]),
        promptRoute(rubricTemplate),
        insertResourceRoute(),
      ],
      fakeGenerator([{ root }]),
    );
    const res = await app.request("/api/v1/teacher/toolkit/generate", {
      method: "POST",
      body: generateBody("rubric", rubricInput),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      output: {
        metadata: { subject: string; assessor: string; marksPerCriterion: number };
        overview: { criteriaAssessed: number };
        rubric: { criteria: Array<{ name: string; levels: { advanced: { score: number }; proficient: { score: number }; basic: { score: number }; emerging: { score: number } } }> };
      };
    };
    expect(body.output.metadata.subject).toBe("Biology");
    expect(body.output.metadata.assessor).toBe("Teacher");
    expect(body.output.metadata.marksPerCriterion).toBe(8);
    expect(body.output.overview.criteriaAssessed).toBe(3);
    const criteria = body.output.rubric.criteria;
    expect(criteria.map((c) => c.name)).toEqual(["Accuracy", "Analysis", "Use of Evidence"]);
    for (const criterion of criteria) {
      expect(criterion.levels.advanced.score).toBe(8);
      expect(criterion.levels.proficient.score).toBe(6);
      expect(criterion.levels.basic.score).toBe(4);
      expect(criterion.levels.emerging.score).toBe(2);
    }
  });

  test("ad-hoc courseId generation resolves chips without a class row", async () => {
    const gen = fakeGenerator([{ root: lessonPlanOutput("WRONG") }]);
    const { app } = makeApp(
      [courseRoute(), quotaConsumeRoute([{ used: 1 }]), promptRoute(LESSON_PLAN_TEMPLATE), insertResourceRoute()],
      gen,
    );
    const res = await app.request("/api/v1/teacher/toolkit/generate", {
      method: "POST",
      body: generateBody("lesson-plan", lessonPlanInput, null),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { resource: { classId: string | null }; output: { overview: { subject: string } } };
    expect(body.resource.classId).toBeNull();
    expect(body.output.overview.subject).toBe("Biology");
  });
});

// ── context + resources ──────────────────────────────────────────────────────

describe("context + resources", () => {
  test("context: chips + quota + book-chapter topics", async () => {
    const { app } = makeApp(
      [
        classRoute([classRow()]),
        courseRoute(),
        quotaReadRoute([{ used: 3 }]),
        chapterTopicsRoute([
          { id: CHAPTER_ID, title: "Enzymes", learning_objective: "Describe enzyme action." },
        ]),
      ],
      fakeGenerator([]),
    );
    const res = await app.request(`/api/v1/teacher/toolkit/context?classId=${CLASS_A}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      context: { classId: string | null; courseId: string; classLabel: string | null; subject: string; board: string | null; level: string; curriculumCode: string | null };
      quota: { used: number; limit: number };
      topics: Array<{ topicId: string; title: string; learningObjective: string | null; source: string }>;
    };
    expect(body.context).toEqual({
      classId: CLASS_A, courseId: COURSE, classLabel: "IGCSE Biology",
      subject: "Biology", board: "CAIE", level: "IGCSE", curriculumCode: "0610",
    });
    expect(body.quota.used).toBe(3);
    expect(body.quota.limit).toBe(25);
    expect(body.topics).toEqual([
      { topicId: CHAPTER_ID, title: "Enzymes", learningObjective: "Describe enzyme action.", source: "book_chapter" },
    ]);
  });

  test("context?topicId= book-chapter lane: the learning objective is the outcome", async () => {
    const { app } = makeApp(
      [
        classRoute([classRow()]),
        courseRoute(),
        quotaReadRoute([{ used: 0 }]),
        chapterTopicsRoute([]),
        chapterByIdRoute([{ id: CHAPTER_ID, title: "Enzymes", learning_objective: "Describe enzyme action." }]),
      ],
      fakeGenerator([]),
    );
    const res = await app.request(`/api/v1/teacher/toolkit/context?classId=${CLASS_A}&topicId=${CHAPTER_ID}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      topic: { source: string };
      outcomes: Array<{ nodeId: string | null; title: string; coverage: string | null }>;
    };
    expect(body.topic.source).toBe("book_chapter");
    expect(body.outcomes).toEqual([{ nodeId: null, title: "Describe enzyme action.", coverage: null }]);
  });

  test("context?topicId= spec-tree lane: SPEC_POINTs with teaching_coverage", async () => {
    const { app } = makeApp(
      [
        classRoute([classRow()]),
        courseRoute(),
        quotaReadRoute([]),
        chapterTopicsRoute([]),
        chapterByIdRoute([]),
        nodeByIdRoute([{ id: TOPIC_NODE, title: "Enzymes", node_type: "TOPIC" }]),
        specPointsRoute([
          { id: SPEC_POINT, title: "Describe enzyme action", coverage: "TAUGHT" },
        ]),
      ],
      fakeGenerator([]),
    );
    const res = await app.request(`/api/v1/teacher/toolkit/context?classId=${CLASS_A}&topicId=${TOPIC_NODE}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      topic: { source: string };
      outcomes: Array<{ nodeId: string | null; title: string; coverage: string | null }>;
    };
    expect(body.topic.source).toBe("spec_tree");
    expect(body.outcomes).toEqual([{ nodeId: SPEC_POINT, title: "Describe enzyme action", coverage: "TAUGHT" }]);
  });

  test("resources list: own rows only, wire toolType mapping", async () => {
    const { app } = makeApp(
      [
        resourcesListRoute([
          {
            id: RESOURCE_A, teacher_id: TEACHER, class_id: CLASS_A, course_slug: COURSE,
            tool_type: "lesson_plan", input_metadata: {}, output: null, status: "SUCCESS",
            model: "fake-model", provider_name: "fake-provider", failure_reason: null,
            elapsed_ms: 12000, created_at: "2026-10-22T08:00:00Z",
          },
        ]),
      ],
      fakeGenerator([]),
    );
    const res = await app.request("/api/v1/teacher/toolkit/resources?limit=10&type=lesson-plan");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ toolType: string; createdAt: string }>;
    expect(body).toHaveLength(1);
    expect(body[0]!.toolType).toBe("lesson-plan");
    expect(body[0]!.createdAt).toBe("2026-10-22T08:00:00.000Z");
  });

  test("resources detail: mine parses, another teacher's 403s, unknown 404s", async () => {
    const detailRow = (teacherId: string) => ({
      id: RESOURCE_A, teacher_id: teacherId, class_id: CLASS_A, course_slug: COURSE,
      tool_type: "lesson_plan", input_metadata: {}, output: lessonPlanOutput("Biology"),
      status: "SUCCESS", model: "fake-model", provider_name: "fake-provider",
      failure_reason: null, elapsed_ms: 12000, created_at: "2026-10-22T08:00:00Z",
    });
    const mine = makeApp([resourceById({ [RESOURCE_A]: [detailRow(TEACHER)] })], fakeGenerator([]));
    const mineRes = await mine.app.request(`/api/v1/teacher/toolkit/resources/${RESOURCE_A}`);
    expect(mineRes.status).toBe(200);
    const mineBody = (await mineRes.json()) as { output: { overview: { subject: string } } | null; failureReason: string | null };
    expect(mineBody.output?.overview.subject).toBe("Biology");
    expect(mineBody.failureReason).toBeNull();

    const theirs = makeApp([resourceById({ [RESOURCE_A]: [detailRow(OTHER_TEACHER)] })], fakeGenerator([]));
    const theirsRes = await theirs.app.request(`/api/v1/teacher/toolkit/resources/${RESOURCE_A}`);
    expect(theirsRes.status).toBe(403);

    const missing = makeApp([resourceById({})], fakeGenerator([]));
    const missingRes = await missing.app.request(`/api/v1/teacher/toolkit/resources/${RESOURCE_A}`);
    expect(missingRes.status).toBe(404);
  });
});

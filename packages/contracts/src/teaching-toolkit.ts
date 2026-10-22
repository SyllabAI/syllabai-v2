/**
 * Teaching Toolkit wire — the 4 educator-ai generators in the Teacher
 * Dashboard (T-TEACH-010; plan of record: docs/TEACHING_TOOLKIT_PLAN.md).
 *
 * Provenance: these schemas are the TYPED form of the four output contracts
 * that were reverse-engineered from ZNotes' educator-ai surface and then
 * fidelity-validated field-by-field against 4 real captured generations
 * (repo SyllabAI/syllabai-experimental, znotes/research/2026-10-22-recreation.md:
 * lesson-plan 60/60, rubric 37/37, sow 38/38, coach 18/18 contract paths EXACT).
 * Key names are the captured contract — `main_argument`/`key_concepts` stay
 * snake_case for the coach document (the capture's exact casing); everything
 * else is camelCase. NOT a port of any frozen Java DTO — this is a V2-NATIVE
 * wire family (books-lesson precedent), so rule 1 above does not apply; the
 * rules that DO apply: closed enums, size caps, never widen to pass a test.
 *
 * THE OPERATOR DIRECTIVE (plan §1/§3, the core design law): the input
 * schemas carry NO subject/board/level field. Teachers already have specific
 * classes per subject, so the class context (classes.course_slug →
 * course_registry.subject/board/level/curriculum_code) resolves that
 * server-side from the JWT-authenticated teacher's own class row. Schemas
 * are non-.strict() per the house law, so a client that sends `subject`
 * anyway gets it silently STRIPPED, never honored.
 *
 * Output schemas are deliberately LOOSE on prose length (free-tier provider
 * drift: groq/gemini/openrouter) and STRICT on structure (key paths, array
 * nesting, closed enums) — the fidelity law is structural, proven by the
 * recreation's zod wall + one self-heal retry loop.
 */
import { z } from "zod";

// ── tool identity ────────────────────────────────────────────────────────────

/** The wire `toolType` (plan §5: POST /generate {toolType, classId?, courseId?, data}). */
export const TOOLKIT_TOOL_TYPES = ["lesson-plan", "rubric", "sow", "coach"] as const;
export const toolkitToolTypeSchema = z.enum(TOOLKIT_TOOL_TYPES);
export type ToolkitToolType = z.infer<typeof toolkitToolTypeSchema>;

/** The persistence form (teaching_toolkit_resources.tool_type CHECK — plan §5 DDL). */
export const TOOLKIT_DB_TOOL_TYPES = ["lesson_plan", "rubric", "sow", "coach"] as const;
export type ToolkitDbToolType = (typeof TOOLKIT_DB_TOOL_TYPES)[number];

/** wire → db one-liner (disclosed mapping; "-" never reaches the CHECK). */
export function toolkitToolTypeToDb(tool: ToolkitToolType): ToolkitDbToolType {
  return (tool === "lesson-plan" ? "lesson_plan" : tool) as ToolkitDbToolType;
}

/** prompt_versions registry rows seeded by migration 0008 (plan §5: prompts
 *  live in the registry, not in code strings; the route interpolates). */
export const TOOLKIT_PROMPT_REGISTRY = {
  "lesson-plan": { registryKey: "teaching-toolkit/lesson-plan", version: "1.0" },
  rubric: { registryKey: "teaching-toolkit/rubric", version: "1.0" },
  sow: { registryKey: "teaching-toolkit/sow", version: "1.0" },
  coach: { registryKey: "teaching-toolkit/coach", version: "1.0" },
} as const;

// ── presets (functional option lists mirrored from the observed form
//    options — znotes/recreation/src/lib/presets.ts, live-verified phase 2) ──

export const TOOLKIT_ASSIGNMENT_TYPES = [
  "Essay", "Research Project", "Presentation", "Poster", "Lab Report",
  "Report", "Practical Investigation", "Case Study", "Debate", "Portfolio",
  "Creative Writing", "Prototype / Design Task", "Problem-Solving Task",
  "Reflection", "Group Project", "Multimedia Project",
] as const;

export const TOOLKIT_ASSESSMENT_TYPES_RUBRIC = [
  "Formative Assessment", "Summative Assessment", "Observation",
  "Oral Questioning", "Quiz", "Exit Ticket", "Peer Assessment",
  "Self Assessment", "Performance Task", "Teacher Assessment",
] as const;

export const TOOLKIT_ASSESSMENT_TYPES_LESSON_PLAN = [
  "Formative Assessment", "Summative Assessment", "Observation",
  "Oral Questioning", "Quiz", "Exit Ticket", "Peer Assessment",
  "Self Assessment", "Performance Task",
] as const;

export const TOOLKIT_RUBRIC_CRITERIA = [
  "Knowledge & Understanding", "Accuracy", "Application", "Analysis",
  "Evaluation", "Critical Thinking", "Problem Solving", "Creativity",
  "Communication", "Organisation", "Research", "Use of Evidence",
  "Presentation", "Teamwork", "Practical Skills", "Reflection",
] as const;

export const TOOLKIT_MARKS_PER_CRITERION = [4, 5, 8, 10, 12, 20, 25] as const;

export const TOOLKIT_TEACHING_STYLES = [
  "Teacher-led", "Student-centred", "Inquiry-based", "Discussion-based",
  "Project-based Learning (PBL)", "Collaborative Learning",
  "Hands-on / Practical", "Flipped Classroom", "Blended Learning",
] as const;

export const TOOLKIT_STUDENT_ABILITY = [
  "Mixed Ability", "Developing", "Intermediate", "Advanced",
] as const;

export const TOOLKIT_DIFFICULTY_LEVELS = ["Foundation", "Intermediate", "Advanced"] as const;

export const TOOLKIT_EMPHASIS_AREAS = [
  "Critical Thinking", "Problem Solving", "Creativity", "Communication",
  "Collaboration", "Digital Literacy", "Research Skills", "Inquiry Skills",
  "Real-world Applications", "Practical Skills", "Scientific Thinking",
  "Mathematical Reasoning", "Literacy", "Numeracy", "Sustainability",
  "Global Citizenship", "Ethics", "Careers & Future Skills",
  "Independent Learning", "Metacognition",
] as const;

export const TOOLKIT_COACH_AUDIENCES = [
  "Beginner", "Intermediate", "Advanced", "Teacher", "Parent",
] as const;

/** Rubric performance-level score rule — COMPUTED, never generated (the
 *  capture pinned it: marks=8 → 8/6/4/2 = 100/75/50/25%). The route
 *  post-processes the model's rubric with this; the hub computes the same
 *  client-side for display. */
export function toolkitLevelScores(marks: number): {
  advanced: number; proficient: number; basic: number; emerging: number;
} {
  const r = (f: number) => Math.max(1, Math.round(marks * f));
  return { advanced: marks, proficient: r(0.75), basic: r(0.5), emerging: r(0.25) };
}

// ── input schemas (subject ABSENT — the operator directive) ──────────────────

const boundedText = (max: number) => z.string().trim().min(1).max(max);

/** POST /generate envelope — the per-tool `data` is parsed by the matching
 *  input schema below once `toolType` is known (the discriminated union is
 *  kept at the route so the validation_failed message names the tool's
 *  fields, not a union branch). classId XOR courseId: classId = the normal
 *  class-context path (ownership-checked); courseId = ad-hoc, no class
 *  (ADMIN surface/testing; the row persists class_id NULL). */
export const toolkitGenerateRequestSchema = z
  .object({
    toolType: toolkitToolTypeSchema,
    classId: z.string().uuid().nullable().default(null),
    courseId: z.string().trim().min(1).max(64).nullable().default(null),
    data: z.unknown(),
  })
  .refine((v) => v.classId !== null || v.courseId !== null, {
    message: "classId: must not be null (or pass courseId for an ad-hoc generation)",
  });
export type ToolkitGenerateRequest = z.infer<typeof toolkitGenerateRequestSchema>;

export const lessonPlanInputSchema = z.object({
  topic: boundedText(200),
  duration: z.number().int().refine((v) => v >= 30 && v <= 60, {
    message: "duration must be between 30 and 60 minutes",
  }),
  learningObjectives: z.array(boundedText(300)).min(1).max(12, {
    message: "learningObjectives must have at most 12 entries",
  }),
  homework: z.enum(["Yes", "No"]),
  teachingStyle: z.enum(TOOLKIT_TEACHING_STYLES).nullable().default(null),
  studentAbility: z.enum(TOOLKIT_STUDENT_ABILITY).nullable().default(null),
});
export type LessonPlanInput = z.infer<typeof lessonPlanInputSchema>;

export const rubricInputSchema = z.object({
  topic: boundedText(200),
  assignmentType: z.enum(TOOLKIT_ASSIGNMENT_TYPES),
  assessmentType: z.enum(TOOLKIT_ASSESSMENT_TYPES_RUBRIC),
  taskDescription: boundedText(600),
  marksPerCriterion: z.number().int().refine(
    (v) => (TOOLKIT_MARKS_PER_CRITERION as readonly number[]).includes(v),
    { message: "marksPerCriterion must be one of 4, 5, 8, 10, 12, 20, 25" },
  ),
  criteria: z.array(z.enum(TOOLKIT_RUBRIC_CRITERIA)).min(1).max(4, {
    message: "criteria must have at most 4 entries",
  }),
});
export type RubricInput = z.infer<typeof rubricInputSchema>;

export const sowInputSchema = z.object({
  topic: boundedText(200),
  totalLessons: z.number().int().refine((v) => v >= 1 && v <= 5, {
    message: "totalLessons must be between 1 and 5",
  }),
  lessonDuration: z.number().int().refine(
    (v) => v >= 30 && v <= 180 && v % 15 === 0,
    { message: "lessonDuration must be between 30 and 180 minutes in 15-minute steps" },
  ),
  difficultyLevel: z.enum(TOOLKIT_DIFFICULTY_LEVELS),
  emphasisAreas: z.array(z.enum(TOOLKIT_EMPHASIS_AREAS)).max(20, {
    message: "emphasisAreas must have at most 20 entries",
  }).default([]),
  userPreferences: z.string().trim().max(500).nullable().default(null),
});
export type SowInput = z.infer<typeof sowInputSchema>;

export const coachInputSchema = z.object({
  mode: z.enum(["clarify", "challenge"]),
  audience: z.enum(TOOLKIT_COACH_AUDIENCES),
  inputText: boundedText(2000),
});
export type CoachInput = z.infer<typeof coachInputSchema>;

// ── output schemas (the fidelity-validated captured contracts) ───────────────

/** Loose-on-prose helpers: required, non-empty, bounded against pathological
 *  drift only. Never tighten these without a capture that demands it. */
const prose = z.string().max(4000);
const proseList = (max: number) => z.array(prose).max(max);

export const lessonPlanOutputSchema = z.object({
  overview: z.object({
    subject: prose.max(200),
    topic: prose.max(300),
    duration: z.number().int(),
    teachingStyle: prose.max(120).nullable(),
    learningObjectives: proseList(20),
    initialPrompts: proseList(8),
  }),
  lessonPlan: z.object({
    starterActivity: z.object({
      description: prose,
      duration: z.number().int(),
      materials: proseList(10),
      instructions: proseList(12),
    }),
    mainActivities: z.array(z.object({
      description: prose,
      duration: z.number().int(),
      materials: proseList(10),
      instructions: proseList(12),
      differentiation: z.object({
        support: proseList(10),
        core: proseList(10),
        extension: proseList(10),
      }),
    })).min(1).max(6),
    plenary: z.object({
      description: prose,
      duration: z.number().int(),
      materials: proseList(10),
      instructions: proseList(12),
      teacherFollowUp: proseList(8),
      successIndicators: proseList(8),
    }),
  }),
  reflectionSuggestions: proseList(10),
  differentiationAndSEN: z.object({
    differentiation: z.object({
      support: proseList(10),
      core: proseList(10),
      extension: proseList(10),
    }),
    senSupport: proseList(10),
  }),
  crossCurricularLinks: proseList(8),
  assessmentQuestions: proseList(10),
  // the capture pinned BOTH render forms: string[3] or a single string
  additionalNotes: z.union([proseList(10), prose.max(2000)]),
});
export type LessonPlanOutput = z.infer<typeof lessonPlanOutputSchema>;

const rubricLevelSchema = z.object({
  score: z.number().int(),
  description: prose,
  feedback: prose,
});

export const rubricOutputSchema = z.object({
  metadata: z.object({
    subject: prose.max(200),
    topic: prose.max(300),
    assignmentType: prose.max(120),
    taskDescription: prose.max(1000),
    assessmentType: prose.max(120),
    assessor: prose.max(60),
    marksPerCriterion: z.number().int(),
  }),
  overview: z.object({
    assignmentPurpose: prose,
    submissionFormat: prose,
    criteriaAssessed: z.number().int(),
    performanceScale: prose.max(200),
  }),
  rubric: z.object({
    criteria: z.array(z.object({
      name: prose.max(200),
      criterionIntent: prose,
      levels: z.object({
        advanced: rubricLevelSchema,
        proficient: rubricLevelSchema,
        basic: rubricLevelSchema,
        emerging: rubricLevelSchema,
      }),
    })).min(1).max(8),
  }),
  moderationGuidance: proseList(6),
});
export type RubricOutput = z.infer<typeof rubricOutputSchema>;

export const sowOutputSchema = z.object({
  subject: prose.max(200),
  topic: prose.max(300),
  overarchingObjectives: proseList(8),
  lessons: z.array(z.object({
    lessonNumber: z.number().int(),
    title: prose.max(300),
    duration: z.number().int(),
    learningObjectives: proseList(10),
    activities: z.array(z.object({
      title: prose.max(300),
      description: prose,
      duration: z.number().int(),
      resources: proseList(10),
    })).min(1).max(10),
    assessment: proseList(10),
    differentiation: z.object({
      support: proseList(10),
      core: proseList(10),
      extension: proseList(10),
    }),
    scaffoldingStrategies: proseList(10),
    reflectionPrompts: proseList(10),
    crossCurricularLinks: proseList(8),
    stretchTasks: proseList(8),
  })).min(1).max(8),
  metadata: z.object({
    author: prose.max(120),
    createdAt: prose.max(40),
    version: prose.max(20),
  }),
});
export type SowOutput = z.infer<typeof sowOutputSchema>;

/** The coach document keeps the capture's snake_case keys — exact casing is
 *  the contract (plan §5: key names preserved). */
export const coachOutputSchema = z.object({
  topic: prose.max(300),
  main_argument: prose,
  key_concepts: z.array(z.object({
    title: prose.max(300),
    importance: prose.max(40),
    description: prose,
  })).min(1).max(10),
  critical_details: proseList(10),
  applications_in_practice: z.array(z.object({
    example: prose.max(300),
    description: prose,
  })).min(1).max(8),
  thinking_prompt: prose.max(4000),
  connections: z.array(z.object({
    concept: prose.max(300),
    relationship: prose,
  })).min(1).max(8),
});
export type CoachOutput = z.infer<typeof coachOutputSchema>;

export const toolkitOutputSchema = z.union([
  lessonPlanOutputSchema,
  rubricOutputSchema,
  sowOutputSchema,
  coachOutputSchema,
]);
export type ToolkitOutput = z.infer<typeof toolkitOutputSchema>;

// ── context / resources wire (GET /context, GET /resources) ──────────────────

/** Read-only class context chips — the visual replacement for the removed
 *  subject picker (plan §6). Resolved server-side from the owned class. */
export const toolkitClassContextSchema = z.object({
  classId: z.string().uuid().nullable(),
  courseId: z.string(),
  classLabel: z.string().nullable(),
  subject: z.string(),
  board: z.string().nullable(),
  level: z.string(),
  curriculumCode: z.string().nullable(),
});
export type ToolkitClassContext = z.infer<typeof toolkitClassContextSchema>;

/** A topic lane row. Phase A serves book_chapters (course_id = the hub slug
 *  of record); topicId is the book chapter id. The spec-tree lane (topicId =
 *  knowledge_nodes uuid) rides the same field — GET /context?topicId=
 *  resolves either and answers the outcomes list either way. */
export const toolkitTopicSchema = z.object({
  topicId: z.string(),
  title: z.string().max(300),
  learningObjective: z.string().nullable(),
  source: z.enum(["book_chapter", "spec_tree"]),
});
export type ToolkitTopic = z.infer<typeof toolkitTopicSchema>;

/** One auto-attachable outcome — SPEC_POINT titles (verbatim, the ZNotes
 *  grounding behavior proven in phase 2) or the chapter's learning
 *  objective. coverage rides teaching_coverage when the class has marked
 *  the spec point; null when not applicable (book-chapter lane). */
export const toolkitOutcomeSchema = z.object({
  nodeId: z.string().uuid().nullable(),
  title: z.string().max(300),
  coverage: z.enum(["TAUGHT", "NOT_TAUGHT"]).nullable(),
});
export type ToolkitOutcome = z.infer<typeof toolkitOutcomeSchema>;

export const toolkitQuotaSchema = z.object({
  used: z.number().int(),
  limit: z.number().int(),
  /** next UTC midnight — the counter's reset instant (ISO 8601). */
  resetsAt: z.string(),
});
export type ToolkitQuota = z.infer<typeof toolkitQuotaSchema>;

export const toolkitContextResponseSchema = z.object({
  context: toolkitClassContextSchema,
  quota: toolkitQuotaSchema,
  topics: z.array(toolkitTopicSchema),
  /** present only when the request carried ?topicId= */
  outcomes: z.array(toolkitOutcomeSchema).optional(),
  topic: toolkitTopicSchema.optional(),
});
export type ToolkitContextResponse = z.infer<typeof toolkitContextResponseSchema>;

export const TOOLKIT_RESOURCE_STATUSES = ["SUCCESS", "FAILED"] as const;
export const toolkitResourceStatusSchema = z.enum(TOOLKIT_RESOURCE_STATUSES);

/** History list row (GET /resources?limit=50&type=&classId=) — output is
 *  deliberately omitted; detail carries it. */
export const toolkitResourceSummarySchema = z.object({
  id: z.string().uuid(),
  toolType: toolkitToolTypeSchema,
  courseId: z.string(),
  classId: z.string().uuid().nullable(),
  status: toolkitResourceStatusSchema,
  model: z.string().nullable(),
  providerName: z.string().nullable(),
  elapsedMs: z.number().int().nullable(),
  createdAt: z.string(),
  input: z.record(z.string(), z.unknown()),
});
export type ToolkitResourceSummary = z.infer<typeof toolkitResourceSummarySchema>;

export const toolkitResourceDetailSchema = toolkitResourceSummarySchema.extend({
  output: toolkitOutputSchema.nullable(),
  failureReason: z.string().nullable(),
});
export type ToolkitResourceDetail = z.infer<typeof toolkitResourceDetailSchema>;

export const toolkitGenerateResponseSchema = z.object({
  resource: toolkitResourceSummarySchema,
  output: toolkitOutputSchema,
  elapsedMs: z.number().int(),
  model: z.string(),
  providerName: z.string(),
  quota: toolkitQuotaSchema,
});
export type ToolkitGenerateResponse = z.infer<typeof toolkitGenerateResponseSchema>;

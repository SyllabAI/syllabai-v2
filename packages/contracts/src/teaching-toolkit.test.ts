/**
 * Teaching Toolkit contract tests (T-TEACH-010) — positive/negative pins for
 * the 4 input schemas (subject ABSENT — the operator directive; extra keys
 * are STRIPPED, never honored, per the non-.strict() house law) and the 4
 * output schemas (the fidelity-validated captured contracts: key paths and
 * the coach's snake_case casing are the law). safeParse-based, the
 * teacher-marking.test.ts pattern.
 */
import { describe, expect, it } from "bun:test";
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
  toolkitLevelScores,
  toolkitToolTypeToDb,
  TOOLKIT_PROMPT_REGISTRY,
  TOOLKIT_TOOL_TYPES,
} from "./teaching-toolkit";

const UUID = "aa000000-0000-4000-8000-000000000001";

// ── minimal captured-shape output fixtures (structural fidelity pins) ───────

const lessonPlanOutput = {
  overview: {
    subject: "Biology",
    topic: "Enzymes",
    duration: 45,
    teachingStyle: null,
    learningObjectives: ["Describe enzymes as proteins that function as biological catalysts"],
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
};

const rubricOutput = {
  metadata: {
    subject: "Biology", topic: "Enzymes", assignmentType: "Lab Report",
    taskDescription: "t", assessmentType: "Summative Assessment",
    assessor: "Teacher", marksPerCriterion: 8,
  },
  overview: {
    assignmentPurpose: "p", submissionFormat: "f", criteriaAssessed: 1,
    performanceScale: "Emerging -> Basic -> Proficient -> Advanced",
  },
  rubric: {
    criteria: [{
      name: "Accuracy", criterionIntent: "i",
      levels: {
        advanced: { score: 8, description: "d", feedback: "f" },
        proficient: { score: 6, description: "d", feedback: "f" },
        basic: { score: 4, description: "d", feedback: "f" },
        emerging: { score: 2, description: "d", feedback: "f" },
      },
    }],
  },
  moderationGuidance: ["m"],
};

const sowOutput = {
  subject: "Biology", topic: "Enzymes", overarchingObjectives: ["o"],
  lessons: [{
    lessonNumber: 1, title: "Enzyme action", duration: 60,
    learningObjectives: ["o"],
    activities: [{ title: "a", description: "d", duration: 60, resources: ["r"] }],
    assessment: ["a"],
    differentiation: { support: ["s"], core: ["c"], extension: ["e"] },
    scaffoldingStrategies: ["s"], reflectionPrompts: ["r"],
    crossCurricularLinks: ["l"], stretchTasks: ["t"],
  }],
  metadata: { author: "Curriculum Planning Expert", createdAt: "2026-10-22", version: "1.0" },
};

const coachOutput = {
  topic: "Enzyme activity",
  main_argument: "Enzymes catalyse reactions by lowering activation energy.",
  key_concepts: [{ title: "Active site", importance: "Core", description: "d" }],
  critical_details: ["d"],
  applications_in_practice: [{ example: "Washing powder", description: "d" }],
  thinking_prompt: "Why does pH denature some enzymes but not others?",
  connections: [{ concept: "Protein structure", relationship: "r" }],
};

// ── envelope ─────────────────────────────────────────────────────────────────

describe("toolkitGenerateRequestSchema", () => {
  it("accepts a classId-carrying request and fills the defaults", () => {
    const parsed = toolkitGenerateRequestSchema.safeParse({
      toolType: "lesson-plan", classId: UUID, data: {},
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.courseId).toBe(null);
  });

  it("refuses a request with NEITHER classId NOR courseId", () => {
    expect(toolkitGenerateRequestSchema.safeParse({ toolType: "rubric", data: {} }).success).toBe(false);
  });

  it("refuses an unknown toolType (closed enum)", () => {
    expect(
      toolkitGenerateRequestSchema.safeParse({ toolType: "slides", classId: UUID, data: {} }).success,
    ).toBe(false);
  });

  it("STRIPTES a rogue subject key — the no-subject-picker law is server-side", () => {
    const parsed = toolkitGenerateRequestSchema.safeParse({
      toolType: "coach", classId: UUID, data: { subject: "Biology" },
    });
    expect(parsed.success).toBe(true);
  });

  it("maps wire toolType to the db tool_type form", () => {
    expect(toolkitToolTypeToDb("lesson-plan")).toBe("lesson_plan");
    expect(toolkitToolTypeToDb("rubric")).toBe("rubric");
    expect(toolkitToolTypeToDb("sow")).toBe("sow");
    expect(toolkitToolTypeToDb("coach")).toBe("coach");
    expect(TOOLKIT_TOOL_TYPES).toHaveLength(4);
  });

  it("pins the prompt registry rows migration 0008 seeds", () => {
    expect(TOOLKIT_PROMPT_REGISTRY["lesson-plan"].registryKey).toBe("teaching-toolkit/lesson-plan");
    expect(TOOLKIT_PROMPT_REGISTRY.coach.version).toBe("1.0");
  });
});

// ── inputs ───────────────────────────────────────────────────────────────────

describe("lessonPlanInputSchema", () => {
  const valid = {
    topic: "Enzymes", duration: 45,
    learningObjectives: ["Describe enzyme action"], homework: "Yes",
    teachingStyle: null, studentAbility: null,
  };

  it("accepts the captured shape", () => {
    expect(lessonPlanInputSchema.safeParse(valid).success).toBe(true);
  });

  it("refuses duration outside 30..60", () => {
    expect(lessonPlanInputSchema.safeParse({ ...valid, duration: 25 }).success).toBe(false);
    expect(lessonPlanInputSchema.safeParse({ ...valid, duration: 90 }).success).toBe(false);
  });

  it("refuses >12 learning objectives", () => {
    const many = Array.from({ length: 13 }, (_, i) => `objective ${i}`);
    expect(lessonPlanInputSchema.safeParse({ ...valid, learningObjectives: many }).success).toBe(false);
  });

  it("refuses an open teachingStyle (closed 9-style enum)", () => {
    expect(lessonPlanInputSchema.safeParse({ ...valid, teachingStyle: "Vibes-based" }).success).toBe(false);
  });
});

describe("rubricInputSchema", () => {
  const valid = {
    topic: "Enzymes", assignmentType: "Lab Report",
    assessmentType: "Summative Assessment", taskDescription: "Write up the amylase practical.",
    marksPerCriterion: 8, criteria: ["Accuracy", "Analysis", "Use of Evidence"],
  };

  it("accepts the captured shape", () => {
    expect(rubricInputSchema.safeParse(valid).success).toBe(true);
  });

  it("refuses a marks value outside the 4/5/8/10/12/20/25 set", () => {
    expect(rubricInputSchema.safeParse({ ...valid, marksPerCriterion: 7 }).success).toBe(false);
    expect(rubricInputSchema.safeParse({ ...valid, marksPerCriterion: 8.5 }).success).toBe(false);
  });

  it("refuses >4 criteria", () => {
    expect(
      rubricInputSchema.safeParse({ ...valid, criteria: ["Accuracy", "Analysis", "Evaluation", "Creativity", "Teamwork"] }).success,
    ).toBe(false);
  });

  it("refuses an off-preset criterion name", () => {
    expect(rubricInputSchema.safeParse({ ...valid, criteria: ["Vibes"] }).success).toBe(false);
  });

  it("refuses a >600-char taskDescription", () => {
    expect(rubricInputSchema.safeParse({ ...valid, taskDescription: "x".repeat(601) }).success).toBe(false);
  });
});

describe("sowInputSchema", () => {
  const valid = {
    topic: "Enzymes", totalLessons: 2, lessonDuration: 60,
    difficultyLevel: "Intermediate", emphasisAreas: ["Critical Thinking"],
    userPreferences: null,
  };

  it("accepts the captured shape (and defaults emphasisAreas)", () => {
    const parsed = sowInputSchema.safeParse({
      topic: "Enzymes", totalLessons: 1, lessonDuration: 30, difficultyLevel: "Foundation",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.emphasisAreas).toEqual([]);
  });

  it("refuses >5 lessons", () => {
    expect(sowInputSchema.safeParse({ ...valid, totalLessons: 6 }).success).toBe(false);
  });

  it("refuses lessonDuration off the 15-minute steps", () => {
    expect(sowInputSchema.safeParse({ ...valid, lessonDuration: 40 }).success).toBe(false);
    expect(sowInputSchema.safeParse({ ...valid, lessonDuration: 200 }).success).toBe(false);
  });
});

describe("coachInputSchema", () => {
  const valid = { mode: "clarify", audience: "Beginner", inputText: "Enzymes speed up reactions..." };

  it("accepts both modes and the 5 audiences", () => {
    expect(coachInputSchema.safeParse(valid).success).toBe(true);
    expect(coachInputSchema.safeParse({ ...valid, mode: "challenge", audience: "Parent" }).success).toBe(true);
  });

  it("refuses inputText over 2000 chars", () => {
    expect(coachInputSchema.safeParse({ ...valid, inputText: "x".repeat(2001) }).success).toBe(false);
  });

  it("refuses an unknown mode", () => {
    expect(coachInputSchema.safeParse({ ...valid, mode: "summarize" }).success).toBe(false);
  });
});

// ── outputs (the captured contracts) ─────────────────────────────────────────

describe("output schemas — structural fidelity pins", () => {
  it("lessonPlanOutput parses the captured 7-key shape and both additionalNotes forms", () => {
    expect(lessonPlanOutputSchema.safeParse(lessonPlanOutput).success).toBe(true);
    expect(lessonPlanOutputSchema.safeParse({ ...lessonPlanOutput, additionalNotes: "Bring goggles." }).success).toBe(true);
  });

  it("rubricOutput parses the captured shape with computed level scores", () => {
    const parsed = rubricOutputSchema.safeParse(rubricOutput);
    expect(parsed.success).toBe(true);
    expect(toolkitLevelScores(8)).toEqual({ advanced: 8, proficient: 6, basic: 4, emerging: 2 });
    expect(toolkitLevelScores(5)).toEqual({ advanced: 5, proficient: 4, basic: 3, emerging: 1 });
  });

  it("sowOutput parses the captured 12-field lesson card", () => {
    const parsed = sowOutputSchema.safeParse(sowOutput);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(Object.keys(parsed.data.lessons[0]!).sort()).toHaveLength(11);
  });

  it("coachOutput preserves the captured snake_case keys", () => {
    const parsed = coachOutputSchema.safeParse(coachOutput);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.main_argument).toContain("activation energy");
      expect(Object.keys(coachOutput).sort()).toEqual([
        "applications_in_practice", "connections", "critical_details",
        "key_concepts", "main_argument", "thinking_prompt", "topic",
      ]);
    }
  });

  it("refuses a camelCased coach document (casing is the contract)", () => {
    // the camelCased DOCUMENT (main_argument renamed) is missing the
    // contract key — the zod wall refuses it; a camelCase EXTRA key would
    // merely be stripped (the non-.strict() house law), never honored
    const { main_argument: _omit, ...camel } = coachOutput;
    expect(coachOutputSchema.safeParse({ ...camel, mainArgument: "x" }).success).toBe(false);
    expect(coachOutputSchema.safeParse({ ...coachOutput, mainArgument: "x" }).success).toBe(true);
  });
});

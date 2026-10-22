"use client";

/**
 * Teaching Toolkit presets + output types (T-TEACH-014) — ported from the
 * fidelity-validated recreation (syllabai-experimental znotes/recreation:
 * src/lib/presets.ts + src/lib/schemas.ts, live-verified phase 2). These are
 * the functional interface option lists; the closed-enum law lives in
 * @syllabai/contracts server-side — this mirror is what the forms render and
 * what the backend will accept.
 *
 * REMOVED vs the ZNotes originals: the subject / board / level pickers —
 * the picked class resolves those server-side (the operator directive).
 *
 * The tool METADATA (ToolkitToolId / ToolkitToolMeta / TOOLKIT_TOOLS /
 * toolkitToolMeta) moved to ./tool-meta — a server-safe module with no
 * "use client" — because [tool]/page.tsx (a Server Component) calls
 * toolkitToolMeta() and calling into a client module from the server
 * throws at request time (the 2026-10-22 deep-link crash, digest
 * 2062581832). This file re-exports it so client imports are unchanged.
 */

export type {
  ToolkitToolId,
  ToolkitToolMeta,
} from "./tool-meta";
export { TOOLKIT_TOOLS, toolkitToolMeta } from "./tool-meta";

// ── option lists (closed presets — the backend enum law mirrors these) ──────

export const ASSIGNMENT_TYPES = [
  "Essay", "Research Project", "Presentation", "Poster", "Lab Report",
  "Report", "Practical Investigation", "Case Study", "Debate", "Portfolio",
  "Creative Writing", "Prototype / Design Task", "Problem-Solving Task",
  "Reflection", "Group Project", "Multimedia Project",
] as const;

export const ASSESSMENT_TYPES = [
  "Formative Assessment", "Summative Assessment", "Observation",
  "Oral Questioning", "Quiz", "Exit Ticket", "Peer Assessment",
  "Self Assessment", "Performance Task", "Teacher Assessment",
] as const;

export const CRITERIA = [
  "Knowledge & Understanding", "Accuracy", "Application", "Analysis",
  "Evaluation", "Critical Thinking", "Problem Solving", "Creativity",
  "Communication", "Organisation", "Research", "Use of Evidence",
  "Presentation", "Teamwork", "Practical Skills", "Reflection",
] as const;

export const MARKS_PER_CRITERION = [4, 5, 8, 10, 12, 20, 25] as const;

export const TEACHING_STYLES = [
  "Teacher-led", "Student-centred", "Inquiry-based", "Discussion-based",
  "Project-based Learning (PBL)", "Collaborative Learning",
  "Hands-on / Practical", "Flipped Classroom", "Blended Learning",
] as const;

export const STUDENT_ABILITY = [
  "Mixed Ability", "Developing", "Intermediate", "Advanced",
] as const;

export const DIFFICULTY_LEVELS = ["Foundation", "Intermediate", "Advanced"] as const;

export const EMPHASIS_AREAS = [
  "Critical Thinking", "Problem Solving", "Creativity", "Communication",
  "Collaboration", "Digital Literacy", "Research Skills", "Inquiry Skills",
  "Real-world Applications", "Practical Skills", "Scientific Thinking",
  "Mathematical Reasoning", "Literacy", "Numeracy", "Sustainability",
  "Global Citizenship", "Ethics", "Careers & Future Skills",
  "Independent Learning", "Metacognition",
] as const;

export const COACH_AUDIENCES = [
  "Beginner", "Intermediate", "Advanced", "Teacher", "Parent",
] as const;

export const LESSON_DURATIONS = [30, 45, 60] as const;
export const SOW_LESSON_DURATIONS = [30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180] as const;

/** The rubric score rule, inferred from the live capture and COMPUTED —
 *  never generated (marks=8 → 8/6/4/2 = 100/75/50/25%). The backend pins the
 *  same law; this client-side copy renders before/without a round-trip. */
export function levelScores(marks: number) {
  const r = (f: number) => Math.max(1, Math.round(marks * f));
  return { advanced: marks, proficient: r(0.75), basic: r(0.5), emerging: r(0.25) };
}

// ── output document types (the captured contracts, typed for rendering) ─────

export interface LessonPlanOutput {
  overview: {
    subject: string;
    topic: string;
    duration: number;
    teachingStyle: string | null;
    learningObjectives: string[];
    initialPrompts: string[];
  };
  lessonPlan: {
    starterActivity: { description: string; duration: number; materials: string[]; instructions: string[] };
    mainActivities: {
      description: string;
      duration: number;
      materials: string[];
      instructions: string[];
      differentiation: { support: string[]; core: string[]; extension: string[] };
    }[];
    plenary: {
      description: string;
      duration: number;
      materials: string[];
      instructions: string[];
      teacherFollowUp: string[];
      successIndicators: string[];
    };
  };
  reflectionSuggestions: string[];
  differentiationAndSEN: {
    differentiation: { support: string[]; core: string[]; extension: string[] };
    senSupport: string[];
  };
  crossCurricularLinks: string[];
  assessmentQuestions: string[];
  additionalNotes: string[] | string;
}

export interface RubricLevel {
  score: number;
  description: string;
  feedback: string;
}

export interface RubricOutput {
  metadata: {
    subject: string;
    topic: string;
    assignmentType: string;
    taskDescription: string;
    assessmentType: string;
    assessor: string;
    marksPerCriterion: number;
  };
  overview: {
    assignmentPurpose: string;
    submissionFormat: string;
    criteriaAssessed: number;
    performanceScale: string;
  };
  rubric: {
    criteria: {
      name: string;
      criterionIntent: string;
      levels: {
        advanced: RubricLevel;
        proficient: RubricLevel;
        basic: RubricLevel;
        emerging: RubricLevel;
      };
    }[];
  };
  moderationGuidance: string[];
}

export interface SowOutput {
  subject: string;
  topic: string;
  overarchingObjectives: string[];
  lessons: {
    lessonNumber: number;
    title: string;
    duration: number;
    learningObjectives: string[];
    activities: { title: string; description: string; duration: number; resources: string[] }[];
    assessment: string[];
    differentiation: { support: string[]; core: string[]; extension: string[] };
    scaffoldingStrategies: string[];
    reflectionPrompts: string[];
    crossCurricularLinks: string[];
    stretchTasks: string[];
  }[];
  metadata: { author: string; createdAt: string; version: string };
}

/** the coach document keeps the captured snake_case keys — casing IS the contract */
export interface CoachOutput {
  topic: string;
  main_argument: string;
  key_concepts: { title: string; importance: string; description: string }[];
  critical_details: string[];
  applications_in_practice: { example: string; description: string }[];
  thinking_prompt: string;
  connections: { concept: string; relationship: string }[];
}

// ── per-tool form payloads (what the generate POST sends as data) ────────────

export interface LessonPlanFormData {
  topic: string;
  duration: number;
  learningObjectives: string[];
  homework: "Yes" | "No";
  teachingStyle: string | null;
  studentAbility: string | null;
}

export interface RubricFormData {
  topic: string;
  assignmentType: string;
  assessmentType: string;
  taskDescription: string;
  marksPerCriterion: number;
  criteria: string[];
}

export interface SowFormData {
  topic: string;
  totalLessons: number;
  lessonDuration: number;
  difficultyLevel: string;
  emphasisAreas: string[];
  userPreferences: string | null;
}

export interface CoachFormData {
  mode: "clarify" | "challenge";
  audience: string;
  inputText: string;
}

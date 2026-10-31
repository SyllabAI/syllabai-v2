/**
 * Teach-Me wire contracts — the learn-by-teaching lane (T-TEACHME-001 run-001).
 *
 * Sources of record:
 *   .syllabai/tasks/T-TEACHME-001.yaml (research: live MathsGenie Teach Genie
 *     probe 2026-10-31, 4-step wizard / auto-ticked objectives / verdict chips
 *     / async review card; metering = 2-free-sessions paywall — NOT copied)
 *   ADR-040 (docs/adr/040-teach-session-evidence.md in the master pack):
 *     D1 evidence kind TEACH_SESSION, tier AI_SUGGESTED, append-only, never
 *        of-record without workbench ratification
 *     D2 option-A correction doctrine + no-affirmation guardrail
 *     D3 quota law: 3 sessions/day, Quick=3 / In-Depth=4 objectives,
 *        ≤10 LLM calls & ≤60k tokens per session
 *     D4 anti-gaming: ≥40-word floor, 0.80 verbatim-overlap flag (fail-closed),
 *        7-day repeat-credit dedupe
 *   Operator commission "accept all" (chat 97a19c8c-d041-4ae2-9754-07fef634fc42,
 *   2026-11-01, trace 1a19340982b7ffa9).
 *
 * Evidence doctrine: every type here describes AI_SUGGESTED telemetry. Nothing
 * in this file has a write path to of-record mastery. LLM outputs validated by
 * these schemas are FAIL-CLOSED on shape drift (the T-MIG-039 law) — never a
 * "best effort" coercion.
 */
import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Shared primitives                                                   */
/* ------------------------------------------------------------------ */

/** A session teaches at most 3 spec points (MG parity: ≤3 topics). */
export const teachSpecPointIdsSchema = z
  .array(z.string().min(1))
  .min(1)
  .max(3);
export type TeachSpecPointIds = z.infer<typeof teachSpecPointIdsSchema>;

export const teachDifficultySchema = z.enum(["easy", "medium", "hard"]);
export type TeachDifficulty = z.infer<typeof teachDifficultySchema>;

export const teachSessionLengthSchema = z.enum(["quick", "in_depth"]);
export type TeachSessionLength = z.infer<typeof teachSessionLengthSchema>;

export const teachSessionModeSchema = z.enum(["chat"]); // 'voice' reserved, run-004 spike
export type TeachSessionMode = z.infer<typeof teachSessionModeSchema>;

export const teachSessionStatusSchema = z.enum([
  "active",
  "review_pending",
  "completed",
  "abandoned",
]);
export type TeachSessionStatus = z.infer<typeof teachSessionStatusSchema>;

export const teachObjectiveStatusSchema = z.enum([
  "not_started",
  "covered",
  "not_covered",
  "flagged", // pasted-notes overlap flag (ADR-040 D4)
]);
export type TeachObjectiveStatus = z.infer<typeof teachObjectiveStatusSchema>;

/* ------------------------------------------------------------------ */
/* Core entities                                                       */
/* ------------------------------------------------------------------ */

export const teachObjectiveSchema = z
  .object({
    id: z.string().uuid(),
    ordinal: z.number().int().min(1).max(4),
    text: z.string().min(1),
    specPointIds: teachSpecPointIdsSchema,
    status: teachObjectiveStatusSchema,
  })
  .strict();
export type TeachObjective = z.infer<typeof teachObjectiveSchema>;

/** Expandable chip under each student message (probe of record: "Great"). */
export const verdictChipSchema = z
  .object({
    messageSeq: z.number().int().min(1),
    verdict: z.string().min(1),
    /** Extractive one-sentence feedback naming the covered learning point. */
    feedbackLine: z.string().min(1),
    coveredObjectiveIds: z.array(z.string().uuid()).max(4),
    /** ADR-040 D2 guardrail input: the pupil must NOT affirm this message. */
    contradictionDetected: z.boolean(),
    wordFloorPassed: z.boolean(),
    /** null when the course-corpus check did not run (course ineligible). */
    overlapScore: z.number().min(0).max(1).nullable(),
    flaggedPastedNotes: z.boolean(),
  })
  .strict();
export type VerdictChip = z.infer<typeof verdictChipSchema>;

export const teachObjectiveCoverageSchema = z
  .object({
    id: z.string().uuid(),
    sessionId: z.string().uuid(),
    objectiveId: z.string().uuid(),
    messageSeq: z.number().int().min(1),
    covered: z.boolean(),
    /** Extractive — from the student's own words, never composed. */
    evidenceQuote: z.string().min(1),
    verdict: z.string().min(1),
    contradictionDetected: z.boolean(),
    createdAt: z.string().datetime(),
  })
  .strict();
export type TeachObjectiveCoverage = z.infer<typeof teachObjectiveCoverageSchema>;

/** The Pupil's messages. `kind` drives rendering + the D2 guardrail tests. */
export const pupilMessageSchema = z
  .object({
    kind: z.enum(["opening", "paraphrase_probe", "clarify_nudge", "confusion"]),
    text: z.string().min(1),
  })
  .strict();
export type PupilMessage = z.infer<typeof pupilMessageSchema>;

/* ------------------------------------------------------------------ */
/* Review card (async, end of session) — the correction of record (D2) */
/* ------------------------------------------------------------------ */

export const specPointVerdictSchema = z
  .object({
    specPointId: z.string().min(1),
    verdict: z.enum(["covered", "partially_covered", "not_covered", "flagged"]),
    evidenceQuote: z.string().min(1).nullable(),
  })
  .strict();
export type SpecPointVerdict = z.infer<typeof specPointVerdictSchema>;

/** BDT candidate queue item (twist 3) — AI_SUGGESTED, never auto-promoted. */
export const misconceptionNoteSchema = z
  .object({
    statement: z.string().min(1), // the student's wrong-but-confident claim
    matchedMisconceptionId: z.string().min(1).nullable(),
    confidence: z.number().min(0).max(1),
  })
  .strict();
export type MisconceptionNote = z.infer<typeof misconceptionNoteSchema>;

/** Real past-paper anchor from the serving corpus (twist 4) — never invented. */
export const examAnchorSchema = z
  .object({
    specPointId: z.string().min(1),
    paperRef: z.string().min(1),
    questionRef: z.string().min(1),
  })
  .strict();
export type ExamAnchor = z.infer<typeof examAnchorSchema>;

/** T-C11 KG prerequisite closure (twist 5). */
export const prereqWarningSchema = z
  .object({
    specPointId: z.string().min(1),
    prereqSpecPointId: z.string().min(1),
    note: z.string().min(1),
  })
  .strict();
export type PrereqWarning = z.infer<typeof prereqWarningSchema>;

/** Real course resource link only — validated against the resource list (G3). */
export const suggestedPracticeItemSchema = z
  .object({
    label: z.string().min(1),
    resourceType: z.enum(["question_bank", "revision_notes", "past_paper"]),
    href: z.string().min(1),
  })
  .strict();
export type SuggestedPracticeItem = z.infer<typeof suggestedPracticeItemSchema>;

export const reviewCardSchema = z
  .object({
    sessionId: z.string().uuid(),
    /** Extractive strengths quoting the student's own examples (MG parity). */
    strengths: z
      .array(
        z
          .object({ quote: z.string().min(1), messageSeq: z.number().int() })
          .strict(),
      )
      .max(6),
    /** The full correction lives HERE, never in-session (ADR-040 D2). */
    improvements: z
      .array(
        z
          .object({
            statement: z.string().min(1), // what the student said
            correction: z.string().min(1), // the course-canon statement
            specPointIds: teachSpecPointIdsSchema,
          })
          .strict(),
      )
      .max(6),
    specPointVerdicts: z.array(specPointVerdictSchema).min(1),
    misconceptionNotes: z.array(misconceptionNoteSchema).max(8),
    examAnchors: z.array(examAnchorSchema).max(6),
    prereqWarnings: z.array(prereqWarningSchema).max(6),
    suggestedPractice: z.array(suggestedPracticeItemSchema).max(6),
    generatedAt: z.string().datetime(),
  })
  .strict();
export type ReviewCard = z.infer<typeof reviewCardSchema>;

/* ------------------------------------------------------------------ */
/* Session aggregate                                                   */
/* ------------------------------------------------------------------ */

export const teachSessionSchema = z
  .object({
    id: z.string().uuid(),
    courseId: z.string().min(1),
    specPointIds: teachSpecPointIdsSchema,
    difficulty: teachDifficultySchema,
    length: teachSessionLengthSchema,
    mode: teachSessionModeSchema,
    status: teachSessionStatusSchema,
    objectives: z.array(teachObjectiveSchema).min(3).max(4),
    messageCount: z.number().int().min(0),
    llmCallCount: z.number().int().min(0),
    tokensUsed: z.number().int().min(0),
    createdAt: z.string().datetime(),
    endedAt: z.string().datetime().nullable(),
  })
  .strict();
export type TeachSession = z.infer<typeof teachSessionSchema>;

/* ------------------------------------------------------------------ */
/* Typed fail-closed errors (never degrade silently)                   */
/* ------------------------------------------------------------------ */

export const teachMeErrorCodeSchema = z.enum([
  "TEACH_ME_FLAG_DISABLED",
  "COURSE_NOT_ELIGIBLE", // content gate G1–G4 failed (e.g. no indexed corpus)
  "QUOTA_EXCEEDED", // 3 sessions/day (ADR-040 D3)
  "MESSAGE_CEILING", // Quick ≤ 5 / In-Depth ≤ 6
  "TOKEN_CEILING", // ≤ 10 calls / ≤ 60k tokens per session
  "LLM_SHAPE_DRIFT", // T-MIG-039 fail-closed refusal
  "SESSION_NOT_ACTIVE",
  "NOT_OWNER",
]);
export type TeachMeErrorCode = z.infer<typeof teachMeErrorCodeSchema>;

export const teachMeErrorSchema = z
  .object({ error: teachMeErrorCodeSchema, message: z.string().min(1) })
  .strict();
export type TeachMeError = z.infer<typeof teachMeErrorSchema>;

/* ------------------------------------------------------------------ */
/* Route DTOs                                                          */
/* ------------------------------------------------------------------ */

export const createSessionRequestSchema = z
  .object({
    courseId: z.string().min(1),
    specPointIds: teachSpecPointIdsSchema,
    difficulty: teachDifficultySchema,
    length: teachSessionLengthSchema,
    mode: teachSessionModeSchema,
  })
  .strict();
export type CreateSessionRequest = z.infer<typeof createSessionRequestSchema>;

export const createSessionResponseSchema = z
  .object({ session: teachSessionSchema, opening: pupilMessageSchema })
  .strict();
export type CreateSessionResponse = z.infer<typeof createSessionResponseSchema>;

export const postMessageRequestSchema = z
  .object({ text: z.string().min(1).max(4000) })
  .strict();
export type PostMessageRequest = z.infer<typeof postMessageRequestSchema>;

export const postMessageResponseSchema = z
  .object({
    /** null on a sub-floor clarify nudge (no judge call ran). */
    chip: verdictChipSchema.nullable(),
    /** null once the message ceiling is hit (session must be ended). */
    pupilMessage: pupilMessageSchema.nullable(),
    objectives: z.array(teachObjectiveSchema),
    session: teachSessionSchema,
  })
  .strict();
export type PostMessageResponse = z.infer<typeof postMessageResponseSchema>;

export const endSessionResponseSchema = z
  .object({
    status: teachSessionStatusSchema,
    /** null while review generation is pending ("Generating session review…"). */
    review: reviewCardSchema.nullable(),
  })
  .strict();
export type EndSessionResponse = z.infer<typeof endSessionResponseSchema>;

export const sessionHistoryItemSchema = z
  .object({
    sessionId: z.string().uuid(),
    courseId: z.string().min(1),
    specPointIds: teachSpecPointIdsSchema,
    status: teachSessionStatusSchema,
    createdAt: z.string().datetime(),
  })
  .strict();
export type SessionHistoryItem = z.infer<typeof sessionHistoryItemSchema>;

/**
 * F-182 drill-surface wire contracts — the per-spec-point drill (the first
 * Kognity-line build item; tracker F-182, repo syllabai-v2).
 *
 * SPEC-NATIVE (not a frozen-port parity band — the DC-7 posture): the drill
 * surface has no Java DTO to port; the source of record is the build-lane
 * prereg docs/F182-DRILL-BUILD-PLAN.md (committed WITH the implementation it
 * gates) under the product spec Kognity dossier v1.1 Deep Dive D §8.5 row 1
 * ("5-part randomized draw keyed to the spec-point address … zero stakes,
 * always available, retakable (fresh draw); ships only where spec-tagging
 * exists"). The contracts-first law (MIGRATION_PLAN §4.1) still applies:
 * every drill endpoint validates through these schemas and nothing else.
 *
 * Wire law of the shapes:
 *   - The draw response NEVER carries answer facts. `choices` ships
 *     {label, textMd} only — the bundle's isCorrect flag and solutionMd are
 *     bank-side facts the client cannot see before the attempt (the instant
 *     reveal rides the EVIDENCE response, post-attempt; the F-183 reveal law
 *     formalizes the gating later).
 *   - Attempt evidence is the F-055 SHAPE (ADR-016: score, time, confidence,
 *     flag — immutable attempt evidence across all question sources), keyed
 *     to the drill's own bundle address space (string part ids), NOT the
 *     uuid-keyed DB attempts plane. Zero-stakes law: drill evidence rows are
 *     never read by the gradebook/progress projections (DC-7) and no
 *     attempts/ai_mark_events row is ever written by the drill surface.
 *   - Structured parts are recorded UNGRADED (correct/marksAwarded null) —
 *     the server refuses to invent marks; the learner self-checks against
 *     the revealed solution. MCQ parts are server-graded from the bank.
 */
import { z } from "zod";

/** The serving plane a drill part rides (the census plane law, verbatim). */
export const drillPlaneSchema = z.enum(["official", "topic"]);
export type DrillPlane = z.infer<typeof drillPlaneSchema>;

/** A choice as the CLIENT sees it — never carries the isCorrect flag. */
export const drillChoiceViewSchema = z.object({
  label: z.string().min(1),
  textMd: z.string(),
});
export type DrillChoiceView = z.infer<typeof drillChoiceViewSchema>;

/** One drawn part as the client renders it (content view; no answer facts). */
export const drillPartViewSchema = z.object({
  partId: z.string().min(1),
  questionId: z.string().min(1),
  setId: z.string().min(1),
  plane: drillPlaneSchema,
  order: z.number().int().min(0),
  marks: z.number().int().min(0),
  questionType: z.string().nullable(),
  commandWord: z.string().nullable(),
  problemMd: z.string(),
  choices: z.array(drillChoiceViewSchema).nullable(),
  specPointCodes: z.array(z.string().min(1)).min(1),
});
export type DrillPartView = z.infer<typeof drillPartViewSchema>;

// ── GET /addresses ──────────────────────────────────────────────────────────

export const drillAddressesQuerySchema = z.object({
  course: z.string().min(1),
});
export type DrillAddressesQuery = z.infer<typeof drillAddressesQuerySchema>;

/** One address row of the census of record (the fail-closed floor included). */
export const drillAddressRowSchema = z.object({
  code: z.string().min(1),
  official: z.number().int().min(0),
  topic: z.number().int().min(0),
  combined: z.number().int().min(0),
  drillable: z.boolean(),
});
export type DrillAddressRow = z.infer<typeof drillAddressRowSchema>;

export const drillAddressesResponseSchema = z.object({
  course: z.string().min(1),
  summary: z.object({
    specPointAddresses: z.number().int().min(0),
    covered: z.number().int().min(0),
    drillable: z.number().int().min(0),
    thin: z.number().int().min(0),
    uncovered: z.number().int().min(0),
  }),
  /** Only the DRILLABLE rows — the surface offers exactly these (policy P3). */
  addresses: z.array(drillAddressRowSchema),
});
export type DrillAddressesResponse = z.infer<typeof drillAddressesResponseSchema>;

// ── POST /draw ──────────────────────────────────────────────────────────────

export const drillDrawRequestSchema = z.object({
  course: z.string().min(1),
  /** One spine spec-point address, e.g. "4CH1-1.25" (policy P2). */
  code: z.string().min(1),
  /**
   * Determinism law (P5): (bank, address, recency, seed) -> one draw. A
   * retake is a NEW seed — the fresh-draw guarantee. Absent = the server
   * draws one; the response always carries the seed actually used.
   */
  seed: z.number().int().min(0).max(0xffffffff).optional(),
});
export type DrillDrawRequest = z.infer<typeof drillDrawRequestSchema>;

export const drillDrawResponseSchema = z.object({
  drawId: z.string().uuid(),
  course: z.string().min(1),
  code: z.string().min(1),
  seed: z.number().int().min(0).max(0xffffffff),
  /** The full pool size at the address (before recency filtering). */
  poolSize: z.number().int().min(0),
  /** The pool size after excluding recently-seen parts. */
  freshPoolSize: z.number().int().min(0),
  /** True when the thin-pool fallback (P4) drew from the full pool. */
  usedFallback: z.boolean(),
  parts: z.array(drillPartViewSchema),
});
export type DrillDrawResponse = z.infer<typeof drillDrawResponseSchema>;

// ── POST /evidence (the F-055-shaped seam) ─────────────────────────────────

/**
 * The learner's response to one drawn part. `choice` = an MCQ option label
 * (server-graded against the bank's isCorrect); `text` = a structured free
 * response (recorded, never server-graded — correct/marksAwarded stay null).
 */
export const drillResponseSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("choice"), label: z.string().min(1) }),
  z.object({ kind: z.literal("text"), text: z.string().min(1) }),
]);
export type DrillResponse = z.infer<typeof drillResponseSchema>;

/**
 * The F-055 SHAPE (ADR-016 — score, time, confidence, flag) over the drill
 * address space: one immutable evidence row per (drawId, partId).
 */
export const drillEvidenceRequestSchema = z.object({
  drawId: z.string().uuid(),
  partId: z.string().min(1),
  response: drillResponseSchema,
  responseTimeMs: z.number().int().min(0),
  confidenceLevel: z.number().int().min(1).max(5).optional(),
  selfDoubtFlag: z.boolean().optional(),
});
export type DrillEvidenceRequest = z.infer<typeof drillEvidenceRequestSchema>;

/**
 * The evidence ack + the INSTANT reveal: solutionMd rides the response to
 * the recorded attempt (never before it). `correct`/`marksAwarded` are null
 * for ungraded structured parts — never zero, never invented.
 */
export const drillEvidenceResponseSchema = z.object({
  evidenceId: z.string().uuid(),
  drawId: z.string().uuid(),
  partId: z.string().min(1),
  correct: z.boolean().nullable(),
  marksAwarded: z.number().int().nullable(),
  marksPossible: z.number().int().min(0),
  solutionMd: z.string().nullable(),
});
export type DrillEvidenceResponse = z.infer<typeof drillEvidenceResponseSchema>;

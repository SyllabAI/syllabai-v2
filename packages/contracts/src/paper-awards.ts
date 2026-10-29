/**
 * Paper-mark award contracts — T-MG-AWARDS-1 run-001.
 * Plan of record: docs/MG-MARK-PARITY-PLAN.md §3.2 (the MathsGenie
 * getRegionMarks contract shape, adopted onto the award plane).
 *
 * NOT a Java-core port: a NEW v2-native surface (contracts-first shape
 * discipline — constraints are stated here once and the api validates
 * against exactly this file).
 *
 * Laws carried from the observed ledger (plan §1.6):
 * - the award plane is per-AWARD grain (the thing THEIRS lacks): one row
 *   per mark point assessed, duplicate codes (P1/P1) disambiguated by
 *   `ordinal` (position-indexed — their pointsScored[] positions).
 * - feedback IS the observed feedbackObject decomposition: chatMessage,
 *   pointsScored[], pointsNotScored[], thoughtProcess,
 *   strategiesForImprovement[], attempt. `score` lives on the row, and
 *   markPointsAwarded[] IS the award rows (the ledger decomposition —
 *   never re-embedded).
 * - code vocabulary: B1/M1/A1/P1/C1 observed first-hand (dossier §1.6);
 *   the set is open (board-dependent) — min(1) text, never an enum here.
 * - POSTURE LAW (plan §3.2): the learner id rides the JWT context, NEVER
 *   the wire — no learnerId field exists on any write or read shape.
 * - documentRefType vocabulary (dossier §1.1 documentRef union, Phase-5
 *   extension pending): the six known ref kinds are accepted on reads;
 *   the Phase-2 write bridge resolves paper_asset only.
 */
import { z } from "zod";

/** The documentRef union observed at dossier §1.1 (2 reserved in Phase 5). */
export const documentRefTypeSchema = z.enum([
  "printable",
  "paper_asset",
  "uploaded_paper",
  "daily_five_sheet",
  "collection_worksheet",
  "paper_mark_submission",
]);
export type DocumentRefType = z.infer<typeof documentRefTypeSchema>;

/** The observed feedbackObject (dossier §1.6), schema-shaped. */
export const markAwardFeedbackSchema = z.object({
  attempt: z.string().min(1),
  chatMessage: z.string(),
  pointsScored: z.array(z.string()),
  pointsNotScored: z.array(z.string()),
  thoughtProcess: z.string(),
  strategiesForImprovement: z.array(z.string()),
});
export type MarkAwardFeedback = z.infer<typeof markAwardFeedbackSchema>;

/** Working-block input (the evidence-pointer payload; Phase 4 exercises). */
export const markWorkingBlockInputSchema = z.object({
  kind: z.enum(["ink", "text", "structure"]),
  content: z.unknown(),
});
export type MarkWorkingBlockInput = z.infer<typeof markWorkingBlockInputSchema>;

/** One award write row (Phase 4's pipeline shape; ordinal REQUIRED — the
 * position law: multi-P1 disambiguates, the unique claim needs it). */
export const markAwardWriteSchema = z.object({
  code: z.string().min(1),
  awarded: z.boolean(),
  score: z.number().int().min(0),
  maxScore: z.number().int().min(1),
  ordinal: z.number().int().min(0),
  markPointId: z.string().uuid().nullable().optional(),
  page: z.number().int().min(1).nullable().optional(),
  feedback: markAwardFeedbackSchema,
  working: markWorkingBlockInputSchema.optional(),
});
export type MarkAwardWrite = z.infer<typeof markAwardWriteSchema>;

/** POST /api/v1/paper-marks/regions/:regionId/awards body — identity rides
 * the path (regionId → the bridge) and the JWT (learner); the body carries
 * only the marking truth. */
export const paperAwardWriteRequestSchema = z.object({
  pipelineVersion: z.string().min(1).max(64),
  awards: z.array(markAwardWriteSchema).min(1),
});
export type PaperAwardWriteRequest = z.infer<typeof paperAwardWriteRequestSchema>;

/** One served award row — per-award `id` is the parity headline (theirs is
 * region-grain only). markPointId may be null (free-form region, no
 * definition join — the plan §3.2 null-law). */
export const servedMarkAwardSchema = z.object({
  id: z.string().uuid(),
  code: z.string().min(1),
  awarded: z.boolean(),
  score: z.number().int().min(0),
  maxScore: z.number().int().min(1),
  ordinal: z.number().int().min(0),
  markPointId: z.string().uuid().nullable(),
  page: z.number().int().min(1).nullable(),
  workingRef: z.string().uuid().nullable(),
  pipelineVersion: z.string().min(1),
  feedback: markAwardFeedbackSchema,
  createdAt: z.string(),
});
export type ServedMarkAward = z.infer<typeof servedMarkAwardSchema>;

/** One served working block (the workingRef resolution target — pin b). */
export const servedMarkWorkingBlockSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(["ink", "text", "structure"]),
  content: z.unknown(),
  createdAt: z.string(),
});
export type ServedMarkWorkingBlock = z.infer<typeof servedMarkWorkingBlockSchema>;

/** One region's ledger slice: score = Σ awarded (pin a), maxScore = Σ
 * max_score over the region's award rows. */
export const servedRegionMarksSchema = z.object({
  regionKey: z.string().min(1),
  page: z.number().int().min(1).nullable(),
  score: z.number().int().min(0),
  maxScore: z.number().int().min(0),
  awards: z.array(servedMarkAwardSchema),
  workingBlocks: z.array(servedMarkWorkingBlockSchema),
});
export type ServedRegionMarks = z.infer<typeof servedRegionMarksSchema>;

/** GET /api/v1/paper-marks?documentRefType&documentRefId response — the
 * getRegionMarks contract, learner-scoped (the ledger of the CALLING
 * learner only). Honest-empty: a known document with no marks serves
 * regions: [] — 200, never an error (the observed not-marked-yet shape). */
export const paperMarksLedgerSchema = z.object({
  documentRefType: documentRefTypeSchema,
  documentRefId: z.string().uuid(),
  regions: z.array(servedRegionMarksSchema),
});
export type PaperMarksLedger = z.infer<typeof paperMarksLedgerSchema>;

/** POST response — the claim receipt: emitted = rows the once-only claim
 * admitted, suppressed = re-fires the unique constraint absorbed (200,
 * never an error — idempotent pipeline semantics for Phase 4 re-runs). */
export const paperAwardWriteResponseSchema = z.object({
  documentRefType: documentRefTypeSchema,
  documentRefId: z.string().uuid(),
  regionKey: z.string().min(1),
  emitted: z.number().int().min(0),
  suppressed: z.number().int().min(0),
  workingBlocks: z.number().int().min(0),
});
export type PaperAwardWriteResponse = z.infer<typeof paperAwardWriteResponseSchema>;

/** Query + path params (routes validate; malformed → 400, unknown → 404). */
export const paperMarksQuerySchema = z.object({
  documentRefType: documentRefTypeSchema.default("paper_asset"),
  documentRefId: z.string().uuid(),
});
export const paperAwardRegionPathSchema = z.object({
  regionId: z.string().uuid(),
});

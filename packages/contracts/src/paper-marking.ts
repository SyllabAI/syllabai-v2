/**
 * Paper-marking pipeline contracts — T-MG-CROPMARK-1 run-001.
 * Plan of record: docs/MG-MARK-PARITY-PLAN.md §3.4 (the crop-then-mark
 * pipeline — the markQuestionRegion equivalent, mark_awards writes via the
 * Phase-2 bridge).
 *
 * NOT a Java-core port: a NEW v2-native surface (contracts-first shape
 * discipline — constraints are stated here once and the api validates
 * against exactly this file).
 *
 * Laws carried from the plan (§3.4):
 * - the pipeline RECEIVES the cropped image (`{regionId, imageDataUrl}` is
 *   the validator-leaked their-side input shape; the crop producer is the
 *   client's render-resolution composite — run-002's surface). The region
 *   rides the PATH and the learner rides the JWT context (the Phase-2
 *   posture law — no learnerId field exists on any shape here).
 * - long-running posture: the mark + regrade routes are 202 + poll (retry:
 *   0 per their offline class — no retry verb exists; a re-mark is a NEW
 *   job whose award writes are absorbed idempotently by the Phase-2
 *   once-only claim).
 * - the transcription text IS part of the output, never a hidden
 *   intermediate (the §1.8 law): the poll result carries it and pin (d)
 *   keeps thoughtProcess transcription-first.
 * - documentRefType is fixed "paper_asset" at the Phase-4 bridge (the
 *   Phase-2 resolution law; Phase-5's uploaded refs arrive with their own
 *   bridge).
 */
import { z } from "zod";
import { documentRefTypeSchema, markAwardFeedbackSchema } from "./paper-awards";

/**
 * The imageDataUrl wire law: an inline data URL, png/jpeg/webp only (the
 * answer-input transcription mime family — the vision-capable members'
 * diet). Syntax-only here; the byte cap (4 MB decoded) is enforced at the
 * api pre-check where Buffer can count the payload.
 */
export const paperMarkImageDataUrlSchema = z
  .string()
  .regex(
    /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/,
    "imageDataUrl must be a data:image/(png|jpeg|webp);base64 URL",
  );

/** POST /api/v1/paper-marks/regions/:regionId/mark body. */
export const paperMarkRegionRequestSchema = z.object({
  imageDataUrl: paperMarkImageDataUrlSchema,
});
export type PaperMarkRegionRequest = z.infer<typeof paperMarkRegionRequestSchema>;

/** POST /api/v1/paper-marks/parts/:partId/regrade body — the typed
 * channel: the learner's typed answer IS the transcription (no vision
 * step); the same doctrine-match + ledger write runs beneath it. */
export const paperMarkRegradeRequestSchema = z.object({
  answerHtml: z.string().min(1).max(20_000),
});
export type PaperMarkRegradeRequest = z.infer<typeof paperMarkRegradeRequestSchema>;

/** 202 accepted body — the job receipt (the poll handle; retry: 0 — the
 * client polls, never re-POSTs). */
export const paperMarkAcceptedSchema = z.object({
  markId: z.string().uuid(),
  status: z.literal("queued"),
});
export type PaperMarkAccepted = z.infer<typeof paperMarkAcceptedSchema>;

/** Job lifecycle states (honest terminal pair: succeeded | failed). */
export const paperMarkStatusSchema = z.enum(["queued", "running", "succeeded", "failed"]);
export type PaperMarkStatus = z.infer<typeof paperMarkStatusSchema>;

/** One ASSEMBLED award in a succeeded poll snapshot — the job's view of
 * what was written (ledger truth from the definition plane). The per-award
 * ledger ids are the claim's gen_random_uuid() outputs, served by the
 * Phase-2 ledger read (GET /api/v1/paper-marks) — never fabricated here. */
export const assembledMarkAwardSchema = z.object({
  code: z.string().min(1),
  awarded: z.boolean(),
  score: z.number().int().min(0),
  maxScore: z.number().int().min(1),
  ordinal: z.number().int().min(0),
  markPointId: z.string().uuid().nullable(),
  page: z.number().int().min(1).nullable(),
});
export type AssembledMarkAward = z.infer<typeof assembledMarkAwardSchema>;

/** GET /api/v1/paper-marks/marks/:markId response — the poll snapshot.
 * succeeded carries the FULL marking output (transcription + feedback +
 * the assembled award rows + the claim receipt); failed carries the honest
 * error pair (code + message), never a fabricated partial award. */
export const paperMarkPollResponseSchema = z.object({
  markId: z.string().uuid(),
  status: paperMarkStatusSchema,
  pipelineVersion: z.string().min(1).optional(),
  documentRefType: documentRefTypeSchema.optional(),
  documentRefId: z.string().uuid().optional(),
  regionKey: z.string().min(1).optional(),
  transcription: z.string().optional(),
  feedback: markAwardFeedbackSchema.optional(),
  awards: z.array(assembledMarkAwardSchema).optional(),
  receipt: z
    .object({
      emitted: z.number().int().min(0),
      suppressed: z.number().int().min(0),
      workingBlocks: z.number().int().min(0),
    })
    .optional(),
  error: z
    .object({
      code: z.string().min(1),
      message: z.string().min(1),
    })
    .optional(),
  queuedAt: z.string().min(1),
  completedAt: z.string().nullable(),
});
export type PaperMarkPollResponse = z.infer<typeof paperMarkPollResponseSchema>;

/** Path params (routes validate; malformed → 400, unknown → 404). */
export const paperMarkRegionPathSchema = z.object({ regionId: z.string().uuid() });
export const paperMarkRegradePathSchema = z.object({ partId: z.string().uuid() });
export const paperMarkPollPathSchema = z.object({ markId: z.string().uuid() });

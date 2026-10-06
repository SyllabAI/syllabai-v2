/**
 * T-MIG-062 — research calibration contracts (frozen law @ 6cad6ef, syllabai-core).
 *
 * The Wave-6 research band's wire shapes, ported line-against-line from
 * LearnerModelCalibrationService.java's report records (:289-335):
 *
 *   - CalibrationReport — {sampleCount, skippedRows, brier, ece, bins[10],
 *     segments[7], gapSegments[6], learnerCount, suppressed}.
 *   - Bin (:289-306) — one equal-width bin of the [0,1] latent-forecast
 *     range in one of THREE states, encoded on the wire as: EMPTY
 *     (count 0 → every mean 0.0 — honest zeros, suppressed-style nulls
 *     FORBIDDEN), SUPPRESSED (count > 0 but the bin's distinct learners
 *     < 5 → every mean null — the cell's outcomes hide, its traffic stays
 *     visible), REPORTABLE (full statistics). A null mean must never be
 *     read as zero, and a zero mean on a zero count must never be read as
 *     data — the schema keeps the nullability so the wire can carry the
 *     difference; the three-state LAW is enforced by the service (and
 *     pinned there), not by zod.
 *   - FormatSegment (:322-337) / GapSegment (:354-369) — per-axis slices
 *     with the same statistics; the gap segments additionally carry
 *     meanAnchor (the mean raw ADR-031 anchor over rows carrying one —
 *     null when suppressed, 0.0 when empty).
 *   - k-anonymity (C7 resolution, ADR-036 BINDS THE PORT): MIN_REPORTABLE_
 *     LEARNERS = 5 is a CODE CONSTANT in the service (deliberately not
 *     configuration — a privacy floor an env var could silently lower is
 *     not a floor); it is NOT a schema concern — the schema renders both
 *     suppressed and honest cells losslessly.
 *
 * The FIXED segment taxonomies (C4 protocol §2 fixed render order — a
 * report's segment list is diffable across time) are exported here as
 * frozen data: CALIBRATION_SEGMENT_ORDER (7 keys) and
 * CALIBRATION_GAP_ORDER (6 keys). The segment ASSEMBLY laws (partition
 * invariants, pricing fold, suppression) live in the service module.
 *
 * The nodeId FILTER is not a schema concern (a query param, uuid-gated at
 * the route with the MethodArgumentTypeMismatch 400 "malformed request"
 * parity — the shared :167-172 law).
 */

import { z } from "zod";

/**
 * Bin (:289-306) — the three-state bin. All means nullable: EMPTY renders
 * 0.0s, SUPPRESSED renders nulls, REPORTABLE renders numbers; which of the
 * three a cell is, is derivable from count + the service's k law, never
 * from the schema alone.
 */
export const calibrationBinSchema = z.object({
  index: z.number().int().min(0).max(9),
  lowerBound: z.number(),
  upperBound: z.number(),
  count: z.number().int().nonnegative(),
  meanLatentPredicted: z.number().nullable(),
  meanPredicted: z.number().nullable(),
  observedAccuracy: z.number().nullable(),
  meanBrier: z.number().nullable(),
  calibrationError: z.number().nullable(),
});
export type CalibrationBin = z.infer<typeof calibrationBinSchema>;

/**
 * FormatSegment (:322-337) — one slice of the stream along the format axis,
 * with its own ten bins (suppression applies per bin within the segment too).
 */
export const calibrationFormatSegmentSchema = z.object({
  segment: z.string(),
  sampleCount: z.number().int().nonnegative(),
  brier: z.number().nullable(),
  ece: z.number().nullable(),
  bins: z.array(calibrationBinSchema),
  learnerCount: z.number().int().nonnegative(),
  suppressed: z.boolean(),
});
export type CalibrationFormatSegment = z.infer<typeof calibrationFormatSegmentSchema>;

/**
 * GapSegment (:354-369) — the gap-axis slice; meanAnchor is the raw side of
 * the zero-gap bit-identity leg (decayed vs raw prior divergence readout).
 */
export const calibrationGapSegmentSchema = calibrationFormatSegmentSchema.extend({
  meanAnchor: z.number().nullable(),
});
export type CalibrationGapSegment = z.infer<typeof calibrationGapSegmentSchema>;

/** CalibrationReport (:371-385) — the full GET /calibration body. */
export const calibrationReportSchema = z.object({
  sampleCount: z.number().int().nonnegative(),
  skippedRows: z.number().int().nonnegative(),
  brier: z.number().nullable(),
  ece: z.number().nullable(),
  bins: z.array(calibrationBinSchema),
  segments: z.array(calibrationFormatSegmentSchema),
  gapSegments: z.array(calibrationGapSegmentSchema),
  learnerCount: z.number().int().nonnegative(),
  suppressed: z.boolean(),
});
export type CalibrationReport = z.infer<typeof calibrationReportSchema>;

/**
 * The format axis in fixed render order (C4 protocol §2, service :143-147).
 * Fixed so a report's segment list is diffable across time and the coverage
 * annotation is trivial. Exported as frozen CONTRACT data (the service
 * imports it — one taxonomy, one source of truth).
 */
export const CALIBRATION_SEGMENT_ORDER = [
  "MCQ_SINGLE(2-3)",
  "MCQ_SINGLE(4)",
  "MCQ_SINGLE(5+)",
  "MCQ_SINGLE(malformed)",
  "SHORT_ANSWER",
  "STRUCTURED",
  "UNTYPED",
] as const;

/**
 * The gap axis in fixed render order (C4 protocol §2, service :151-155):
 * τ-aligned bands with zero-gap as its own stratum (the bit-identity leg
 * between the decayed and raw priors) + UNKNOWN as the defensive tail.
 */
export const CALIBRATION_GAP_ORDER = ["0", "1-30", "31-90", "91-365", "366+", "UNKNOWN"] as const;

/**
 * Paper-region geometry contracts — T-MG-MP-RECT-1 run-001.
 * Plan of record: docs/MG-MARK-PARITY-PLAN.md §3.1 (the MathsGenie
 * getRegions contract shape, adopted; their observed §1.3 region model).
 *
 * NOT a Java-core port: this is a NEW v2-native surface (the contracts-first
 * rule applies as shape discipline — constraints are stated here once and
 * the api validates against exactly this file).
 *
 * Laws carried from the observed contract:
 * - regionKey: "9" | "9.p1" | "6.a" — bare question / answer-line part /
 *   labeled sub-part (MG-MARK-PARITY-PLAN §3.1 region-key law; derived,
 *   never stored).
 * - rects[]: normalized 0..1 per page, multi-rect, ordinal-disambiguated.
 * - questionPartId is WIRED (their live-papers serving has it null — the
 *   parity gap this surface closes).
 * - The negative path (MG-MARK-PARITY-PLAN §3.1 pin c, observed §1.3):
 *   ungrounded asset → { extracted: false, markable: false,
 *   groundingComplete: false, regions: [] } — honest-empty, never an error
 *   for a KNOWN paper; unknown paper → 404.
 */
import { z } from "zod";

/** One normalized rect row (mark_point_rects serving shape). */
export const paperRegionRectSchema = z.object({
  page: z.number().int().min(1),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
  height: z.number().min(0).max(1),
  ordinal: z.number().int().min(0),
});
export type PaperRegionRect = z.infer<typeof paperRegionRectSchema>;

/**
 * One region: a question (kind "question") or a part (kind "part").
 * `label` is the human identity of record: the derived question key for
 * question regions, the part label for part regions.
 */
export const paperAssetRegionSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(["question", "part"]),
  regionKey: z.string().min(1),
  parentRegionId: z.string().uuid().nullable(),
  label: z.string().min(1),
  marks: z.number().int().min(0),
  page: z.number().int().min(1).nullable(),
  rects: z.array(paperRegionRectSchema),
  questionPartId: z.string().uuid().nullable(),
  answersOnFigure: z.boolean(),
  markable: z.boolean(),
  extracted: z.boolean(),
});
export type PaperAssetRegion = z.infer<typeof paperAssetRegionSchema>;

/**
 * GET /api/v1/paper-assets/:id/regions response.
 * groundingComplete: every markable region is extracted AND at least one
 * region exists (the vacuous-empty case is NOT "complete" — the negative
 * path reads false, matching the observed ungrounded shape).
 */
export const paperAssetRegionsResponseSchema = z.object({
  extracted: z.boolean(),
  markable: z.boolean(),
  groundingComplete: z.boolean(),
  regions: z.array(paperAssetRegionSchema),
});
export type PaperAssetRegionsResponse = z.infer<typeof paperAssetRegionsResponseSchema>;

/** uuid path param (routes validate; malformed → 400, unknown → 404). */
export const paperAssetIdPathSchema = z.object({
  id: z.string().uuid(),
});

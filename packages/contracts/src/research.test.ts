/**
 * T-MIG-062 — research calibration contract pins (frozen law @ 6cad6ef).
 * The wire shapes are LOSSLESS over the three cell states (empty honest
 * zeros / C7-suppressed nulls / reportable numbers) and the fixed segment
 * taxonomies are frozen data — a schema drift on either silently rewrites
 * the ADR-036 posture, so both are pinned here.
 */
import { describe, expect, test } from "bun:test";
import {
  CALIBRATION_GAP_ORDER,
  CALIBRATION_SEGMENT_ORDER,
  calibrationBinSchema,
  calibrationReportSchema,
} from "./research";

describe("calibration wire (LearnerModelCalibrationService records :289-385)", () => {
  test("the fixed taxonomies are the frozen C4 §2 render orders (diffable across time)", () => {
    expect(CALIBRATION_SEGMENT_ORDER).toEqual([
      "MCQ_SINGLE(2-3)",
      "MCQ_SINGLE(4)",
      "MCQ_SINGLE(5+)",
      "MCQ_SINGLE(malformed)",
      "SHORT_ANSWER",
      "STRUCTURED",
      "UNTYPED",
    ]);
    expect(CALIBRATION_GAP_ORDER).toEqual(["0", "1-30", "31-90", "91-365", "366+", "UNKNOWN"]);
  });

  test("a SUPPRESSED cell renders nulls and keeps its counts (the C7 wire posture is lossless)", () => {
    const suppressed = calibrationBinSchema.parse({
      index: 3,
      lowerBound: 0.3,
      upperBound: 0.4,
      count: 6,
      meanLatentPredicted: null,
      meanPredicted: null,
      observedAccuracy: null,
      meanBrier: null,
      calibrationError: null,
    });
    expect(suppressed.count).toBe(6);
    expect(suppressed.meanPredicted).toBe(null);
  });

  test("an EMPTY bin renders honest zeros, a REPORTABLE one full statistics (EMPTY ≠ SUPPRESSED)", () => {
    const empty = calibrationBinSchema.parse({
      index: 0,
      lowerBound: 0,
      upperBound: 0.1,
      count: 0,
      meanLatentPredicted: 0.0,
      meanPredicted: 0.0,
      observedAccuracy: 0.0,
      meanBrier: 0.0,
      calibrationError: 0.0,
    });
    expect(empty.count).toBe(0);
    expect(empty.meanPredicted).toBe(0);
    const reportable = calibrationBinSchema.parse({
      index: 3,
      lowerBound: 0.3,
      upperBound: 0.4,
      count: 5,
      meanLatentPredicted: 0.35,
      meanPredicted: 0.4775,
      observedAccuracy: 1,
      meanBrier: 0.27300625,
      calibrationError: -0.5225,
    });
    expect(reportable.calibrationError).toBeCloseTo(-0.5225, 12);
  });

  test("the full report schema accepts the suppressed-headline shape (gap segments carry meanAnchor)", () => {
    const report = calibrationReportSchema.parse({
      sampleCount: 6,
      skippedRows: 1,
      brier: null,
      ece: null,
      bins: Array.from({ length: 10 }, (_, i) => ({
        index: i,
        lowerBound: i / 10,
        upperBound: (i + 1) / 10,
        count: 0,
        meanLatentPredicted: 0.0,
        meanPredicted: 0.0,
        observedAccuracy: 0.0,
        meanBrier: 0.0,
        calibrationError: 0.0,
      })),
      segments: CALIBRATION_SEGMENT_ORDER.map((segment) => ({
        segment,
        sampleCount: 0,
        brier: 0,
        ece: 0,
        bins: [],
        learnerCount: 0,
        suppressed: false,
      })),
      gapSegments: CALIBRATION_GAP_ORDER.map((segment) => ({
        segment,
        sampleCount: 0,
        brier: 0,
        ece: 0,
        meanAnchor: null,
        bins: [],
        learnerCount: 0,
        suppressed: false,
      })),
      learnerCount: 2,
      suppressed: true,
    });
    expect(report.suppressed).toBe(true);
    expect(report.gapSegments[0]!.meanAnchor).toBe(null);
    expect(report.skippedRows).toBe(1);
  });
});

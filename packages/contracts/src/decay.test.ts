/**
 * Decay-math + NightlyDecayJob I/O contract pins (T-MIG-038) — acceptance
 * baseline is the Java declaration (frozen syllabai-core @ 6cad6ef).
 * Engine-boundary schemas: invariants pinned exactly (BktParams/BdtParams/
 * DecayParams compact-constructor laws), ledger + event shapes pinned.
 */
import { describe, expect, it } from "bun:test";
import {
  BDT_PAPER_DEFAULTS,
  BKT_PAPER_DEFAULTS,
  DECAY_PAPER_DEFAULTS,
  bdtParamsSchema,
  bktParamsSchema,
  decayAppliedEventSchema,
  decayJobRunSchema,
  decayParamsSchema,
  reviewScheduledEventSchema,
} from "./decay";

const UUID = "0b8fd85b-6c47-4d6e-9e38-2c69b47c1d01";
const T = "2026-10-04T09:37:00.129532Z";

describe("DecayParams (learner/decay/DecayParams.java)", () => {
  it("paper defaults match the frozen config defaults (30/90/365/0.45/0.8/0.1/0.6)", () => {
    expect(DECAY_PAPER_DEFAULTS).toEqual({
      tauLowDays: 30,
      tauMidDays: 90,
      tauHighDays: 365,
      lowBandCeiling: 0.45,
      highBandFloor: 0.8,
      floor: 0.1,
      reviewBelow: 0.6,
    });
    expect(decayParamsSchema.safeParse(DECAY_PAPER_DEFAULTS).success).toBe(true);
  });

  it("invariants: taus positive; 0 < low < high <= 1; 0 <= floor < reviewBelow <= 1", () => {
    expect(decayParamsSchema.safeParse({ ...DECAY_PAPER_DEFAULTS, tauMidDays: 0 }).success).toBe(
      false,
    );
    expect(
      decayParamsSchema.safeParse({ ...DECAY_PAPER_DEFAULTS, lowBandCeiling: 0.9, highBandFloor: 0.8 })
        .success,
    ).toBe(false); // low must be < high
    expect(
      decayParamsSchema.safeParse({ ...DECAY_PAPER_DEFAULTS, floor: 0.7, reviewBelow: 0.6 }).success,
    ).toBe(false); // floor must be < reviewBelow
    expect(decayParamsSchema.safeParse({ ...DECAY_PAPER_DEFAULTS, floor: 0, reviewBelow: 1 }).success)
      .toBe(true); // boundaries legal: 0 <= floor, reviewBelow <= 1
  });
});

describe("BktParams (learner/bkt/BktParams.java)", () => {
  it("paper defaults L0=0.1 slip=0.1 guess=0.25 T=0.1", () => {
    expect(BKT_PAPER_DEFAULTS).toEqual({ l0: 0.1, slip: 0.1, guess: 0.25, learnRate: 0.1 });
    expect(bktParamsSchema.safeParse(BKT_PAPER_DEFAULTS).success).toBe(true);
  });

  it("every probability strictly in (0,1) EXCLUSIVE", () => {
    expect(bktParamsSchema.safeParse({ ...BKT_PAPER_DEFAULTS, l0: 0 }).success).toBe(false);
    expect(bktParamsSchema.safeParse({ ...BKT_PAPER_DEFAULTS, guess: 1 }).success).toBe(false);
  });

  it("degenerate guard: L0+guess and slip+guess both >= 1 rejected", () => {
    expect(bktParamsSchema.safeParse({ l0: 0.9, slip: 0.9, guess: 0.2, learnRate: 0.1 }).success).toBe(
      false,
    );
    expect(bktParamsSchema.safeParse({ l0: 0.9, slip: 0.05, guess: 0.2, learnRate: 0.1 }).success).toBe(
      true,
    ); // only one sum >= 1 is legal
  });
});

describe("BdtParams (learner/bdt/BdtParams.java)", () => {
  it("paper defaults prior 0.3, likelihoods 0.7/0.1", () => {
    expect(BDT_PAPER_DEFAULTS).toEqual({ prior: 0.3, selectIfHeld: 0.7, selectIfNotHeld: 0.1 });
    expect(bdtParamsSchema.safeParse(BDT_PAPER_DEFAULTS).success).toBe(true);
  });

  it("likelihoods must be strictly informative: selectIfHeld > selectIfNotHeld", () => {
    expect(bdtParamsSchema.safeParse({ prior: 0.3, selectIfHeld: 0.1, selectIfNotHeld: 0.7 }).success)
      .toBe(false);
    expect(bdtParamsSchema.safeParse({ prior: 0.3, selectIfHeld: 0.5, selectIfNotHeld: 0.5 }).success)
      .toBe(false); // equal is NOT strictly informative
  });
});

describe("DecayJobRun ledger row (V38 — at-most-once per window)", () => {
  it("accepts SCHEDULED and CATCH_UP rows with honest counts", () => {
    expect(
      decayJobRunSchema.safeParse({
        windowStart: "2026-10-04T03:00:00Z",
        executedAt: "2026-10-04T03:00:04.512Z",
        triggerKind: "SCHEDULED",
        decayed: 12,
        reviewsScheduled: 3,
      }).success,
    ).toBe(true);
    expect(
      decayJobRunSchema.safeParse({
        windowStart: "2026-10-03T03:00:00Z",
        executedAt: "2026-10-03T09:15:00Z",
        triggerKind: "CATCH_UP",
        decayed: 0, // a zero-decay night still writes its ledger row
        reviewsScheduled: 0,
      }).success,
    ).toBe(true);
    expect(
      decayJobRunSchema.safeParse({
        windowStart: T,
        executedAt: T,
        triggerKind: "RETRY",
        decayed: 0,
        reviewsScheduled: 0,
      }).success,
    ).toBe(false);
  });
});

describe("job events", () => {
  it("DecayAppliedEvent carries prior → decayed, band-frozen tauDays, threshold flag", () => {
    expect(
      decayAppliedEventSchema.safeParse({
        learnerId: UUID,
        nodeId: UUID,
        priorMastery: 0.62,
        decayedMastery: 0.5,
        daysSinceLastPractice: 21,
        tauDays: 90,
        reviewThresholdCrossed: false,
        occurredAt: T,
      }).success,
    ).toBe(true);
    expect(
      decayAppliedEventSchema.safeParse({
        learnerId: UUID,
        nodeId: UUID,
        priorMastery: 0.62,
        decayedMastery: 0.5,
        daysSinceLastPractice: 21.5, // whole days — Java long
        tauDays: 90,
        reviewThresholdCrossed: false,
        occurredAt: T,
      }).success,
    ).toBe(false);
  });

  it("ReviewScheduledEvent reason is the Reason enum name domain", () => {
    expect(
      reviewScheduledEventSchema.safeParse({
        learnerId: UUID,
        nodeId: UUID,
        dueAt: T,
        masteryAtTrigger: 0.55,
        reason: "DECAY_CROSSED_THRESHOLD",
        occurredAt: T,
      }).success,
    ).toBe(true);
    expect(
      reviewScheduledEventSchema.safeParse({
        learnerId: UUID,
        nodeId: UUID,
        dueAt: T,
        masteryAtTrigger: 0.55,
        reason: "decay-crossed-threshold",
        occurredAt: T,
      }).success,
    ).toBe(false);
  });
});

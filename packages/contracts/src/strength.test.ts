/**
 * F-184 strength-surface contract pins — acceptance = the strength law of
 * record (services/drill/strength.ts S1..S6) rendered honest on the wire.
 * Positive pins from the law's shapes, negative pins for rejected inputs,
 * and the honesty-law pins (semantics ride the payload; no engagement
 * counter exists; generatedAt discloses the read).
 */
import { describe, expect, it } from "bun:test";

import {
  practiceNowEntryViewSchema,
  strengthBarViewSchema,
  strengthQuerySchema,
  strengthResponseSchema,
  strengthSemanticsSchema,
  strengthSummarySchema,
} from "./strength";

const T = "2026-10-23T09:00:00.000Z";

const BAR = {
  code: "4CH1-1.25",
  anchor: 0.8,
  lastGradedAt: "2026-10-01T09:00:00.000Z",
  strength: 0.7533,
  band: "DEVELOPING",
  gradedCount: 5,
  ungradedCount: 1,
} as const;

const SEMANTICS = {
  formula: "Strength = mastery x decay",
  mastery: "the marks-weighted anchor of your graded drill evidence at this address",
  decay: "forgetting decay (Ebbinghaus): computed at read, never stored — ADR-031",
  notAGrade: "this bar is not a grade; it falls as skills decay and rises as you practise",
  bands: "LOW / DEVELOPING / SECURE — the learner-model band vocabulary",
  queue: "the practice-now queue lists your weakest decaying addresses, weakest first",
} as const;

describe("strengthQuerySchema", () => {
  it("binds the course query", () => {
    expect(strengthQuerySchema.safeParse({ course: "igcse-chemistry-19" }).success).toBe(true);
  });
  it("rejects a missing course", () => {
    expect(strengthQuerySchema.safeParse({}).success).toBe(false);
    expect(strengthQuerySchema.safeParse({ course: "" }).success).toBe(false);
  });
});

describe("strengthBarViewSchema", () => {
  it("accepts the law's bar shape", () => {
    expect(strengthBarViewSchema.safeParse(BAR).success).toBe(true);
  });
  it("rejects strengths outside [0,1] and unknown bands", () => {
    expect(strengthBarViewSchema.safeParse({ ...BAR, strength: 1.2 }).success).toBe(false);
    expect(strengthBarViewSchema.safeParse({ ...BAR, anchor: -0.1 }).success).toBe(false);
    expect(strengthBarViewSchema.safeParse({ ...BAR, band: "STRONG" }).success).toBe(false);
  });
  it("rejects non-integer evidence counts (the counts are row counts)", () => {
    expect(strengthBarViewSchema.safeParse({ ...BAR, gradedCount: 1.5 }).success).toBe(false);
  });
});

describe("practiceNowEntryViewSchema", () => {
  it("accepts a queue entry and rejects unknown bands", () => {
    expect(practiceNowEntryViewSchema.safeParse({ code: "4CH1-2.10", strength: 0.4, band: "LOW" }).success).toBe(true);
    expect(practiceNowEntryViewSchema.safeParse({ code: "4CH1-2.10", strength: 0.4, band: "secure" }).success).toBe(false);
  });
});

describe("strengthSemanticsSchema — the rendered law", () => {
  it("requires all six BAR_SEMANTICS strings", () => {
    expect(strengthSemanticsSchema.safeParse(SEMANTICS).success).toBe(true);
    const missing = { ...SEMANTICS } as Record<string, string>;
    delete missing.notAGrade;
    expect(strengthSemanticsSchema.safeParse(missing).success).toBe(false);
  });
});

describe("strengthSummarySchema — the honest absences", () => {
  it("accepts the summary counts", () => {
    expect(
      strengthSummarySchema.safeParse({
        drillableAddresses: 157,
        addressesWithEvidence: 3,
        ungradedOnlyAddresses: 1,
        bars: 2,
        queued: 2,
      }).success,
    ).toBe(true);
  });
  it("rejects fractional counts", () => {
    expect(
      strengthSummarySchema.safeParse({
        drillableAddresses: 157.5,
        addressesWithEvidence: 0,
        ungradedOnlyAddresses: 0,
        bars: 0,
        queued: 0,
      }).success,
    ).toBe(false);
  });
});

describe("strengthResponseSchema — the projection of record", () => {
  const response = {
    course: "igcse-chemistry-19",
    generatedAt: T,
    semantics: SEMANTICS,
    summary: {
      drillableAddresses: 157,
      addressesWithEvidence: 1,
      ungradedOnlyAddresses: 0,
      bars: 1,
      queued: 1,
    },
    bars: [BAR],
    queue: [{ code: "4CH1-1.25", strength: 0.7533, band: "DEVELOPING" }],
  };

  it("accepts the whole projection", () => {
    expect(strengthResponseSchema.safeParse(response).success).toBe(true);
  });
  it("the queue entry rides inside [0,1] with a band of record", () => {
    const bad = {
      ...response,
      queue: [{ code: "4CH1-1.25", strength: 2, band: "LOW" }],
    };
    expect(strengthResponseSchema.safeParse(bad).success).toBe(false);
  });
  it("an empty projection is honest (no bars, no queue, zeros)", () => {
    const empty = {
      ...response,
      summary: { drillableAddresses: 157, addressesWithEvidence: 0, ungradedOnlyAddresses: 0, bars: 0, queued: 0 },
      bars: [],
      queue: [],
    };
    expect(strengthResponseSchema.safeParse(empty).success).toBe(true);
  });
});

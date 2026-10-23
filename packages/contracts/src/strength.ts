/**
 * F-184 build — the decay-driven strength surface wire contracts (the
 * strength route + the learner-overview bar; tracker F-184, repo syllabai-v2).
 *
 * SPEC-NATIVE (not a frozen-port parity band — the DC-7 posture): the source
 * of record is the build-lane prereg docs/F184-DECAY-STRENGTH-BUILD-PLAN.md
 * (committed WITH the implementation it gates) under the product spec Kognity
 * dossier v1.1 Deep Dive D §8.3 (law 3) + §8.5 row 3: "Per-spec-point
 * strength display driven by learner state + computed decay (ADR-031: decay
 * computed, never persisted); the bar honestly falls as skills decay and
 * doubles as the practice-now queue at decaying addresses." Requirements of
 * record: ADR-031 decay engine; spec-point learner overlay; explicit
 * bar-semantics documentation; NO engagement-only component.
 *
 * Wire law of the shapes:
 *   - The response carries the SERVER's BAR_SEMANTICS strings (services/
 *     drill/strength.ts — the semantics of record). The client renders them
 *     verbatim and never re-derives them: the semantics are the API's law,
 *     not the surface's opinion.
 *   - ADR-031 in the wire: every strength number in a response was computed
 *     AT READ for that response (the generatedAt stamp discloses the read);
 *     nothing here is ever persisted — no strength table exists, the drill's
 *     store gains a read only.
 *   - Honest nulls ride the summary, not fabricated bars: an address with no
 *     GRADED evidence has no bar (law S4); ungraded-only addresses surface
 *     as ungradedOnlyAddresses. An engagement counter does not exist — the
 *     replaced overlay's "% engaged" fill is the named anti-pattern (law S3).
 */
import { z } from "zod";

import { masteryBandSchema } from "./learner";

// ── GET /api/v1/learners/me/drill/strengths?course=<slug> ───────────────────

export const strengthQuerySchema = z.object({
  course: z.string().min(1),
});
export type StrengthQuery = z.infer<typeof strengthQuerySchema>;

/** One address's bar — the strength law's AddressStrength + its address. */
export const strengthBarViewSchema = z.object({
  /** The spine spec-point address of record (drillable per the census). */
  code: z.string().min(1),
  /** Law S1: the marks-weighted anchor P0 over graded evidence. */
  anchor: z.number().min(0).max(1),
  /** Law Q3: the latest graded evidence timestamp — the anchor's decay clock. */
  lastGradedAt: z.string().min(1),
  /** Law S2: decayedMastery(P0, lastGradedAt, generatedAt) — computed at read, never persisted. */
  strength: z.number().min(0).max(1),
  /** Law S3: bandOf(strength) — re-banded on the DECAYED value. */
  band: masteryBandSchema,
  /** Graded rows that fed the anchor. */
  gradedCount: z.number().int().min(0),
  /** Ungraded (structured) rows present but never fabricated into mastery (law S4). */
  ungradedCount: z.number().int().min(0),
});
export type StrengthBarView = z.infer<typeof strengthBarViewSchema>;

/** One practice-now entry (law S5): a decaying address, weakest first. */
export const practiceNowEntryViewSchema = z.object({
  code: z.string().min(1),
  strength: z.number().min(0).max(1),
  band: masteryBandSchema,
});
export type PracticeNowEntryView = z.infer<typeof practiceNowEntryViewSchema>;

/**
 * The bar's semantics of record — the SERVER's BAR_SEMANTICS strings
 * verbatim (law S3: the surface renders them, never re-derives them).
 */
export const strengthSemanticsSchema = z.object({
  formula: z.string().min(1),
  mastery: z.string().min(1),
  decay: z.string().min(1),
  notAGrade: z.string().min(1),
  bands: z.string().min(1),
  queue: z.string().min(1),
});
export type StrengthSemantics = z.infer<typeof strengthSemanticsSchema>;

export const strengthSummarySchema = z.object({
  /** The census's drillable addresses (the bar's whole address space, law S6). */
  drillableAddresses: z.number().int().min(0),
  /** Drillable addresses carrying ANY evidence row. */
  addressesWithEvidence: z.number().int().min(0),
  /** Addresses whose evidence is ungraded-only (no bar — law S4's visible absence). */
  ungradedOnlyAddresses: z.number().int().min(0),
  bars: z.number().int().min(0),
  queued: z.number().int().min(0),
});
export type StrengthSummary = z.infer<typeof strengthSummarySchema>;

/**
 * The strength projection — one read-only GET over the drill's own evidence
 * lane. Every strength number was computed at `generatedAt` for THIS
 * response and nothing was persisted (ADR-031 computed-never-persisted).
 */
export const strengthResponseSchema = z.object({
  course: z.string().min(1),
  /** ISO-8601 — the `now` the read was computed at (injected clock, law Q9). */
  generatedAt: z.string().min(1),
  semantics: strengthSemanticsSchema,
  summary: strengthSummarySchema,
  /** Weakest first (strength asc, code asc tie-break — the S5 ordering). */
  bars: z.array(strengthBarViewSchema),
  /** Evidence-bearing addresses below reviewBelow (0.6), weakest first, capped at QUEUE_SIZE. */
  queue: z.array(practiceNowEntryViewSchema),
});
export type StrengthResponse = z.infer<typeof strengthResponseSchema>;

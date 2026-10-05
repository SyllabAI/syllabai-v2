/**
 * Decay-math + NightlyDecayJob I/O contracts — ported from the frozen Java
 * core (T-MIG-038, Step 2 of the operator's CONTRACTS-LANE directive trace
 * 1a10cb48dc7edd15).
 *
 * Sources (syllabai-core @ 6cad6ef, frozen, raw reads 2026-10-05):
 *   src/main/java/com/syllabai/learner/decay/DecayParams.java
 *       (:10-45 record + invariants, :55-68 bandOf)
 *   src/main/java/com/syllabai/learner/bkt/BktParams.java
 *       (record + invariants + paperDefaults :24-27)
 *   src/main/java/com/syllabai/learner/bdt/BdtParams.java
 *       (record + invariants + paperDefaults :17-19)
 *   src/main/java/com/syllabai/learner/NightlyDecayJob.java
 *       (@Scheduled applyForgettingDecay :96-124; SCHEDULED_GRACE :65;
 *         windowStart :131-140; the pass :142-186 — ADR-031 anchor law)
 *   src/main/java/com/syllabai/learner/DecayJobRun.java (V38 ledger)
 *   src/main/java/com/syllabai/shared/events/DecayAppliedEvent.java (:19-28)
 *   src/main/java/com/syllabai/shared/events/ReviewScheduledEvent.java (:19-26)
 *   src/main/java/com/syllabai/learner/LearnerProperties.java :112-127
 *       (Decay config record — defaults when <= 0)
 *
 * WHAT THIS FILE IS: the NightlyDecayJob's I/O contract. The MIGRATION_PLAN
 * §5 Wave-4 port maps the job to Vercel Cron ("NightlyDecayJob → Vercel
 * Cron; decay math is deterministic → golden-gated"), so its boundary
 * shapes are pinned here as contracts: the idempotency ledger row the cron
 * reads/writes (DecayJobRun), the events it publishes (DecayAppliedEvent,
 * ReviewScheduledEvent), and the versioned engine-parameter records the
 * cron's config must satisfy (DecayParams/BktParams/BdtParams — research-
 * design parameters, never hard-coded, per Master Spec §11).
 *
 * WHAT THIS FILE IS NOT: HTTP wire schemas. The learner-facing projections
 * of decayed state live in learner.ts (SkillStateView effectiveMastery,
 * MisconceptionStateView relaxed probability, review views) — the job's
 * own writes are ledger rows + events only. MisconceptionReading (the
 * engine read model wrapping the MisconceptionState ENTITY) is engine-
 * internal, not a DTO — its wire form is misconceptionStateViewSchema.
 * MasteryUpdatedEvent is attempt-flow (BKT update on evidence), NOT job
 * I/O — disclosed out of this card (T-MIG-030 lineage).
 *
 * THE ANCHOR LAW (ADR-031, the S1 bug): state.mastery() is the
 * post-practice BKT posterior P₀. Every pass recomputes
 * effective = decayed(P₀, lastPracticedAt, now, params) and NEVER writes
 * the decayed value back — persisting it would compound across nights.
 * τ is evaluated on P₀ (the band is frozen at practice time). The cron
 * port MUST reproduce this: read anchor → re-decay on read.
 */
import { z } from "zod";

// ── DecayParams (learner/decay/DecayParams.java) ────────────────────────────

/**
 * Ebbinghaus forgetting-curve parameters (Master Spec §11, Paper B: τ =
 * 30/90/365 days by proficiency band). Invariants (:25-38): taus positive;
 * 0 < lowBandCeiling < highBandFloor <= 1; 0 <= floor < reviewBelow <= 1.
 * Config defaults applied when <= 0 (LearnerProperties.Decay :113-126):
 * 30/90/365/0.45/0.8/0.1/0.6 — exported as the paper-defaults constant.
 */
export const DECAY_PAPER_DEFAULTS = {
  tauLowDays: 30,
  tauMidDays: 90,
  tauHighDays: 365,
  lowBandCeiling: 0.45,
  highBandFloor: 0.8,
  floor: 0.1,
  reviewBelow: 0.6,
} as const;

export const decayParamsSchema = z
  .object({
    tauLowDays: z.number().int(),
    tauMidDays: z.number().int(),
    tauHighDays: z.number().int(),
    lowBandCeiling: z.number(),
    highBandFloor: z.number(),
    floor: z.number(),
    reviewBelow: z.number(),
  })
  .superRefine((p, ctx) => {
    if (p.tauLowDays <= 0 || p.tauMidDays <= 0 || p.tauHighDays <= 0) {
      ctx.addIssue({ code: "custom", message: "tau values must be positive" });
    }
    if (!(0.0 < p.lowBandCeiling && p.lowBandCeiling < p.highBandFloor && p.highBandFloor <= 1.0)) {
      ctx.addIssue({
        code: "custom",
        message: "band thresholds must satisfy 0 < low < high <= 1",
      });
    }
    if (!(0.0 <= p.floor && p.floor < p.reviewBelow && p.reviewBelow <= 1.0)) {
      ctx.addIssue({ code: "custom", message: "floor must be < reviewBelow, both in [0,1]" });
    }
  });
export type DecayParams = z.infer<typeof decayParamsSchema>;

/** bandOf (:58-68): < lowBandCeiling → LOW; < highBandFloor → DEVELOPING; else SECURE. */
export const masteryBandValues = ["LOW", "DEVELOPING", "SECURE"] as const;

// ── BktParams (learner/bkt/BktParams.java) ──────────────────────────────────

/**
 * Bayesian Knowledge Tracing parameters. Every probability strictly in
 * (0,1) EXCLUSIVE (:36-46); degenerate guard (:33-37): l0+guess >= 1 AND
 * slip+guess >= 1 together can never distinguish knowledge states.
 * Paper B Cycle-1: L₀=0.1, slip=0.1, guess=0.25, T=0.1.
 */
export const BKT_PAPER_DEFAULTS = { l0: 0.1, slip: 0.1, guess: 0.25, learnRate: 0.1 } as const;

export const bktParamsSchema = z
  .object({
    l0: z.number(),
    slip: z.number(),
    guess: z.number(),
    learnRate: z.number(),
  })
  .superRefine((p, ctx) => {
    for (const [name, value] of Object.entries(p)) {
      if (value <= 0.0 || value >= 1.0) {
        ctx.addIssue({
          code: "custom",
          message: `BKT parameter ${name} must be in (0,1), got ${value}`,
        });
      }
    }
    if (p.l0 + p.guess >= 1.0 && p.slip + p.guess >= 1.0) {
      ctx.addIssue({
        code: "custom",
        message: "BKT params degenerate (L0+guess and slip+guess both >= 1)",
      });
    }
  });
export type BktParams = z.infer<typeof bktParamsSchema>;

// ── BdtParams (learner/bdt/BdtParams.java) ──────────────────────────────────

/**
 * Misconception-tracking (BDT) parameters. Probabilities strictly in (0,1);
 * the likelihoods must be strictly informative: selectIfHeld >
 * selectIfNotHeld (:30-33). Paper B prior 0.3; likelihoods are v0
 * heuristics pending calibration.
 */
export const BDT_PAPER_DEFAULTS = { prior: 0.3, selectIfHeld: 0.7, selectIfNotHeld: 0.1 } as const;

export const bdtParamsSchema = z
  .object({
    prior: z.number(),
    selectIfHeld: z.number(),
    selectIfNotHeld: z.number(),
  })
  .superRefine((p, ctx) => {
    for (const [name, value] of Object.entries(p)) {
      if (value <= 0.0 || value >= 1.0) {
        ctx.addIssue({
          code: "custom",
          message: `BDT parameter ${name} must be in (0,1), got ${value}`,
        });
      }
    }
    if (p.selectIfHeld <= p.selectIfNotHeld) {
      ctx.addIssue({
        code: "custom",
        message: "BDT likelihoods must be strictly informative: selectIfHeld > selectIfNotHeld",
      });
    }
  });
export type BdtParams = z.infer<typeof bdtParamsSchema>;

// ── the ledger row (DecayJobRun.java — V38) ─────────────────────────────────

/**
 * One row per executed forgetting-decay run; the run-if-missed checker's
 * idempotency ledger. windowStart (the 03:00-UTC-window anchor) is the
 * PRIMARY KEY — append-only, at-most-once per window (the PK doubles as
 * the concurrency guard: a racing second insert fails and rolls back).
 * triggerKind SCHEDULED = fired on the window tick; CATCH_UP = a late wake
 * completing a missed window (grace: 5 minutes, SCHEDULED_GRACE :65 —
 * within the grace a past-window tick still counts as SCHEDULED).
 */
export const DECAY_JOB_SCHEDULED_GRACE_MINUTES = 5;

export const decayJobRunSchema = z.object({
  windowStart: z.string() /* ISO-8601 UTC window anchor — the PK */,
  executedAt: z.string() /* == windowStart for an on-time SCHEDULED run */,
  triggerKind: z.enum(["SCHEDULED", "CATCH_UP"]),
  decayed: z.number().int(),
  reviewsScheduled: z.number().int(),
});
export type DecayJobRun = z.infer<typeof decayJobRunSchema>;

// ── events the job publishes ────────────────────────────────────────────────

/**
 * DecayAppliedEvent (:19-28) — one (learner, node) mastery estimate
 * decayed. decayedMastery never below the configured floor; tauDays is
 * the band-frozen τ used (30/90/365); the research module persists a
 * DECAY_APPLIED telemetry row by observing this event.
 */
export const decayAppliedEventSchema = z.object({
  learnerId: z.string().uuid(),
  nodeId: z.string().uuid(),
  priorMastery: z.number(),
  decayedMastery: z.number(),
  daysSinceLastPractice: z.number().int(),
  tauDays: z.number().int(),
  reviewThresholdCrossed: z.boolean(),
  occurredAt: z.string(),
});
export type DecayAppliedEvent = z.infer<typeof decayAppliedEventSchema>;

/**
 * ReviewScheduledEvent (:19-26) — published by the job when a decayed
 * mastery crosses reviewBelow AND no PENDING review exists for the
 * (learner, node) pair (:178-184); reason serializes
 * ReviewSchedule.Reason.name() (DECAY_CROSSED_THRESHOLD from this job;
 * TEACHER_ASSIGNED exists in the domain for the teacher flow).
 */
export const reviewScheduledEventSchema = z.object({
  learnerId: z.string().uuid(),
  nodeId: z.string().uuid(),
  dueAt: z.string(),
  masteryAtTrigger: z.number(),
  reason: z.enum(["DECAY_CROSSED_THRESHOLD", "TEACHER_ASSIGNED"]),
  occurredAt: z.string(),
});
export type ReviewScheduledEvent = z.infer<typeof reviewScheduledEventSchema>;

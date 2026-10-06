/**
 * The canonical learner-model decay/BDT pure math (T-MIG-066 — the 043
 * consolidation band, R0 ruling of record @ 2d5a73d).
 *
 * ONE owner for the read-time learner-model math the frozen core shares
 * across surfaces (LearnerStateController, LearnerAgendaController, and the
 * NBA engine all compose the same LearnerProperties laws): bandOf
 * (DecayParams.bandOf :58-68), decayedMastery (EbbinghausDecayService.decayed
 * :29-40), relaxedToPrior (BdtEngine), and the two paper-default objects.
 *
 * PROVENANCE (moved verbatim, byte-matched laws): this file is the former
 * `services/learner/state.ts` block (the T-MIG-041 tranche-1 copy). The NBA
 * engine's per-module structural-seam copy (the former
 * `services/learner-me/nba.ts` NBA_-prefixed duplicates — a line-against-line
 * match, R0-verified zero behavioral divergence before consolidation) is
 * RETIRED into these names; every consumer re-points its import and no pin
 * semantics change.
 *
 * ADR-031 anchor law unchanged: all of this is READ-TIME math — decay,
 * relaxation and banding are recomputed from the stored anchors on every
 * call and NEVER persisted.
 */

/** DecayParams.paperDefaults() — mirrors contracts/src/decay.ts (T-MIG-038 #60). */
export interface LearnerDecayParams {
  tauLowDays: number; // 30
  tauMidDays: number; // 90
  tauHighDays: number; // 365
  lowBandCeiling: number; // 0.45
  highBandFloor: number; // 0.8
  floor: number; // 0.1 (= BKT L0)
  reviewBelow: number; // 0.6
}

/** LearnerProperties.Bdt normalization (LearnerProperties.java, Bdt record). */
export interface LearnerBdtParams {
  prior: number; // 0.3
  selectIfHeld: number; // 0.7 (unused on the read path — write-path BDT)
  selectIfNotHeld: number; // 0.1 (unused on the read path)
  activeThreshold: number; // 0.5
  stalenessTauDays: number; // 180
}

export const LEARNER_DECAY_PAPER_DEFAULTS: LearnerDecayParams = {
  tauLowDays: 30,
  tauMidDays: 90,
  tauHighDays: 365,
  lowBandCeiling: 0.45,
  highBandFloor: 0.8,
  floor: 0.1,
  reviewBelow: 0.6,
};

export const LEARNER_BDT_PAPER_DEFAULTS: LearnerBdtParams = {
  prior: 0.3,
  selectIfHeld: 0.7,
  selectIfNotHeld: 0.1,
  activeThreshold: 0.5,
  stalenessTauDays: 180,
};

const DAY_MS = 86_400_000;

function clamp01(v: number): number {
  return Math.max(0.0, Math.min(1.0, v));
}

/** DecayParams.tauFor (:59-68) — the band the given mastery falls into. */
function tauFor(mastery: number, p: LearnerDecayParams): number {
  if (mastery < p.lowBandCeiling) return p.tauLowDays;
  if (mastery < p.highBandFloor) return p.tauMidDays;
  return p.tauHighDays;
}

/** DecayParams.bandOf (:58-68): < lowBandCeiling -> LOW; < highBandFloor -> DEVELOPING; else SECURE. */
export function bandOf(mastery: number, p: LearnerDecayParams): "LOW" | "DEVELOPING" | "SECURE" {
  if (mastery < p.lowBandCeiling) return "LOW";
  if (mastery < p.highBandFloor) return "DEVELOPING";
  return "SECURE";
}

/**
 * EbbinghausDecayService.decayed (:29-40): P(t) = P0 * e^(-t/tau); tau frozen
 * on the STORED P0 (ADR-031 — "callers MUST pass the stored post-practice
 * posterior"); the result never drops below the floor; recomputed from the
 * anchor on every call and never persisted.
 */
export function decayedMastery(
  mastery: number,
  lastPracticedAt: Date,
  now: Date,
  p: LearnerDecayParams,
): number {
  if (!(now.getTime() > lastPracticedAt.getTime())) return clamp01(mastery);
  const elapsedMs = now.getTime() - lastPracticedAt.getTime();
  const tauMs = tauFor(mastery, p) * DAY_MS;
  const decayed = mastery * Math.exp(-elapsedMs / tauMs);
  return Math.max(p.floor, clamp01(decayed));
}

/**
 * BdtEngine.relaxedToPrior: effective = prior + (P_e - prior) * e^(-age/tau_s);
 * fresh or clock-skewed evidence returns the full posterior; ns precision in
 * the core (see the precision note in the former state.ts copy — the wire
 * never rounds these).
 */
export function relaxedToPrior(
  posterior: number,
  prior: number,
  lastEvidenceAt: Date,
  now: Date,
  stalenessTauDays: number,
): number {
  if (stalenessTauDays <= 0) {
    throw new Error("staleness tau must be positive, got " + stalenessTauDays);
  }
  const p = clamp01(posterior);
  const base = clamp01(prior);
  if (!(now.getTime() > lastEvidenceAt.getTime())) return p;
  const ageMs = now.getTime() - lastEvidenceAt.getTime();
  const tauMs = stalenessTauDays * DAY_MS;
  const relaxed = base + (p - base) * Math.exp(-ageMs / tauMs);
  return clamp01(relaxed);
}

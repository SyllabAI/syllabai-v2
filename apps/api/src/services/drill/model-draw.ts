/**
 * F-185 — the model-driven drill draw: information-maximizing selection over
 * the learner's read-only state (BKT/decay-informed; tracker F-185, repo
 * syllabai-v2, deps F-182 / F-184 / F-138 / F-139 / F-055).
 *
 * Spec of record: docs/F185-MODEL-DRIVEN-DRAW-PLAN.md (committed WITH this
 * implementation per the #216/#225/#229/#232/DC-4/F182/F183/F184 pattern);
 * product spec = Kognity dossier v1.1 Deep Dive D §8.5 row 4 (tracker F-185):
 * "the 5-part draw is BKT/decay-informed — select parts that maximize
 * evidence on the weakest, most-decayed skills at the address (random
 * fallback when the learner state is sparse). Retakes target gaps instead of
 * re-rolling dice; the smallest possible surface on which the adaptivity
 * vacuum gets closed."
 *
 * THE LAWS (M1..M8 — pinned by apps/api/test/drill/model-draw.test.ts):
 *   M1  READ-ONLY LEARNER READING — every learner number is computed AT READ
 *       from the drill's own immutable evidence rows (ADR-031 verbatim: decay
 *       computed, never persisted; no learner-state table exists, none is
 *       added; `now` is an explicit argument — no clock in this module).
 *   M2  THE READING OF RECORD — per code, the F-184 strength law composed,
 *       not re-adjudicated: the S1 marks-weighted anchor (masteryAnchor) and
 *       the S2 decayed strength (decayedMastery from THE ONE decay-math
 *       owner). Evidence-bearing codes carry their decayed strength; codes
 *       without graded evidence are UNEXPLORED (an honest posture — not
 *       weak, not secure: unknown).
 *   M3  THE INFORMATION PROXY OF RECORD — at one address every candidate
 *       carries the address code, so the DISCRIMINATING signal is the part's
 *       secondary codes: I(part) = sum over c in codes(part) \ {address} of
 *       u(c), where u(c) = 1 - strength(c) for evidence-bearing codes and
 *       UNEXPLORED_WEIGHT for unexplored ones. This is a disclosed PROXY,
 *       not BKT information gain: the BKT posterior read is F-138's title
 *       (this reading seam is its upgrade path — swap the reading, the
 *       policy is untouched) and F-139 calibrates it.
 *   M4  SPARSE-STATE FALLBACK — below SPARSE_EVIDENCE_FLOOR graded evidence
 *       rows in the course, the learner state is unmodelled and the F-182
 *       random draw law P1..P6 serves verbatim (drawForAddress), disclosed
 *       as selection policy "random" + sparseFallback true. The law refuses
 *       to model from nothing.
 *   M5  EXPLORATION FLOOR — EXPLORATION_SLOTS of the DRAW_SIZE slots are
 *       uniform-random over the fresh pool (seeded): coverage stays honest
 *       and the policy stays unpredictable even at full evidence.
 *   M6  ANTI-GAMING — determinism P5 holds EXTENDED by the reading:
 *       (bank, address, recency, reading, seed) -> exactly one draw, and
 *       the reading is a pure function of the immutable evidence rows + now
 *       (both reconstructible from the audit). The seed of record stays a
 *       fresh per-draw seed (retakes re-seed — P5 verbatim), so the model's
 *       picks cannot be replayed or farmed; the response carries the POLICY
 *       used, never a learner-state number.
 *   M7  LATENCY BUDGET — the selection is pure synchronous arithmetic over
 *       the already-fetched bank + evidence projection: no await, no LLM
 *       call, no store round-trip inside the selection. The draw path's only
 *       reads remain the recency + evidence SELECTs the lane already
 *       performs (the evidence read is the F-184 strengths projection's own
 *       SELECT — one query, the drill's own table).
 *   M8  ZERO STAKES (P6 verbatim) — this module SELECTS; it writes nothing,
 *       emits no gradebook event, persists no decay, no skill state, no
 *       policy outcome beyond the draw audit row the surface already
 *       records.
 *
 * Dependency posture (the F-184 opening's disclosed precedent): F-138 (BKT
 * Engine), F-139 (BKT Calibration & Simulation) and F-055 (Question Attempt
 * Logger) are Not Started tracker rows whose SUBSTANCE this lane composes,
 * not re-adjudicates — the reading of record is the F-184 strength law over
 * the F-182 build's drill_part_evidence seam (the F-055 SHAPE, ADR-016);
 * the BKT posterior read swaps in behind the same seam when F-138 lands.
 */
import type { DrillDrawSelection } from "@syllabai/contracts";

import { LEARNER_DECAY_PAPER_DEFAULTS, type LearnerDecayParams } from "../learner-model/decay";
import type { DrillPart } from "./census";
import { DrillDrawError, DRAW_SIZE, mulberry32 } from "./draw";
import { addressStrength, type StrengthEvidenceRow } from "./strength";

/**
 * Q3 — the unexplored code's weight of record. An unexplored code's true
 * weakness is unknown; 0.5 is the honest midpoint (not assumed weak, not
 * assumed secure) — its exploration value is real but must never masquerade
 * as modeled weakness.
 */
export const UNEXPLORED_WEIGHT = 0.5;

/**
 * Q4 — the sparse-state floor of record: fewer than this many GRADED
 * evidence rows in the course and the state is unmodelled (law M4 — the
 * random law serves, disclosed).
 */
export const SPARSE_EVIDENCE_FLOOR = 5;

/** Q5 — the exploration floor of record: model draws always contain this many uniform-random slots (law M5). */
export const EXPLORATION_SLOTS = 1;

/** One drill evidence row as the reading reads it — the store's projection column shape (DrillEvidenceKeyRow). */
export interface ReadingEvidenceRow {
  readonly code: string;
  readonly partId: string;
  /** null = ungraded (structured rows — the seam refuses to invent marks). */
  readonly marksAwarded: number | null;
  readonly marksPossible: number;
  /** The immutable row's write time (ISO-8601) — the decay clock input. */
  readonly createdAt: string;
}

/** One code's learner reading: the decayed strength, or null when unexplored (law M2). */
export interface CodeReading {
  /** The F-184 S2 decayed strength at read — null when the code holds no graded evidence (unexplored). */
  readonly strength: number | null;
  readonly gradedCount: number;
  readonly ungradedCount: number;
}

/**
 * Law M1/M2 — the learner reading of record: the course's evidence rows
 * grouped by code, each code read through the F-184 strength law verbatim
 * (masteryAnchor S1 + decayedMastery S2 at the explicit now). Pure: same
 * (rows, now) -> the same reading. A code with zero graded evidence reads
 * strength null (UNEXPLORED — never fabricated, the S4 posture).
 */
export function learnerReading(
  rows: readonly ReadingEvidenceRow[],
  now: Date,
  params: LearnerDecayParams = LEARNER_DECAY_PAPER_DEFAULTS,
): Map<string, CodeReading> {
  const byCode = new Map<string, StrengthEvidenceRow[]>();
  for (const row of rows) {
    const bucket = byCode.get(row.code);
    const shaped: StrengthEvidenceRow = {
      partId: row.partId,
      marksAwarded: row.marksAwarded,
      marksPossible: row.marksPossible,
      gradedAt: row.createdAt,
    };
    if (bucket) bucket.push(shaped);
    else byCode.set(row.code, [shaped]);
  }
  const reading = new Map<string, CodeReading>();
  for (const [code, codeRows] of byCode) {
    const s = addressStrength(codeRows, now, params);
    reading.set(
      code,
      s === null
        ? { strength: null, gradedCount: 0, ungradedCount: codeRows.length }
        : { strength: s.strength, gradedCount: s.gradedCount, ungradedCount: s.ungradedCount },
    );
  }
  return reading;
}

/** Law M4 — sparse = fewer than SPARSE_EVIDENCE_FLOOR graded rows across the whole course reading. */
export function sparseState(reading: ReadonlyMap<string, CodeReading>): boolean {
  let graded = 0;
  for (const r of reading.values()) graded += r.gradedCount;
  return graded < SPARSE_EVIDENCE_FLOOR;
}

/**
 * Law M2/M3 — the information weight of one code: 1 - decayed strength for
 * evidence-bearing codes (weak + decayed = most informative), the
 * UNEXPLORED_WEIGHT of record for unexplored ones.
 */
export function informationWeight(code: string, reading: ReadonlyMap<string, CodeReading>): number {
  const r = reading.get(code);
  if (!r || r.strength === null) return UNEXPLORED_WEIGHT;
  return 1 - r.strength;
}

/**
 * Law M3 — the information proxy of record for one candidate part at one
 * address: the sum of the secondary codes' weights (the address code itself
 * is shared by every candidate and cannot discriminate).
 */
export function partInformation(
  part: DrillPart,
  code: string,
  reading: ReadonlyMap<string, CodeReading>,
): number {
  let sum = 0;
  for (const c of part.specPointCodes) {
    if (c === code) continue;
    sum += informationWeight(c, reading);
  }
  return sum;
}

/** The model draw result: the P1..P6-era draw facts plus the policy disclosure. */
export interface ModelDrawResult {
  readonly code: string;
  readonly parts: readonly DrillPart[];
  readonly poolSize: number;
  readonly freshPoolSize: number;
  /** True when the thin-pool fallback (P4) drew from the full pool. */
  readonly usedFallback: boolean;
  readonly seed: number;
  readonly selection: DrillDrawSelection;
}

/** The sparse-state disclosure for the random path (law M4): the P1..P6 law served verbatim. */
export const RANDOM_SELECTION: DrillDrawSelection = {
  policy: "random",
  sparseFallback: true,
  explorationSlots: 0,
};

/**
 * The model-driven draw at one spec-point address (laws M1..M8; policies P3
 * floor + P4 recency/fallback + P5 determinism + P6 zero-stakes verbatim).
 * Pure and synchronous: same (parts, code, recentPartIds, evidenceRows, now,
 * seed) -> exactly the same ModelDrawResult. Throws DrillDrawError below the
 * floor (P3 verbatim — the composer maps it to 409 exactly as the random
 * law's).
 */
export function modelDrawForAddress(
  parts: readonly DrillPart[],
  code: string,
  recentPartIds: readonly string[],
  evidenceRows: readonly ReadingEvidenceRow[],
  now: Date,
  seed: number,
  params: LearnerDecayParams = LEARNER_DECAY_PAPER_DEFAULTS,
  floor: number = DRAW_SIZE,
): ModelDrawResult {
  const reading = learnerReading(evidenceRows, now, params);
  return modelDrawForReading(parts, code, recentPartIds, reading, seed, floor);
}

/**
 * The draw over an ALREADY-COMPUTED reading — the composer's entry point
 * (the reading is built once per request and shared with the sparse law).
 * Same laws; the reading is trusted to be the caller's M1/M2 product.
 */
export function modelDrawForReading(
  parts: readonly DrillPart[],
  code: string,
  recentPartIds: readonly string[],
  reading: ReadonlyMap<string, CodeReading>,
  seed: number,
  floor: number = DRAW_SIZE,
): ModelDrawResult {
  const pool = parts.filter((p) => p.specPointCodes.includes(code));
  if (pool.length < floor) throw new DrillDrawError(code, pool.length, floor);

  const recent = new Set(recentPartIds);
  const fresh = pool.filter((p) => !recent.has(p.partId));
  const bank = fresh.length >= floor ? fresh : pool;
  const usedFallback = fresh.length < floor;

  // P5 determinism: pin the order before any selection so ingestion order
  // can never leak into a draw; the information ordering is the tie-broken
  // (score desc, partId asc) total order.
  const ordered = [...bank].sort((a, b) => {
    const ia = partInformation(a, code, reading);
    const ib = partInformation(b, code, reading);
    if (ia !== ib) return ia > ib ? -1 : 1;
    return a.partId < b.partId ? -1 : a.partId > b.partId ? 1 : 0;
  });

  // Law M5: the exploration slots — distinct uniform-random indices over the
  // ordered fresh pool (the seeded stream; distinct because a slot picked
  // twice is still one slot).
  const rand = mulberry32(seed);
  const explorationCount = Math.min(EXPLORATION_SLOTS, ordered.length);
  const explorationIdx: number[] = [];
  while (explorationIdx.length < explorationCount) {
    const idx = Math.floor(rand() * ordered.length);
    if (!explorationIdx.includes(idx)) explorationIdx.push(idx);
  }

  // Greedy fill: the top-ordered parts not already explored, in order.
  const pickedIdx = [...explorationIdx];
  for (let i = 0; i < ordered.length && pickedIdx.length < floor; i += 1) {
    if (!explorationIdx.includes(i)) pickedIdx.push(i);
  }
  const picked = pickedIdx.slice(0, floor).map((i) => ordered[i]!);

  // P5 presentation parity: the picked set is shuffled with the same stream
  // (the random law shuffles before slicing; the model law shuffles after
  // picking — same posture: presentation order carries no information).
  for (let i = picked.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = picked[i]!;
    picked[i] = picked[j]!;
    picked[j] = tmp;
  }

  return {
    code,
    parts: picked,
    poolSize: pool.length,
    freshPoolSize: fresh.length,
    usedFallback,
    seed,
    selection: { policy: "model", sparseFallback: false, explorationSlots: explorationCount },
  };
}

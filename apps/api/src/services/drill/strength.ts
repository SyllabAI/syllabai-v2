/**
 * F-184 opening — the decay-driven strength law over the drill address
 * space (pure, read-only foundation).
 *
 * Spec of record: docs/F184-DECAY-STRENGTH-PLAN.md (preregistered with this
 * implementation per the #216/#225/#229/#232/DC-4/F182/F183 pattern); product
 * spec = Kognity dossier v1.1 Deep Dive D §8.3 (law 3) + §8.5 (tracker
 * F-184): "Per-spec-point strength display driven by learner state + computed
 * decay (ADR-031: decay computed, never persisted); the bar honestly falls as
 * skills decay and doubles as the practice-now queue at decaying addresses."
 *
 * The laws (each pinned by apps/api/test/drill/strength.test.ts):
 *   S1  ANCHOR — an address's mastery anchor P0 is the marks-weighted mean of
 *       the learner's GRADED drill evidence at the address (the immutable
 *       drill_part_evidence rows; graded = marksAwarded != null, which the
 *       evidence seam guarantees is exactly the server-graded MCQ rows —
 *       structured rows stay ungraded, "null, never invented"). Impossible
 *       rows (awarded > possible, negative marks) fail closed.
 *   S2  DECAY-AT-READ (ADR-031) — the displayed strength is
 *       decayedMastery(P0, lastGradedAt, now, paper defaults) from THE ONE
 *       decay-math owner (services/learner-model/decay.ts): tau frozen on the
 *       anchor's band, floor 0.1, recomputed from the anchor on every call
 *       and NEVER persisted (no strength table exists; this opening adds
 *       none). `now` is an explicit argument — there is no clock in this
 *       module (the injected-clock posture of the drill serve layer).
 *   S3  HONEST BANDS — the band of the bar is bandOf(strength) in the
 *       learner-model vocabulary (LOW / DEVELOPING / SECURE); the bar's
 *       semantics of record are the BAR_SEMANTICS strings (mastery x decay,
 *       not-a-grade) — NO engagement component anywhere (the replaced
 *       overlay's "engaged %" fill is the named anti-pattern).
 *   S4  HONEST NULL — zero graded evidence at an address means NO bar
 *       (strength null, never fabricated); ungraded structured evidence is
 *       disclosed as a count and contributes nothing to mastery.
 *   S5  PRACTICE-NOW QUEUE — the same per-address strengths feed the queue:
 *       evidence-bearing addresses whose strength sits below reviewBelow
 *       (the decay params' 0.6 of record), weakest first (strength asc, code
 *       asc tie-break), capped at QUEUE_SIZE. Deterministic end to end.
 *   S6  ZERO-STAKES / NO-WRITE — this module SELECTS and DISPLAYS; it takes
 *       no store, no SqlFn, writes nothing, emits no gradebook event, and
 *       reads no progress-bearing surface. Its address space is the drill
 *       census of record's drillable addresses (the anchor-law adjacency:
 *       the bar exists only where the drill ships).
 *
 * Course scoping: evidence rows are (course, code)-keyed; the caller scopes
 * per course exactly as the drill routers do — this layer is code-keyed and
 * course-agnostic by construction.
 */
import {
  LEARNER_DECAY_PAPER_DEFAULTS,
  bandOf,
  decayedMastery,
  type LearnerDecayParams,
} from "../learner-model/decay";

/** The bar's semantics of record — the strings the surface must render (law S3). */
export const BAR_SEMANTICS = {
  formula: "Strength = mastery x decay",
  mastery: "the marks-weighted anchor of your graded drill evidence at this address",
  decay: "forgetting decay (Ebbinghaus): computed at read, never stored — ADR-031",
  notAGrade: "this bar is not a grade; it falls as skills decay and rises as you practise",
  bands: "LOW / DEVELOPING / SECURE — the learner-model band vocabulary",
  queue: "the practice-now queue lists your weakest decaying addresses, weakest first",
} as const;

/** The practice-now queue cap of record (law S5). */
export const QUEUE_SIZE = 10;

/**
 * One drill evidence row as the strength law reads it — the projection of an
 * immutable drill_part_evidence row (the build PR's reader maps the columns;
 * this opening is pure over the shape).
 */
export interface StrengthEvidenceRow {
  readonly partId: string;
  /** null = ungraded (structured parts — the seam refuses to invent marks). */
  readonly marksAwarded: number | null;
  readonly marksPossible: number;
  /** ISO-8601 timestamp of the immutable evidence row (the decay clock input). */
  readonly gradedAt: string;
}

/** Law S1: graded = the server-graded rows (marksAwarded present, positive marksPossible). */
export function isGraded(row: StrengthEvidenceRow): boolean {
  return row.marksAwarded !== null && Number.isFinite(row.marksPossible) && row.marksPossible > 0;
}

/**
 * Law S1 — the marks-weighted mastery anchor over an address's evidence:
 * P0 = sum(marksAwarded) / sum(marksPossible) across GRADED rows. Null when
 * the address holds no graded evidence (law S4). Fail-closed on impossible
 * rows (awarded > possible, negative marks): the evidence plane is immutable
 * and of record — an impossible row is corruption, not a number to average.
 */
export function masteryAnchor(rows: readonly StrengthEvidenceRow[]): number | null {
  let awarded = 0;
  let possible = 0;
  for (const row of rows) {
    if (!isGraded(row)) continue;
    if (row.marksAwarded === null) continue; // narrowed by isGraded; keeps tsc exact
    if (row.marksAwarded < 0 || row.marksPossible < 0 || row.marksAwarded > row.marksPossible) {
      throw new Error(
        `impossible evidence row for part ${row.partId}: awarded=${row.marksAwarded} possible=${row.marksPossible}`,
      );
    }
    awarded += row.marksAwarded;
    possible += row.marksPossible;
  }
  if (possible <= 0) return null;
  return awarded / possible;
}

/** The bar of one address: anchor + decayed strength + band + disclosed counts (laws S2..S4). */
export interface AddressStrength {
  /** The S1 anchor P0 (marks-weighted, graded rows only). */
  readonly anchor: number;
  /** The latest graded evidence timestamp — the anchor's decay clock. */
  readonly lastGradedAt: string;
  /** decayedMastery(P0, lastGradedAt, now) — computed at read, never persisted (S2). */
  readonly strength: number;
  /** bandOf(strength) in the learner-model vocabulary (S3). */
  readonly band: "LOW" | "DEVELOPING" | "SECURE";
  /** Graded rows that fed the anchor. */
  readonly gradedCount: number;
  /** Ungraded (structured) rows present but never fabricated into mastery (S4). */
  readonly ungradedCount: number;
}

/**
 * Law S2/S3/S4 — the strength of one address, or null when there is no
 * graded evidence to show (an honest absence, never a fabricated bar).
 * Pure: same (rows, now) -> the same value; `now` is the only clock.
 */
export function addressStrength(
  rows: readonly StrengthEvidenceRow[],
  now: Date,
  params: LearnerDecayParams = LEARNER_DECAY_PAPER_DEFAULTS,
): AddressStrength | null {
  const graded = rows.filter(isGraded);
  if (graded.length === 0) return null;

  const anchor = masteryAnchor(graded);
  if (anchor === null) return null; // unreachable by construction; keeps the contract exact

  let lastGradedAt = graded[0]!.gradedAt;
  for (const row of graded) {
    if (row.gradedAt > lastGradedAt) lastGradedAt = row.gradedAt;
  }

  const strength = decayedMastery(anchor, new Date(lastGradedAt), now, params);
  return {
    anchor,
    lastGradedAt,
    strength,
    band: bandOf(strength, params),
    gradedCount: graded.length,
    ungradedCount: rows.length - graded.length,
  };
}

/** One practice-now entry: a decaying address and its strength of record. */
export interface PracticeNowEntry {
  readonly code: string;
  readonly strength: number;
  readonly band: "LOW" | "DEVELOPING" | "SECURE";
}

/**
 * Law S5 — the practice-now queue: evidence-bearing addresses whose strength
 * sits below reviewBelow, weakest first (strength ascending, code ascending
 * tie-break), capped at QUEUE_SIZE. Addresses with no graded evidence are
 * unexplored, not decaying — they never enter this queue (law S4's posture).
 */
export function practiceNowQueue(
  rowsByCode: ReadonlyMap<string, readonly StrengthEvidenceRow[]>,
  now: Date,
  params: LearnerDecayParams = LEARNER_DECAY_PAPER_DEFAULTS,
): PracticeNowEntry[] {
  const entries: PracticeNowEntry[] = [];
  for (const [code, rows] of [...rowsByCode.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const s = addressStrength(rows, now, params);
    if (s === null) continue;
    if (s.strength < params.reviewBelow) {
      entries.push({ code, strength: s.strength, band: s.band });
    }
  }
  entries.sort((a, b) =>
    a.strength === b.strength ? (a.code < b.code ? -1 : a.code > b.code ? 1 : 0) : a.strength - b.strength,
  );
  return entries.slice(0, QUEUE_SIZE);
}

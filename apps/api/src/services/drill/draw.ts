/**
 * F-182 opening — the 5-part randomized drill draw (pure selection).
 *
 * Spec of record: docs/F182-DRILL-SURFACE-PLAN.md; product spec = Kognity
 * dossier v1.1 Deep Dive D §8.5 row 1 (tracker F-182): "5-part randomized
 * draw keyed to the spec-point address … zero stakes, always available,
 * retakable (fresh draw). Ships only where spec-tagging exists."
 *
 * Opening-scope policy decisions (each disclosed in the plan doc §4):
 *   P1  draw unit = PART (the filed row says "5-part randomized draw")
 *   P2  address = one spine spec-point code
 *   P3  fail-closed floor: an address is drillable iff its pool holds >= 5
 *       anchored parts; below the floor the surface does not offer a drill
 *   P4  naive recency dedupe: recently-seen parts are excluded when the
 *       fresh pool still covers a full draw; on thin pools the retake draws
 *       from the full pool (retakability beats strict exclusion)
 *   P5  determinism: (seed, recency, bundle) -> exactly one draw; retake =
 *       new seed; the shuffle is Fisher-Yates over a part-id-sorted copy so
 *       ingestion order can never leak into a draw
 *   P6  zero stakes by construction: this module SELECTS; it writes nothing,
 *       emits no gradebook event, and touches no clock
 *
 * Non-goals (later build PRs, not this opening): endpoints + zod contracts
 * (contracts-first law applies when the route lands), attempt-evidence
 * emission (the F-055-shaped seam), instant MS reveal (F-183), the strength
 * surface (F-184), model-driven draw (F-185), battles (F-186).
 */
import type { DrillPart } from "./census";

/** The fixed drill format (Deep Dive D §8.1: the 5-question habit). */
export const DRAW_SIZE = 5;

/** Deterministic, dependency-free PRNG (mulberry32). Same seed -> same stream. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The address pools of the bank: code -> its anchored parts (a multi-code part rides in several pools). */
export function poolsByCode(parts: readonly DrillPart[]): Map<string, DrillPart[]> {
  const pools = new Map<string, DrillPart[]>();
  for (const part of parts) {
    for (const code of part.specPointCodes) {
      const pool = pools.get(code);
      if (pool) pool.push(part);
      else pools.set(code, [part]);
    }
  }
  return pools;
}

/** Addresses that clear the fail-closed floor (the surface offers these). */
export function drillableAddresses(parts: readonly DrillPart[], floor: number = DRAW_SIZE): string[] {
  const pools = poolsByCode(parts);
  return [...pools.entries()]
    .filter(([, pool]) => pool.length >= floor)
    .map(([code]) => code)
    .sort();
}

/** The draw refused: the address exists but cannot serve a full drill (policy P3). */
export class DrillDrawError extends Error {
  constructor(code: string, poolSize: number, floor: number) {
    super(`address ${code} is below the drillable floor: pool=${poolSize} < ${floor}`);
    this.name = "DrillDrawError";
  }
}

export interface DrawResult {
  readonly code: string;
  /** The drawn parts, in presentation order. */
  readonly parts: readonly DrillPart[];
  /** The full pool size at the address (before recency filtering). */
  readonly poolSize: number;
  /** The pool size after excluding recently-seen parts. */
  readonly freshPoolSize: number;
  /** True when the thin-pool fallback (P4) drew from the full pool. */
  readonly usedFallback: boolean;
  readonly seed: number;
}

/**
 * One 5-part draw at a spec-point address (policies P1..P5). Pure: same
 * (parts, code, recentPartIds, seed) -> exactly the same DrawResult.
 */
export function drawForAddress(
  parts: readonly DrillPart[],
  code: string,
  recentPartIds: readonly string[],
  seed: number,
  floor: number = DRAW_SIZE,
): DrawResult {
  const pool = parts.filter((p) => p.specPointCodes.includes(code));
  if (pool.length < floor) throw new DrillDrawError(code, pool.length, floor);

  const recent = new Set(recentPartIds);
  const fresh = pool.filter((p) => !recent.has(p.partId));
  const bank = fresh.length >= floor ? fresh : pool;
  const usedFallback = fresh.length < floor;

  // Determinism (P5): pin the order before shuffling so bundle ingestion
  // order can never leak into a draw.
  const ordered = [...bank].sort((a, b) => (a.partId < b.partId ? -1 : a.partId > b.partId ? 1 : 0));
  const rand = mulberry32(seed);
  for (let i = ordered.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = ordered[i];
    const swap = ordered[j];
    // Both indices are in bounds by construction (0 <= j <= i < length).
    if (tmp === undefined || swap === undefined) continue;
    ordered[i] = swap;
    ordered[j] = tmp;
  }

  return {
    code,
    parts: ordered.slice(0, floor),
    poolSize: pool.length,
    freshPoolSize: fresh.length,
    usedFallback,
    seed,
  };
}

/**
 * F-184 build — the strength serve layer: the read-only projection that
 * composes THE strength law of record (services/drill/strength.ts, laws
 * S1..S6 untouched — this file adds zero new strength or decay math) with
 * the bank's census address space and the store's evidence read.
 *
 * Prereg of record: docs/F184-DECAY-STRENGTH-BUILD-PLAN.md (committed WITH
 * this implementation). Laws that bind here:
 *   S2/ADR-031 — decay computed at read, never persisted: this layer takes
 *     `now` as an explicit argument (the route injects it), stamps it as
 *     generatedAt, and WRITES NOTHING — the store read is the only SQL the
 *     whole surface fires.
 *   S3 — the semantics of record ride the payload verbatim (BAR_SEMANTICS);
 *     the client renders them and never re-derives them.
 *   S4 — honest nulls: an address with no graded evidence gets no bar;
 *     ungraded-only addresses are disclosed in the summary
 *     (ungradedOnlyAddresses), never silently dropped.
 *   S5 — the queue is the law's own practiceNowQueue over the same
 *     strengths (below reviewBelow 0.6, weakest first, capped QUEUE_SIZE).
 *   S6 — adjacency: evidence at a code that is not a DRILLABLE bank address
 *     never surfaces (the bar exists only where the drill ships). The bank's
 *     addressRows are the boundary of record.
 *  Zero-stakes law: no gradebook event, no attempts/ai_mark_events write, no
 *  progress-bearing read — one SELECT on the drill's own evidence lane.
 */
import type {
  PracticeNowEntryView,
  StrengthBarView,
  StrengthResponse,
  StrengthSummary,
} from "@syllabai/contracts";

import type { DrillBank } from "./bank";
import {
  BAR_SEMANTICS,
  addressStrength,
  practiceNowQueue,
  type StrengthEvidenceRow,
} from "./strength";
import type { DrillStore } from "./store";

/** The S5 ordering of the bars: weakest first, code ascending tie-break. */
function byWeakest(a: StrengthBarView, b: StrengthBarView): number {
  return a.strength === b.strength ? (a.code < b.code ? -1 : a.code > b.code ? 1 : 0) : a.strength - b.strength;
}

/**
 * The learner's strength projection for one course. Pure over its inputs
 * apart from the store read; the same (evidence, bank, now) returns the
 * identical body. `now` is the only clock (ADR-031 injected-clock posture).
 */
export async function strengthsForLearner(
  bank: DrillBank,
  store: DrillStore,
  learnerId: string,
  course: string,
  now: Date,
): Promise<StrengthResponse> {
  const rows = await store.evidenceForCourse(learnerId, course);

  // Law S6 — the bank's drillable addresses are the whole bar address space.
  const drillable = new Set<string>();
  for (const a of bank.addressRows) {
    if (a.drillable) drillable.add(a.code);
  }

  const byCode = new Map<string, StrengthEvidenceRow[]>();
  let addressesWithEvidence = 0;
  let ungradedOnlyAddresses = 0;
  for (const row of rows) {
    if (!drillable.has(row.code)) {
      continue; // law S6: disclosed in the plan, never surfaced
    }
    let list = byCode.get(row.code);
    if (!list) {
      list = [];
      byCode.set(row.code, list);
    }
    list.push({
      partId: row.partId,
      marksAwarded: row.marksAwarded,
      marksPossible: row.marksPossible,
      gradedAt: row.createdAt, // build plan Q8: the immutable row's write time IS the graded-at clock
    });
  }
  for (const list of byCode.values()) {
    addressesWithEvidence += 1;
    if (!list.some((r) => r.marksAwarded !== null && r.marksPossible > 0)) {
      ungradedOnlyAddresses += 1; // law S4: evidence exists, no graded row, no bar
    }
  }

  const bars: StrengthBarView[] = [];
  for (const [code, list] of byCode) {
    const s = addressStrength(list, now);
    if (!s) continue; // ungraded-only — the honest null stays null
    bars.push({
      code,
      anchor: s.anchor,
      lastGradedAt: s.lastGradedAt,
      strength: s.strength,
      band: s.band,
      gradedCount: s.gradedCount,
      ungradedCount: s.ungradedCount,
    });
  }
  bars.sort(byWeakest);

  const queue: PracticeNowEntryView[] = practiceNowQueue(byCode, now);

  const summary: StrengthSummary = {
    drillableAddresses: drillable.size,
    addressesWithEvidence,
    ungradedOnlyAddresses,
    bars: bars.length,
    queued: queue.length,
  };

  return {
    course,
    generatedAt: now.toISOString(),
    semantics: BAR_SEMANTICS, // law S3: the strings of record ride the payload
    summary,
    bars,
    queue,
  };
}

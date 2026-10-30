/**
 * Region-mark state machine — T-MG-CROPMARK-1 run-002. PURE reducer (the
 * ink.ts / region-crop.ts law: the interactive surface's decisions live in
 * testable pure modules; the component only renders and dispatches).
 *
 * The honest-lifecycle law (run-001's wire, contracts/paper-marking.ts):
 *   start → accepted {markId} → progress (queued|running)* → succeeded
 *   {snapshot} | failed {detail} | timeout {markId} (still running after
 *   the poll cap — the honest "check again", NOT a fabricated failure)
 *   | lost (the in-process registry restarted — the poll 404s honestly).
 * A crop-side refusal lands as failed with the producer's honest reason —
 * never a silent no-op, never a fabricated award.
 *
 * The stored snapshot IS the mirrored poll snapshot of record
 * (lib/paper-marks.ts — the SCHEMA MIRROR law; one shape, zero drift).
 */
import type { MirroredPollSnapshot } from "@/lib/paper-marks";

export type { MirroredPollSnapshot };

export interface RegionMarkEntry {
  phase: RegionMarkPhase;
  /** The region's human identity (regionKey + marks) for the panel. */
  label: string;
  markId: string | null;
  /** Honest detail for failed/timeout (the producer reason / api message). */
  detail: string | null;
  snapshot: MirroredPollSnapshot | null;
}

export type RegionMarkPhase =
  | "cropping"
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "timeout";

export interface RegionMarkState {
  entries: Record<string, RegionMarkEntry>;
  /** The entry the panel shows (the most recent non-dismissed activity). */
  activeId: string | null;
}

export type RegionMarkAction =
  | { type: "start"; regionId: string; label: string }
  | { type: "cropped"; regionId: string }
  | { type: "accepted"; regionId: string; markId: string }
  | { type: "progress"; regionId: string; status: "queued" | "running" }
  | { type: "succeeded"; regionId: string; snapshot: MirroredPollSnapshot }
  | { type: "failed"; regionId: string; detail: string }
  | { type: "timeout"; regionId: string; markId: string | null; detail: string }
  | { type: "dismiss"; regionId: string };

export function initialRegionMarkState(): RegionMarkState {
  return { entries: {}, activeId: null };
}

export function regionMarkReducer(state: RegionMarkState, action: RegionMarkAction): RegionMarkState {
  switch (action.type) {
    case "start": {
      return {
        entries: {
          ...state.entries,
          [action.regionId]: { phase: "cropping", label: action.label, markId: null, detail: null, snapshot: null },
        },
        activeId: action.regionId,
      };
    }
    case "cropped": {
      const e = state.entries[action.regionId];
      if (!e) return state;
      return { ...state, entries: { ...state.entries, [action.regionId]: { ...e, phase: "queued" } } };
    }
    case "accepted": {
      const e = state.entries[action.regionId];
      if (!e) return state;
      return {
        ...state,
        entries: { ...state.entries, [action.regionId]: { ...e, markId: action.markId } },
      };
    }
    case "progress": {
      const e = state.entries[action.regionId];
      if (!e) return state;
      // queued|running = the live poll; timeout = the Check-again resume
      // (the SAME markId — retry: 0, never a re-POST).
      if (e.phase !== "queued" && e.phase !== "running" && e.phase !== "timeout") return state;
      return {
        ...state,
        entries: { ...state.entries, [action.regionId]: { ...e, phase: action.status } },
      };
    }
    case "succeeded": {
      const e = state.entries[action.regionId];
      if (!e) return state;
      return {
        ...state,
        entries: {
          ...state.entries,
          [action.regionId]: { ...e, phase: "succeeded", snapshot: action.snapshot, detail: null },
        },
      };
    }
    case "failed": {
      const e = state.entries[action.regionId];
      if (!e) return state;
      return {
        ...state,
        entries: { ...state.entries, [action.regionId]: { ...e, phase: "failed", detail: action.detail } },
      };
    }
    case "timeout": {
      const e = state.entries[action.regionId];
      if (!e) return state;
      return {
        ...state,
        entries: {
          ...state.entries,
          [action.regionId]: { ...e, phase: "timeout", markId: action.markId, detail: action.detail },
        },
      };
    }
    case "dismiss": {
      const e = state.entries[action.regionId];
      if (!e) return state;
      const entries = { ...state.entries };
      delete entries[action.regionId];
      return {
        entries,
        activeId: state.activeId === action.regionId ? null : state.activeId,
      };
    }
    default:
      return state;
  }
}

/** Σ over the assembled award rows (the §3.6 rollup law at panel grain:
 * from the served rows, never a local counter of something else). */
export function awardsTotals(snapshot: MirroredPollSnapshot): { score: number; max: number } {
  let score = 0;
  let max = 0;
  for (const a of snapshot.awards ?? []) {
    score += a.score;
    max += a.maxScore;
  }
  return { score, max };
}

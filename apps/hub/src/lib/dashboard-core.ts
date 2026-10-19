"use client";

/**
 * dashboard-core — one shared read of the pilot's REAL learner model for the
 * dashboard's core-backed surfaces (HUB-DASH-CORE P1, operator trace
 * 1a0ec29c8c8cfb71).
 *
 * Three dashboard surfaces upgrade from browser-local derivation to the
 * account's evidence when it is honestly available:
 *
 *   - Next best actions: core's T-033 read model (GET /recommendations)
 *     replaces the local rules for the pilot course — the same
 *     replace-not-merge pattern lib/kg-learner-state.ts established for the
 *     KG drawer's core path;
 *   - the review-due strip: core's pendingReviews (the nightly decay job's
 *     queue) instead of the demo's client-side forgetting model;
 *   - Jump back in: the account's most recent measured topic
 *     (lastPracticedAt) when this device has no history of its own.
 *
 * Negative semantics are the repo's standard: signed out / pilot join
 * unavailable / core down → { kind: "off" } and every consumer silently
 * keeps its local derivation. Nothing blocks, no spinner trap, and no
 * surface ever claims account provenance it does not have.
 *
 * One fetch set per mount tree — a module-level external store (the same
 * shape as identity.ts / my-subjects.ts), refreshed when new evidence lands
 * (syllabai:core-evidence) and reset on identity changes (login / logout /
 * session expiry), mirroring useAttemptBridge's event set.
 */
import { useSyncExternalStore } from "react";
import { api, getToken } from "./api";
import { fetchPilotInfo, PILOT_COURSE_SLUG } from "./attempt-bridge";

/** The roster read the selection law uses — the same localStorage the
 *  useMySubjects store owns (read directly: this module is a plain async
 *  store, not a hook tree). */
function rosterSlugs(): string[] {
  try {
    const raw = window.localStorage.getItem("syllabai.mySubjects.v1");
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((s): s is string => typeof s === "string" && s.length > 0)
      : [];
  } catch {
    return [];
  }
}
import type {
  LearnerKnowledgeGraphView,
  LearnerStateView,
  NextBestActionsView,
} from "./types";

export interface DashboardCoreModel {
  /** the hub course the model resolved for (the selection law's winner —
   *  T-MIG-135d: the learner's first core-bridge course, pilot-first so the
   *  4CH1 behavior is byte-identical) */
  course: string;
  /** the course's subject root — the join every core read model is scoped by */
  rootId: string;
  state: LearnerStateView;
  /** T-033 read model; null when core is a contract behind (tolerant — the
   *  same deploy-skew ruling as the V47/V48 additive view fields) */
  recommendations: NextBestActionsView | null;
  /** per-node tree view (node codes resolve jump-back targets); null on
   *  failure — jump-back falls back to its local-only behaviour */
  kg: LearnerKnowledgeGraphView | null;
}

export type DashboardCoreStatus =
  | { kind: "loading" }
  | { kind: "off" }
  | { kind: "ready"; model: DashboardCoreModel };

// referentially stable between emits (useSyncExternalStore requirement)
let snapshot: DashboardCoreStatus = { kind: "loading" };
let generation = 0; // guards against a stale in-flight read overwriting a newer one
let inflight = false;
let refetchAfterSettle = false; // evidence landed mid-read — run once more after
const listeners = new Set<() => void>();

function emit(next: DashboardCoreStatus): void {
  snapshot = next;
  for (const l of listeners) l();
}

async function readOnce(myGeneration: number): Promise<void> {
  const token = getToken();
  if (!token) {
    if (myGeneration === generation) emit({ kind: "off" });
    return;
  }
  // T-MIG-135d the selection law: the pilot course FIRST (chemistry users
  // see byte-identical behavior), then the learner's roster in insertion
  // order — the first course whose core join resolves wins; none → off.
  // One read model per dashboard (multi-course aggregation stays local to
  // each surface's own derivation).
  const candidates = [PILOT_COURSE_SLUG, ...rosterSlugs().filter((c) => c !== PILOT_COURSE_SLUG)];
  let resolved: { course: string; rootId: string } | null = null;
  for (const course of candidates) {
    const info = await fetchPilotInfo(course);
    if (myGeneration !== generation) return; // superseded
    if (info) {
      resolved = { course, rootId: info.rootId };
      break;
    }
  }
  if (!resolved) {
    emit({ kind: "off" });
    return;
  }
  try {
    // state is the load-bearing read (strip + jump-back + NBA provenance);
    // recommendations and the KG tree degrade to null independently
    const [state, recommendations, kg] = await Promise.all([
      api.learnerState(),
      api.recommendations(resolved.rootId).catch(() => null),
      api.learnerKnowledgeGraph(resolved.rootId).catch(() => null),
    ]);
    if (myGeneration !== generation) return;
    if (!getToken()) {
      emit({ kind: "off" }); // signed out mid-read
      return;
    }
    emit({
      kind: "ready",
      model: { course: resolved.course, rootId: resolved.rootId, state, recommendations, kg },
    });
  } catch {
    if (myGeneration !== generation) return;
    emit({ kind: "off" }); // core unreachable — local derivation takes over silently
  }
}

function load(): void {
  if (inflight) return;
  inflight = true;
  const myGeneration = generation;
  void readOnce(myGeneration).finally(() => {
    inflight = false;
    if (refetchAfterSettle) {
      refetchAfterSettle = false;
      refresh();
    }
  });
}

/** Bump the generation, drop back to loading, and read again. */
function refresh(): void {
  generation += 1;
  emit({ kind: "loading" });
  load();
}

function handleCoreEvidence(): void {
  if (snapshot.kind === "loading") {
    refetchAfterSettle = true; // the in-flight read may predate the new evidence
    return;
  }
  refresh();
}

function subscribe(onChange: () => void): () => void {
  const first = listeners.size === 0;
  listeners.add(onChange);
  if (first) load(); // first dashboard consumer triggers the initial read
  window.addEventListener("syllabai:core-evidence", handleCoreEvidence);
  window.addEventListener("syllabai:identity-changed", refresh);
  window.addEventListener("syllabai:session-expired", refresh);
  window.addEventListener("syllabai:my-subjects-changed", refresh);
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0) {
      window.removeEventListener("syllabai:core-evidence", handleCoreEvidence);
      window.removeEventListener("syllabai:identity-changed", refresh);
      window.removeEventListener("syllabai:session-expired", refresh);
      window.removeEventListener("syllabai:my-subjects-changed", refresh);
    }
  };
}

function getSnapshot(): DashboardCoreStatus {
  return snapshot;
}

function getServerSnapshot(): DashboardCoreStatus {
  return { kind: "loading" };
}

/**
 * The dashboard's shared core read model. "loading" until the first read
 * settles (prerender + hydration), "off" whenever any negative holds (signed
 * out / not the pilot join / core down), "ready" with the account's model
 * otherwise. Consumers gate on the kind and degrade to their local
 * derivations without a word.
 */
export function useDashboardCore(): DashboardCoreStatus {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

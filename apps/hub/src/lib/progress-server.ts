"use client";

/**
 * DC-7 — the server progress projection consumer (spec §3.7; prereg of
 * record docs/DC7-PROGRESS-ATTRIBUTION-PLAN.md).
 *
 * THE LAW (verbatim): "Every progress-bearing act publishes an evidence
 * event, and every progress display is a projection of those events - never
 * a local counter." For signed-in learners the progress displays read the
 * server projection — the api's event→projection rollup over the persisted
 * event rows (ai_mark_events / attempts / revision_note_viewed — see
 * apps/api/src/services/learner/progress-rollup.ts). For signed-out
 * visitors (or any fetch failure) this hook returns null and the callers
 * fall back to the browser-local SIMULATED overlay, whose labels remain
 * the of-record demo posture — the fallback is a disclosed posture, never
 * a silent second truth.
 *
 * The wire shape mirrors GET /api/v1/learners/me/progress?course=<slug>
 * (the projection is keyed by the curriculum codes the spec tree renders
 * verbatim; `today` is the day-scoped block every display consumer shares
 * — rings, plan projection and dashboard copy can never disagree).
 */
import { useEffect, useState } from "react";
import { apiPath, getToken } from "@/lib/api";

export interface ProjectionFraction {
  done: number;
  total: number;
  fraction: number;
  leafDone: boolean;
}

export interface ProgressNodeEntry {
  notes: ProjectionFraction;
  questions: ProjectionFraction;
}

export interface ProgressToday {
  notesChecked: number;
  markedParts: number;
  mcqSubmitted: number;
}

export interface ProgressProjectionPayload {
  courseSlug: string;
  nodes: Record<string, ProgressNodeEntry>;
  today: ProgressToday;
  builtAt: string;
}

export type ProgressDimension = "notes" | "questions";

/**
 * Pure: the ring percent (0..100) for one node on one dimension of a
 * payload. null = the projection carries no fact for that node/dimension
 * (unsigned-in, node outside the course universe, or an empty denominator)
 * — the caller falls back. The one-decimal display law of the overlay
 * (UX audit 2026-10-02 #17) is preserved by the roundPercent consumers.
 */
export function projectionPercentFor(
  payload: ProgressProjectionPayload | null,
  code: string,
  dimension: ProgressDimension,
): number | null {
  const entry = payload?.nodes?.[code];
  if (!entry) return null;
  const f = entry[dimension];
  if (!f || f.total === 0) return null;
  return Math.round(f.fraction * 100);
}

/** per-slug cache — one fetch per course per page session (the tree, the
 * rings and the dashboard card share it; one projection, never two). */
const cache = new Map<string, ProgressProjectionPayload>();

/** test seam: drop the cached projections (the pins start from empty) */
export function clearProjectionCache(): void {
  cache.clear();
}

export function useCourseProjection(
  courseSlug: string | undefined,
): ProgressProjectionPayload | null {
  const [state, setState] = useState<{ slug: string | undefined; payload: ProgressProjectionPayload | null }>(
    () => ({ slug: courseSlug, payload: courseSlug ? (cache.get(courseSlug) ?? null) : null }),
  );

  // render-phase cache derivation (React-endorsed adjustment): a slug change
  // serves a warm cache entry WITHOUT an effect round-trip; the effect below
  // only fills cold entries (async setState only — never during the effect body).
  const payload =
    state.slug === courseSlug ? state.payload : courseSlug ? (cache.get(courseSlug) ?? null) : null;

  useEffect(() => {
    if (!courseSlug) return;
    if (cache.has(courseSlug)) return; // the derivation above already serves it
    if (typeof window === "undefined") return;
    if (!getToken()) return; // signed out: the SIMULATED overlay posture of record
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          apiPath(`/api/v1/learners/me/progress?course=${encodeURIComponent(courseSlug)}`),
          { cache: "no-store" },
        );
        if (!res.ok) return; // 401 / cold core → the fallback posture, disclosed
        const data = (await res.json()) as ProgressProjectionPayload;
        cache.set(courseSlug, data);
        if (!cancelled) setState({ slug: courseSlug, payload: data });
      } catch {
        // the projection never blocks the tree — the overlay stays honest
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [courseSlug]);

  return payload;
}

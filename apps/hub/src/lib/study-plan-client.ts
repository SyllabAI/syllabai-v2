"use client";

/**
 * Study-Plan Builder — the hub consumer hooks (spec §5.3 + roadmap Table 3
 * P2 row; prereg of record docs/STUDY-PLAN-BUILDER-PLAN.md).
 *
 * The progress-server posture of record (lib/progress-server.ts): the
 * signed-in learner reads the server payload; signed-out visitors (or any
 * fetch failure) get null and the callers render their disclosed fallback —
 * never a silent second truth. The plan payload carries the projection
 * decisions from the DC-7 subscription, so the rail's "You've completed N of
 * M tasks today" and the plan page's counters can never disagree with the
 * tree (one build, one today, by construction).
 *
 * The wire types and the pure view mappers live in ./study-plan-view (api-
 * free, re-exported here for the surface components); this module carries
 * the fetch layer and the lane's ONLY write: PUT /api/v1/learners/me/
 * study-plan (the plan-config row, migration 0012_study_plans). Task
 * completion state is never written — "the tree wrote the plan, not the
 * learner".
 */
import { useEffect, useState } from "react";
import { apiPath, getToken } from "@/lib/api";
import type {
  StudyPlanDefaults,
  StudyPlanPayload,
  StudyPlanUpsertBody,
} from "./study-plan-view";

export {
  completionCopy,
  dayName,
  goalCopy,
  railTodayCopy,
  taskHref,
} from "./study-plan-view";
export type {
  PlanCourseView,
  PlanDayView,
  PlanTaskView,
  PlanWeekView,
  StudyPlanConfig,
  StudyPlanDefaults,
  StudyPlanPayload,
  StudyPlanSeason,
  StudyPlanUpsertBody,
} from "./study-plan-view";

// one payload per page session — the dashboard rail and the plan page share it
let cache: StudyPlanPayload | null = null;

/** test seam: drop the cached payload (the pins start from empty) */
export function clearStudyPlanCache(): void {
  cache = null;
}

async function authedJson<T>(path: string, init?: RequestInit): Promise<T | null> {
  if (typeof window === "undefined") return null;
  const token = getToken();
  if (!token) return null; // signed out: the disclosed fallback posture
  try {
    const res = await fetch(apiPath(path), {
      ...init,
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
    if (!res.ok) return null; // 401 / cold api → the fallback, disclosed
    return (await res.json()) as T;
  } catch {
    return null; // the plan never blocks the surface — the fallback stays honest
  }
}

export function useStudyPlan(): StudyPlanPayload | null {
  const [state, setState] = useState<StudyPlanPayload | null>(cache);

  useEffect(() => {
    if (cache) return; // the shared per-session payload already serves it
    let cancelled = false;
    void (async () => {
      const data = await authedJson<StudyPlanPayload>("/api/v1/learners/me/study-plan");
      // { plan: null } = signed in with no plan yet — the rail's Create
      // posture, not a payload (the week arrives with the plan)
      if (data && data.plan && data.week && !cancelled) {
        cache = data;
        setState(data);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

export function useStudyPlanDefaults(): StudyPlanDefaults | null {
  const [state, setState] = useState<StudyPlanDefaults | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!getToken()) return; // signed out: the builder never renders
    let cancelled = false;
    void (async () => {
      const data = await authedJson<StudyPlanDefaults>("/api/v1/learners/me/study-plan/defaults");
      if (data && !cancelled) setState(data);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

/** the lane's ONLY write: the plan-config upsert. Returns the fresh payload
 * (and warms the cache) or null on failure — the caller discloses. */
export async function saveStudyPlan(body: StudyPlanUpsertBody): Promise<StudyPlanPayload | null> {
  const data = await authedJson<StudyPlanPayload>("/api/v1/learners/me/study-plan", {
    method: "PUT",
    body: JSON.stringify(body),
  });
  if (data) {
    cache = data;
  }
  return data;
}

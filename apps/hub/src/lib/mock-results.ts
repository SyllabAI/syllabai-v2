/**
 * Mock exam results — the ACCOUNT-BACKED self-marked tallies (T-TIER1).
 *
 * Mocks are graded by the student against the official MS PDF. Since the
 * frontend deep-audit Tier 1 (operator order 2026-11-03: "things that are
 * localStorage-only, make them saved to account") the tally is saved to the
 * learner's account (learner_mock_results, server cap 50 per course — the
 * same MAX_PER_COURSE bound here; T-CAPS-POLICY-1 raised 20 → 50 on all
 * three sites) while the localStorage record stays the
 * UI cache, per the my-subjects.ts T-TEACH-001 write-through law. Signed
 * out, the store behaves exactly as before (this-browser-only, honestly
 * disclosed by the strip).
 *
 * Nothing here touches canonical learner state or the marking plane — these
 * are the student's OWN tallies (the self-marked honesty is preserved).
 */
"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { readIdentitySnapshot, useIdentity } from "@/lib/identity";

export interface MockResult {
  /** unique id: `${course}:${sessionId}:${dir}:${startedAt}` */
  id: string;
  course: string;
  /** official paper reference, e.g. "4CH1/1C" */
  ref: string;
  title: string;
  sessionId: string;
  /** ISO date when the mock finished */
  finishedAt: string;
  /** duration the mock was set to (minutes) */
  durationMin: number;
  /** seconds actually used */
  timeUsedSec: number;
  marks: number;
  total: number;
  /** how it ended */
  ended: "time-up" | "self" | "exited";
  /**
   * Optional per-question tally (v2 additive field — older records lack it).
   * `max` is null when the student left the marks-available cell empty.
   */
  questions?: Array<{ label: string; marks: number; max: number | null }>;
}

const KEY = "syllabai.mockResults.v1";
/** T-CAPS-POLICY-1: 20 → 50, both sides (the contracts'
 *  MOCK_RESULTS_PER_COURSE and the server's MOCK_RESULTS_CAP move with
 *  this — one law, three sites, never disagreeing). */
const MAX_PER_COURSE = 50;
export const MOCK_RESULTS_EVENT = "syllabai:mock-results-changed";

export function loadMockResults(course?: string): MockResult[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const all: MockResult[] = raw ? (JSON.parse(raw) as MockResult[]) : [];
    return course ? all.filter((r) => r.course === course) : all;
  } catch {
    return [];
  }
}

function writeAll(all: MockResult[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* storage full/unavailable — the session keeps its in-memory copy */
  }
  window.dispatchEvent(new CustomEvent(MOCK_RESULTS_EVENT));
}

export function saveMockResult(result: MockResult): void {
  if (typeof window === "undefined") return;
  try {
    const all = loadMockResults();
    const next = [result, ...all.filter((r) => r.id !== result.id)]
      .filter((r) => r.course === result.course)
      .slice(0, MAX_PER_COURSE)
      .concat(loadMockResults().filter((r) => r.course !== result.course));
    writeAll(next);
  } catch {
    /* storage full/unavailable — mock result is ephemeral, fine */
  }
}

export function clearMockResults(course: string): void {
  if (typeof window === "undefined") return;
  try {
    const all = loadMockResults();
    writeAll(all.filter((r) => r.course !== course));
  } catch {
    /* noop */
  }
}

/** Subscribe to store changes (same-tab custom event + cross-tab storage). */
export function subscribeMockResults(onChange: () => void): () => void {
  window.addEventListener(MOCK_RESULTS_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(MOCK_RESULTS_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * Reactive read for one course's tallies. Returns null until the first
 * hydration-safe read has landed (the strip's `results === null` posture —
 * SSR markup stays deterministic). Re-renders on every store change
 * (local writes, the sync's remote mirror).
 */
export function useMockResults(course: string): MockResult[] | null {
  const [results, setResults] = useState<MockResult[] | null>(null);
  useEffect(() => {
    let alive = true;
    // deferred one microtask: hydration-safe localStorage read
    // (react-hooks/set-state-in-effect; the strip's posture of record)
    void Promise.resolve().then(() => {
      if (alive) setResults(loadMockResults(course));
    });
    const unsub = subscribeMockResults(() => {
      if (alive) setResults(loadMockResults(course));
    });
    return () => {
      alive = false;
      unsub();
    };
  }, [course]);
  return results;
}

// ── server sync (T-TIER1) — the account-backed tallies ──────────────────────
// The my-subjects.ts T-TEACH-001 write-through law, union-merge edition:
//
// Law of record:
//  - The localStorage record stays the UI truth (reactive, instant, works
//    signed-out exactly as before).
//  - Signed in, every LOCAL write mirrors to core as a per-course FULL-set
//    PUT (idempotent replace, debounced per course to coalesce bursts); a
//    failed PUT leaves the local record untouched (cache law) and the next
//    write or reconcile re-mirrors.
//  - On identity acquisition (mount / login / cross-tab session) the sync
//    reconciles ONCE with a UNION MERGE per course (by the deterministic
//    `id` — `${course}:${sessionId}:${dir}:${startedAt}`, so the same mock
//    retaken is a distinct record and a replay is a true duplicate): the
//    merged newest-first set (capped 20) is written down locally and any
//    course whose merged set differs from the server's is PUT back up. A
//    union never loses a record from either side — the conservative merge
//    law (a set has no single "newest wins" answer; the pointer store's
//    recency law does not apply here).
//  - Remote-driven writes set applyingRemote so the mirror does not echo
//    the set back to core (one PUT per intent, never two).
//  - Per-course cap: 50 of record, both sides (MAX_PER_COURSE here, the
//    server's own bound) — cache and account can never disagree on shape.

const wireToLocal = (
  r: Awaited<ReturnType<typeof api.mockResults>>["results"][number],
): MockResult => ({
  id: r.clientId,
  course: "", // stamped by the merge loop (the wire row carries no course)
  ref: r.ref,
  title: r.title,
  sessionId: r.sessionId,
  finishedAt: r.finishedAt,
  durationMin: r.durationMin,
  timeUsedSec: r.timeUsedSec,
  marks: r.marks,
  total: r.total,
  ended: r.ended,
  ...(r.questions ? { questions: r.questions } : {}),
});

let applyingRemote = false;
const dirtyCourses = new Set<string>();
const putScheduled = new Set<string>();

function putCourse(course: string): void {
  if (putScheduled.has(course) || applyingRemote) return;
  putScheduled.add(course);
  setTimeout(() => {
    putScheduled.delete(course);
    if (typeof window === "undefined") return;
    if (!readIdentitySnapshot()) return; // signed out mid-flight — local-only mode
    if (!dirtyCourses.has(course)) return;
    dirtyCourses.delete(course);
    void api
      .setMockResults(course, { results: toWire(loadMockResults(course)) })
      .catch(() => {
        // silent cache law: local stays; re-arm for the next write/reconcile
        dirtyCourses.add(course);
      });
  }, 0);
}

/** Local MockResult → the wire shape (clientId round-trips verbatim). */
function toWire(local: MockResult[]) {
  return local.map((r) => ({
    clientId: r.id,
    ref: r.ref,
    title: r.title,
    sessionId: r.sessionId,
    finishedAt: r.finishedAt,
    durationMin: r.durationMin,
    timeUsedSec: r.timeUsedSec,
    marks: r.marks,
    total: r.total,
    ended: r.ended,
    ...(r.questions ? { questions: r.questions } : {}),
  }));
}

function armCourse(course: string): void {
  dirtyCourses.add(course);
  putCourse(course);
}

/**
 * The reconcile MERGE (pure; exported for the law tests): the per-course
 * UNION by the deterministic `id` (`${course}:${sessionId}:${dir}:
 * ${startedAt}`, so the same mock retaken is a distinct record and a replay
 * is a true duplicate), newest-finished-first, capped 20. A union never
 * loses a record from either side — the conservative merge law (a set has
 * no single "newest wins" answer; the pointer store's recency law does not
 * apply here). `diverged` names the courses whose merged set differs from
 * the server's (those re-mirror up); `localChanged` says the local cache
 * must take the merge down.
 */
export function mergeMockResults(
  serverRows: Array<MockResult & { course: string }>,
  localAll: MockResult[],
): { mergedAll: MockResult[]; diverged: string[]; localChanged: boolean } {
  const serverByCourse = new Map<string, MockResult[]>();
  for (const r of serverRows) {
    const list = serverByCourse.get(r.course) ?? [];
    list.push(r);
    serverByCourse.set(r.course, list);
  }

  const localCourses = new Set(localAll.map((r) => r.course));
  const courses = new Set<string>([...serverByCourse.keys(), ...localCourses]);

  let localChanged = false;
  const mergedAll: MockResult[] = [];
  const diverged: string[] = [];

  for (const course of courses) {
    const serverList = serverByCourse.get(course) ?? [];
    const localList = localAll.filter((r) => r.course === course);
    const byId = new Map<string, MockResult>();
    for (const r of serverList) byId.set(r.id, r);
    for (const r of localList) byId.set(r.id, r);
    const merged = [...byId.values()]
      .sort((a, b) => new Date(b.finishedAt).getTime() - new Date(a.finishedAt).getTime())
      .slice(0, MAX_PER_COURSE);
    mergedAll.push(...merged);

    const sameSet =
      serverList.length === merged.length &&
      serverList.every((r, i) => r.id === merged[i]?.id);
    if (!sameSet) diverged.push(course);
    if (
      localList.length !== merged.length ||
      localList.some((r, i) => r.id !== merged[i]?.id)
    ) {
      localChanged = true;
    }
  }

  return { mergedAll, diverged, localChanged };
}

/**
 * The one-call sync surface: mount ONCE (the app shell mounts it — the
 * mock player writes from past-papers), pass no arguments. While signed in
 * it keeps the account tallies and the local cache in step; signed out it
 * is a no-op (the store behaves exactly as before T-TIER1).
 */
export function useMockResultsSync(): void {
  const identity = useIdentity();

  useEffect(() => {
    if (!identity) return; // signed out — local-only mode, no core contact

    let cancelled = false;

    // reconcile once per identity acquisition: the per-course UNION merge
    const reconcile = async () => {
      try {
        const view = await api.mockResults();
        if (cancelled) return;

        // the wire row does not name its course — the PUT path does; the
        // course comes from the client id's own grammar (its first segment)
        const serverRows = view.results.map((r) => ({
          ...wireToLocal(r),
          course: r.clientId.split(":")[0] ?? "",
        }));
        const { mergedAll, diverged, localChanged } = mergeMockResults(serverRows, loadMockResults());

        if (localChanged) {
          // remote/local merge lands first (applyingRemote → no echo PUT)
          applyingRemote = true;
          writeAll(mergedAll);
          applyingRemote = false;
        }
        // then the diverged courses re-mirror up (LOCAL intent, coalesced)
        for (const course of diverged) {
          dirtyCourses.add(course);
          putCourse(course);
        }
      } catch {
        // core unreachable — cache law: local tallies stay as-is
      }
    };
    void reconcile();

    const onLocalWrite = () => {
      if (applyingRemote) return;
      // a change event names no course, so arm every course present
      // locally (bounded by MAX_PER_COURSE × courses)
      for (const course of new Set(loadMockResults().map((r) => r.course))) {
        dirtyCourses.add(course);
      }
      for (const course of [...dirtyCourses]) putCourse(course);
    };
    window.addEventListener(MOCK_RESULTS_EVENT, onLocalWrite);
    return () => {
      cancelled = true;
      window.removeEventListener(MOCK_RESULTS_EVENT, onLocalWrite);
    };
  }, [identity?.email]); // eslint-disable-line react-hooks/exhaustive-deps -- the identity OBJECT is referentially unstable per read; email is the stable key
}

/** "1h 23m" / "45m 12s" style duration label. */
export function formatSpent(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

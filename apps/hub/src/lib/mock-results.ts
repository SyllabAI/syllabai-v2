/**
 * Mock exam results — the account-backed learner record (T-AUDIT-TIER1).
 *
 * Mocks are graded by the student against the official MS PDF; the tally is
 * persisted to the SIGNED-IN ACCOUNT (the `mock-results` document in
 * user_documents, hydrated + written through by lib/account-docs.ts) —
 * never to browser storage, so results follow the student across devices.
 * Nothing here touches canonical learner state: this is the student's own
 * self-graded record, same as before, just account-scoped instead of
 * device-bound.
 */
"use client";

import { readDoc, subscribeDocs, writeDoc } from "./account-docs";

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

const KEY = "mock-results";
const MAX_PER_COURSE = 20;

function parseDoc(raw: unknown): MockResult[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (r): r is MockResult =>
      !!r && typeof r === "object" && typeof (r as MockResult).id === "string" && typeof (r as MockResult).course === "string",
  );
}

/** module memory (the instant truth; the account PUT is debounced).
 *  Seeded lazily on first read (pre-hydration reads see the honest empty
 *  array) and re-derived by the bridge on server hydration / sign-out. */
let snapshot: MockResult[] = [];

function persist(next: MockResult[]) {
  snapshot = next;
  writeDoc(KEY, next);
}

// account-docs → store bridge: server hydration (or a sign-out reset)
// lands a NEW value → re-derive the snapshot. The store's own writes echo
// back with the SAME array reference persist() already set — skipped.
subscribeDocs((key) => {
  if (key !== KEY) return;
  const raw = readDoc<unknown>(KEY);
  if (raw === snapshot) return;
  snapshot = parseDoc(raw);
});

export function loadMockResults(course?: string): MockResult[] {
  if (typeof window === "undefined") return [];
  const all = snapshot;
  return course ? all.filter((r) => r.course === course) : all;
}

export function saveMockResult(result: MockResult): void {
  if (typeof window === "undefined") return;
  const all = loadMockResults();
  persist(
    [result, ...all.filter((r) => r.id !== result.id)]
      .filter((r) => r.course === result.course)
      .slice(0, MAX_PER_COURSE)
      .concat(all.filter((r) => r.course !== result.course)),
  );
}

export function clearMockResults(course: string): void {
  if (typeof window === "undefined") return;
  persist(loadMockResults().filter((r) => r.course !== course));
}

/** "1h 23m" / "45m 12s" style duration label. */
export function formatSpent(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

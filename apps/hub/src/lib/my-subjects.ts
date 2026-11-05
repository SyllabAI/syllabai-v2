"use client";

/**
 * My Subjects — the student's personally added courses (SME flow step 1).
 *
 * The demo has no auth, so the roster persists in localStorage under a
 * versioned key. Slugs are validated against the course registry at read
 * time by the caller (the dashboard filters unknown slugs out).
 *
 * Implementation note: useSyncExternalStore keeps the roster reactive
 * across tabs (storage event) and across hook instances in this tab
 * (custom event) without setState-in-effect cascades.
 */
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { ApiError, api } from "@/lib/api";
import { readIdentitySnapshot, useIdentity } from "@/lib/identity";

const KEY = "syllabai.mySubjects.v1";
export const MY_SUBJECTS_EVENT = "syllabai:my-subjects-changed";

const EMPTY: string[] = [];

function readSlugs(): string[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY;
    return parsed.filter((s): s is string => typeof s === "string" && s.length > 0);
  } catch {
    return EMPTY;
  }
}

// getSnapshot must return a referentially stable value between store changes
let snapshot: string[] = EMPTY;
function getSnapshot(): string[] {
  const next = readSlugs();
  if (next.length !== snapshot.length || next.some((s, i) => s !== snapshot[i])) {
    snapshot = next;
  }
  return snapshot;
}
function getServerSnapshot(): string[] {
  return EMPTY;
}

function writeSlugs(slugs: string[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(slugs));
  } catch {
    // storage full / private mode — roster just won't persist
  }
  window.dispatchEvent(new CustomEvent(MY_SUBJECTS_EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(MY_SUBJECTS_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(MY_SUBJECTS_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export interface MySubjects {
  /** added course slugs, insertion order preserved */
  slugs: string[];
  has: (slug: string) => boolean;
  add: (slug: string) => void;
  remove: (slug: string) => void;
  /** D-7 undo: re-insert a removed slug at its old position (the plain
   *  `add` appends, which would silently reorder the roster). */
  restore: (slug: string, index: number) => void;
  toggle: (slug: string) => void;
  clear: () => void;
}

export function useMySubjects(): MySubjects {
  const slugs = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const add = useCallback((slug: string) => {
    const cur = readSlugs();
    if (!cur.includes(slug)) writeSlugs([...cur, slug]);
  }, []);

  const remove = useCallback((slug: string) => {
    writeSlugs(readSlugs().filter((s) => s !== slug));
  }, []);

  const restore = useCallback((slug: string, index: number) => {
    const cur = readSlugs().filter((s) => s !== slug);
    cur.splice(Math.min(Math.max(index, 0), cur.length), 0, slug);
    writeSlugs(cur);
  }, []);

  const toggle = useCallback((slug: string) => {
    const cur = readSlugs();
    writeSlugs(cur.includes(slug) ? cur.filter((s) => s !== slug) : [...cur, slug]);
  }, []);

  const clear = useCallback(() => writeSlugs([]), []);

  const has = useCallback((slug: string) => slugs.includes(slug), [slugs]);

  return { slugs, has, add, remove, restore, toggle, clear };
}

// ── server sync (T-TEACH-001) — the account-backed roster ──────────────────
// Operator order trace 1a15ece07422fcd9; TEACHER_MODE_PLAN.md §6 migration
// row ("syllabai.mySubjects.v1 → student's course list server-side") and the
// plan's write-through law ("keep localStorage as cache, emit events when
// online").
//
// Law of record:
//  - The localStorage roster stays the UI truth (reactive, instant, works
//    signed-out exactly as before).
//  - Signed in, every LOCAL write is mirrored to core as an idempotent
//    full-set PUT (debounced per tick to coalesce bursts); a failed PUT
//    leaves the local roster untouched (cache law) and the next write or
//    reconcile re-mirrors.
//  - On identity acquisition (mount / login / cross-tab session), the sync
//    reconciles ONCE: server empty + local non-empty → seed the server
//    from local (the one-time migration of existing rosters); server
//    non-empty → the server WINS and local mirrors it (server is the
//    account truth across devices).
//  - Remote-driven writes set applyingRemote so the mirror does not echo
//    the set back to core (one PUT per intent, never two).
//  - Slugs are validated by the API's kebab-case law; the hub filters
//    unknown slugs at read time (the roster's registry law, unchanged).
//
// T-SYNC-OBS-001 amendment (operator trace 2026-11-05 — a live API outage on
// three account planes read as "my courses vanished" because EVERY sync
// failure was swallowed by a bare `.catch(() => {})`): the sync now
// PUBLISHES its health through a module store (the identity.ts pattern) —
// idle / ok / error with the API's own message and a bounded auto-retry
// ladder — and the dashboard renders an error toast with a manual Retry
// (dashboard-sync-status.tsx). The cache law itself is UNCHANGED: failures
// never touch the local roster, and a signed-out sync is still a no-op.

let applyingRemote = false;
let putScheduled = false;

export type CoursesSyncStatus = "idle" | "ok" | "error";

export interface CoursesSyncState {
  status: CoursesSyncStatus;
  /** the API's own failure message — never invented (null when none) */
  lastError: string | null;
  /** ISO time of the last transition */
  at: string | null;
  /** consecutive failures without a success — reset by ok and by sign-out */
  failureStreak: number;
}

export const COURSES_SYNC_EVENT = "syllabai:my-subjects-sync-changed";

export type CoursesSyncEvent =
  | { type: "ok" }
  | { type: "error"; message: string }
  | { type: "signed-out" };

/** The bounded auto-retry ladder (ms), keyed by the streak AFTER the failure —
 *  5s, 20s, 60s, then the auto chain is exhausted (a manual Retry, a new
 *  local write, a tab becoming visible, a browser online event, or a fresh
 *  login re-attempts). null = no further auto retry. */
export function nextSyncRetryDelayMs(failureStreak: number): number | null {
  const ladder = [5_000, 20_000, 60_000];
  return failureStreak >= 1 && failureStreak <= ladder.length
    ? ladder[failureStreak - 1]!
    : null;
}

/** Pure decision core of the sync-status store (pinned by
 *  my-subjects-sync-status.test.ts): ok resets the streak; error climbs it
 *  and carries the API's own message; sign-out drops to idle — an error NEVER
 *  crosses an identity boundary (no stale toast for the previous account). */
export function reduceCoursesSyncState(
  prev: CoursesSyncState,
  event: CoursesSyncEvent,
): CoursesSyncState {
  const now = new Date().toISOString();
  switch (event.type) {
    case "ok":
      return { status: "ok", lastError: null, at: now, failureStreak: 0 };
    case "error":
      return {
        status: "error",
        lastError: event.message,
        at: now,
        failureStreak:
          prev.status === "ok" || prev.status === "idle" ? 1 : prev.failureStreak + 1,
      };
    case "signed-out":
      return { status: "idle", lastError: null, at: now, failureStreak: 0 };
  }
}

const SYNC_IDLE: CoursesSyncState = { status: "idle", lastError: null, at: null, failureStreak: 0 };
let syncState: CoursesSyncState = SYNC_IDLE;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let reconcileInFlight = false;

function setSyncState(next: CoursesSyncState): void {
  syncState = next;
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(COURSES_SYNC_EVENT));
}

function clearRetryTimer(): void {
  if (retryTimer !== null) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

function noteSyncOk(): void {
  clearRetryTimer();
  setSyncState(reduceCoursesSyncState(syncState, { type: "ok" }));
}

function noteSyncError(err: unknown): void {
  const message =
    err instanceof ApiError ? err.message : "network error — the API could not be reached";
  clearRetryTimer();
  setSyncState(reduceCoursesSyncState(syncState, { type: "error", message }));
  const delay = nextSyncRetryDelayMs(syncState.failureStreak);
  if (delay !== null && readIdentityForSync()) {
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void reconcileOnce("auto-retry");
    }, delay);
  }
}

function noteSignedOut(): void {
  clearRetryTimer();
  setSyncState(reduceCoursesSyncState(syncState, { type: "signed-out" }));
}

/** The reconcile is now the ONLY sync primitive (T-SYNC-OBS-001): a GET that
 *  either confirms health, mirrors the server set, or seeds an empty server
 *  from local — so the retry chain, the manual Retry and the identity
 *  acquisition all run the same idempotent decision. Identity-safe: a
 *  response applies only if the acquiring account still holds the session
 *  (the old effect-scoped `cancelled` flag, generalized to mid-flight
 *  account switches). One reconcile at a time (single-flight). */
async function reconcileOnce(reason: string): Promise<void> {
  const identity = readIdentityForSync();
  if (!identity) return; // signed out — local-only mode, no core contact
  if (reconcileInFlight) return;
  reconcileInFlight = true;
  try {
    const view = await api.myCourses();
    if (readIdentityForSync()?.email !== identity.email) return; // account switched mid-flight
    const serverSlugs = view.courses.map((c) => c.slug);
    const localSlugs = readSlugs();
    const sameSet =
      serverSlugs.length === localSlugs.length &&
      serverSlugs.every((s, i) => s === localSlugs[i]);
    if (serverSlugs.length === 0 && localSlugs.length > 0) {
      // server empty + local non-empty → the one-time seed PUT; the seeding
      // PUT is the critical path of "my courses follow me", so its failure
      // is now VISIBLE (was a swallowed `.catch(() => {})`)
      applyingRemote = false; // this PUT carries LOCAL intent (seed)
      try {
        await api.setMyCourses(localSlugs);
        noteSyncOk();
      } catch (err) {
        noteSyncError(err);
      }
    } else if (serverSlugs.length > 0 && !sameSet) {
      applyingRemote = true; // server wins; mirror silently (no echo PUT)
      writeSlugs(serverSlugs);
      applyingRemote = false;
      noteSyncOk();
    } else {
      noteSyncOk(); // GET succeeded and both sides agree — the sync is healthy
    }
  } catch (err) {
    if (readIdentityForSync()?.email === identity.email) noteSyncError(err);
    else noteSignedOut(); // session died mid-flight — the identity plane owns that surface
  } finally {
    reconcileInFlight = false;
  }
}

function putCurrentLocal(): void {
  if (putScheduled || applyingRemote) return;
  putScheduled = true;
  setTimeout(() => {
    putScheduled = false;
    const identity = readIdentityForSync();
    if (!identity) return; // signed out mid-flight — local-only mode
    const startedEmail = identity.email;
    api
      .setMyCourses(readSlugs())
      .then(() => {
        if (readIdentityForSync()?.email === startedEmail) noteSyncOk();
      })
      .catch((err: unknown) => {
        if (readIdentityForSync()?.email === startedEmail) noteSyncError(err);
        else noteSignedOut();
      });
  }, 0);
}

function readIdentityForSync(): { email: string } | null {
  if (typeof window === "undefined") return null;
  return readIdentitySnapshot();
}

function getSyncSnapshot(): CoursesSyncState {
  return syncState;
}

function subscribeSync(onChange: () => void): () => void {
  window.addEventListener(COURSES_SYNC_EVENT, onChange);
  return () => window.removeEventListener(COURSES_SYNC_EVENT, onChange);
}

/** Reactive sync health for surfaces that render it (the dashboard's error
 *  toast). Server snapshot = idle (a sync state is never hydrated hot). */
export function useMyCoursesSyncStatus(): CoursesSyncState {
  return useSyncExternalStore(subscribeSync, getSyncSnapshot, () => SYNC_IDLE);
}

/** Manual Retry (the toast action): an immediate reconcile attempt regardless
 *  of the auto-retry ladder — a success resets the streak, a failure
 *  schedules the next rung. Signed out → no-op (nothing to sync). */
export function retrySyncNow(): void {
  if (!readIdentityForSync()) return;
  void reconcileOnce("manual-retry");
}

/**
 * The one-call sync surface: mount ONCE (the student dashboard mounts it),
 * pass no arguments. While signed in it keeps core and the cache in step;
 * signed out it is a no-op (the roster behaves exactly as before T-TEACH-001).
 */
export function useMyCoursesSync(): void {
  const identity = useIdentity();

  useEffect(() => {
    if (!identity) {
      noteSignedOut(); // signed out — local-only mode; never carry an error across the boundary
      return;
    }

    // reconcile once per identity acquisition: server wins unless empty
    // (empty server + non-empty local = the one-time seed/migration PUT)
    void reconcileOnce("identity-acquisition");

    const onLocalWrite = () => {
      if (!applyingRemote) putCurrentLocal();
    };
    // recovery signals beyond the auto-retry ladder (bounded by the ladder
    // itself: each signal re-enters reconcileOnce, whose failure re-schedules)
    const onOnline = () => {
      if (syncState.status === "error" && retryTimer === null) void reconcileOnce("online");
    };
    const onVisibility = () => {
      if (
        document.visibilityState === "visible" &&
        syncState.status === "error" &&
        retryTimer === null
      ) {
        void reconcileOnce("visibility");
      }
    };
    window.addEventListener(MY_SUBJECTS_EVENT, onLocalWrite);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener(MY_SUBJECTS_EVENT, onLocalWrite);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [identity?.email]); // eslint-disable-line react-hooks/exhaustive-deps -- the identity OBJECT is referentially unstable per read; email is the stable key
}

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
import { api } from "@/lib/api";
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

  const toggle = useCallback((slug: string) => {
    const cur = readSlugs();
    writeSlugs(cur.includes(slug) ? cur.filter((s) => s !== slug) : [...cur, slug]);
  }, []);

  const clear = useCallback(() => writeSlugs([]), []);

  const has = useCallback((slug: string) => slugs.includes(slug), [slugs]);

  return { slugs, has, add, remove, toggle, clear };
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

let applyingRemote = false;
let putScheduled = false;

function putCurrentLocal(): void {
  if (putScheduled || applyingRemote) return;
  putScheduled = true;
  setTimeout(() => {
    putScheduled = false;
    const identity = readIdentityForSync();
    if (!identity) return; // signed out mid-flight — local-only mode
    void api.setMyCourses(readSlugs()).catch(() => {
      // silent cache law: local stays; the next write/reconcile re-mirrors
    });
  }, 0);
}

function readIdentityForSync(): { email: string } | null {
  if (typeof window === "undefined") return null;
  return readIdentitySnapshot();
}

/**
 * The one-call sync surface: mount ONCE (the student dashboard mounts it),
 * pass no arguments. While signed in it keeps core and the cache in step;
 * signed out it is a no-op (the roster behaves exactly as before T-TEACH-001).
 */
export function useMyCoursesSync(): void {
  const identity = useIdentity();

  useEffect(() => {
    if (!identity) return; // signed out — local-only mode, no core contact

    let cancelled = false;

    // reconcile once per identity acquisition: server wins unless empty
    // (empty server + non-empty local = the one-time seed/migration PUT)
    const reconcile = async () => {
      try {
        const view = await api.myCourses();
        if (cancelled) return;
        const serverSlugs = view.courses.map((c) => c.slug);
        const localSlugs = readSlugs();
        const sameSet =
          serverSlugs.length === localSlugs.length &&
          serverSlugs.every((s, i) => s === localSlugs[i]);
        if (serverSlugs.length === 0 && localSlugs.length > 0) {
          applyingRemote = false; // this PUT carries LOCAL intent (seed)
          void api.setMyCourses(localSlugs).catch(() => {});
        } else if (serverSlugs.length > 0 && !sameSet) {
          applyingRemote = true; // server wins; mirror silently (no echo PUT)
          writeSlugs(serverSlugs);
          applyingRemote = false;
        }
      } catch {
        // core unreachable — cache law: local roster stays as-is
      }
    };
    void reconcile();

    const onLocalWrite = () => {
      if (!applyingRemote) putCurrentLocal();
    };
    window.addEventListener(MY_SUBJECTS_EVENT, onLocalWrite);
    return () => {
      cancelled = true;
      window.removeEventListener(MY_SUBJECTS_EVENT, onLocalWrite);
    };
  }, [identity?.email]); // eslint-disable-line react-hooks/exhaustive-deps -- the identity OBJECT is referentially unstable per read; email is the stable key
}

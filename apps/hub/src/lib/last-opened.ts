"use client";

/**
 * Last Opened — the student's most recent course surface (SME flow parity,
 * Task 21-b: "Jump back in" on the dashboard + "Last viewed" badge on
 * course cards).
 *
 * It records REAL navigation only (the tracker mounts on course routes),
 * never simulated progress. Since the frontend deep-audit Tier 1 (operator
 * order 2026-11-03: "things that are localStorage-only, make them saved to
 * account") the record is ACCOUNT-BACKED (T-TIER1): the versioned
 * localStorage record stays the UI cache, and while signed in it mirrors
 * the learner's core account (learner_last_opened, one row per account).
 *
 * Implementation: useSyncExternalStore keeps all hook instances reactive
 * without setState-in-effect cascades; the sync layer below follows the
 * my-subjects.ts T-TEACH-001 law verbatim (recency decides reconcile — a
 * "last" pointer carries its own time ordering, unlike a roster set).
 */
import { useEffect, useSyncExternalStore } from "react";
import { api } from "@/lib/api";
import { readIdentitySnapshot, useIdentity } from "@/lib/identity";

const KEY = "syllabai.lastOpened.v1";
const EVENT = "syllabai:last-opened-changed";

export type ResourceKind =
  | "hub"
  | "revision-notes"
  | "exam-questions"
  | "flashcards"
  | "strengths"
  | "past-papers"
  | "practice-papers";

const RESOURCE_KINDS: readonly ResourceKind[] = [
  "hub",
  "revision-notes",
  "exam-questions",
  "flashcards",
  "strengths",
  "past-papers",
  "practice-papers",
];

export interface LastOpened {
  slug: string;
  resource: ResourceKind;
  ts: number;
}

const EMPTY: LastOpened | null = null;

function readEntry(): LastOpened | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as LastOpened).slug === "string" &&
      typeof (parsed as LastOpened).resource === "string" &&
      RESOURCE_KINDS.includes((parsed as LastOpened).resource as ResourceKind)
    ) {
      return parsed as LastOpened;
    }
    return EMPTY;
  } catch {
    return EMPTY;
  }
}

let snapshot: LastOpened | null = EMPTY;
function getSnapshot(): LastOpened | null {
  const next = readEntry();
  if (
    !snapshot ||
    !next ||
    snapshot.slug !== next.slug ||
    snapshot.resource !== next.resource
  ) {
    snapshot = next;
  }
  return snapshot;
}
function getServerSnapshot(): LastOpened | null {
  return EMPTY;
}

function write(entry: LastOpened) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(entry));
  } catch {
    // storage full / private mode — last-opened just won't persist
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** Record a real course-surface visit. Client-side only (tracker calls this from an effect). */
export function recordLastOpened(slug: string, resource: ResourceKind) {
  if (typeof window === "undefined") return;
  const cur = readEntry();
  if (cur && cur.slug === slug && cur.resource === resource) return; // no-op re-render
  write({ slug, resource, ts: Date.now() });
}

export function useLastOpened(): LastOpened | null {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener(EVENT, onChange);
      window.addEventListener("storage", onChange);
      return () => {
        window.removeEventListener(EVENT, onChange);
        window.removeEventListener("storage", onChange);
      };
    },
    getSnapshot,
    getServerSnapshot,
  );
}

/** Map a course pathname (/courses/{slug}[/{resource}/…]) to the recorded kind. */
export function resourceFromPathname(pathname: string): { slug: string; resource: ResourceKind } | null {
  const m = pathname.match(/^\/courses\/([^/]+)(?:\/([^/]+))?/);
  if (!m) return null;
  const slug = m[1];
  const seg = m[2];
  const resource: ResourceKind = RESOURCE_KINDS.includes(seg as ResourceKind)
    ? (seg as ResourceKind)
    : "hub";
  return { slug, resource };
}

// ── server sync (T-TIER1) — the account-backed pointer ──────────────────────
// Operator order 2026-11-03 ("things that are localStorage-only, make them
// saved to account"); the my-subjects.ts T-TEACH-001 write-through law,
// recency edition:
//
// Law of record:
//  - The localStorage record stays the UI truth (reactive, instant, works
//    signed-out exactly as before).
//  - Signed in, every LOCAL write is mirrored to core as an idempotent PUT
//    (debounced per tick to coalesce navigation bursts); a failed PUT
//    leaves the local record untouched (cache law) and the next write or
//    reconcile re-mirrors.
//  - On identity acquisition (mount / login / cross-tab session), the sync
//    reconciles ONCE and RECENCY decides — a "last" pointer carries its own
//    time ordering, unlike a roster set: the newer of (server updatedAt,
//    local ts) wins; a tie goes to the server (deterministic). Server null
//    + local present → seed the server from local (the one-time migration
//    of an existing pointer); server present + local absent → mirror the
//    server down.
//  - Remote-driven writes set applyingRemote so the mirror does not echo
//    the pointer back to core (one PUT per intent, never two).
//  - Registry membership is validated at READ time by the callers (the
//    tool-hrefs / dashboard law, unchanged) — the store never filters.

let applyingRemote = false;
let putScheduled = false;

function putCurrentLocal(): void {
  if (putScheduled || applyingRemote) return;
  putScheduled = true;
  setTimeout(() => {
    putScheduled = false;
    if (typeof window === "undefined") return;
    if (!readIdentitySnapshot()) return; // signed out mid-flight — local-only mode
    const cur = readEntry();
    if (!cur) return; // nothing recorded yet — nothing to mirror
    void api.setLastOpened({ courseSlug: cur.slug, resource: cur.resource }).catch(() => {
      // silent cache law: local stays; the next write/reconcile re-mirrors
    });
  }, 0);
}

/**
 * The reconcile DECISION (pure; exported for the law tests): RECENCY
 * decides — a "last" pointer carries its own time ordering, unlike a
 * roster set. The newer of (server updatedAt, local ts) wins; a tie goes
 * to the server (deterministic). Server null + local present → seed the
 * server from local (the one-time migration of an existing pointer);
 * server present + local absent → mirror the server down.
 */
export function reconcileLastOpened(
  server: { courseSlug: string; resource: ResourceKind; updatedAt: string } | null,
  local: LastOpened | null,
): { action: "none" | "mirror-down" | "put-up"; entry: LastOpened | null } {
  if (!server && local) return { action: "put-up", entry: local }; // the one-time seed
  if (!server) return { action: "none", entry: null };
  const serverAt = new Date(server.updatedAt).getTime();
  if (!local || serverAt >= local.ts) {
    return {
      action: "mirror-down",
      entry: { slug: server.courseSlug, resource: server.resource, ts: serverAt },
    };
  }
  return { action: "put-up", entry: local }; // local is newer — re-mirror up
}

/**
 * The one-call sync surface: mount ONCE (the app shell mounts it — the
 * tracker fires on course routes), pass no arguments. While signed in it
 * keeps the account pointer and the local cache in step; signed out it is
 * a no-op (the pointer behaves exactly as before T-TIER1).
 */
export function useLastOpenedSync(): void {
  const identity = useIdentity();

  useEffect(() => {
    if (!identity) return; // signed out — local-only mode, no core contact

    let cancelled = false;

    // reconcile once per identity acquisition: RECENCY decides
    const reconcile = async () => {
      try {
        const envelope = await api.lastOpened();
        if (cancelled) return;
        const verdict = reconcileLastOpened(envelope.lastOpened, readEntry());
        if (verdict.action === "mirror-down" && verdict.entry) {
          // server wins: mirror silently (no echo PUT)
          applyingRemote = true;
          window.localStorage.setItem(KEY, JSON.stringify(verdict.entry));
          window.dispatchEvent(new CustomEvent(EVENT));
          applyingRemote = false;
        } else if (verdict.action === "put-up" && verdict.entry) {
          applyingRemote = false; // this PUT carries LOCAL intent (seed or re-mirror)
          void api
            .setLastOpened({ courseSlug: verdict.entry.slug, resource: verdict.entry.resource })
            .catch(() => {});
        }
      } catch {
        // core unreachable — cache law: local record stays as-is
      }
    };
    void reconcile();

    const onLocalWrite = () => {
      if (!applyingRemote) putCurrentLocal();
    };
    window.addEventListener(EVENT, onLocalWrite);
    return () => {
      cancelled = true;
      window.removeEventListener(EVENT, onLocalWrite);
    };
  }, [identity?.email]); // eslint-disable-line react-hooks/exhaustive-deps -- the identity OBJECT is referentially unstable per read; email is the stable key
}

/** Display label for a recorded resource kind. */
export function resourceLabel(resource: ResourceKind): string {
  switch (resource) {
    case "revision-notes":
      return "Revision Notes";
    case "exam-questions":
      return "Exam Questions";
    case "flashcards":
      return "Flashcards";
    case "strengths":
      return "Strengths & Weaknesses";
    case "past-papers":
      return "Past Papers";
    case "practice-papers":
      return "Practice Papers";
    default:
      return "Course Hub";
  }
}

"use client";

/**
 * Last Opened — the student's most recent course surface (SME flow parity,
 * Task 21-b: "Jump back in" on the dashboard + "Last viewed" badge on
 * course cards).
 *
 * It records REAL navigation only (the tracker mounts on course routes),
 * never simulated progress. T-ACCOUNT-ONLY run-001 (operator order
 * 2026-11-05: "remove device-local things completely"): the pointer lives
 * in module memory and the ACCOUNT (learner_last_opened, one row per
 * account) is its only durable store. The retired localStorage record
 * (syllabai.lastOpened.v1) adopts ONCE per tab (it seeds the memory pointer
 * so the reconcile's recency/seed law migrates it) and is removed after the
 * first successful server contact.
 *
 * Implementation: useSyncExternalStore keeps all hook instances reactive
 * without setState-in-effect cascades; the sync layer below follows the
 * my-subjects.ts T-TEACH-001 law verbatim (recency decides reconcile — a
 * "last" pointer carries its own time ordering, unlike a roster set).
 */
import { useEffect, useSyncExternalStore } from "react";
import { api } from "@/lib/api";
import { readIdentitySnapshot, useIdentity } from "@/lib/identity";

const KEY = "syllabai.lastOpened.v1"; // RETIRED (legacy adoption pin)
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

// ── the in-memory pointer of record + the one-time legacy adoption ────────
let entry: LastOpened | null = EMPTY;
let snapshot: LastOpened | null = EMPTY;
let legacyKeyPresent = false;

function parseEntry(raw: unknown): LastOpened | null {
  if (
    raw &&
    typeof raw === "object" &&
    typeof (raw as LastOpened).slug === "string" &&
    typeof (raw as LastOpened).resource === "string" &&
    RESOURCE_KINDS.includes((raw as LastOpened).resource as ResourceKind)
  ) {
    return raw as LastOpened;
  }
  return EMPTY;
}

if (typeof window !== "undefined") {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const parsed = parseEntry(JSON.parse(raw) as unknown);
      if (parsed) {
        entry = parsed;
        snapshot = parsed;
        legacyKeyPresent = true;
      }
    }
  } catch {
    // corrupt record → the account reconcile decides alone
  }
}

function readEntry(): LastOpened | null {
  return entry;
}

function getSnapshot(): LastOpened | null {
  if (
    !snapshot ||
    !entry ||
    snapshot.slug !== entry.slug ||
    snapshot.resource !== entry.resource
  ) {
    snapshot = entry;
  }
  return snapshot;
}
function getServerSnapshot(): LastOpened | null {
  return EMPTY;
}

function write(e: LastOpened) {
  entry = e;
  snapshot = e;
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** The one-time legacy adoption's retirement (after the first successful
 *  server contact — the memory pointer already owns the data). */
function retireLegacyPointerKey(): void {
  if (!legacyKeyPresent || typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // best-effort
  }
  legacyKeyPresent = false;
}

/** Plain (non-hook) read of the current pointer — for plain async stores
 *  and the law tests. The pointer is the in-memory store of record
 *  (T-ACCOUNT-ONLY run-001). */
export function readLastOpened(): LastOpened | null {
  return entry;
}

/** Test seam: the explicit-empty state without a device or a network. */
export function __resetLastOpenedForTests(): void {
  entry = EMPTY;
  snapshot = EMPTY;
  legacyKeyPresent = false;
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
      return () => {
        window.removeEventListener(EVENT, onChange);
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

// ── server sync (T-TIER1 → T-ACCOUNT-ONLY run-001) — the account IS the
// store ─────────────────────────────────────────────────────────────────
// Operator order 2026-11-05 ("remove device-local things completely"); the
// my-subjects.ts write-through law, recency edition:
//
// Law of record:
//  - The memory pointer is the UI truth (reactive, instant); the ACCOUNT is
//    its only durable store.
//  - Every LOCAL write mirrors to core as an idempotent PUT (debounced per
//    tick to coalesce navigation bursts); a failed PUT leaves the memory
//    pointer untouched and the next write or reconcile re-mirrors.
//  - On identity acquisition (mount / login), the sync reconciles ONCE and
//    RECENCY decides — a "last" pointer carries its own time ordering,
//    unlike a roster set: the newer of (server updatedAt, local ts) wins; a
//    tie goes to the server (deterministic). Server null + local present →
//    seed the server from local (the one-time migration of an existing
//    pointer — including the adopted device record); server present + local
//    absent → mirror the server down.
//  - Remote-driven writes set applyingRemote so the mirror does not echo
//    the pointer back to core (one PUT per intent, never two).
//  - Registry membership is validated at READ time by the callers (the
//    tool-hrefs / dashboard law, unchanged) — the store never filters.

let applyingRemote = false;
let putScheduled = false;
/** The account the in-tab pointer currently mirrors (the cross-account
 *  guard: a stale pointer from account A never surfaces in account B). */
let syncedForEmail: string | null = null;

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
        if (syncedForEmail !== identity.email) {
          // fresh acquisition: a stale in-tab pointer from ANOTHER account is
          // cleared (the legacy seed is exempt — its one-time migration IS
          // the point of this reconcile)
          if (!legacyKeyPresent && entry) write(EMPTY as LastOpened);
          syncedForEmail = identity.email;
        }
        const verdict = reconcileLastOpened(envelope.lastOpened, readEntry());
        if (verdict.action === "mirror-down" && verdict.entry) {
          // server wins: mirror silently (no echo PUT)
          applyingRemote = true;
          write(verdict.entry);
          applyingRemote = false;
        } else if (verdict.action === "put-up" && verdict.entry) {
          applyingRemote = false; // this PUT carries LOCAL intent (seed or re-mirror)
          void api
            .setLastOpened({ courseSlug: verdict.entry.slug, resource: verdict.entry.resource })
            .catch(() => {});
        }
        retireLegacyPointerKey(); // a successful server contact ends the device record
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

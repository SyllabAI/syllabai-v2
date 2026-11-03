"use client";

/**
 * Last Opened — the student's most recent course surface (SME flow parity,
 * Task 21-b: "Jump back in" on the dashboard + "Last viewed" badge on
 * course cards).
 *
 * Like the subjects roster, this is ACCOUNT-BACKED (T-AUDIT-TIER1): the
 * `last-opened` document in user_documents, hydrated + written through by
 * lib/account-docs.ts — never browser storage, so "Jump back in" follows
 * the student across devices. It records REAL navigation only (the tracker
 * mounts on course routes), never simulated progress.
 *
 * Implementation mirrors my-subjects.ts: useSyncExternalStore keeps all
 * hook instances reactive without setState-in-effect cascades.
 */
import { useSyncExternalStore } from "react";
import { readDoc, subscribeDocs, writeDoc } from "./account-docs";

const KEY = "last-opened";
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
    const raw = readDoc<unknown>(KEY);
    if (!raw) return EMPTY;
    const parsed: unknown = raw;
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
  writeDoc(KEY, entry);
  window.dispatchEvent(new CustomEvent(EVENT));
}

// account-docs → store bridge: server hydration (or a sign-out reset)
// lands a NEW value → re-notify so every consumer re-derives. The store's
// own writes echo back with the SAME object reference write() already
// stored — the snapshot identity check in getSnapshot absorbs those.
subscribeDocs((key) => {
  if (key === KEY && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EVENT));
  }
});

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

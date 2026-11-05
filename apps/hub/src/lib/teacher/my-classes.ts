"use client";

/**
 * My Classes — the teacher's class containers (HUB-TEACHER-DASH wave 1,
 * operator trace 1a0ec61d5612aa6d: "the dashboard will look like student
 * one, but instead of subject it is a class card. Teacher will add class,
 * then select subjects. Then inside there, all the tools and course
 * resources will exist.").
 *
 * A class is an ACCOUNT-backed container: { id, name, subjectSlugs[],
 * createdAt } — T-ACCOUNT-ONLY run-001: the roster lives in module memory
 * and the "teacher-classes" workspace doc is its only durable store (the
 * bridge registration at the bottom). The retired localStorage record
 * (syllabai-hub:teacher-classes.v1) adopts ONCE per tab (the engine's
 * legacy adoption) and then retires. The LIVE core class entity (RBAC
 * rosters, /teacher/classes) is a different, database-backed concept — the
 * two never blur: the class workspace links to the live roster surface, it
 * never impersonates it.
 *
 * Slugs are validated against the course registry at read time by the
 * caller (the dashboard filters unknown slugs out), exactly like
 * my-subjects.
 */
import { useCallback, useSyncExternalStore } from "react";
import {
  bridgeDocPool,
  isAccountDocsHydrated,
  mirrorDocPoolState,
  stampOf,
  unionByStamp,
} from "@/lib/account-docs-records";
import { adoptLegacyStorage, onAccountDocsReset } from "@/lib/account-docs";
import { readIdentitySnapshot } from "@/lib/identity";

export const KEY = "syllabai-hub:teacher-classes.v1"; // RETIRED (legacy adoption pin)
export const MY_CLASSES_EVENT = "syllabai-hub:teacher-classes-changed";
/** T-AUDIT-TIER1 run-004 — the account plane this roster mirrors into. */
const DOC_KEY = "teacher-classes";

export interface TeacherClass {
  id: string;
  name: string;
  /** registry course slugs, selection order preserved */
  subjectSlugs: string[];
  /** ISO timestamp — set at creation, display-only */
  createdAt: string;
  /** T-AUDIT-TIER1 run-004 — the reconcile stamp of record (ISO, stamped
   *  on every mutation). Additive + optional: pre-band records load
   *  unchanged (stamp 0 = oldest — they lose every merge until their
   *  first post-band edit). */
  updatedAt?: string;
}

const EMPTY: TeacherClass[] = [];

// the in-memory roster of record (T-ACCOUNT-ONLY run-001)
let classesStore: TeacherClass[] = EMPTY;

function parseClasses(raw: unknown): TeacherClass[] {
  if (!Array.isArray(raw)) return EMPTY;
  return raw
    .filter(
      (c): c is TeacherClass =>
        !!c &&
        typeof c === "object" &&
        typeof (c as TeacherClass).id === "string" &&
        typeof (c as TeacherClass).name === "string" &&
        Array.isArray((c as TeacherClass).subjectSlugs),
    )
    .map((c) => ({
      ...c,
      name: c.name.trim() || "Untitled class",
      subjectSlugs: [...new Set(c.subjectSlugs.filter((s): s is string => typeof s === "string" && s.length > 0))],
    }));
}

function readClasses(): TeacherClass[] {
  return classesStore;
}

// getSnapshot must return a referentially stable value between store changes
let snapshot: TeacherClass[] = EMPTY;
function getSnapshot(): TeacherClass[] {
  const next = readClasses();
  if (
    next.length !== snapshot.length ||
    next.some((c, i) => c.id !== snapshot[i].id || c.name !== snapshot[i].name || c.subjectSlugs.join() !== snapshot[i].subjectSlugs.join())
  ) {
    snapshot = next;
  }
  return snapshot;
}
function getServerSnapshot(): TeacherClass[] {
  return EMPTY;
}

function writeClasses(classes: TeacherClass[]) {
  classesStore = classes;
  window.dispatchEvent(new CustomEvent(MY_CLASSES_EVENT));
  // T-AUDIT-TIER1 run-004 → T-ACCOUNT-ONLY run-001 — the account mirror IS
  // the store (the persist tail drives the commit-up path; echo-guarded on
  // the remote-apply path).
  mirrorDocPoolState(DOC_KEY, classes);
}

function subscribe(onChange: () => void) {
  window.addEventListener(MY_CLASSES_EVENT, onChange);
  return () => {
    window.removeEventListener(MY_CLASSES_EVENT, onChange);
  };
}

function makeId(): string {
  try {
    return `local-${crypto.randomUUID()}`;
  } catch {
    // older engines — a timestamp+random id is honest enough for a
    // browser-local container
    return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

export interface MyClasses {
  /** classes in creation order */
  classes: TeacherClass[];
  has: (id: string) => boolean;
  get: (id: string) => TeacherClass | undefined;
  /** create a class from a name + selected subject slugs (≥1 subject) */
  add: (name: string, subjectSlugs: string[]) => TeacherClass | null;
  /** update name and/or subject selection of an existing class */
  update: (id: string, patch: { name?: string; subjectSlugs?: string[] }) => boolean;
  remove: (id: string) => void;
}

export function useMyClasses(): MyClasses {
  const classes = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const has = useCallback((id: string) => classes.some((c) => c.id === id), [classes]);
  const get = useCallback(
    (id: string) => classes.find((c) => c.id === id),
    [classes],
  );

  const add = useCallback((name: string, subjectSlugs: string[]) => {
    const trimmed = name.trim();
    const slugs = [...new Set(subjectSlugs)];
    if (!trimmed || slugs.length === 0) return null;
    const cls: TeacherClass = {
      id: makeId(),
      name: trimmed,
      subjectSlugs: slugs,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    writeClasses([...readClasses(), cls]);
    return cls;
  }, []);

  const update = useCallback((id: string, patch: { name?: string; subjectSlugs?: string[] }) => {
    const cur = readClasses();
    const idx = cur.findIndex((c) => c.id === id);
    if (idx === -1) return false;
    const next = [...cur];
    const merged: TeacherClass = {
      ...next[idx],
      updatedAt: new Date().toISOString(),
      ...(patch.name !== undefined
        ? { name: patch.name.trim() || next[idx].name }
        : null),
      ...(patch.subjectSlugs !== undefined
        ? { subjectSlugs: [...new Set(patch.subjectSlugs)] }
        : null),
    };
    if (merged.subjectSlugs.length === 0) return false; // a class keeps ≥1 subject
    next[idx] = merged;
    writeClasses(next);
    return true;
  }, []);

  const remove = useCallback((id: string) => {
    writeClasses(readClasses().filter((c) => c.id !== id));
  }, []);

  return { classes, has, get, add, update, remove };
}

// ── T-AUDIT-TIER1 run-004 — the account mirror (bridge registration) ─────
// The roster mirrors the account through the workspace-document plane
// (lib/account-docs-records.ts): conservative union by id, the NEWER
// updatedAt wins (pre-band records stamp 0 = oldest — they lose until
// their first post-band edit), a tie keeps the server's record, creation
// order preserved on pull-down (the store's ordering law rides in apply).
const classesPoolOf = (classes: TeacherClass[]): Record<string, TeacherClass> =>
  Object.fromEntries(classes.map((c) => [c.id, c]));

// T-ACCOUNT-ONLY run-001 — the one-time legacy adoption + the reset law
if (typeof window !== "undefined") {
  adoptLegacyStorage(DOC_KEY, [KEY], () => {
    try {
      const raw = window.localStorage.getItem(KEY);
      return raw ? parseClasses(JSON.parse(raw) as unknown) : null;
    } catch {
      return null;
    }
  });
  onAccountDocsReset(() => {
    classesStore = EMPTY;
    snapshot = EMPTY;
    window.dispatchEvent(new CustomEvent(MY_CLASSES_EVENT));
  });
}

bridgeDocPool<TeacherClass[], TeacherClass>({
  docKey: DOC_KEY,
  cap: 40,
  readState: () => readClasses(),
  readPool: (classes) => classesPoolOf(classes),
  apply: (pool) => {
    writeClasses(Object.values(pool).sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
  },
  merge: (local, server) => unionByStamp(local, server, "updatedAt"),
  stamp: (pool) => stampOf(pool, "updatedAt"),
  getAuthEmail: () => readIdentitySnapshot()?.email ?? null,
  isHydrated: () => isAccountDocsHydrated(),
});

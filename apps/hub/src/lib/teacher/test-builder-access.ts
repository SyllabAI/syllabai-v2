"use client";

/**
 * Test Builder access scoping (T-TEACH-008) — the operator ruling
 * "restrict the dropdown to courses the teacher actually teaches; teachers
 * access the Test Builder from their class/course; each class has a
 * separated test builder" (trace 1a1609dc31d0b735).
 *
 * Two pure halves, both client-side by architecture (the hub's auth is the
 * client RequireAuth gate + the v2 API's JWT role check; server components
 * hold no token, so the taught set is resolved in the browser):
 *
 * 1. THE TAUGHT FILTER — the builder's course list is the intersection of
 *    the committed bundle registry with the courseSlugs of the teacher's
 *    own classes (GET /api/v1/teacher/classes, ownership-scoped since
 *    T-TEACH-005/006). Fail-closed: a class-fetch error yields the empty
 *    set (no classes known → nothing offered), never the full registry.
 *
 * 2. THE PER-COURSE DRAFT — the builder draft moves from the single-slot
 *    `syllabai.testBuilderDraft.v1` to one key per course
 *    (`syllabai.testBuilderDraft.v2.<slug>`), so every class keeps its own
 *    work-in-progress across course switches. The legacy v1 draft is
 *    migrated on first read: if its recorded course matches the requested
 *    slug it is adopted into the v2 key and the single slot is vacated; a
 *    legacy draft belonging to a DIFFERENT course is left untouched for
 *    that course's own first visit. Saved tests needed no migration —
 *    stores.ts has stamped every save with its course since day one.
 */

import type { SwitchableCourse } from "@/lib/teacher/types";
import {
  atOf,
  bridgeDocPool,
  isAccountDocsHydrated,
  mirrorDocPoolState,
  unionByStamp,
} from "@/lib/account-docs-records";
import { readIdentitySnapshot } from "@/lib/identity";

// ── T-AUDIT-TIER1 run-004 — the account mirror ─────────────────────────
// The per-course builder drafts (T-TEACH-008) mirror the account under the
// "test-builder-drafts" key of record. The union is per course slug, the
// NEWER savedAt wins (the stamp the draft has carried since day one), tie
// -> server, capped. The legacy v1 slot stays read-only (its migration
// path lands in the v2 key and mirrors like any other write).
// DISCLOSED: a draft CLEARED on this device loses to a server copy whose
// savedAt is newer (the conservative union never loses a record) — the
// cleared draft can resurrect on the next hydration, the same law the
// thread pools' deletions follow.
const DRAFT_PREFIX = "syllabai.testBuilderDraft.v2.";
const DRAFT_DOC_KEY = "test-builder-drafts";
const MAX_DRAFTS = 20;

function draftPoolKey(storageKey: string): string {
  return storageKey.slice(DRAFT_PREFIX.length);
}

function readDraftPool(): Record<string, object> {
  const pool: Record<string, object> = {};
  if (typeof window === "undefined") return pool;
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k || !k.startsWith(DRAFT_PREFIX)) continue;
      const raw = window.localStorage.getItem(k);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        pool[draftPoolKey(k)] = parsed as object;
      }
    }
  } catch {
    // a torn scan degrades to the pool it could read
  }
  return pool;
}

function writeDraftPool(pool: Record<string, object>) {
  if (typeof window === "undefined") return;
  try {
    const seen = new Set<string>();
    for (const [slug, draft] of Object.entries(pool)) {
      const k = DRAFT_PREFIX + slug;
      seen.add(k);
      window.localStorage.setItem(k, JSON.stringify(draft));
    }
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(DRAFT_PREFIX) && !seen.has(k)) {
        window.localStorage.removeItem(k);
      }
    }
  } catch {
    // private mode — the pull-down just won't land
  }
}

if (typeof window !== "undefined") {
  bridgeDocPool<Record<string, object>, object>({
    localKey: DRAFT_PREFIX.slice(0, -1),
    docKey: DRAFT_DOC_KEY,
    cap: MAX_DRAFTS,
    readState: () => readDraftPool(),
    readPool: (p) => p,
    apply: (pool) => writeDraftPool(pool),
    merge: (local, server) => unionByStamp(local, server, "savedAt"),
    stamp: (p) => Object.entries(p).map(([k, v]) => `${k}:${atOf((v as { savedAt?: unknown }).savedAt)}`).sort().join("|"),
    getAuthEmail: () => readIdentitySnapshot()?.email ?? null,
    isHydrated: () => isAccountDocsHydrated(),
  });
}

/** The single-slot draft of the pre-separation era (read-only after this band). */
export const LEGACY_DRAFT_KEY = "syllabai.testBuilderDraft.v1";

export function draftKeyFor(slug: string): string {
  return `syllabai.testBuilderDraft.v2.${slug}`;
}

/** The wire-invariant slice every stored draft carries (the full builder
 *  draft extends it client-side; only v + course are load-bearing here). */
export interface BuilderDraftV1 {
  v: 1;
  course: string;
}

function parseDraft(raw: unknown, slug: string): object | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as { v?: unknown; course?: unknown };
  // only v + course are load-bearing here; the FULL payload object flows
  // through (the caller's typed wrapper reads its own fields off it)
  if (d.v !== 1 || d.course !== slug) return null;
  return raw;
}

/**
 * Read the draft for ONE course: the v2 per-course key first; the legacy
 * single-slot draft only if it belongs to this course (adopted in place —
 * written to the v2 key and the legacy slot vacated so the migration is
 * one-time per course). Returns the parsed object (identity law v+course
 * enforced here; the caller owns its own shape law) or null.
 */
export function readBuilderDraft(slug: string): object | null {
  try {
    const raw = window.localStorage.getItem(draftKeyFor(slug));
    if (raw) {
      return parseDraft(JSON.parse(raw), slug);
    }
    const legacy = window.localStorage.getItem(LEGACY_DRAFT_KEY);
    if (!legacy) return null;
    const d = parseDraft(JSON.parse(legacy), slug);
    if (!d) return null; // belongs to another course — leave it for that visit
    window.localStorage.setItem(draftKeyFor(slug), JSON.stringify(d));
    window.localStorage.removeItem(LEGACY_DRAFT_KEY);
    return d;
  } catch {
    return null;
  }
}

/**
 * Write (or clear with null) the per-course draft. Clearing is the
 * "committed to Your tests" and "nothing to resume" path.
 */
export function writeBuilderDraft(slug: string, draft: object | null): void {
  try {
    if (draft === null) {
      window.localStorage.removeItem(draftKeyFor(slug));
    } else {
      window.localStorage.setItem(draftKeyFor(slug), JSON.stringify(draft));
    }
  } catch {
    // private mode / quota — the draft just won't persist
  }
  // T-AUDIT-TIER1 run-004 — the account mirror (the persist-tail law)
  mirrorDocPoolState(DRAFT_DOC_KEY, readDraftPool());
}

/**
 * The taught intersection: registry courses whose slug appears in the
 * teacher's own classes, registry order preserved (the dropdown keeps the
 * committed registry's shape; classes merely vote membership).
 */
export function filterTaughtCourses(
  courses: SwitchableCourse[],
  taughtSlugs: Set<string>,
): SwitchableCourse[] {
  return courses.filter((c) => taughtSlugs.has(c.slug));
}

/**
 * The landing-course law: a deep-linked `?course=` is honored ONLY when it
 * is one of the teacher's taught courses (an untaught slug degrades to the
 * first taught course, never opens the untaught builder); otherwise the
 * first taught course; no taught courses → null (the honest empty state).
 */
export function resolveInitialCourse(
  requested: string | null,
  taught: SwitchableCourse[],
): string | null {
  if (taught.length === 0) return null;
  if (requested && taught.some((c) => c.slug === requested)) return requested;
  return taught[0].slug;
}

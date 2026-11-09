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
import { adoptLegacyStorage, onAccountDocsReset } from "@/lib/account-docs";
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
/** The single-slot draft of the pre-separation era (a legacy adoption pin). */
export const LEGACY_DRAFT_KEY = "syllabai.testBuilderDraft.v1";

/** The RETIRED v2 device-key family (the legacy adoption's other pin; kept
 *  as a name for the migration tests — nothing reads it at runtime). */
export const draftKeyFor = (slug: string): string =>
  `syllabai.testBuilderDraft.v2.${slug}`;

const DRAFT_PREFIX = "syllabai.testBuilderDraft.v2."; // RETIRED (legacy adoption pin)
const DRAFT_DOC_KEY = "test-builder-drafts";
const MAX_DRAFTS = 20;

// the in-memory draft pool of record (T-ACCOUNT-ONLY run-001)
const draftPool = new Map<string, object>();

function draftPoolKey(storageKey: string): string {
  return storageKey.slice(DRAFT_PREFIX.length);
}

function readDraftPool(): Record<string, object> {
  return Object.fromEntries(draftPool);
}

function writeDraftPool(pool: Record<string, object>) {
  draftPool.clear();
  for (const [slug, draft] of Object.entries(pool)) draftPool.set(slug, draft);
}

if (typeof window !== "undefined") {
  // T-ACCOUNT-ONLY run-001 — the one-time legacy adoption: BOTH retired
  // families (the v2 per-course keys and the pre-separation v1 single slot)
  // seed the engine; they commit up only when the account has no doc of its
  // own, and the sweep retires the device keys on clean
  const legacyKeys: string[] = [];
  const legacyDrafts: Record<string, object> = {};
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k || !k.startsWith(DRAFT_PREFIX)) continue;
      const raw = window.localStorage.getItem(k);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        legacyDrafts[draftPoolKey(k)] = parsed as object;
        legacyKeys.push(k);
      }
    }
    const legacyV1 = window.localStorage.getItem(LEGACY_DRAFT_KEY);
    if (legacyV1) {
      const parsed = JSON.parse(legacyV1) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const course = (parsed as { course?: unknown }).course;
        if (typeof course === "string" && !legacyDrafts[course]) {
          legacyDrafts[course] = parsed as object;
          legacyKeys.push(LEGACY_DRAFT_KEY);
        }
      }
    }
  } catch {
    // a torn scan degrades to the pool it could read
  }
  if (legacyKeys.length > 0) {
    for (const [slug, draft] of Object.entries(legacyDrafts)) draftPool.set(slug, draft);
    adoptLegacyStorage(DRAFT_DOC_KEY, legacyKeys, () => legacyDrafts);
  }
  // account switch / sign-out: the pool clears with the engine
  onAccountDocsReset(() => {
    draftPool.clear();
  });

  bridgeDocPool<Record<string, object>, object>({
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
 * Read the draft for ONE course: the in-memory pool (hydrated from the
 * account doc; the legacy device drafts arrived through the engine's
 * one-time adoption at module init). Returns the parsed object (identity
 * law v+course enforced here; the caller owns its own shape law) or null.
 */
export function readBuilderDraft(slug: string): object | null {
  const d = draftPool.get(slug);
  return d ? parseDraft(d, slug) : null;
}

/**
 * Write (or clear with null) the per-course draft. Clearing is the
 * "committed to Your tests" and "nothing to resume" path.
 */
export function writeBuilderDraft(slug: string, draft: object | null): void {
  if (draft === null) {
    draftPool.delete(slug);
  } else {
    draftPool.set(slug, draft);
  }
  // T-AUDIT-TIER1 run-004 → T-ACCOUNT-ONLY run-001 — the account mirror IS
  // the store (the persist-tail law)
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

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

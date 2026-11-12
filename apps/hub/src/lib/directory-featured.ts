/**
 * directory-featured.ts — T-HUB-COURSES-IA-1: the storefront's featured
 * tier law, pure and unit-pinned.
 *
 * The operator's product decision (2026-11-12): the /courses directory is
 * a REAL STOREFRONT — featured tier, grouping by qualification, depth
 * surfaced. Grouping by qualification is already the page's law
 * (directory-groups.ts, T-HUB-COURSES-UI-1 run-002); this module supplies
 * the tier: the most complete lanes FIRST, so the page answers "what
 * should I look at" before it answers "what exists".
 *
 * Depth is the lane's COMMITTED corpus — the exact four counts the card
 * substance line already shows (notes + flashcards + questions + archive
 * papers), summed. Nothing inferred, nothing user-data, nothing network:
 * the same two build-time maps the hero StatChips aggregate
 * (T-HUB-COURSES-PUBLIC-2 ① + UX review F-01). A lane with zero committed
 * content (the import-pending ghosts) can never feature — depth > 0 is
 * the honesty floor.
 *
 * Selection is a pure function of (courses, bundleStats, archivePapers):
 * deterministic order = depth desc, then label, then slug (the slug is
 * unique, so the total order is total). The caller re-runs it on the
 * FILTERED set, so the tier stays meaningful under the board/level/search
 * filters — "the most complete of what you are already looking at"; the
 * render rule (show only when the tier actually curates) lives in the
 * component and is documented there.
 */
import type { CourseCounts } from "./directory-stats";
import type { DirectoryCourse } from "./directory-groups";

/** The committed-corpus depth of one lane — the substance line's own
 *  four counts, summed. `undefined` maps (absent from a map) and zero
 *  both floor at 0: an absent stat is never a claim. */
export function committedDepth(
  counts: CourseCounts | undefined,
  papers: number | undefined,
): number {
  return (
    (counts?.notes ?? 0) +
    (counts?.flashcards ?? 0) +
    (counts?.questions ?? 0) +
    (papers ?? 0)
  );
}

/** The featured tier: the top-n lanes by committed depth off the given
 *  (already-filtered) rows. Deterministic on every input; ties break by
 *  label then slug, so the same registry + maps always render the same
 *  tier (static prerender + hydration consistency depend on it). */
export function featuredCourses<T extends DirectoryCourse>(
  courses: readonly T[],
  bundleStats: Record<string, CourseCounts>,
  archivePapers: Record<string, number>,
  n = 6,
): T[] {
  return courses
    .map((c) => ({
      c,
      depth: committedDepth(bundleStats[c.slug], archivePapers[c.slug]),
    }))
    .filter((x) => x.depth > 0)
    .sort(
      (a, b) =>
        b.depth - a.depth ||
        (a.c.label ?? "").localeCompare(b.c.label ?? "") ||
        a.c.slug.localeCompare(b.c.slug),
    )
    .slice(0, n)
    .map((x) => x.c);
}

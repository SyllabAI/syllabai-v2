/**
 * Dashboard sidebar model (T-DASH-SIDEBAR-001) — the pure law behind the
 * dashboard's persistent sidebar, unit-testable with zero React. The shell
 * (components/dashboard/dashboard-shell.tsx) renders it; this file owns the
 * decisions:
 *
 *   - which level tab a registry course buckets into (the RD exam-board
 *     selector's counterpart — ours is All / IGCSE / IAL, the two levels the
 *     Edexcel corpus actually ships; CIE's A-Level/AS lanes surface under
 *     All until they earn a tab, never vanish);
 *   - the roster resolution law — the SAME one the My subjects grid obeys
 *     (stored slugs that still resolve in the registry, insertion order
 *     preserved, deduped);
 *   - the per-course quick links a roster course expands into.
 */

import type { CourseMeta } from "@/lib/courses";

/** The level selector's tabs. "all" is the honest default: the roster may
 *  span both levels (an IGCSE student pre-declaring IAL), and a tab that
 *  would hide half the roster by default is a dark pattern. */
export type LevelFilter = "all" | "igcse" | "ial";

export const LEVEL_FILTERS: { key: LevelFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "igcse", label: "IGCSE" },
  { key: "ial", label: "IAL" },
];

/** Registry level strings → selector bucket. Case-tolerant (the registry
 *  carries both "A-LEVEL" and "A-Level" shapes); anything that is not one of
 *  the two shipped Edexcel levels — CIE's "A-LEVEL"/"AS", the
 *  "Developing"/"Introducing" staging rows — buckets as "other", which is
 *  visible under "all" only. */
export function levelBucket(level: string): "igcse" | "ial" | "other" {
  const key = level.trim().toLowerCase();
  if (key === "igcse") return "igcse";
  if (key === "ial") return "ial";
  return "other";
}

export function filterCoursesByLevel<T extends { level: string }>(
  courses: T[],
  filter: LevelFilter,
): T[] {
  if (filter === "all") return courses;
  return courses.filter((c) => levelBucket(c.level) === filter);
}

/** The roster law, shared with the My subjects grid (dashboard-client):
 *  stored slugs that still resolve in the registry, insertion order
 *  preserved. Deduped here — the roster write path already refuses
 *  duplicates, but a hand-edited localStorage must not render a course
 *  twice in the accordion. */
export function resolveMySubjects(
  slugs: string[],
  bySlug: Map<string, CourseMeta>,
): CourseMeta[] {
  const seen = new Set<string>();
  const out: CourseMeta[] = [];
  for (const slug of slugs) {
    if (seen.has(slug)) continue;
    seen.add(slug);
    const meta = bySlug.get(slug);
    if (meta) out.push(meta);
  }
  return out;
}

/** The quick links a roster course expands into under the "My subjects"
 *  accordion — the five surfaces the course hub itself opens with. These go
 *  to index routes that self-describe their coverage, so no per-course
 *  corpus gate here: the course chrome (course-shell) already runs the
 *  absent-when-absent law one level deeper, where the data is loaded. */
export function courseResourceLinks(slug: string): {
  key: string;
  href: string;
  label: string;
}[] {
  const base = `/courses/${slug}`;
  return [
    { key: "hub", href: base, label: "Course hub" },
    { key: "notes", href: `${base}/revision-notes`, label: "Revision Notes" },
    { key: "questions", href: `${base}/exam-questions`, label: "Exam Questions" },
    { key: "flashcards", href: `${base}/flashcards`, label: "Flashcards" },
    { key: "papers", href: `${base}/past-papers`, label: "Past Papers" },
  ];
}

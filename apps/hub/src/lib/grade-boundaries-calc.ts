/**
 * Grade-boundaries pure helpers (isomorphic — server pages and the client
 * calculator both import these; no IO, no React).
 *
 * Grade semantics (Pearson doctrine): a boundary is the MINIMUM mark at
 * which a grade is achieved — a mark of (boundary − 1) is the grade below.
 * A null boundary means the grade was not available in that row (tier
 * capping, greyed units); it never participates in matching.
 */

export type BoundaryRow = Record<string, number | null>;

/**
 * The grade a mark achieves on one row, or null when the row has no usable
 * boundaries. Falls through to "U" when the mark is below every numbered
 * boundary (the ungraded floor), matching how the boards publish U.
 */
export function gradeForMark(
  boundaries: BoundaryRow,
  ladder: string[],
  mark: number,
): string | null {
  if (!Number.isFinite(mark) || mark < 0) return null;
  let floor: string | null = null;
  for (const grade of ladder) {
    const b = boundaries[grade];
    if (b === null || b === undefined) continue;
    if (typeof b !== "number") continue;
    if (mark >= b) return grade;
    if (grade !== "U") floor = floor ?? "U";
  }
  return ladder.includes("U") ? "U" : floor;
}

/**
 * MathsGenie "Average" mode: grade the mark against EVERY session and
 * return the modal (most common) grade with the per-session breakdown.
 * Ties break to the HIGHER grade (the kinder of the tied outcomes is also
 * the one that occurs first in ladder order — 9→1 — because we count in
 * ladder order and keep the first maximum).
 */
export function modalGradeAcrossSeries(
  series: { session: string; boundaries: BoundaryRow }[],
  ladder: string[],
  mark: number,
): { grade: string | null; perSeries: { session: string; grade: string | null }[] } {
  const perSeries = series.map((s) => ({
    session: s.session,
    grade: gradeForMark(s.boundaries, ladder, mark),
  }));
  const counts = new Map<string, number>();
  for (const p of perSeries) {
    if (p.grade === null) continue;
    counts.set(p.grade, (counts.get(p.grade) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const grade of ladder) {
    const c = counts.get(grade) ?? 0;
    if (c > bestCount) {
      best = grade;
      bestCount = c;
    }
  }
  return { grade: best, perSeries };
}

/**
 * Marks still needed to reach the next grade up (null when at the top or
 * when the next boundary is unavailable).
 */
export function marksToNextGrade(
  boundaries: BoundaryRow,
  ladder: string[],
  mark: number,
): { grade: string; marks: number } | null {
  let best: { grade: string; marks: number } | null = null;
  for (const grade of ladder) {
    const b = boundaries[grade];
    if (b === null || b === undefined || typeof b !== "number") continue;
    if (mark < b) {
      const need = b - mark;
      if (best === null || need < best.marks) best = { grade, marks: need };
    }
  }
  return best;
}

/**
 * True when a papersNote marks an R-variant row ("1CR 2CR") — the regional
 * re-sit variants Pearson publishes alongside the standard rows.
 */
export function isRegionalVariant(papersNote: string | null | undefined): boolean {
  if (!papersNote) return false;
  return /(?:^|\s)\d[A-Z]*R(?:\s|$)/.test(papersNote.trim());
}

/** The row a session's graph/calculator defaults to: standard variant first. */
export function primaryRow<T extends { papersNote?: string | null }>(
  rows: T[],
): T {
  return rows.find((r) => !isRegionalVariant(r.papersNote)) ?? rows[0];
}

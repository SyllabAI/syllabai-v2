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
 * MathsGenie's actual "Average" semantics (T-GRADE-005, operator visual
 * check of their predicted-grade-calculator): the mean of each grade's
 * published boundary across sessions, rounded to the nearest mark — the
 * averaged row then grades like any other row (gradeForMark +
 * marksToNextGrade), which is what produces their "1 · 25" style meter
 * endpoints. A grade with no numeric boundary in any session stays null;
 * sessions without that grade are skipped, never counted as zero.
 */
export function averageBoundariesAcrossSeries(
  series: { session: string; boundaries: BoundaryRow }[],
  ladder: string[],
): BoundaryRow | null {
  if (!series.length) return null;
  const row: BoundaryRow = {};
  let any = false;
  for (const grade of ladder) {
    let sum = 0;
    let n = 0;
    for (const s of series) {
      const b = s.boundaries[grade];
      if (typeof b !== "number") continue;
      sum += b;
      n += 1;
    }
    if (n > 0) {
      row[grade] = Math.round(sum / n);
      any = true;
    } else {
      row[grade] = null;
    }
  }
  return any ? row : null;
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

// ---------------------------------------------------------------------------
// Modular / IAL aggregation (T-GRADE-2)
//
// Boards award modular qualifications on aggregated UMS: each unit's raw
// mark converts to UMS through the unit's OWN published raw+UMS boundary
// pairs (piecewise-linear per grade point — the boards' documented method),
// then the UMS total is graded against the cash-in's UMS boundaries.
// The composition (which units, which optional pairs) is official board
// structure metadata carried by the bundle; every boundary VALUE is still
// document-sourced.
// ---------------------------------------------------------------------------

export interface AggregationUnit {
  code: string;
  title: string;
  maxMark: number;
  boundaries: BoundaryRow;
  ums?: {
    maxMark: number;
    boundaries: BoundaryRow;
  } | null;
}

/**
 * Raw -> UMS conversion for one unit: piecewise-linear between the
 * (raw boundary, UMS boundary) points of the unit's own published grade
 * boundaries, anchored at (0, 0) and (maxRaw, maxUms). A null boundary
 * (tier-capped / greyed grade) simply contributes no point. Rounds to the
 * nearest whole UMS mark.
 */
export function rawToUms(unit: AggregationUnit, raw: number): number | null {
  if (!unit.ums || !Number.isFinite(raw)) return null;
  const r = Math.max(0, Math.min(unit.maxMark, Math.round(raw)));
  const ladder = Object.keys(unit.ums.boundaries);
  const points: [number, number][] = [[0, 0]];
  for (const g of ladder) {
    const rb = unit.boundaries[g];
    const ub = unit.ums.boundaries[g];
    if (typeof rb === "number" && typeof ub === "number") {
      points.push([rb, ub]);
    }
  }
  points.push([unit.maxMark, unit.ums.maxMark]);
  points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  // exact hit / below the first point
  if (r <= points[0][0]) {
    return r === points[0][0] ? points[0][1] : 0;
  }
  for (let i = 0; i < points.length - 1; i++) {
    const [r0, u0] = points[i];
    const [r1, u1] = points[i + 1];
    if (r >= r0 && r <= r1) {
      if (r1 === r0) return u1;
      const frac = (r - r0) / (r1 - r0);
      return Math.round(u0 + frac * (u1 - u0));
    }
  }
  return unit.ums.maxMark;
}

/** Optional pairs the session can actually compose (both units present). */
export function usableOptionalPairs(
  optionalPairs: [string, string][] | undefined,
  units: AggregationUnit[],
): [string, string][] {
  if (!optionalPairs) return [];
  const codes = new Set(units.map((u) => u.code));
  return optionalPairs.filter(([a, b]) => codes.has(a) && codes.has(b));
}

export interface AggregateInput {
  units: AggregationUnit[];
  /** raw mark per unit code (missing/empty treated as 0) */
  marks: Record<string, number>;
}

export interface AggregateOutcome {
  perUnit: { code: string; raw: number; ums: number | null; maxUms: number }[];
  totalUms: number;
  maxUms: number;
  /** null when any unit could not convert (no UMS table) */
  complete: boolean;
}

/** Convert every composition unit and sum the UMS.
 *
 * The caller passes exactly the units that cash in (required units plus,
 * for pair-based compositions, the chosen pair's units) — pair selection
 * is a UI concern, this stays pure. */
export function aggregateUms(input: AggregateInput): AggregateOutcome {
  const perUnit = input.units.map((u) => {
    const raw = Math.max(
      0,
      Math.min(u.maxMark, Math.round(input.marks[u.code] ?? 0) || 0),
    );
    const ums = rawToUms(u, raw);
    return {
      code: u.code,
      raw,
      ums,
      maxUms: u.ums?.maxMark ?? 0,
    };
  });
  const complete = perUnit.every((p) => p.ums !== null);
  return {
    perUnit,
    totalUms: perUnit.reduce((acc, p) => acc + (p.ums ?? 0), 0),
    maxUms: perUnit.reduce((acc, p) => acc + p.maxUms, 0),
    complete,
  };
}

/**
 * Grade an aggregated UMS total against the cash-in boundaries, applying
 * the board's A* aggregate rule when the cash-in table itself has no A*
 * boundary: grade A overall AND at least (a2Min) UMS across the A2 units
 * (Pearson: "at least 90% of the A2 UMS marks" — Mathematics 480 overall
 * + 180/200 from P3+P4; six-unit IALs 480 + 270/300).
 */
export function gradeFromAggregation(
  cashIn: {
    boundaries: BoundaryRow;
    gradeLadder?: string[];
  },
  aStar:
    | { overallMin: number; a2Min: number; a2Units: string[] }
    | undefined,
  agg: AggregateOutcome,
): { grade: string | null; aStarRuleApplied: boolean } {
  const ladder = cashIn.gradeLadder ?? Object.keys(cashIn.boundaries);
  let grade = gradeForMark(cashIn.boundaries, ladder, agg.totalUms);
  let aStarRuleApplied = false;
  if (
    aStar &&
    agg.complete &&
    cashIn.boundaries["A*"] === undefined &&
    agg.totalUms >= aStar.overallMin &&
    aStar.a2Units.reduce(
      (acc, code) =>
        acc +
        (agg.perUnit.find((p) => p.code === code)?.ums ?? 0),
      0,
    ) >= aStar.a2Min
  ) {
    grade = "A*";
    aStarRuleApplied = true;
  }
  return { grade, aStarRuleApplied };
}

/**
 * T-KG-COV-1 — syllabus coverage rollup ("seen vs proven").
 *
 * The coverage question students actually ask — "how far through the
 * specification am I, what is left to cover?" — answered as ONE pure
 * function over two inputs the hub already serves:
 *
 *   1. the course's canonicalKG JSON (public/kg/data/<slug>.json,
 *      GRAPH_CONTRACT v1.0) — the syllabus structure truth:
 *      sections → subtopics → spec points, with point statements;
 *   2. the learner state join (useLearnerState drawer pointStates) —
 *      per-point evidence, either derivation path (core account or the
 *      browser-local simulated lane).
 *
 * THE BUCKET LAW (one rule, both paths):
 *   - PROVEN  — the point carries marked evidence: `stored != null`. On the
 *     sim path that is direct marked attempts; on the core path it is a
 *     direct point skill OR the topic-derived measured skill the operator's
 *     down-propagation decision (trace 1a0ea567a157e70d) lets the graph
 *     paint — the same rows the drawer tags "via <topic>".
 *   - SEEN    — self-report exposure only (notes read, cards rated, votes):
 *     the kg-learner-state law is verbatim — "exposure only — never
 *     mastery". Seeing is NOT proving, and this surface says so.
 *   - UNTOUCHED — the join knows nothing about the point.
 *
 * NOTHING HERE FABRICATES: a point the join cannot attribute is untouched,
 * never assumed. The renderer renders the rollup; this file never reads
 * the network. Pure and synchronous so bun can test the bucket law.
 */

import type { PointState } from "./kg-learner-state";

export type CoverageBucket = "proven" | "seen" | "untouched";

/** The slice of the canonicalKG JSON this rollup reads (tolerant — the
 *  GRAPH_CONTRACT v1.0 file carries more keys; extras are ignored). */
export interface CoverageGraphInput {
  sections?: Record<string, { label?: string; color?: string }>;
  /** section code → ordered [subtopicId, label] rows */
  subtopics?: Record<string, Array<[string, string]>>;
  /** subtopic id → ordered spec-point ids */
  pointSubtopics?: Record<string, string[]>;
  /** point list (id + statement text) */
  points?: Array<{ id?: string; text?: string }>;
  /** fallback statement source (nodes carry pointId + statement) */
  nodes?: Array<{
    id?: string;
    type?: string;
    pointId?: string;
    statement?: string;
    label?: string;
  }>;
}

export interface CoveragePointRow {
  pointId: string;
  statement: string;
  bucket: CoverageBucket;
  /** decayed effective mastery % (0..100) when marked evidence exists */
  effective: number | null;
}

export interface CoverageGroupRow {
  id: string;
  label: string;
  points: CoveragePointRow[];
}

export interface CoverageSectionRow {
  code: string;
  label: string;
  /** the section's own KG palette color (hex) — data-native accent */
  color?: string;
  groups: CoverageGroupRow[];
  proven: number;
  seen: number;
  untouched: number;
  total: number;
}

export interface CoverageRollup {
  sections: CoverageSectionRow[];
  proven: number;
  seen: number;
  untouched: number;
  total: number;
}

/**
 * The one bucket law. `stored != null` means marked evidence on BOTH
 * derivation paths; exposure (self-report) alone can only ever be SEEN.
 */
export function bucketForPoint(
  ps: Pick<PointState, "stored" | "exposure"> | undefined,
): CoverageBucket {
  if (!ps) return "untouched";
  if (ps.stored != null) return "proven";
  if (ps.exposure > 0) return "seen";
  return "untouched";
}

/** Numeric-aware section ordering ("1".."12" sorts, "R1" still lands). */
function sectionOrder(code: string): [number, string] {
  const n = Number(code);
  return [Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER, code];
}

/**
 * Roll the syllabus structure and the learner join into per-section
 * coverage. Sections/subtopics/points render in corpus order (the export
 * writes them syllabus-ordered); the statements prefer the `points` list
 * and fall back to the SpecificationPoint nodes (the same precedence
 * fetchTitles uses).
 */
export function rollupCoverage(
  graph: CoverageGraphInput,
  pointStates: PointState[] | undefined,
): CoverageRollup {
  const stateByPoint = new Map<string, PointState>();
  for (const p of pointStates ?? []) stateByPoint.set(p.pointId, p);

  const textByPoint = new Map<string, string>();
  for (const p of graph.points ?? []) {
    if (p.id) textByPoint.set(p.id, (p.text ?? "").trim());
  }
  for (const n of graph.nodes ?? []) {
    if (n.type === "SpecificationPoint" && n.pointId && !textByPoint.has(n.pointId)) {
      textByPoint.set(n.pointId, (n.statement ?? n.label ?? "").trim());
    }
  }

  const sections = graph.sections ?? {};
  const subtopics = graph.subtopics ?? {};
  const pointSubtopics = graph.pointSubtopics ?? {};

  const rollup: CoverageRollup = {
    sections: [],
    proven: 0,
    seen: 0,
    untouched: 0,
    total: 0,
  };

  const codes = Object.keys(sections).sort(
    (a, b) => sectionOrder(a)[0] - sectionOrder(b)[0] || sectionOrder(a)[1].localeCompare(sectionOrder(b)[1]),
  );

  for (const code of codes) {
    const sec = sections[code] ?? {};
    const groups: CoverageGroupRow[] = [];
    let proven = 0;
    let seen = 0;
    let untouched = 0;

    for (const row of subtopics[code] ?? []) {
      const subId = row[0];
      const subLabel = row[1] ?? subId;
      const points: CoveragePointRow[] = [];
      for (const pid of pointSubtopics[subId] ?? []) {
        const ps = stateByPoint.get(pid);
        const bucket = bucketForPoint(ps);
        if (bucket === "proven") proven += 1;
        else if (bucket === "seen") seen += 1;
        else untouched += 1;
        points.push({
          pointId: pid,
          statement: textByPoint.get(pid) ?? "",
          bucket,
          effective: ps?.effective ?? null,
        });
      }
      if (points.length > 0) groups.push({ id: subId, label: subLabel, points });
    }

    const total = proven + seen + untouched;
    rollup.sections.push({
      code,
      label: sec.label ?? `Section ${code}`,
      color: sec.color,
      groups,
      proven,
      seen,
      untouched,
      total,
    });
    rollup.proven += proven;
    rollup.seen += seen;
    rollup.untouched += untouched;
    rollup.total += total;
  }

  return rollup;
}

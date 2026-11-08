/**
 * directory-groups.ts — the /courses directory's grouping law, pure and
 * unit-pinned (T-HUB-COURSES-UI-1 run-002, stage 2 of the approved redesign).
 *
 * Two axes, one scan order:
 *   1. LEVEL SECTIONS — the curriculum ladder IGCSE (14–16) → AS → A-Level →
 *      IAL (16–18). This is T-HUB-COURSES-PUBLIC-1 fix ④'s deterministic
 *      ladder (it replaced the size-coincidence grouping), moved here so the
 *      run-002 redesign keeps it byte-identical in behaviour and can pin it
 *      in unit tests. Unknown levels trail by size, then alphabetical —
 *      exactly as before.
 *   2. FAMILY GROUPS inside each level — the identity lib's family order
 *      (Sciences → Maths & Computer Science → English → Business & Economics
 *      → Humanities), the approved mockup's scan order. A level section no
 *      longer renders one undifferentiated wall of cards; it renders grouped
 *      the way the subject-identity single source (run-001) sees it.
 *
 * Within a family group the rows sort canonical subject first (the identity
 * registry's own order — Chemistry before Physics before Biology, the mockup's
 * subject sequence), then board, then exam code, then label, then slug as the
 * total-order tiebreaker. Every comparison is deterministic: the same
 * registry + filter state always renders the same page (static prerender +
 * hydration consistency both depend on it).
 *
 * Unmapped subjects (a row whose string resolveSubjectKey can't fold — the
 * build gate in scripts/verify_subject_identity.ts fails CI on those, so
 * this is a resilience path, never a rendered lane today) trail their
 * family group's sort and land in "humanities" so they still render through
 * the directory's muted fallback tile rather than disappearing.
 *
 * Pure and structural (no React, no DOM, no server-only import) so the
 * grouping table is unit-pinned in directory-groups.test.ts without a
 * client component — the subject-grid.ts house pattern.
 */
import {
  CANONICAL_SUBJECTS,
  FAMILY_LABELS,
  familyRank,
  resolveSubjectKey,
  subjectFamily,
  type SubjectFamily,
} from "./subject-identity";
import { boardOf } from "./board";

/** The curriculum ladder (T-HUB-COURSES-PUBLIC-1 fix ④, verbatim law). */
export const STAGE_ORDER = ["IGCSE", "AS", "A-Level", "IAL"] as const;

export const stageRank = (level: string): number => {
  const i = (STAGE_ORDER as readonly string[]).indexOf(level);
  return i === -1 ? STAGE_ORDER.length : i;
};

/** The structural slice of CourseMeta the grouping needs — keeps this module
 *  importable from tests and the client plane without the server-only
 *  lib/courses (CourseMeta satisfies it structurally). */
export interface DirectoryCourse {
  slug: string;
  level: string;
  subject: string;
  label?: string;
  code: string;
  board?: string;
}

export interface DirectoryFamilyGroup<T extends DirectoryCourse> {
  family: SubjectFamily;
  label: string;
  courses: T[];
}

export interface DirectoryLevelGroup<T extends DirectoryCourse> {
  level: string;
  total: number;
  families: DirectoryFamilyGroup<T>[];
}

/** Canonical-subject rank (identity registry order); unmapped trails. */
function subjectOrder(subject: string): number {
  const key = resolveSubjectKey(subject);
  return key ? CANONICAL_SUBJECTS.indexOf(key) : CANONICAL_SUBJECTS.length;
}

const byDirectoryOrder = <T extends DirectoryCourse>(a: T, b: T): number =>
  subjectOrder(a.subject) - subjectOrder(b.subject) ||
  boardOf(a).localeCompare(boardOf(b)) ||
  a.code.localeCompare(b.code) ||
  (a.label ?? "").localeCompare(b.label ?? "") ||
  a.slug.localeCompare(b.slug);

/** Family for a row's subject string; unmapped trails into "humanities" so
 *  a resilience-path row still renders (inside the last family group). */
function familyOf(subject: string): SubjectFamily {
  return subjectFamily(subject) ?? "humanities";
}

/**
 * Group filtered directory rows: level sections in ladder order, family
 * groups inside each level in family order. Levels and families with zero
 * matching rows never render (the group lists are built from the input).
 */
export function groupDirectory<T extends DirectoryCourse>(
  courses: T[],
): DirectoryLevelGroup<T>[] {
  const levels = new Map<string, Map<SubjectFamily, T[]>>();
  for (const c of courses) {
    let families = levels.get(c.level);
    if (!families) {
      families = new Map();
      levels.set(c.level, families);
    }
    const family = familyOf(c.subject);
    families.set(family, [...(families.get(family) ?? []), c]);
  }
  return [...levels.entries()]
    .map(([level, families]) => {
      const grouped = [...families.entries()]
        .sort((a, b) => familyRank(a[0]) - familyRank(b[0]))
        .map(([family, rows]) => ({
          family,
          label: FAMILY_LABELS[family],
          courses: rows.sort(byDirectoryOrder),
        }));
      return {
        level,
        total: grouped.reduce((n, f) => n + f.courses.length, 0),
        families: grouped,
      };
    })
    .sort((a, b) => {
      const byStage = stageRank(a.level) - stageRank(b.level);
      if (byStage !== 0) return byStage;
      // Unknown levels trail by COURSE count (fix ④'s law), then
      // alphabetical — the map's family count is not the row count.
      return b.total - a.total || a.level.localeCompare(b.level);
    });
}

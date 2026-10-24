/**
 * subject-root — the PURE selection law for course-code → subject-row
 * resolution (no I/O, no "server-only": the law is unit-tested directly).
 *
 * Split out of core-topics.ts by T-SM-ROLLOUT-0452 r0: the bridge route
 * resolves subjects by board code alone, and the subjects table legitimately
 * carries MULTIPLE rows per code — one per curriculum version (of record:
 * two 0452 rows, "0452-2023-2025" and "0452-2027-2029", each holding its own
 * knowledge tree; T-SM-BRIDGE-WIDEN r0 exclusion "0452_duplicate_subject_code_
 * ambiguity"). The old resolver picked with `.find()` over an
 * `order by s.code` listing — intra-code order unspecified, so which tree
 * answered for "0452" was undefined behavior. This module makes the law
 * explicit and deterministic:
 *
 *   1. exactly one row carries the code  → that row (unchanged behavior for
 *      every unambiguous course — the fleet's default posture);
 *   2. several rows share the code AND the caller pins a curriculumCode
 *     (the registry row's cv law, `bundle.code + "-" + syllabusVersion`,
 *     seed law apps/api/src/services/curriculum/bundle-seed.ts:347) →
 *     the row whose joined curriculum_versions.code equals the pin;
 *   3. several rows share the code and no pin (or no row matches the pin) →
 *      null — the deterministic refusal. The honest negative (V34 posture)
 *      beats an unspecified winner: callers degrade, they never join the
 *      wrong tree.
 */

/** The hub-side view of the subjects listing wire shape. Mirrors the fields
 * core-topics.ts consumed historically (id/code/name/knowledgeNodeId) plus
 * the joined curriculum_versions.code — present on the v2 wire (the
 * SubjectView.java:11-18 port joins curriculum_versions in-statement), read
 * optionally so the law degrades on providers that omit it. */
export interface SubjectView {
  id: string;
  code: string;
  name: string;
  knowledgeNodeId: string | null;
  curriculumVersion?: { code?: string | null } | null;
}

export function pickSubjectRoot(
  subjects: SubjectView[],
  code: string,
  curriculumCode?: string | null,
): SubjectView | null {
  const hits = subjects.filter((s) => s.code === code);
  if (hits.length === 0) return null;
  if (hits.length === 1) return hits[0]!;
  if (curriculumCode) {
    const pinned = hits.find((s) => s.curriculumVersion?.code === curriculumCode);
    if (pinned) return pinned;
  }
  return null;
}

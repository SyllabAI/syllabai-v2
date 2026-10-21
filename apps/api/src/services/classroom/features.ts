/**
 * T-TEACH-002 (ADR-CLASS-0001) — the class feature-toggle STATE service.
 *
 * The toggles live in the v2-native `class_features` side table (one row per
 * class, PK class_id). ROW-ABSENT = every feature ON — the storage law that
 * keeps every pre-existing class's behavior byte-identical (defaults
 * materialize at read time; the first teacher write creates the row). The
 * Flyway-era `classes` table is NEVER altered structurally
 * (BASELINE_DB.md §4; the side table IS the compliance mechanism).
 *
 * Features (closed set, the pilot's three AI surfaces):
 *   smart_mark — ADR-025 Smart Mark auto-grading + feedback actions
 *   tutor      — the /api/v1/tutor ask family
 *   cla        — the /api/v1/learners/me/cla ask family
 *
 * Reads are ONE grouped query for any class set (the classroom batching
 * law); writes are partial UPSERTs (COALESCE keeps absent keys' values).
 * This module NEVER decides enforcement — the gate (feature-gate.ts) reads
 * the same table; this module only owns the state surface.
 */
import type { SqlFn } from "../assessment/sql";
import type { SubmitClock } from "../selfmark";
import type {
  ClassFeatureUpdateRequest,
  ClassFeaturesView,
  TeacherClassDetailView,
} from "@syllabai/contracts";

export type ClassFeature = "smart_mark" | "tutor" | "cla";

export const CLASS_FEATURES: readonly ClassFeature[] = ["smart_mark", "tutor", "cla"] as const;

/** The storage default: row-absent = every feature ON (ADR-CLASS-0001 §1). */
export const DEFAULT_CLASS_FEATURES: ClassFeaturesView = {
  smartMark: true,
  tutor: true,
  cla: true,
};

export type ClassFeaturesDeps = { sql: SqlFn; clock: SubmitClock };

/** The teacher-context deps: the ownership law and the detail projection
 *  stay single-sourced in the frozen-port module (index.ts) — injected, not
 *  duplicated (composition, never a fork). */
export type ClassFeaturesWriteDeps = ClassFeaturesDeps & {
  ownedClass: (teacherId: string, classId: string) => Promise<{ id: string }>;
  detailOf: (teacherId: string, classId: string) => Promise<TeacherClassDetailView>;
};

interface ClassFeatureRow {
  class_id: string;
  smart_mark: boolean;
  tutor: boolean;
  cla: boolean;
}

/** One grouped read for any class set; absent rows materialize the
 *  all-ON default. */
export async function featuresByClassId(
  deps: ClassFeaturesDeps,
  classIds: string[],
): Promise<Map<string, ClassFeaturesView>> {
  const out = new Map<string, ClassFeaturesView>();
  if (classIds.length === 0) return out;
  const rows = (await deps.sql`
    select class_id, smart_mark, tutor, cla
    from class_features
    where class_id = any(${classIds}::uuid[])`) as unknown as ClassFeatureRow[];
  for (const r of rows) {
    out.set(r.class_id, { smartMark: r.smart_mark, tutor: r.tutor, cla: r.cla });
  }
  for (const id of classIds) {
    if (!out.has(id)) out.set(id, { ...DEFAULT_CLASS_FEATURES });
  }
  return out;
}

/** POST /api/v1/teacher/classes/{id}/features — the teacher-owner-gated
 *  partial toggle write; answers the refreshed teacher class detail view
 *  (the features block is always present in the response). */
export async function setClassFeatures(
  deps: ClassFeaturesWriteDeps,
  teacherId: string,
  classId: string,
  request: ClassFeatureUpdateRequest,
): Promise<TeacherClassDetailView> {
  const owned = await deps.ownedClass(teacherId, classId);
  const now = deps.clock.now().toISOString();
  // Partial-update law: absent keys keep their stored value (COALESCE
  // against the existing row); the INSERT arm binds explicit booleans —
  // a first write that omits a key lands the all-ON default for it.
  await deps.sql`
    insert into class_features (class_id, smart_mark, tutor, cla, updated_at, updated_by)
    values (${owned.id}::uuid, ${request.smartMark ?? true}::boolean, ${request.tutor ?? true}::boolean,
            ${request.cla ?? true}::boolean, ${now}::timestamptz, ${teacherId}::uuid)
    on conflict (class_id) do update set
      smart_mark = coalesce(${request.smartMark ?? null}::boolean, class_features.smart_mark),
      tutor = coalesce(${request.tutor ?? null}::boolean, class_features.tutor),
      cla = coalesce(${request.cla ?? null}::boolean, class_features.cla),
      updated_at = ${now}::timestamptz,
      updated_by = ${teacherId}::uuid`;
  return deps.detailOf(teacherId, classId);
}

/**
 * F-182 build — the drill store: the ONLY persistence the drill surface
 * performs, over the injected SqlFn (the T-MIG-014 structural pattern — the
 * store is driver-agnostic and unit-tested against a stub).
 *
 * Two tables, one lane (packages/db migration 0010_drill_surface.sql):
 *   - drill_draws — the recency substrate (policy P4: naive recently-seen
 *     dedupe reads the learner's latest draws at the address) + the draw
 *     audit trail (seed, part ids, pool facts — the P5 determinism receipt).
 *   - drill_part_evidence — the F-055-SHAPED attempt evidence (ADR-016:
 *     score, time, confidence, flag), immutable by unique (draw, part) and
 *     by never issuing an UPDATE.
 *
 * ZERO-STAKES LAW: nothing here is read by any gradebook/progress projection
 * (DC-7 reads attempts/ai_mark_events/revision_note_viewed only), and no
 * attempts/ai_mark_events row is ever written. The drill writes its own
 * tables and nothing else.
 */
import type { SqlFn } from "../tutor/sql";

/** The naive recency window: the latest draws at an address whose parts count as recently-seen. */
export const RECENT_DRAWS_WINDOW = 10;

export interface DrillDrawRow {
  readonly id: string;
  readonly learnerId: string;
  readonly course: string;
  readonly code: string;
  readonly seed: number;
  readonly partIds: readonly string[];
  readonly poolSize: number;
  readonly freshPoolSize: number;
  readonly usedFallback: boolean;
  readonly createdAt: string;
}

export interface DrillDrawInsert {
  readonly learnerId: string;
  readonly course: string;
  readonly code: string;
  readonly seed: number;
  readonly partIds: readonly string[];
  readonly poolSize: number;
  readonly freshPoolSize: number;
  readonly usedFallback: boolean;
}

export interface DrillEvidenceInsert {
  readonly drawId: string;
  readonly learnerId: string;
  readonly course: string;
  readonly code: string;
  readonly partId: string;
  readonly questionId: string;
  readonly setId: string;
  readonly responseKind: "choice" | "text";
  readonly response: Record<string, string>;
  readonly correct: boolean | null;
  readonly marksAwarded: number | null;
  readonly marksPossible: number;
  readonly responseTimeMs: number;
  readonly confidenceLevel: number | null;
  readonly selfDoubtFlag: boolean;
}

/**
 * F-184 — the evidence projection the strength law reads: the columns of an
 * immutable drill_part_evidence row the S1 anchor + S2 decay clock need,
 * keyed by the address the row was recorded at. `marksAwarded` is null for
 * the ungraded structured rows (the seam refuses to invent marks) — the
 * strength law treats exactly those as ungraded.
 */
export interface DrillEvidenceKeyRow {
  readonly code: string;
  readonly partId: string;
  readonly marksAwarded: number | null;
  readonly marksPossible: number;
  /** The immutable row's write time — the graded-at clock of record (build plan Q8). */
  readonly createdAt: string;
}

export interface DrillStore {
  recordDraw(row: DrillDrawInsert): Promise<{ id: string; createdAt: string }>;
  /** The union of part ids across the learner's latest draws at one address, newest first. */
  recentDrawnPartIds(learnerId: string, course: string, code: string): Promise<string[]>;
  /** The learner's OWN draw row — ownership-scoped, so another learner's drawId is indistinguishable from an unknown one. */
  drawOf(learnerId: string, drawId: string): Promise<DrillDrawRow | null>;
  /** The immutability pre-check: an existing (draw, part) row refuses a second write. */
  evidenceIdOf(drawId: string, partId: string): Promise<string | null>;
  recordEvidence(row: DrillEvidenceInsert): Promise<{ id: string; createdAt: string }>;
  /**
   * F-184 — the read-only evidence projection the strength route serves from:
   * every evidence row the learner owns in ONE course, oldest first (the
   * strength law is order-agnostic; asc keeps the read deterministic). A
   * SELECT on the drill's OWN table — the zero-stakes law is untouched: no
   * write, no progress-bearing table, no gradebook surface.
   */
  evidenceForCourse(learnerId: string, course: string): Promise<DrillEvidenceKeyRow[]>;
}

interface DrawRowRaw {
  id: string;
  learner_id: string;
  course: string;
  code: string;
  seed: number | string;
  part_ids: string[];
  pool_size: number;
  fresh_pool_size: number;
  used_fallback: boolean;
  created_at: string;
}

function toDrawRow(r: DrawRowRaw): DrillDrawRow {
  return {
    id: r.id,
    learnerId: r.learner_id,
    course: r.course,
    code: r.code,
    seed: typeof r.seed === "string" ? Number(r.seed) : r.seed,
    partIds: Array.isArray(r.part_ids) ? r.part_ids : [],
    poolSize: r.pool_size,
    freshPoolSize: r.fresh_pool_size,
    usedFallback: r.used_fallback,
    createdAt: r.created_at,
  };
}

export function createDrillStore(sql: SqlFn): DrillStore {
  return {
    async recordDraw(row: DrillDrawInsert) {
      const rows = (await sql`
        insert into drill_draws (id, learner_id, course, code, seed, part_ids, pool_size, fresh_pool_size, used_fallback, created_at)
        values (gen_random_uuid(), ${row.learnerId}, ${row.course}, ${row.code}, ${row.seed}, ${JSON.stringify(row.partIds)}::jsonb, ${row.poolSize}, ${row.freshPoolSize}, ${row.usedFallback}, now())
        returning id, created_at
      `) as unknown as Array<{ id: string; created_at: string }>;
      const hit = rows[0];
      if (!hit) throw new Error("drill_draws insert returned no row");
      return { id: hit.id, createdAt: hit.created_at };
    },

    async recentDrawnPartIds(learnerId: string, course: string, code: string) {
      const rows = (await sql`
        select part_ids from drill_draws
        where learner_id = ${learnerId} and course = ${course} and code = ${code}
        order by created_at desc
        limit ${RECENT_DRAWS_WINDOW}
      `) as unknown as Array<{ part_ids: string[] }>;
      const seen: string[] = [];
      const unique = new Set<string>();
      for (const r of rows) {
        for (const pid of Array.isArray(r.part_ids) ? r.part_ids : []) {
          if (!unique.has(pid)) {
            unique.add(pid);
            seen.push(pid);
          }
        }
      }
      return seen;
    },

    async drawOf(learnerId: string, drawId: string) {
      const rows = (await sql`
        select id, learner_id, course, code, seed, part_ids, pool_size, fresh_pool_size, used_fallback, created_at
        from drill_draws
        where id = ${drawId} and learner_id = ${learnerId}
      `) as unknown as DrawRowRaw[];
      const hit = rows[0];
      return hit ? toDrawRow(hit) : null;
    },

    async evidenceIdOf(drawId: string, partId: string) {
      const rows = (await sql`
        select id from drill_part_evidence where draw_id = ${drawId} and part_id = ${partId}
      `) as unknown as Array<{ id: string }>;
      const hit = rows[0];
      return hit ? hit.id : null;
    },

    async recordEvidence(row: DrillEvidenceInsert) {
      const rows = (await sql`
        insert into drill_part_evidence (id, draw_id, learner_id, course, code, part_id, question_id, set_id, response_kind, response, correct, marks_awarded, marks_possible, response_time_ms, confidence_level, self_doubt_flag, provenance, created_at)
        values (gen_random_uuid(), ${row.drawId}, ${row.learnerId}, ${row.course}, ${row.code}, ${row.partId}, ${row.questionId}, ${row.setId}, ${row.responseKind}, ${JSON.stringify(row.response)}::jsonb, ${row.correct}, ${row.marksAwarded}, ${row.marksPossible}, ${row.responseTimeMs}, ${row.confidenceLevel}, ${row.selfDoubtFlag}, 'DRILL', now())
        returning id, created_at
      `) as unknown as Array<{ id: string; created_at: string }>;
      const hit = rows[0];
      if (!hit) throw new Error("drill_part_evidence insert returned no row");
      return { id: hit.id, createdAt: hit.created_at };
    },

    async evidenceForCourse(learnerId: string, course: string) {
      const rows = (await sql`
        select code, part_id, marks_awarded, marks_possible, created_at
        from drill_part_evidence
        where learner_id = ${learnerId} and course = ${course}
        order by created_at asc
      `) as unknown as Array<{
        code: string;
        part_id: string;
        marks_awarded: number | null;
        marks_possible: number;
        created_at: string;
      }>;
      return rows.map((r) => ({
        code: r.code,
        partId: r.part_id,
        marksAwarded: r.marks_awarded,
        marksPossible: r.marks_possible,
        createdAt: r.created_at,
      }));
    },
  };
}

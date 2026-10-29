/**
 * PaperAwards — the award plane (T-MG-AWARDS-1 run-001).
 * Plan of record: docs/MG-MARK-PARITY-PLAN.md §3.2.
 *
 * The parity surface: GET /api/v1/paper-marks serves the MathsGenie
 * getRegionMarks CONTRACT SHAPE (their observed §1.6 region-keyed ledger)
 * at per-AWARD grain — the thing THEIRS lacks (their ledger is
 * region-grain; duplicate codes and regrades are not row-addressable).
 * markPointId joins the definition plane (nullable: free-form regions with
 * no definition join, the plan §3.2 null-law); workingRef joins
 * mark_working_blocks (the evidence-pointer law, pin b).
 *
 * EVENT-SPINE LAW (plan §3.2, the DC-7 join): an award write publishes
 * through createGradedEvidencePublisher SEMANTICS — claim-before-write
 * once-only. The claim IS the row: the unique constraint
 * (learner_id, document_ref_id, region_key, code, ordinal) with
 * INSERT ... ON CONFLICT DO NOTHING — a won claim emits the award (the
 * evidence record of record; NO new event store — the progress surface
 * rolls up real rows, DC-7's "never a local counter" law), a lost claim
 * suppresses (the re-fire no-op, 200-never-an-error for Phase 4 re-runs).
 * The publisher owns zero-orphan ordering: workingRef is generated BEFORE
 * the claim and carried on the claimed row; the block insert runs ONLY on
 * a won claim, so a suppressed re-fire writes nothing.
 *
 * WRITE-SIDE SCORE LAW (pin a): the pipeline writes one row per mark
 * point assessed — awarded or not; non-awarded rows carry score 0 (the
 * not-scored point of their pointsNotScored[]), so the served region
 * score = Σ score over rows = Σ over awarded rows, and maxScore = Σ
 * max_score (the ledger rows are the region max authority).
 *
 * REGION-KEY BRIDGE LAW (the POST identity bridge): regionId is the REAL
 * DB uuid served by the RECT-1 regions API (questions.id for question
 * regions, question_parts.id for part regions). The bridge re-derives the
 * region key with the SAME law as services/paper-regions (REGION-KEY
 * DERIVE, plan §3.1: external_ref, else the deterministic q{n} positional
 * fallback under `external_ref asc nulls last, created_at asc, id asc`;
 * labeled part "6.a" vs answer-line "9.p{ordering+1}") and resolves the
 * documentRef (the owning exam paper). Structural duplicates of the
 * RECT-1 regex/ordering keep the fences independent (no cross-fence
 * imports — the sql.ts seam convention). documentRefType is fixed
 * "paper_asset" at the bridge (Phase-5's uploaded refs arrive with their
 * own bridge).
 *
 * Posture (pin d): learnerId is a CONSTRUCTOR-CALL parameter sourced from
 * the JWT context in the routes — it never appears on any wire shape
 * (no learnerId field exists in contracts/paper-awards.ts).
 */
import {
  paperMarksLedgerSchema,
  type MarkAwardFeedback,
  type MarkAwardWrite,
  type PaperMarksLedger,
  type PaperAwardWriteResponse,
  type ServedMarkAward,
  type ServedMarkWorkingBlock,
  type ServedRegionMarks,
} from "@syllabai/contracts";
import { NotFoundException } from "../../services/identity/errors";
import type { SqlFn } from "./sql";

export type { SqlFn };

/** The bridge resolution: the region's ledger identity + its wired part
 * (null for question regions). */
export interface ResolvedRegion {
  documentRefType: "paper_asset";
  documentRefId: string;
  regionKey: string;
  questionPartId: string | null;
}

/** The lane-supplied event: everything the publisher holds at the claim. */
export interface PaperAwardEvent {
  learnerId: string;
  documentRefType: string;
  documentRefId: string;
  regionKey: string;
  page: number | null;
  markPointId: string | null;
  code: string;
  awarded: boolean;
  score: number;
  maxScore: number;
  ordinal: number;
  pipelineVersion: string;
  feedback: MarkAwardFeedback;
  working?: { kind: "ink" | "text" | "structure"; content?: unknown };
}

/**
 * The DC-7-shaped publisher seam: true = the claim WON (the award was
 * emitted — exactly one ledger row), false = SUPPRESSED (the once-only
 * claim absorbed the re-fire; zero rows written). The doubles follow the
 * selfmark seam's documented posture (frozenParity claims-true-emits-
 * nothing is the E-2 claim-law double; noop claims-false).
 */
export interface PaperAwardPublisher {
  publishAward(event: PaperAwardEvent): Promise<boolean>;
}

export const noopPaperAwardPublisher: PaperAwardPublisher = {
  publishAward: async () => false,
};

/** The E-2 claim-law double for route tests (the frozenParity precedent,
 * named) — claims true, emits NOTHING. */
export const frozenParityPaperAwardPublisher: PaperAwardPublisher = {
  publishAward: async () => true,
};

/**
 * The LIVE publisher — the claim-before-write once-only law at row
 * granularity, zero-orphan working-block ordering (see module law).
 */
export function createPaperAwardPublisher(sql: SqlFn): PaperAwardPublisher {
  return {
    publishAward: async (event) => {
      const workingRef = event.working ? crypto.randomUUID() : null;
      // THE CLAIM (createGradedEvidencePublisher's evidence_emitted guard,
      // award-shaped): already-fired (learner, doc, region, code, ordinal)
      // is suppressed BEFORE any working-block write — once-only, not a
      // best effort.
      const inserted = (await sql`
        insert into mark_awards (id, learner_id, document_ref_type, document_ref_id,
          region_key, mark_point_id, page, code, awarded, score, max_score,
          ordinal, working_ref, pipeline_version, feedback)
        values (gen_random_uuid(), ${event.learnerId}, ${event.documentRefType},
          ${event.documentRefId}, ${event.regionKey}, ${event.markPointId},
          ${event.page}, ${event.code}, ${event.awarded}, ${event.score},
          ${event.maxScore}, ${event.ordinal}, ${workingRef},
          ${event.pipelineVersion}, ${JSON.stringify(event.feedback)}::jsonb)
        on conflict (learner_id, document_ref_id, region_key, code, ordinal) do nothing
        returning id
      `) as unknown as Array<{ id: string }>;
      if (inserted.length === 0) return false;
      if (workingRef && event.working) {
        await sql`
          insert into mark_working_blocks (id, learner_id, document_ref_type,
            document_ref_id, region_key, kind, content)
          values (${workingRef}, ${event.learnerId}, ${event.documentRefType},
            ${event.documentRefId}, ${event.regionKey}, ${event.working.kind},
            ${JSON.stringify(event.working.content ?? null)}::jsonb)
        `;
      }
      return true;
    },
  };
}

// ── region-key bridge law (structural duplicate of the RECT-1 derive) ───
const LABELED_PART = /^[a-z]/i;

interface PartHit {
  part_id: string;
  label: string;
  ordering: number;
  question_id: string;
}
interface QuestionHit {
  question_id: string;
  external_ref: string | null;
  exam_paper_id: string;
}
interface PositionHit {
  position: string | number;
}

interface AwardRow {
  id: string;
  region_key: string;
  page: number | null;
  code: string;
  awarded: boolean;
  score: number;
  max_score: number;
  ordinal: number;
  mark_point_id: string | null;
  working_ref: string | null;
  pipeline_version: string;
  feedback: MarkAwardFeedback;
  created_at: string;
  wb_id: string | null;
  wb_kind: string | null;
  wb_content: unknown;
  wb_created_at: string | null;
}

export class PaperAwards {
  constructor(
    private readonly sql: SqlFn,
    private readonly publisher: PaperAwardPublisher,
  ) {}

  /**
   * GET /api/v1/paper-marks — the learner-scoped getRegionMarks ledger.
   * Honest-empty: no rows → regions: [] (200; the observed not-marked-yet
   * shape). Deterministic: regions ordered region_key asc; awards within
   * a region ordered ordinal asc, created_at asc, id asc.
   */
  async ledger(learnerId: string, documentRefType: string, documentRefId: string): Promise<PaperMarksLedger> {
    const rows = (await this.sql`
      select a.id, a.region_key, a.page, a.code, a.awarded, a.score, a.max_score,
             a.ordinal, a.mark_point_id, a.working_ref, a.pipeline_version,
             a.feedback, a.created_at,
             wb.id as wb_id, wb.kind as wb_kind, wb.content as wb_content,
             wb.created_at as wb_created_at
      from mark_awards a
      left join mark_working_blocks wb on wb.id = a.working_ref
      where a.learner_id = ${learnerId}
        and a.document_ref_type = ${documentRefType}
        and a.document_ref_id = ${documentRefId}
      order by a.region_key asc, a.ordinal asc, a.created_at asc, a.id asc
    `) as unknown as AwardRow[];

    const byRegion = new Map<string, ServedRegionMarks>();
    for (const r of rows) {
      let region = byRegion.get(r.region_key);
      if (!region) {
        region = { regionKey: r.region_key, page: null, score: 0, maxScore: 0, awards: [], workingBlocks: [] };
        byRegion.set(r.region_key, region);
      }
      if (r.page !== null && (region.page === null || r.page < region.page)) region.page = r.page;
      if (r.awarded) region.score += r.score; // pin a: score = Σ awarded
      region.maxScore += r.max_score;
      const award: ServedMarkAward = {
        id: r.id,
        code: r.code,
        awarded: r.awarded,
        score: r.score,
        maxScore: r.max_score,
        ordinal: r.ordinal,
        markPointId: r.mark_point_id,
        page: r.page,
        workingRef: r.working_ref,
        pipelineVersion: r.pipeline_version,
        feedback: r.feedback,
        createdAt: r.created_at,
      };
      region.awards.push(award);
      // pin b: the workingRef resolution — the pointer's block rides the
      // same region slice (left join; a blockless pointer serves null —
      // impossible under the claim ordering, kept honest rather than hidden)
      if (r.wb_id) {
        const block: ServedMarkWorkingBlock = {
          id: r.wb_id,
          kind: (r.wb_kind ?? "text") as "ink" | "text" | "structure",
          content: r.wb_content,
          createdAt: r.wb_created_at ?? r.created_at,
        };
        if (!region.workingBlocks.some((b) => b.id === block.id)) region.workingBlocks.push(block);
      }
    }

    const regions = [...byRegion.values()].sort((a, b) => (a.regionKey < b.regionKey ? -1 : a.regionKey > b.regionKey ? 1 : 0));
    return paperMarksLedgerSchema.parse({
      documentRefType,
      documentRefId,
      regions,
    });
  }

  /**
   * The POST identity bridge: regionId (a REAL questions.id or
   * question_parts.id — the RECT-1 serving shape) → ledger identity.
   * Unknown region → 404 (the T-C20 envelope, "region {uuid} not found").
   */
  async resolveRegion(regionId: string): Promise<ResolvedRegion> {
    const partHits = (await this.sql`
      select p.id as part_id, p.label, p.ordering, v.question_id
      from question_parts p
      join question_versions v on v.id = p.question_version_id
      where p.id = ${regionId}
    `) as unknown as PartHit[];

    if (partHits.length > 0) {
      const part = partHits[0]!;
      const qHits = (await this.sql`
        select q.id as question_id, q.external_ref, q.exam_paper_id
        from questions q
        where q.id = ${part.question_id}
      `) as unknown as QuestionHit[];
      if (qHits.length === 0) throw new NotFoundException("region", regionId);
      const q = qHits[0]!;
      const questionKey = await this.questionKey(q);
      const regionKey = LABELED_PART.test(part.label)
        ? `${questionKey}.${part.label.toLowerCase()}`
        : `${questionKey}.p${part.ordering + 1}`;
      return { documentRefType: "paper_asset", documentRefId: q.exam_paper_id, regionKey, questionPartId: part.part_id };
    }

    const qHits = (await this.sql`
      select q.id as question_id, q.external_ref, q.exam_paper_id
      from questions q
      where q.id = ${regionId}
    `) as unknown as QuestionHit[];
    if (qHits.length === 0) throw new NotFoundException("region", regionId);
    const q = qHits[0]!;
    return { documentRefType: "paper_asset", documentRefId: q.exam_paper_id, regionKey: await this.questionKey(q), questionPartId: null };
  }

  /** questionKey = external_ref, else the deterministic q{n} fallback
   * (1-based position under the RECT-1 ordering — the window query keeps
   * nulls-last semantics a row-value comparison cannot). */
  private async questionKey(q: QuestionHit): Promise<string> {
    if (q.external_ref !== null) return q.external_ref;
    const pos = (await this.sql`
      select ranked.cnt as position from (
        select q2.id, row_number() over (order by q2.external_ref asc nulls last, q2.created_at asc, q2.id asc) as cnt
        from questions q2
        where q2.exam_paper_id = ${q.exam_paper_id}
      ) ranked
      where ranked.id = ${q.question_id}
    `) as unknown as PositionHit[];
    const n = pos.length > 0 ? Number(pos[0]!.position) : 0;
    return `q${n}`;
  }

  /**
   * POST /api/v1/paper-marks/regions/:regionId/awards — assembles the
   * lane events (identity from the bridge + the JWT learner; marking
   * truth from the body) and publishes each through the DC-7 claim.
   * Returns the claim receipt; suppressed re-fires are counted, never an
   * error (idempotent pipeline semantics).
   */
  async recordRegionAwards(input: {
    learnerId: string;
    resolution: ResolvedRegion;
    pipelineVersion: string;
    awards: MarkAwardWrite[];
  }): Promise<PaperAwardWriteResponse> {
    let emitted = 0;
    let suppressed = 0;
    let workingBlocks = 0;
    for (const award of input.awards) {
      const event: PaperAwardEvent = {
        learnerId: input.learnerId,
        documentRefType: input.resolution.documentRefType,
        documentRefId: input.resolution.documentRefId,
        regionKey: input.resolution.regionKey,
        page: award.page ?? null,
        markPointId: award.markPointId ?? null,
        code: award.code,
        awarded: award.awarded,
        score: award.score,
        maxScore: award.maxScore,
        ordinal: award.ordinal,
        pipelineVersion: input.pipelineVersion,
        feedback: award.feedback,
        working: award.working,
      };
      const won = await this.publisher.publishAward(event);
      if (won) {
        emitted += 1;
        if (award.working) workingBlocks += 1;
      } else {
        suppressed += 1;
      }
    }
    return {
      documentRefType: input.resolution.documentRefType,
      documentRefId: input.resolution.documentRefId,
      regionKey: input.resolution.regionKey,
      emitted,
      suppressed,
      workingBlocks,
    };
  }
}

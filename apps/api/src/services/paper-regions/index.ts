/**
 * PaperRegions — the region-geometry read model (T-MG-MP-RECT-1 run-001).
 * Plan of record: docs/MG-MARK-PARITY-PLAN.md §3.1.
 *
 * The parity surface: GET /api/v1/paper-assets/:id/regions serves the
 * MathsGenie getRegions CONTRACT SHAPE (their observed §1.3 region model)
 * built from OUR planes — `mark_point_rects` (geometry, added this lane) +
 * `question_parts` / `questions` / `question_versions` (identity) +
 * `mark_points` / `mark_schemes` (definition). The one deliberate
 * divergence: `questionPartId` is WIRED (their live-papers serving leaves
 * it null — MG-MARK-PARITY-PLAN §1.3/§3.1).
 *
 * REGION-KEY LAW (plan §3.1, the carding-time decision pin — DERIVE, never
 * store): keys are computed here from corpus identity, never persisted.
 *   question region: the question's `external_ref` is the corpus's stable
 *     human key; when NULL the deterministic positional fallback `q{n}`
 *     (1-based in the ordering below) applies.
 *   part region: label starting with a letter → labeled sub-part
 *     (`6.a`); otherwise the answer-line convention (`9.p1`, 1-based
 *     ordering). Their two conventions verbatim (plan §1.3).
 *
 * MARK-POINT BINDING LAW: a mark_point binds to a part directly
 * (`mark_points.question_part_id`) or at scheme level
 * (`mark_schemes.question_part_id`, ADR-040's part-granular binding, when
 * the point itself is unbound). Version-level points (no part binding
 * either way) belong to the QUESTION region.
 *
 * HEAD LAW (R-M-LAZY, the exam-papers detail precedent): only the latest
 * question_version of each question participates; version ordering is
 * `question_id, version desc`, first row per question.
 *
 * DETERMINISM: question ordering is `external_ref asc nulls last,
 * created_at asc, id asc` — stable across pagination-free repeats; the
 * positional fallback is therefore deterministic.
 *
 * HONEST-EMPTY LAW (plan §3.1 pin c, observed §1.3 negative path): a KNOWN
 * paper with no rects and no mark points returns
 * `{extracted:false, markable:false, groundingComplete:false, regions:[]}`
 * — 200, never an error. An UNKNOWN paper is the 404 T-C20 path (shared
 * "exam paper" envelope — the asset IS an exam paper).
 *
 * Posture: corpus content, zero PII — learner-free by construction; the
 * router auth shell mirrors the sibling corpus routers (any authenticated
 * user).
 */
import {
  paperAssetRegionsResponseSchema,
  type PaperAssetRegion,
  type PaperAssetRegionsResponse,
  type PaperRegionRect,
} from "@syllabai/contracts";
import { NotFoundException } from "../../services/identity/errors";
import type { SqlFn } from "./sql";

interface QuestionRow {
  question_id: string;
  external_ref: string | null;
  question_marks: number;
  version_id: string;
}
export type { QuestionRow, PartRow, PointRow, RectRow };

interface PartRow {
  part_id: string;
  question_version_id: string;
  label: string;
  marks: number;
  ordering: number;
}

interface PointRow {
  mark_point_id: string;
  marks: number;
  direct_part_id: string | null;
  scheme_part_id: string | null;
  question_version_id: string;
}

interface RectRow {
  mark_point_id: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  ordinal: number;
}

/** Part labels that read as labeled sub-parts ("a", "b", "ii") vs pure
 * answer-line ordinals ("1", "2"). A leading ASCII letter → labeled. */
const LABELED_PART = /^[a-z]/i;

export class PaperRegions {
  constructor(private readonly sql: SqlFn) {}

  async regions(paperId: string): Promise<PaperAssetRegionsResponse> {
    // (A) the asset exists — the 404 T-C20 path on unknown id.
    const papers = await this.sql`
      select p.id from exam_papers p where p.id = ${paperId}`;
    if (papers.length === 0) {
      throw new NotFoundException("exam paper", paperId);
    }

    // (B) questions + latest-version heads (R-M-LAZY batched head law).
    const questionRows = (await this.sql`
      select q.id as question_id, q.external_ref, q.marks as question_marks,
             vh.version_id
      from questions q
      join (
        select distinct on (v.question_id) v.question_id, v.id as version_id
        from question_versions v
        where v.question_id in (
          select q2.id from questions q2 where q2.exam_paper_id = ${paperId}
        )
        order by v.question_id, v.version desc
      ) vh on vh.question_id = q.id
      where q.exam_paper_id = ${paperId}
      order by q.external_ref asc nulls last, q.created_at asc, q.id asc`) as unknown as QuestionRow[];

    if (questionRows.length === 0) {
      // A paper with no questions: the honest-empty shape (nothing to
      // ground, nothing to mark).
      return { extracted: false, markable: false, groundingComplete: false, regions: [] };
    }
    const versionIds = questionRows.map((q) => q.version_id);

    // (C) parts of the head versions.
    const partRows = (await this.sql`
      select p.id as part_id, p.question_version_id, p.label, p.marks, p.ordering
      from question_parts p
      where p.question_version_id in (${versionIds}::uuid[])
      order by p.question_version_id, p.ordering asc, p.id asc`) as unknown as PartRow[];

    // (D) mark_points over those versions with their binding columns
    // (direct point→part, scheme→part, version-level).
    const pointRows = (await this.sql`
      select mp.id as mark_point_id, mp.marks,
             mp.question_part_id as direct_part_id,
             ms.question_part_id as scheme_part_id,
             ms.question_version_id
      from mark_points mp
      join mark_schemes ms on ms.id = mp.mark_scheme_id
      where ms.question_version_id in (${versionIds}::uuid[])`) as unknown as PointRow[];

    // (E) rects for those points (multi-rect, ordinal order).
    const pointIds = pointRows.map((p) => p.mark_point_id);
    const rectRows: RectRow[] =
      pointIds.length === 0
        ? []
        : ((await this.sql`
      select r.mark_point_id, r.page, r.x, r.y, r.width, r.height, r.ordinal
      from mark_point_rects r
      where r.mark_point_id in (${pointIds}::uuid[])
      order by r.mark_point_id, r.ordinal asc`) as unknown as RectRow[]);

    return assemble(questionRows, partRows, pointRows, rectRows);
  }
}

/** Pure assembly — exported for law tests (the join is the acceptance pin). */
export function assemble(
  questionRows: QuestionRow[],
  partRows: PartRow[],
  pointRows: PointRow[],
  rectRows: RectRow[],
): PaperAssetRegionsResponse {
  // rect index: mark_point_id → ordered rects
  const rectsByPoint = new Map<string, PaperRegionRect[]>();
  for (const r of rectRows) {
    const list = rectsByPoint.get(r.mark_point_id) ?? [];
    list.push({
      page: r.page,
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
      ordinal: r.ordinal,
    });
    rectsByPoint.set(r.mark_point_id, list);
  }

  // point binding: effective part id (direct wins; scheme-level when the
  // point is unbound); version-level otherwise.
  const pointsByPart = new Map<string, string[]>();
  const versionLevelPoints: string[] = [];
  for (const p of pointRows) {
    const effective = p.direct_part_id ?? p.scheme_part_id ?? null;
    if (effective === null) {
      versionLevelPoints.push(p.mark_point_id);
    } else {
      const list = pointsByPart.get(effective) ?? [];
      list.push(p.mark_point_id);
      pointsByPart.set(effective, list);
    }
  }

  // parts grouped under their head version
  const partsByVersion = new Map<string, PartRow[]>();
  for (const p of partRows) {
    const list = partsByVersion.get(p.question_version_id) ?? [];
    list.push(p);
    partsByVersion.set(p.question_version_id, list);
  }

  const regions: PaperAssetRegion[] = [];

  questionRows.forEach((q, i) => {
    const questionKey = q.external_ref ?? `q${i + 1}`;

    // version-level points' rects land on the question region
    const questionRects: PaperRegionRect[] = [];
    for (const pid of versionLevelPoints) {
      questionRects.push(...(rectsByPoint.get(pid) ?? []));
    }
    questionRects.sort((a, b) => a.page - b.page || a.ordinal - b.ordinal);

    regions.push({
      id: q.question_id,
      kind: "question",
      regionKey: questionKey,
      parentRegionId: null,
      label: questionKey,
      marks: q.question_marks,
      page: questionRects[0]?.page ?? null,
      rects: questionRects,
      questionPartId: null,
      answersOnFigure: false, // no extraction metadata until T-MG-MP-RECT-2
      markable: versionLevelPoints.length > 0,
      extracted: questionRects.length > 0,
    });

    for (const part of partsByVersion.get(q.version_id) ?? []) {
      const pointIds = pointsByPart.get(part.part_id) ?? [];
      const partRects: PaperRegionRect[] = [];
      for (const pid of pointIds) partRects.push(...(rectsByPoint.get(pid) ?? []));
      partRects.sort((a, b) => a.page - b.page || a.ordinal - b.ordinal);

      // region-key law: labeled sub-part "6.a" vs answer-line "9.p1"
      const regionKey = LABELED_PART.test(part.label)
        ? `${questionKey}.${part.label.toLowerCase()}`
        : `${questionKey}.p${part.ordering + 1}`;

      regions.push({
        id: part.part_id,
        kind: "part",
        regionKey,
        parentRegionId: q.question_id,
        label: part.label,
        marks: part.marks,
        page: partRects[0]?.page ?? null,
        rects: partRects,
        questionPartId: part.part_id, // WIRED (their live serving: null)
        answersOnFigure: false,
        markable: pointIds.length > 0,
        extracted: partRects.length > 0,
      });
    }
  });

  const extracted = regions.some((r) => r.extracted);
  const markable = regions.some((r) => r.markable);
  const groundingComplete =
    regions.length > 0 && regions.every((r) => !r.markable || r.extracted);

  const parsed = paperAssetRegionsResponseSchema.parse({
    extracted,
    markable,
    groundingComplete,
    regions,
  });
  return parsed;
}

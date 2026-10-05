/**
 * Curriculum read services (T-MIG-021 tranche 1) — the learner-facing
 * metadata surface (CurriculumController.java, Master Spec §22) and the
 * teacher review-queue READ surface (TeacherCurriculumController.java GETs
 * → CurriculumReviewService.readMethods, T-010 / Master Spec §7).
 *
 * Response shapes are pinned by the 13 curriculum golden cases captured at
 * the fixed-uuid V6 seed (T-MIG-004 run-002) — including the two non-obvious
 * behaviours the cases encode:
 *   - an unknown teacher-curriculum version yields 200 [] (subjects query
 *     returns empty → zero subtree walks), NOT a 404
 *     (golden teacher-curriculum-nodes-unknown-version-200-empty);
 *   - a malformed subject uuid is a Spring type-mismatch 400 "malformed
 *     request" BEFORE the controller runs
 *     (golden curriculum-subject-bad-uuid-400) — parsePathUuid guards the
 *     tranche-2 route layer for this.
 */
import { NotFoundException, BadRequestException } from "../identity/errors";
import type { Row } from "./sql";
import {
  CurriculumVersionsRepository,
  SubjectsRepository,
  KnowledgeStructureRepository,
  type SubjectWithVersionRow,
} from "./repository";
import {
  curriculumVersionView,
  subjectView,
  nodeView,
  type CurriculumVersionView,
  type SubjectView,
  type CurriculumOverview,
  type NodeView,
} from "./views";

export type { CurriculumVersionView, SubjectView, CurriculumOverview, NodeView };

/**
 * Java String.compareTo parity for the nodes() sort
 * (CurriculumReviewService.java:91 — Comparator.comparing(NodeView::code)):
 * UTF-16 code-unit order, case-sensitive — identical to JS </> on strings.
 */
export function byCode(a: { code: string }, b: { code: string }): number {
  if (a.code < b.code) return -1;
  if (a.code > b.code) return 1;
  return 0;
}

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * Route-layer guard for @PathVariable UUID parity. In the frozen core a
 * malformed path uuid never reaches the controller — Spring throws
 * MethodArgumentTypeMismatchException and GlobalExceptionHandler renders
 * 400 bad_request with the fixed message "malformed request"
 * (golden curriculum-subject-bad-uuid-400). identity's BadRequestException
 * ships message-less; the golden-pinned message is set here (pinned by
 * test, never widened in the shared errors file — R3/T-MIG-014 fence).
 */
export function parsePathUuid(raw: string): string {
  if (!UUID_RE.test(raw.trim())) {
    const err = new BadRequestException();
    err.message = `malformed request`; // Java's handler does NOT echo the identifier — fixed message
    throw err;
  }
  return raw.trim().toLowerCase();
}

/** CurriculumController.java parity — the learner read surface. */
export class CurriculumService {
  constructor(
    private readonly versionsRepo: CurriculumVersionsRepository,
    private readonly subjectsRepo: SubjectsRepository,
  ) {}

  /** GET /api/v1/curriculum/versions (:32-40). */
  async versions(includeArchived: boolean): Promise<CurriculumVersionView[]> {
    const rows = includeArchived
      ? await this.versionsRepo.findAllByOrderByCreatedAtDesc()
      : await this.versionsRepo.findByStatusOrderByCreatedAtDesc("ACTIVE");
    return rows.map(curriculumVersionView);
  }

  /** GET /api/v1/curriculum/subjects (:42-49). */
  async subjects(versionId: string | null): Promise<SubjectView[]> {
    const rows = versionId === null
      ? await this.subjectsRepo.findAllByOrderByCode()
      : await this.subjectsRepo.findByCurriculumVersionIdOrderByCode(versionId);
    return rows.map(subjectView);
  }

  /** GET /api/v1/curriculum/subjects/{id} (:51-56) — 404 via NotFoundException. */
  async subjectById(id: string): Promise<SubjectView> {
    const row = await this.subjectsRepo.findWithVersionById(id);
    if (row === null) throw new NotFoundException("subject", id);
    return subjectView(row);
  }
}

/**
 * CurriculumReviewService read-methods parity (versions/nodes GETs behind
 * the teacher route). The write methods (validate/reject/activate/archive)
 * are NOT part of the Wave-2 read gate — tranche 2 ships the GET routes
 * only; the POSTs are deferred with honest routing (never fake 200s).
 */
export class CurriculumReviewReadService {
  constructor(
    private readonly versionsRepo: CurriculumVersionsRepository,
    private readonly subjectsRepo: SubjectsRepository,
    private readonly knowledge: KnowledgeStructureRepository,
  ) {}

  /**
   * versions() (CurriculumReviewService.java:57-76): per version, per
   * subject, subtree validation-status counts merged across subjects.
   * Subjects with a null knowledge_node_id contribute nothing (treeCounts
   * returns an empty map — :170-172).
   */
  async versions(): Promise<CurriculumOverview[]> {
    const versionRows = await this.versionsRepo.findAllByOrderByCreatedAtDesc();
    const overviews: CurriculumOverview[] = [];
    for (const v of versionRows) {
      const counts = { VALIDATED: 0, SUGGESTED: 0, UNVALIDATED: 0 };
      const subjectRows = await this.subjectsRepo.findByCurriculumVersionIdOrderByCode(String(v.id));
      for (const s of subjectRows) {
        const tree = s.knowledge_node_id === null ? {} : await this.treeCounts(String(s.knowledge_node_id));
        counts.VALIDATED += tree.VALIDATED ?? 0;
        counts.SUGGESTED += tree.SUGGESTED ?? 0;
        counts.UNVALIDATED += tree.UNVALIDATED ?? 0;
      }
      overviews.push({
        id: String(v.id),
        board: String(v.board),
        qualification: String(v.qualification),
        code: String(v.code),
        title: String(v.title),
        status: String(v.status),
        validatedNodes: counts.VALIDATED,
        suggestedNodes: counts.SUGGESTED,
        unvalidatedNodes: counts.UNVALIDATED,
      });
    }
    return overviews;
  }

  /**
   * nodes(curriculumVersionId, status) (:78-93): subjects of the version in
   * code order, their subtree nodes (status-filtered when given), PART_OF
   * parents attached, the whole list sorted by code. Unknown version →
   * empty subject list → 200 [] (NO 404 — golden-pinned).
   */
  async nodes(curriculumVersionId: string, status: string | null): Promise<NodeView[]> {
    const subjectRows = await this.subjectsRepo.findByCurriculumVersionIdOrderByCode(curriculumVersionId);
    const views: NodeView[] = [];
    for (const s of subjectRows) {
      if (s.knowledge_node_id === null) continue;
      const subtreeIds = await this.knowledge.findSubtreeIds(String(s.knowledge_node_id));
      const nodeRows = await this.knowledge.findNodesByIds(subtreeIds);
      const parents = await this.knowledge.findPartOfParentsBySources(subtreeIds);
      for (const n of nodeRows) {
        if (status !== null && String(n.validation_status) !== status) continue;
        views.push(nodeView(n, parents[String(n.id)] ?? null));
      }
    }
    views.sort(byCode);
    return views;
  }

  /** treeCounts (:169-182) — subtree status histogram for one root. */
  private async treeCounts(rootId: string): Promise<Record<string, number>> {
    const subtreeIds = await this.knowledge.findSubtreeIds(rootId);
    const nodeRows = await this.knowledge.findNodesByIds(subtreeIds);
    const counts: Record<string, number> = {};
    for (const n of nodeRows) {
      const status = String(n.validation_status);
      counts[status] = (counts[status] ?? 0) + 1;
    }
    return counts;
  }
}

/** Exported for the tranche-2 composition + tests. */
export type { SubjectWithVersionRow, Row };

/**
 * ExamPaperViews port (T-MIG-031 tranche 1).
 *
 * Frozen law (ExamPaperController.java, syllabai-core @ 6cad6ef) — exam-paper
 * browsing (Master Spec §6.5, §22). Any authenticated user may list/view
 * (SecurityConfig :91 — no role rules on the base path); serving individual
 * questions remains the questions endpoints' responsibility.
 *
 *   - list (GET /api/v1/exam-papers, optional subjectId): findAllBy[SubjectId]
 *     OrderByCreatedAtDesc → PaperView.from (newest-first by created_at).
 *   - get (GET /api/v1/exam-papers/{id}): paper 404 via the shared
 *     NotFoundException("exam paper", id); questions difficulty-ordered
 *     (findAllByExamPaperIdOrderByDifficultyAsc); per-question LATEST version
 *     (findByQuestionIdOrderByVersionDesc — Java issues this PER QUESTION
 *     N+1; ported batched per R-M-LAZY, disclosed); specPointRefs via the
 *     ServableQuestionService shared projection (T-C28 — the SAME dialect
 *     every question-carrying payload speaks); honest absence: questions
 *     without a curriculum mapping simply carry an empty specPoints list.
 *
 * PaperQuestionView null-vs-empty facts (controller construction, mirrored
 * by the T-MIG-018 paperQuestionViewSchema): versionValidationState and
 * currentVersionId null when the question has NO version yet; partCount 0 in
 * the same branch; specPoints NEVER null.
 */
import type {
  ExamPaperDetailResponse,
  ExamPaperView,
  PaperQuestionView,
  QuestionProvenance,
  ValidationState,
} from "@syllabai/contracts";
import { NotFoundException } from "../identity/errors";
import type { ServableQuestions } from "../questions/servable";
import type { SqlFn } from "./sql";

interface PaperRow {
  id: string;
  subject_id: string | null;
  title: string;
  board: string | null;
  qualification: string | null;
  unit: string | null;
  session_label: string | null;
  paper_code: string | null;
  question_paper_document_id: string | null;
  mark_scheme_document_id: string | null;
  validation_state: ValidationState;
  provenance: QuestionProvenance;
  created_at: string;
}

interface PaperQuestionRow {
  id: string;
  external_ref: string | null;
  marks: number;
  provenance: QuestionProvenance;
}

interface VersionHeadRow {
  question_id: string;
  version_id: string;
  version: number;
  validation_state: ValidationState;
  part_count: number;
}

export class ExamPaperViews {
  constructor(
    private readonly sql: SqlFn,
    private readonly servable: ServableQuestions,
  ) {}

  /** PaperView.from — the record construction, verbatim. */
  private paperView(p: PaperRow): ExamPaperView {
    return {
      id: p.id,
      subjectId: p.subject_id,
      title: p.title,
      board: p.board,
      qualification: p.qualification,
      unit: p.unit,
      sessionLabel: p.session_label,
      paperCode: p.paper_code,
      validationState: p.validation_state,
      provenance: p.provenance,
      questionPaperDocumentId: p.question_paper_document_id,
      markSchemeDocumentId: p.mark_scheme_document_id,
    };
  }

  /** GET / list — findAllBy[SubjectId]OrderByCreatedAtDesc. */
  async list(subjectId: string | null): Promise<ExamPaperView[]> {
    const rows =
      subjectId === null
        ? ((await this.sql`
            select p.id, p.subject_id, p.title, p.board, p.qualification, p.unit,
                   p.session_label, p.paper_code, p.question_paper_document_id,
                   p.mark_scheme_document_id, p.validation_state, p.provenance,
                   p.created_at
            from exam_papers p
            order by p.created_at desc`) as unknown as unknown as PaperRow[])
        : ((await this.sql`
            select p.id, p.subject_id, p.title, p.board, p.qualification, p.unit,
                   p.session_label, p.paper_code, p.question_paper_document_id,
                   p.mark_scheme_document_id, p.validation_state, p.provenance,
                   p.created_at
            from exam_papers p
            where p.subject_id = ${subjectId}
            order by p.created_at desc`) as unknown as unknown as PaperRow[]);
    return rows.map((p) => this.paperView(p));
  }

  /** GET /{id} — PaperDetailView (200 | 404 NotFoundException). */
  async detail(id: string): Promise<ExamPaperDetailResponse> {
    const papers = (await this.sql`
      select p.id, p.subject_id, p.title, p.board, p.qualification, p.unit,
             p.session_label, p.paper_code, p.question_paper_document_id,
             p.mark_scheme_document_id, p.validation_state, p.provenance,
             p.created_at
      from exam_papers p
      where p.id = ${id}`) as unknown as PaperRow[];
    if (papers.length === 0) {
      throw new NotFoundException("exam paper", id);
    }

    const questionRows = (await this.sql`
      select q.id, q.external_ref, q.marks, q.provenance
      from questions q
      where q.exam_paper_id = ${id}
      order by q.difficulty`) as unknown as PaperQuestionRow[];

    // Java: per-question questionVersions.findByQuestionIdOrderByVersionDesc
    // (N+1) + latest.parts().size() (lazy parts). Ported batched (R-M-LAZY):
    // one versions query with a part-count subselect; first row per question
    // in version-desc order = the latest.
    const versionHeads = new Map<string, VersionHeadRow>();
    if (questionRows.length > 0) {
      const rows = (await this.sql`
        select v.question_id, v.id as version_id, v.version, v.validation_state,
               (select count(*) from question_parts p
                where p.question_version_id = v.id) as part_count
        from question_versions v
        where v.question_id = any(${questionRows.map((q) => q.id)}::uuid[])
        order by v.question_id, v.version desc`) as unknown as VersionHeadRow[];
      for (const r of rows) {
        if (!versionHeads.has(r.question_id)) versionHeads.set(r.question_id, r);
      }
    }

    // T-C28 shared projection: the SAME specPointRefs the learner question
    // views use (no second SQL contract, no divergent ordering rules)
    const refs = await this.servable.specPointRefs(questionRows.map((q) => q.id));

    const questions: PaperQuestionView[] = questionRows.map((q) => {
      const head = versionHeads.get(q.id);
      const specPoints = refs.get(q.id) ?? [];
      return {
        questionId: q.id,
        externalRef: q.external_ref,
        marks: q.marks,
        provenance: q.provenance,
        versionValidationState: head ? head.validation_state : null,
        partCount: head ? head.part_count : 0,
        currentVersionId: head ? head.version_id : null,
        // honest absence: questions without a curriculum mapping simply carry
        // an empty list (T-C28)
        specPoints,
      };
    });

    return { paper: this.paperView(papers[0]!), questions };
  }
}

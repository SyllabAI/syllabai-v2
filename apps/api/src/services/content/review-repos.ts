/**
 * Assessment-side read repositories for the teacher content review
 * projections — the OBSERVED query surfaces (R-LAZY doctrine) of the frozen
 * assessment repositories consumed by ContentController/ContentReviewService
 * read paths (syllabai-core @ main, frozen, verified 2026-10-05, T-MIG-020):
 *   assessment/QuestionVersionRepository.java (countByPaperAndState,
 *     avgExtractionConfidenceByPaper, findByPaperId)
 *   assessment/MarkSchemeRepository.java (countByPaperAndState,
 *     countQuestionsWithSchemesByPaper, findByPaperId)
 *   assessment/QuestionRepository.java (countAndMappedByPaper,
 *     findDistinctPrimaryTopicsByPaperIds, findAllByExamPaperIdOrderByDifficultyAsc,
 *     findById)
 *   assessment/QuestionTopicRepository.java (findByQuestionId, findMappingsByPaper)
 *   knowledge/KnowledgeNodeRepository.java (findById — topic row display)
 */
import type { SqlFn } from "../identity/users";

type Row = Record<string, unknown>;

export class QuestionVersionReadRepository {
  constructor(private readonly sql: SqlFn) {}

  /**
   * Full version rows for the paperReview walk (ContentReviewService
   * toVersionReviewView :881-910): the version fields plus its question's
   * fallback fields (question stem/marks back the version when null —
   * Java:903-904).
   */
  async findFullByPaperId(
    paperId: string,
  ): Promise<
    Array<{
      versionId: string;
      questionId: string;
      stem: string | null;
      marks: number;
      version: number;
      validationState: string;
      commandWord: string | null;
      extractionConfidence: number | null;
      extractionMethod: string | null;
      sourceDocumentId: string | null;
      externalRef: string | null;
      questionType: string | null;
      questionStem: string;
      questionMarks: number;
    }>
  > {
    const rows: Row[] = await this.sql`
      select v.id as version_id, v.question_id, v.stem, v.marks, v.version,
             v.validation_state, v.command_word, v.extraction_confidence,
             v.extraction_method, v.source_document_id,
             q.external_ref, q.question_type, q.stem as question_stem, q.marks as question_marks
      from question_versions v
      join questions q on q.id = v.question_id
      where q.exam_paper_id = ${paperId}::uuid`;
    return rows.map((v) => ({
      versionId: String(v.version_id),
      questionId: String(v.question_id),
      stem: v.stem == null ? null : String(v.stem),
      marks: Number(v.marks),
      version: Number(v.version),
      validationState: String(v.validation_state),
      commandWord: v.command_word == null ? null : String(v.command_word),
      extractionConfidence:
        v.extraction_confidence == null ? null : Number(v.extraction_confidence),
      extractionMethod: v.extraction_method == null ? null : String(v.extraction_method),
      sourceDocumentId: v.source_document_id == null ? null : String(v.source_document_id),
      externalRef: v.external_ref == null ? null : String(v.external_ref),
      questionType: v.question_type == null ? null : String(v.question_type),
      questionStem: String(v.question_stem),
      questionMarks: Number(v.question_marks),
    }));
  }

  /** Question parts of one version (PartReview walk, Java:887-890). */
  async findPartsByVersionId(
    questionVersionId: string,
  ): Promise<
    Array<{ id: string; label: string; prompt: string; commandWord: string | null; marks: number }>
  > {
    const rows: Row[] = await this.sql`
      select id, label, prompt, command_word, marks
      from question_parts where question_version_id = ${questionVersionId}::uuid
      order by ordering asc`;
    return rows.map((p) => ({
      id: String(p.id),
      label: String(p.label),
      prompt: String(p.prompt),
      commandWord: p.command_word == null ? null : String(p.command_word),
      marks: Number(p.marks),
    }));
  }

  /**
   * Port of countByPaperAndState — per-paper version counts grouped by
   * validation state, joined through questions (the paper link lives on
   * questions, not on question_versions).
   */
  async countByPaperAndState(): Promise<Array<{ paperId: string; state: string; count: number }>> {
    const rows: Row[] = await this.sql`
      select q.exam_paper_id as paper_id, v.validation_state as state, count(*) as count
      from question_versions v
      join questions q on q.id = v.question_id
      where q.exam_paper_id is not null
      group by q.exam_paper_id, v.validation_state`;
    return rows.map((r) => ({
      paperId: String(r.paper_id),
      state: String(r.state),
      count: Number(r.count),
    }));
  }

  /** Port of avgExtractionConfidenceByPaper. */
  async avgExtractionConfidenceByPaper(): Promise<Array<{ paperId: string; avg: number }>> {
    const rows: Row[] = await this.sql`
      select q.exam_paper_id as paper_id, avg(v.extraction_confidence) as avg
      from question_versions v
      join questions q on q.id = v.question_id
      where q.exam_paper_id is not null and v.extraction_confidence is not null
      group by q.exam_paper_id`;
    return rows.map((r) => ({ paperId: String(r.paper_id), avg: Number(r.avg) }));
  }

  /** Port of findByPaperId (audit + review walk). */
  async findByPaperId(paperId: string): Promise<Array<{ id: string }>> {
    const rows: Row[] = await this.sql`
      select v.id
      from question_versions v
      join questions q on q.id = v.question_id
      where q.exam_paper_id = ${paperId}::uuid`;
    return rows.map((r) => ({ id: String(r.id) }));
  }
}

export class MarkSchemeReadRepository {
  constructor(private readonly sql: SqlFn) {}

  /**
   * Port of findFirstByQuestionVersionIdOrderByCreatedAtDesc — the scheme
   * behind one question version (paperReview + batch validation call site).
   */
  async findFirstByQuestionVersionIdOrderByCreatedAtDesc(
    questionVersionId: string,
  ): Promise<{ id: string; validationState: string } | null> {
    const rows: Row[] = await this.sql`
      select id, validation_state from mark_schemes
      where question_version_id = ${questionVersionId}::uuid
      order by created_at desc limit 1`;
    if (rows.length === 0 || !rows[0]) return null;
    return { id: String(rows[0].id), validationState: String(rows[0].validation_state) };
  }

  /** Mark points of one scheme (PointReview walk, Java:894-900). */
  async findPointsBySchemeId(
    schemeId: string,
  ): Promise<Array<{ id: string; ref: string | null; text: string; marks: number; acceptanceCriteria: unknown }>> {
    const rows: Row[] = await this.sql`
      select id, ref, text, marks, acceptance_criteria
      from mark_points where mark_scheme_id = ${schemeId}::uuid`;
    return rows.map((mp) => ({
      id: String(mp.id),
      ref: mp.ref == null ? null : String(mp.ref),
      text: String(mp.text),
      marks: Number(mp.marks),
      acceptanceCriteria: mp.acceptance_criteria,
    }));
  }

  /** Port of countByPaperAndState — per-paper SUGGESTED-scheme counts. */
  async countByPaperAndState(): Promise<Array<{ paperId: string; state: string; count: number }>> {
    const rows: Row[] = await this.sql`
      select q.exam_paper_id as paper_id, s.validation_state as state, count(*) as count
      from mark_schemes s
      join question_versions v on v.id = s.question_version_id
      join questions q on q.id = v.question_id
      where q.exam_paper_id is not null
      group by q.exam_paper_id, s.validation_state`;
    return rows.map((r) => ({
      paperId: String(r.paper_id),
      state: String(r.state),
      count: Number(r.count),
    }));
  }

  /** Port of countQuestionsWithSchemesByPaper — v3 scheme-linkage signal. */
  async countQuestionsWithSchemesByPaper(): Promise<Array<{ paperId: string; count: number }>> {
    const rows: Row[] = await this.sql`
      select q.exam_paper_id as paper_id, count(distinct s.question_version_id) as count
      from mark_schemes s
      join question_versions v on v.id = s.question_version_id
      join questions q on q.id = v.question_id
      where q.exam_paper_id is not null
      group by q.exam_paper_id`;
    return rows.map((r) => ({ paperId: String(r.paper_id), count: Number(r.count) }));
  }

  /** Port of findByPaperId (audit walk). */
  async findByPaperId(paperId: string): Promise<Array<{ id: string }>> {
    const rows: Row[] = await this.sql`
      select s.id
      from mark_schemes s
      join question_versions v on v.id = s.question_version_id
      join questions q on q.id = v.question_id
      where q.exam_paper_id = ${paperId}::uuid`;
    return rows.map((r) => ({ id: String(r.id) }));
  }
}

export class QuestionReadRepository {
  constructor(private readonly sql: SqlFn) {}

  /** Port of countAndMappedByPaper — v3 mapping-coverage census [total, mapped]. */
  async countAndMappedByPaper(): Promise<
    Array<{ paperId: string; total: number; mapped: number }>
  > {
    const rows: Row[] = await this.sql`
      select exam_paper_id as paper_id, count(*) as total,
             count(primary_topic_node_id) as mapped
      from questions
      where exam_paper_id is not null
      group by exam_paper_id`;
    return rows.map((r) => ({
      paperId: String(r.paper_id),
      total: Number(r.total),
      mapped: Number(r.mapped),
    }));
  }

  /**
   * Port of findDistinctPrimaryTopicsByPaperIds — the topics the pilot can
   * already practise from VALIDATED papers (v3 novel-coverage baseline).
   */
  async findDistinctPrimaryTopicsByPaperIds(paperIds: string[]): Promise<Set<string>> {
    if (paperIds.length === 0) return new Set();
    const rows: Row[] = await this.sql`
      select distinct primary_topic_node_id as topic_id
      from questions
      where exam_paper_id = any(${paperIds}::uuid[])
        and primary_topic_node_id is not null`;
    return new Set(rows.map((r) => String(r.topic_id)));
  }

  /** Port of findAllByExamPaperIdOrderByDifficultyAsc (audit walk). */
  async findAllByExamPaperIdOrderByDifficultyAsc(paperId: string): Promise<Array<{ id: string }>> {
    const rows: Row[] = await this.sql`
      select id from questions
      where exam_paper_id = ${paperId}::uuid
      order by difficulty asc`;
    return rows.map((r) => ({ id: String(r.id) }));
  }

  /** Question options (OptionReview walk, Java:883-886) — options live on the QUESTION. */
  async findOptionsByQuestionId(
    questionId: string,
  ): Promise<
    Array<{ id: string; label: string; text: string; correct: boolean; misconceptionNodeId: string | null }>
  > {
    const rows: Row[] = await this.sql`
      select id, label, option_text, is_correct, misconception_node_id
      from question_options where question_id = ${questionId}::uuid
      order by ordering asc`;
    return rows.map((o) => ({
      id: String(o.id),
      label: String(o.label),
      text: String(o.option_text),
      correct: o.is_correct === true,
      misconceptionNodeId:
        o.misconception_node_id == null ? null : String(o.misconception_node_id),
    }));
  }

  /** Port of findById (topic-row existence gate). */
  async findById(id: string): Promise<{ id: string; primaryTopicNodeId: string | null } | null> {
    const rows: Row[] = await this.sql`
      select id, primary_topic_node_id from questions where id = ${id}::uuid limit 1`;
    if (rows.length === 0 || !rows[0]) return null;
    return {
      id: String(rows[0].id),
      primaryTopicNodeId:
        rows[0].primary_topic_node_id == null ? null : String(rows[0].primary_topic_node_id),
    };
  }
}

export class QuestionTopicReadRepository {
  constructor(private readonly sql: SqlFn) {}

  /** Port of findByQuestionId. */
  async findByQuestionId(questionId: string): Promise<Array<{ nodeId: string; primary: boolean }>> {
    const rows: Row[] = await this.sql`
      select node_id, is_primary from question_topics
      where question_id = ${questionId}::uuid`;
    return rows.map((r) => ({ nodeId: String(r.node_id), primary: r.is_primary === true }));
  }

  /** Port of findMappingsByPaper — v3 curriculum-mapping coverage signal. */
  async findMappingsByPaper(): Promise<Array<{ paperId: string; nodeId: string }>> {
    const rows: Row[] = await this.sql`
      select q.exam_paper_id as paper_id, t.node_id
      from question_topics t
      join questions q on q.id = t.question_id
      where q.exam_paper_id is not null`;
    return rows.map((r) => ({ paperId: String(r.paper_id), nodeId: String(r.node_id) }));
  }
}

export class KnowledgeNodeDisplayRepository {
  constructor(private readonly sql: SqlFn) {}

  /** Port of findById restricted to the display fields the topic rows carry. */
  async findById(
    id: string,
  ): Promise<{ id: string; code: string | null; title: string | null } | null> {
    const rows: Row[] = await this.sql`
      select id, code, title from knowledge_nodes where id = ${id}::uuid limit 1`;
    if (rows.length === 0 || !rows[0]) return null;
    return {
      id: String(rows[0].id),
      code: rows[0].code == null ? null : String(rows[0].code),
      title: rows[0].title == null ? null : String(rows[0].title),
    };
  }
}

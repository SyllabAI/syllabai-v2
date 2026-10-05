/**
 * Assessment-side repositories behind the teacher content-review read model
 * (T-MIG-020 tranche 2). R-LAZY doctrine: each method ports the OBSERVED
 * query surface of the frozen repository (ContentReviewService's call
 * sequence), not the entity map — table/column names are the Flyway-owned
 * DDL (V3/V8/V13/V20/V22), read row-level only per BASELINE_DB.md §4.
 *
 * Fetch-strategy note (documented deviation, core precedent): the frozen
 * service reaches question/option/part/scheme/point data through LAZY entity
 * graphs (version.question(), question.options(), scheme.points() …), which
 * the Java core pays for as N+1 round-trips. This port batches each family
 * into one query with identical rows and identical per-family ordering —
 * the same "serving boundaries unchanged, fetch strategy changed" trade the
 * core itself made in QuestionVersionRepository.findWithPartsByQuestionIdsIn.
 * Application-issued repository calls (e.g. the per-paper bridge lookup in
 * baseEnrichment) are ported VERBATIM instead — call sequence is parity.
 */
import type { SqlFn } from "./sql";

// ── row types (the read-model slices the review surfaces consume) ──────────

/** exam_papers (V8:15-35 + V20 FLAGGED widening). */
export interface ExamPaperRow {
  id: string;
  subjectId: string;
  title: string;
  board: string;
  qualification: string;
  unit: string | null;
  sessionLabel: string | null;
  paperCode: string | null;
  questionPaperDocumentId: string | null;
  markSchemeDocumentId: string | null;
  validationState: string;
  provenance: string;
  extractionMethod: string | null;
  createdBy: string | null;
  createdAt: Date;
}

/** questions (V3:3-21 + V8 exam_paper_id). */
export interface QuestionRow {
  id: string;
  externalRef: string | null;
  questionType: string;
  stem: string;
  marks: number;
  difficulty: number;
  expectedTimeSeconds: number;
  commandWord: string | null;
  primaryTopicNodeId: string | null;
  examPaperId: string | null;
  active: boolean;
  createdAt: Date;
}

/** question_versions (V8:51-68 + V20 FLAGGED widening). */
export interface QuestionVersionRow {
  id: string;
  questionId: string;
  version: number;
  stem: string | null;
  marks: number;
  commandWord: string | null;
  validationState: string;
  sourceDocumentId: string | null;
  extractionConfidence: number | null;
  extractionMethod: string | null;
  createdAt: Date;
}

/** mark_schemes (V8:97-108 + V20 FLAGGED widening). */
export interface MarkSchemeRow {
  id: string;
  questionVersionId: string;
  versionLabel: string;
  validationState: string;
  createdAt: Date;
}

/** mark_points (V8:110-121). */
export interface MarkPointRow {
  id: string;
  markSchemeId: string;
  questionPartId: string | null;
  ref: string | null;
  ordering: number;
  text: string;
  marks: number;
  /** jsonb — Java entity type is List<String>; kept as the raw stored value. */
  acceptanceCriteria: unknown;
  createdAt: Date;
}

/** question_options (V3:34-45). */
export interface QuestionOptionRow {
  id: string;
  questionId: string;
  label: string;
  optionText: string;
  isCorrect: boolean;
  misconceptionNodeId: string | null;
  ordering: number;
}

/** question_parts (V8:82-92). */
export interface QuestionPartRow {
  id: string;
  questionVersionId: string;
  label: string;
  prompt: string;
  commandWord: string | null;
  marks: number;
  ordering: number;
}

/** question_topics (V3:25-32). */
export interface QuestionTopicRow {
  id: string;
  questionId: string;
  nodeId: string;
  isPrimary: boolean;
}

/** knowledge_nodes (V2:27-40) — the read-model slice only. */
export interface KnowledgeNodeRow {
  id: string;
  code: string;
  title: string;
}

/** glm_ocr_bridge_records (V13:20-40). */
export interface BridgeRecordRow {
  id: string;
  paperId: string;
  reconciliationStatus: string;
  /** jsonb stored text — Java entity reads it as String and substring-counts. */
  reviewFindings: string;
  createdAt: Date;
}

/** content_review_audit (V22:25-41). */
export interface AuditRow {
  id: number;
  occurredAt: Date;
  actorLabel: string;
  action: string;
  targetType: string;
  targetId: string;
  fromState: string | null;
  toState: string | null;
  detail: string;
}

const str = (v: unknown): string => String(v);
const nstr = (v: unknown): string | null => (v == null ? null : String(v));
const num = (v: unknown): number => Number(v);
const nnum = (v: unknown): number | null => (v == null ? null : Number(v));
/** jsonb over the wire: keep the TEXT semantics the Java entity sees. */
const jsonText = (v: unknown): string =>
  typeof v === "string" ? v : JSON.stringify(v);

export const mapExamPaper = (r: Record<string, unknown>): ExamPaperRow => ({
  id: str(r.id),
  subjectId: str(r.subject_id),
  title: str(r.title),
  board: str(r.board),
  qualification: str(r.qualification),
  unit: nstr(r.unit),
  sessionLabel: nstr(r.session_label),
  paperCode: nstr(r.paper_code),
  questionPaperDocumentId: nstr(r.question_paper_document_id),
  markSchemeDocumentId: nstr(r.mark_scheme_document_id),
  validationState: str(r.validation_state),
  provenance: str(r.provenance),
  extractionMethod: nstr(r.extraction_method),
  createdBy: nstr(r.created_by),
  createdAt: new Date(r.created_at as string),
});

// ── repositories (one per table, verbatim queries) ─────────────────────────

export class QuestionVersionsRepository {
  constructor(private readonly sql: SqlFn) {}

  /** findSuggested (QuestionVersionRepository.java:39-44). */
  async findSuggested(): Promise<QuestionVersionRow[]> {
    const rows = await this.sql`
      select * from question_versions
      where validation_state = 'SUGGESTED'
      order by created_at desc`;
    return rows.map(mapVersion);
  }

  /**
   * findByPaperId (:46-51) — external_ref nulls last, version desc; the
   * ordering key lives on the parent question, hence the join.
   */
  async findByPaperId(paperId: string): Promise<QuestionVersionRow[]> {
    const rows = await this.sql`
      select v.* from question_versions v
      join questions q on q.id = v.question_id
      where q.exam_paper_id = ${paperId}
      order by q.external_ref nulls last, v.version desc`;
    return rows.map(mapVersion);
  }

  /** countByPaperAndState (:54-59) — one aggregate over the paper grouping. */
  async countByPaperAndState(): Promise<
    Array<{ paperId: string | null; state: string; count: number }>
  > {
    const rows = await this.sql`
      select q.exam_paper_id, v.validation_state, count(*) as cnt
      from question_versions v join questions q on q.id = v.question_id
      group by q.exam_paper_id, v.validation_state`;
    return rows.map((r) => ({
      paperId: nstr(r.exam_paper_id),
      state: str(r.validation_state),
      count: num(r.cnt),
    }));
  }

  /** avgExtractionConfidenceByPaper (:62-68). */
  async avgExtractionConfidenceByPaper(): Promise<
    Array<{ paperId: string | null; avgConfidence: number }>
  > {
    const rows = await this.sql`
      select q.exam_paper_id, avg(v.extraction_confidence) as avg_conf
      from question_versions v join questions q on q.id = v.question_id
      where v.extraction_confidence is not null
      group by q.exam_paper_id`;
    return rows.map((r) => ({
      paperId: nstr(r.exam_paper_id),
      avgConfidence: num(r.avg_conf),
    }));
  }
}

export class MarkSchemesRepository {
  constructor(private readonly sql: SqlFn) {}

  /** findSuggested (MarkSchemeRepository.java:41-46). */
  async findSuggested(): Promise<MarkSchemeRow[]> {
    const rows = await this.sql`
      select * from mark_schemes
      where validation_state = 'SUGGESTED'
      order by created_at desc`;
    return rows.map(mapScheme);
  }

  /** findByPaperId (:49-53) — audit id collection (paperAudit). */
  async findByPaperId(paperId: string): Promise<MarkSchemeRow[]> {
    const rows = await this.sql`
      select s.* from mark_schemes s
      join question_versions v on v.id = s.question_version_id
      join questions q on q.id = v.question_id
      where q.exam_paper_id = ${paperId}`;
    return rows.map(mapScheme);
  }

  /**
   * findFirstByQuestionVersionIdOrderByCreatedAtDesc (:26-27) batched over
   * many versions — newest scheme per version (DISTINCT ON keeps the exact
   * per-version "first by created_at desc" semantics of the derived finder).
   */
  async findFirstByQuestionVersionIds(
    versionIds: string[],
  ): Promise<Map<string, MarkSchemeRow>> {
    if (versionIds.length === 0) return new Map();
    const rows = await this.sql`
      select distinct on (question_version_id) *
      from mark_schemes
      where question_version_id = any(${versionIds}::uuid[])
      order by question_version_id, created_at desc`;
    const out = new Map<string, MarkSchemeRow>();
    for (const r of rows) out.set(str(r.question_version_id), mapScheme(r));
    return out;
  }

  /** countByPaperAndState (:56-61). */
  async countByPaperAndState(): Promise<
    Array<{ paperId: string | null; state: string; count: number }>
  > {
    const rows = await this.sql`
      select q.exam_paper_id, s.validation_state, count(*) as cnt
      from mark_schemes s
      join question_versions v on v.id = s.question_version_id
      join questions q on q.id = v.question_id
      group by q.exam_paper_id, s.validation_state`;
    return rows.map((r) => ({
      paperId: nstr(r.exam_paper_id),
      state: str(r.validation_state),
      count: num(r.cnt),
    }));
  }

  /** countQuestionsWithSchemesByPaper (:70-76) — v3 scheme-linkage signal. */
  async countQuestionsWithSchemesByPaper(): Promise<
    Array<{ paperId: string; count: number }>
  > {
    const rows = await this.sql`
      select q.exam_paper_id, count(distinct q.id) as cnt
      from mark_schemes s
      join question_versions v on v.id = s.question_version_id
      join questions q on q.id = v.question_id
      where q.exam_paper_id is not null
      group by q.exam_paper_id`;
    return rows.map((r) => ({ paperId: str(r.exam_paper_id), count: num(r.cnt) }));
  }
}

export class QuestionsRepository {
  constructor(private readonly sql: SqlFn) {}

  /** findById (JpaRepository derived, by PK). */
  async findById(id: string): Promise<QuestionRow | null> {
    const rows = await this.sql`
      select * from questions where id = ${id}`;
    const row = rows[0];
    return row == null ? null : mapQuestion(row);
  }

  /**
   * Batched counterpart of the version.question() lazy loads in
   * paperReview (fetch-strategy note in the file header).
   */
  async findByIds(ids: string[]): Promise<Map<string, QuestionRow>> {
    if (ids.length === 0) return new Map();
    const rows = await this.sql`
      select * from questions where id = any(${ids}::uuid[])`;
    const out = new Map<string, QuestionRow>();
    for (const r of rows) out.set(str(r.id), mapQuestion(r));
    return out;
  }

  /** findAllByExamPaperIdOrderByDifficultyAsc (QuestionRepository.java:46). */
  async findAllByExamPaperIdOrderByDifficultyAsc(
    paperId: string,
  ): Promise<QuestionRow[]> {
    const rows = await this.sql`
      select * from questions where exam_paper_id = ${paperId}
      order by difficulty asc`;
    return rows.map(mapQuestion);
  }

  /** countAndMappedByPaper (:56-64) — v3 census: [total, mapped]. */
  async countAndMappedByPaper(): Promise<
    Array<{ paperId: string; total: number; mapped: number }>
  > {
    const rows = await this.sql`
      select q.exam_paper_id, count(*) as total,
             sum(case when exists (
                  select 1 from question_topics qt where qt.question_id = q.id)
                 then 1 else 0 end) as mapped
      from questions q
      where q.exam_paper_id is not null
      group by q.exam_paper_id`;
    return rows.map((r) => ({
      paperId: str(r.exam_paper_id),
      total: num(r.total),
      mapped: num(r.mapped),
    }));
  }

  /**
   * findDistinctPrimaryTopicsByPaperIds (:73-81) — the practicable-topic set
   * of the VALIDATED papers. Empty input short-circuits (no papers → no
   * topics), matching the empty-collection semantics of the JPQL `in`.
   */
  async findDistinctPrimaryTopicsByPaperIds(
    paperIds: string[],
  ): Promise<string[]> {
    if (paperIds.length === 0) return [];
    const rows = await this.sql`
      select distinct q.primary_topic_node_id
      from questions q
      where q.exam_paper_id = any(${paperIds}::uuid[])
        and q.primary_topic_node_id is not null`;
    return rows.map((r) => str(r.primary_topic_node_id));
  }
}

export class QuestionTopicsRepository {
  constructor(private readonly sql: SqlFn) {}

  /**
   * findByQuestionId (QuestionTopicRepository.java:12) — the derived finder
   * carries NO order by; row order follows the engine, exactly as the frozen
   * read does (the anchor synthesis in the service makes the primary row's
   * position deterministic where it matters).
   */
  async findByQuestionId(questionId: string): Promise<QuestionTopicRow[]> {
    const rows = await this.sql`
      select * from question_topics where question_id = ${questionId}`;
    return rows.map(mapTopic);
  }

  /** findMappingsByPaper (:32-37) — v3 mapping-coverage rows. */
  async findMappingsByPaper(): Promise<
    Array<{ paperId: string; nodeId: string }>
  > {
    const rows = await this.sql`
      select q.exam_paper_id, qt.node_id
      from question_topics qt
      join questions q on q.id = qt.question_id
      where q.exam_paper_id is not null`;
    return rows.map((r) => ({
      paperId: str(r.exam_paper_id),
      nodeId: str(r.node_id),
    }));
  }
}

export class KnowledgeNodesRepository {
  constructor(private readonly sql: SqlFn) {}

  /** Batched counterpart of the per-row findById lazy loads (header note). */
  async findByIds(ids: string[]): Promise<Map<string, KnowledgeNodeRow>> {
    if (ids.length === 0) return new Map();
    const rows = await this.sql`
      select id, code, title from knowledge_nodes where id = any(${ids}::uuid[])`;
    const out = new Map<string, KnowledgeNodeRow>();
    for (const r of rows) {
      out.set(str(r.id), { id: str(r.id), code: str(r.code), title: str(r.title) });
    }
    return out;
  }
}

export class GlmOcrBridgeRecordsRepository {
  constructor(private readonly sql: SqlFn) {}

  /**
   * findByPaperId (GlmOcrBridgeRecordRepository.java:16) — ported VERBATIM
   * as a per-paper call: baseEnrichment issues it inside the SUGGESTED-paper
   * loop (application-issued call sequence is parity, unlike lazy loads).
   */
  async findByPaperId(paperId: string): Promise<BridgeRecordRow | null> {
    const rows = await this.sql`
      select * from glm_ocr_bridge_records where paper_id = ${paperId}`;
    const row = rows[0];
    if (row == null) return null;
    return {
      id: str(row.id),
      paperId: str(row.paper_id),
      reconciliationStatus: str(row.reconciliation_status),
      reviewFindings: jsonText(row.review_findings),
      createdAt: new Date(row.created_at as string),
    };
  }
}

export class ContentReviewAuditRepository {
  constructor(private readonly sql: SqlFn) {}

  /**
   * findPaperAudit (ContentReviewAuditRepository.java:22-33) — the paper's
   * own rows plus its children's, each id matched within its own target type
   * (deterministic, no cross-type id assumptions), newest first.
   */
  async findPaperAudit(
    paperId: string,
    versionIds: string[],
    schemeIds: string[],
    questionIds: string[],
  ): Promise<AuditRow[]> {
    const rows = await this.sql`
      select * from content_review_audit
      where (target_type = 'exam_paper' and target_id = ${paperId})
         or (target_type = 'question_version' and target_id = any(${versionIds}::uuid[]))
         or (target_type = 'mark_scheme' and target_id = any(${schemeIds}::uuid[]))
         or (target_type = 'question' and target_id = any(${questionIds}::uuid[]))
      order by occurred_at desc`;
    return rows.map((r) => ({
      id: num(r.id),
      occurredAt: new Date(r.occurred_at as string),
      actorLabel: str(r.actor_label),
      action: str(r.action),
      targetType: str(r.target_type),
      targetId: str(r.target_id),
      fromState: nstr(r.from_state),
      toState: nstr(r.to_state),
      detail: str(r.detail),
    }));
  }
}

// ── row mappers ─────────────────────────────────────────────────────────────

function mapVersion(r: Record<string, unknown>): QuestionVersionRow {
  return {
    id: str(r.id),
    questionId: str(r.question_id),
    version: num(r.version),
    stem: nstr(r.stem),
    marks: num(r.marks),
    commandWord: nstr(r.command_word),
    validationState: str(r.validation_state),
    sourceDocumentId: nstr(r.source_document_id),
    extractionConfidence: nnum(r.extraction_confidence),
    extractionMethod: nstr(r.extraction_method),
    createdAt: new Date(r.created_at as string),
  };
}

function mapScheme(r: Record<string, unknown>): MarkSchemeRow {
  return {
    id: str(r.id),
    questionVersionId: str(r.question_version_id),
    versionLabel: str(r.version_label),
    validationState: str(r.validation_state),
    createdAt: new Date(r.created_at as string),
  };
}

function mapQuestion(r: Record<string, unknown>): QuestionRow {
  return {
    id: str(r.id),
    externalRef: nstr(r.external_ref),
    questionType: str(r.question_type),
    stem: str(r.stem),
    marks: num(r.marks),
    difficulty: num(r.difficulty),
    expectedTimeSeconds: num(r.expected_time_seconds),
    commandWord: nstr(r.command_word),
    primaryTopicNodeId: nstr(r.primary_topic_node_id),
    examPaperId: nstr(r.exam_paper_id),
    active: r.active === true,
    createdAt: new Date(r.created_at as string),
  };
}

function mapTopic(r: Record<string, unknown>): QuestionTopicRow {
  return {
    id: str(r.id),
    questionId: str(r.question_id),
    nodeId: str(r.node_id),
    isPrimary: r.is_primary === true,
  };
}

/** mark_points of many schemes, per-family @OrderBy("ordering") preserved. */
export async function loadMarkPoints(
  sql: SqlFn,
  schemeIds: string[],
): Promise<Map<string, MarkPointRow[]>> {
  const out = new Map<string, MarkPointRow[]>();
  if (schemeIds.length === 0) return out;
  const rows = await sql`
    select * from mark_points where mark_scheme_id = any(${schemeIds}::uuid[])
    order by ordering`;
  for (const r of rows) {
    const schemeId = str(r.mark_scheme_id);
    const list = out.get(schemeId) ?? [];
    list.push({
      id: str(r.id),
      markSchemeId: schemeId,
      questionPartId: nstr(r.question_part_id),
      ref: nstr(r.ref),
      ordering: num(r.ordering),
      text: str(r.text),
      marks: num(r.marks),
      acceptanceCriteria: r.acceptance_criteria,
      createdAt: new Date(r.created_at as string),
    });
    out.set(schemeId, list);
  }
  return out;
}

/** question_options of many questions, @OrderBy("ordering") preserved. */
export async function loadOptions(
  sql: SqlFn,
  questionIds: string[],
): Promise<Map<string, QuestionOptionRow[]>> {
  const out = new Map<string, QuestionOptionRow[]>();
  if (questionIds.length === 0) return out;
  const rows = await sql`
    select * from question_options where question_id = any(${questionIds}::uuid[])
    order by ordering`;
  for (const r of rows) {
    const questionId = str(r.question_id);
    const list = out.get(questionId) ?? [];
    list.push({
      id: str(r.id),
      questionId,
      label: str(r.label),
      optionText: str(r.option_text),
      isCorrect: r.is_correct === true,
      misconceptionNodeId: nstr(r.misconception_node_id),
      ordering: num(r.ordering),
    });
    out.set(questionId, list);
  }
  return out;
}

/** question_parts of many versions, @OrderBy("ordering") preserved. */
export async function loadParts(
  sql: SqlFn,
  versionIds: string[],
): Promise<Map<string, QuestionPartRow[]>> {
  const out = new Map<string, QuestionPartRow[]>();
  if (versionIds.length === 0) return out;
  const rows = await sql`
    select * from question_parts where question_version_id = any(${versionIds}::uuid[])
    order by ordering`;
  for (const r of rows) {
    const versionId = str(r.question_version_id);
    const list = out.get(versionId) ?? [];
    list.push({
      id: str(r.id),
      questionVersionId: versionId,
      label: str(r.label),
      prompt: str(r.prompt),
      commandWord: nstr(r.command_word),
      marks: num(r.marks),
      ordering: num(r.ordering),
    });
    out.set(versionId, list);
  }
  return out;
}

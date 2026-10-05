/**
 * Content module composition root — buildContentApp (T-MIG-020 tranche 2).
 *
 * Mirrors buildIdentityApp: repos + services are built from an injected sql
 * adapter (structural SqlFn — see ./sql) so the module is driver-agnostic
 * through the T-MIG-014 dispatch rework. Route factories are NOT part of
 * this module yet: contracts-first (MIGRATION_PLAN §4.1) gates every
 * endpoint on its zod schema (T-MIG-005, R1's fence), so the route layer +
 * index.ts mounting + golden replay flip land as tranche 3. Tranches 1-2
 * ship the contract-independent query surface + view mappings + law + unit
 * tests.
 */
import { DocumentsRepository, documentSummaryView, type DocumentRow, type DocumentSummaryView } from "./documents";
import { ContentReaderService, type CitationDocumentView, type PaperRef } from "./reader";
import { QuestionAssetsRepository, type QuestionAssetRow } from "./assets";
import { documentPageText } from "./page-text";
import { mapExamPaper, type ExamPaperRow } from "./assessment";
import { ContentReviewService } from "./review";
import {
  ContentReviewAuditRepository,
  GlmOcrBridgeRecordsRepository,
  KnowledgeNodesRepository,
  MarkSchemesRepository,
  QuestionTopicsRepository,
  QuestionsRepository,
  QuestionVersionsRepository,
} from "./assessment";
import type { SqlFn } from "./sql";

export { DocumentsRepository, documentSummaryView, type DocumentRow, type DocumentSummaryView } from "./documents";
export { ContentReaderService, type CitationDocumentView, type PaperRef } from "./reader";
export { QuestionAssetsRepository, type QuestionAssetRow } from "./assets";
export { documentPageText } from "./page-text";
export {
  ContentReviewAuditRepository,
  GlmOcrBridgeRecordsRepository,
  KnowledgeNodesRepository,
  MarkSchemesRepository,
  QuestionTopicsRepository,
  QuestionsRepository,
  QuestionVersionsRepository,
  loadMarkPoints,
  loadOptions,
  loadParts,
  mapExamPaper,
  type AuditRow,
  type BridgeRecordRow,
  type ExamPaperRow,
  type KnowledgeNodeRow,
  type MarkPointRow,
  type MarkSchemeRow,
  type QuestionOptionRow,
  type QuestionPartRow,
  type QuestionRow,
  type QuestionTopicRow,
  type QuestionVersionRow,
} from "./assessment";
export {
  ContentReviewService,
  compareUuid,
  paperSummaryView,
  type AuditRowView,
  type DocumentIdentity,
  type EnrichedPaperSummary,
  type EnrichedPaperSummaryV3,
  type EnrichedReviewQueueView,
  type EnrichedReviewQueueViewV3,
  type OptionReview,
  type PaperHeader,
  type PaperProvenanceView,
  type PaperReviewView,
  type PaperSummary,
  type PartReview,
  type PointReview,
  type ReviewQueueView,
  type TopicRowView,
  type VersionReviewView,
} from "./review";
export type { SqlFn } from "./sql";

/**
 * The exam-paper repository (ExamPaperRepository.java port): the join behind
 * PaperRef (findAllByLinkedDocumentId, :28-34), the review-queue drivers
 * (findSuggested :36-41, findValidated :43-48) and the PK lookup the
 * provenance/review/audit views guard with (JpaRepository findById).
 * Column set is the full read-model slice (V8 DDL + V20 FLAGGED widening).
 */
export class ExamPapersRepository {
  constructor(private readonly sql: SqlFn) {}

  /**
   * Newest row wins in the (theoretically impossible, defensively bounded)
   * case of several papers linking one business document id.
   */
  async findAllByLinkedDocumentId(documentId: string): Promise<
    Array<{ id: string; paperCode: string; sessionLabel: string; createdAt: Date }>
  > {
    const rows = await this.sql`
      select id, paper_code, session_label, created_at
      from exam_papers
      where question_paper_document_id = ${documentId}
         or mark_scheme_document_id = ${documentId}
      order by created_at desc`;
    return rows.map((r) => ({
      id: String(r.id),
      paperCode: String(r.paper_code),
      sessionLabel: String(r.session_label),
      createdAt: new Date(r.created_at as string),
    }));
  }

  /** findById (JpaRepository derived, by PK). */
  async findById(id: string): Promise<ExamPaperRow | null> {
    const rows = await this.sql`
      select * from exam_papers where id = ${id}`;
    const row = rows[0];
    return row == null ? null : mapExamPaper(row);
  }

  /** findSuggested (:36-41) — everything awaiting teacher validation. */
  async findSuggested(): Promise<ExamPaperRow[]> {
    const rows = await this.sql`
      select * from exam_papers
      where validation_state = 'SUGGESTED'
      order by created_at desc`;
    return rows.map(mapExamPaper);
  }

  /** findValidated (:43-48) — the v3 practicable-topic set's drivers. */
  async findValidated(): Promise<ExamPaperRow[]> {
    const rows = await this.sql`
      select * from exam_papers
      where validation_state = 'VALIDATED'
      order by created_at desc`;
    return rows.map(mapExamPaper);
  }
}

export interface ContentModule {
  documents: DocumentsRepository;
  examPapers: ExamPapersRepository;
  questionAssets: QuestionAssetsRepository;
  reader: ContentReaderService;
  questionVersions: QuestionVersionsRepository;
  markSchemes: MarkSchemesRepository;
  questions: QuestionsRepository;
  questionTopics: QuestionTopicsRepository;
  knowledgeNodes: KnowledgeNodesRepository;
  bridgeRecords: GlmOcrBridgeRecordsRepository;
  reviewAudit: ContentReviewAuditRepository;
  review: ContentReviewService;
}

export function buildContentModule(sql: SqlFn): ContentModule {
  const documents = new DocumentsRepository(sql);
  const examPapers = new ExamPapersRepository(sql);
  const questionAssets = new QuestionAssetsRepository(sql);
  const questionVersions = new QuestionVersionsRepository(sql);
  const markSchemes = new MarkSchemesRepository(sql);
  const questions = new QuestionsRepository(sql);
  const questionTopics = new QuestionTopicsRepository(sql);
  const knowledgeNodes = new KnowledgeNodesRepository(sql);
  const bridgeRecords = new GlmOcrBridgeRecordsRepository(sql);
  const reviewAudit = new ContentReviewAuditRepository(sql);
  return {
    documents,
    examPapers,
    questionAssets,
    questionVersions,
    markSchemes,
    questions,
    questionTopics,
    knowledgeNodes,
    bridgeRecords,
    reviewAudit,
    reader: new ContentReaderService(documents, examPapers),
    review: new ContentReviewService(
      sql,
      examPapers,
      questionVersions,
      markSchemes,
      questions,
      questionTopics,
      knowledgeNodes,
      bridgeRecords,
      reviewAudit,
      documents,
    ),
  };
}

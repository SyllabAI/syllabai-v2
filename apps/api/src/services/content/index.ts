/**
 * Content module composition root — buildContentApp (T-MIG-020 tranche 1).
 *
 * Mirrors buildIdentityApp: repos + services are built from an injected sql
 * adapter (structural SqlFn — see ./sql) so the module is driver-agnostic
 * through the T-MIG-014 dispatch rework. Route factories are NOT part of
 * tranche 1: contracts-first (MIGRATION_PLAN §4.1) gates every endpoint on
 * its zod schema (T-MIG-005, R1's fence), so the route layer + index.ts
 * mounting + golden replay flip land together as tranche 2. Tranche 1 ships
 * the contract-independent query surface + view mappings + unit tests.
 */
import { DocumentsRepository } from "./documents";
import { ContentReaderService, type LinkedPaperLookup } from "./reader";
import { QuestionAssetsRepository } from "./assets";
import type { SqlFn } from "./sql";

export { DocumentsRepository, documentSummaryView, type DocumentRow, type DocumentSummaryView } from "./documents";
export { ContentReaderService, type CitationDocumentView, type PaperRef } from "./reader";
export { QuestionAssetsRepository, type QuestionAssetRow } from "./assets";
export { documentPageText } from "./page-text";
export type { SqlFn } from "./sql";

/**
 * The exam-paper join behind PaperRef (findAllByLinkedDocumentId,
 * ExamPaperRepository.java:26-33): newest row wins in the (theoretically
 * impossible, defensively bounded) case of several papers linking one
 * business document id. Column set is the read-model slice the PaperRef
 * needs; provenance/review-queue queries widen it in tranche 2.
 */
export class ExamPapersRepository implements LinkedPaperLookup {
  constructor(private readonly sql: SqlFn) {}

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
}

export interface ContentModule {
  documents: DocumentsRepository;
  examPapers: ExamPapersRepository;
  questionAssets: QuestionAssetsRepository;
  reader: ContentReaderService;
}

export function buildContentModule(sql: SqlFn): ContentModule {
  const documents = new DocumentsRepository(sql);
  const examPapers = new ExamPapersRepository(sql);
  const questionAssets = new QuestionAssetsRepository(sql);
  return {
    documents,
    examPapers,
    questionAssets,
    reader: new ContentReaderService(documents, examPapers),
  };
}

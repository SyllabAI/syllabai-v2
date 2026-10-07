/**
 * Curriculum module composition root — buildCurriculumModule (T-MIG-021
 * tranche 1). Mirrors buildIdentityApp / buildContentModule: repos + the
 * review reader are built from an injected sql adapter (structural SqlFn —
 * see ./sql) so the module is driver-agnostic through the T-MIG-014 dispatch
 * rework (PR #13).
 *
 * Route factories are NOT part of tranche 1 (declared deviation from the
 * claim's execution_record, same disclosure as T-MIG-020 tranche 1):
 * contracts-first (MIGRATION_PLAN §4.1) gates every endpoint on its zod
 * schema — R1's T-MIG-005 branch (0cd5e93) already carries
 * packages/contracts/src/curriculum.ts, and the route layer + index.ts
 * mounting + golden replay flip land together as tranche 2 once T-MIG-005
 * merges. Tranche 1 ships the contract-independent query surface + view
 * mappings + the service law (F-1 empty queue, treeCounts null guard, sort
 * by code) + unit tests pinning query shapes and captured seed behavior.
 */
import { CurriculumVersionsRepository } from "./versions";
import { SubjectsRepository } from "./subjects";
import { CurriculumReviewReader } from "./review";
import { ExamSeriesImportService } from "./exam-series-import";
import type { SqlFn } from "./sql";

export { CurriculumVersionsRepository, versionView } from "./versions";
export type { CurriculumVersionRow, CurriculumVersionView, CurriculumVersionStatus } from "./versions";
export { SubjectsRepository, subjectView } from "./subjects";
export type { SubjectJoinedRow, SubjectView } from "./subjects";
export { CurriculumReviewReader, overviewOf } from "./review";
export type { CurriculumOverview, KnowledgeNodeView, KnowledgeNodeValidationStatus } from "./review";
export { ExamSeriesImportService, defaultExamSeriesImportClock } from "./exam-series-import"; // T-MIG-091 (r1c) — the T-C79 calendar import (same-module sibling of the ingestion package)
export type {
  ExamSeriesImportSummary,
  ExamSeriesImportClock,
  ExamSeriesStoredRow,
  ExamSeriesImportSqlFn,
} from "./exam-series-import";
export type { SqlFn } from "./sql";

export interface CurriculumModule {
  versions: CurriculumVersionsRepository;
  subjects: SubjectsRepository;
  review: CurriculumReviewReader;
  /** T-MIG-091 (r1c) — TeacherExamSeriesImportController's import service
   *  (ExamSeriesImportService) rides the curriculum module: same ingestion
   *  family, same sql adapter, the T-C79/ADR-035 D1 import path. */
  examSeriesImport: ExamSeriesImportService;
}

export function buildCurriculumModule(sql: SqlFn): CurriculumModule {
  const versions = new CurriculumVersionsRepository(sql);
  const subjects = new SubjectsRepository(sql);
  return {
    versions,
    subjects,
    review: new CurriculumReviewReader(sql, versions, subjects),
    examSeriesImport: new ExamSeriesImportService(sql),
  };
}

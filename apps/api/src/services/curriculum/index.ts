/**
 * Curriculum module composition root — buildCurriculumModule (T-MIG-021
 * tranche 1).
 *
 * Mirrors buildIdentityApp / buildContentModule: repos + services are built
 * from an injected sql adapter (structural SqlFn — see ./sql) so the module
 * is driver-agnostic through the T-MIG-014 dispatch rework. Route factories
 * are NOT part of tranche 1: contracts-first (MIGRATION_PLAN §4.1) gates
 * every endpoint on its zod schema (T-MIG-005, R1's fence), so the route
 * layer + index.ts mounting + golden replay flip land together as tranche 2.
 * Tranche 1 ships the contract-independent query surface + view mappings +
 * unit tests (T-MIG-020 tranche-1 precedent).
 */
import { CurriculumVersionsRepository, SubjectsRepository, KnowledgeStructureRepository } from "./repository";
import { CurriculumService, CurriculumReviewReadService } from "./service";
import type { SqlFn } from "./sql";

export { CurriculumVersionsRepository, SubjectsRepository, KnowledgeStructureRepository } from "./repository";
export { CurriculumService, CurriculumReviewReadService, parsePathUuid, byCode } from "./service";
export type {
  CurriculumVersionView,
  SubjectView,
  CurriculumOverview,
  NodeView,
} from "./views";
export type { SubjectWithVersionRow } from "./repository";
export type { SqlFn, Row } from "./sql";

export interface CurriculumModule {
  versions: CurriculumVersionsRepository;
  subjects: SubjectsRepository;
  knowledge: KnowledgeStructureRepository;
  curriculum: CurriculumService;
  review: CurriculumReviewReadService;
}

export function buildCurriculumModule(sql: SqlFn): CurriculumModule {
  const versions = new CurriculumVersionsRepository(sql);
  const subjects = new SubjectsRepository(sql);
  const knowledge = new KnowledgeStructureRepository(sql);
  return {
    versions,
    subjects,
    knowledge,
    curriculum: new CurriculumService(versions, subjects),
    review: new CurriculumReviewReadService(versions, subjects, knowledge),
  };
}

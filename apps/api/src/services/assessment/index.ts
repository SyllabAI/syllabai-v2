/**
 * Assessment module composition root — buildAssessmentModule (T-MIG-030
 * tranche 1). Mirrors buildCurriculumModule / buildContentModule: the reader
 * + submitter are built from an injected sql adapter (structural SqlFn — see
 * ./sql) so the module is driver-agnostic through the T-MIG-014 dispatch
 * rework (merged, PR #13), plus an injected EvidencePublisher Observer seam
 * (default no-op — the golden surface never observes events).
 *
 * Route factories are NOT part of tranche 1 (declared deviation, same
 * disclosure as T-MIG-020/021 tranche 1): contracts-first (MIGRATION_PLAN
 * §4.1) gates every endpoint on its zod schema — R1's T-MIG-018 branch
 * (PR #26) carries the wave-3 contracts, and the route layer + index.ts
 * mounting + golden replay flip land together as tranche 2 once T-MIG-018
 * and T-MIG-007 (PR #29) merge. Tranche 1 ships the contract-independent
 * service law (both submission paths, the clamp, the excerpt, the parts
 * settle rule, the fail-closed 404 gates, the fixed "malformed request" 400s)
 * + unit tests pinning query shapes and the captured wire behavior.
 */
import { AttemptHistoryReader } from "./history";
import {
  AssessmentSubmitter,
  noopEvidencePublisher,
  type EvidencePublisher,
  type SubmitClock,
} from "./submit";
import type { SqlFn } from "./sql";

export { AttemptHistoryReader, clampLimit, excerpt } from "./history";
export type {
  AttemptHistoryView,
  AttemptHistoryItem,
  AttemptHistoryPartItem,
} from "./types";
export {
  AssessmentSubmitter,
  noopEvidencePublisher,
  type EvidencePublisher,
  type SubmitClock,
} from "./submit";
export type {
  AttemptResultView,
  StructuredAttemptResultView,
  SubmitAnswerRequest,
  StructuredSubmitRequest,
  PartAnswerRequest,
  QuestionType,
  AttemptMarkingState,
  AnswerMarkingState,
} from "./types";
export type { SqlFn } from "./sql";

export interface AssessmentModule {
  history: AttemptHistoryReader;
  submitter: AssessmentSubmitter;
}

export function buildAssessmentModule(
  sql: SqlFn,
  publisher: EvidencePublisher = noopEvidencePublisher,
  clock: SubmitClock = {
    newId: () => crypto.randomUUID(),
    now: () => new Date(),
  },
): AssessmentModule {
  return {
    history: new AttemptHistoryReader(sql),
    submitter: new AssessmentSubmitter(sql, publisher, clock),
  };
}

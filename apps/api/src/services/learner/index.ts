/**
 * Learner module composition root (T-MIG-041 tranche 1).
 *
 * Same pattern as services/curriculum/index.ts (T-MIG-021): the route layer
 * (tranche 2) constructs this module ONCE with the injected adapter + engine
 * parameters and calls the builders per request. Engine parameters default to
 * the paper values; the model_versions registry override path (LearnerProperties
 * normalization) is tranche-3 and must stay lenient-normalize-never-hard-code
 * when it lands.
 *
 * `now` is injected per call by the route layer (determinism law, ADR-031:
 * every now()-dependent value is recomputed, never persisted — the W4 golden
 * tranche w4-state-* tolerates exactly those wire fields).
 */
import type { SqlFn } from "./sql";
import {
  buildCourseStatsView,
  buildLearnerStateView,
  LEARNER_BDT_PAPER_DEFAULTS,
  LEARNER_DECAY_PAPER_DEFAULTS,
  type CourseStatsView,
  type LearnerBdtParams,
  type LearnerDecayParams,
  type LearnerStateView,
} from "./state";

export * from "./state";
export type { SqlFn } from "./sql";

export interface LearnerEngineParams {
  decay: LearnerDecayParams;
  bdt: LearnerBdtParams;
}

export const LEARNER_ENGINE_PAPER_DEFAULTS: LearnerEngineParams = {
  decay: LEARNER_DECAY_PAPER_DEFAULTS,
  bdt: LEARNER_BDT_PAPER_DEFAULTS,
};

export function buildLearnerModule(sql: SqlFn, params: LearnerEngineParams = LEARNER_ENGINE_PAPER_DEFAULTS) {
  return {
    /** GET /api/v1/learners/me/state (tranche-2 mounts it). */
    learnerState(learnerId: string, now: Date): Promise<LearnerStateView> {
      return buildLearnerStateView(sql, learnerId, params, now);
    },
    /** GET /api/v1/learners/me/course-stats (tranche-2 mounts it). */
    courseStats(learnerId: string): Promise<CourseStatsView> {
      return buildCourseStatsView(sql, learnerId);
    },
  };
}

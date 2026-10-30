/**
 * Test-builder module barrel (T-MIG-034) — the deterministic assembly port
 * of TestBuilderService. Routes wire via routes/testbuilder.ts; the app
 * mount is the OUT-OF-FENCE commit (R0 ratification requested).
 *
 * The analytics dependency is injected as a ClassAnalyticsPort. Since CD-A
 * (trace 1a18c0171724f5ed) the production default is AWAKE —
 * classAnalyticsAdapter over the real ClassAnalyticsService (frozen-core
 * parity: TestBuilderService consumed ClassAnalyticsService.overview in
 * the Java core); `analytics: null` stays the constructible DORMANT
 * posture (tests / a future deliberate gap) — weaknessOptions throws
 * AnalyticsUnavailable, which the route maps to 501 with the task
 * reference (honest gap, never a fabricated body).
 */
import { ServableQuestions } from "../questions/servable";
import { createSql } from "../identity/users";
import { requireDatabaseUrl } from "@syllabai/db";
import type { SqlFn } from "../questions/sql";
import type { KnowledgeDeps } from "../knowledge";
import { classOverview } from "../teacher/analytics";
import { TestBuilder, WEAK_MASTERY_CEILING_DEFAULT, type ClassAnalyticsPort } from "./builder";

export { TestBuilder, selectByMarks, AnalyticsUnavailable, WEAKNESS_POLICY } from "./builder";
export type { TestBuilderModule, ClassAnalyticsPort, TopicAggregate } from "./builder";
export type { SqlFn } from "../questions/sql";
export {
  findSubtreeIds,
  findNode,
  findVersionsByQuestionDesc,
  findSchemeWithPoints,
  findQuestionTopicsIn,
} from "./sql";

export interface TestBuilderComponents {
  servable: ServableQuestions;
  builder: TestBuilder;
}

export function buildTestBuilderModule(
  sql: SqlFn,
  analytics: ClassAnalyticsPort | null = null,
  weakMasteryCeiling: number = WEAK_MASTERY_CEILING_DEFAULT,
): TestBuilderComponents {
  const servable = new ServableQuestions(sql);
  const builder = new TestBuilder({ servable, sql, analytics, weakMasteryCeiling });
  return { servable, builder };
}

/**
 * CD-A — the classOverview→testbuilder analytics adapter of record (trace
 * 1a18c0171724f5ed): the wake-up of the ClassAnalyticsPort seam. PURE
 * DELEGATION — zero re-derivation, zero new reads, zero new parameters:
 *
 *   - classOverview already returns the exact structural slice the port
 *     consumes (its extra fields — rootCode, policy, recentActivity,
 *     parentCode/parentTitle, derived flags — are ignored by the port's
 *     structural type);
 *   - the engine inside is the frozen one (LEARNER_ENGINE_PAPER_DEFAULTS +
 *     the frozen CONFIG 0.45/2 via engineOf) — the SAME weak-mastery
 *     ceiling the builder holds (WEAK_MASTERY_CEILING_DEFAULT), so C6
 *     stays true by construction;
 *   - the aggregation laws (§11 batching, the enabled-STUDENT roster,
 *     honest UNMEASURED, deterministic sorts) are classOverview's own
 *     and ride unchanged.
 *
 * This restores the frozen-core dependency shape: TestBuilderService
 * consumed ClassAnalyticsService.overview in the Java core; v2 ported
 * both halves (T-MIG-034 the builder, T-MIG-053 tranche-2 the analytics)
 * and this adapter is the connection between them.
 */
export function classAnalyticsAdapter(deps: KnowledgeDeps): ClassAnalyticsPort {
  return {
    overview: (rootId: string) => classOverview(deps, rootId),
  };
}

/** App-root composition (env → requireDatabaseUrl → createSql), buildAssessmentRouters shape. */
export function buildTestBuilderComponents(
  env: Record<string, string | undefined> = process.env,
  analytics: ClassAnalyticsPort | null = null,
): TestBuilderComponents {
  const databaseUrl = requireDatabaseUrl(env as { DATABASE_URL?: string });
  const sql = createSql(databaseUrl);
  return buildTestBuilderModule(sql, analytics);
}

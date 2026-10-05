/**
 * Test-builder module barrel (T-MIG-034) — the deterministic assembly port
 * of TestBuilderService. Routes wire via routes/testbuilder.ts; the app
 * mount is the OUT-OF-FENCE commit (R0 ratification requested).
 *
 * The analytics dependency is injected as a ClassAnalyticsPort | null —
 * null is the DORMANT default (the class-analytics read service is
 * unported and unclaimed); weaknessOptions throws AnalyticsUnavailable,
 * which the route maps to 501 with the task reference (honest gap).
 */
import { ServableQuestions } from "../questions/servable";
import { createSql } from "../identity/users";
import { requireDatabaseUrl } from "@syllabai/db";
import type { SqlFn } from "../questions/sql";
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

/** App-root composition (env → requireDatabaseUrl → createSql), buildAssessmentRouters shape. */
export function buildTestBuilderComponents(
  env: Record<string, string | undefined> = process.env,
  analytics: ClassAnalyticsPort | null = null,
): TestBuilderComponents {
  const databaseUrl = requireDatabaseUrl(env as { DATABASE_URL?: string });
  const sql = createSql(databaseUrl);
  return buildTestBuilderModule(sql, analytics);
}

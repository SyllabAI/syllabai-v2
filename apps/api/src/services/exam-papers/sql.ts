/**
 * Structural sql adapter for the exam-papers module (T-MIG-031 tranche 1).
 * Per-module declaration per the fence convention — same shape as
 * services/questions/sql.ts (this lane owns both; structural typing makes
 * the duplicate zero-cost).
 */
export type SqlFn = (
  strings: TemplateStringsArray,
  ...params: unknown[]
) => Promise<Array<Record<string, unknown>>>;

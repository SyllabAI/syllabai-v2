/**
 * Structural sql adapter for the questions module (T-MIG-031 tranche 1).
 *
 * Same STRUCTURAL seam as services/assessment/sql.ts (T-MIG-030), services/
 * curriculum/sql.ts (T-MIG-021) and services/content/sql.ts (T-MIG-020): the
 * composition root injects whatever adapter satisfies this shape, so the
 * module stays decoupled from the identity internals and from the T-MIG-014
 * driver-dispatch rework (PR #13, merged). Declared per-module (not imported
 * across module fences) — structural typing makes the duplicate zero-cost
 * and keeps the fences independent.
 *
 * This module is READ-ONLY end to end: every statement it issues is a SELECT
 * over the questions/exam_papers/mark_schemes/knowledge_* families. No
 * transaction semantics are observable through a pure read seam.
 */
export type SqlFn = (
  strings: TemplateStringsArray,
  ...params: unknown[]
) => Promise<Array<Record<string, unknown>>>;

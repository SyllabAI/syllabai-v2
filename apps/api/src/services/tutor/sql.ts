/**
 * Structural sql adapter for the tutor module (T-MIG-060 tranche 1).
 *
 * Same STRUCTURAL seam as services/assessment/sql.ts (T-MIG-030 tranche 1),
 * services/curriculum/sql.ts, services/content/sql.ts and the learner-me
 * module: the composition root injects whatever adapter satisfies this
 * shape, so the module stays decoupled from the db internals and from the
 * T-MIG-014 driver-dispatch rework. Declared per-module (not imported across
 * module fences) — structural typing makes the duplicate zero-cost and
 * keeps the fences independent.
 */
export type SqlFn = (
  strings: TemplateStringsArray,
  ...params: unknown[]
) => Promise<Array<Record<string, unknown>>>;

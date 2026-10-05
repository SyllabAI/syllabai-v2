/**
 * Structural sql adapter for the learner module (T-MIG-041 tranche 1).
 *
 * Same STRUCTURAL seam as services/curriculum/sql.ts (the T-MIG-021 tranche-1
 * pattern) and services/content/sql.ts (R3's T-MIG-020): the composition root
 * injects whatever adapter satisfies this shape, so the module stays decoupled
 * from the identity internals and from the T-MIG-014 driver-dispatch rework.
 * Declared per-module (not imported across module fences) — structural typing
 * makes the duplicate zero-cost and keeps the fences independent.
 *
 * Read-only tranche — every query here is a single statement, no transaction
 * affordance (R-TX doctrine applies to writes). Tagged-template discipline:
 * every ${} slot is a BIND PARAMETER; column lists and literals are inlined
 * into the static template text.
 */
export type SqlFn = (
  strings: TemplateStringsArray,
  ...params: unknown[]
) => Promise<Array<Record<string, unknown>>>;

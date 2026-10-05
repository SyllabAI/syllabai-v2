/**
 * Structural sql adapter for the curriculum module (T-MIG-021 tranche 1).
 *
 * Same STRUCTURAL seam as services/content/sql.ts (R3's T-MIG-020 tranche 1)
 * and the tagged-template adapter identity/users.ts builds: the composition
 * root injects whatever adapter satisfies this shape, so the module stays
 * decoupled from the identity internals and from the T-MIG-014
 * driver-dispatch rework (PR #13). Declared per-module (not imported across
 * module fences) — structural typing makes the duplicate zero-cost and keeps
 * the fences independent. Read-only tranche — every query here is a single
 * statement, no transaction affordance (R-TX doctrine applies to writes).
 */
export type SqlFn = (
  strings: TemplateStringsArray,
  ...params: unknown[]
) => Promise<Array<Record<string, unknown>>>;

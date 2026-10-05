/**
 * Structural sql adapter for the assessment module (T-MIG-030 tranche 1).
 *
 * Same STRUCTURAL seam as services/curriculum/sql.ts (r7a's T-MIG-021
 * tranche 1) and services/content/sql.ts (R3's T-MIG-020 tranche 1): the
 * composition root injects whatever adapter satisfies this shape, so the
 * module stays decoupled from the identity internals and from the T-MIG-014
 * driver-dispatch rework (PR #13, merged). Declared per-module (not imported
 * across module fences) — structural typing makes the duplicate zero-cost
 * and keeps the fences independent.
 *
 * Tranche-1 note: submit/submitStructured are WRITES (single-statement
 * INSERTs + reads). R-TX doctrine: the frozen Java wraps each submit in one
 * @Transactional; the driver adapter (identity/users.ts createSql lineage)
 * autocommits per statement — the parity consequence is disclosed in the
 * tranche receipt (same posture as every landed lane's write seam; no
 * multi-statement atomicity is observable through the golden surface).
 */
export type SqlFn = (
  strings: TemplateStringsArray,
  ...params: unknown[]
) => Promise<Array<Record<string, unknown>>>;

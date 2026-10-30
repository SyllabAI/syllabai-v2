/**
 * Structural sql adapter for the paper-awards module (T-MG-AWARDS-1
 * run-001). Same STRUCTURAL seam as services/paper-regions/sql.ts and the
 * other read/write modules: the composition root injects whatever adapter
 * satisfies this shape; the duplicate is zero-cost under structural typing
 * and keeps module fences independent (no cross-fence imports).
 *
 * This module is WRITE-CAPABLE (mark_awards + mark_working_blocks inserts
 * through the DC-7 claim) but transaction-free: the claim is the row-level
 * unique constraint (INSERT ... ON CONFLICT DO NOTHING), not a tx boundary
 * — a suppressed re-fire is a defined outcome, not a rollback.
 */
export type SqlFn = (
  strings: TemplateStringsArray,
  ...params: unknown[]
) => Promise<Array<Record<string, unknown>>>;

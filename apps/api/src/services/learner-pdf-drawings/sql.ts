/**
 * Structural sql adapter for the learner-pdf-drawings module (T-MG-INK-1
 * run-002). Same STRUCTURAL seam as services/paper-awards/sql.ts and the
 * other read/write modules: the composition root injects whatever adapter
 * satisfies this shape; the duplicate is zero-cost under structural typing
 * and keeps module fences independent (no cross-fence imports).
 *
 * This module is WRITE-CAPABLE (learner_pdf_drawings insert/update through
 * the revision LWW law) but transaction-free: the revision guard IS the
 * concurrency law — a stale base is a defined 409 outcome, not a rollback.
 * E4 (run-001 decision record): the writer is single per (learner,
 * documentRef), so the read-write window is theoretical; the CAS on the
 * observed revision is the belt-and-braces law of record, and a raced
 * first-insert fails loud against the unique constraint rather than
 * silently clobbering (fail-loud > silent merge, the house posture).
 */
export type SqlFn = (
  strings: TemplateStringsArray,
  ...params: unknown[]
) => Promise<Array<Record<string, unknown>>>;

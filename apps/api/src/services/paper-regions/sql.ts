/**
 * Structural sql adapter for the paper-regions module (T-MG-MP-RECT-1
 * run-001). Same STRUCTURAL seam as services/questions/sql.ts (T-MIG-031),
 * services/exam-papers and the other read modules: the composition root
 * injects whatever adapter satisfies this shape; the duplicate is
 * zero-cost under structural typing and keeps module fences independent
 * (no cross-fence imports).
 *
 * This module is READ-ONLY end to end (SELECT over exam_papers, questions,
 * question_versions, question_parts, mark_schemes, mark_points,
 * mark_point_rects). No transaction semantics are observable through a
 * pure read seam.
 */
export type SqlFn = (
  strings: TemplateStringsArray,
  ...params: unknown[]
) => Promise<Array<Record<string, unknown>>>;

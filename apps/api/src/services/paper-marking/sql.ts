/**
 * SQL seam for the paper-marking pipeline — T-MG-CROPMARK-1 run-001.
 * The sql.ts convention (the paper-awards/paper-regions module posture):
 * the tagged-template fn type is declared here; the service imports the
 * TYPE only, tests inject doubles, fences stay independent (no cross-fence
 * imports).
 */
export type SqlFn = (
  strings: TemplateStringsArray,
  ...params: unknown[]
) => Promise<Array<Record<string, unknown>>>;

/** One definition-plane row (mark_points serving grain for this pipeline). */
export interface MarkPointRow {
  id: string;
  ref: string | null;
  ordering: number;
  text: string;
  marks: number;
  acceptance_criteria: unknown;
}

/** One prior working block (the learner's saved context for a region). */
export interface WorkingBlockRow {
  id: string;
  kind: string;
  content: unknown;
  created_at: string;
}

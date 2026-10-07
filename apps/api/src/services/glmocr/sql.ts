/**
 * Structural sql adapter for the glm-ocr module (T-MIG-089) — the same
 * per-module doctrine as services/curriculum/sql.ts and services/tutor/sql.ts:
 * the composition root injects whatever adapter satisfies this shape, so the
 * module stays decoupled from the identity internals and the T-MIG-014
 * driver-dispatch rework. Declared per-module (not imported across module
 * fences) — structural typing makes the duplicate zero-cost.
 */
export type SqlFn = (
  strings: TemplateStringsArray,
  ...params: unknown[]
) => Promise<Array<Record<string, unknown>>>;

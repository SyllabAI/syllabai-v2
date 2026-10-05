/**
 * Shared test helper for the learner module's stubbed-sql unit tests
 * (T-MIG-041 tranche 1). NOT a test file (bun test only picks up *.test.ts).
 * Mirrors apps/api/test/curriculum/helpers.ts (the T-MIG-021 pattern).
 */
import type { SqlFn } from "../../src/services/learner/sql";

export type Route = {
  match: RegExp;
  rows: Array<Record<string, unknown>>;
  /** Optional param-aware override — wins over `rows` when present. */
  rowsFor?: (params: unknown[]) => Array<Record<string, unknown>>;
};

/**
 * Builds a SqlFn stub that dispatches on the rendered query text. Whitespace
 * is collapsed to single spaces (template literals carry indentation noise);
 * every issued query is recorded so tests can pin the SQL shape. Use
 * `rowsFor` when the result depends on a bound parameter.
 */
export function fakeSql(routes: Route[]): SqlFn & { queries: string[] } {
  const queries: string[] = [];
  const fn = (async (strings: TemplateStringsArray, ...params: unknown[]) => {
    const text = strings
      .join(" ? ")
      .replace(/\s+/g, " ")
      .trim();
    queries.push(text);
    const hit = routes.find((r) => r.match.test(text));
    if (!hit) throw new Error("unexpected query: " + text);
    return hit.rowsFor ? hit.rowsFor(params) : hit.rows;
  }) as unknown as SqlFn & { queries: string[] };
  fn.queries = queries;
  return fn;
}

// ── fixed-constant uuids (seed-shaped; replay-stable) ─────────────────────

export const LEARNER = "00000000-0000-4000-8000-000000000041";
export const NODE_TOPIC = "20000000-0000-0000-0000-000000000011"; // WCH11-T1 shape
export const NODE_SUBTOPIC = "20000000-0000-0000-0000-000000000012"; // WCH11-T1.1 shape
export const NODE_MISCONCEPTION = "30000000-0000-0000-0000-000000000001";
export const SERIES_IAL = "0a000000-0000-0000-0000-000000000001"; // V63 shape

/** The injected clock (determinism law — never Date.now in tests). */
export const NOW = new Date("2026-10-06T00:00:00.000Z");

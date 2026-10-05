/**
 * Shared test helper for the content module's stubbed-sql unit tests.
 * NOT a test file (bun test only picks up *.test.ts).
 */
import type { SqlFn } from "../../src/services/content/sql";

export type Route = {
  match: RegExp;
  rows: Array<Record<string, unknown>>;
  /**
   * Optional param discriminator for queries whose TEXT is identical but
   * whose parameters select different rows (e.g. the per-paper bridge
   * lookup baseEnrichment issues inside its loop). First matching route
   * wins; routes without matchParams match any parameters.
   */
  matchParams?: (params: unknown[]) => boolean;
};

/**
 * Builds a SqlFn stub that dispatches on the rendered query text. Whitespace
 * is collapsed to single spaces (template literals carry indentation noise);
 * every issued query is recorded so tests can pin the SQL shape.
 */
export function fakeSql(routes: Route[]): SqlFn & { queries: string[] } {
  const queries: string[] = [];
  const fn = (async (strings: TemplateStringsArray, ...params: unknown[]) => {
    const text = strings
      .join(" ? ")
      .replace(/\s+/g, " ")
      .trim();
    queries.push(text);
    const hit = routes.find(
      (r) => r.match.test(text) && (r.matchParams ? r.matchParams(params) : true),
    );
    if (!hit) throw new Error("unexpected query: " + text);
    return hit.rows;
  }) as unknown as SqlFn & { queries: string[] };
  fn.queries = queries;
  return fn;
}

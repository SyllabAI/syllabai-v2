/**
 * Shared test helper for the curriculum module's stubbed-sql unit tests.
 * NOT a test file (bun test only picks up *.test.ts).
 *
 * Self-contained twin of the T-MIG-020 content-module helper (same shape,
 * same dispatch doctrine) — not imported from there because that lane's
 * branch is unmerged and cross-lane test imports would couple merge order.
 * Dedupe together with the SqlFn structural type once T-MIG-014 lands.
 */
import type { SqlFn } from "../../src/services/curriculum/sql";

export type Route = { match: RegExp; rows: Array<Record<string, unknown>> };

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
    const hit = routes.find((r) => r.match.test(text));
    if (!hit) throw new Error("unexpected query: " + text);
    return hit.rows;
  }) as unknown as SqlFn & { queries: string[] };
  fn.queries = queries;
  return fn;
}

/** Fixed V6-seed constants the golden cases captured (replay-stable). */
export const SEED = {
  version: {
    id: "10000000-0000-0000-0000-000000000001",
    board: "Edexcel",
    qualification: "IAL",
    code: "IAL-CHEM-2018",
    title: "Edexcel International A Level Chemistry (2018 specification)",
    status: "ACTIVE",
  },
  subject: {
    id: "10000000-0000-0000-0000-000000000010",
    code: "CHM",
    name: "Chemistry",
    knowledgeNodeId: "20000000-0000-0000-0000-000000000001",
  },
  subjectRoot: {
    id: "20000000-0000-0000-0000-000000000001",
    code: "CHM",
    node_type: "SUBJECT",
    title: "Chemistry",
    validation_status: "VALIDATED",
    provenance: "Edexcel IAL specification 2018",
  },
  unit: {
    id: "20000000-0000-0000-0000-000000000010",
    code: "WCH11",
    node_type: "UNIT",
    title: "Unit 1: Structure, Bonding and Introduction to Organic Chemistry",
    validation_status: "UNVALIDATED",
    provenance: "Edexcel IAL specification topic list",
  },
} as const;

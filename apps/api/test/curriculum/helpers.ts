/**
 * Shared test helper for the curriculum module's stubbed-sql unit tests
 * (T-MIG-021 tranche 1). NOT a test file (bun test only picks up *.test.ts).
 * Mirrors apps/api/test/content/helpers.ts (R3's T-MIG-020 tranche 1).
 */
import type { SqlFn } from "../../src/services/curriculum/sql";

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
 * `rowsFor` when the result depends on a bound parameter (e.g. id lookups
 * that must distinguish known from unknown ids).
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

// ── V6 seed-shaped fixtures (fixed-constant uuids; the captured rows) ──────

/** curriculum_versions row — plain column names as versions.ts selects them. */
export const VERSION_ROW = {
  id: "10000000-0000-0000-0000-000000000001",
  board: "Edexcel",
  qualification: "IAL",
  code: "IAL-CHEM-2018",
  title: "Edexcel International A Level Chemistry (2018 specification)",
  status: "ACTIVE",
  created_at: "2026-10-04T19:02:05Z",
};

/** The subject row joined with its version (alias shape of the JOIN in subjects.ts). */
export const SUBJECT_ROW = {
  id: "10000000-0000-0000-0000-000000000010",
  curriculum_version_id: "10000000-0000-0000-0000-000000000001",
  code: "CHM",
  name: "Chemistry",
  knowledge_node_id: "20000000-0000-0000-0000-000000000001",
  created_at: "2026-10-04T19:02:06Z",
  v_id: VERSION_ROW.id,
  board: VERSION_ROW.board,
  qualification: VERSION_ROW.qualification,
  v_code: VERSION_ROW.code,
  v_title: VERSION_ROW.title,
  v_status: VERSION_ROW.status,
  v_created_at: VERSION_ROW.created_at,
};

/** The captured SubjectView body (curriculum-subject-by-id-student-200). */
export const CAPTURED_SUBJECT_VIEW = {
  id: "10000000-0000-0000-0000-000000000010",
  code: "CHM",
  name: "Chemistry",
  knowledgeNodeId: "20000000-0000-0000-0000-000000000001",
  curriculumVersion: {
    id: "10000000-0000-0000-0000-000000000001",
    board: "Edexcel",
    qualification: "IAL",
    code: "IAL-CHEM-2018",
    title: "Edexcel International A Level Chemistry (2018 specification)",
    status: "ACTIVE" as const,
  },
};

/** The captured CurriculumVersionView body (curriculum-versions-student-200). */
export const CAPTURED_VERSION_VIEW = CAPTURED_SUBJECT_VIEW.curriculumVersion;

/** KG subtree rows in seed shape: root CHM VALIDATED + one UNVALIDATED unit (captured nodes-200 body). */
export const SEED_NODE_ROWS = [
  {
    id: "20000000-0000-0000-0000-000000000001",
    code: "CHM",
    node_type: "SUBJECT",
    title: "Chemistry",
    validation_status: "VALIDATED",
    provenance: "Edexcel IAL specification 2018",
    parent_id: null,
  },
  {
    id: "20000000-0000-0000-0000-000000000010",
    code: "WCH11",
    node_type: "UNIT",
    title: "Unit 1: Structure, Bonding and Introduction to Organic Chemistry",
    validation_status: "UNVALIDATED",
    provenance: "Edexcel IAL specification 2018",
    parent_id: "20000000-0000-0000-0000-000000000001",
  },
];

/**
 * Shared test helper for the questions + exam-papers modules' stubbed-sql
 * unit tests (T-MIG-031 tranche 1). NOT a test file (bun test only picks up
 * *.test.ts). Structural duplicate of the fakeSql `rowsFor` pattern from
 * test/curriculum/helpers.ts (T-MIG-021) / test/assessment/helpers.ts
 * (T-MIG-030) — no cross-fence test imports (per-module seam convention).
 */
import type { SqlFn } from "../../src/services/questions/sql";

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
 * `rowsFor` when the result depends on a bound parameter (id lookups that
 * must distinguish known from unknown ids).
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

// ── Fixed-constant uuid fixtures (golden law @ 6cad6ef) ────────────────────

export const MCQ_ID = "41000000-0000-4000-8000-000000000001";
export const STRUCTURED_ID = "41000000-0000-4000-8000-000000000002";
export const BLOCKED_ID = "41000000-0000-4000-8000-000000000003";
export const INACTIVE_ID = "41000000-0000-4000-8000-000000000004";
export const UNKNOWN_ID = "00000000-0000-4000-8000-00000000dead";
export const PAPER_OK_ID = "42000000-0000-4000-8000-000000000001";
export const PAPER_REJECTED_ID = "42000000-0000-4000-8000-000000000002";
export const TOPIC_ID = "20000000-0000-4000-8000-000000000012";
export const TOPIC2_ID = "20000000-0000-4000-8000-000000000013";
export const SECTION_A_ID = "21000000-0000-4000-8000-000000000001";
export const SECTION_B_ID = "21000000-0000-4000-8000-000000000002";
export const OPT_A_ID = "50000000-0000-4000-8000-00000000000a";
export const OPT_B_ID = "50000000-0000-4000-8000-00000000000b";
export const PART_1_ID = "60000000-0000-4000-8000-000000000001";
export const PART_2_ID = "60000000-0000-4000-8000-000000000002";
export const VERSION_ID = "61000000-0000-4000-8000-000000000001";
export const SCHEME_ID = "62000000-0000-4000-8000-000000000001";
export const PAPER_DOC_ID = "43000000-0000-4000-8000-000000000001";

/** MCQ row — paper-less SEED_DEMO orphan (per-question rule only). */
export const MCQ_ROW = {
  id: MCQ_ID,
  external_ref: null,
  question_type: "MCQ_SINGLE",
  stem: "  What  is the state symbol? ",
  marks: 1,
  difficulty: 2,
  expected_time_seconds: 45,
  command_word: null,
  primary_topic_node_id: TOPIC_ID,
  exam_paper_id: null,
  provenance: "SEED_DEMO",
  active: true,
};

export const MCQ_OPTIONS = [
  { id: OPT_A_ID, question_id: MCQ_ID, label: "A", text: "solid", ordering: 1 },
  { id: OPT_B_ID, question_id: MCQ_ID, label: "B", text: "liquid", ordering: 2 },
];

/** STRUCTURED row under the VALIDATED paper, with a VALIDATED v2. */
export const STRUCTURED_ROW = {
  id: STRUCTURED_ID,
  external_ref: "sme-eq-1-1-states-of-matter-q16-p1",
  question_type: "STRUCTURED",
  stem: "row stem",
  marks: 3,
  difficulty: 3,
  expected_time_seconds: 120,
  command_word: "row cw",
  primary_topic_node_id: TOPIC_ID,
  exam_paper_id: PAPER_OK_ID,
  provenance: "PAST_PAPER",
  active: true,
};

/** Version rows flat (versions × parts, left-joined): v1 SUGGESTED (1 part),
 * v2 VALIDATED (2 parts) — the max-version pick must land on v2. */
export const STRUCTURED_VERSIONS = [
  { id: "61000000-0000-4000-8000-00000000000a", question_id: STRUCTURED_ID, version: 1, stem: "v1 stem", marks: 2, difficulty: 4, expected_time_seconds: 90, command_word: "v1 cw", validation_state: "SUGGESTED", part_id: null, part_label: null, part_prompt: null, part_command_word: null, part_marks: null, part_ordering: null },
  { id: VERSION_ID, question_id: STRUCTURED_ID, version: 2, stem: "v2 stem", marks: 6, difficulty: 4, expected_time_seconds: 150, command_word: "v2 cw", validation_state: "VALIDATED", part_id: PART_1_ID, part_label: "a", part_prompt: "part one", part_command_word: "state", part_marks: 4, part_ordering: 1 },
  { id: VERSION_ID, question_id: STRUCTURED_ID, version: 2, stem: "v2 stem", marks: 6, difficulty: 4, expected_time_seconds: 150, command_word: "v2 cw", validation_state: "VALIDATED", part_id: PART_2_ID, part_label: "b", part_prompt: "part two", part_command_word: "explain", part_marks: 2, part_ordering: 2 },
];

export const BLOCKED_ROW = {
  ...STRUCTURED_ROW,
  id: BLOCKED_ID,
  external_ref: "sme-eq-1-2-elements-compounds-and-mixtures-q18-p1",
  exam_paper_id: PAPER_REJECTED_ID,
  primary_topic_node_id: TOPIC2_ID,
};

export const BLOCKED_VERSIONS = [
  { ...STRUCTURED_VERSIONS[0], question_id: BLOCKED_ID, validation_state: "VALIDATED", version: 2, id: "61000000-0000-4000-8000-00000000000b", part_id: null },
  { ...STRUCTURED_VERSIONS[0], question_id: BLOCKED_ID, validation_state: "SUGGESTED", version: 1, id: "61000000-0000-4000-8000-00000000000c", part_id: null },
];

export const INACTIVE_ROW = { ...MCQ_ROW, id: INACTIVE_ID, active: false };

export const BLOCKING_PAPERS = [{ id: PAPER_REJECTED_ID }];

/** Query-text matches for the four question-list shapes (allActive /
 * activeByTopic / activeWithin / findById) — distinct collapsed texts. */
export const LIST_ALL = /from questions q where q\.active = true order by q\.difficulty/;
export const LIST_BY_TOPIC = /qt\.node_id = \?\s*\)\s*\)/;
export const LIST_WITHIN = /qt\.node_id = any\(\s*\?\s*::uuid\[\]\s*\)\s*\)\s*\)/;
export const BY_ID = /from questions q where q\.id = \?/;

/** Standard route table for the servable read model (dispatch on collapsed
 * text; order matters — most specific first). `extra` routes come FIRST so
 * test-level overrides shadow the defaults. */
export function servableRoutes(extra: Route[] = []): Route[] {
  const table: Route[] = [
    {
      // V20 blocking list (small by construction)
      match: /from exam_papers p where p\.validation_state in/,
      rows: BLOCKING_PAPERS,
    },
    {
      // spec-point codes (join through knowledge_nodes)
      match: /from question_spec_points qsp/,
      rows: [
        { question_id: STRUCTURED_ID, code: "4CH1-2.3", role: "SECONDARY", applicability: null },
        { question_id: STRUCTURED_ID, code: "4CH1-1.15", role: "PRIMARY", applicability: { papers: ["4CH1"] } },
      ],
    },
    {
      match: /from question_options o/,
      rows: MCQ_OPTIONS,
    },
    {
      // batched versions+parts (left join flat)
      match: /from question_versions v left join question_parts p/,
      rows: [],
      rowsFor: (params: unknown[]) => {
        const ids = params[0] as string[];
        const out: Array<Record<string, unknown>> = [];
        if (ids.includes(STRUCTURED_ID)) out.push(...STRUCTURED_VERSIONS);
        if (ids.includes(BLOCKED_ID)) out.push(...BLOCKED_VERSIONS);
        return out;
      },
    },
  ];
  return [...extra, ...table];
}

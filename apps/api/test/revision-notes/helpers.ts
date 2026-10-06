/**
 * Shared helpers for the revision-notes module's stubbed-sql unit tests
 * (T-MIG-053 tranche-3). Mirrors test/sme/helpers.ts (T-MIG-033/054) —
 * including buildZip/clock/txSql reuse (the fleet's cross-module
 * test-helper precedent: sme/helpers itself imports the assessment Route).
 */
import type { SqlFn } from "../../src/services/assessment/sql";
import type { TxSqlFn } from "../../src/services/sme/index.js";
import { fakeSql } from "../curriculum/helpers";
import type { Route } from "../assessment/helpers";
import { clock, txSql as smeTxSql, buildZip } from "../sme/helpers";

export { fakeSql, clock, buildZip };
export type { Route };

/** fakeSql + a transaction() that forwards to the base fn (adapter shim). */
export function txSql(routes: Route[]): TxSqlFn {
  return smeTxSql(routes) as TxSqlFn;
}

export function queriesOf(sql: SqlFn & { queries: string[] }): string[] {
  return sql.queries;
}

// ── fixed-constant uuids ─────────────────────────────────────────────────────

export const USER = "f1000000-0000-4000-8000-000000000001";

export const note = (overrides: Partial<Record<string, unknown>> = {}) => ({
  note_id: "2.31-ph",
  topic_order: 2,
  topic_title: "Inorganic chemistry",
  subtopic_order: 3,
  subtopic_title: "Acids and bases",
  note_order: 1,
  title: "pH and indicators",
  body_md: "intro ![fig](assets/fig-1.png) more ![fig2](assets/fig-2.png) ![fig](assets/fig-1.png)",
  spec_map: '{"4CH1-2.31":"recall"}',
  spec_point_codes: "4CH1-2.31,4CH1-2.32",
  source_url: "https://example.test/2.31",
  ingested_at: "2026-10-05T09:00:00Z",
  corpus_version: "4CH1-notes-2026-09",
  ...overrides,
});

/** the canonical corpus order the service relies on (the driver returns
 *  them already ordered — the ORDER BY itself is pinned by query-text
 *  capture in learner.test.ts). */
export const CORPUS_ROWS = [
  note(),
  note({ note_id: "2.31-strong-acids", note_order: 2, title: "Strong acids", body_md: "plain body" }),
  note({
    note_id: "2.32-salts",
    subtopic_order: 4,
    subtopic_title: "Salt preparations",
    note_order: 1,
    title: "Making salts",
    body_md: "salts",
    spec_point_codes: "",
  }),
];

// ── the corpus package v1 fixtures ──────────────────────────────────────────

export const pkg = (overrides: Record<string, unknown> = {}) => ({
  packageVersion: "1.0",
  corpusVersion: "4CH1-notes-2026-09",
  generatedAt: "2026-09-23T00:00:00Z",
  topics: [
    {
      order: 2,
      title: "Inorganic chemistry",
      subtopics: [
        {
          order: 3,
          title: "Acids and bases",
          notes: [
            {
              noteId: "2.31-ph",
              title: "pH and indicators",
              order: 1,
              bodyMd: "intro ![fig](assets/fig-1.png)",
              specMapJson: '{"4CH1-2.31":"recall"}',
              specPointCodes: "4CH1-2.31",
              sourceUrl: "https://example.test/2.31",
              assets: ["fig-1.png"],
            },
          ],
        },
      ],
    },
  ],
  assets: [{ filename: "fig-1.png", contentType: "image/png" }],
  ...overrides,
});

/** the ingest service's statement shapes; `capture` records the bound
 *  params of the insert statements (the harness renders slots as `?`). */
export const ingestRoutes = (
  overrides: Partial<Record<string, unknown[]>> = {},
  capture?: { notes: unknown[][]; assets: unknown[][] },
): Route[] => [
  {
    match: /select count\(\*\) as n from revision_note$/,
    rows: (overrides.noteCount ?? [{ n: 0 }]) as Array<Record<string, unknown>>,
  },
  { match: /delete from revision_note/, rows: [] },
  { match: /delete from revision_note_asset/, rows: [] },
  {
    match: /insert into revision_note \(/,
    rows: [],
    ...(capture ? { rowsFor: (params: unknown[]) => { capture.notes.push(params); return []; } } : {}),
  },
  {
    match: /insert into revision_note_asset \(/,
    rows: [],
    ...(capture ? { rowsFor: (params: unknown[]) => { capture.assets.push(params); return []; } } : {}),
  },
  {
    match: /delete from revision_note_viewed v where not exists/,
    rows: [],
  },
  {
    match: /select ingested_at, corpus_version from revision_note limit 1/,
    rows: (overrides.anyNote ?? [
      { ingested_at: "2026-10-05T09:00:00Z", corpus_version: "4CH1-notes-2026-09" },
    ]) as Array<Record<string, unknown>>,
  },
  {
    match: /select count\(\*\) as n from revision_note_asset/,
    rows: (overrides.assetCount ?? [{ n: 1 }]) as Array<Record<string, unknown>>,
  },
];

// ── the learner service's SELECT shapes ─────────────────────────────────────

export const learnerRoutes = (overrides: Partial<Record<string, unknown[]>> = {}): Route[] => [
  {
    match: /select note_id, topic_order, topic_title, subtopic_order, subtopic_title, note_order, title, body_md, spec_map::text as spec_map, spec_point_codes, source_url, ingested_at, corpus_version from revision_note order by topic_order asc, subtopic_order asc, note_order asc/,
    rows: (overrides.notes ?? CORPUS_ROWS) as Array<Record<string, unknown>>,
  },
  {
    match: /select note_id, viewed_at from revision_note_viewed where user_id = \? ::uuid and note_id = \?/,
    rows: (overrides.existingViewed ?? []) as Array<Record<string, unknown>>,
  },
  {
    match: /select note_id, viewed_at from revision_note_viewed where user_id = \? ::uuid order by viewed_at desc/,
    rows: (overrides.viewed ?? []) as Array<Record<string, unknown>>,
  },
  {
    match: /select note_id from revision_note where note_id = \?/,
    rows: (overrides.noteExists ?? [{ note_id: "2.31-ph" }]) as Array<Record<string, unknown>>,
  },
  {
    match: /select filename, content_type, size_bytes, bytes, ingested_at from revision_note_asset where filename = \?/,
    rows: (overrides.asset ?? [
      {
        filename: "fig-1.png",
        content_type: "image/png",
        size_bytes: 5,
        bytes: new Uint8Array([1, 2, 3, 4, 5]),
        ingested_at: "2026-10-05T09:00:00Z",
      },
    ]) as Array<Record<string, unknown>>,
  },
  { match: /insert into revision_note_viewed/, rows: [] },
];

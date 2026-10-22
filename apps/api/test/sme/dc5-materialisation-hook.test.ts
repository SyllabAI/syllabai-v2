/**
 * DC-5 materialisation-hook test — the ingestion hook rides the SAME
 * transaction as each mark_points insert (prereg
 * docs/DC5-CONFORMANCE-LINT-PLAN.md §4.2): a point whose scheme text
 * carries acceptance cues materialises its rows; empty extraction inserts
 * NOTHING (the zero-query fail-open the existing ingest-flow pins already
 * exercise implicitly).
 */
import { describe, expect, test } from "bun:test";
import type { Route } from "../assessment/helpers";
import { buildZip, clock, pkgJson, structured, txSql, NODE_4CH1 } from "./helpers";
import { buildSmeModule } from "../../src/services/sme";
import type { TxSqlFn } from "../../src/services/sme";
import type { SqlFn } from "../../src/services/assessment/sql";

function kgRoutes(codes: string[]): Route[] {
  return [
    {
      match: /select id, code from knowledge_nodes where code = any/,
      rows: [],
      rowsFor: (params) => {
        const wanted = params[0] as string[];
        return wanted
          .filter((c) => codes.includes(c))
          .map((c, i) => ({ id: c === "4CH1-S1-c" ? NODE_4CH1 : "20000000-0000-4000-8000-" + i, code: c }));
      },
    },
    { match: /update questions set active = false/, rows: [] },
    { match: /insert into questions/, rows: [] },
    { match: /insert into question_versions/, rows: [] },
    { match: /insert into mark_schemes/, rows: [] },
    { match: /insert into mark_points/, rows: [] },
    { match: /insert into mark_point_alternatives/, rows: [] },
    { match: /insert into question_options/, rows: [] },
    { match: /insert into question_parts/, rows: [] },
    { match: /insert into question_topics/, rows: [] },
    { match: /insert into question_spec_points/, rows: [] },
    { match: /delete from question_asset/, rows: [] },
    { match: /insert into question_asset/, rows: [] },
  ];
}

describe("DC-5 ingestion hook — the materialisation rides the same tx", () => {
  test("a per-point scheme text with acceptance cues materialises ALTERNATIVE rows", async () => {
    const q = structured({
      marks: 2,
      parts: [
        {
          label: "(a)",
          prompt: "Describe what happens to the rate.",
          marks: 2,
          commandWord: null,
          solutionMd: null,
          options: null,
          markPoints: [
            { text: "Accept: rate increases. Allow: faster collisions.", marks: 1 },
            { text: "explains in terms of collision frequency", marks: 1 },
          ],
        },
      ],
    } as never);
    const inserts: Array<{ text: string; params: unknown[] }> = [];
    const routes = kgRoutes(["4CH1-S1-c", "4CH1-S2-a", "4CH1-1.15"]);
    // wrap the sql to capture the alternatives inserts (params carry ids/values);
    // the transaction forwards to the CAPTURING fn (the hook rides the same tx)
    const base = txSql(routes);
    const capturing = async (
      strings: TemplateStringsArray,
      ...params: unknown[]
    ): Promise<unknown[]> => {
      const text = strings.join("?");
      if (text.includes("insert into mark_point_alternatives")) {
        inserts.push({ text, params });
      }
      return (base as unknown as (s: TemplateStringsArray, ...p: unknown[]) => Promise<unknown[]>)(
        strings,
        ...params,
      );
    };
    const wrapped = Object.assign(capturing, {
      transaction: async <T,>(body: (tx: SqlFn) => Promise<T>): Promise<T> =>
        body(capturing as unknown as SqlFn),
    }) as unknown as TxSqlFn;
    const service = buildSmeModule(wrapped, clock).ingestService;
    await service.ingest(buildZip([{ name: "package.json", data: pkgJson([q]) }]));
    expect(inserts.length).toBe(2); // both extracted rows (one per cue clause)
    const values = inserts.map((i) => String(i.params[4])); // the value column
    expect(values).toContain("rate increases");
    expect(values).toContain("faster collisions");
    expect(inserts[0]!.text).toContain("on conflict (mark_point_id, kind, normalised) do nothing");
    expect(String(inserts[0]!.params[7])).toContain("dc5-r1-ingestion");
  });
});

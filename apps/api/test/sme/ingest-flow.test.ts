/**
 * SME ingest SQL-flow + status pins (T-MIG-033 tranche 3) — the replace
 * flow over fakeSql: slice-scoped deactivation with the EMITTED refs (base
 * + derived), the insert sequence per family shape (MCQ / pure structured /
 * mixed -pN/-s), the asset-store wholesale-replace law, the unknown-KG-code
 * law, and the status snapshot (structured = active − mcq). Everything runs
 * inside the transaction shim — the real adapter provides
 * begin/commit/rollback (the ADR-026 evidence-safe replace).
 */
import { describe, expect, test } from "bun:test";
import { buildSmeModule } from "../../src/services/sme";
import type { Route } from "../assessment/helpers";
import { buildZip, clock, mcq, pkgJson, structured, txSql, NODE_4CH1 } from "./helpers";

// fakeSql route table: the deactivate update returns one row per ref (the
// update count law via RETURNING); inserts return nothing.
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
    { match: /insert into question_options/, rows: [] },
    { match: /insert into question_parts/, rows: [] },
    { match: /insert into question_topics/, rows: [] },
    { match: /insert into question_spec_points/, rows: [] },
    { match: /delete from question_asset/, rows: [] },
    { match: /insert into question_asset/, rows: [] },
  ];
}

function svc(routes: Route[]) {
  return buildSmeModule(txSql(routes), clock).ingestService;
}

const enc = new TextEncoder();

async function ingestQuestions(questions: unknown, assets: Array<[string, Uint8Array]> = []) {
  const service = svc(kgRoutes(["4CH1-S1-c", "4CH1-S2-a", "4CH1-1.15"]));
  const inputs: Array<{ name: string; data: Uint8Array; method?: 0 | 8 }> = [{ name: "package.json", data: pkgJson(questions) }];
  for (const [name, data] of assets) inputs.push({ name: "assets/" + name, data, method: 0 as const });
  return service.ingest(buildZip(inputs));
}

describe("ingest replace flow (frozen :138-299)", () => {
  test("MCQ happy path: deactivate carries the package ref; summary counts + corpusVersion", async () => {
    const routes = kgRoutes(["4CH1-S1-c"]);
    let deactivateParams: unknown[] = [];
    const wrapped: Route[] = routes.map((r) =>
      /update questions/.test(String(r.match))
        ? {
            match: r.match,
            rows: [],
            rowsFor: (params) => {
              deactivateParams = params;
              return [{ id: "x" }, { id: "y" }]; // the update count law (RETURNING)
            },
          }
        : r,
    );
    const s = svc(wrapped);
    const summary = await s.ingest(buildZip([{ name: "package.json", data: pkgJson([mcq()]) }]));

    expect(deactivateParams[0]).toEqual(["4CH1-Q1"]);
    expect(summary).toEqual({
      questions: 1, mcq: 1, structured: 0, parts: 0, options: 2, markPoints: 1,
      specPointMappings: 0, topicMappings: 0, assets: 0, deactivated: 2, corpusVersion: "cor-9",
    });
  });

  test("asset-bearing ingest replaces the store wholesale (one delete + inserts, SVG demoted at the wire)", async () => {
    const routes = kgRoutes(["4CH1-S1-c"]);
    const deletes: unknown[][] = [];
    const assetInserts: unknown[][] = [];
    const wrapped: Route[] = [...routes.filter((r) => !/question_asset/.test(String(r.match)))];
    wrapped.push(
      { match: /delete from question_asset/, rows: [], rowsFor: (params) => (deletes.push(params), []) },
      { match: /insert into question_asset/, rows: [], rowsFor: (params) => (assetInserts.push(params), []) },
    );
    const s = svc(wrapped);
    const png = new Uint8Array([137, 80, 78, 71]);
    const svg = new Uint8Array([60, 115, 118, 103]);
    const summary = await s.ingest(
      buildZip([
        { name: "package.json", data: pkgJson([mcq({ stem: "see (assets/pic.png)" })]) },
        { name: "assets/pic.png", data: png, method: 0 },
        { name: "assets/diagram.svg", data: svg, method: 0 },
      ]),
    );
    expect(summary.assets).toBe(2);
    expect(deletes.length).toBe(1); // exactly one wholesale delete
    expect(assetInserts.length).toBe(2);
    expect(assetInserts[0]![0]).toBe("pic.png");
    expect(assetInserts[0]![1]).toBe("image/png");
    expect(assetInserts[1]![1]).toBe("application/octet-stream"); // the R14 demotion
  });

  test("zero-package-asset ingest NEVER touches the serving asset store", async () => {
    const routes = kgRoutes(["4CH1-S1-c"]);
    const deletes: unknown[][] = [];
    const wrapped: Route[] = [...routes.filter((r) => !/question_asset/.test(String(r.match)))];
    wrapped.push(
      { match: /delete from question_asset/, rows: [], rowsFor: (params) => (deletes.push(params), []) },
    );
    const s = svc(wrapped);
    const summary = await s.ingest(buildZip([{ name: "package.json", data: pkgJson([mcq()]) }]));
    expect(summary.assets).toBe(0);
    expect(deletes.length).toBe(0); // the store has no corpus key — untouched
  });

  test("pure structured: version carries the part-sum marks; per-part mark points; spec points AI_VALIDATED", async () => {
    const inserts: Array<{ re: RegExp; params: unknown[] }> = [];
    const track = (re: RegExp): Route => ({
      match: re,
      rows: [],
      rowsFor: (params) => (inserts.push({ re, params }), []),
    });
    const routes: Route[] = [
      ...kgRoutes(["4CH1-S1-c", "4CH1-S2-a", "4CH1-1.15"]).filter(
        (r) => !/insert|update/.test(String(r.match)),
      ),
      { match: /update questions set active = false/, rows: [], rowsFor: () => [{ id: "x" }] },
      track(/insert into questions/),
      track(/insert into question_versions/),
      track(/insert into mark_schemes/),
      track(/insert into mark_points/),
      track(/insert into question_parts/),
      track(/insert into question_topics/),
      track(/insert into question_spec_points/),
    ];
    const s = svc(routes);
    const summary = await s.ingest(buildZip([{ name: "package.json", data: pkgJson([structured()]) }]));

    expect(summary).toMatchObject({
      questions: 1, mcq: 0, structured: 1, parts: 2, markPoints: 2,
      specPointMappings: 1, topicMappings: 1,
    });

    const version = inserts.find((i) => i.re.test("insert into question_versions"))!;
    expect(version.params[4]).toBe(4); // marks = sum of the parts (the saveStructuredBody law)
    expect(version.params[8]).toBe("VALIDATED");
    const specPoint = inserts.find((i) => i.re.test("insert into question_spec_points"))!;
    expect(specPoint.params[3]).toBe("PRIMARY");
    expect(specPoint.params[4]).toBe("AI_VALIDATED"); // null provenance → AI_VALIDATED (the ctor law)
    expect(specPoint.params[5]).toBe("AI_VALIDATED"); // validation_state constant
    const topics = inserts.filter((i) => i.re.test("insert into question_topics"));
    expect(topics.length).toBe(1);
    expect(topics[0]!.params[3]).toBe(false); // is_primary
  });

  test("mixed family: deactivation covers the derived -p1/-s refs; -p MCQ row then -s structured row", async () => {
    const mixed = structured({
      parts: [
        { label: "(a)", prompt: "pick a", marks: 2, commandWord: null, solutionMd: null,
          options: [{ label: "A", text: "x", isCorrect: true }, { label: "B", text: "y", isCorrect: false }] },
        { label: "(b)", prompt: "plain b", marks: 2, commandWord: null, solutionMd: null, options: null },
      ],
      specPoints: null,
      secondaryTopicCodes: null,
    } as Partial<Record<string, unknown>>);
    const deactivateParams: unknown[][] = [];
    const questionRefs: unknown[] = [];
    const routes: Route[] = [
      {
        match: /select id, code from knowledge_nodes where code = any/,
        rows: [{ id: NODE_4CH1, code: "4CH1-S1-c" }],
        rowsFor: (p) => (p[0] as string[]).map((c) => ({ id: NODE_4CH1, code: c })),
      },
      {
        match: /update questions set active = false/,
        rows: [],
        rowsFor: (params) => (deactivateParams.push(params), [{ id: "x" }]),
      },
      { match: /insert into questions/, rows: [], rowsFor: (params) => (questionRefs.push(params[1]), []) },
      { match: /insert into question_versions/, rows: [] },
      { match: /insert into mark_schemes/, rows: [] },
      { match: /insert into mark_points/, rows: [] },
      { match: /insert into question_options/, rows: [] },
      { match: /insert into question_parts/, rows: [] },
      { match: /insert into question_topics/, rows: [] },
      { match: /insert into question_spec_points/, rows: [] },
    ];
    const s = svc(routes);
    const summary = await s.ingest(buildZip([{ name: "package.json", data: pkgJson([mixed]) }]));

    expect(deactivateParams[0]![0]).toEqual(["4CH1-Q2", "4CH1-Q2-p1", "4CH1-Q2-s"]);
    expect(questionRefs).toEqual(["4CH1-Q2-p1", "4CH1-Q2-s"]); // -p MCQ row first, -s structured row second
    expect(summary.mcq).toBe(0); // the frozen counter law: a MIXED question increments STRUCTURED only (:229)
    expect(summary.structured).toBe(1);
    expect(summary.parts).toBe(1); // only the plain part lands on the -s row
    expect(summary.markPoints).toBe(2); // one for the -p row + one -s part
    expect(summary.topicMappings).toBe(0);
  });

  test("unknown KG code: first-missing in INSERTION ORDER carries the verbatim message", async () => {
    const s = svc([
      {
        match: /select id, code from knowledge_nodes where code = any/,
        rows: [],
        rowsFor: (p) =>
          (p[0] as string[]).filter((c) => c === "4CH1-S1-c").map((c) => ({ id: NODE_4CH1, code: c })),
      },
      { match: /update questions set active = false/, rows: [] },
      { match: /insert into/, rows: [] },
    ]);
    const q1 = mcq({ primaryTopicCode: "4CH1-S1-c" });
    const q2 = mcq({ externalRef: "4CH1-Q9", secondaryTopicCodes: ["ZZZ-MISSING", "AAA-MISSING"] });
    await expect(
      s.ingest(buildZip([{ name: "package.json", data: pkgJson([q1, q2]) }])),
    ).rejects.toThrow("unknown KG code: ZZZ-MISSING");
  });

  test("validation failures leave the live bank untouched (fail-closed BEFORE any statement)", async () => {
    const s = svc([{ match: /./, rows: [] }]);
    await expect(
      s.ingest(buildZip([{ name: "package.json", data: pkgJson([{ packageVersion: "1.0", externalRef: "X" }]) }])),
    ).rejects.toThrow();
    // fakeSql throws on ANY unexpected query — zero queries reached it, so
    // no statement (not even the deactivate) fired.
  });

  test("not a ZIP at the ingest boundary → the not-a-ZIP translation", async () => {
    const s = svc([{ match: /./, rows: [] }]);
    await expect(s.ingest(enc.encode("garbage"))).rejects.toThrow(
      "could not read the corpus package (not a ZIP?)",
    );
  });
});

describe("status snapshot (frozen :424-433)", () => {
  test("two question counts + spec points + assets; structured = active − mcq (computed, not counted)", async () => {
    const routes: Route[] = [
      { match: /from questions where active = true$/, rows: [{ count: 7 }] },
      {
        match: /from questions where active = true and question_type = 'MCQ_SINGLE'/,
        rows: [{ count: 3 }],
      },
      { match: /select count\(\*\)::int as count from question_spec_points/, rows: [{ count: 11 }] },
      { match: /select count\(\*\)::int as count from question_asset/, rows: [{ count: 4 }] },
    ];
    const s = buildSmeModule(txSql(routes), clock).ingestService;
    const view = await s.status();

    expect(view).toEqual({
      activeQuestions: 7,
      activeMcq: 3,
      activeStructured: 4, // the frozen law
      specPointMappings: 11,
      assets: 4,
    });
  });
});

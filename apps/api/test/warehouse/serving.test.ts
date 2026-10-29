import { describe, expect, test } from "bun:test";
import type { SqlFn } from "../../src/services/tutor/sql";
import {
  buildWarehouseServingSeam,
  type WarehouseSearchInput,
} from "../../src/services/warehouse/serving";
import { toChunkHit } from "../../src/services/content/retrieval";

/**
 * T-OPS-PLANE-001 run-004 — the warehouse serving seam (ADR-038 §3.3 flip
 * law + DATA-PLANE-PLACEMENT §4 seam contract), over the recording fakeSql
 * adapter (the T-MIG-094 pin pattern):
 *
 *   1. master switch off / absent → NULL seam — every surface keeps the
 *      verbatim main-plane path (zero behavior change until enabled);
 *   2. registry table absent (migration 0013 not applied) → null routing,
 *      the flip is "not provisioned", main serves — honest degradation;
 *   3. coverage law: ONE uncovered subject keeps the WHOLE scope on main;
 *   4. the two-step seam: step 1 rides the frozen template's query of
 *      record (course_group filter, kind folded into text, overfetch
 *      candidate cap), step 2 hydrates on MAIN in ONE batched query with
 *      the VERBATIM serving-eligible predicate (embed_rev + VALIDATED
 *      scope EXISTS + kind fold) and ids + curriculum version as BOUND
 *      params;
 *   5. warehouse cosine order is restored over the hydrated rows and the
 *      result trims to the requested limit;
 *   6. fail-loud posture: SERVING row with a blank URL env THROWS — never
 *      a silent re-route to a possibly-dropped main.
 */

type Row = Record<string, unknown>;

function recordingSql(responses: Record<string, Row[] | (() => never)>) {
  const seen: Array<{ text: string; params: unknown[] }> = [];
  const fn = (async (strings: TemplateStringsArray, ...params: unknown[]) => {
    const text = strings
      .join("?")
      .replace(/\s+/g, " ")
      .trim();
    seen.push({ text, params: [...params] });
    for (const key of Object.keys(responses)) {
      if (text.includes(key)) {
        const value = responses[key];
        if (typeof value === "function") return (value as () => never)();
        return value;
      }
    }
    return [];
  }) as unknown as SqlFn & { seen: Array<{ text: string; params: unknown[] }> };
  fn.seen = seen;
  return fn;
}

const REGISTRY_ROW: Row = {
  course_group: "maths-4ma1",
  subject_id: "11111111-1111-1111-1111-111111111111",
  warehouse_url_env: "SYLLABAI_WAREHOUSE_URL_MATHS_4MA1",
};

const COVERAGE_ROWS = [
  {
    subject_id: "11111111-1111-1111-1111-111111111111",
    course_group: "maths-4ma1",
    warehouse_url_env: "SYLLABAI_WAREHOUSE_URL_MATHS_4MA1",
  },
];

/** One 4MA1-shaped hydrated main row (the superset shape the seam returns). */
const chunkRow = (id: string, over: Partial<Row> = {}): Row => ({
  id,
  document_row_id: `row-${id}`,
  doc_version: 3,
  document_id: `doc-${id}`,
  kind: "QUESTION_PAPER",
  chunk_index: 7,
  content: `content of ${id}`,
  page_start: 2,
  page_end: 3,
  element_ids: JSON.stringify(["e1"]),
  spec_codes: JSON.stringify(["1.15"]),
  embedding_model: "gemini-embedding-001",
  ...over,
});

const WH_CANDIDATES: Row[] = [
  { id: "c-3", score: "0.91" },
  { id: "c-1", score: "0.87" },
  { id: "c-2", score: "0.83" },
];

const ENV_ON = {
  SYLLABAI_WAREHOUSE_SERVING: "on",
  SYLLABAI_WAREHOUSE_URL_MATHS_4MA1: "postgresql://warehouse/maths",
};

const input = (over: Partial<WarehouseSearchInput> = {}): WarehouseSearchInput => ({
  vector: Array.from({ length: 768 }, (_, i) => (i % 5) / 50),
  kind: null,
  curriculumVersionId: "cv-1",
  limit: 2,
  ...over,
});

describe("warehouse serving seam (ADR-038 §3.3 flip law)", () => {
  test("master switch off / absent → NULL seam, zero behavior change", () => {
    expect(buildWarehouseServingSeam(recordingSql({}), {})).toBeNull();
    expect(
      buildWarehouseServingSeam(recordingSql({}), { SYLLABAI_WAREHOUSE_SERVING: "1" }),
    ).toBeNull();
    expect(
      buildWarehouseServingSeam(recordingSql({}), { SYLLABAI_WAREHOUSE_SERVING: "on " }),
    ).toBeNull(); // exact "on" only — no trim tolerance on a safety switch
  });

  test("registry table absent (0013 not applied) → null routing, main serves", async () => {
    const main = recordingSql({
      "from warehouse_registry": () => {
        throw new Error('relation "warehouse_registry" does not exist');
      },
    });
    const seam = buildWarehouseServingSeam(main, ENV_ON, { clientFactory: () => recordingSql({}) });
    expect(seam).not.toBeNull();
    await expect(seam!.searchRows(input())).resolves.toBeNull();
    // the registry read was the ONLY main query — no coverage probe, no hydrate
    expect(main.seen).toHaveLength(1);
  });

  test("registry empty (no SERVING rows) → null routing", async () => {
    const seam = buildWarehouseServingSeam(
      recordingSql({ "from warehouse_registry": [] }),
      ENV_ON,
      { clientFactory: () => recordingSql({}) },
    );
    await expect(seam!.searchRows(input())).resolves.toBeNull();
  });

  test("one uncovered subject keeps the WHOLE scope on main (coverage law)", async () => {
    const seam = buildWarehouseServingSeam(
      recordingSql({
        "from warehouse_registry": [REGISTRY_ROW],
        "left join warehouse_registry": [
          COVERAGE_ROWS[0]!,
          { subject_id: "22222222-2222-2222-2222-222222222222", course_group: null, warehouse_url_env: null },
        ],
      }),
      ENV_ON,
      { clientFactory: () => recordingSql({}) },
    );
    await expect(seam!.searchRows(input())).resolves.toBeNull();
  });

  test("two-step seam: template query of record + verbatim hydration + order + trim", async () => {
    const wh = recordingSql({ "from warehouse_chunks": WH_CANDIDATES });
    const main = recordingSql({
      "from warehouse_registry": [REGISTRY_ROW],
      "left join warehouse_registry": COVERAGE_ROWS,
      "from document_chunks c": [
        chunkRow("c-2"),
        chunkRow("c-3"),
        chunkRow("c-1"),
        chunkRow("c-9"), // id not in candidates → would be a hydrate bug
      ],
    });
    const seenUrls: string[] = [];
    const seam = buildWarehouseServingSeam(main, ENV_ON, {
      clientFactory: (url) => {
        seenUrls.push(url);
        return wh as SqlFn;
      },
    });
    const rows = await seam!.searchRows(input({ kind: "QUESTION_PAPER", limit: 2 }));
    expect(rows).not.toBeNull();

    // step 1 rode the injected client with the registry's env URL
    expect(seenUrls).toEqual(["postgresql://warehouse/maths"]);
    const step1 = wh.seen[0]!;
    expect(step1.text).toContain("from warehouse_chunks");
    expect(step1.text).toContain("course_group = ?");
    expect(step1.text).toContain("and kind = 'QUESTION_PAPER'"); // folded, never a NULL bind
    expect(step1.text).toContain("order by embedding <=> ?");
    expect(step1.params).toContain("maths-4ma1");
    // candidate cap = limit × overfetch (2 × 3)
    expect(step1.params.at(-1)).toBe(6);
    // run-008 arity pin: FOUR binds — select vector, course group, ORDER-BY
    // vector (the literal rides TWICE), limit. The shipped 3-param version
    // put the cap in the order-by position and left `limit` empty -> Postgres
    // 42601 "syntax error at end of input" on every covered-group ask (first
    // live execution: the T1 flip check). The at(-1) assertion above could
    // not see it — the cap was the last param in BOTH arities.
    expect(step1.params).toHaveLength(4);
    expect(step1.params[0]).toBe(step1.params[2]);

    // step 2 = ONE batched main hydrate with the verbatim predicate
    const hydrates = main.seen.filter((q) => q.text.includes("from document_chunks c"));
    expect(hydrates).toHaveLength(1);
    const hydrate = hydrates[0]!;
    expect(hydrate.text).toContain("c.embed_rev = 2");
    expect(hydrate.text).toContain("exam_papers p");
    expect(hydrate.text).toContain("validation_state = 'VALIDATED'");
    expect(hydrate.text).toContain("and d.kind = 'QUESTION_PAPER'");
    // ids AND the curriculum version ride as BOUND params (3 ids + cv ×2)
    expect(hydrate.params.filter((p) => typeof p === "string" && p.startsWith("c-"))).toHaveLength(3);
    expect(hydrate.params.filter((p) => p === "cv-1")).toHaveLength(2);

    // warehouse cosine order restored, trimmed to limit, score rides
    expect(rows!.map((r) => r.id)).toEqual(["c-3", "c-1"]);
    expect(rows![0]!.score).toBe("0.91");
    expect(rows![0]!.doc_version).toBe(3);
    expect(rows![0]!.spec_codes).toBe(JSON.stringify(["1.15"]));
  });

  test("warehouse step-1 empty → [] (the authoritative plane's honest empty)", async () => {
    const wh = recordingSql({ "from warehouse_chunks": [] });
    const main = recordingSql({
      "from warehouse_registry": [REGISTRY_ROW],
      "left join warehouse_registry": COVERAGE_ROWS,
    });
    const seam = buildWarehouseServingSeam(main, ENV_ON, { clientFactory: () => wh as SqlFn });
    const rows = await seam!.searchRows(input());
    expect(rows).toEqual([]);
    // no hydrate fired — ids would be empty
    expect(main.seen.some((q) => q.text.includes("from document_chunks c"))).toBe(false);
  });

  test("eligibility shrink is honored (hydrate returns fewer than recalled)", async () => {
    const wh = recordingSql({ "from warehouse_chunks": WH_CANDIDATES });
    const main = recordingSql({
      "from warehouse_registry": [REGISTRY_ROW],
      "left join warehouse_registry": COVERAGE_ROWS,
      "from document_chunks c": [chunkRow("c-3")], // c-1/c-2 failed the predicate
    });
    const seam = buildWarehouseServingSeam(main, ENV_ON, { clientFactory: () => wh as SqlFn });
    const rows = await seam!.searchRows(input({ limit: 3 }));
    expect(rows).toHaveLength(1);
    expect(rows![0]!.id).toBe("c-3");
  });

  test("SERVING row with blank URL env → fail loud, never silent main", async () => {
    const seam = buildWarehouseServingSeam(
      recordingSql({
        "from warehouse_registry": [REGISTRY_ROW],
        "left join warehouse_registry": COVERAGE_ROWS,
      }),
      { SYLLABAI_WAREHOUSE_SERVING: "on" }, // the URL env is MISSING
      { clientFactory: () => recordingSql({}) },
    );
    await expect(seam!.searchRows(input())).rejects.toThrow(
      /SYLLABAI_WAREHOUSE_URL_MATHS_4MA1 is blank/,
    );
  });

  test("overfetch env rides (clamped 1..10)", async () => {
    const wh = recordingSql({ "from warehouse_chunks": [] });
    const main = recordingSql({
      "from warehouse_registry": [REGISTRY_ROW],
      "left join warehouse_registry": COVERAGE_ROWS,
    });
    const seam = buildWarehouseServingSeam(
      main,
      { ...ENV_ON, SYLLABAI_WAREHOUSE_OVERFETCH: "99" },
      { clientFactory: () => wh as SqlFn },
    );
    await seam!.searchRows(input({ limit: 50 }));
    expect(wh.seen[0]!.params.at(-1)).toBe(500); // 50 × clamp(99) = 50 × 10
  });

  test("seam superset rows project ChunkHit via the shared toChunkHit", () => {
    const hit = toChunkHit(chunkRow("c-3", { score: "0.91" }));
    expect(hit.chunkId).toBe("c-3");
    expect(hit.documentId).toBe("doc-c-3");
    expect(hit.kind).toBe("QUESTION_PAPER");
    expect(hit.elementIds).toEqual(["e1"]);
    expect(hit.embeddingModel).toBe("gemini-embedding-001");
    expect(hit.score).toBe(0.91); // the seam-injected cosine rides through
  });
});

import { describe, expect, test } from "bun:test";
import type { SqlFn } from "../../src/services/tutor/sql";
import { buildSqlVectorArm, rowsToEvidence } from "../../src/services/tutor/vector-arm";
import type { EmbeddingProvider } from "../../src/services/content/retrieval";
import type { WarehouseServingSeam, WarehouseSearchInput } from "../../src/services/warehouse/serving";
import { MIN_COSINE } from "../../src/services/tutor/karag";

/**
 * T-OPS-PLANE-001 run-004 — the vector arm's serving-seam integration pins:
 *
 *   1. the arm passes the seam kind=null (kind-agnostic by design) and the
 *      CLAMPED limit (MAX_LIMIT=50 law) — the seam never sees an unclamped
 *      ask;
 *   2. seam rows build evidence through the SHARED rowsToEvidence pipeline
 *      — doc_version provenance, spec_codes, cosine floor and the 133d
 *      TEXTBOOK page-truth translation are plane-agnostic (the registry
 *      read stays on MAIN);
 *   3. seam null = "not mine" → the verbatim main-plane SQL serves,
 *      byte-identical to the pre-flip law (the recording adapter sees the
 *      document_chunks query with the embed_rev + VALIDATED predicate);
 *   4. transport failure of the seam PROPAGATES (never a silent main
 *      fallback — the frozen arm catches only provider-absent).
 */

type Row = Record<string, unknown>;

function recordingSql(responses: Record<string, Row[]>) {
  const seen: Array<{ text: string; params: unknown[] }> = [];
  const fn = (async (strings: TemplateStringsArray, ...params: unknown[]) => {
    const text = strings
      .join("?")
      .replace(/\s+/g, " ")
      .trim();
    seen.push({ text, params: [...params] });
    for (const key of Object.keys(responses)) {
      if (text.includes(key)) return responses[key];
    }
    return [];
  }) as unknown as SqlFn & { seen: Array<{ text: string; params: unknown[] }> };
  fn.seen = seen;
  return fn;
}

const provider: EmbeddingProvider = {
  model: () => "gemini-embedding-001",
  dimension: () => 768,
  embedQuery: async () => Array.from({ length: 768 }, (_, i) => (i % 7) / 49),
  embedDocument: async () => Array.from({ length: 768 }, () => 0.1),
};

const SCOPE = { surface: new Set<string>(["4MA1"]), curriculumVersionId: "cv-maths" };

const seamRow = (id: string, over: Partial<Row> = {}): Row => ({
  id,
  document_row_id: `row-${id}`,
  doc_version: 2,
  document_id: `doc-${id}`,
  kind: "MARK_SCHEME",
  chunk_index: 11,
  content: `mark scheme chunk ${id}`,
  page_start: 8,
  page_end: 9,
  element_ids: JSON.stringify(["m1"]),
  spec_codes: JSON.stringify(["2.3"]),
  embedding_model: "gemini-embedding-001",
  score: String(MIN_COSINE + 0.3),
  ...over,
});

function fakeSeam(
  rows: Row[] | null,
  hook?: (input: WarehouseSearchInput) => void,
  mode: "rows" | "throw" = "rows",
): WarehouseServingSeam & { calls: WarehouseSearchInput[] } {
  const calls: WarehouseSearchInput[] = [];
  return {
    calls,
    async searchRows(input) {
      calls.push(input);
      hook?.(input);
      if (mode === "throw") throw new Error("warehouse pooler unreachable");
      return rows;
    },
  } as WarehouseServingSeam & { calls: WarehouseSearchInput[] };
}

describe("vector arm × warehouse serving seam (run-004)", () => {
  test("seam rows build evidence via the shared pipeline (spec codes, floor, provenance)", async () => {
    const seam = fakeSeam([
      seamRow("s-1"),
      seamRow("s-2", { score: String(MIN_COSINE - 0.01) }), // below the floor
    ]);
    const arm = buildSqlVectorArm(recordingSql({}), provider, seam);
    const evidence = await arm("integrate by substitution", 12, SCOPE);
    expect(seam.calls).toHaveLength(1);
    expect(seam.calls[0]!.kind).toBeNull(); // kind-agnostic by design
    expect(seam.calls[0]!.limit).toBe(12); // under MAX_LIMIT, passes clamped
    expect(seam.calls[0]!.curriculumVersionId).toBe("cv-maths");
    expect(evidence).toHaveLength(1); // the below-floor candidate never serves
    expect(evidence[0]!.chunkId).toBe("s-1");
    expect(evidence[0]!.documentVersion).toBe(2);
    expect(evidence[0]!.specCodes).toEqual(["2.3"]);
    expect(evidence[0]!.retrievalScore).toBe(MIN_COSINE + 0.3);
  });

  test("limit clamps at MAX_LIMIT=50 before reaching the seam", async () => {
    const seam = fakeSeam([]);
    const arm = buildSqlVectorArm(recordingSql({}), provider, seam);
    await arm("q", 500, SCOPE);
    expect(seam.calls[0]!.limit).toBe(50);
  });

  test("seam null → verbatim main-plane SQL (the pre-flip law, byte-identical)", async () => {
    const main = recordingSql({
      "from document_chunks c": [seamRow("m-1", { score: "0.77" })],
    });
    const arm = buildSqlVectorArm(main, provider, fakeSeam(null));
    const evidence = await arm("q", 5, SCOPE);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]!.chunkId).toBe("m-1");
    // the main query carries the frozen predicate markers
    const q = main.seen[0]!;
    expect(q.text).toContain("c.embed_rev = ?");
    expect(q.text).toContain("exam_papers p");
    expect(q.text).toContain("validation_state = 'VALIDATED'");
    expect(q.text).toContain("order by c.embedding <=> ?");
  });

  test("no seam (pre-flip composition) → identical main-plane posture", async () => {
    const main = recordingSql({ "from document_chunks c": [] });
    const arm = buildSqlVectorArm(main, provider, null);
    expect(await arm("q", 5, SCOPE)).toEqual([]);
    expect(main.seen).toHaveLength(1);
  });

  test("seam transport failure PROPAGATES (never a silent main fallback)", async () => {
    const main = recordingSql({});
    const arm = buildSqlVectorArm(main, provider, fakeSeam(null, undefined, "throw"));
    await expect(arm("q", 5, SCOPE)).rejects.toThrow("warehouse pooler unreachable");
    expect(main.seen).toHaveLength(0); // main was never consulted
  });
});

describe("rowsToEvidence — plane-agnostic pipeline pins", () => {
  test("TEXTBOOK seam rows translate page-truth via the MAIN registry (133d law)", async () => {
    const main = recordingSql({
      "from book_chapters": [
        {
          document_id: "doc-tb",
          course_id: "igcse-maths-4ma1",
          book_page_start: 30,
          book_page_end: 60,
          pdf_page_start: 40,
          pdf_page_end: 70,
        },
      ],
    });
    const evidence = await rowsToEvidence(main, [
      seamRow("tb-1", {
        kind: "TEXTBOOK",
        document_id: "doc-tb",
        page_start: 42, // pdf coord
        page_end: 43,
      }),
    ]);
    expect(main.seen).toHaveLength(1); // ONE batched registry read on main
    expect(main.seen[0]!.text).toContain("from book_chapters");
    expect(evidence[0]!.pageStart).toBe(32); // 42 + offset 30−40, book-true
    expect(evidence[0]!.sourcePageStart).toBe(42); // viewer coord rides raw
    expect(evidence[0]!.bookCourseId).toBe("igcse-maths-4ma1");
  });
});

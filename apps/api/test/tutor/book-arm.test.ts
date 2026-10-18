import { describe, expect, test } from "bun:test";
import type { SqlFn } from "../../src/services/tutor/sql";
import { buildSqlVectorArm } from "../../src/services/tutor/vector-arm";
import { resolveCitations } from "../../src/services/tutor/citations";
import type { EmbeddingProvider } from "../../src/services/content/retrieval";
import { MIN_COSINE } from "../../src/services/tutor/karag";

/**
 * T-MIG-133 band 133d (r0) — the vector arm's Student Books serving gates
 * over the recording fakeSql adapter (the T-MIG-094 pin pattern):
 *
 *   1. the 133d registry lookup rides the 093 inList scalar-param law (the
 *      Neon WebSocket wire 500 class) — one batched query per candidate
 *      batch, never per hit (the T-C32 N+1 law);
 *   2. the page-truth translation: a TEXTBOOK hit's serving coords become
 *      BOOK-page-true (the intake decision of record) while the raw PDF
 *      coords ride sourcePageStart/End for the deep link;
 *   3. the honest fallback: a chunk with no registry row stays PDF-true;
 *   4. spec_codes ride the evidence (the fusion-boost input);
 *   5. the citation of a translated TEXTBOOK item: label book-true
 *      ("Textbook — pp3–4"), deep link viewer-true (page=12, the PDF coord)
 *      + the course binding;
 *   6. the frozen retrieval law is byte-identical: same scope predicate,
 *      cosine floor, limit clamp — non-TEXTBOOK hits never trigger the
 *      registry query.
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

const SCOPE = { surface: new Set<string>(["4CH1"]), curriculumVersionId: "cv-1" };

const bookChunkRow = (over: Partial<Row> = {}): Row => ({
  id: "chunk-b1",
  document_row_id: "row-book",
  doc_version: 1,
  document_id: "doc-book",
  kind: "TEXTBOOK",
  chunk_index: 4,
  content: "the states of matter chunk",
  page_start: 12,
  page_end: 13,
  element_ids: JSON.stringify(["b1"]),
  spec_codes: JSON.stringify(["1.1", "1.2"]),
  embedding_model: "gemini-embedding-001",
  score: String(MIN_COSINE + 0.2),
  ...over,
});

const chapterRow = (over: Partial<Row> = {}): Row => ({
  document_id: "doc-book",
  course_id: "igcse-chemistry-19",
  book_page_start: 3,
  book_page_end: 13,
  pdf_page_start: 12,
  pdf_page_end: 22,
  ...over,
});

describe("133d vector arm — the page-truth translation (the intake law: citations are book_pages)", () => {
  test("TEXTBOOK hit: serving coords translate to the book numbering, PDF coords ride sourcePage*", async () => {
    const sql = recordingSql({
      "1 - (c.embedding": [bookChunkRow()],
      // the registry row: u1:c1 book 3–13 / pdf 12–22 (the pilot's own shape)
      "from book_chapters where document_id in": [chapterRow()],
    });
    const arm = buildSqlVectorArm(sql, provider);
    const items = await arm("states of matter", 5, SCOPE);
    expect(items).toHaveLength(1);
    const item = items[0]!;
    expect(item.source).toBe("TEXTBOOK");
    expect(item.pageStart).toBe(3); // book-true (12 + (3-12))
    expect(item.pageEnd).toBe(4); // 13 + 9 → clamped into 3–13
    expect(item.sourcePageStart).toBe(12); // the viewer-true raw
    expect(item.sourcePageEnd).toBe(13);
    expect(item.bookCourseId).toBe("igcse-chemistry-19");
    expect(item.specCodes).toEqual(["1.1", "1.2"]);
  });

  test("the registry lookup rides the 093 inList scalar-param law (one batched query)", async () => {
    const sql = recordingSql({
      "1 - (c.embedding": [bookChunkRow()],
      "from book_chapters where document_id in": [chapterRow()],
    });
    const arm = buildSqlVectorArm(sql, provider);
    await arm("states of matter", 5, SCOPE);
    const registryCalls = sql.seen.filter((q) => q.text.includes("from book_chapters"));
    expect(registryCalls).toHaveLength(1);
    // TWO distinct document ids ⇒ two scalars, never one array param
    const twoDocs = recordingSql({
      "1 - (c.embedding": [
        bookChunkRow({ id: "chunk-b1", document_id: "doc-book" }),
        bookChunkRow({
          id: "chunk-b2",
          document_row_id: "row-book2",
          document_id: "doc-book2",
          chunk_index: 5,
        }),
      ],
      "from book_chapters where document_id in": [chapterRow()],
    });
    const arm2 = buildSqlVectorArm(twoDocs, provider);
    await arm2("states of matter", 5, SCOPE);
    const call = twoDocs.seen.find((q) => q.text.includes("from book_chapters"))!;
    expect(call.text).toContain("document_id in (?, ?)");
    expect(call.params).toEqual(["doc-book", "doc-book2"]);
  });

  test("a chunk with no registry row stays PDF-true (the honest fallback)", async () => {
    const sql = recordingSql({
      "1 - (c.embedding": [bookChunkRow()],
      "from book_chapters where document_id in": [], // front matter — no rows
    });
    const arm = buildSqlVectorArm(sql, provider);
    const items = await arm("the index chunk", 5, SCOPE);
    const item = items[0]!;
    expect(item.pageStart).toBe(12); // PDF-true, never fabricated
    expect(item.sourcePageStart).toBeNull();
    expect(item.bookCourseId).toBeNull();
  });

  test("a non-TEXTBOOK hit never triggers the registry query (the frozen law untouched)", async () => {
    const sql = recordingSql({
      "1 - (c.embedding": [
        bookChunkRow({
          id: "chunk-qp",
          document_row_id: "row-qp",
          document_id: "doc-qp",
          kind: "QUESTION_PAPER",
          spec_codes: JSON.stringify(["2.40C"]),
        }),
      ],
    });
    const arm = buildSqlVectorArm(sql, provider);
    const items = await arm("rates of reaction", 5, SCOPE);
    expect(items).toHaveLength(1);
    expect(items[0]!.source).toBe("QUESTION_PAPER");
    expect(items[0]!.specCodes).toEqual(["2.40C"]);
    expect(items[0]!.sourcePageStart).toBeNull();
    expect(sql.seen.filter((q) => q.text.includes("from book_chapters"))).toHaveLength(0);
  });

  test("the citation of a translated TEXTBOOK item: label book-true, link viewer-true", async () => {
    const sql = recordingSql({
      "1 - (c.embedding": [bookChunkRow()],
      "from book_chapters where document_id in": [chapterRow()],
    });
    const arm = buildSqlVectorArm(sql, provider);
    const items = await arm("states of matter", 5, SCOPE);
    const [citation] = resolveCitations([items[0]!]);
    expect(citation!.label).toBe("Textbook \u2014 pp3\u20134"); // book-true
    expect(citation!.page).toBe(3);
    expect(citation!.deepLink).toBe(
      "/api/v1/content/books/doc-book?page=12&course=igcse-chemistry-19", // viewer-true
    );
  });

  test("an unkeyed provider degrades honestly BEFORE any query (the frozen law)", async () => {
    const sql = recordingSql({});
    const arm = buildSqlVectorArm(sql, null);
    const items = await arm("anything", 5, SCOPE);
    expect(items).toEqual([]);
    expect(sql.seen).toHaveLength(0);
  });
});

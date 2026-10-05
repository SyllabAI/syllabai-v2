/**
 * T-MIG-023 fidelity pins — the T-MIG-022 findings F-1/F-2/F-3 fixes.
 *
 * F-1: instantToStringUtc pins Java Instant.toString() shortest-round-trip
 *      semantics over the to_char-transported Postgres text, including the
 *      EXACT run-001 captured literals (detail case + listing[0]).
 * F-2: §8 snake_case element keys — covered by the re-pinned
 *      documentPageText test in routes.test.ts.
 * F-3: the frozen QuestionVersionRepository.findByPaperId @Query carries
 *      "order by v.question.externalRef nulls last, v.version desc"
 *      (ContentReviewService.java:869 consumes it for paperReview) — the
 *      port's split query shapes (findFullByPaperId walk + findByPaperId
 *      id list) must carry the identical deterministic clause.
 */
import { describe, expect, test } from "bun:test";
import { instantToStringUtc, DocumentRepository } from "../../src/services/content/repositories";
import { QuestionVersionReadRepository } from "../../src/services/content/review-repos";
import type { SqlFn } from "../../src/services/identity/users";

function capturingSql(rows: Array<Record<string, unknown>>): { sql: SqlFn; texts: string[] } {
  const texts: string[] = [];
  const sql = ((strings: TemplateStringsArray) => {
    texts.push(strings.join("?"));
    return Promise.resolve(rows);
  }) as unknown as SqlFn;
  return { sql, texts };
}

describe("T-MIG-023 F-1: instantToStringUtc (Java Instant.toString() parity)", () => {
  test("micros group survives verbatim — run-001 captured literals", () => {
    // exact divergent values from T-MIG-022 run-001 diagnosis
    expect(instantToStringUtc("2026-09-21T12:59:21.578011Z")).toBe("2026-09-21T12:59:21.578011Z");
    expect(instantToStringUtc("2026-10-04T09:37:00.129532Z")).toBe("2026-10-04T09:37:00.129532Z");
  });
  test("millis: trailing zeros trimmed to the 3-digit group", () => {
    expect(instantToStringUtc("2026-10-04T09:37:00.129000Z")).toBe("2026-10-04T09:37:00.129Z");
    expect(instantToStringUtc("2026-10-04T09:37:00.578010Z")).toBe("2026-10-04T09:37:00.57801Z");
    expect(instantToStringUtc("2026-10-04T09:37:00.500000Z")).toBe("2026-10-04T09:37:00.5Z");
  });
  test("zero fraction: dot dropped entirely", () => {
    expect(instantToStringUtc("2026-10-04T09:37:00.000000Z")).toBe("2026-10-04T09:37:00Z");
  });
  test("leading zeros kept, trailing trimmed (Instant group semantics)", () => {
    expect(instantToStringUtc("2026-10-04T09:37:00.000001Z")).toBe("2026-10-04T09:37:00.000001Z");
    expect(instantToStringUtc("2026-10-04T09:37:00.000010Z")).toBe("2026-10-04T09:37:00.00001Z");
  });
  test("non-6-digit shapes pass through untouched (defensive)", () => {
    expect(instantToStringUtc("2026-10-04T09:37:00Z")).toBe("2026-10-04T09:37:00Z");
    expect(instantToStringUtc("2026-10-04T09:37:00.129Z")).toBe("2026-10-04T09:37:00.129Z");
  });
  test("document queries transport the fraction as UTC text (to_char column)", async () => {
    const { sql, texts } = capturingSql([]);
    const repo = new DocumentRepository(sql);
    await repo.findById("00000000-0000-0000-0000-000000000000");
    expect(texts[0]).toContain(
      "to_char(created_at at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') as created_at_instant",
    );
  });
});

describe("T-MIG-023 F-3: frozen deterministic ORDER BY restored", () => {
  const CLAUSE = "order by q.external_ref nulls last, v.version desc";
  test("findFullByPaperId (paperReview walk) carries the frozen clause", async () => {
    const { sql, texts } = capturingSql([
      {
        version_id: "v1", question_id: "q1", stem: "s", marks: 1, version: 1,
        validation_state: "VALIDATED", command_word: null, extraction_confidence: null,
        extraction_method: null, source_document_id: null, external_ref: "x",
        question_type: "MCQ", question_stem: "qs", question_marks: 1,
      },
    ]);
    const repo = new QuestionVersionReadRepository(sql);
    await repo.findFullByPaperId("00000000-0000-0000-0000-000000000000");
    expect(texts[0]).toContain(CLAUSE);
  });
  test("findByPaperId (audit + review id walk) carries the frozen clause", async () => {
    const { sql, texts } = capturingSql([{ id: "v1" }]);
    const repo = new QuestionVersionReadRepository(sql);
    await repo.findByPaperId("00000000-0000-0000-0000-000000000000");
    expect(texts[0]).toContain(CLAUSE);
  });
});

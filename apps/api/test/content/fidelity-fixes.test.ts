import { describe, expect, test } from "bun:test";
import { documentPageText } from "../../src/services/content/reader";
import { javaInstantText } from "../../src/services/content/repositories";

/**
 * T-MIG-023 fidelity pins — the two R0-filed Wave-2 exit divergences
 * (T-MIG-022 run-001 diagnosis, R0 verdict 5990536177, fix sketches ratified):
 *
 *   F-1 — Java Instant.toString() exact rendering: fraction in groups of
 *         three digits, trailing zero-GROUPS trimmed. The replaced JS Date
 *         round-trip truncated micros twice (pg parse + toISOString):
 *         1021 observed divergences, all @ createdAt.
 *
 *   F-2 — §8 wire binding on the sealed canonical elements: snake_case
 *         page_number / reading_order (CanonicalDocumentDto.java:102-114,
 *         contracts canonicalElementBase) BEFORE DocumentPageText assembly;
 *         the old port read camelCase element keys → real Java-written rows
 *         bound nothing → empty page text vs the 716-char capture.
 *
 * Capture vectors are verbatim from golden/cases/ and the T-MIG-022
 * run-001-diagnosis.txt evidence.
 */

describe("F-1 javaInstantText — Java Instant.toString() law", () => {
  test("verbatim capture vectors from the T-MIG-022 diagnosis", () => {
    // content-docs-teacher-detail-realdata-200 @ .createdAt
    expect(javaInstantText("2026-09-21 12:59:21.578011")).toBe(
      "2026-09-21T12:59:21.578011Z",
    );
    // content-docs-teacher-realdata-200: 1021 listing divergences, one rule
    expect(javaInstantText("2026-10-04 09:37:00.129532")).toBe(
      "2026-10-04T09:37:00.129532Z",
    );
    expect(javaInstantText("2026-10-04 09:36:50.349879")).toBe(
      "2026-10-04T09:36:50.349879Z",
    );
  });

  test("fraction: groups of three, trailing zero-groups trimmed", () => {
    expect(javaInstantText("2026-10-04 09:36:00.526000")).toBe("2026-10-04T09:36:00.526Z"); // millis only
    expect(javaInstantText("2026-10-04 09:36:00.029000")).toBe("2026-10-04T09:36:00.029Z");
    expect(javaInstantText("2026-10-04 09:36:00.000500")).toBe("2026-10-04T09:36:00.000500Z"); // leading zeros kept
    expect(javaInstantText("2026-10-04 09:36:00.578010")).toBe("2026-10-04T09:36:00.578010Z"); // trailing 0 kept inside group
    expect(javaInstantText("2026-10-04 09:36:00.578011")).toBe("2026-10-04T09:36:00.578011Z"); // full micros
    expect(javaInstantText("2026-10-04 09:36:00.000000")).toBe("2026-10-04T09:36:00Z"); // zero fraction → no dot
    expect(javaInstantText("2026-10-04 09:36:00")).toBe("2026-10-04T09:36:00Z"); // whole second
  });

  test("T-MIG-101: the T-form the selects ACTUALLY emit (to_char literal \"T\") gets the Z (the G-class fix)", () => {
    // verbatim product of to_char(..., 'YYYY-MM-DD"T"HH24:MI:SS.US') — first-hand
    // T-MIG-101 reproduction on a production COW branch (raw to_char text was
    // "2026-10-04T09:37:00.129532"; the space-form vectors above were never
    // reachable from this module's own queries, which is why the Z went missing)
    expect(javaInstantText("2026-09-21T12:59:21.578011")).toBe("2026-09-21T12:59:21.578011Z");
    expect(javaInstantText("2026-10-04T09:37:00.129532")).toBe("2026-10-04T09:37:00.129532Z");
    expect(javaInstantText("2026-10-04T09:36:00.526000")).toBe("2026-10-04T09:36:00.526Z");
    expect(javaInstantText("2026-10-04T09:36:00")).toBe("2026-10-04T09:36:00Z");
  });

  test("non-to_char input passes through untouched (defensive)", () => {
    expect(javaInstantText("2026-10-04T09:36:00Z")).toBe("2026-10-04T09:36:00Z");
    expect(javaInstantText("not-a-timestamp")).toBe("not-a-timestamp");
  });
});

describe("F-2 documentPageText — §8 element binding + assembly", () => {
  // §8 wire shape: camelCase families at the top level, snake_case element keys.
  const SNAKE_DOC = {
    documentId: "doc-1",
    schemaVersion: "1.0",
    version: 1,
    pageCount: 6,
    textBlocks: [
      { element_id: "e1", page_number: 3, reading_order: 2, text: "other page" },
      { element_id: "e2", page_number: 4, reading_order: 1, text: "first" },
      { element_id: "e3", page_number: 4, reading_order: 3, text: "third-a" },
      { element_id: "e4", page_number: 4, reading_order: null, text: "sorts last" },
      { element_id: "e5", page_number: 4, reading_order: 0, text: "zero first" },
      { element_id: "e6", page_number: 4, reading_order: 2, text: null }, // text null → excluded
    ],
    tables: [
      { element_id: "t1", page_number: 4, reading_order: 4, text: "table" },
    ],
    // figures carry no text layer for the assembly (family not collected)
    figures: [
      { element_id: "f1", page_number: 4, reading_order: 5, text: "figure caption" },
    ],
    equations: [
      { element_id: "q1", page_number: 4, reading_order: 3, text: "third-b" },
      null, // Jackson binds [null]; Java's element != null guard skips
    ],
  };

  test("§8 snake_case element keys bind; camelCase does not (the F-2 drift)", () => {
    expect(documentPageText(SNAKE_DOC, 4)).toBe(
      "zero first\nfirst\nthird-a\nthird-b\ntable\nsorts last",
    );
    // the OLD wrong shape (camelCase element keys) binds nothing — Java
    // (Jackson §8) also binds nothing for such a row
    expect(
      documentPageText(
        { textBlocks: [{ pageNumber: 4, readingOrder: 1, text: "camel" }] },
        4,
      ),
    ).toBe("");
  });

  test("stable sort: equal reading_order keeps family/canonical order; nulls last", () => {
    // e3 (textBlocks, ro=3) is collected before q1 (equations, ro=3) and the
    // stable sort must keep that relative order
    const joined = documentPageText(SNAKE_DOC, 4);
    expect(joined.indexOf("third-a")).toBeLessThan(joined.indexOf("third-b"));
    expect(joined.endsWith("sorts last")).toBe(true); // null reading_order last, never first
  });

  test("Jackson int coercion parity: numeric-text strings bind", () => {
    expect(
      documentPageText(
        { textBlocks: [{ page_number: "4", reading_order: "1", text: "coerced" }] },
        4,
      ),
    ).toBe("coerced");
    expect(
      documentPageText(
        { textBlocks: [{ page_number: " 4 ", reading_order: 1, text: "trimmed" }] },
        4,
      ),
    ).toBe("trimmed");
  });

  test("bind violation fails loud (R10: corrupted row → 500, never silent)", () => {
    expect(() =>
      documentPageText(
        { textBlocks: [{ page_number: "abc", reading_order: 1, text: "x" }] },
        4,
      ),
    ).toThrow();
    expect(() =>
      documentPageText(
        { textBlocks: [{ page_number: 4.5, reading_order: 1, text: "x" }] },
        4,
      ),
    ).toThrow();
  });

  test("text-free page and page gap yield the empty string", () => {
    expect(documentPageText({ textBlocks: [{ page_number: 1, reading_order: 1, text: "p1" }] }, 4)).toBe("");
    expect(documentPageText(null, 4)).toBe("");
    expect(documentPageText({}, 4)).toBe("");
  });

  test("REAL capture law — verbatim 716-char page text joins without rewrap", () => {
    // The expected string is verbatim from golden/cases/
    // content-reader-real-page-text-200.json (F-5 tranche, frozen-core
    // capture 2026-10-05T05:17Z). The synthetic §8 doc below asserts the
    // assembly law over the exact real vector: elements joined by \n,
    // text never rewrapped/re-trimmed — incl. multi-line element text and
    // interior blanks.
    const expected = EXPECTED_REAL_PAGE_TEXT;
    const elements = expected.split("\n").map((text, i) => ({
      element_id: "r" + i,
      page_number: 4,
      reading_order: i,
      text,
    }));
    // one element carries an interior newline that must survive verbatim:
    // re-join must reproduce the capture EXACTLY
    expect(documentPageText({ textBlocks: elements }, 4)).toBe(expected);
    // reading order shuffled → the assembly restores the canonical order
    const shuffled = [...elements].reverse();
    expect(documentPageText({ textBlocks: shuffled }, 4)).toBe(expected);
  });
});

/** Verbatim: golden/cases/content-reader-real-page-text-200.json .expect.body.text */
const EXPECTED_REAL_PAGE_TEXT = "The list shows some techniques used to separate mixtures.\nA\ncrystallisation\nB\nfiltration\nC\nfractional distillation\nD\npaper chromatography\nE\nsimple distillation\nComplete the table to show the best method of obtaining each substance from\nthe mixture.\nIn each case, choose one of the letters A, B, C, D or E. Each letter may be used once,\nmore than once or not at all.\nGold occurs in ores, which are mixtures of gold and other substances. Several elements\nand compounds are used in the extraction of gold from its ores.\nEach box below represents the substances present in one part of the extraction process.\nClassify the contents of each box as a compound, an element or a mixture by writing\nyour choice below each box.";

/**
 * T-MIG-133 band 133e — the corpus-pdf relay wall tests.
 *
 * validatedCorpusPath IS the relay's safety boundary (no open relay): the
 * battery of record (t133e slice battery, run-001) caught the 133e slice
 * grammar MISSING from this wall — the viewer mounted slice URLs the relay
 * then 400-rejected. These gates pin the full accepted grammar so the wall
 * and the mount surface can never drift apart again.
 */
import { describe, expect, it } from "bun:test";

import { validatedCorpusPath } from "./[...path]/route";

const s = (p: string) => p.split("/");

describe("validatedCorpusPath — books grammar (133c + 133e)", () => {
  it("accepts the whole student book (133c)", () => {
    expect(
      validatedCorpusPath(s("books/pearson-edexcel/international-gcse/chemistry/4ch1/student-book.pdf")),
    ).toBe("books/pearson-edexcel/international-gcse/chemistry/4ch1/student-book.pdf");
  });

  it("accepts per-page parse artifacts (133c)", () => {
    expect(
      validatedCorpusPath(s("books/pearson-edexcel/international-gcse/chemistry/4ch1/ocr_pages/page_012.txt")),
    ).not.toBeNull();
    expect(
      validatedCorpusPath(s("books/pearson-edexcel/international-gcse/chemistry/4ch1/docling_pages/page_012.json")),
    ).not.toBeNull();
  });

  it("accepts the 133e page-exact slices (lesson + hard-split questions + unit exam)", () => {
    expect(
      validatedCorpusPath(s("books/pearson-edexcel/international-gcse/chemistry/4ch1/chapters/u1_c1.pdf")),
    ).not.toBeNull();
    expect(
      validatedCorpusPath(s("books/pearson-edexcel/international-gcse/chemistry/4ch1/chapters/u1_c1_q.pdf")),
    ).not.toBeNull();
    expect(
      validatedCorpusPath(s("books/pearson-edexcel/international-gcse/chemistry/4ch1/chapters/u4_c29_q.pdf")),
    ).not.toBeNull();
    expect(
      validatedCorpusPath(s("books/pearson-edexcel/international-gcse/chemistry/4ch1/units/u1_practice.pdf")),
    ).not.toBeNull();
  });

  it("rejects slice-shape escapes (wrong dir, wrong name, wrong depth)", () => {
    expect(validatedCorpusPath(s("books/pearson-edexcel/international-gcse/chemistry/4ch1/chapters/evil.pdf"))).toBeNull();
    expect(validatedCorpusPath(s("books/pearson-edexcel/international-gcse/chemistry/4ch1/chapters/u1_c1.txt"))).toBeNull();
    expect(validatedCorpusPath(s("books/pearson-edexcel/international-gcse/chemistry/4ch1/units/u1_extra.pdf"))).toBeNull();
    expect(validatedCorpusPath(s("books/pearson-edexcel/international-gcse/chemistry/4ch1/u1_c1.pdf"))).toBeNull();
    expect(
      validatedCorpusPath(s("books/pearson-edexcel/international-gcse/chemistry/4ch1/chapters/sub/u1_c1.pdf")),
    ).toBeNull();
  });
});

describe("validatedCorpusPath — the relay wall holds", () => {
  it("rejects traversal and hostile segments", () => {
    expect(validatedCorpusPath(s("books/pearson-edexcel/../../etc/passwd"))).toBeNull();
    expect(validatedCorpusPath(s("books/..%2F/4ch1/student-book.pdf"))).toBeNull();
  });

  it("rejects unknown roots and empty segments", () => {
    expect(validatedCorpusPath(s("assets/books/4ch1/student-book.pdf"))).toBeNull();
    expect(validatedCorpusPath(s(""))).toBeNull();
    expect(validatedCorpusPath(["books", "", "x", "y", "z"])).toBeNull();
  });

  it("keeps the past-papers grammar verbatim (T-MIG-128)", () => {
    expect(
      validatedCorpusPath(s("past-papers/edexcel/ial/chemistry/wch11/past-papers/2026-06/qp.pdf")),
    ).not.toBeNull();
    expect(validatedCorpusPath(s("past-papers/edexcel/ial/chemistry/wch11/past-papers/2026-06/er.pdf"))).not.toBeNull();
  });
});

/**
 * course-variant.test.ts — the lane-qualifier law, unit-pinned
 * (T-HUB-COURSES-UI-3). duplicateVariants subtitles exist to make
 * same-(subject, code) lanes tellable apart; a qualifier whose words the
 * registry label already carries adds nothing and is suppressed. Lanes
 * without a label (the overlays' minimum shape) keep the old behavior
 * byte-for-byte — the label is the opt-in.
 */
import { describe, expect, test } from "bun:test";
import { duplicateVariants, variantSubtitle } from "./course-variant";

const lane = (
  slug: string,
  subject: string,
  code: string,
  label?: string,
  level?: string,
) => ({
  slug,
  subject,
  code,
  ...(label !== undefined ? { label } : {}),
  ...(level !== undefined ? { level } : {}),
});

describe("variantSubtitle derivation (pre-existing law, pinned with UI-3)", () => {
  test("slug tail → human qualifier", () => {
    expect(variantSubtitle("igcse-maths-a-modular-24-foundation-unit-1", "Maths")).toBe(
      "Foundation Unit 1",
    );
    expect(variantSubtitle("cie-a-level-maths-25-mechanics", "Maths")).toBe("Mechanics");
    expect(variantSubtitle("igcse-chemistry-modular-24-unit-1", "Chemistry")).toBe("Unit 1");
  });
});

describe("duplicateVariants label-aware suppression (T-HUB-COURSES-UI-3)", () => {
  test("a subtitle whose words the label already carries is suppressed", () => {
    // 4XCH1 modular pair — the title already ends in "Unit 1"/"Unit 2"
    expect(
      duplicateVariants([
        lane("igcse-chemistry-modular-24-unit-1", "Chemistry", "4XCH1", "Chemistry — Modular 2024, Unit 1"),
        lane("igcse-chemistry-modular-24-unit-2", "Chemistry", "4XCH1", "Chemistry — Modular 2024, Unit 2"),
      ]).size,
    ).toBe(0);

    // CIE 0580 — "Maths — Core" names the variant; "&" folds to "and"
    expect(
      duplicateVariants([
        lane("cie-igcse-maths-25-core", "Maths", "0580", "Maths — Core"),
        lane("cie-igcse-maths-25-extended", "Maths", "0580", "Maths — Extended"),
      ]).size,
    ).toBe(0);

    // 9701 AS/A-Level level fallback — the title carries the level
    expect(
      duplicateVariants([
        lane("cie-as-chemistry-25", "Chemistry", "9701", "Chemistry — AS", "AS"),
        lane("cie-a-level-chemistry-25", "Chemistry", "9701", "Chemistry — A-Level", "A-Level"),
      ]).size,
    ).toBe(0);

    // 4XSD1 — the reordered qualifier is still word-covered by the title
    expect(
      duplicateVariants([
        lane("igcse-science-double-award-modular-24-biology-unit-1", "Science", "4XSD1", "Science (Double Award) — Modular 2024, Biology Unit 1"),
        lane("igcse-science-double-award-modular-24-biology-unit-2", "Science", "4XSD1", "Science (Double Award) — Modular 2024, Biology Unit 2"),
      ]).size,
    ).toBe(0);
  });

  test("a qualifier that differentiates survives", () => {
    // Accounting 4AC1 ×2 — the qualifiers are the only differentiator
    const acc = duplicateVariants([
      lane("igcse-accounting-17-financial-statements", "Accounting", "4AC1", "Accounting"),
      lane("igcse-accounting-17-introduction-to-bookkeeping-and-accounting", "Accounting", "4AC1", "Accounting"),
    ]);
    expect(acc.get("igcse-accounting-17-financial-statements")).toBe("Financial Statements");
    expect(acc.get("igcse-accounting-17-introduction-to-bookkeeping-and-accounting")).toBe(
      "Introduction to Bookkeeping and Accounting",
    );
  });

  test("lanes without a label keep the old behavior byte-for-byte", () => {
    expect(
      duplicateVariants([
        lane("igcse-chemistry-modular-24-unit-1", "Chemistry", "4XCH1"),
        lane("igcse-chemistry-modular-24-unit-2", "Chemistry", "4XCH1"),
      ]).get("igcse-chemistry-modular-24-unit-1"),
    ).toBe("Unit 1");
  });
});

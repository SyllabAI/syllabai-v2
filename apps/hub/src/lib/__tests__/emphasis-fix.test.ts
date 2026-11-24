/**
 * QA 2026-11-24 CP-1 — emphasis-fix v2 regression law.
 *
 * The 2026-09-19 pass leaked literal `**` on 1,447 live pages. Its defects,
 * each reproduced against the corpus, are pinned here as permanent laws:
 *   1. consecutive list items formed ONE paragraph → openers paired with
 *      closers two bullets later, boxing literal `**` inside a bogus strong;
 *   2. single-run paragraphs early-returned → stray `=$A$1+B2**"` junk;
 *   3. leftover pairing REWROTE valid cells (`| **\$** |` → `| \$** |`).
 * Every case below is a real corpus shape (source file noted per test).
 */
import { describe, expect, test } from "bun:test";
import { normalizeCorpusEmphasis } from "@/lib/emphasis-fix";



describe("emphasis-fix v2 — whitespace inside markers (CP-1 dominant class)", () => {
  test("trailing space inside the closer (purchases-ledger-control-accounts.md)", () => {
    const out = normalizeCorpusEmphasis(
      "- **Cash discounts received **from credit suppliers",
    );
    expect(out).toBe("- **Cash discounts received** from credit suppliers");
  });

  test("full nested-list block (purchases-ledger-control-accounts.md L32-40)", () => {
    const src = [
      "- The **books of prime entry **are used to find the **totals**",
      "- The **purchases journal **is used to find the total value of **credit purchases**",
      "  - **Money paid** to credit suppliers",
      "  - **Money refunded **by credit suppliers",
      "  - **Cash discounts received **from credit suppliers",
      "- The** journal **is used to find the total values for:",
    ].join("\n");
    const out = normalizeCorpusEmphasis(src);
    expect(out).toContain("**books of prime entry** are used");
    expect(out).toContain("**purchases journal** is used");
    expect(out).toContain("**Money refunded** by credit suppliers");
    expect(out).toContain("**Cash discounts received** from credit suppliers");
    expect(out).toContain("**journal** is used");
  });

  test("nested list item at 4-space indent (unit-job-and-batch-costing.md)", () => {
    const src = [
      "  - **Multiply** the overhead absorption rate by machine hours or labour hours used per unit",
      "  ",
      "    - Machine hours for **machine-intensive **departments",
      "    - Labour hours for** labour-intensive** departments",
    ].join("\n");
    const out = normalizeCorpusEmphasis(src);
    expect(out).toContain("**machine-intensive** departments");
    expect(out).toContain("for **labour-intensive** departments");
    expect(out).not.toContain("** machine");
  });

  test("whitespace on both sides (E7)", () => {
    expect(
      normalizeCorpusEmphasis(
        "Unit costing is where the ** cost of producing a single unit **of product",
      ),
    ).toBe(
      "Unit costing is where the **cost of producing a single unit** of product",
    );
  });
});

describe("emphasis-fix v2 — stray / orphan runs", () => {
  test("single stray after a formula (cell-referencing.md)", () => {
    expect(
      normalizeCorpusEmphasis('The formula in C2 will still refer to cell A1: " =$A$1+B2**"'),
    ).toBe('The formula in C2 will still refer to cell A1: " =$A$1+B2"');
  });

  test("single stray exponent (converting-to-and-from-standard-form.md)", () => {
    expect(
      normalizeCorpusEmphasis("Final answer: 0.007052 = 7.052 x 10**<sup> -3 </sup>"),
    ).toBe("Final answer: 0.007052 = 7.052 x 10<sup> -3 </sup>");
  });

  test("quadruple orphan run (causes-of-climate-change.md class)", () => {
    expect(
      normalizeCorpusEmphasis(
        "They have acquired ****an allele that codes for the production of the enzyme",
      ),
    ).toBe("They have acquired an allele that codes for the production of the enzyme");
  });

  test("digit-flanked exponents are content and stay (design law)", () => {
    expect(normalizeCorpusEmphasis("the value of 2**3 in Python is 8")).toBe(
      "the value of 2**3 in Python is 8",
    );
  });

  test("alnum-flanked junk is removed (6**x class, completing-the-square.md)", () => {
    expect(normalizeCorpusEmphasis("collect the terms to get 5**b on its own")).toBe(
      "collect the terms to get 5b on its own",
    );
  });
});

describe("emphasis-fix v2 — no-harm laws", () => {
  test("valid em+strong sandwich untouched (***Contra entries***, L43)", () => {
    expect(
      normalizeCorpusEmphasis("- ***Contra entries*** against the sales ledger"),
    ).toBe("- ***Contra entries*** against the sales ledger");
  });

  test("valid table cell with escaped dollar untouched (recording-refunds.md)", () => {
    const row = "> | **Date** | **Details** | **\\$** | **Date** | **Details** | **\\$** |";
    expect(normalizeCorpusEmphasis(row)).toBe(row);
  });

  test("plain valid bold untouched", () => {
    expect(normalizeCorpusEmphasis("- **Money paid** to credit suppliers")).toBe(
      "- **Money paid** to credit suppliers",
    );
  });

  test("mixed single/double slop renders clean (streetcar polka line)", () => {
    const out = normalizeCorpusEmphasis(
      "  - When she is feeling stressed or remembering her young husband, she hears the *polka*** **tune that was playing when he committed suicide",
    );
    expect(out).not.toMatch(/\*\*/);
    expect(out).toContain("*polka*");
  });

  test("triple+quintuple slop (coefficient-of-friction.md)", () => {
    expect(normalizeCorpusEmphasis("- Otherwise ***μ *****> 0**")).toBe(
      "- Otherwise μ **> 0**",
    );
  });

  test("escaped-dollar bold pair never mangled (regression of the old pass's harm)", () => {
    const src = "> *\\$45 000 × 2 =* **\\$90 000**";
    expect(normalizeCorpusEmphasis(src)).toBe(src);
  });
});

describe("emphasis-fix v2 — cross-protection safety", () => {
  test("real pair spanning an inline-code span stays paired", () => {
    const src = "use the **default `fast` mode** when speed matters";
    expect(normalizeCorpusEmphasis(src)).toBe(src);
  });

  test("real pair spanning a math span stays paired, junk closer cleaned", () => {
    const src = "> | **Time taken (**$s$** seconds)** | **Frequency** |";
    const out = normalizeCorpusEmphasis(src);
    // renders as <strong>Time taken (</strong>$s$<strong>seconds)</strong>
    expect(out).toBe("> | **Time taken (**$s$ **seconds)** | **Frequency** |");
  });
});

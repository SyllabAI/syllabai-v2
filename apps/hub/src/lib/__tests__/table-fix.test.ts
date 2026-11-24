/**
 * QA 2026-11-24 CP-2 — table-fix regression law.
 *
 * 31 live pages rendered literal `|---|` inside content boxes: the upstream
 * HTML→markdown conversion flattened table STRUCTURE into single lines
 * (rows glued with <br>, header rows appended to prose, whole nested tables
 * escaped-pipe-inlined into one outer cell). GFM needs one row per line and
 * tables cannot interrupt a paragraph — every case below is a real corpus
 * shape (source file noted per test).
 */
import { describe, expect, test } from "bun:test";
import { normalizeCorpusTables } from "@/lib/table-fix";

describe("table-fix — <br>-glued rows (bitmap-images.md repro)", () => {
  test("rows glued at row boundaries split into real rows", () => {
    const src = "| **Binary** | **Answer** |<br>|---|---|<br>| 0 | 0 |";
    const out = normalizeCorpusTables(src);
    expect(out.split("\n")).toEqual([
      "| **Binary** | **Answer** |",
      "|---|---|",
      "| 0 | 0 |",
    ]);
  });

  test("<br> INSIDE cell text is preserved (trace-table-questions.md L64)", () => {
    const src = "| This algorithm inputs numbers:<br><br>**Complete** the table |   |";
    expect(normalizeCorpusTables(src)).toBe(src);
  });
});

describe("table-fix — prose-glued header rows (N3)", () => {
  test("header appended to a bullet line (drawing-cumulative-frequency-diagrams.md L31)", () => {
    const src = [
      "  - The times taken by 50 students are shown in the table below: | **Time taken** | **Frequency** |",
      "  |---|---|",
      "  | 0-30 | 3 |",
    ].join("\n");
    const out = normalizeCorpusTables(src);
    const lines = out.split("\n");
    // prose line, blank line, then the table block
    expect(lines[0]).toBe(
      "  - The times taken by 50 students are shown in the table below:",
    );
    expect(lines[1]).toBe("");
    expect(lines[2]).toBe("| **Time taken** | **Frequency** |");
    expect(lines[3]).toBe("  |---|---|");
  });

  test("blank line inserted so a table can start after prose (GFM law)", () => {
    const src = ["Some prose lead-in.", "| **A** | **B** |", "|---|---|", "| 1 | 2 |"].join("\n");
    const out = normalizeCorpusTables(src);
    expect(out.split("\n")).toEqual([
      "Some prose lead-in.",
      "",
      "| **A** | **B** |",
      "|---|---|",
      "| 1 | 2 |",
    ]);
  });
});

describe("table-fix — escaped nested tables inside cells (N2b)", () => {
  test("first-cell nested table (bitmap-images.md L90, the CP-2 repro)", () => {
    const src = [
      "| **Image Files** |",
      "|---|",
      "| (Resolution) **x** (Colour Depth) |",
      "| \\| **Size of bitmap image = ** \\|   \\|   \\|<br>\\|---\\|---\\|---\\|<br>\\| Resolution \\| **250,000** \\| w \\| |",
    ].join("\n");
    const out = normalizeCorpusTables(src);
    // the outer table keeps its real rows; the nested table becomes a real
    // table after it
    expect(out).toContain("| (Resolution) **x** (Colour Depth) |");
    expect(out).toContain("| **Size of bitmap image = ** |   |   |");
    expect(out).toContain("|---|---|---|");
    expect(out).toContain("| Resolution | **250,000** | w |");
    // no escaped pipes remain
    expect(out).not.toContain("\\|");
  });

  test("nested table in a NON-first cell (binary-addition.md L30)", () => {
    const src = "| 0 + 0 = | ***0*** | \\| **1s** \\| ** ** \\|<br>\\|---\\|---\\|<br>\\| ***0*** \\| **= 0** \\| |";
    const out = normalizeCorpusTables(src);
    expect(out.split("\n")[0]).toBe("| 0 + 0 = | ***0*** |  |");
    expect(out).toContain("| **1s** | ** ** |");
    expect(out).toContain("|---|---|");
    expect(out).toContain("| ***0*** | **= 0** |");
  });

  test("nested table with prose before AND after inside the cell (answering-2-mark-questions.md L42)", () => {
    const src =
      "| Kemala is analysing her income statement. An extract is shown below.<br><br>\\| **Extract** \\|   \\|<br>\\|---\\|---\\|<br>\\| Revenue \\| 480 \\|<br><br>**Calculate ** the margin. |";
    const out = normalizeCorpusTables(src);
    expect(out).toContain("Kemala is analysing her income statement. An extract is shown below.");
    expect(out).toContain("| **Extract** |   |");
    expect(out).toContain("| Revenue | 480 |");
    expect(out).toContain("**Calculate ** the margin.");
    expect(out).not.toContain("\\|");
  });
});

describe("table-fix — no-harm laws", () => {
  test("clean tables pass through byte-identical", () => {
    const src = [
      "> | **Date** | **Details** |",
      "> |---|---|",
      "> | 1 Mar | Sales |",
      "",
      "| **A** | **B** |",
      "|---|---|",
      "| 1 | 2 |",
    ].join("\n");
    expect(normalizeCorpusTables(src)).toBe(src);
  });

  test("idempotent — a second pass changes nothing", () => {
    const src = [
      "  - shown in the table below: | **H1** | **H2** |",
      "  |---|---|",
      "  | 1 | 2 |",
    ].join("\n");
    const once = normalizeCorpusTables(src);
    expect(normalizeCorpusTables(once)).toBe(once);
  });
});

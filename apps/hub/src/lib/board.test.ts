/**
 * Board helper law tests (the add-course CIE-board fix, operator trace
 * 1a1580a42635b8d9): the derived-board cascade, the Edexcel-default label
 * rule, and the Pearson-calendar gate.
 */
import { describe, expect, it } from "bun:test";

import { boardOf, distinctBoards, hasExamSeriesCalendar } from "./board";
import type { BoardKeyable } from "./board";

/** registry-row shape for the fixtures (BoardKeyable + the display fields) */
type Row = BoardKeyable & { slug: string; level: string };

const EDEXCEL_ROW: Row = { slug: "igcse-chemistry-19", level: "IGCSE" };
const CIE_ROW: Row = {
  slug: "cie-igcse-chemistry-25",
  level: "IGCSE",
  board: "Cambridge International",
};

describe("boardOf", () => {
  it("renders the row's registry-explicit board (CIE wave)", () => {
    expect(boardOf(CIE_ROW)).toBe("Cambridge International");
  });

  it("renders Edexcel for the pre-CIE rows (board absent)", () => {
    expect(boardOf(EDEXCEL_ROW)).toBe("Edexcel");
    expect(boardOf({})).toBe("Edexcel");
  });
});

describe("distinctBoards", () => {
  it("derives both boards busiest-first from the registry shape", () => {
    const courses: Row[] = [
      EDEXCEL_ROW,
      { slug: "ial-maths-20-pure-1", level: "IAL" },
      CIE_ROW,
      { slug: "cie-a-level-maths-20-pure-1", level: "A-Level", board: "Cambridge International" },
    ];
    expect(distinctBoards(courses)).toEqual([
      ["Cambridge International", 2],
      ["Edexcel", 2],
    ]);
  });

  it("breaks count ties alphabetically and counts per board", () => {
    const courses: Row[] = [CIE_ROW, { ...CIE_ROW, slug: "cie-igcse-biology-25" }, EDEXCEL_ROW];
    expect(distinctBoards(courses)).toEqual([
      ["Cambridge International", 2],
      ["Edexcel", 1],
    ]);
  });

  it("is honest for a single-board registry (the pre-CIE shape)", () => {
    const courses: Row[] = [EDEXCEL_ROW, { ...EDEXCEL_ROW, slug: "x" }];
    expect(distinctBoards(courses)).toEqual([["Edexcel", 2]]);
  });
});

describe("hasExamSeriesCalendar", () => {
  it("gates the Pearson calendar to Edexcel lanes", () => {
    expect(hasExamSeriesCalendar(EDEXCEL_ROW)).toBe(true);
    expect(hasExamSeriesCalendar(CIE_ROW)).toBe(false);
  });
});

/**
 * directory-groups.test.ts — the /courses grouping law, unit-pinned
 * (T-HUB-COURSES-UI-1 run-002). The directory is a static prerender +
 * client hydration: the same registry + filter state MUST always produce
 * the same group shape, so the ladder, the family order and the row sort
 * are pinned here without a DOM (subject-grid.test.ts house pattern).
 */
import { describe, expect, test } from "bun:test";
import {
  courseLevelAnchor,
  distinctLevels,
  groupDirectory,
  stageRank,
  STAGE_ORDER,
  type DirectoryCourse,
} from "./directory-groups";
import { SUBJECT_FAMILIES } from "./subject-identity";

const row = (over: Partial<DirectoryCourse> & { slug: string; subject: string }): DirectoryCourse => ({
  level: "IGCSE",
  code: "1",
  ...over,
});

describe("stage ladder (T-HUB-COURSES-PUBLIC-1 fix ④, moved verbatim)", () => {
  test("the curriculum ladder is IGCSE → AS → A-Level → IAL", () => {
    expect(STAGE_ORDER).toEqual(["IGCSE", "AS", "A-Level", "IAL"]);
    expect(["IAL", "IGCSE", "A-Level", "AS"].map(stageRank)).toEqual([3, 0, 2, 1]);
  });

  test("unknown levels trail by size then alphabetical", () => {
    const levels = groupDirectory([
      row({ slug: "a", subject: "Physics", level: "Zed" }),
      row({ slug: "b", subject: "Physics", level: "Zed" }),
      row({ slug: "c", subject: "Physics", level: "Alpha" }),
      row({ slug: "d", subject: "Physics", level: "IGCSE" }),
    ]).map((g) => g.level);
    expect(levels).toEqual(["IGCSE", "Zed", "Alpha"]);
  });
});

describe("family grouping (run-002: the identity lib's scan order)", () => {
  test("families render in the identity lib's order inside a level", () => {
    const level = groupDirectory([
      row({ slug: "his", subject: "History" }),
      row({ slug: "acc", subject: "Accounting" }),
      row({ slug: "eng", subject: "English" }),
      row({ slug: "math", subject: "Maths" }),
      row({ slug: "chem", subject: "Chemistry" }),
    ])[0];
    expect(level.families.map((f) => f.family)).toEqual([
      "sciences",
      "maths-cs",
      "english",
      "business-econ",
      "humanities",
    ]);
    expect(level.families.map((f) => f.label)).toEqual([
      "Sciences",
      "Maths & Computer Science",
      "English",
      "Business & Economics",
      "Humanities",
    ]);
  });

  test("levels with no matching rows never render; totals equal the rows", () => {
    const groups = groupDirectory([
      row({ slug: "chem", subject: "Chemistry", level: "IGCSE" }),
      row({ slug: "bio", subject: "Biology", level: "IAL" }),
    ]);
    expect(groups.map((g) => g.level)).toEqual(["IGCSE", "IAL"]);
    expect(groups.map((g) => g.total)).toEqual([1, 1]);
    expect(groupDirectory([])).toEqual([]);
  });
});

describe("row sort inside a family group", () => {
  test("canonical subject in identity-registry order (Chemistry < Physics < Biology)", () => {
    const sciences = groupDirectory([
      row({ slug: "bio", subject: "Biology" }),
      row({ slug: "phys", subject: "Physics" }),
      row({ slug: "chem", subject: "Chemistry" }),
      row({ slug: "sci", subject: "Science" }),
    ])[0].families[0].courses;
    expect(sciences.map((c) => c.slug)).toEqual(["chem", "phys", "bio", "sci"]);
  });

  test("same subject sorts board → code → label", () => {
    const rows = groupDirectory([
      row({ slug: "b", subject: "Maths", code: "0580", board: "Cambridge International" }),
      row({ slug: "a", subject: "Maths", code: "4MA1", board: "Edexcel" }),
      row({ slug: "c", subject: "Maths", code: "4MA1", label: "Maths — Core", board: "Edexcel" }),
    ])[0].families[0].courses;
    // "Cambridge International" < "Edexcel" alphabetically; then 0580 < 4MA1;
    // inside 4MA1 the bare label ("") sorts before "Maths — Core".
    expect(rows.map((c) => c.slug)).toEqual(["b", "a", "c"]);
  });

  test("registry alias + case folding route rows into the same group", () => {
    const families = groupDirectory([
      row({ slug: "m1", subject: "Mathematics" }),
      row({ slug: "m2", subject: "Maths" }),
      row({ slug: "ict1", subject: "Ict" }),
      row({ slug: "ict2", subject: "ICT" }),
    ])[0].families;
    expect(families.map((f) => f.family)).toEqual(["maths-cs"]);
    expect(families[0].courses.map((c) => c.slug)).toEqual(["m1", "m2", "ict1", "ict2"]);
  });

  test("unmapped subjects trail the sort and land in the last family", () => {
    const groups = groupDirectory([
      row({ slug: "x", subject: "Mysticism" }),
      row({ slug: "chem", subject: "Chemistry" }),
    ]);
    expect(groups[0].families.map((f) => f.family)).toEqual(["sciences", "humanities"]);
    expect(groups[0].families[1].courses.map((c) => c.slug)).toEqual(["x"]);
  });
});

describe("determinism (prerender + hydration consistency)", () => {
  test("the same input always yields the same shape", () => {
    const input = [
      row({ slug: "his", subject: "History", level: "A-Level" }),
      row({ slug: "phys", subject: "Physics", level: "A-Level" }),
      row({ slug: "econ", subject: "Economics", level: "AS" }),
    ];
    expect(groupDirectory(input)).toEqual(groupDirectory([...input].reverse()));
  });

  test("every family id the groups can emit is a lawed family", () => {
    // The group function is a pure reshuffle of the identity lib's families —
    // it can never invent a family the identity lib doesn't carry.
    const emitted = new Set(
      groupDirectory(
        SUBJECT_FAMILIES.map((family, i) =>
          row({ slug: `r${i}`, subject: "Chemistry", level: `L${i}` }),
        ),
      ).flatMap((g) => g.families.map((f) => f.family)),
    );
    expect([...emitted]).toEqual(["sciences"]);
  });
});

/**
 * T-HUB-COURSES-PUBLIC-2 (③): the jump-nav anchor law — deterministic,
 * DOM-safe ids that can never collide with another element on the page.
 */
describe("courseLevelAnchor", () => {
  test("the four registry levels pin to stable ids", () => {
    expect(courseLevelAnchor("IGCSE")).toBe("courses-igcse");
    expect(courseLevelAnchor("AS")).toBe("courses-as");
    expect(courseLevelAnchor("A-Level")).toBe("courses-a-level");
    expect(courseLevelAnchor("IAL")).toBe("courses-ial");
  });

  test("unusual levels stay DOM-safe and collision-free", () => {
    expect(courseLevelAnchor("O Level")).toBe("courses-o-level");
    expect(courseLevelAnchor("  GCSE!! ")).toBe("courses-gcse");
    expect(courseLevelAnchor("A--Level")).toBe("courses-a-level");
    // every id keeps the courses- prefix — no bare-name collisions
    expect(courseLevelAnchor("x").startsWith("courses-")).toBe(true);
  });
});

describe("distinctLevels (T-HUB-COURSES-IA-1 level filter chips)", () => {
  test("present levels only, in the ladder's own order, with counts", () => {
    const out = distinctLevels([
      row({ slug: "a", subject: "Chemistry", level: "IAL" }),
      row({ slug: "b", subject: "Chemistry", level: "IGCSE" }),
      row({ slug: "c", subject: "Chemistry", level: "IGCSE" }),
      row({ slug: "d", subject: "Chemistry", level: "A-Level" }),
      row({ slug: "e", subject: "Chemistry", level: "AS" }),
    ]);
    expect(out).toEqual([
      ["IGCSE", 2],
      ["AS", 1],
      ["A-Level", 1],
      ["IAL", 1],
    ]);
  });

  test("absent levels never offer a chip; unknown levels trail by count then alpha", () => {
    const out = distinctLevels([
      row({ slug: "a", subject: "Chemistry", level: "GCSE" }),
      row({ slug: "b", subject: "Chemistry", level: "GCSE" }),
      row({ slug: "c", subject: "Chemistry", level: "AS" }),
      row({ slug: "d", subject: "Chemistry", level: "IB" }),
    ]);
    expect(out).toEqual([
      ["AS", 1],
      ["GCSE", 2],
      ["IB", 1],
    ]);
  });

  test("empty registry offers no chips", () => {
    expect(distinctLevels([])).toEqual([]);
  });
});

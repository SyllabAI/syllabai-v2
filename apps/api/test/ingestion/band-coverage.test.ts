/**
 * ADR-040 §5.3 — the band-coverage validator rules (band-coverage.ts), the
 * code half of the coverage law of record: "a LEVELS part is G1-ready iff
 * its VALIDATED scheme's bands are contiguous and tile the part's awarded
 * range — i.e. sorted bands satisfy b[i].marks_max + 1 = b[i+1].marks_min
 * and min = 0 or 1, with the top band reaching question_parts.marks. Zero
 * marks is not a band."
 *
 * Every violation message is reviewer-locatable (the R4 gate surfaces them
 * verbatim in the 409); every rule is deterministic (stable order).
 */
import { describe, expect, test } from "bun:test";
import { bandCoverageViolations, type BandCoverageBand } from "../../src/services/ingestion/band-coverage";

const band = (
  levelIndex: number,
  marksMin: number,
  marksMax: number,
  descriptor: string | null = `Level ${levelIndex} descriptor.`,
): BandCoverageBand => ({ levelIndex, marksMin, marksMax, descriptor });

/** The ADR-040 §1 quote shape: a 3-level 0-6 tile. */
const TILED_0_6: BandCoverageBand[] = [
  band(1, 0, 2, "Level 1 (0-2 marks): isolated statements."),
  band(2, 3, 4, "Level 2 (3-4 marks): linked statements."),
  band(3, 5, 6, "Level 3 (5-6 marks): applies knowledge."),
];

describe("bandCoverageViolations — ADR-040 §2.1 the coverage law", () => {
  test("a clean tile with a known awarded range → no violations", () => {
    expect(bandCoverageViolations(TILED_0_6, 6)).toEqual([]);
  });

  test("the bottom band may start at 1 (not only 0)", () => {
    const bands: BandCoverageBand[] = [
      band(1, 1, 2),
      band(2, 3, 6),
    ];
    expect(bandCoverageViolations(bands, 6)).toEqual([]);
  });

  test("zero bands → gated (absence is the NO_SCHEME_BANDS precondition)", () => {
    expect(bandCoverageViolations([], 6)).toEqual([
      "the scheme carries no bands — a LEVELS scheme with zero bands marks nothing (ADR-040 §2.1: zero marks is not a band)",
    ]);
  });

  test("contiguity: a gap is named with the offending levels and the expected boundary", () => {
    const gapped: BandCoverageBand[] = [band(1, 0, 2), band(2, 4, 6)];
    expect(bandCoverageViolations(gapped, 6)).toEqual([
      "mark ranges are not contiguous (gap): level 1 ends at 2 but level 2 starts at 4 (expected 3)",
    ]);
  });

  test("contiguity: an overlap is named as an overlap", () => {
    const overlapped: BandCoverageBand[] = [band(1, 0, 3), band(2, 3, 6)];
    expect(bandCoverageViolations(overlapped, 6)).toEqual([
      "mark ranges are not contiguous (overlap): level 1 ends at 3 but level 2 starts at 3 (expected 4)",
    ]);
  });

  test("the bottom band must start at 0 or 1 (2 is a gap the law refuses)", () => {
    const lifted: BandCoverageBand[] = [band(1, 2, 4), band(2, 5, 6)];
    expect(bandCoverageViolations(lifted, 6)).toEqual([
      "the lowest band starts at 2 — the bottom band must start at 0 or 1 (zero marks itself is not a band)",
    ]);
  });

  test("zero marks is not a band: a 0-0 level is refused", () => {
    const zero: BandCoverageBand[] = [band(1, 0, 0, "Level 0: no rewardable material."), band(2, 1, 6)];
    const violations = bandCoverageViolations(zero, 6);
    expect(violations).toContainEqual(
      "level 1 awards no marks (range 0-0) — zero marks is not a band (ADR-040 §2.1; blank responses take the deterministic zero)",
    );
  });

  test("tiling: the top band must reach the awarded range", () => {
    expect(bandCoverageViolations(TILED_0_6, 8)).toEqual([
      "the top band ends at 6 but the awarded range reaches 8 — bands must tile the awarded range (ADR-040 §2.1)",
    ]);
  });

  test("unknown awarded range (null / 0) → the tiling check is skipped, never fabricated", () => {
    expect(bandCoverageViolations(TILED_0_6, null)).toEqual([]);
    expect(bandCoverageViolations(TILED_0_6, 0)).toEqual([]);
  });

  test("level indices must be exactly 1..n — gaps, duplicates and 0-based ordinals are refused", () => {
    const gapped: BandCoverageBand[] = [band(1, 0, 2), band(3, 3, 6)];
    expect(bandCoverageViolations(gapped, 6)).toContainEqual(
      "level indices are [1, 3] — expected exactly 1..2 with no gaps or duplicates (1 = lowest band)",
    );
    const duplicated: BandCoverageBand[] = [band(1, 0, 2), band(1, 3, 6)];
    expect(bandCoverageViolations(duplicated, 6)).toContainEqual(
      "level indices are [1, 1] — expected exactly 1..2 with no gaps or duplicates (1 = lowest band)",
    );
  });

  test("level_index must ascend with the mark ranges (1 = lowest)", () => {
    const inverted: BandCoverageBand[] = [band(2, 0, 2), band(1, 3, 6)];
    const violations = bandCoverageViolations(inverted, 6);
    expect(violations).toContainEqual(
      "level_index order does not ascend with the mark ranges — the ordinal (1 = lowest) must follow the marks",
    );
  });

  test("descriptors are required (the verbatim law's machine floor: present and non-blank)", () => {
    const noDescriptor: BandCoverageBand[] = [band(1, 0, 2, null), band(2, 3, 6)];
    expect(bandCoverageViolations(noDescriptor, 6)).toContainEqual(
      "level 1 descriptor is missing or blank — descriptors are verbatim-as-printed (R4 LEVELS check 1)",
    );
    const blank: BandCoverageBand[] = [band(1, 0, 2, "   "), band(2, 3, 6)];
    expect(bandCoverageViolations(blank, 6)).toContainEqual(
      "level 1 descriptor is missing or blank — descriptors are verbatim-as-printed (R4 LEVELS check 1)",
    );
  });

  test("inverted ranges and negatives are named per level (the DB CHECKs mirrored pre-flight)", () => {
    const bad: BandCoverageBand[] = [band(1, 3, 1), band(2, -1, 6)];
    const violations = bandCoverageViolations(bad, 6);
    expect(violations).toContainEqual("level 1 range 3-1 is inverted (marks_max must be >= marks_min)");
    expect(violations).toContainEqual(
      "level 2 marks_min -1 is negative (bands award marks, starting at 0)",
    );
  });

  test("violations stack deterministically (a broken set reports every broken rule)", () => {
    const broken: BandCoverageBand[] = [band(1, 0, 2, null), band(2, 5, 6)];
    const violations = bandCoverageViolations(broken, 6);
    expect(violations).toEqual([
      "level 1 descriptor is missing or blank — descriptors are verbatim-as-printed (R4 LEVELS check 1)",
      "mark ranges are not contiguous (gap): level 1 ends at 2 but level 2 starts at 5 (expected 3)",
    ]);
  });
});

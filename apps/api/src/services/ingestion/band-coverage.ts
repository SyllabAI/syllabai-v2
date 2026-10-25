/**
 * ADR-040 §2.1 band-coverage validator rules — the LEVELS analog of the
 * point path's structural guarantees, as pure functions (corpus lane).
 *
 * The coverage law of record (ADR-040 §2.1, verbatim intent): "a LEVELS
 * part is G1-ready iff its VALIDATED scheme's bands are contiguous and
 * tile the part's awarded range — i.e. sorted bands satisfy
 * b[i].marks_max + 1 = b[i+1].marks_min and min = 0 or 1, with the top
 * band reaching question_parts.marks. Zero marks is not a band."
 *
 * Enforcement points (§5.3):
 *   - R4 SME validation — the fail-closed gate on the scheme VALIDATED
 *     transitions (validateMarkScheme single + validateAllForPaper batch,
 *     fail fast BEFORE mutating): violations refuse the flip with the
 *     reviewer-locatable message list. NOT force-bypassable: force's
 *     frozen semantics (REVIEW_REQUIRED bridge, schemeless authoring) are
 *     about missing human review, never about accepting malformed band
 *     data — the tiling law is the G1 data-integrity gate the flips and
 *     the registry rows stand on.
 *   - R2 audit — the same rules in SQL-of-record (`parts_with_bands_bound`
 *     beside `parts_with_points_bound`); this module is the code half that
 *     keeps the two law expressions from drifting.
 *
 * What the machine CAN check (ranges, contiguity, ordinality, the
 * verbatim-floor non-emptiness) vs what stays human (R4 "descriptors
 * verbatim" — equality against the printed page is the SME checklist's
 * job; the machine floor is that a descriptor exists and is non-blank).
 *
 * Part-marks resolution of record for the tiling check (the bands table
 * binds the SCHEME, and mark_schemes bind the question version —
 * UNIQUE(scheme_id, level_index) admits exactly ONE level set per
 * scheme):
 *   - a single-part version → that part's marks;
 *   - a multi-part version → the SUM of the version's part marks (the
 *     question total the one printed levels table must reach — the only
 *     representable shape under the additive schema);
 *   - zero parts or a non-positive total (marks unknown at parse time) →
 *     null → the tiling check is skipped (not fabricated), disclosed to
 *     the reviewer in the gate's audit note.
 * This reading meets the real corpora at band-wave 1; any mismatch is a
 * receipt finding of record, never a silent guess.
 */

/** The validator's band projection — snake/bridge row or draft row both map onto it. */
export interface BandCoverageBand {
  levelIndex: number;
  marksMin: number;
  marksMax: number;
  descriptor: string | null;
}

/**
 * Every violation, in deterministic order (row order first, then the
 * structural checks on the sorted chain). Empty array = the band set is
 * G1-ready with respect to what the machine can evaluate.
 */
export function bandCoverageViolations(
  bands: BandCoverageBand[],
  partMarks: number | null,
): string[] {
  if (bands.length === 0) {
    return [
      "the scheme carries no bands — a LEVELS scheme with zero bands marks nothing (ADR-040 §2.1: zero marks is not a band)",
    ];
  }

  const violations: string[] = [];

  // per-row basics (the DB CHECKs mirrored pre-flight, so the reviewer sees
  // the offending level named, not a raw constraint violation)
  for (const band of bands) {
    if (!Number.isInteger(band.levelIndex) || band.levelIndex < 1) {
      violations.push(
        `level index ${band.levelIndex} is not a positive integer (the ordinal starts at 1 = lowest)`,
      );
    }
    if (!Number.isInteger(band.marksMin) || band.marksMin < 0) {
      violations.push(
        `level ${band.levelIndex} marks_min ${band.marksMin} is negative (bands award marks, starting at 0)`,
      );
    }
    if (!Number.isInteger(band.marksMax) || band.marksMax < band.marksMin) {
      violations.push(
        `level ${band.levelIndex} range ${band.marksMin}-${band.marksMax} is inverted (marks_max must be >= marks_min)`,
      );
    }
    if (band.descriptor == null || band.descriptor.trim() === "") {
      violations.push(
        `level ${band.levelIndex} descriptor is missing or blank — descriptors are verbatim-as-printed (R4 LEVELS check 1)`,
      );
    }
  }

  // the ordinal set: exactly 1..n, no gaps, no duplicates (UNIQUE(scheme_id,
  // level_index) catches duplicates at the DB; the set check catches both
  // pre-DB and names the actual set)
  const indices = bands.map((b) => b.levelIndex).sort((a, b) => a - b);
  const expected = Array.from({ length: bands.length }, (_, i) => i + 1);
  if (indices.some((v, i) => v !== expected[i])) {
    violations.push(
      `level indices are [${indices.join(", ")}] — expected exactly 1..${bands.length} with no gaps or duplicates (1 = lowest band)`,
    );
  }

  // the chain: sorted by marksMin, contiguous (b[i].marks_max + 1 = b[i+1].marks_min),
  // bottom at 0 or 1, top reaching the awarded range; level_index must ascend
  // with the mark ranges (the ordinal IS the mark order)
  const byMarks = [...bands].sort((a, b) => a.marksMin - b.marksMin || a.marksMax - b.marksMax);
  const byIndex = [...bands].sort((a, b) => a.levelIndex - b.levelIndex);
  const sameOrder = byMarks.every((b, i) => b.levelIndex === byIndex[i]?.levelIndex);
  if (!sameOrder && indices.every((v, i) => v === expected[i])) {
    violations.push(
      "level_index order does not ascend with the mark ranges — the ordinal (1 = lowest) must follow the marks",
    );
  }
  for (let i = 0; i < byMarks.length - 1; i++) {
    const current = byMarks[i]!;
    const next = byMarks[i + 1]!;
    if (current.marksMax + 1 !== next.marksMin) {
      const kind = next.marksMin <= current.marksMax ? "overlap" : "gap";
      violations.push(
        `mark ranges are not contiguous (${kind}): level ${current.levelIndex} ends at ${current.marksMax} but level ${next.levelIndex} starts at ${next.marksMin} (expected ${current.marksMax + 1})`,
      );
    }
  }
  const bottom = byMarks[0]!;
  if (Number.isInteger(bottom.marksMin) && bottom.marksMin !== 0 && bottom.marksMin !== 1) {
    violations.push(
      `the lowest band starts at ${bottom.marksMin} — the bottom band must start at 0 or 1 (zero marks itself is not a band)`,
    );
  }
  for (const band of bands) {
    if (band.marksMax === 0) {
      violations.push(
        `level ${band.levelIndex} awards no marks (range ${band.marksMin}-${band.marksMax}) — zero marks is not a band (ADR-040 §2.1; blank responses take the deterministic zero)`,
      );
    }
  }

  // tiling: the top band must reach the awarded range (when it is known)
  if (partMarks != null && partMarks > 0) {
    const top = byMarks[byMarks.length - 1]!;
    if (top.marksMax !== partMarks) {
      violations.push(
        `the top band ends at ${top.marksMax} but the awarded range reaches ${partMarks} — bands must tile the awarded range (ADR-040 §2.1)`,
      );
    }
  }

  return violations;
}

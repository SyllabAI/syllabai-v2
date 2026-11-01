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
 *   - a scheme bound to a question part (mark_schemes.question_part_id, the
 *     ruled A-law of adr040-bandshape-fit-r0, trace 1a1776dff15bb991) →
 *     THAT part's marks — the wave-1 printed tables are part-granular
 *     (437/437 staged grids), so the part-bound grid tiles the part;
 *   - a version-level scheme (question_part_id null) → a single-part
 *     version → that part's marks; a multi-part version → the SUM of the
 *     version's part marks (the question total the one printed levels table
 *     must reach);
 *   - zero parts or a non-positive total (marks unknown at parse time) →
 *     null → the tiling check is skipped (not fabricated), disclosed to
 *     the reviewer in the gate's audit note.
 * This reading meets the real corpora at band-wave 1 under the ruled law;
 * any further mismatch is a receipt finding of record, never a silent guess.
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

/** The multi-axis set projection — one member per axis-suffixed sibling
 *  scheme of a part-bound LEVELS scheme-set (OD-1 MA-1). */
export interface MultiAxisSetMember {
  /** mark_schemes.version_label — '<base>#<axis>', the printed column of record. */
  versionLabel: string;
  /** ALL printed rows of that axis, including zero-mark cells (kept verbatim). */
  bands: BandCoverageBand[];
}

/**
 * ADR-040 §2.1 as amended by the OD-1 multi-axis R4 consumption law (r0,
 * operator ruling trace 1a19701a448fd715; PR-A receipt
 * adr040-od1-pra-multi-axis-r4): for a part-bound LEVELS scheme-set born
 * from ONE printed multi-axis grid (version_label '<base>#<axis>'), the SET
 * is the R4 unit (MA-2) and the coverage law reads:
 *   - MA-1 identity: at least two members; every label is exactly
 *     '<base>#<axis>'; one shared base; distinct axis labels;
 *   - MA-3 per-axis rows: the single-scheme per-row basics and the ordinal
 *     set 1..n hold over ALL printed rows; a zero-mark cell
 *     (marks_min = marks_max = 0) is allowed only at the bottom ordinal and
 *     is NOT a band — it is excluded from the chain and kept verbatim;
 *   - MA-4 per-axis chain: over the member's non-zero rows — contiguous
 *     (max+1=min), ordinal ascends with marks, bottom 0/1;
 *   - MA-5 cross-axis closure: the members' chain tops sum to the part's
 *     marks, exactly — the multi-axis replacement for the single-scheme
 *     tiling predicate (an axis sibling does NOT tile the part alone).
 * Violations refuse the flip of EVERY sibling in the set (the set flips
 * atomically or not at all — MA-2). The verbatim law is untouched: no row
 * is edited, clamped, or synthesized to satisfy this gate.
 */
export function multiAxisSetCoverageViolations(
  members: MultiAxisSetMember[],
  partMarks: number | null,
): string[] {
  const violations: string[] = [];
  if (members.length < 2) {
    return [
      `the axis set has ${members.length} member(s) — a multi-axis printed grid has at least two axis columns (OD-1 MA-1)`,
    ];
  }

  // MA-1 identity: '<base>#<axis>' shape, one shared base, distinct axes
  let base: string | null = null;
  const axes = new Set<string>();
  for (const member of members) {
    const parts = member.versionLabel.split("#");
    if (parts.length !== 2 || parts[0]!.trim() === "" || parts[1]!.trim() === "") {
      violations.push(
        `axis label "${member.versionLabel}" is not <base>#<axis> (OD-1 MA-1)`,
      );
      continue;
    }
    if (base === null) {
      base = parts[0]!;
    } else if (base !== parts[0]!) {
      violations.push(
        `the axis set mixes base refs "${base}" and "${parts[0]}" (OD-1 MA-1)`,
      );
    }
    if (axes.has(parts[1]!)) {
      violations.push(`duplicate axis label "${parts[1]}" in the set (OD-1 MA-1)`);
    }
    axes.add(parts[1]!);
  }

  // per-member rows and chain
  let topSum = 0;
  for (const member of members) {
    const label = member.versionLabel;
    if (member.bands.length === 0) {
      violations.push(
        `axis "${label}" carries no bands — a LEVELS scheme with zero bands marks nothing (OD-1 MA-3)`,
      );
      continue;
    }
    for (const band of member.bands) {
      if (!Number.isInteger(band.levelIndex) || band.levelIndex < 1) {
        violations.push(
          `axis "${label}" level index ${band.levelIndex} is not a positive integer (OD-1 MA-3)`,
        );
      }
      if (!Number.isInteger(band.marksMin) || band.marksMin < 0) {
        violations.push(
          `axis "${label}" level ${band.levelIndex} marks_min ${band.marksMin} is negative (OD-1 MA-3)`,
        );
      }
      if (!Number.isInteger(band.marksMax) || band.marksMax < band.marksMin) {
        violations.push(
          `axis "${label}" level ${band.levelIndex} range ${band.marksMin}-${band.marksMax} is inverted (OD-1 MA-3)`,
        );
      }
      if (band.descriptor == null || band.descriptor.trim() === "") {
        violations.push(
          `axis "${label}" level ${band.levelIndex} descriptor is missing or blank — descriptors are verbatim-as-printed (OD-1 MA-3)`,
        );
      }
    }
    const indices = member.bands.map((b) => b.levelIndex).sort((a, b) => a - b);
    const expected = Array.from({ length: member.bands.length }, (_, i) => i + 1);
    const ordinalsClean = indices.every((v, i) => v === expected[i]);
    if (!ordinalsClean) {
      violations.push(
        `axis "${label}" level indices are [${indices.join(", ")}] — expected exactly 1..${member.bands.length} with no gaps or duplicates (OD-1 MA-3)`,
      );
    }
    // zero-mark cells: verbatim rows, not bands; bottom ordinal only
    const bottomOrdinal = Math.min(...indices);
    for (const band of member.bands) {
      if (band.marksMin === 0 && band.marksMax === 0 && band.levelIndex !== bottomOrdinal) {
        violations.push(
          `axis "${label}" zero-mark cell sits at level ${band.levelIndex}, not the bottom ordinal (OD-1 MA-3)`,
        );
      }
    }
    const chain = member.bands.filter((b) => !(b.marksMin === 0 && b.marksMax === 0));
    if (chain.length === 0) {
      violations.push(
        `axis "${label}" has no band rows above its zero cell — zero marks itself is not a band (OD-1 MA-3)`,
      );
      continue;
    }
    chain.sort((a, b) => a.marksMin - b.marksMin || a.marksMax - b.marksMax);
    const byIndex = [...chain].sort((a, b) => a.levelIndex - b.levelIndex);
    if (!chain.every((b, i) => b.levelIndex === byIndex[i]?.levelIndex) && ordinalsClean) {
      violations.push(
        `axis "${label}" level_index order does not ascend with the mark ranges — the ordinal (1 = lowest) must follow the marks (OD-1 MA-4)`,
      );
    }
    for (let i = 0; i < chain.length - 1; i++) {
      const current = chain[i]!;
      const next = chain[i + 1]!;
      if (current.marksMax + 1 !== next.marksMin) {
        const kind = next.marksMin <= current.marksMax ? "overlap" : "gap";
        violations.push(
          `axis "${label}" mark ranges are not contiguous (${kind}): level ${current.levelIndex} ends at ${current.marksMax} but level ${next.levelIndex} starts at ${next.marksMin} (expected ${current.marksMax + 1}) (OD-1 MA-4)`,
        );
      }
    }
    const bottom = chain[0]!;
    if (Number.isInteger(bottom.marksMin) && bottom.marksMin !== 0 && bottom.marksMin !== 1) {
      violations.push(
        `axis "${label}" the lowest band starts at ${bottom.marksMin} — the bottom band must start at 0 or 1 (OD-1 MA-4)`,
      );
    }
    for (const band of chain) {
      if (band.marksMax === 0) {
        violations.push(
          `axis "${label}" level ${band.levelIndex} awards no marks (range ${band.marksMin}-${band.marksMax}) — zero marks is not a band (OD-1 MA-3)`,
        );
      }
    }
    topSum += chain[chain.length - 1]!.marksMax;
  }

  // MA-5 cross-axis closure (the multi-axis tiling law)
  if (partMarks != null && partMarks > 0 && topSum !== partMarks) {
    violations.push(
      `the axis tops sum to ${topSum} but the awarded range reaches ${partMarks} — the set must close on the part's marks (OD-1 MA-5)`,
    );
  }

  return violations;
}

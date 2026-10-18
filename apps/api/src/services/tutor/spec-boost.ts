/**
 * T-MIG-133 band 133d (r0) — the spec-scoped fusion boost (the books band's
 * own law, additive at the FuseOptions seam).
 *
 * The intake note of record (books-ingest-133b): the per-chunk spec_codes
 * overlay is "chapter-scoped; the tutor's spec-scoped boost in 133d reads
 * this column — same shape as the papers' corpus". This module is that read.
 *
 * THE BOOST LAW: a TEXTBOOK evidence item whose chunk spec_codes intersect
 * the ask's intent spec-point set fuses at the anchor tier (weight 1.0);
 * every other weight is byte-identical to the frozen plan map (TEXTBOOK
 * otherwise 0.7 — plan §7 tier-3 background). Rank order inside a list is
 * untouched (RRF is score-free); only the boosted item's rank CONTRIBUTION
 * scales. No intent topics (or no index) ⇒ the decorator is an exact
 * passthrough — asks that never matched the KG fuse byte-identically to the
 * pre-133d posture.
 *
 * THE JOIN of record: the KG's matched topic nodes carry spine-section/
 * -subsection codes (e.g. 4CH1-S3-b, the bank discriminator's space); the
 * chunk spec_codes carry the spine's official_code space (e.g. "2.40C" —
 * verified of record on the pilot: 646/823 chunks overlaid, 143 distinct
 * codes). The concept-graph snapshot (the frozen teacher substrate) is the
 * bridge: each spec point carries officialCode + sectionCode + subsectionCode.
 * The index keys BOTH parent spaces per official code; the ask's intent set
 * is the union of the matched topic codes' official-code sets.
 *
 * INDEX BUDGET: 182 spec points — the index builds once per process (module
 * cache) from the sha256-pinned inlined snapshot; tests inject their own.
 */
import { loadConceptGraphSnapshot } from "../teacher/snapshot";
import type { EvidenceItem } from "./evidence";

export type SpecBoostIndex = ReadonlyMap<string, ReadonlySet<string>>;

/** Build the parent-code → official-codes index from the snapshot's spec
 *  points (both the section and the subsection space key each point). */
export function buildSpecBoostIndex(
  specPoints: ReadonlyArray<{
    officialCode: string;
    sectionCode: string;
    subsectionCode: string;
  }>,
): SpecBoostIndex {
  const index = new Map<string, Set<string>>();
  const add = (parent: string, official: string): void => {
    if (!parent) return;
    const set = index.get(parent) ?? new Set<string>();
    set.add(official);
    index.set(parent, set);
  };
  for (const sp of specPoints) {
    add(sp.sectionCode, sp.officialCode);
    add(sp.subsectionCode, sp.officialCode);
  }
  return index;
}

let cachedDefault: SpecBoostIndex | null = null;

/** The process-wide index of record — lazily built from the frozen
 *  concept-graph snapshot (the sha256-pinned inlined YAMLs). */
export function defaultSpecBoostIndex(): SpecBoostIndex {
  if (cachedDefault == null) {
    cachedDefault = buildSpecBoostIndex(
      loadConceptGraphSnapshot().specPoints.map((sp) => ({
        officialCode: sp.officialCode,
        sectionCode: sp.sectionCode,
        subsectionCode: sp.subsectionCode,
      })),
    );
  }
  return cachedDefault;
}

/** Union the matched topic codes' official-code sets into one boost set. */
export function specBoostSet(
  index: SpecBoostIndex | null | undefined,
  intentCodes: ReadonlyArray<string>,
): Set<string> {
  const out = new Set<string>();
  if (index == null || intentCodes.length === 0) return out;
  for (const code of intentCodes) {
    const set = index.get(code);
    if (set == null) continue;
    for (const c of set) out.add(c);
  }
  return out;
}

/** The 133d weight decorator: a TEXTBOOK item with an intersecting spec
 *  code fuses at the anchor tier (1.0); everything else passes through. */
export function specBoostWeight(
  boostSet: ReadonlySet<string>,
  item: EvidenceItem,
  planWeight: number,
): number {
  if (boostSet.size === 0) return planWeight;
  if (item.source !== "TEXTBOOK") return planWeight;
  if (item.specCodes.length === 0) return planWeight;
  return item.specCodes.some((c) => boostSet.has(c)) ? 1.0 : planWeight;
}

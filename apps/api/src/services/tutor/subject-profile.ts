/**
 * subject-profile — the ONE place that knows how a spec code behaves
 * (T-MIG-135c: the second-subject slice of the paper-identity grammar, the
 * legacy alias map and the prompt notation law; T-MIG-136e: the third
 * subject — Maths B 4MB1, papers 1/2, NO tier letters and NO regional
 * variants).
 *
 * Before this module the paper grammar was CHEMISTRY-PINNED in five runtime
 * places (fetch-parser ×2, paper-question ×2, fetch-bank /
 * content-routing): the 4CH0 legacy alias was hardcoded, the unit
 * vocabulary was 1C/2C/1CR/2CR only, and the tutor prompt mandated mhchem
 * notation for every subject. Maths A (4MA1, units 1H/2H/1F/2F, legacy
 * alias 4MA0) made all three wrong; Maths B (4MB1, units 1/2 — the paper
 * NUMBER is the unit, bare digits) made the token law wrong.
 *
 * Laws:
 *   - legacy aliases: 4CH1 → 4CH0, 4MA1 → 4MA0, 4MB1 → 4MB0 (the
 *     pre-2017/2016 specs whose paper archives still serve); unknown
 *     subjects have none.
 *   - unit vocabulary: chemistry [12]C R? (home + regional variant),
 *     maths-a [12][HF] R? (Higher / Foundation + regional variant —
 *     T-MIG-138a widened the vocabulary for the 4MA1 paper intake; the
 *     home+variant ORDER is unchanged), maths-b [12] (bare — two
 *     untiered papers). The bare-unit BOUND differs by design: chemistry
 *     keeps its space-tolerant shape ("2 C"), maths-a requires adjacency
 *     ("2H" ✓, "2 h" the hour abbreviation ✗ — the H/F letters collide
 *     with unit words in prose, the C letters do not); maths-b binds NO
 *     bare unit token at all — a standalone "1"/"2" in prose is every
 *     number, question and year, so paper identity binds only through the
 *     full code (4MB1/1) or the "paper N" hint path.
 *   - prompt notation: chemistry keeps the v12 mhchem law byte-verbatim
 *     (the of-record prompt); every other subject gets the plain-LaTeX law.
 */
export const LEGACY_SUBJECT_ALIASES: Readonly<Record<string, readonly string[]>> = {
  "4CH1": ["4CH0"],
  "4MA1": ["4MA0"],
  "4MB1": ["4MB0"],
};

/** The legacy alias codes for one subject code (subject first is NOT
 *  included — callers prepend the live subject themselves). */
export function legacyAliasesOf(subjectCode: string): string[] {
  return [...(LEGACY_SUBJECT_ALIASES[subjectCode] ?? [])];
}

/** The identity candidate codes for a subject: the subject, then its legacy
 *  aliases in of-record order (the frozen "subject first, legacy second"
 *  law, now per-subject). */
export function identityCodesOf(subjectCode: string): string[] {
  return [subjectCode, ...legacyAliasesOf(subjectCode)];
}

/** The alias codes to append after a subject-code list pulled from the
 *  subjects table (fetch-bank / content-routing parity: subject rows
 *  first, aliases after). */
export function withLegacyAliases(codes: readonly string[]): string[] {
  const out = [...codes];
  for (const code of codes) {
    for (const alias of legacyAliasesOf(code)) {
      if (!out.includes(alias)) out.push(alias);
    }
  }
  return out;
}

/** "paper N" phrasing → the home units then the regional/tier variants.
 *  T-MIG-136e: maths-b has no tier/variant axis — the paper number IS the
 *  unit ("1"/"2" verbatim). T-MIG-138a: maths-a joins the regional-variant
 *  axis like chemistry (the archive carries 1FR/1HR/2FR/2HR) — home units
 *  first, variants after, per tier. */
export function unitHintCandidates(subjectCode: string, paperNumber: string): string[] {
  if (/^4MB/.test(subjectCode)) {
    return paperNumber === "1" ? ["1"] : paperNumber === "2" ? ["2"] : [];
  }
  if (/^4MA/.test(subjectCode)) {
    return paperNumber === "1"
      ? ["1H", "1F", "1HR", "1FR"]
      : ["2H", "2F", "2HR", "2FR"];
  }
  return paperNumber === "1" ? ["1C", "1CR"] : ["2C", "2CR"];
}

/** Nothing → both home units then both variants, per subject. T-MIG-138a:
 *  maths-a gains the R variants after the home units (chemistry shape). */
export function defaultUnitCandidates(subjectCode: string): string[] {
  if (/^4MB/.test(subjectCode)) {
    return ["1", "2"];
  }
  if (/^4MA/.test(subjectCode)) {
    return ["1H", "2H", "1F", "2F", "1HR", "2HR", "1FR", "2FR"];
  }
  return ["1C", "2C", "1CR", "2CR"];
}

/** The unit tail of a full paper code, per subject vocabulary.
 *  T-MIG-136e: the bare-digit maths-b form ([12] alone) joins the token
 *  law — the caller contexts are all paper-identity parses (full codes or
 *  parser-extracted units), so a bare digit here is always an explicit
 *  paper reference, never prose. */
export function isValidUnitToken(unit: string): boolean {
  return /^[12](?:CR?|[HF]R?)$/.test(unit) || /^[12]$/.test(unit);
}

export type PromptSubjectVariant = "chemistry" | "general";

/** The prompt notation variant for a scope code ("4CH1-2017" → chemistry;
 *  anything else — including null — general). */
export function promptVariantFor(scopeCode: string | null | undefined): PromptSubjectVariant {
  return scopeCode != null && /^4CH[01]/.test(scopeCode.trim()) ? "chemistry" : "general";
}

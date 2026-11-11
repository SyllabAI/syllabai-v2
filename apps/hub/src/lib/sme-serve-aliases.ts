/**
 * D-SERVE-1 — SME serving-continuity alias map (the corpus-slug drift class).
 *
 * The hub join derives question refs from the CURRENT corpus view
 * (`smeQuestionRef`, the shared law); production families hold the refs the
 * banking vintage stored. Where SaveMyExams renamed/restructured a page
 * since the banking vintage, the derived ref and the stored family ref
 * disagree and the exact-string lookup misses — the question degrades to
 * honest local-only even though its content is verified-banked.
 *
 * The generated map bridges EXACTLY that miss:
 *
 *     key   = the ref this route derives today (the failing lookup key)
 *     value = the stored family base ref the content was banked under
 *
 * Law of record: scripts/dserve1/DSERVE1-LAW.md (my-project evidence repo).
 * The map is a BUILD-TIME artifact of the content-identity census
 * (md5 fingerprints over parts/options — the D-KG1b/D-KG2 instrument of
 * record), never a hand-written file, and it fires ONLY on a primary-chain
 * miss: zero behavior change for every ref the join resolves directly.
 * The join guards (count guards, per-part marks equality, option-label
 * resolution) still gate every aliased family — an alias can only resolve
 * a content-verified family, never fabricate a join.
 */
import { SERVE_ALIASES } from "./sme-serve-aliases.generated";

/** base-ref shape of record: `sme-eq-<slugs>-q<N>` + optional `-w<k>` twin
 * marker (D-KG1b). Member suffixes (-p/-s) never alias — families join at
 * the base ref (assembler familyKey). */
const SME_BASE_REF = /^sme-eq-[a-z0-9-]+-q\d+(-w\d*)?$/;

let cache: Record<string, string> | null = null;

function aliasMap(): Record<string, string> {
  if (cache) return cache;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(SERVE_ALIASES)) {
    if (!SME_BASE_REF.test(k) || !SME_BASE_REF.test(v)) continue;
    out[k] = v;
  }
  cache = out;
  return out;
}

/** Entries in the (validated) map — receipt/observability surface. */
export function smeServeAliasCount(): number {
  return Object.keys(aliasMap()).length;
}

/** The stored family ref for a derived ref, or null. */
export function smeServeAliasFor(ref: string): string | null {
  const alt = aliasMap()[ref];
  return typeof alt === "string" ? alt : null;
}

/**
 * The retry candidates for one join miss, in priority order (the route
 * applies exactly this order): the wave-era bare legacy key first (the
 * D-KG1b k=1 degrade key, when one exists), then its alias, then the
 * primary key's alias. Self-aliases and duplicates never surface.
 */
export function smeServeFamilyCandidates(
  primary: string,
  bareLegacy: string | null,
): string[] {
  const out: string[] = [];
  const push = (alt: string | null) => {
    if (
      alt &&
      alt !== primary &&
      alt !== bareLegacy &&
      !out.includes(alt)
    ) {
      out.push(alt);
    }
  };
  if (bareLegacy) push(smeServeAliasFor(bareLegacy));
  push(smeServeAliasFor(primary));
  return out;
}

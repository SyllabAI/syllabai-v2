/**
 * part-label — derive the printed exam part label ("(a)", "(a)(i)", "(c)(ii)")
 * for a question part, from the carriers the corpus actually provides.
 *
 * WHY THIS EXISTS (operator-reported learner-surface gap, 2026-10-30): the
 * question player renders parts as bare problemMd blocks with a right-aligned
 * marks tag — the printed part labels ((a), (c)(ii)…) never appear anywhere,
 * on all three Official-ExamQuestion courses (chemistry-19 / physics-19 /
 * maths-b-16). The label is not a first-class serving field:
 *   - the official plane hardcodes `sourcePaper.questionPart: null` (exporter
 *     of record `official_examq_export_hub.py` L564-568); the label survives
 *     only inside the part id slug:
 *       offp_<series>_<paper>_<qn>[-<path>]   e.g. offp_2019-06_1p_1-a-i
 *     with path segments like a / b / i / ii / 1;
 *   - the SME plane carries only `sourcePaper.questionPart` ("a", or glued
 *     sub-levels "ai"/"aii"/"aiii"/"cii"); part ids (qstnprt_*) are opaque.
 *
 * FAIL-CLOSED LAW: anything that does not match an attested shape returns
 * null and the player renders NO chip — a label is never guessed (an
 * index-derived letter would MISLABEL sub-part sequences like
 * (a)(i),(a)(ii),(b)(i),(b)(ii) as a,b,c,d). Disclosed null classes:
 *   - 735 official ids with no path (whole-question parts — the card header
 *     number chip is the whole printed label);
 *   - the messy SME minority ("b ii, iii", "a i)", "d(ii)", "b-i"…) —
 *     rescued where trivial ("c " → trim, "A" → lowercase), null otherwise.
 *
 * CENSUS OF RECORD (all three courses, 2026-10-30, content of record):
 *   official ids: 7,304/7,304 parse; 3,213 one-level paths, 3,356 two-level
 *   paths, 735 no-path; every path segment matches [a-z0-9]{1,5}.
 *   SME questionPart: 3,201 non-null values; ~2,991 yield a chip via the
 *   three attested shapes below, the ~25 messy forms yield null.
 */

export interface PartLabelSource {
  id?: string | null;
  sourcePaper?: { questionPart?: string | null } | null;
}

/** offp_<series>_<paper>_<qn>[-<path>] — both shapes attested (735 no-path). */
const OFFP_RE = /^offp_[0-9a-z-]+_[0-9a-z-]+_(\d{1,2})(?:-([0-9a-z-]+))?$/;
/** SME glued sub-levels: letter + romans ("ai", "aii", "biii", "civ"). */
const SME_GLUED_RE = /^([a-z])((?:[ivx]{1,4})+)$/;
/** roman-only sub-levels ("i", "ii", "iii") — questions typed (i)(ii)(iii). */
const SME_ROMAN_RE = /^[ivx]{1,5}$/;

/** "(a)(i)" from path/label segments — null when any segment is off-grammar. */
function wrapLabel(segs: string[]): string | null {
  if (segs.length === 0 || segs.length > 3) return null;
  if (!segs.every((s) => /^[a-z0-9]{1,5}$/.test(s))) return null;
  return segs.map((s) => `(${s})`).join("");
}

/**
 * The printed part label for the attested corpus shapes; null = honestly no
 * label to show (the player then renders no chip — same absence as today).
 */
export function partDisplayLabel(part: PartLabelSource): string | null {
  const id = part.id ?? "";
  if (id.startsWith("offp_")) {
    const m = OFFP_RE.exec(id);
    if (!m) return null; // official id off-grammar → never guess
    if (!m[2]) return null; // path-less official part (whole-question slice)
    return wrapLabel(m[2].split("-"));
  }
  const qp = (part.sourcePaper?.questionPart ?? "").trim().toLowerCase();
  if (!qp) return null;
  if (SME_ROMAN_RE.test(qp)) return `(${qp})`;
  const glued = SME_GLUED_RE.exec(qp);
  if (glued) return `(${glued[1]})${glued[2].replace(/[ivx]{1,4}/g, (r) => `(${r})`)}`;
  if (/^[a-z]$/.test(qp)) return `(${qp})`;
  return null; // messy SME forms ("b ii, iii", "a(i)", "b-i") stay unlabeled
}

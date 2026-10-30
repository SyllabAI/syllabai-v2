/**
 * part-label — derive the printed exam part label ("(a)", "(a)(i)", "(c)(ii)")
 * for a question part, from the carriers the corpus actually provides.
 *
 * WHY THIS EXISTS (operator-reported learner-surface gap, 2026-10-30): the
 * question player rendered parts as bare problemMd blocks with a right-aligned
 * marks tag — the printed part labels ((a), (c)(ii)…) never appear anywhere,
 * on all three Official-ExamQuestion courses (chemistry-19 / physics-19 /
 * maths-b-16).
 *
 * HISTORY: this module landed (T-OEQ-PARTLABEL-1, v2 #467) when the label was
 * NOT a first-class serving field — the official plane hardcoded
 * `sourcePaper.questionPart: null` (exporter of record
 * `official_examq_export_hub.py`) and the label survived only inside the part
 * id slug `offp_<series>_<paper>_<qn>[-<path>]`; the SME plane carried only
 * bare letters / glued sub-levels ("a", "ai", "aii"…).
 *
 * F119 / T-OEQ-PARTLABEL-3 (the Option A wave): the exporter of record now
 * EMITS the printed label as `sourcePaper.questionPart` ("(a)(i)" — derived
 * from the corpus part_number, identity-pinned to the id slug by the G-E6
 * label gate, fail-closed both directions; resources PR of record), and the
 * maths-B plane carries it via the disclosed serve-plane field-write. The
 * official branch below therefore consumes the FIELD OF RECORD first and
 * keeps the slug parse as the fail-closed fallback (older bundle vintages,
 * receipts replay) — still never a guess either way.
 *
 * FAIL-CLOSED LAW: anything that does not match an attested shape returns
 * null and the player renders NO chip — a label is never guessed (an
 * index-derived letter would MISLABEL sub-part sequences like
 * (a)(i),(a)(ii),(b)(i),(b)(ii) as a,b,c,d). Disclosed null classes:
 *   - 735 official ids with no path (whole-question parts — the card header
 *     number chip is the whole printed label; exporter emits null for them);
 *   - the messy SME minority ("b ii, iii", "a i)", "d(ii)", "b-i"…) —
 *     rescued where trivial ("c " → trim, "A" → lowercase), null otherwise.
 *
 * CENSUS OF RECORD (all three courses, 2026-10-30, post-F119):
 *   official parts: 7,304 — 6,569 carry the first-class field (labelled),
 *   735 are path-less nulls; every path segment matches [a-z0-9]{1,5}.
 *   (per course: phys 2,239+15 / chem 2,607+0 / maths-b 1,723+720 —
 *   the exporter G-E6 receipt + the maths-B field-write receipt.)
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
    // F119: consume the exporter-of-record FIELD first ("(a)(i)" — G-E6-pinned
    // to the id slug, so the two can never drift); validate the shape rather
    // than trusting it blind (fail-closed law), then fall back to the slug.
    const qp = (part.sourcePaper?.questionPart ?? "").trim();
    if (qp && /^\((?:[a-z0-9]{1,5})\)(?:\([a-z0-9]{1,5}\)){0,2}$/.test(qp)) return qp;
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

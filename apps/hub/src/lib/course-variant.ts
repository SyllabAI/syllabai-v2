/**
 * Course variant subtitles (UX audit P2-7).
 *
 * The registry contains lanes that share the same subject + exam code —
 * e.g. two Accounting 4AC1 lanes (Financial Statements vs Introduction to
 * Bookkeeping) or six Science Double Award modular units. Both render as
 * identical title+code cards, which reads as a duplicate. The
 * differentiator (the SME lane qualifier) is carried by the slug tail, so
 * we derive a human subtitle from it — but ONLY for lanes inside a
 * duplicate (subject, code) group, so ordinary cards stay unchanged.
 *
 * Client-safe: no "server-only" import (consumed by client components).
 */

export interface VariantKeyable {
  slug: string;
  subject: string;
  code: string;
  /** registry level — the disambiguator of record for lanes whose slug
   *  tail settles nothing: a CIE AS lane and its A-Level sibling share the
   *  syllabus code with no qualifier after the subject, so the level is the
   *  only honest differentiator (duplicateVariants' fallback of record). */
  level?: string;
}

const LEVEL_TOKENS = new Set(["igcse", "ial", "gcse", "as", "alevel"]);
// the CIE-INTEGRATION slug shape carries the awarding board as a leading
// token ("cie-…"); the Edexcel slugs carry none
const BOARD_TOKENS = new Set(["cie"]);
// the upstream slugs abbreviate the board spelling "Mathematics" to "maths"
// (the registry subject keeps the exam-board word) — the subject strip must
// accept the slug's own word or the subject leaks into the qualifier
const SUBJECT_SLUG_ALIASES = new Map([["mathematics", "maths"]]);
const SMALL_WORDS = new Set(["to", "and", "of", "in", "the", "with", "for", "a"]);

/**
 * "igcse-accounting-17-financial-statements" + subject "Accounting"
 *   → "Financial Statements"
 * "igcse-accounting-17-introduction-to-bookkeeping-and-accounting"
 *   + subject "Accounting" → "Introduction to Bookkeeping and Accounting"
 * "igcse-maths-a-modular-24-foundation-unit-1" + subject "Maths"
 *   → "Foundation Unit 1"
 * "igcse-science-double-award-modular-24-biology-unit-1" + subject "Science"
 *   → "Double Award Modular Biology Unit 1"
 * "igcse-english-language-a-16-paper-3-coursework" + subject "English Language"
 *   → "Paper 3 Coursework"
 * "ial-maths-20-pure-1" + subject "Maths" → "Pure 1"
 * "cie-a-level-maths-25-mechanics" + subject "Maths" → "Mechanics"
 * "cie-igcse-maths-25-core" + subject "Maths" → "Core"
 *
 * Strips left-to-right: leading board prefix ("cie-…", the CIE
 * INTEGRATION slug shape), leading level prefix, leading subject words (in
 * order, so a mid-phrase repeat like "…bookkeeping-and-accounting"
 * survives), a leading qualification letter ("maths-a", "english-language-a"),
 * then a leading run of "modular"/year tokens. Any remaining 2–4-digit year
 * tokens are dropped (single digits like "Unit 1"/"Pure 1" survive).
 */
export function variantSubtitle(slug: string, subject: string): string {
  const tokens = slug.split("-").filter(Boolean);
  let i = 0;

  while (i < tokens.length && BOARD_TOKENS.has(tokens[i])) i++;
  while (i < tokens.length && LEVEL_TOKENS.has(tokens[i])) i++;

  // CIE writes A-Level as the two-token "a-level" ("…-a-level-maths-…"),
  // which the single-token LEVEL_TOKENS set never matched
  if (tokens[i] === "a" && tokens[i + 1] === "level") i += 2;

  const subjectWords = subject
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((w) => SUBJECT_SLUG_ALIASES.get(w) ?? w);
  let si = 0;
  while (i < tokens.length && si < subjectWords.length && tokens[i] === subjectWords[si]) {
    i++;
    si++;
  }

  // qualification letter right after the subject ("maths-a", "english-language-a")
  while (i < tokens.length && /^[a-z]$/.test(tokens[i])) i++;

  // leading run of modular / syllabus-year tokens ("modular-24", "17")
  while (i < tokens.length && (tokens[i] === "modular" || /^\d{2,4}$/.test(tokens[i]))) i++;

  // syllabus-year tokens anywhere else in the qualifier are registry noise
  const rest = tokens.slice(i).filter((t) => !/^\d{2,4}$/.test(t));
  if (rest.length === 0) return "";

  return rest
    .map((t, idx) =>
      idx > 0 && SMALL_WORDS.has(t) ? t : t.charAt(0).toUpperCase() + t.slice(1),
    )
    .join(" ")
    // the slug hyphen grammar splits the word "co-ordinated" into two
    // tokens ("…-co-ordinated-sciences-…"); render the real word, not the
    // "Co Ordinated" artifact
    .replace("Co Ordinated", "Co-ordinated");
}

/** "21" → "2021 Syllabus" (registry syllabus-year tokens are 2016–2025) */
function syllabusYearLabel(slug: string): string | null {
  const t = slug.split("-").find((t) => /^\d{2,4}$/.test(t));
  if (!t) return null;
  const n = Number(t);
  if (t.length === 2 && n >= 10 && n <= 29) return `20${n} Syllabus`;
  if (t.length === 4 && n >= 2010 && n <= 2099) return `${n} Syllabus`;
  return null;
}

/**
 * slug → subtitle map, covering only lanes whose (subject, code) pair
 * appears more than once in the registry.
 *
 * The registry-field fallback engages ONLY when the derived qualifiers are
 * empty or collide inside their group — the two cases the slug tail cannot
 * settle honestly on its own: a CIE AS lane and its A-Level sibling (same
 * syllabus code, nothing after the subject — the level splits them) and
 * syllabus-year republications (same board, level and code — the registry's
 * syllabus year splits them). Every other lane keeps the plain qualifier.
 */
export function duplicateVariants<T extends VariantKeyable>(courses: T[]): Map<string, string> {
  const groups = new Map<string, T[]>();
  for (const c of courses) {
    const key = `${c.subject.toLowerCase()}|${c.code}`;
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  const out = new Map<string, string>();
  for (const lanes of groups.values()) {
    if (lanes.length < 2) continue;
    const levelSplits = new Set(lanes.map((c) => c.level)).size > 1;
    const subs = lanes.map((c) => ({ lane: c, sub: variantSubtitle(c.slug, c.subject) }));
    const counts = new Map<string, number>();
    for (const { sub } of subs) counts.set(sub, (counts.get(sub) ?? 0) + 1);
    for (const { lane, sub } of subs) {
      let label = sub;
      if ((counts.get(sub) ?? 0) > 1) {
        if (levelSplits && lane.level) {
          label = lane.level + (sub ? ` ${sub}` : "");
        } else {
          label = syllabusYearLabel(lane.slug) ?? sub;
        }
      }
      if (label) out.set(lane.slug, label);
    }
  }
  return out;
}

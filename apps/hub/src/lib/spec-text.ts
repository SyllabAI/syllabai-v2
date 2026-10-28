/**
 * Display normalization for parsed-specification text (T-SPEC-AUDIT-1).
 *
 * The corpus stays spine-verbatim byte-exact (importSource pin law) — this is
 * a presentation-layer pass only. Every mapping below is evidenced by a
 * corpus-wide census of all 106 curricula (char frequency + unanimous
 * sentence context), not guessed:
 *
 *   U+0007 (BEL)      bullet/checkbox glyph of the printed layout — pure
 *                     decoration scattered into prose by PDF extraction
 *   U+F0FC            Wingdings ✓  (tick glyph)
 *   U+F8EB/F8EC/F8ED  left pieces of large parentheses → "("
 *   U+F8F6/F8F7/F8F8  right pieces of large parentheses → ")"
 *   U+F084 → ≤        14/14 contexts ("F ≤ μR", "0 ≤ e ≤ 1", "n ≤ 3")
 *   U+F085 → ≥         3/3 contexts ("px² + qx + r ≥ 0")
 *   U+F083 → ≥         the >, <, ≥, ≤ symbol quartet (2.8A)
 *   U+F061 → ↦        3/3 contexts ("f : x ↦ …" function notation)
 *   U+F075/F072       orphaned vector-arrow decorations (their letters were
 *                     already lost to layout scatter) — stripped
 *   U+F026            derivative dot: "x ˙" / "˙˙ x" scatter → combining
 *                     dot above (U+0307) / double dot (U+0308)
 *   U+00AD            line-break soft hyphen from extraction → stripped
 *   U+00A0/U+202F     NBSP → space; zero-width chars → stripped
 *   `                 stray accent artifact → stripped
 *   "| x |"           modulus bars padded by extraction → "|x|"
 *                     (guarded: the pair content must be a short operand;
 *                     conditional-probability bars like "P(B | A)" pass
 *                     through untouched)
 *   "  " / edges      multi-space collapsed; leading/trailing space trimmed
 *
 * Anything not in the map that survives extraction renders verbatim; no
 * printed wording is ever altered beyond these artifact classes.
 */

const PUA_MAP: Record<string, string> = {
  "\uF0FC": "✓",
  "\uF8EB": "(",
  "\uF8EC": "(",
  "\uF8ED": "(",
  "\uF8F6": ")",
  "\uF8F7": ")",
  "\uF8F8": ")",
  "\uF084": "≤",
  "\uF085": "≥",
  "\uF083": "≥",
  "\uF061": "↦",
};

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF]/g;
const NBSP = /[\u00A0\u202F]/g;
const SOFT_HYPHEN = /\u00AD/g;
const MULTI_SPACE = / {2,}/g;
/** Modulus pair guard: inner is a short operand — no parens/commas/semicolons/
 *  equals (those mean conditional-probability bars or cross-formula pairing). */
const PADDED_PIPES = /\|([^|(),;=]{1,48})\|/g;

export function normalizeSpecText(raw: string): string {
  if (!raw) return raw;
  let s = raw;
  // derivative-dot scatter (order matters: double dot before the letter first)
  s = s.replace(/\uF026\uF026\s+([A-Za-z])/g, "$1\u0308");
  s = s.replace(/([A-Za-z])\s+\uF026/g, "$1\u0307");
  // evidenced PUA glyphs, then any residual PUA (extraction tofu) stripped
  s = s.replace(/[\uE000-\uF8FF]/g, (ch) => PUA_MAP[ch] ?? "");
  // control chars (incl. the U+0007 bullet scatter), soft hyphens, NBSP, zero-width
  s = s.replace(CONTROL, "").replace(SOFT_HYPHEN, "");
  s = s.replace(NBSP, " ").replace(ZERO_WIDTH, "");
  // stray accent artifact
  s = s.replace(/`/g, "");
  // modulus-bar padding: "| x |" → "|x|" (never touches unmatched pipes)
  s = s.replace(PADDED_PIPES, (_m, inner: string) => `|${inner.trim()}|`);
  // extraction spacing scatter
  s = s.replace(MULTI_SPACE, " ").trim();
  return s;
}

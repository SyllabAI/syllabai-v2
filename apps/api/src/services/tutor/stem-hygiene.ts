/**
 * Stem hygiene — the deterministic, zero-write text law behind run-004
 * proposal #1 (operator trace 1a144e5e55662125, "I asked for a full paper 2
 * … Do you see the problem?").
 *
 * PROBLEM OF RECORD: the past-paper bank's draft stems carry PDF-extraction
 * furniture that served verbatim on the tutor's deterministic cards:
 *   - the examiner write-in warning ("DO NOT WRITE IN THIS AREA") — measured
 *     118 of 186 past-paper rows / 201 occurrences (census 2026-10-16, the
 *     June 2019 4CH1/2C card alone carried 22);
 *   - math-mode markup leaks from the digitizer — "$ \mathrm{C H_{3} C O O H}
 *     $"-shaped runs — measured 167 stem rows and 79 QP/MS chunks (the same
 *     class the operator reported in answers — run-004 proposal #5, absorbed
 *     here at the source: the model copies what its context shows);
 *   - printed paper front matter baked into stems ("Answer ALL questions.",
 *     the cross-in-a-box instruction line) — measured 46 rows;
 *   - dot-leader runs — 1 row.
 *
 * LAWS (evidence-cited, precision-first — every rule traces to measured rows
 * and none may damage legitimate content):
 *   R1  write-in furniture runs collapse (they never appear as question
 *       content);
 *   R2  dot-leader runs drop;
 *   R3  math-mode runs UNWRAP to plain chemistry glyphs, content-preserving:
 *       arrows/relations keep their meaning (⇌, →, ×, ≈, Δ), group braces and
 *       pure formatting commands drop, sub/superscript digits inline, and
 *       single-glyph spacing collapses INSIDE the unwrapped run only; a run
 *       whose residual still carries a backslash (markup the app cannot
 *       honestly render) drops entirely — dropped markup, never mangled
 *       content;
 *   R5  printed front-matter sentences strip (line-anchored);
 *   whitespace hygiene always; the function FAILS OPEN (a result that would
 *   be empty returns the input unchanged — a stem is the row's identity, an
 *   empty projection serves nothing).
 *
 * DELIBERATELY REJECTED by the census: a trailing letter-soup strip (the
 * flattened displayed-formulae tails). The same shape carries MCQ OPTION
 * LINES ("A 1 B 3 C 9 D 37" — measured on real rows), which are content;
 * tail-stripping cannot tell them apart. Formula soup is lane #2/#3
 * territory (stem rebuild from the clean per-question QP chunks / figures).
 *
 * Zero DB writes: this is a SERVE-side projection. The stored rows of
 * record are untouched (their repair is the operator-gated lane #2).
 */

/** R1 — the examiner write-in warning, with its repetition runs. */
const WRITE_IN_FURNITURE = /(?:\s*DO NOT WRITE IN THIS (?:AREA|MARGIN)\s*)+/gi;

/** R2 — PDF dot-leader runs. */
const DOT_LEADERS = /\s*\.{4,}\s*/g;

/** R3 — a math-mode run: $…$ (uncapped — runs are bounded by the $ pair). */
const MATH_RUN = /\$([^$]+)\$/g;

/** R3 — display-math delimiters: $$…$$ (the digitizer emits LaTeX display
 * delimiters; measured live on a 4CH0/1C QP chunk: "is\n$$ $ 2 \mathrm…").
 * Matched WITH content first; then adjacent/whitespace-separated empty
 * delimiter pairs collapse — both BEFORE the paired-run pass, because a
 * failed match at a "$" followed by another "$" shifts the whole pairing
 * one dollar over and strands real runs unmatched (the sequential-pairing
 * blind spot, measured). */
const DISPLAY_MATH = /\$\$([^$]*?)\$\$/g;
const EMPTY_DOLLARS = /\$\s*\$/g;

/** R3 inner — pure formatting commands (no content value). */
const MATH_FORMATTING =
  /\\(?:mathrm|text|displaystyle|left|right|big|quad)\b|\\[;,]|\\ce\s*/g;

/** R3 inner — content-bearing commands map to their glyphs (never dropped). */
const MATH_GLYPHS: Array<[RegExp, string]> = [
  [/\\rightleftharpoons/g, "\u21cc"],
  [/\\rightarrow/g, "\u2192"],
  [/\\times/g, "\u00d7"],
  [/\\approx/g, "\u2248"],
  [/\\Delta/g, "\u0394"],
];

/** R3 inner — group braces; then any residual command drops; then sub/sup
 * digits inline ("_{3}" → "3"). */
const MATH_BRACES = /[{}]/g;
const MATH_RESIDUAL_COMMAND = /\\([A-Za-z]+)\s*/g;
const MATH_SCRIPT = /[_^]\s*-?\d+/g;

/** R3 de-spacer — the digitizer mangles formulae into spaced single glyphs
 * ("H 2 ( g)"). Collapses INSIDE unwrapped runs only, never sentence text. */
function deSpaceGlyphs(s: string): string {
  let out = s;
  for (let i = 0; i < 3; i++) {
    out = out
      .replace(/([A-Za-z0-9]) (?=[A-Za-z0-9])/g, "$1") // "H 2" → "H2", "3 C" → "3C"
      .replace(/([A-Za-z0-9]) (?=[)\]},.;:!?])/g, "$1") // "2 )" → "2)"
      .replace(/([([]) (?=[A-Za-z0-9])/g, "$1") // "( g" → "(g"
      .replace(/([A-Za-z0-9]) (?=[([])/g, "$1"); // "2 (" → "2("
  }
  return out;
}

/** R5 — printed front matter (line-anchored; never question content). */
const FRONT_MATTER: Array<[RegExp, string]> = [
  [/^\s*Answer ALL questions\.?\s*$/gim, ""],
  [/^\s*Write your answers in the spaces provided\.?\s*$/gim, ""],
  [/^Some questions must be answered with a cross in a box\b[^\n]*$/gim, ""],
];

/** The R3 pass over a whole text: display delimiters first, then paired
 * runs, then the bare-markup lines. Shared by both projections. */
function unwrapMath(s: string): string {
  return unwrapBareMathLines(
    s
      .replace(DISPLAY_MATH, (_, inner: string) => unwrapMathRun(inner))
      .replace(EMPTY_DOLLARS, " ")
      .replace(MATH_RUN, (_, inner: string) => unwrapMathRun(inner)),
  );
}

/** R3b — bare markup lines: LaTeX commands the digitizer emitted WITHOUT any
 * math delimiters ("2 \mathrm {C l} ^ {-} \rightarrow …", measured live on a
 * 4CH0 QP chunk). Line-scoped: only lines that actually carry a markup
 * command are cleaned (glyph map → formatting commands → braces → residual →
 * script digits — never the glyph-join pass, prose can share the line); a
 * line whose residual still carries a backslash
 * (unknown markup, e.g. \frac) fails open verbatim — never mangled. */
function unwrapBareMathLines(s: string): string {
  return s
    .split("\n")
    .map((line) => {
      if (!/\\[A-Za-z]/.test(line)) return line;
      let t = line;
      for (const [re, glyph] of MATH_GLYPHS) t = t.replace(re, glyph);
      t = t
        .replace(MATH_FORMATTING, "")
        .replace(MATH_BRACES, "")
        .replace(MATH_RESIDUAL_COMMAND, "")
        .replace(MATH_SCRIPT, (m) => m.replace(/[^0-9-]/g, ""))
        .replace(/ {2,}/g, " ")
        .trim();
      // NO de-spacer here: a bare-markup line can carry prose ("a line with
      // \frac{a}{b} stays verbatim" measured), and the glyph-join pass eats
      // word boundaries. Spaced glyphs ("Cl 2") stay legible; damaged prose
      // is not acceptable at any legibility gain.
      if (t.includes("\\")) return line;
      return t;
    })
    .join("\n");
}

/** Unwrap one $…$ run to plain glyphs. A run whose residual still carries a
 * backslash is markup we cannot honestly render → dropped (space). */
function unwrapMathRun(inner: string): string {
  let plain = String(inner);
  for (const [re, glyph] of MATH_GLYPHS) plain = plain.replace(re, glyph);
  plain = plain
    .replace(MATH_FORMATTING, "")
    .replace(MATH_BRACES, "")
    .replace(MATH_RESIDUAL_COMMAND, "")
    .replace(MATH_SCRIPT, (m) => m.replace(/[^0-9-]/g, ""))
    .replace(/ {2,}/g, " ")
    .trim();
  if (plain.includes("\\")) return " ";
  return ` ${deSpaceGlyphs(plain)} `;
}

/** Whitespace hygiene (always applied, never counted as a junk hit). */
function tidy(s: string): string {
  return s
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{2,}/g, "\n")
    .replace(/ +\n/g, "\n")
    .trim();
}

/**
 * The full stem law — the question-stem projection (bank bands, fetch rows).
 * Idempotent; fails open on an empty result.
 */
export function hygienicStem(input: string): string {
  let s = String(input ?? "");
  s = s.replace(WRITE_IN_FURNITURE, " ");
  s = s.replace(DOT_LEADERS, " ");
  s = unwrapMath(s);
  for (const [re, to] of FRONT_MATTER) s = s.replace(re, to);
  s = tidy(s);
  return s === "" ? String(input ?? "") : s;
}

/**
 * The evidence law — chunk content at the tutor's evidence projection
 * (KA-RAG merge): the math-mode class only. Chunk content of record is
 * furniture-clean (measured: 0 write-in hits across 3,172 QP/MS chunks), so
 * R1/R2/R5 have no measured trigger here; R3 is the class the model was
 * copying into answers (proposal #5's evidence). KG nodes and the learner's
 * own words never pass through this module.
 */
export function hygienicEvidenceText(input: string): string {
  return tidy(unwrapMath(String(input ?? "")));
}

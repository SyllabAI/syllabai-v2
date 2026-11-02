/**
 * math-keyboard.ts — T-MG-INK-9. The maths keyboard of record for the
 * math text box editor: a faithful rebuild of MathsGenie's equation
 * keyboard, EXTRACTED from their production math-field's virtual
 * keyboard (mathsgenie.co.uk paper viewer, 2026-11-02 — MathLive
 * `ML__keyboard`, 136 keycaps over 4 layers read from the live DOM:
 * every key's aria-label, insertion template and layer/tab metadata
 * captured verbatim; see docs/MG-INK-UX-PARITY-SPEC.md §5).
 *
 * PURE MODULE: no DOM, no React — the census data and the insert maths
 * live here so bun test can pin every key (the keyboard UI in
 * ./MathKeyboard.tsx only renders this).
 *
 * INSERT LAW: MG's templates use MathLive placeholder syntax (`#@` =
 * the selection/operand slot, `#?` = the fill-next slot). Our editor is
 * a LaTeX textarea, so each key carries an `insert` string adapted to
 * plain LaTeX (braces pre-balanced) plus an optional `caret` offset
 * (the position inside `insert` where the text cursor lands; null =
 * end). MG's verbatim template is kept on `mg` for the census; tests
 * pin both.
 */

export interface MgKeyboardKey {
  /** Displayed glyph(s), MG's keycap text. Dual-shift keys carry
   * "ab" (unshifted a, shifted b) — MG's aria convention, e.g. "<≤". */
  label: string;
  /** What the unshifted key inserts (plain LaTeX, braces balanced). */
  insert: string;
  /** Caret offset inside `insert` after insertion; null/undefined = end. */
  caret?: number | null;
  /** Shifted variant, for keys MG gives a shift form (`<≤`, `([`, `qQ`). */
  shift?: { label: string; insert: string; caret?: number | null };
  /** MG's verbatim aria-label (the census pin; defaults to `label`). */
  aria?: string;
  /** MG's verbatim insertion template (the census pin). */
  mg?: string;
}

export interface MgKeyboardLayer {
  id: "numeric" | "symbols" | "letters" | "greek";
  /** The tab glyph, MG's exact switcher text. */
  tab: string;
  /** The layer's name, MG's data-tooltip. */
  name: string;
  rows: MgKeyboardKey[][];
}

const D = (label: string, insert: string, extra: Partial<MgKeyboardKey> = {}): MgKeyboardKey => ({
  label,
  insert,
  ...extra,
});

// The insert positions below are the offsets of the fill slots inside
// each adapted template (caret = where the learner types next).
const FRAC = "\\frac{}{}";          // caret 5 — numerator
const SQRT = "\\sqrt{}";            // caret 6
const ABS = "\\mathrm{abs}\\left(\\right)";   // caret before \right
const EXP = "\\exp\\left(\\right)";           // caret before \right
const VERT = "\\left\\vert\\right\\vert";     // caret before \right
const NORM = "\\left\\Vert\\right\\Vert";     // caret before \right
const ABS_CARET = ABS.indexOf("\\right");
const EXP_CARET = EXP.indexOf("\\right");
const VERT_CARET = VERT.indexOf("\\right");
const NORM_CARET = NORM.indexOf("\\right");
const INTEGRAL = "\\int_{0}^{\\infty}\\!\\,\\mathrm{d}x";
const INTEGRAL_CARET = "\\int_{0}^{\\infty}\\!".length; // before \,\mathrm{d}x

export const MG_KB_LAYERS: MgKeyboardLayer[] = [
  {
    id: "numeric",
    tab: "123",
    name: "Numeric",
    rows: [
      [
        D("x", "x", { mg: "x", aria: "x" }),
        D("n", "n", { mg: "n", aria: "n" }),
        D("7", "7", { mg: "7", aria: "7" }),
        D("8", "8", { mg: "8", aria: "8" }),
        D("9", "9", { mg: "9", aria: "9" }),
        D("÷", FRAC, { caret: FRAC.indexOf("{") + 1,
          mg: "\\frac{#@}{#?}", aria: "÷" }),
        D("𝑒", "\\exponentialE", { mg: "\\exponentialE", aria: "\\exponentialE" }),
        D("𝑖", "\\imaginaryI", { mg: "\\imaginaryI", aria: "\\imaginaryI" }),
        D("π", "\\pi", { mg: "\\pi", aria: "\\pi" }),
      ],
      [
        D("<", "<", { shift: { label: "≤", insert: "\\le" }, mg: "<", aria: "<≤" }),
        D(">", ">", { shift: { label: "≥", insert: "\\ge" }, mg: ">", aria: ">≥" }),
        D("4", "4", { mg: "4", aria: "4" }),
        D("5", "5", { mg: "5", aria: "5" }),
        D("6", "6", { mg: "6", aria: "6" }),
        D("×", "\\cdot", { mg: "\\cdot", aria: "×" }),
        D("x²", "^{2}", { mg: "#@^2}", aria: "#@^2}" }),
        D("x^□", "^{\\square}", { caret: 2, mg: "#@^{#0}}", aria: "#@^{#0}}" }),
        D("√", SQRT, { caret: SQRT.indexOf("{") + 1, mg: "\\sqrt{#0}", aria: "\\sqrt{#0}" }),
      ],
      [
        D("(", "(", { shift: { label: "[", insert: "[" }, mg: "(", aria: "([" }),
        D(")", ")", { shift: { label: "]", insert: "]" }, mg: ")", aria: ")]" }),
        D("1", "1", { mg: "1", aria: "1" }),
        D("2", "2", { mg: "2", aria: "2" }),
        D("3", "3", { mg: "3", aria: "3" }),
        D("−", "-", { mg: "-", aria: "-" }),
        D("∫₀^∞dx", INTEGRAL, { caret: INTEGRAL_CARET,
          mg: "\\int^{\\infty}_{0}\\!#?\\,\\mathrm{d}x",
          aria: "\\int^{\\infty}_{0}\\!#?\\,\\mathrm{d}x" }),
        D("∀", "\\forall", { mg: "\\forall", aria: "\\forall" }),
      ],
      [
        D("0", "0", { mg: "0", aria: "0" }),
        D(".", ".", { mg: ".", aria: "." }),
        D("=", "=", { shift: { label: "≠", insert: "\\neq" }, mg: "=", aria: "=≠" }),
        D("+", "+", { mg: "+", aria: "+" }),
      ],
    ],
  },
  {
    id: "symbols",
    tab: "∞≠∈",
    name: "Symbols",
    rows: [
      [
        D("sin", "\\sin", { mg: "\\sin", aria: "\\sin" }),
        D("ln", "\\ln", { mg: "\\ln", aria: "\\ln" }),
        D("abs□", ABS, { caret: ABS_CARET, mg: "\\mathrm{abs}\\left(#0\\right)",
          aria: "\\mathrm{abs}\\left(#0\\right)" }),
        D("→", "\\rightarrow", { mg: "\\rightarrow", aria: "\\rightarrow" }),
        D("∃", "\\exists", { mg: "\\exists", aria: "\\exists" }),
        D("∈", "\\in", { mg: "\\in", aria: "\\in" }),
        D("∪", "\\cup", { mg: "\\cup", aria: "\\cup" }),
        D("□⃗", "\\overrightarrow{\\square}", { caret: 16,
          mg: "\\overrightarrow{#@}", aria: "\\overrightarrow{#@}" }),
        D("lim", "\\lim_{\\square}", { caret: 6, mg: "\\lim_{#?}", aria: "\\lim_{#?}" }),
        D("𝑒", "\\exponentialE", { mg: "\\exponentialE", aria: "\\exponentialE" }),
      ],
      [
        D("cos", "\\cos", { mg: "\\cos", aria: "\\cos" }),
        D("log", "\\log", { mg: "\\log", aria: "\\log" }),
        D("|□|", VERT, { caret: VERT_CARET, mg: "\\left\\vert#0\\right\\vert",
          aria: "\\left\\vert#0\\right\\vert" }),
        D("←", "\\larr", { mg: "\\larr", aria: "\\larr" }),
        D("∀", "\\forall", { mg: "\\forall", aria: "\\forall" }),
        D("∋", "\\ni", { mg: "\\ni", aria: "\\ni" }),
        D("∩", "\\cap", { mg: "\\cap", aria: "\\cap" }),
        D("x̄", "\\overline{\\square}", { caret: 10, mg: "\\overline{#@}", aria: "\\overline{#@}" }),
        D("∫", "\\int", { mg: "\\int", aria: "\\int" }),
        D("π", "\\pi", { mg: "\\pi", aria: "\\pi" }),
      ],
      [
        D("tan", "\\tan", { mg: "\\tan", aria: "\\tan" }),
        D("exp□", EXP, { caret: EXP_CARET, mg: "\\exp\\left(#0\\right)",
          aria: "\\exp\\left(#0\\right)" }),
        D("‖□‖", NORM, { caret: NORM_CARET, mg: "\\left\\Vert#0\\right\\Vert",
          aria: "\\left\\Vert#0\\right\\Vert" }),
        D("⇔", "\\lrArr", { mg: "\\lrArr", aria: "\\lrArr" }),
        D("|", "\\vert", { mg: "\\vert", aria: "\\vert" }),
        D("□^ᶜ", "^{\\complement}", { mg: "#@^{\\complement}", aria: "#@^{\\complement}" }),
        D("⊂", "\\subset", { mg: "\\subset", aria: "\\subset" }),
        D("□′", "^{\\prime}", { mg: "#@^{\\prime}", aria: "#@^{\\prime}" }),
        D("d", "\\mathrm{d}", { mg: "\\mathrm{d}", aria: "\\mathrm{d}" }),
        D("∞", "\\infty", { mg: "\\infty", aria: "\\infty" }),
      ],
      [
        D(",", ",", { mg: ",", aria: "," }),
        D(":", "\\colon", { mg: "\\colon", aria: "\\colon" }),
        D("⋅", "\\cdot", { mg: "\\cdot", aria: "\\cdot" }),
      ],
    ],
  },
  {
    id: "letters",
    tab: "abc",
    name: "Roman Letters",
    rows: [
      [
        D("1", "1", { mg: "1", aria: "1" }),
        D("2", "2", { mg: "2", aria: "2" }),
        D("3", "3", { mg: "3", aria: "3" }),
        D("4", "4", { mg: "4", aria: "4" }),
        D("5", "5", { mg: "5", aria: "5" }),
        D("6", "6", { mg: "6", aria: "6" }),
        D("7", "7", { mg: "7", aria: "7" }),
        D("8", "8", { mg: "8", aria: "8" }),
        D("9", "9", { shift: { label: "(", insert: "(" }, mg: "9", aria: "9(" }),
        D("0", "0", { shift: { label: ")", insert: ")" }, mg: "0", aria: "0)" }),
      ],
      ...["qwertyuiop", "asdfghjkl", "zxcvbnm"].map((row) =>
        row.split("").map<MgKeyboardKey>((ch) => D(ch, ch, {
          shift: { label: ch.toUpperCase(), insert: ch.toUpperCase() },
          mg: ch, aria: ch + ch.toUpperCase(),
        })),
      ),
      [
        D("−", "-", { mg: "-", aria: "-" }),
        D("+", "+", { mg: "+", aria: "+" }),
        D("=", "=", { shift: { label: "≠", insert: "\\neq" }, mg: "=", aria: "=≠" }),
        D("?", "?", { mg: "?", aria: "?" }),
        D(",", ",", { mg: ",", aria: "," }),
        D(".", ".", { mg: ".", aria: "." }),
      ],
    ],
  },
  {
    id: "greek",
    tab: "αβγ",
    name: "Greek Letters",
    rows: [
      ["\\varphi", "\\varsigma", "\\epsilon", "\\rho", "\\tau", "\\upsilon", "\\theta", "\\iota", "\\omicron", "\\pi"].map((t) => D(greekGlyph(t), t, { mg: t, aria: greekGlyph(t) })),
      ["\\alpha", "\\sigma", "\\delta", "\\phi", "\\gamma", "\\eta", "\\xi", "\\kappa", "\\lambda"].map((t) => D(greekGlyph(t), t, { mg: t, aria: greekGlyph(t) })),
      ["\\zeta", "\\chi", "\\psi", "\\omega", "\\beta", "\\nu", "\\mu"].map((t) => D(greekGlyph(t), t, { mg: t, aria: greekGlyph(t) })),
      ["\\varepsilon", "\\vartheta", "\\varkappa", "\\varpi", "\\varrho"].map((t) => D(greekGlyph(t), t, { mg: t, aria: greekGlyph(t) })),
    ],
  },
];

/** The display glyph for a Greek-letter LaTeX name (the keycap text). */
function greekGlyph(tex: string): string {
  const map: Record<string, string> = {
    "\\varphi": "φ", "\\varsigma": "ς", "\\epsilon": "ϵ", "\\rho": "ρ",
    "\\tau": "τ", "\\upsilon": "υ", "\\theta": "θ", "\\iota": "ι",
    "\\omicron": "ο", "\\pi": "π", "\\alpha": "α", "\\sigma": "σ",
    "\\delta": "δ", "\\phi": "φ", "\\gamma": "γ", "\\eta": "η",
    "\\xi": "ξ", "\\kappa": "κ", "\\lambda": "λ", "\\zeta": "ζ",
    "\\chi": "χ", "\\psi": "ψ", "\\omega": "ω", "\\beta": "β",
    "\\nu": "ν", "\\mu": "μ", "\\varepsilon": "ε", "\\vartheta": "ϑ",
    "\\varkappa": "ϰ", "\\varpi": "ϖ", "\\varrho": "ϱ",
  };
  return map[tex] ?? tex;
}

export interface KeyInsertion {
  text: string;
  /** Offset inside `text` for the caret after insertion; null = end. */
  caret: number | null;
}

/** What a key inserts in the current shift state (the Keyboard's law). */
export function keyInsertion(key: MgKeyboardKey, shifted: boolean): KeyInsertion {
  if (shifted && key.shift) return { text: key.shift.insert, caret: key.shift.caret ?? null };
  return { text: key.insert, caret: key.caret ?? null };
}

/** Insert `ins` into a textarea value at the given selection: the
 * selection (if any) is REPLACED (MG's `#@` slot semantics — the
 * operand slot is the selection), the caret lands at ins.caret
 * (relative to the insertion) or at the end of the insertion. */
export function insertIntoValue(
  value: string,
  selStart: number,
  selEnd: number,
  ins: KeyInsertion,
): { value: string; caret: number } {
  const start = Math.min(Math.max(selStart, 0), value.length);
  const end = Math.min(Math.max(selEnd, start), value.length);
  const next = value.slice(0, start) + ins.text + value.slice(end);
  const caret = start + (ins.caret === null ? ins.text.length : Math.min(ins.caret, ins.text.length));
  return { value: next, caret };
}

/** Backspace at the current selection: drop the selection, or the
 * grapheme-ish character before the caret (surrogate pair aware). */
export function backspaceValue(value: string, selStart: number, selEnd: number): { value: string; caret: number } {
  if (selStart !== selEnd) {
    return { value: value.slice(0, selStart) + value.slice(selEnd), caret: selStart };
  }
  if (selStart === 0) return { value, caret: 0 };
  const before = value.slice(0, selStart);
  const last = [...before].pop() ?? "";
  return { value: before.slice(0, before.length - last.length) + value.slice(selEnd), caret: selStart - last.length };
}

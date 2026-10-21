/**
 * T-BOOK-005 — the chemistry validation module for the rail widgets
 * (eq-builder balance/state/charge laws + num-stepper unit/sig-fig laws).
 *
 * Pure, zero-dependency, hub-local (the widget lane's validation is a UI
 * concern; the authored pack of record stays the law — these checks verify
 * the LEARNER'S assembly against the chemistry, never rewrite it).
 *
 * Grammar of record (the v3 corpus carries native Unicode: H₂O, Cu²⁺, ⇌):
 *   - species tokens: "[2 ]Formula[ (state)][ charge]" — charge forms
 *     "Cu2+" / "SO4 2-" / "Cl-" / "OH-"; electrons "e-" / "2e-" are legal
 *     species with empty atom tallies (half-equations).
 *   - arrows: -> | → | ⇌ | <=>
 *   - state symbols: (s) (l) (g) (aq)
 */

export interface EqSpecies {
  coeff: number;
  /** element counts, e.g. { H: 2, O: 1 }; {} for electrons */
  atoms: Record<string, number>;
  /** formal charge (Cu2+ → +2, SO4 2- → -2, e- → -1; 0 for neutrals) */
  charge: number;
  /** "s" | "l" | "g" | "aq" | null */
  state: string | null;
  /** the raw token as assembled (display fidelity) */
  raw: string;
  /** true for the electron pseudo-species (half-equations) */
  electron: boolean;
}

export interface ParsedEquation {
  ok: boolean;
  lhs: EqSpecies[];
  rhs: EqSpecies[];
  reversible: boolean;
  error: string | null;
}

const STATE_RE = /\((s|l|g|aq)\)\s*$/i;
const CHARGE_RE = /(\d*)([+-])$/; // trailing sign, digits before it = magnitude
const COEFF_RE = /^(\d+)\s*/;

/** Unicode digit/sign normalisation — String.indexOf cannot key multi-byte
 *  chars, and the v3 corpus carries H₂O / Cu²⁺ / ⇌ natively. */
const UNICODE_MAP: Record<string, string> = {
  "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4",
  "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9",
  "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4",
  "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
  "⁺": "+", "⁻": "-",
};
function deUnicode(s: string): string {
  // ¹²³ live in Latin-1 (U+00B9/B2/B3) — OUTSIDE the ⁰(U+2070)–⁹(U+2079) run
  return s.replace(/[₀-₉⁰¹²³⁴-⁹⁺⁻]/g, (d) => UNICODE_MAP[d] ?? d);
}

/** One species token → EqSpecies, or null when unparseable. */
export function parseSpeciesToken(rawToken: string): EqSpecies | null {
  const raw = deUnicode(rawToken.trim());
  if (raw === "") return null;
  let rest = raw;

  // state symbol first ((aq) etc. must not be confused by the ")" in charge forms)
  let state: string | null = null;
  const stateMatch = rest.match(STATE_RE);
  if (stateMatch) {
    state = stateMatch[1]!.toLowerCase();
    rest = rest.slice(0, stateMatch.index).trim();
  }

  // trailing charge: "Cu2+" "SO4 2-" "Cl-" — digits immediately before the
  // sign are the magnitude (a formula never ends in a bare digit-sign pair)
  let charge = 0;
  const chargeMatch = rest.match(CHARGE_RE);
  if (chargeMatch) {
    const magnitude = chargeMatch[1] === "" ? 1 : Number.parseInt(chargeMatch[1]!, 10);
    charge = chargeMatch[2] === "+" ? magnitude : -magnitude;
    rest = rest.slice(0, chargeMatch.index).trim();
  }

  // leading stoichiometric coefficient ("2Cl-" → coeff 2)
  let coeff = 1;
  const coeffMatch = rest.match(COEFF_RE);
  if (coeffMatch) {
    coeff = Number.parseInt(coeffMatch[1]!, 10);
    rest = rest.slice(coeffMatch[0].length).trim();
  }

  if (rest === "") return null;

  // the electron pseudo-species (2e-, e-): no atom tally of its own
  if (/^e$/i.test(rest)) {
    return { coeff, atoms: {}, charge: charge === 0 ? -1 : charge, state, raw, electron: true };
  }

  const atoms = countAtoms(rest);
  if (atoms == null) return null;
  return { coeff, atoms, charge, state, raw, electron: false };
}

/** Element counts of one formula — expands (groups) one level deep, which
 *  covers the IGCSE set (Ca(NO3)2, Al2(SO4)3, Mg(OH)2…). */
export function countAtoms(formula: string): Record<string, number> | null {
  const totals: Record<string, number> = {};
  const expand = (s: string, mult: number): boolean => {
    if (s === "") return false;
    let i = 0;
    while (i < s.length) {
      const ch = s[i]!;
      if (ch === "(") {
        const depthEnd = matchingParen(s, i);
        if (depthEnd == null) return false;
        const inner = s.slice(i + 1, depthEnd);
        let j = depthEnd + 1;
        let num = "";
        while (j < s.length && /\d/.test(s[j]!)) {
          num += s[j]!;
          j += 1;
        }
        if (!expand(inner, mult * (num === "" ? 1 : Number.parseInt(num, 10)))) return false;
        i = j;
        continue;
      }
      if (!/[A-Z]/.test(ch)) return false; // must start an element symbol
      let sym = ch;
      i += 1;
      while (i < s.length && /[a-z]/.test(s[i]!)) {
        sym += s[i]!;
        i += 1;
      }
      let num = "";
      while (i < s.length && /\d/.test(s[i]!)) {
        num += s[i]!;
        i += 1;
      }
      totals[sym] = (totals[sym] ?? 0) + (num === "" ? 1 : Number.parseInt(num, 10)) * mult;
    }
    return true;
  };
  return expand(formula, 1) ? totals : null;
}

function matchingParen(s: string, open: number): number | null {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === "(") depth += 1;
    else if (s[i] === ")") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return null;
}

const ARROW_RE = /\s*(?:->|→|⇌|<=>)\s*/;

/** Split one equation side into species tokens. THE LAW: a "+" is a
 *  separator iff the character immediately before it is whitespace or the
 *  string start — a charge sign attaches directly to its species
 *  ("Cu2+"), so "Cu2+ + 2e-" splits into ["Cu2+", "2e-"], never at the
 *  charge sign. (String.split("+") is FORBIDDEN here — it shreds ions.) */
function splitSpecies(side: string): string[] {
  const s = side.trim();
  const tokens: string[] = [];
  let current = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (ch === "+" && (i === 0 || /\s/.test(s[i - 1]!))) {
      if (current.trim() !== "") tokens.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim() !== "") tokens.push(current.trim());
  return tokens;
}

/** Parse a full equation string into species sides. */
export function parseEquation(eq: string): ParsedEquation {
  const fail = (error: string): ParsedEquation => ({
    ok: false,
    lhs: [],
    rhs: [],
    reversible: false,
    error,
  });
  const normalised = deUnicode(eq);
  const reversible = normalised.includes("⇌") || normalised.includes("<=>");
  const parts = normalised.split(ARROW_RE).filter((p) => p.trim() !== "");
  if (parts.length !== 2) return fail("expected exactly one arrow (→ / ⇌ / ->)");
  const side = (s: string): EqSpecies[] | null => {
    const out: EqSpecies[] = [];
    for (const token of splitSpecies(s)) {
      const sp = parseSpeciesToken(token);
      if (sp == null) return null;
      out.push(sp);
    }
    return out;
  };
  const lhs = side(parts[0]!);
  const rhs = side(parts[1]!);
  if (lhs == null || rhs == null) return fail("a species token failed to parse");
  return { ok: true, lhs, rhs, reversible, error: null };
}

/** Atom-count balance: Σ atoms left == Σ atoms right (coeff × formula). */
export function atomBalance(parsed: ParsedEquation): { balanced: boolean; detail: string } {
  const tally = (species: EqSpecies[]): Record<string, number> => {
    const t: Record<string, number> = {};
    for (const sp of species)
      for (const [el, n] of Object.entries(sp.atoms)) t[el] = (t[el] ?? 0) + n * sp.coeff;
    return t;
  };
  const l = tally(parsed.lhs);
  const r = tally(parsed.rhs);
  const elements = new Set([...Object.keys(l), ...Object.keys(r)]);
  const diffs: string[] = [];
  for (const el of elements) {
    const a = l[el] ?? 0;
    const b = r[el] ?? 0;
    if (a !== b) diffs.push(`${el}: ${a} ≠ ${b}`);
  }
  return { balanced: diffs.length === 0, detail: diffs.join("; ") || "all elements balance" };
}

/** Charge balance: Σ charge·coeff left == right (ionic equations' law). */
export function chargeBalance(parsed: ParsedEquation): { balanced: boolean; detail: string } {
  const sum = (species: EqSpecies[]) => species.reduce((acc, sp) => acc + sp.charge * sp.coeff, 0);
  const l = sum(parsed.lhs);
  const r = sum(parsed.rhs);
  return {
    balanced: l === r,
    detail: l === r ? `charges balance (${l})` : `charge left ${l} ≠ right ${r}`,
  };
}

/** State-symbol completeness: every species carries (s)/(l)/(g)/(aq). */
export function statesComplete(parsed: ParsedEquation): { complete: boolean; missing: number } {
  const missing = [...parsed.lhs, ...parsed.rhs].filter((sp) => sp.state == null).length;
  return { complete: missing === 0, missing };
}

export interface EqVerdict {
  parsed: boolean;
  matchesTarget: boolean;
  atoms: { balanced: boolean; detail: string };
  charges: { balanced: boolean; detail: string };
  states: { complete: boolean; missing: number };
}

/** Normalise an equation for target comparison: de-unicode, unify arrows,
 *  canonicalise the species separator spacing (" + "), collapse whitespace.
 *  The authored target is the law. */
export function normalizeEquation(eq: string): string {
  return deUnicode(eq)
    .replace(/⇌|<=>|⟶|→/g, "->")
    .replace(/\s*\+\s*/g, " + ")
    .replace(/\s*->\s*/g, " -> ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The full verdict triple for the eq-builder widget — atoms, charges,
 *  states, each its own chip (the T-BOOK-005 chemistry value-add). */
export function verdictFor(assembled: string, target: string): EqVerdict {
  const parsed = parseEquation(assembled);
  const matches = parsed.ok && normalizeEquation(assembled) === normalizeEquation(target);
  return {
    parsed: parsed.ok,
    matchesTarget: matches,
    atoms: parsed.ok ? atomBalance(parsed) : { balanced: false, detail: parsed.error ?? "not parsed" },
    charges: parsed.ok ? chargeBalance(parsed) : { balanced: false, detail: "not parsed" },
    states: parsed.ok ? statesComplete(parsed) : { complete: false, missing: 0 },
  };
}

// ── num-stepper: numeric / unit / sig-fig validation ─────────────────────────

/** Significant figures of a number string: leading zeros never significant;
 *  with a decimal point present, trailing zeros ARE (0.00240 → 3, 2.400 → 4);
 *  bare-integer trailing zeros counted by the documented IGCSE convention
 *  (2400 → 4). */
export function sigFigs(input: string): number {
  const digits = input.trim().replace(/^[+-]/, "").replace(/[^\d]/g, "");
  if (digits === "") return 0;
  const first = digits.search(/[1-9]/);
  if (first === -1) return 0; // zero of any precision — not a sig-fig check target
  return digits.length - first;
}

export interface NumericCheckOpts {
  /** accepted answer (number or numeric string) */
  answer: number | string;
  /** absolute tolerance; default 1e-9 */
  tolerance?: number;
  /** required unit(s) — any alternate accepted (the ms_accepts pattern) */
  units?: string[];
  /** expected significant figures (absent/0 = not checked) */
  sigFigs?: number;
}

export interface NumericVerdict {
  ok: boolean;
  /** which law failed — feedback targets the CONCEPT, not the keypress */
  law: "value" | "unit" | "sigfigs" | "format" | null;
  detail: string;
}

/** The num-stepper check: format → value → unit → sig-figs (that order —
 *  a mis-formatted number has no meaningful value verdict). Accepts
 *  standard/scientific input: 0.005, 5e-3, 5×10^⁻3. */
export function checkNumeric(input: string, opts: NumericCheckOpts): NumericVerdict {
  const cleaned = deUnicode(input.trim())
    .replace(/,/g, "")
    .replace(/[×x]\s*10\s*\^?/i, "e");
  const m = cleaned.match(/^([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)\s*(.*)$/);
  if (!m) return { ok: false, law: "format", detail: "not a number" };
  const value = Number.parseFloat(m[1]!);
  const unit = (m[2] ?? "").trim();
  const expected =
    typeof opts.answer === "number" ? opts.answer : Number.parseFloat(String(opts.answer).trim());
  if (!Number.isFinite(expected)) return { ok: false, law: "value", detail: "authored answer is not numeric" };
  const tol = opts.tolerance ?? 1e-9;
  const within = Math.abs(value - expected) <= Math.max(tol, Math.abs(expected) * 1e-9);
  if (!within) return { ok: false, law: "value", detail: "value out of tolerance" };
  if (opts.units && opts.units.length > 0) {
    if (unit === "") return { ok: false, law: "unit", detail: "unit missing" };
    const norm = (u: string) => u.replace(/\s+/g, "").replace(/\^/g, "").toLowerCase();
    if (!opts.units.some((u) => norm(u) === norm(unit)))
      return { ok: false, law: "unit", detail: `unit "${unit}" not accepted` };
  }
  if (opts.sigFigs && opts.sigFigs > 0) {
    const got = sigFigs(m[1]!);
    if (got !== opts.sigFigs)
      return { ok: false, law: "sigfigs", detail: `expected ${opts.sigFigs} sig-figs, got ${got}` };
  }
  return { ok: true, law: null, detail: "correct" };
}

/** The table-fill / sort-match string check: trim, collapse inner spaces,
 *  case-insensitive compare against the accept list (ms_accepts law). */
export function matchesAny(input: string, accepts: string[]): boolean {
  const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
  const i = norm(input);
  return accepts.some((a) => norm(a) === i);
}

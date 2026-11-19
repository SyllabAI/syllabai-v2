/**
 * calc-models.ts — T-MG-CALC-2 phase A: the ONE model registry.
 *
 * Extracted VERBATIM from mathsgenie.co.uk's served bundles (evidence:
 * T-MG-CALC-2 evidence_map.bundle_extraction_20261117; the chase card).
 * MG ships an in-house ClassWiz simulator with three models, a
 * level-driven default and per-model skins/app-masks/shift-legends;
 * this registry is OUR copy of that data so the whole keypad, skin and
 * app mask derive from ONE source of truth.
 *
 * The three CW models share one keyboard (device-true — the fx-83GT CW /
 * fx-85GT CW / fx-991 CW differ in shell/solar/shift colour and feature
 * flags, not in key positions), so the component renders ONE CW grid
 * dressed by the model's skin.
 *
 * EXAM HONESTY: the app mask lists the apps MG's HOME menu shows per
 * model (verbatim), but `implementedApps` carries OUR phase-A truth —
 * only Calculate exists; every other app renders the staged-rollout
 * notice MG itself shows ("This app isn't on the simulator yet.").
 */

export type CalcModelId = "fx-83gt-cw" | "fx-85gt-cw" | "fx-991cw";

export type CalcVarName = "A" | "B" | "C" | "D" | "E" | "F" | "x" | "y" | "z";

/** Per-model shift overrides (MG verbatim). The DATA rides the registry;
 * the phase-B dispatch wires the BEHAVIOUR per model in the component:
 * fx-83GT/85GT CW — SHIFT+x² inserts the recurring-decimal entry (the
 * device-true ■̇ key: press SHIFT, then x², then the repeating digits) and
 * SHIFT+×10ˣ carries OUR structural "," binding (MG's sheet extracted
 * null for that slot — phase B claims the null for the binary-function
 * comma, a documented deviation, same posture as the digitSeparator
 * default); fx-991 CW — SHIFT+x² = log, SHIFT+( = =, SHIFT+×10ˣ = i
 * (MG verbatim), with the complex numbers the i implies. The one-shot
 * consume law is preserved (every override inserts through the engine's
 * consume wrapper). */
export interface CalcShiftOverrides {
  sq: { label: string; glyph?: string; aria: string } | null;
  lparen: { label: string; aria: string } | null;
  d9: { label: string; aria: string } | null;
}

export interface CalcAppEntry {
  name: string;
  label: string;
}

export interface CalcModel {
  id: CalcModelId;
  label: string;
  skin: { shiftColor: "blue" | "gold"; solar: boolean };
  /** the HOME menu list, verbatim per model (MG's apps arrays l and a). */
  apps: CalcAppEntry[];
  /** OUR phase-A implementation truth — the only app that launches. */
  implementedApps: string[];
  shiftOverrides: CalcShiftOverrides;
  features: { recurringDecimal: boolean; complex: boolean; engineerSymbol: boolean };
}

const SHIFT_OVERRIDES_GT: CalcShiftOverrides = {
  sq: { label: "■̇", glyph: "recur", aria: "Recurring decimal" },
  lparen: null,
  d9: { label: ",", aria: "Comma" },
};

const SHIFT_OVERRIDES_991: CalcShiftOverrides = {
  sq: { label: "log", aria: "Logarithm base 10" },
  lparen: { label: "=", aria: "Equals" },
  d9: { label: "i", aria: "Imaginary unit" },
};

/** MG's apps array `l` (fx-83GT CW / fx-85GT CW) — verbatim order. */
const APPS_GT: CalcAppEntry[] = [
  { name: "calculate", label: "Calculate" },
  { name: "statistics", label: "Statistics" },
  { name: "table", label: "Table" },
  { name: "ratio", label: "Ratio" },
  { name: "mathBox", label: "Math Box" },
];

/** MG's apps array `a` (fx-991 CW) — verbatim order; 11 names verified
 * from the bundle (a 12th registration is truncated in the extraction —
 * the chase card's evidence_map notes it; it lands if a re-extract reads it). */
const APPS_991: CalcAppEntry[] = [
  { name: "calculate", label: "Calculate" },
  { name: "statistics", label: "Statistics" },
  { name: "distribution", label: "Distribution" },
  { name: "spreadsheet", label: "Spreadsheet" },
  { name: "table", label: "Table" },
  { name: "equation", label: "Equation" },
  { name: "inequality", label: "Inequality" },
  { name: "complex", label: "Complex" },
  { name: "baseN", label: "Base-N" },
  { name: "matrix", label: "Matrix" },
  { name: "vector", label: "Vector" },
];

export const CALC_MODELS: Record<CalcModelId, CalcModel> = {
  "fx-83gt-cw": {
    id: "fx-83gt-cw",
    label: "fx-83GT CW",
    skin: { shiftColor: "blue", solar: false },
    apps: APPS_GT,
    // phase C: the enabled set matches MG exactly — Calculate, Statistics, Table
    implementedApps: ["calculate", "statistics", "table"],
    shiftOverrides: SHIFT_OVERRIDES_GT,
    features: { recurringDecimal: true, complex: false, engineerSymbol: false },
  },
  "fx-85gt-cw": {
    id: "fx-85gt-cw",
    label: "fx-85GT CW",
    skin: { shiftColor: "blue", solar: true },
    apps: APPS_GT,
    // phase C: the enabled set matches MG exactly — Calculate, Statistics, Table
    implementedApps: ["calculate", "statistics", "table"],
    shiftOverrides: SHIFT_OVERRIDES_GT,
    features: { recurringDecimal: true, complex: false, engineerSymbol: false },
  },
  "fx-991cw": {
    id: "fx-991cw",
    label: "fx-991 CW",
    skin: { shiftColor: "gold", solar: true },
    apps: APPS_991,
    // phase C: the enabled set matches MG exactly — Calculate, Statistics, Table
    implementedApps: ["calculate", "statistics", "table"],
    shiftOverrides: SHIFT_OVERRIDES_991,
    features: { recurringDecimal: false, complex: true, engineerSymbol: true },
  },
};

export const CALC_MODEL_IDS = Object.keys(CALC_MODELS) as CalcModelId[];

/**
 * MG's level→model map (their `n` object, verbatim): GCSE/KS2 train on
 * the fx-83GT CW; A-level/IGCSE/international specs allow the fx-991 CW.
 * Unknown or absent level → the fx-83GT CW (the GCSE default — the
 * device class the UK exam standard names).
 */
export const MODEL_BY_LEVEL: Record<string, CalcModelId> = {
  gcse: "fx-83gt-cw",
  ks2: "fx-83gt-cw",
  "a-level": "fx-991cw",
  "as-level": "fx-991cw",
  igcse: "fx-991cw",
  "international-a-level": "fx-991cw",
  "international-as-level": "fx-991cw",
};

/** longest-prefix match against a course slug like "igcse-chemistry-19". */
export function defaultModelForLevel(levelHint?: string | null): CalcModelId {
  if (levelHint) {
    const hint = levelHint.toLowerCase();
    for (const level of ["international-a-level", "international-as-level", "a-level", "as-level", "igcse", "gcse", "ks2"]) {
      if (hint.includes(level)) return MODEL_BY_LEVEL[level];
    }
  }
  return "fx-83gt-cw";
}

/** The CATALOG's device-true categories (MG: catalog/{trig, angle,
 * function-analysis, numeric, probability, statistics, other}), each
 * listing the functions OUR engine actually evaluates — an item is only
 * listed when selecting it inserts an atom the engine supports; a
 * category with no supported items renders the honest empty line. The
 * key payloads are VALID engine CalcKeys (fn-insert validates inside
 * the engine against its own FN_NAMES set). */
export interface CatalogItem {
  label: string;
  aria: string;
  key:
    | { k: "fn-insert"; name: string }
    | { k: "sq" }
    | { k: "cube" }
    | { k: "recip" }
    | { k: "pct" }
    | { k: "pi" }
    | { k: "econst" }
    | { k: "ans" }
    // phase B: the factorial postfix (the probability category's x!) and
    // the argument comma (the device exposes it through the [Other] menu
    // when the key sheet carries no dedicated binding)
    | { k: "fact" }
    | { k: "comma" };
}

export interface CatalogCategory {
  name: string;
  label: string;
  items: CatalogItem[];
}

const fn = (label: string, aria: string, name: string): CatalogItem => ({ label, aria, key: { k: "fn-insert", name } });
const pf = (label: string, aria: string, op: "sq" | "cube" | "recip" | "pct"): CatalogItem => ({ label, aria, key: { k: op } });

export const CALC_CATALOG: CatalogCategory[] = [
  {
    name: "trig",
    label: "Trig",
    items: [
      fn("sin", "Sine", "sin"),
      fn("cos", "Cosine", "cos"),
      fn("tan", "Tangent", "tan"),
      fn("sin⁻¹", "Arcsine", "asin"),
      fn("cos⁻¹", "Arccosine", "acos"),
      fn("tan⁻¹", "Arctangent", "atan"),
    ],
  },
  {
    name: "angle",
    label: "Angle",
    items: [], // ° ' " DMS entry is out of the phase-A engine vocabulary
  },
  {
    name: "function-analysis",
    label: "Function analysis",
    items: [], // d/dx, ∫ — out of the exam class
  },
  {
    name: "numeric",
    label: "Numeric",
    items: [
      fn("√", "Square root", "√"),
      fn("³√", "Cube root", "³√"),
      pf("x²", "Square", "sq"),
      pf("x³", "Cube", "cube"),
      pf("x⁻¹", "Reciprocal", "recip"),
      pf("%", "Percent", "pct"),
      fn("log", "Logarithm base 10", "log"),
      fn("ln", "Natural logarithm", "ln"),
      fn("10ˣ", "Ten to the power", "10^"),
      fn("eˣ", "Exponential", "e^"),
      fn("Abs", "Absolute value", "abs"),
    ],
  },
  {
    name: "probability",
    label: "Probability",
    items: [
      // phase B: the engine gained the exact nPr/nCr (binary, comma
      // argument) and the factorial postfix — the exam-class core of the
      // device's probability inventory. Ran#/RanInt stay out (a random
      // value would break the engine's determinism pins — no fake
      // determinism for an RNG).
      fn("nPr", "Permutations nPr", "nPr"),
      fn("nCr", "Combinations nCr", "nCr"),
      { label: "x!", aria: "Factorial", key: { k: "fact" } },
    ],
  },
  {
    name: "statistics",
    label: "Statistics",
    items: [], // the Statistics app is phase C, not a catalog insert
  },
  {
    name: "other",
    label: "Other",
    items: [
      { label: "π", aria: "Pi", key: { k: "pi" } },
      { label: "e", aria: "Euler constant", key: { k: "econst" } },
      { label: "Ans", aria: "Ans", key: { k: "ans" } },
      // phase B: the argument comma — the CW manual's [Other] menu law
      // ("functions and symbols that can be input with the calculator
      // keys can also be input using the [Other] menu") puts it here on
      // the 991, whose ×10ˣ shift carries i instead
      { label: ",", aria: "Comma", key: { k: "comma" } },
      fn("sinh", "Hyperbolic sine", "hsin"),
      fn("cosh", "Hyperbolic cosine", "hcos"),
      fn("tanh", "Hyperbolic tangent", "htan"),
      fn("sinh⁻¹", "Arc hyperbolic sine", "hasin"),
      fn("cosh⁻¹", "Arc hyperbolic cosine", "hacos"),
      fn("tanh⁻¹", "Arc hyperbolic tangent", "hatan"),
    ],
  },
];

/** The MG-shaped persisted state (the component's localStorage record).
 * Shape mirrors MG's `genie-calculator-v1` (evidence: the chase card's
 * live_probes) with OUR additions marked. NEVER holds history/Ans —
 * the exam-honesty law survives the ruling (settings and model choice
 * persist; calculations do not).
 *
 * PHASE B: the settings dialog writes THIS record — the io row gained
 * MG's mathI/DecimalI (our reading: the polar r∠θ display family for
 * complex results, per the shift-legends pin) and Number Format is the
 * ONE union MG's row exposes (Norm 1/Norm 2/Fix n/Sci n) replacing the
 * phase-A norm-only pair. The record stays shared across model switches
 * and survives reloads (one versioned key, the load/save validation
 * below repairs anything malformed to the defaults). */
export type CalcNumberFormat =
  | { kind: "norm"; variant: 1 | 2 }
  | { kind: "fix"; digits: number }
  | { kind: "sci"; digits: number };

export interface CalcPersisted {
  v: 1;
  /** our addition: the keypad posture ("cw" default | "classic"). */
  layout: "cw" | "classic";
  /** our addition: the manual model override; null → level default. */
  model: CalcModelId | null;
  settings: {
    io: "mathI/mathO" | "mathI/DecimalI";
    angle: "deg" | "rad" | "gra";
    numberFormat: CalcNumberFormat;
    fraction: "improper" | "mixed";
    decimalMark: "." | ",";
    digitSeparator: boolean;
  };
}

export const PERSIST_KEY = "syllab-calculator-v1";

export function defaultPersisted(): CalcPersisted {
  return {
    v: 1,
    layout: "cw",
    model: null,
    settings: {
      io: "mathI/mathO",
      angle: "deg",
      numberFormat: { kind: "norm", variant: 2 },
      fraction: "improper",
      decimalMark: ".",
      digitSeparator: false,
    },
  };
}

/** reads + validates the persisted record; anything malformed → the
 * defaults (never a throw — a broken record must not brick the overlay). */
export function loadPersisted(): CalcPersisted {
  const fallback = defaultPersisted();
  try {
    if (typeof window === "undefined" || !window.localStorage) return fallback;
    const raw = window.localStorage.getItem(PERSIST_KEY);
    if (!raw) return fallback;
    const p = JSON.parse(raw) as Partial<CalcPersisted>;
    if (!p || typeof p !== "object") return fallback;
    const out = fallback;
    if (p.layout === "cw" || p.layout === "classic") out.layout = p.layout;
    if (p.model && p.model in CALC_MODELS) out.model = p.model;
    const s = p.settings;
    if (s && typeof s === "object") {
      if (s.angle === "deg" || s.angle === "rad" || s.angle === "gra") out.settings.angle = s.angle;
      if (s.io === "mathI/mathO" || s.io === "mathI/DecimalI") out.settings.io = s.io;
      const nf = s.numberFormat;
      if (nf && typeof nf === "object") {
        if (nf.kind === "norm" && (nf.variant === 1 || nf.variant === 2)) {
          out.settings.numberFormat = { kind: "norm", variant: nf.variant };
        } else if (nf.kind === "fix" && typeof nf.digits === "number" && Number.isInteger(nf.digits) && nf.digits >= 0 && nf.digits <= 9) {
          out.settings.numberFormat = { kind: "fix", digits: nf.digits };
        } else if (nf.kind === "sci" && typeof nf.digits === "number" && Number.isInteger(nf.digits) && nf.digits >= 1 && nf.digits <= 9) {
          out.settings.numberFormat = { kind: "sci", digits: nf.digits };
        }
      }
      if (s.fraction === "improper" || s.fraction === "mixed") out.settings.fraction = s.fraction;
      if (s.decimalMark === "." || s.decimalMark === ",") out.settings.decimalMark = s.decimalMark;
      if (typeof s.digitSeparator === "boolean") out.settings.digitSeparator = s.digitSeparator;
    }
    return out;
  } catch {
    return fallback;
  }
}

export function savePersisted(p: CalcPersisted): void {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(PERSIST_KEY, JSON.stringify(p));
  } catch {
    // a full/quota'd storage must never break the overlay
  }
}

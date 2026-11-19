/**
 * ScientificCalculator.tsx — T-MG-CALC run-001: the viewer-level exam
 * calculator overlay (task card L1/L7/L8); T-MG-CALC-2 phase A: the CW
 * device shell — HOME app grid, OK-dial navigation, numbered SETTINGS,
 * CATALOG, VARIABLE ⇄x, FUNCTION f(x), TOOLS, the level-driven model
 * picker (fx-83GT CW / fx-85GT CW / fx-991 CW from ONE registry), and
 * the classic/compact toggle that keeps the run-001 keypad byte-identical.
 *
 * PLACEMENT LAW (L1): ONE instance at the VIEWER level — a sibling of
 * the ink host wrapper, spanning split view; opened from the pane tool
 * strips. It docks bottom-right ABOVE the ink toolbar and UNDER the
 * sovereign swap pill (z-law: pill z-50 > this z-40 > toolbar z-30;
 * run-003: the overlay rides at 55, above the mobile pill).
 *
 * EXAM HONESTY (L2, amended by the chase ruling): every keystroke flows
 * through the pure engine (pressKey) — no history beyond the live Ans
 * chain, no calculation persistence. The SETTINGS/MODEL record (which
 * keys persist in localStorage) never carries a calculation.
 *
 * GESTURE LAW (L7): the root carries data-gesture-exclude (the seam
 * marker) AND relays two-finger touch streams onto the visible ink
 * canvas — the paper's shared PaperGestures coordinator then pans/
 * zooms the PAPER exactly as if the fingers were on the page. A single
 * finger on the overlay is a calculator press, never ink.
 *
 * KEYBOARD PARITY (L8): digits, . + - * / ( ) ^, Enter =, Backspace
 * DEL, Delete AC, Escape closes, s/c/t trig, r √, a Ans, p π — on the
 * calc screen. On a shell screen (HOME/…) the arrows + Enter drive the
 * device-true OK-dial instead.
 *
 * CW SHELL NAVIGATION LAW (captured live on MG, evidence: the chase
 * card): the HOME menu is driven by the ▲▼ cursor + OK; direct clicks
 * ALSO launch here (our a11y law — MG ignores clicks; run-003 receipt:
 * pointer-only surfaces were the BUG class).
 */

import katex from "katex";
import "katex/dist/katex.min.css";
import React, { useEffect, useMemo, useRef, useState } from "react";

import type { GesturePinchBridge } from "../ink/paperGestures";
import {
  bufferToTex,
  CalcError,
  formatNatural,
  initialCalcState,
  pressKey,
  type CalcDisplayFmt,
  type CalcKey,
  type CalcState,
  type CalcValue,
} from "./calc-engine";
import {
  buildNumberTable,
  SIMUL_UNKNOWN_NAMES,
  solvePolynomial,
  solveSimultaneous,
  stat1Var,
  stat2Var,
  statEntryToValue,
  TABLE_ROWS_BOTH,
  TABLE_ROWS_SINGLE,
  type PolyResult,
  type SimulResult,
  type Stat1Var,
  type Stat2Var,
  type TableType,
} from "./calc-apps";
import {
  CALC_CATALOG,
  CALC_MODELS,
  CALC_MODEL_IDS,
  defaultModelForLevel,
  loadPersisted,
  savePersisted,
  type CalcModelId,
  type CalcNumberFormat,
  type CalcPersisted,
  type CalcVarName,
} from "./calc-models";
import { qrEncode } from "./qr-encoder";

export interface ScientificCalculatorProps {
  open: boolean;
  onClose: () => void;
  /**
   * T-MG-CALC-2 phase A: the paper's level hint (the course slug —
   * "igcse-chemistry-19" etc.). Drives the model DEFAULT through MG's
   * own level→model map (gcse/ks2 → fx-83GT CW; a-level/igcse/
   * international → fx-991 CW). An explicit picker choice overrides it.
   */
  levelHint?: string;
  /**
   * T-MG-CALC run-002: the pane's populated pinch bridge (the SAME
   * GesturePlaneRef the viewer hands the QP pane). The L7 relay uses it
   * for SELECT-mode two-finger pinch over the overlay — in select mode
   * the coordinator does not own touches (they ride the native plane,
   * which a relayed synthetic stream cannot trigger), so the relay pans
   * the scroller directly and steps zoom through this bridge. Optional:
   * without it, select-mode pinch degrades to pan-only.
   */
  gesturePlane?: { current: GesturePinchBridge | undefined };
}

type ShellCmd = "home" | "settings" | "catalog" | "tools" | "vars" | "fns" | "off" | "back" | "qr";
type DialCmd = "up" | "down" | "ok" | "left" | "right";
type Screen =
  | "calc"
  | "home"
  | "settings"
  | "catalog"
  | "catalog-cat"
  | "vars"
  | "fns"
  | "tools"
  | "notice"
  | "qr"
  // T-MG-CALC-2 phase C: the Statistics and Table apps (the spec pin 5:
  // the ONLY new app surfaces — the exam-honest scope matches MG's
  // enabled set exactly; every other registered app keeps the notice).
  | "stat-type"
  | "stat-edit"
  | "stat-menu"
  | "stat-res"
  | "table-setup"
  | "table-res"
  // T-MG-CALC-2 phase D: the Equation app (the operator's exam-value
  // ruling; Simul Equation + Polynomial implemented, Solver pinned out —
  // its menu slot renders the staged-rollout notice, our honest fence)
  | "eq-menu"
  | "eq-unknowns"
  | "eq-coeff"
  | "eq-sol"
  | "eq-degree"
  | "eq-poly-coeff"
  | "eq-poly-sol";

interface KeyDef {
  label: string;
  aria: string;
  key: CalcKey | "mode" | "close-setup";
  /** a CW shell command (opens a screen / closes the overlay). */
  shell?: ShellCmd;
  /** a dial command (context-sensitive: engine cursor on calc, menu
   * cursor + select on a shell screen). */
  dial?: DialCmd;
  wide?: boolean;
  accent?: boolean;
  span?: number;
}

/** the run-001 classic posture — byte-identical behaviour behind the
 * layout toggle (the regression law). */
const GRID: KeyDef[][] = [
  [
    { label: "SHIFT", aria: "Shift", key: { k: "shift" }, accent: true },
    { label: "MODE", aria: "Mode setup", key: "mode", accent: true },
    { label: "◀", aria: "Cursor left", key: { k: "left" } },
    { label: "▶", aria: "Cursor right", key: { k: "right" } },
    { label: "DEL", aria: "Delete", key: { k: "del" } },
  ],
  [
    { label: "AC", aria: "All clear", key: { k: "ac" }, accent: true },
    { label: "x²", aria: "Square", key: { k: "sq" } },
    { label: "x³", aria: "Cube", key: { k: "cube" } },
    { label: "x■", aria: "Power", key: { k: "pow" } },
    { label: "x⁻¹", aria: "Reciprocal", key: { k: "recip" } },
  ],
  [
    { label: "√", aria: "Square root", key: { k: "sqrt" } },
    { label: "³√", aria: "Cube root", key: { k: "cbrt" } },
    { label: "log", aria: "Logarithm base 10", key: { k: "log" } },
    { label: "ln", aria: "Natural logarithm", key: { k: "ln" } },
    { label: "π", aria: "Pi", key: { k: "pi" } },
  ],
  [
    { label: "a b/c", aria: "Fraction", key: { k: "frac" } },
    { label: "10ˣ", aria: "Ten to the power", key: { k: "pow10" } },
    { label: "eˣ", aria: "Exponential", key: { k: "exp" } },
    { label: "(", aria: "Open paren", key: { k: "paren", p: "(" } },
    { label: ")", aria: "Close paren", key: { k: "paren", p: ")" } },
  ],
  [
    { label: "sin", aria: "Sine", key: { k: "trig", f: "sin" } },
    { label: "cos", aria: "Cosine", key: { k: "trig", f: "cos" } },
    { label: "tan", aria: "Tangent", key: { k: "trig", f: "tan" } },
    { label: "hyp", aria: "Hyperbolic", key: { k: "hyp" }, accent: true },
    { label: "ENG", aria: "Engineering notation", key: { k: "eng" } },
  ],
  [
    { label: "7", aria: "7", key: { k: "digit", d: "7" } },
    { label: "8", aria: "8", key: { k: "digit", d: "8" } },
    { label: "9", aria: "9", key: { k: "digit", d: "9" } },
    { label: "÷", aria: "Divide", key: { k: "op", op: "÷" } },
    { label: "Ans", aria: "Ans", key: { k: "ans" } },
  ],
  [
    { label: "4", aria: "4", key: { k: "digit", d: "4" } },
    { label: "5", aria: "5", key: { k: "digit", d: "5" } },
    { label: "6", aria: "6", key: { k: "digit", d: "6" } },
    { label: "×", aria: "Multiply", key: { k: "op", op: "×" } },
    { label: "(−)", aria: "Negate", key: { k: "neg" } },
  ],
  [
    { label: "1", aria: "1", key: { k: "digit", d: "1" } },
    { label: "2", aria: "2", key: { k: "digit", d: "2" } },
    { label: "3", aria: "3", key: { k: "digit", d: "3" } },
    { label: "−", aria: "Subtract", key: { k: "op", op: "-" } },
    { label: "%", aria: "Percent", key: { k: "pct" } },
  ],
  [
    { label: "0", aria: "0", key: { k: "digit", d: "0" } },
    { label: "·", aria: "Decimal point", key: { k: "digit", d: "." } },
    { label: "+", aria: "Add", key: { k: "op", op: "+" } },
    { label: "S⇔D", aria: "Toggle fraction decimal", key: { k: "sd" } },
    { label: "=", aria: "Equals", key: { k: "eq" }, accent: true },
  ],
];

/**
 * the CW device posture (phase A): the three registry models SHARE this
 * keyboard (device-true — the CW family differs in skin/shift colour
 * and features, not key positions). 7 columns; the A–F/x/y/z variable
 * keys interleave with the numeric block exactly as the device lays
 * them; EXE is the device's wide equals bar. The structural ³√/10ˣ/x³
 * functions live on SHIFT (√→³√, log→10ˣ, x²→x³ — the device law); the
 * dedicated keys MG's emulator carries are not duplicated.
 */
const CW_GRID: KeyDef[][] = [
  [
    { label: "SHIFT ⇧", aria: "Shift", key: { k: "shift" }, accent: true },
    { label: "⌂ HOME", aria: "Home", key: { k: "ac" }, shell: "home", accent: true },
    { label: "⇄x VARIABLE", aria: "Variable", key: { k: "ac" }, shell: "vars", accent: true },
    { label: "☰ SETTINGS", aria: "Settings", key: { k: "ac" }, shell: "settings", accent: true },
    { label: "▤ CATALOG", aria: "Catalog", key: { k: "ac" }, shell: "catalog", accent: true },
    { label: "••• TOOLS", aria: "Tools", key: { k: "ac" }, shell: "tools", accent: true },
    { label: "f(x) FUNCTION", aria: "Function", key: { k: "ac" }, shell: "fns", accent: true },
  ],
  [
    { label: "◀", aria: "Cursor left", key: { k: "left" }, dial: "left" },
    { label: "▲", aria: "Cursor up", key: { k: "ac" }, dial: "up" },
    { label: "OK", aria: "OK", key: { k: "ac" }, dial: "ok", accent: true },
    { label: "▼", aria: "Cursor down", key: { k: "ac" }, dial: "down" },
    { label: "▶", aria: "Cursor right", key: { k: "right" }, dial: "right" },
    { label: "↩ BACK", aria: "Back", key: { k: "ac" }, shell: "back" },
    { label: "⏻ OFF", aria: "Off", key: { k: "ac" }, shell: "off", accent: true },
  ],
  [
    { label: "x²", aria: "Square", key: { k: "sq" } },
    { label: "√", aria: "Square root", key: { k: "sqrt" } },
    { label: "x⁻¹", aria: "Reciprocal", key: { k: "recip" } },
    { label: "x■", aria: "Power", key: { k: "pow" } },
    { label: "×10ˣ", aria: "Times ten to the power", key: { k: "pow10" } },
    { label: "DEL", aria: "Delete", key: { k: "del" } },
    { label: "AC", aria: "All clear", key: { k: "ac" }, accent: true },
  ],
  [
    { label: "log", aria: "Logarithm base 10", key: { k: "log" } },
    { label: "ln", aria: "Natural logarithm", key: { k: "ln" } },
    { label: "Ans", aria: "Ans", key: { k: "ans" } },
    { label: "S⇔D", aria: "Toggle fraction decimal", key: { k: "sd" } },
    { label: "⇄", aria: "Toggle mixed improper", key: { k: "mixtoggle" } },
    { label: "(", aria: "Open paren", key: { k: "paren", p: "(" } },
    { label: ")", aria: "Close paren", key: { k: "paren", p: ")" } },
  ],
  [
    { label: "sin", aria: "Sine", key: { k: "trig", f: "sin" } },
    { label: "cos", aria: "Cosine", key: { k: "trig", f: "cos" } },
    { label: "tan", aria: "Tangent", key: { k: "trig", f: "tan" } },
    { label: "π", aria: "Pi", key: { k: "pi" } },
    { label: "7", aria: "7", key: { k: "digit", d: "7" } },
    { label: "8", aria: "8", key: { k: "digit", d: "8" } },
    { label: "9", aria: "9", key: { k: "digit", d: "9" } },
  ],
  [
    { label: "A", aria: "variable A", key: { k: "var", name: "A" } },
    { label: "4", aria: "4", key: { k: "digit", d: "4" } },
    { label: "B", aria: "variable B", key: { k: "var", name: "B" } },
    { label: "5", aria: "5", key: { k: "digit", d: "5" } },
    { label: "C", aria: "variable C", key: { k: "var", name: "C" } },
    { label: "6", aria: "6", key: { k: "digit", d: "6" } },
    { label: "÷", aria: "Divide", key: { k: "op", op: "÷" } },
  ],
  [
    { label: "D", aria: "variable D", key: { k: "var", name: "D" } },
    { label: "1", aria: "1", key: { k: "digit", d: "1" } },
    { label: "E", aria: "variable E", key: { k: "var", name: "E" } },
    { label: "2", aria: "2", key: { k: "digit", d: "2" } },
    { label: "F", aria: "variable F", key: { k: "var", name: "F" } },
    { label: "3", aria: "3", key: { k: "digit", d: "3" } },
    { label: "×", aria: "Multiply", key: { k: "op", op: "×" } },
  ],
  [
    { label: "x", aria: "variable x", key: { k: "var", name: "x" } },
    { label: "0", aria: "0", key: { k: "digit", d: "0" } },
    { label: "y", aria: "variable y", key: { k: "var", name: "y" } },
    { label: "·", aria: "Decimal point", key: { k: "digit", d: "." } },
    { label: "z", aria: "variable z", key: { k: "var", name: "z" } },
    { label: "−", aria: "Subtract", key: { k: "op", op: "-" } },
    { label: "+", aria: "Add", key: { k: "op", op: "+" } },
  ],
  [
    { label: "e", aria: "Euler constant", key: { k: "econst" } },
    { label: "%", aria: "Percent", key: { k: "pct" } },
    { label: "ENG", aria: "Engineering notation", key: { k: "eng" } },
    { label: "(−)", aria: "Negate", key: { k: "neg" } },
    { label: "QR", aria: "QR code of the result", key: { k: "ac" }, shell: "qr" },
    { label: "EXE", aria: "Execute", key: { k: "eq" }, accent: true, span: 2 },
  ],
];

const VAR_NAMES: CalcVarName[] = ["A", "B", "C", "D", "E", "F", "x", "y", "z"];

/** L8 — the desktop keyboard map (the component's parity pin rides it). */
export function keyFromKeyboard(k: string): CalcKey | null {
  if (/^[0-9]$/.test(k)) return { k: "digit", d: k };
  if (k === ".") return { k: "digit", d: "." };
  if (k === "+") return { k: "op", op: "+" };
  if (k === "-") return { k: "op", op: "-" };
  if (k === "*") return { k: "op", op: "×" };
  if (k === "/") return { k: "op", op: "÷" };
  if (k === "(") return { k: "paren", p: "(" };
  if (k === ")") return { k: "paren", p: ")" };
  if (k === "^") return { k: "pow" };
  if (k === "%") return { k: "pct" };
  if (k === "Enter" || k === "=") return { k: "eq" };
  if (k === "Backspace") return { k: "del" };
  if (k === "Delete") return { k: "ac" };
  if (k === "ArrowLeft") return { k: "left" };
  if (k === "ArrowRight") return { k: "right" };
  if (k === "s") return { k: "trig", f: "sin" };
  if (k === "c") return { k: "trig", f: "cos" };
  if (k === "t") return { k: "trig", f: "tan" };
  if (k === "r") return { k: "sqrt" };
  if (k === "a") return { k: "ans" };
  if (k === "p") return { k: "pi" };
  return null;
}

const ANGLE_FROM_SETTINGS = { deg: "DEG", rad: "RAD", gra: "GRA" } as const;

/**
 * the error-hint map (the .cw-error-hint law): every error class renders
 * a hint line under the message. Math/Syntax/Stack are raised by the
 * engine; Argument/Range stay in the vocabulary for completeness — the
 * engine raises no fake errors, so those lines simply never show until a
 * genuine raise site exists. The wording is OURS (the device's hint text
 * was not extractable from MG's bundle — no fabricated strings).
 */
const ERROR_HINTS: Record<"Math ERROR" | "Syntax ERROR" | "Stack ERROR" | "Argument ERROR" | "Range ERROR", string> = {
  "Math ERROR": "Check the values and ranges — a domain, a division by zero, or a result beyond ±9.999…×10^99.",
  "Syntax ERROR": "Check the structure and order of the calculation (misplaced operators, or a bare = / ,).",
  "Stack ERROR": "Too many nested levels — split the calculation into smaller parts.",
  "Argument ERROR": "Check the function's arguments (count and type).",
  "Range ERROR":
    "Check the range — Start ≤ End, Step ≠ 0, and the row limit (45 rows for f(x) or g(x), 30 for both).",
};

export function ScientificCalculator({ open, onClose, levelHint, gesturePlane }: ScientificCalculatorProps) {
  // ── the persisted record (settings + model choice + layout; NEVER a
  // calculation — the amended L2 law) ──
  const [persisted, setPersisted] = useState<CalcPersisted>(() => loadPersisted());
  const layout = persisted.layout;
  const modelId: CalcModelId = persisted.model ?? defaultModelForLevel(levelHint);
  const model = CALC_MODELS[modelId];

  // the engine's mount state seeds from the persisted record: the
  // numberFormat union → fix/sciDigits/normVariant, the fraction law,
  // and the model's complex feature (the 991CW's i path).
  const [state, setState] = useState<CalcState>(() => {
    const nf = persisted.settings.numberFormat;
    return initialCalcState(ANGLE_FROM_SETTINGS[persisted.settings.angle], {
      fix: nf.kind === "fix" ? nf.digits : 0,
      sciDigits: nf.kind === "sci" ? nf.digits : 0,
      normVariant: nf.kind === "norm" ? nf.variant : 2,
      fractionFormat: persisted.settings.fraction,
      complex: CALC_MODELS[persisted.model ?? defaultModelForLevel(levelHint)].features.complex,
    });
  });
  const [setupOpen, setSetupOpen] = useState(false);
  const [screen, setScreen] = useState<Screen>("calc");
  const [noticeApp, setNoticeApp] = useState<string>("");
  const [openCat, setOpenCat] = useState<number>(0);
  const [menuCursor, setMenuCursor] = useState(0);
  // ── phase C: the Statistics/Table session state. In-memory per the
  // device's retention table (launching another app discards the data;
  // the f/g defining equations stay in the persisted record they
  // already live in — the manual's own retention table).
  const [statKind, setStatKind] = useState<"1var" | "2var">("1var");
  const [statList, setStatList] = useState<{ x: string[]; y: string[] }>({ x: [], y: [] });
  const [statCell, setStatCell] = useState<{ col: 0 | 1; row: number }>({ col: 0, row: 0 });
  const [statEntry, setStatEntry] = useState("");
  const [statRes, setStatRes] = useState<Stat1Var | Stat2Var | null>(null);
  const [statReg, setStatReg] = useState<{ a: CalcValue; b: CalcValue; r: CalcValue } | null>(null);
  const [statTypeCursor, setStatTypeCursor] = useState(0);
  const [statMenuCursor, setStatMenuCursor] = useState(0);
  const [tableType, setTableType] = useState<TableType>("fg");
  const [tableRange, setTableRange] = useState<{ start: string; end: string; step: string }>({ start: "", end: "", step: "" });
  const [tableField, setTableField] = useState<"start" | "end" | "step">("start");
  const [tableRows, setTableRows] = useState<{ x: CalcValue; f: CalcValue | null; g: CalcValue | null }[] | null>(null);
  // ── phase D: the Equation session state (in-memory, the device's
  // retention table; the Coefficient Editors START at zero per the
  // manual's AC law — AC clears all the coefficients to zero). ──
  const [eqMenuCursor, setEqMenuCursor] = useState(0);
  const [eqUnknowns, setEqUnknowns] = useState<2 | 3 | 4>(2);
  const [eqUnkCursor, setEqUnkCursor] = useState(0);
  const [eqCoeffs, setEqCoeffs] = useState<string[][]>([]);
  const [eqCell, setEqCell] = useState({ row: 0, col: 0 });
  const [eqEntry, setEqEntry] = useState("");
  const [eqSolutions, setEqSolutions] = useState<SimulResult | null>(null);
  const [eqDegree, setEqDegree] = useState<2 | 3 | 4>(2);
  const [eqDegCursor, setEqDegCursor] = useState(0);
  const [eqPolyCoeffs, setEqPolyCoeffs] = useState<string[]>([]);
  const [eqComplexRoots, setEqComplexRoots] = useState(false); // the manual's initial default: Off
  const [eqResults, setEqResults] = useState<PolyResult | null>(null);
  const [appError, setAppError] = useState<string | null>(null);

  /** the manual's editor row caps: 160 rows for one column, 80 for two. */
  const STAT_MAX_ROWS: Record<"1var" | "2var", number> = { "1var": 160, "2var": 80 };

  const openStatEditor = (kind: "1var" | "2var") => {
    setStatKind(kind);
    setStatCell({ col: 0, row: 0 });
    setStatEntry("");
    setStatRes(null);
    setStatReg(null);
    setAppError(null);
    setScreen("stat-edit");
  };

  /** EXE on the editor: the entry commits (the cursor advances down —
   * the device's registration law); an empty line opens the results
   * menu (the device's post-editor menu). */
  const commitStatCell = () => {
    setAppError(null);
    if (!statEntry) return;
    try {
      statEntryToValue(statEntry);
    } catch {
      setAppError("Syntax ERROR");
      return;
    }
    if (statCell.row >= STAT_MAX_ROWS[statKind]) {
      setAppError("Range ERROR");
      return;
    }
    const col = statCell.col === 0 ? "x" : "y";
    setStatList((l) => {
      const next = [...l[col]];
      next[statCell.row] = statEntry;
      return { ...l, [col]: next };
    });
    setStatEntry("");
    setStatCell((c) => ({ ...c, row: c.row + 1 }));
  };

  /** the manual's editor law: DEL on the cursor row deletes the row
   * (with entry text it backspaces instead — routed in keyDefPress). */
  const deleteStatRow = () => {
    const col = statCell.col === 0 ? "x" : "y";
    setStatList((l) => ({ ...l, [col]: l[col].filter((_, i) => i !== statCell.row) }));
    setStatCell((c) => ({ ...c, row: Math.max(0, c.row - 1) }));
    setStatEntry("");
  };

  const runStatResults = (which: "1var" | "2var" | "reg") => {
    setAppError(null);
    setScreen("stat-res"); // the results screen opens; a data failure renders its error line there
    try {
      const xs = statList.x.map(statEntryToValue);
      if (which === "1var") {
        setStatRes(stat1Var(xs));
        setStatReg(null);
      } else {
        const ys = statList.y.map(statEntryToValue);
        const r2 = stat2Var(xs, ys);
        if (which === "reg") {
          if (!r2.reg) throw new CalcError("Math ERROR");
          setStatRes(null);
          setStatReg(r2.reg);
        } else {
          setStatRes(r2);
          setStatReg(null);
        }
      }
    } catch (e) {
      if (e instanceof CalcError) setAppError(e.cls);
      else throw e;
    }
  };

  const statMenuItems = () => {
    const items: { label: string; run: () => void }[] = [];
    if (statKind === "1var") items.push({ label: "1-Var Results", run: () => runStatResults("1var") });
    else {
      items.push({ label: "2-Var Results", run: () => runStatResults("2var") });
      items.push({ label: "Reg Results", run: () => runStatResults("reg") });
    }
    items.push({ label: "Back to editor", run: () => setScreen("stat-edit") });
    return items;
  };

  /** the results rows in the manual's CATALOG grouping order
   * (Summation → Mean/Var/Dev → Min/Max/Quartile) — OUR presentation
   * ruling; the value set is the manual's own. A null s²/s row is the
   * honest "Math ERROR" (n < 2 — the (n−1) denominator). */
  const statValueRows = (res: Stat1Var | Stat2Var): { label: string; v: CalcValue | null; aria: string }[] => [
    { label: "Σx", v: res.sumX, aria: "sum x" },
    { label: "Σx²", v: res.sumX2, aria: "sum x squared" },
    { label: "x̄", v: res.xBar, aria: "x mean" },
    { label: "σ²x", v: res.sig2X, aria: "population variance x" },
    { label: "σx", v: res.sigX, aria: "population std dev x" },
    { label: "s²x", v: res.s2X, aria: "sample variance x" },
    { label: "sx", v: res.sX, aria: "sample std dev x" },
    { label: "n", v: res.n, aria: "n" },
    { label: "min(x)", v: res.minX, aria: "min x" },
    { label: "Q1", v: res.q1, aria: "Q1" },
    { label: "Med", v: res.med, aria: "median" },
    { label: "Q3", v: res.q3, aria: "Q3" },
    { label: "max(x)", v: res.maxX, aria: "max x" },
    ...("sumY" in res
      ? [
          { label: "Σy", v: res.sumY, aria: "sum y" },
          { label: "Σy²", v: res.sumY2, aria: "sum y squared" },
          { label: "ȳ", v: res.yBar, aria: "y mean" },
          { label: "σ²y", v: res.sig2Y, aria: "population variance y" },
          { label: "σy", v: res.sigY, aria: "population std dev y" },
          { label: "s²y", v: res.s2Y, aria: "sample variance y" },
          { label: "sy", v: res.sY, aria: "sample std dev y" },
          { label: "min(y)", v: res.minY, aria: "min y" },
          { label: "max(y)", v: res.maxY, aria: "max y" },
          { label: "Σxy", v: res.sumXY, aria: "sum xy" },
        ]
      : []),
  ];

  /** the Table app's generation — the manual's range flow. The table
   * evaluates REAL-valued (complex: false — a complex cell value is the
   * honest Math ERROR); the manual's side-effect law (generation
   * changes variable x) stores the last x into the engine's store. */
  const executeTable = () => {
    setAppError(null);
    if (!tableRange.start || !tableRange.end || !tableRange.step) {
      setAppError("Range ERROR");
      return;
    }
    try {
      const start = statEntryToValue(tableRange.start);
      const end = statEntryToValue(tableRange.end);
      const step = statEntryToValue(tableRange.step);
      const t = buildNumberTable(state.fns, tableType, start, end, step, {
        angle: state.angle,
        ans: state.ans,
        vars: state.vars,
        complex: false,
      });
      setTableRows(t.rows);
      setState((s2) => ({ ...s2, vars: { ...s2.vars, x: t.lastX } }));
      setScreen("table-res");
    } catch (e) {
      if (e instanceof CalcError) setAppError(e.cls);
      else throw e;
    }
  };
  /** phase D: the Equation app flows. The Coefficient Editors start at
   * zero (the manual's AC law); EXE commits the cell and advances
   * row-major, and on the LAST cell it solves (the manual's flow:
   * input the coefficients, press EXE → the solution). */
  const openEqCoeff = (n: 2 | 3 | 4) => {
    setEqUnknowns(n);
    setEqCoeffs(Array.from({ length: n }, () => Array.from({ length: n + 1 }, () => "0")));
    setEqCell({ row: 0, col: 0 });
    setEqEntry("");
    setEqSolutions(null);
    setAppError(null);
    setScreen("eq-coeff");
  };
  const openEqPoly = (deg: 2 | 3 | 4) => {
    setEqDegree(deg);
    setEqPolyCoeffs(Array.from({ length: deg + 1 }, () => "0"));
    setEqCell({ row: 0, col: 0 });
    setEqEntry("");
    setEqResults(null);
    setAppError(null);
    setScreen("eq-poly-coeff");
  };
  const commitEqCell = () => {
    setAppError(null);
    const text = eqEntry || "0";
    try {
      statEntryToValue(text);
    } catch {
      setAppError("Syntax ERROR");
      return;
    }
    const grid = screen === "eq-poly-coeff";
    if (grid) {
      const last = eqCell.row === eqPolyCoeffs.length - 1;
      setEqPolyCoeffs((cs) => {
        const next = [...cs];
        next[eqCell.row] = text;
        return next;
      });
      setEqEntry("");
      if (last) solvePolyNow([...eqPolyCoeffs.slice(0, eqCell.row), text]);
      else setEqCell((c) => ({ ...c, row: c.row + 1 }));
    } else {
      const last = eqCell.row === eqUnknowns - 1 && eqCell.col === eqUnknowns;
      setEqCoeffs((cs) => {
        const next = cs.map((r) => [...r]);
        next[eqCell.row][eqCell.col] = text;
        return next;
      });
      setEqEntry("");
      if (last) {
        const rows = eqCoeffs.map((r, ri) => r.map((v, ci) => (ri === eqCell.row && ci === eqCell.col ? text : v)));
        solveSimulNow(rows);
      } else {
        // row-major advance
        setEqCell((c) => {
          const nc = c.col + 1;
          return nc > eqUnknowns ? { row: c.row + 1, col: 0 } : { row: c.row, col: nc };
        });
      }
    }
  };
  const solveSimulNow = (rowsText: string[][]) => {
    setAppError(null);
    try {
      const rows = rowsText.map((r) => r.map(statEntryToValue));
      setEqSolutions(solveSimultaneous(eqUnknowns, rows));
      setScreen("eq-sol");
    } catch (e) {
      if (e instanceof CalcError) setAppError(e.cls);
      else throw e;
    }
  };
  const solvePolyNow = (coeffsText: string[]) => {
    setAppError(null);
    try {
      const coeffs = coeffsText.map(statEntryToValue);
      setEqResults(solvePolynomial(eqDegree, coeffs, eqComplexRoots));
      setScreen("eq-poly-sol");
    } catch (e) {
      if (e instanceof CalcError) setAppError(e.cls);
      else throw e;
    }
  };
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const relayRef = useRef<{
    ids: Map<number, { x: number; y: number }>;
    active: boolean;
    canvas: HTMLCanvasElement | null;
    selectMode: boolean;
    scroller: HTMLElement | null;
    centroid: { x: number; y: number } | null;
    spread0: number;
  }>({ ids: new Map(), active: false, canvas: null, selectMode: false, scroller: null, centroid: null, spread0: 0 });

  /** run-003: timestamp of the last POINTER press on a keypad key — the
   * click-path guard (a mouse/touch press already acted on pointerdown;
   * its trailing click must not double-fire). */
  const pointerPressAt = useRef(0);

  useEffect(() => {
    savePersisted(persisted);
  }, [persisted]);

  // the model switch re-arms the engine's complex feature (the 991CW's
  // i/√ law flips with the registry's features — settings SHARED across
  // models: the persisted record never changes on a switch)
  useEffect(() => {
    setState((s) => (s.complex === model.features.complex ? s : { ...s, complex: model.features.complex }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelId]);

  const patchPersisted = (patch: Partial<CalcPersisted>) => setPersisted((p) => ({ ...p, ...patch }));
  const patchSettings = (patch: Partial<CalcPersisted["settings"]>) => setPersisted((p) => ({ ...p, settings: { ...p.settings, ...patch } }));

  const press = (k: CalcKey) => setState((s) => pressKey(s, k));

  /** phase B: the numberFormat union flows to BOTH layers at once —
   * the engine (the setup keys enforce Norm/Fix/Sci exclusivity) and
   * the persisted record (the settings dialog's row 3 reads it back). */
  const applyNumberFormat = (nf: CalcNumberFormat) => {
    patchSettings({ numberFormat: nf });
    if (nf.kind === "fix") press({ k: "setup-fix", fix: nf.digits });
    else if (nf.kind === "sci") press({ k: "setup-sci", digits: nf.digits });
    else press({ k: "setup-numformat", variant: nf.variant });
  };

  const launchApp = (name: string, label: string) => {
    if (name === "calculate" && model.implementedApps.includes("calculate")) {
      setScreen("calc");
      return;
    }
    // phase C: Statistics/Table launch into their app screens (the
    // manual's flows). The session data resets here per the device's
    // retention table (① returning to HOME and launching another app
    // discards the data; the f/g defining equations are retained).
    if (name === "statistics" && model.implementedApps.includes("statistics")) {
      openStatEditorProbe();
      return;
    }
    if (name === "table" && model.implementedApps.includes("table")) {
      setTableRange({ start: "", end: "", step: "" });
      setTableField("start");
      setTableRows(null);
      setAppError(null);
      setScreen("table-setup");
      return;
    }
    // phase D: the Equation app launches into its Equation menu (the
    // manual's flow). The session data resets here (the retention table
    // ①); the Complex Roots setting resets to Off (the manual's
    // initial default).
    if (name === "equation" && model.implementedApps.includes("equation")) {
      setEqUnknowns(2);
      setEqUnkCursor(0);
      setEqCoeffs([]);
      setEqCell({ row: 0, col: 0 });
      setEqEntry("");
      setEqSolutions(null);
      setEqDegree(2);
      setEqDegCursor(0);
      setEqPolyCoeffs([]);
      setEqComplexRoots(false);
      setEqResults(null);
      setEqMenuCursor(0);
      setAppError(null);
      setScreen("eq-menu");
      return;
    }
    // the staged-rollout notice — MG's own captured pattern (the chase
    // card's live probes); it doubles as our exam-honest fence
    setNoticeApp(label);
    setScreen("notice");
  };

  /** the Statistics launch: the type menu first (the manual's flow). */
  const openStatEditorProbe = () => {
    setStatList({ x: [], y: [] });
    setStatCell({ col: 0, row: 0 });
    setStatEntry("");
    setStatRes(null);
    setStatReg(null);
    setAppError(null);
    setStatTypeCursor(0);
    setScreen("stat-type");
  };

  /** the OK-dial: engine cursor keys on the calc screen; the device-true
   * cursor+select flow on the shell screens. On calc, ▲▼/OK REST INERT —
   * the device replays calculation history there, and our exam-honesty
   * law (L2) ships no history; the Ans chain is the only history. */
  const handleDial = (d: DialCmd) => {
    if (screen === "calc") {
      if (d === "left") press({ k: "left" });
      else if (d === "right") press({ k: "right" });
      return;
    }
    if (screen === "home") {
      const n = model.apps.length;
      if (d === "up") setMenuCursor((c) => (c + n - 1) % n);
      else if (d === "down") setMenuCursor((c) => (c + 1) % n);
      else if (d === "ok") launchApp(model.apps[menuCursor].name, model.apps[menuCursor].label);
      return;
    }
    if (screen === "catalog") {
      const n = CALC_CATALOG.length;
      if (d === "up") setMenuCursor((c) => (c + n - 1) % n);
      else if (d === "down") setMenuCursor((c) => (c + 1) % n);
      else if (d === "ok") {
        setOpenCat(menuCursor);
        setScreen("catalog-cat");
        setMenuCursor(0);
      }
      return;
    }
    if (screen === "catalog-cat") {
      const items = CALC_CATALOG[openCat].items;
      if (items.length === 0) return;
      if (d === "up") setMenuCursor((c) => (c + items.length - 1) % items.length);
      else if (d === "down") setMenuCursor((c) => (c + 1) % items.length);
      else if (d === "ok") {
        press(items[menuCursor].key as CalcKey);
        setScreen("calc");
      }
      return;
    }
    if (screen === "stat-type") {
      if (d === "up" || d === "down") setStatTypeCursor((c) => (c + 1) % 2);
      else if (d === "ok") openStatEditor(statTypeCursor === 0 ? "1var" : "2var");
      return;
    }
    if (screen === "stat-edit") {
      const len = statCell.col === 0 ? statList.x.length : statList.y.length;
      if (d === "up") setStatCell((c) => ({ ...c, row: Math.max(0, c.row - 1) }));
      else if (d === "down") setStatCell((c) => ({ ...c, row: Math.min(c.row + 1, len) }));
      else if (d === "left") setStatCell((c) => ({ ...c, col: 0 }));
      else if (d === "right" && statKind === "2var") setStatCell((c) => ({ ...c, col: 1 }));
      else if (d === "ok") {
        if (statEntry) commitStatCell();
        else setScreen("stat-menu");
      }
      return;
    }
    if (screen === "stat-menu") {
      const items = statMenuItems();
      if (d === "up") setStatMenuCursor((c) => (c + items.length - 1) % items.length);
      else if (d === "down") setStatMenuCursor((c) => (c + 1) % items.length);
      else if (d === "ok") items[statMenuCursor].run();
      return;
    }
    if (screen === "table-setup") {
      if (d === "left") setTableField((f) => (f === "step" ? "end" : "start"));
      else if (d === "right") setTableField((f) => (f === "start" ? "end" : "step"));
      else if (d === "ok") executeTable();
      return;
    }
    if (screen === "eq-menu") {
      if (d === "up") setEqMenuCursor((c) => (c + 2) % 3);
      else if (d === "down") setEqMenuCursor((c) => (c + 1) % 3);
      else if (d === "ok") {
        if (eqMenuCursor === 0) setScreen("eq-unknowns");
        else if (eqMenuCursor === 1) setScreen("eq-degree");
        else {
          setNoticeApp("Solver");
          setScreen("notice");
        }
      }
      return;
    }
    if (screen === "eq-unknowns") {
      if (d === "up") setEqUnkCursor((c) => (c + 2) % 3);
      else if (d === "down") setEqUnkCursor((c) => (c + 1) % 3);
      else if (d === "ok") openEqCoeff((eqUnkCursor + 2) as 2 | 3 | 4); // the counts are 2/3/4 — the index is 0-based
      return;
    }
    if (screen === "eq-coeff") {
      if (d === "up") setEqCell((c) => ({ ...c, row: Math.max(0, c.row - 1) }));
      else if (d === "down") setEqCell((c) => ({ ...c, row: Math.min(c.row + 1, eqUnknowns - 1) }));
      else if (d === "left") setEqCell((c) => ({ ...c, col: Math.max(0, c.col - 1) }));
      else if (d === "right") setEqCell((c) => ({ ...c, col: Math.min(c.col + 1, eqUnknowns) }));
      else if (d === "ok") {
        if (eqEntry) commitEqCell();
        else solveSimulNow(eqCoeffs);
      }
      return;
    }
    if (screen === "eq-degree") {
      if (d === "up") setEqDegCursor((c) => (c + 2) % 3);
      else if (d === "down") setEqDegCursor((c) => (c + 1) % 3);
      else if (d === "ok") openEqPoly((eqDegCursor + 2) as 2 | 3 | 4);
      return;
    }
    if (screen === "eq-poly-coeff") {
      if (d === "up") setEqCell((c) => ({ ...c, row: Math.max(0, c.row - 1) }));
      else if (d === "down") setEqCell((c) => ({ ...c, row: Math.min(c.row + 1, eqDegree) }));
      else if (d === "ok") {
        if (eqEntry) commitEqCell();
        else solvePolyNow(eqPolyCoeffs);
      }
      return;
    }
    if (screen === "notice" && d === "ok") setScreen("home");
  };

  const handleShell = (cmd: ShellCmd) => {
    if (cmd === "off") {
      onClose();
      return;
    }
    if (cmd === "qr") {
      setScreen("qr");
      return;
    }
    if (cmd === "back") {
      if (screen === "catalog-cat") {
        setScreen("catalog");
        setMenuCursor(openCat);
      } else if (screen !== "calc" && screen !== "home") {
        setScreen("home");
        setMenuCursor(0);
      } else if (screen === "home") {
        setScreen("calc");
      }
      return;
    }
    setMenuCursor(0);
    if (cmd === "home") setScreen(screen === "home" ? "calc" : "home");
    else setScreen(cmd);
  };

  /**
   * phase B: the per-model SHIFT dispatch (the shift-legends pin). The
   * registry's per-model override maps the DEVICE key's shifted legend
   * to the engine key it inserts; the one-shot consume law rides the
   * engine's own consume() wrapper (every override key returns through
   * it). The CLASSIC layout never dispatches (the run-001 regression
   * law: byte-identical), and a null override keeps the structural
   * engine law (e.g. the 83GT's "(" — its sheet extracted null).
   */
  const shiftOverrideKey = (def: KeyDef): CalcKey | null => {
    if (layout !== "cw") return null;
    if (typeof def.key !== "object" || def.key === null) return null;
    if (!state.mods.shift) return null;
    const ov = model.shiftOverrides;
    const k = def.key as CalcKey;
    if (k.k === "sq" && ov.sq) {
      // fx-83/85GT CW: the recurring-decimal entry (the device-true ■̇
      // template); fx-991 CW: log (MG verbatim)
      return ov.sq.glyph === "recur" ? { k: "recur" } : { k: "fn-insert", name: "log" };
    }
    if (k.k === "paren" && k.p === "(" && ov.lparen) return { k: "eq-ins" }; // the 991's "="
    if (k.k === "pow10" && ov.d9) {
      // fx-991 CW: i (complex on); fx-83/85GT CW: our documented ","
      // binding (the sheet's null slot claimed for the binary comma)
      return ov.d9.label === "i" ? { k: "i" } : { k: "comma" };
    }
    return null;
  };

  const keyDefPress = (def: KeyDef) => {
    // phase C: the Statistics editor and the Table range fields take
    // over the keypad's entry column (the device's per-app entry line);
    // the dial (arrows/OK) still routes through handleDial.
    if (!def.shell && !def.dial && typeof def.key === "object") {
      const k = def.key as CalcKey;
      if (screen === "stat-edit") {
        if (k.k === "digit") {
          setStatEntry((s) => (s.length < 12 ? s + k.d : s));
          return;
        }
        if (k.k === "neg") {
          setStatEntry((s) => (s.startsWith("-") ? s.slice(1) : "-" + s));
          return;
        }
        if (k.k === "del") {
          if (statEntry) setStatEntry((s) => s.slice(0, -1));
          else deleteStatRow(); // the manual's DEL law on the cursor row
          return;
        }
        if (k.k === "eq") {
          if (statEntry) commitStatCell();
          else setScreen("stat-menu");
          return;
        }
        if (k.k === "ac") {
          setStatEntry("");
          return;
        }
        return; // the editor uses only the entry column (the rest inert)
      }
      if (screen === "table-setup") {
        if (k.k === "digit") {
          setTableRange((r) => ({ ...r, [tableField]: r[tableField].length < 12 ? r[tableField] + k.d : r[tableField] }));
          return;
        }
        if (k.k === "neg") {
          setTableRange((r) => ({ ...r, [tableField]: r[tableField].startsWith("-") ? r[tableField].slice(1) : "-" + r[tableField] }));
          return;
        }
        if (k.k === "del") {
          setTableRange((r) => ({ ...r, [tableField]: r[tableField].slice(0, -1) }));
          return;
        }
        if (k.k === "eq") {
          executeTable();
          return;
        }
        if (k.k === "ac") {
          setTableRange((r) => ({ ...r, [tableField]: "" }));
          return;
        }
        return;
      }
      // phase D: the Equation Coefficient Editors take over the entry
      // column (the device's per-app entry line); AC clears ALL the
      // coefficients to zero — the manual's own law for this editor.
      if (screen === "eq-coeff" || screen === "eq-poly-coeff") {
        if (k.k === "digit") {
          setEqEntry((e) => (e.length < 12 ? e + k.d : e));
          return;
        }
        if (k.k === "neg") {
          setEqEntry((e) => (e.startsWith("-") ? e.slice(1) : "-" + e));
          return;
        }
        if (k.k === "del") {
          setEqEntry((e) => e.slice(0, -1));
          return;
        }
        if (k.k === "eq") {
          commitEqCell();
          return;
        }
        if (k.k === "ac") {
          setEqEntry("");
          if (screen === "eq-poly-coeff") setEqPolyCoeffs((cs) => cs.map(() => "0"));
          else setEqCoeffs((cs) => cs.map((r) => r.map(() => "0")));
          return;
        }
        return;
      }
    }
    const ovr = shiftOverrideKey(def);
    if (ovr) {
      press(ovr);
      return;
    }
    if (def.shell) handleShell(def.shell);
    else if (def.dial) handleDial(def.dial);
    else if (def.key === "mode") setSetupOpen((v) => !v);
    else if (def.key !== "close-setup") press(def.key as CalcKey);
  };

  // L8 keyboard parity — mounted only while open. On a shell screen the
  // arrows + Enter drive the OK-dial instead of the engine.
  useEffect(() => {
    if (!open) return;
    const h = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        onClose();
        return;
      }
      if (screen !== "calc") {
        if (ev.key === "ArrowUp") {
          ev.preventDefault();
          handleDial("up");
        } else if (ev.key === "ArrowDown") {
          ev.preventDefault();
          handleDial("down");
        } else if (ev.key === "Enter") {
          ev.preventDefault();
          handleDial("ok");
        }
        return;
      }
      const k = keyFromKeyboard(ev.key);
      if (!k) return;
      ev.preventDefault();
      setState((s) => pressKey(s, k));
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
    // the closures read the current screen/cursor state
  }, [open, onClose, screen, menuCursor, openCat, state.ans]);

  // ── phase B: the QR canvas — draw the encoded matrix whenever the QR
  // screen shows a result (the encoder refuses honestly when the payload
  // cannot fit; the empty line renders instead — never a fake code) ──
  useEffect(() => {
    if (!open || screen !== "qr") return;
    const canvas = qrCanvasRef.current;
    if (!canvas) return;
    if (state.shown !== "result" || !state.result) return;
    const text = formatNatural(state.result, state.resultForm, state.fix, {
      mixed: state.fractionFormat === "mixed",
      normVariant: state.normVariant,
      sciDigits: state.sciDigits,
      decimalMark: persisted.settings.decimalMark,
      separator: persisted.settings.digitSeparator,
      io: persisted.settings.io,
      angleUnit: state.angle,
    });
    const code = qrEncode(text);
    if (!code) return;
    const scale = 8;
    canvas.width = code.size * scale;
    canvas.height = code.size * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#000000";
    for (let r = 0; r < code.size; r++) {
      for (let c = 0; c < code.size; c++) {
        if (code.modules[r][c]) ctx.fillRect(c * scale, r * scale, scale, scale);
      }
    }
  }, [open, screen, state, persisted.settings]);

  // ── L7: the two-finger relay onto the paper's gesture coordinator ──
  const visibleInkCanvas = (): HTMLCanvasElement | null => {
    const list = Array.from(document.querySelectorAll<HTMLCanvasElement>("canvas.pp-inkLayer"));
    return (
      list.find((c) => {
        const r = c.getBoundingClientRect();
        return r.width > 50 && r.top > -r.height && r.top < window.innerHeight;
      }) ?? null
    );
  };
  const fireCanvasPointer = (canvas: HTMLCanvasElement, type: string, id: number, x: number, y: number) => {
    // real browsers have PointerEvent; jsdom (the pin harness) does not —
    // the fallback rides a plain Event with instance-level fields, the
    // same posture ink-layer-pointerdown.harness.ts documents.
    if (typeof PointerEvent === "function") {
      canvas.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          clientX: x,
          clientY: y,
          pointerId: id,
          pointerType: "touch",
          isPrimary: true,
          buttons: type === "pointerdown" ? 1 : 0,
          pressure: 0,
        }),
      );
      return;
    }
    const ev = new Event(type, { bubbles: true, cancelable: true, composed: true });
    Object.defineProperties(ev, {
      pointerId: { value: id },
      pointerType: { value: "touch" },
      isPrimary: { value: true },
      clientX: { value: x },
      clientY: { value: y },
      buttons: { value: type === "pointerdown" ? 1 : 0 },
      pressure: { value: 0 },
    });
    canvas.dispatchEvent(ev);
  };
  /**
   * T-MG-CALC run-002: which ink tool is ARMED (aria-pressed on the
   * toolbar's tool buttons), or null when the resting SELECT is up. The
   * relay needs this at gesture start: an armed tool hands the stream to
   * the shared PaperGestures coordinator via the canvas; SELECT owns
   * nothing (its touches ride the native s144 plane — unreachable from a
   * relayed synthetic stream), so the relay pans the scroller itself and
   * steps zoom through the gesturePlane bridge. The scan is the same
   * honest-DOM posture the live gates use; the labels are the shipped
   * tool set (Fit/Find/Calculator carry aria-pressed too and are
   * excluded by the prefix list).
   */
  const armedTool = (): string | null => {
    const toolLabels = ["Draw", "Text", "Math text box", "Erase", "Line", "Ruler", "Protractor", "Compasses"];
    const pressed = Array.from(document.querySelectorAll<HTMLButtonElement>('button[aria-pressed="true"]'));
    const b = pressed.find((x) => {
      const label = x.getAttribute("aria-label") || "";
      return toolLabels.some((l) => label.startsWith(l));
    });
    return b ? b.getAttribute("aria-label") || null : null;
  };

  /** the visible canvas's scroll ancestor (the pane scroller). */
  const findScrollerFromCanvas = (canvas: HTMLCanvasElement): HTMLElement | null => {
    let el: HTMLElement | null = canvas.parentElement;
    while (el && el !== document.body) {
      const cs = getComputedStyle(el);
      if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 50) return el;
      el = el.parentElement;
    }
    return null;
  };

  const onOverlayPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "touch") return;
    const r = relayRef.current;
    r.ids.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (r.ids.size >= 2 && !r.active) {
      r.active = true;
      const tool = armedTool();
      r.selectMode = tool === null || tool.startsWith("Select");
      r.canvas = r.selectMode ? null : visibleInkCanvas();
      if (r.selectMode) {
        const cv = visibleInkCanvas();
        r.scroller = cv ? findScrollerFromCanvas(cv) : null;
        const pts = [...r.ids.values()];
        r.centroid = { x: pts.reduce((a, p) => a + p.x, 0) / pts.length, y: pts.reduce((a, p) => a + p.y, 0) / pts.length };
        r.spread0 = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      } else if (r.canvas) {
        for (const [id, p] of r.ids) fireCanvasPointer(r.canvas, "pointerdown", id, p.x, p.y);
      }
    }
  };
  const onOverlayPointerMove = (e: React.PointerEvent) => {
    const r = relayRef.current;
    if (!r.active || !r.ids.has(e.pointerId)) return;
    r.ids.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (r.selectMode) {
      // ── run-002: the SELECT-mode relay — pan the paper directly, step
      // zoom through the pane's bridge (the coordinator's 1.2× rule) ──
      const pts = [...r.ids.values()];
      if (pts.length < 2) return;
      const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
      const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length;
      if (r.scroller && r.centroid) {
        r.scroller.scrollTop -= cy - r.centroid.y;
        r.scroller.scrollLeft -= cx - r.centroid.x;
      }
      r.centroid = { x: cx, y: cy };
      const spread = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      if (r.spread0 > 0 && spread / r.spread0 >= 1.2) {
        gesturePlane?.current?.zoomStep?.(1);
        r.spread0 = spread;
      } else if (r.spread0 > 0 && spread / r.spread0 <= 1 / 1.2) {
        gesturePlane?.current?.zoomStep?.(-1);
        r.spread0 = spread;
      }
      return;
    }
    if (!r.canvas) return;
    fireCanvasPointer(r.canvas, "pointermove", e.pointerId, e.clientX, e.clientY);
  };
  const onOverlayPointerUp = (e: React.PointerEvent) => {
    const r = relayRef.current;
    if (!r.active || !r.ids.has(e.pointerId)) return;
    if (!r.selectMode && r.canvas) fireCanvasPointer(r.canvas, "pointerup", e.pointerId, e.clientX, e.clientY);
    r.ids.delete(e.pointerId);
    if (r.ids.size === 0) {
      r.active = false;
      r.canvas = null;
      r.scroller = null;
      r.selectMode = false;
      r.centroid = null;
      r.spread0 = 0;
    }
  };

  const inputTex = useMemo(() => bufferToTex(state.buf), [state.buf]);
  const inputHtml = useMemo(
    () => katex.renderToString(inputTex, { throwOnError: false, output: "html" }),
    [inputTex],
  );

  if (!open) return null;

  const shift = state.mods.shift;
  const hyp = state.mods.hyp;

  /** the display-format options from the engine state + the settings
   * rows (the format law lives in the engine; the record carries it).
   * Phase B: Sci n, the complex io family and the ∠ unit ride it. */
  const fmt: CalcDisplayFmt = {
    mixed: state.fractionFormat === "mixed",
    normVariant: state.normVariant,
    sciDigits: state.sciDigits,
    decimalMark: persisted.settings.decimalMark,
    separator: persisted.settings.digitSeparator,
    io: persisted.settings.io,
    angleUnit: state.angle,
  };

  // the committed display text (screen-independent — the QR screen encodes it)
  const committedText = state.shown === "result" && state.result ? formatNatural(state.result, state.resultForm, state.fix, fmt) : null;
  const resultText = screen === "calc" ? (state.shown === "error" ? state.error : committedText) : null;

  const shiftColor = model.skin.shiftColor === "gold" ? "text-amber-300" : "text-sky-300";

  const keyAria = (def: KeyDef): string => {
    if (def.shell || def.dial) return def.aria;
    if (typeof def.key === "object" && def.key.k === "trig") {
      const f = def.key.f;
      const full = f === "sin" ? "sine" : f === "cos" ? "cosine" : "tangent";
      if (shift && hyp) return `Arc hyperbolic ${full}`;
      if (shift) return `Arc${f}`;
      if (hyp) return `Hyperbolic ${full}`;
      return def.aria;
    }
    // phase B: the per-model shift legends first (the registry is the
    // law — ■̇ / log on x², = on (, i / "," on ×10ˣ)
    if (typeof def.key === "object" && shift && layout === "cw") {
      const ov = model.shiftOverrides;
      if (def.key.k === "sq" && ov.sq) return ov.sq.aria;
      if (def.key.k === "paren" && def.key.p === "(" && ov.lparen) return ov.lparen.aria;
      if (def.key.k === "pow10" && ov.d9) return ov.d9.aria;
    }
    // T-MG-CALC-1 fix pin: the structural SHIFT relabels (the same law
    // the trig row already obeys)
    if (typeof def.key === "object" && shift) {
      if (def.key.k === "sq") return "Cube";
      if (def.key.k === "sqrt") return "Cube root";
      if (def.key.k === "log") return "Ten to the power";
    }
    return def.aria;
  };
  const keyLabel = (def: KeyDef): string => {
    if (def.shell || def.dial) return def.label;
    if (typeof def.key === "object" && def.key.k === "trig") {
      const f = def.key.f;
      if (shift && hyp) return `${f}⁻¹ʰ`;
      if (shift) return `${f}⁻¹`;
      if (hyp) return `${f}h`;
      return def.label;
    }
    if (typeof def.key === "object" && shift && layout === "cw") {
      const ov = model.shiftOverrides;
      if (def.key.k === "sq" && ov.sq) return ov.sq.label;
      if (def.key.k === "paren" && def.key.p === "(" && ov.lparen) return ov.lparen.label;
      if (def.key.k === "pow10" && ov.d9) return ov.d9.label;
    }
    if (typeof def.key === "object" && shift) {
      if (def.key.k === "sq") return "x³";
      if (def.key.k === "sqrt") return "³√";
      if (def.key.k === "log") return "10ˣ";
    }
    return def.label;
  };

  const renderKey = (def: KeyDef, i: number) => {
    const aria = keyAria(def);
    const isShift = typeof def.key === "object" && (def.key as CalcKey).k === "shift";
    return (
      <button
        key={`${aria}-${i}`}
        type="button"
        aria-label={aria}
        data-calc-key={aria}
        className={[
          "rounded-md py-2 text-sm select-none",
          def.span ? (def.span === 2 ? "col-span-2" : "col-span-7") : "",
          def.accent ? "bg-zinc-700 text-zinc-100 hover:bg-zinc-600" : "bg-zinc-800 text-zinc-100 hover:bg-zinc-700",
          isShift ? shiftColor : "",
        ].join(" ")}
        onPointerDown={(e) => {
          e.stopPropagation();
          pointerPressAt.current = Date.now();
          if (relayRef.current.active) return; // a relayed gesture is never a press
          keyDefPress(def);
        }}
        /* run-003: real clicks and keyboard activation (Enter/Space)
           fire click WITHOUT pointerdown — the a11y path. */
        onClick={() => {
          if (Date.now() - pointerPressAt.current < 500) return;
          if (relayRef.current.active) return;
          keyDefPress(def);
        }}
      >
        {keyLabel(def)}
      </button>
    );
  };

  /** a shell-screen row button (the shared press posture). */
  const screenBtn = (aria: string, label: React.ReactNode, onClick: () => void, opts?: { pressed?: boolean; disabled?: boolean; data?: string; k?: string }) => (
    <button
      key={opts?.k}
      type="button"
      aria-label={aria}
      aria-pressed={opts?.pressed}
      aria-disabled={opts?.disabled || undefined}
      data-calc-screen-btn={opts?.data ?? aria}
      className={[
        "rounded-md px-2 py-1.5 text-xs",
        opts?.pressed ? "bg-zinc-600 text-zinc-50" : "bg-zinc-800 text-zinc-100 hover:bg-zinc-700",
        opts?.disabled ? "opacity-40" : "",
      ].join(" ")}
      onPointerDown={(e) => {
        e.stopPropagation();
        if (opts?.disabled) return;
        pointerPressAt.current = Date.now();
        onClick();
      }}
      onClick={() => {
        if (opts?.disabled) return;
        if (Date.now() - pointerPressAt.current < 500) return;
        onClick();
      }}
    >
      {label}
    </button>
  );

  const apps = model.apps;
  // a committed result exists (screen-independent — the QR screen reads it);
  // hasResult adds the calc-screen condition for the copy affordance
  const hasCommittedResult = state.shown === "result" && !!state.result;
  const hasResult = screen === "calc" && hasCommittedResult;

  return (
    <div
      data-gesture-exclude
      data-calc-root
      role="dialog"
      aria-label="Scientific calculator"
      className="fixed bottom-3 right-3 w-[min(380px,calc(100vw-16px))] max-h-[70vh] overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-900/95 p-3 shadow-2xl"
      /* T-MG-CALC run-003: zIndex 55 — ABOVE the viewer's floating QP/MS
         pill (z-50, mobile-only). The run-001 law (pill 50 > calc 40)
         buried the keypad's bottom row on a phone: the pill floats
         bottom-center exactly over ./+/S⇔D. The calculator is the focused
         surface while open — the pill yields (Escape / the X restores it). */
      style={{ zIndex: 55, touchAction: "none" }}
      onPointerDown={onOverlayPointerDown}
      onPointerMove={onOverlayPointerMove}
      onPointerUp={onOverlayPointerUp}
      onPointerCancel={onOverlayPointerUp}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className={`text-xs font-medium tracking-wide text-zinc-400 ${shift ? shiftColor : ""}`}>
          {model.label} layout · exam honest{shift ? " · SHIFT" : ""}
          {hyp ? " · hyp" : ""}
        </span>
        <span className="flex items-center gap-1">
          {/* T-MG-CALC-2 phase A: the level-driven model picker (MG's own
              level→model map; a manual choice overrides and persists). */}
          <select
            aria-label="Calculator model"
            data-calc-model-picker
            value={modelId}
            onChange={(e) => patchPersisted({ model: e.target.value as CalcModelId })}
            className="rounded-md border border-zinc-700 bg-zinc-800 px-1 py-1 text-xs text-zinc-100"
            onPointerDown={(e) => e.stopPropagation()}
          >
            {CALC_MODEL_IDS.map((id) => (
              <option key={id} value={id}>
                {CALC_MODELS[id].label}
              </option>
            ))}
          </select>
          <button
            type="button"
            aria-label="Toggle keypad layout"
            data-calc-layout-toggle
            className="rounded-md px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => patchPersisted({ layout: layout === "cw" ? "classic" : "cw" })}
          >
            {layout === "cw" ? "CW" : "Classic"}
          </button>
          <button
            type="button"
            aria-label="Close calculator"
            className="rounded-md px-2 py-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onClose}
          >
            ✕
          </button>
        </span>
      </div>
      <div className="mb-2 flex items-center justify-between text-[10px] text-zinc-500">
        <span>Not affiliated with Casio.</span>
        <span className="flex items-center gap-2">
          {model.skin.solar && <span data-calc-solar aria-hidden className="inline-block h-2 w-10 rounded-sm border border-zinc-600 bg-gradient-to-r from-zinc-700 to-zinc-800" />}
          <span data-calc-indicators>
            {shift && <span className={shiftColor}>SHIFT </span>}
            <span>{state.angle === "DEG" ? "D" : state.angle === "RAD" ? "R" : "G"} </span>
            {state.fix > 0 && <span className="text-zinc-300">Fix{state.fix} </span>}
            {state.sciDigits > 0 && <span className="text-zinc-300">Sci{state.sciDigits} </span>}
            <span>{persisted.settings.io === "mathI/DecimalI" ? "MathI/DecimalI" : "MathI/MathO"}</span>
          </span>
        </span>
      </div>

      {/* the LCD: the calc display on the calc screen; the shell screens
          (HOME/SETTINGS/CATALOG/VARIABLE/FUNCTION/TOOLS/notice) replace
          it the way the device's LCD swaps content (MG-true). */}
      {screen === "calc" && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2" aria-live="polite" data-calc-display>
          {/* T-MG-CALC run-003: the device shows a resting "0" — a bare
              black void read as broken (the operator's run-003 receipt). */}
          <div className="min-h-[1.6rem] text-right text-zinc-100" data-calc-input>
            {/* katex.renderToString("") still emits markup, so the resting
                state is detected on the BUFFER, not the html */}
            {state.shown === "input" && state.buf.length === 0 ? (
              <span className="text-zinc-500" data-calc-zero>
                0
              </span>
            ) : (
              <span dangerouslySetInnerHTML={{ __html: inputHtml }} />
            )}
          </div>
          <div className="min-h-[1.4rem] text-right font-mono text-lg text-zinc-100" data-calc-result>
            {resultText ?? ""}
          </div>
          {/* phase B: the .cw-error-hint law — every error class renders
              a hint line under the message (Argument/Range stay in the
              map's vocabulary; the engine raises no fake errors). */}
          {screen === "calc" && state.shown === "error" && state.error && (
            <div className="cw-error-hint text-left text-[10px] leading-snug text-zinc-400" data-calc-error-hint>
              {ERROR_HINTS[state.error]}
            </div>
          )}
          {/* T-MG-CALC run-002: the P2-lite copy affordance (card §6) — the
              displayed value to the clipboard; the answer-box handoff stays
              out until the operator names its home. */}
          {hasResult && (
            <div className="text-right">
              <button
                type="button"
                aria-label="Copy result"
                data-calc-copy
                className="text-xs text-zinc-400 hover:text-zinc-100"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  const text = formatNatural(state.result!, state.resultForm, state.fix, fmt);
                  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).catch(() => {});
                }}
              >
                Copy result
              </button>
            </div>
          )}
        </div>
      )}

      {/* HOME — the model's app grid (MG verbatim lists); the cursor +
          OK-dial drive it device-true, and a direct click ALSO launches
          (our a11y law). Unimplemented apps show the staged-rollout
          notice MG itself ships. */}
      {screen === "home" && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-950 p-3" data-calc-screen="home" aria-live="polite">
          <div className="mb-2 text-xs text-zinc-400">Home · {model.label}</div>
          <div className="grid grid-cols-2 gap-1.5">
            {apps.map((app, i) => (
              <button
                key={app.name}
                type="button"
                aria-label={app.label}
                data-calc-app={app.name}
                className={`rounded-md px-2 py-2 text-left text-sm ${i === menuCursor ? "bg-zinc-600 text-zinc-50" : "bg-zinc-800 text-zinc-100 hover:bg-zinc-700"}`}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  pointerPressAt.current = Date.now();
                  setMenuCursor(i);
                  launchApp(app.name, app.label);
                }}
                onClick={() => {
                  if (Date.now() - pointerPressAt.current < 500) return;
                  setMenuCursor(i);
                  launchApp(app.name, app.label);
                }}
              >
                {app.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* SETTINGS — the numbered device-true dialog (MG's captured rows)
          with every setting OUR engine honors. PHASE B: row 1 toggles the
          io family (mathI/DecimalI — the complex display law reads it)
          and row 3 is the ONE numberFormat union (Norm/Fix/Sci). */}
      {screen === "settings" && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-950 p-3" data-calc-screen="settings" aria-live="polite">
          <div className="mb-2 text-xs text-zinc-400">Settings</div>
          <div className="space-y-2 text-xs text-zinc-100">
            <div className="flex items-center justify-between gap-2">
              <span>1 Input/Output</span>
              <span className="flex gap-1">
                {screenBtn("Input output MathI MathO", "MathI/MathO", () => patchSettings({ io: "mathI/mathO" }), { pressed: persisted.settings.io === "mathI/mathO", k: "io-matho" })}
                {screenBtn("Input output MathI DecimalI", "MathI/DecimalI", () => patchSettings({ io: "mathI/DecimalI" }), { pressed: persisted.settings.io === "mathI/DecimalI", k: "io-decimal" })}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span>2 Angle Unit</span>
              <span className="flex gap-1">
                {(["DEG", "RAD", "GRA"] as const).map((a) =>
                  screenBtn(`Angle mode ${a}`, a, () => {
                    press({ k: "setup-angle", angle: a });
                    patchSettings({ angle: a.toLowerCase() as "deg" | "rad" | "gra" });
                  }, { pressed: state.angle === a, k: a }),
                )}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span>3 Number Format</span>
              <span className="flex flex-wrap gap-1">
                {[1, 2].map((v) =>
                  screenBtn(`Norm ${v}`, `Norm ${v}`, () => applyNumberFormat({ kind: "norm", variant: v as 1 | 2 }), {
                    pressed: persisted.settings.numberFormat.kind === "norm" && persisted.settings.numberFormat.variant === v,
                    k: `norm${v}`,
                  }),
                )}
                <span className="mx-1 text-zinc-600">|</span>
                {screenBtn("Fixed decimals off", "Fix off", () => applyNumberFormat({ kind: "fix", digits: 0 }), {
                  pressed: persisted.settings.numberFormat.kind === "fix" && persisted.settings.numberFormat.digits === 0,
                })}
                {[1, 2, 3, 4, 6].map((n) =>
                  screenBtn(`Fixed decimals ${n}`, `Fix ${n}`, () => applyNumberFormat({ kind: "fix", digits: n }), {
                    pressed: persisted.settings.numberFormat.kind === "fix" && persisted.settings.numberFormat.digits === n,
                    k: `fix${n}`,
                  }),
                )}
                <span className="mx-1 text-zinc-600">|</span>
                {[1, 2, 3, 4, 6].map((n) =>
                  screenBtn(`Scientific digits ${n}`, `Sci ${n}`, () => applyNumberFormat({ kind: "sci", digits: n }), {
                    pressed: persisted.settings.numberFormat.kind === "sci" && persisted.settings.numberFormat.digits === n,
                    k: `sci${n}`,
                  }),
                )}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span>4 Fraction Result</span>
              <span className="flex gap-1">
                {screenBtn("Fraction improper", "Improp", () => press({ k: "setup-fraction", format: "improper" }), { pressed: state.fractionFormat === "improper" })}
                {screenBtn("Fraction mixed", "Mixed", () => press({ k: "setup-fraction", format: "mixed" }), { pressed: state.fractionFormat === "mixed" })}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span>5 Decimal Mark</span>
              <span className="flex gap-1">
                {screenBtn("Decimal mark dot", "Dot", () => patchSettings({ decimalMark: "." }), { pressed: persisted.settings.decimalMark === "." })}
                {screenBtn("Decimal mark comma", "Comma", () => patchSettings({ decimalMark: "," }), { pressed: persisted.settings.decimalMark === "," })}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span>6 Digit Separator</span>
              <span className="flex gap-1">
                {screenBtn("Digit separator on", "On", () => patchSettings({ digitSeparator: true }), { pressed: persisted.settings.digitSeparator })}
                {screenBtn("Digit separator off", "Off", () => patchSettings({ digitSeparator: false }), { pressed: !persisted.settings.digitSeparator })}
              </span>
            </div>
          </div>
          <div className="mt-2">{screenBtn("Back to calculator", "Done", () => setScreen("calc"), { data: "Settings done" })}</div>
        </div>
      )}

      {/* CATALOG — the 7 device-true categories; a category lists ONLY
          the entries our engine evaluates, and an empty one says so
          honestly (no dead items). */}
      {screen === "catalog" && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-950 p-3" data-calc-screen="catalog" aria-live="polite">
          <div className="mb-2 text-xs text-zinc-400">Catalog</div>
          <div className="grid grid-cols-2 gap-1.5">
            {CALC_CATALOG.map((cat, i) => (
              <button
                key={cat.name}
                type="button"
                aria-label={cat.label}
                data-calc-cat={cat.name}
                className={`rounded-md px-2 py-2 text-left text-sm ${i === menuCursor ? "bg-zinc-600 text-zinc-50" : "bg-zinc-800 text-zinc-100 hover:bg-zinc-700"}`}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  pointerPressAt.current = Date.now();
                  setOpenCat(i);
                  setScreen("catalog-cat");
                  setMenuCursor(0);
                }}
                onClick={() => {
                  if (Date.now() - pointerPressAt.current < 500) return;
                  setOpenCat(i);
                  setScreen("catalog-cat");
                  setMenuCursor(0);
                }}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {screen === "catalog-cat" && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-950 p-3" data-calc-screen="catalog-cat" aria-live="polite">
          <div className="mb-2 text-xs text-zinc-400">{CALC_CATALOG[openCat].label}</div>
          {CALC_CATALOG[openCat].items.length === 0 ? (
            <div className="text-xs text-zinc-500" data-calc-cat-empty>
              No catalog entries in this exam class yet.
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {CALC_CATALOG[openCat].items.map((item, i) => (
                <span key={item.aria}>
                  {screenBtn(item.aria, item.label, () => {
                    press(item.key as CalcKey);
                    setScreen("calc");
                  }, { pressed: i === menuCursor })}
                </span>
              ))}
            </div>
          )}
          <div className="mt-2">{screenBtn("Back to categories", "Back", () => { setScreen("catalog"); setMenuCursor(openCat); }, { data: "Catalog back" })}</div>
        </div>
      )}

      {/* VARIABLE ⇄x — the store sheet: insert / Store (the result or
          the entry) / Clear per variable; unset variables read 0 (the
          device law) and Ans keeps its own chain row. */}
      {screen === "vars" && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-950 p-3" data-calc-screen="vars" aria-live="polite">
          <div className="mb-2 text-xs text-zinc-400">Variables</div>
          <div className="space-y-1.5">
            {VAR_NAMES.map((name) => {
              const val = state.vars[name];
              const storable = (state.shown === "result" && !!state.result) || state.buf.length > 0;
              return (
                <div key={name} className="flex items-center justify-between gap-2 text-xs">
                  <span className="w-16 font-mono text-zinc-100" data-calc-var-value={name}>
                    {name} = {formatNatural(val ?? { exact: true, n: BigInt(0), d: BigInt(1) }, "fraction", 0, fmt)}
                  </span>
                  <span className="flex gap-1">
                    {screenBtn(`Insert variable ${name}`, "Insert", () => {
                      press({ k: "var", name });
                      setScreen("calc");
                    })}
                    {screenBtn(`Store variable ${name}`, "Store", () => press({ k: "sto", name }), { disabled: !storable })}
                    {screenBtn(`Clear variable ${name}`, "Clear", () => press({ k: "clear-var", name }), { disabled: val === undefined })}
                  </span>
                </div>
              );
            })}
            <div className="flex items-center justify-between gap-2 border-t border-zinc-800 pt-1.5 text-xs">
              <span className="w-16 font-mono text-zinc-100">
                Ans = {state.ans ? formatNatural(state.ans, "fraction", 0, fmt) : "—"}
              </span>
              <span className="flex gap-1">{screenBtn("Insert Ans", "Insert", () => { press({ k: "ans" }); setScreen("calc"); })}</span>
            </div>
          </div>
          <div className="mt-2">{screenBtn("Back to calculator", "Done", () => setScreen("calc"), { data: "Vars done" })}</div>
        </div>
      )}

      {/* FUNCTION f(x) — the f/g definition sheet: the current ENTRY
          defines the function (in terms of var x); Insert puts f( into
          the buffer; the engine substitutes EXACTLY (no decimal drift). */}
      {screen === "fns" && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-950 p-3" data-calc-screen="fns" aria-live="polite">
          <div className="mb-2 text-xs text-zinc-400">Function</div>
          <div className="space-y-1.5">
            {(["f", "g"] as const).map((name) => {
              const body = state.fns[name];
              const storable = state.buf.length > 0;
              return (
                <div key={name} className="flex items-center justify-between gap-2 text-xs">
                  <span className="w-28 font-mono text-zinc-100" data-calc-fn-value={name}>
                    {name}(x) = {body ? bufferToTex(body) : "not set"}
                  </span>
                  <span className="flex gap-1">
                    {screenBtn(`Define function ${name} from entry`, "Store", () => press({ k: "def-fn", name }), { disabled: !storable })}
                    {screenBtn(`Insert function ${name}`, "Insert", () => { press({ k: "fn-call", name }); setScreen("calc"); }, { disabled: !body })}
                    {screenBtn(`Clear function ${name}`, "Clear", () => press({ k: "clear-fn", name }), { disabled: !body })}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-2">{screenBtn("Back to calculator", "Done", () => setScreen("calc"), { data: "Fns done" })}</div>
        </div>
      )}

      {/* TOOLS — the honest overflow: the device-true Reset (settings +
              memory clear) and the model card. */}
      {screen === "tools" && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-950 p-3" data-calc-screen="tools" aria-live="polite">
          <div className="mb-2 text-xs text-zinc-400">Tools</div>
          <div className="space-y-1.5">
            {screenBtn("Reset calculator", "Reset (settings + memory)", () => {
              const fresh = loadPersisted();
              window.localStorage.removeItem("syllab-calculator-v1");
              setPersisted({ ...fresh, model: null, layout: "cw" });
              setState(initialCalcState("DEG"));
              setScreen("calc");
            })}
            <div className="rounded-md bg-zinc-900 p-2 text-xs text-zinc-400" data-calc-model-info>
              {model.label} · ClassWiz class · shift {model.skin.shiftColor}
              {model.skin.solar ? " · solar" : ""} · not affiliated with Casio
            </div>
          </div>
          <div className="mt-2">{screenBtn("Back to calculator", "Done", () => setScreen("calc"), { data: "Tools done" })}</div>
        </div>
      )}

      {/* the staged-rollout notice — MG's captured pattern, verbatim. */}
      {screen === "notice" && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-950 p-3" data-calc-screen="notice" aria-live="polite">
          <div className="text-sm text-zinc-100" data-calc-notice>
            {noticeApp}. This app isn&apos;t on the simulator yet.
          </div>
          <div className="mt-2">{screenBtn("Back to home", "Back", () => setScreen("home"), { data: "Notice back" })}</div>
        </div>
      )}

      {/* ── phase C: the Statistics app — the manual's flow: the
          [1-Variable]/[2-Variable] type menu, then the Statistics
          Editor, then the results menu. The editor caps (160/80) and
          the value sets are the official manual's. ── */}
      {screen === "stat-type" && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-950 p-3" data-calc-screen="stat-type" aria-live="polite">
          <div className="mb-2 text-xs text-zinc-400">Statistics · Select Type</div>
          <div className="space-y-1.5">
            {(["1-Variable", "2-Variable"] as const).map((label, i) => (
              <div key={label} className="flex items-center justify-between gap-2">
                <span className={`text-sm ${statTypeCursor === i ? "text-zinc-50" : "text-zinc-300"}`}>
                  {statTypeCursor === i ? "▶ " : "  "}
                  {label}
                </span>
                {screenBtn(`Open ${label} editor`, label, () => openStatEditor(i === 0 ? "1var" : "2var"), {
                  pressed: statTypeCursor === i,
                  data: label,
                })}
              </div>
            ))}
          </div>
          <div className="mt-2">{screenBtn("Back to home", "Back", () => setScreen("home"), { data: "Stat back" })}</div>
        </div>
      )}

      {screen === "stat-edit" && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-950 p-3" data-calc-screen="stat-edit" aria-live="polite">
          <div className="mb-2 flex items-center justify-between text-xs text-zinc-400">
            <span>
              Statistics Editor · {statKind === "1var" ? "1-Variable" : "2-Variable"}
            </span>
            <span>
              {statList.x.length}/{STAT_MAX_ROWS[statKind]} rows
            </span>
          </div>
          <div className="max-h-40 overflow-y-auto rounded-md border border-zinc-800">
            <table className="w-full text-xs font-mono">
              <thead className="bg-zinc-900 text-zinc-400">
                <tr>
                  <th className="px-2 py-1 text-left">x</th>
                  {statKind === "2var" && <th className="px-2 py-1 text-left">y</th>}
                </tr>
              </thead>
              <tbody>
                {Array.from({
                  length: Math.max(statList.x.length, statKind === "2var" ? statList.y.length : 0, statCell.row + 1, 1),
                }).map((_, r) => (
                  <tr key={r} className={statCell.row === r ? "bg-zinc-800/60" : ""}>
                    {[0, 1]
                      .filter((c) => statKind === "2var" || c === 0)
                      .map((c) => {
                        const active = statCell.row === r && statCell.col === c;
                        const text = active && statEntry ? statEntry : (c === 0 ? statList.x[r] : statList.y[r]) ?? "";
                        return (
                          <td
                            key={c}
                            className={`px-2 py-1 text-zinc-100 ${active ? "outline outline-1 outline-zinc-500" : ""}`}
                            data-calc-stat-cell={`${c === 0 ? "x" : "y"}-${r}`}
                          >
                            {text || " "}
                          </td>
                        );
                      })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-1 text-[10px] leading-snug text-zinc-500">
            Type on the keypad · EXE commits the cell · DEL deletes the row · EXE on an empty line opens the results menu
          </div>
          {appError && (
            <div className="cw-error-hint mt-1 text-left text-[10px] leading-snug text-zinc-400" data-calc-app-error>
              {appError}: check the entry and the editor limits ({STAT_MAX_ROWS[statKind]} rows).
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-1">
            {screenBtn("Open results menu", "Results", () => setScreen("stat-menu"), { data: "Stat results" })}
            {screenBtn("Delete all rows", "Delete All", () => {
              setStatList({ x: [], y: [] });
              setStatCell({ col: 0, row: 0 });
              setStatEntry("");
              setAppError(null);
            }, { data: "Delete All" })}
            {screenBtn("Back to home", "Back", () => setScreen("home"), { data: "Stat editor back" })}
          </div>
        </div>
      )}

      {screen === "stat-menu" && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-950 p-3" data-calc-screen="stat-menu" aria-live="polite">
          <div className="mb-2 text-xs text-zinc-400">Statistics · {statKind === "1var" ? "1-Variable" : "2-Variable"} data</div>
          <div className="space-y-1.5">
            {statMenuItems().map((it, i) => (
              <div key={it.label} className="flex items-center justify-between gap-2">
                <span className={`text-sm ${statMenuCursor === i ? "text-zinc-50" : "text-zinc-300"}`}>
                  {statMenuCursor === i ? "▶ " : "  "}
                  {it.label}
                </span>
                {screenBtn(`Select ${it.label}`, it.label, it.run, { pressed: statMenuCursor === i, data: it.label })}
              </div>
            ))}
          </div>
          <div className="mt-2">{screenBtn("Back to editor", "Back", () => setScreen("stat-edit"), { data: "Menu back" })}</div>
        </div>
      )}

      {screen === "stat-res" && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-950 p-3" data-calc-screen="stat-res" aria-live="polite">
          <div className="mb-2 text-xs text-zinc-400">
            {statReg ? "Reg Results · y = a + bx" : statKind === "1var" ? "1-Var Results" : "2-Var Results"}
          </div>
          <div className="max-h-44 overflow-y-auto text-xs font-mono">
            {statReg
              ? (
                  [
                    ["a", statReg.a],
                    ["b", statReg.b],
                    ["r", statReg.r],
                  ] as const
                ).map(([l, v]) => (
                  <div key={l} className="flex justify-between gap-3 py-0.5">
                    <span className="text-zinc-400">{l}</span>
                    <span className="text-zinc-100" data-calc-stat-value={l}>
                      {formatNatural(v, state.resultForm, state.fix, fmt)}
                    </span>
                  </div>
                ))
              : statRes &&
                statValueRows(statRes).map((row) => (
                  <div key={row.aria} className="flex justify-between gap-3 py-0.5">
                    <span className="text-zinc-400">{row.label}</span>
                    <span className="text-zinc-100" data-calc-stat-value={row.aria}>
                      {row.v ? formatNatural(row.v, state.resultForm, state.fix, fmt) : "Math ERROR"}
                    </span>
                  </div>
                ))}
          </div>
          {appError && (
            <div className="cw-error-hint mt-1 text-left text-[10px] leading-snug text-zinc-400" data-calc-app-error>
              {appError}: the data cannot support this screen (fewer than 2 pairs, or a constant x/y).
            </div>
          )}
          <div className="mt-2">{screenBtn("Back to menu", "Back", () => setScreen("stat-menu"), { data: "Results back" })}</div>
        </div>
      )}

      {/* ── phase C: the Table app — the manual's flow: Table Type
          (f(x)/g(x) both = the default), the defining equations shared
          with the FUNCTION key, the Table Range (Start/End/Step), then
          the number table. Row caps: 45 single, 30 both. ── */}
      {screen === "table-setup" && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-950 p-3" data-calc-screen="table-setup" aria-live="polite">
          <div className="mb-2 text-xs text-zinc-400">Table · Number Table</div>
          <div className="flex flex-wrap items-center gap-1 text-xs">
            <span className="text-zinc-400">Type</span>
            {screenBtn("Table type f(x)/g(x)", "f(x)/g(x)", () => {
              setTableType("fg");
              setAppError(null);
            }, { pressed: tableType === "fg", data: "Table type f/g" })}
            {screenBtn("Table type f(x)", "f(x)", () => {
              setTableType("f");
              setAppError(null);
            }, { pressed: tableType === "f", data: "Table type f(x)" })}
            {screenBtn("Table type g(x)", "g(x)", () => {
              setTableType("g");
              setAppError(null);
            }, { pressed: tableType === "g", data: "Table type g(x)" })}
          </div>
          <div className="mt-2 space-y-1 text-xs font-mono">
            <div className="text-zinc-300">f(x) = {state.fns.f ? bufferToTex(state.fns.f) : "not set"}</div>
            <div className="text-zinc-300">g(x) = {state.fns.g ? bufferToTex(state.fns.g) : "not set"}</div>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {screenBtn("Define f(x) on the Function screen", "Define f", () => setScreen("fns"), { data: "Define f(x)" })}
            {screenBtn("Define g(x) on the Function screen", "Define g", () => setScreen("fns"), { data: "Define g(x)" })}
          </div>
          <div className="mt-2 space-y-1 text-xs font-mono">
            {(["start", "end", "step"] as const).map((f) => (
              <div key={f} className="flex items-center justify-between gap-2">
                <span className={tableField === f ? "text-zinc-50" : "text-zinc-400"}>
                  {tableField === f ? "▶ " : "  "}
                  {f === "start" ? "Start" : f === "end" ? "End" : "Step"}
                </span>
                {screenBtn(
                  `Select the ${f} field`,
                  f === "start" ? "Start" : f === "end" ? "End" : "Step",
                  () => {
                    setTableField(f);
                    setAppError(null);
                  },
                  { pressed: tableField === f, data: `Table ${f}` },
                )}
                <span className="min-w-16 text-right text-zinc-100" data-calc-table-field={f}>
                  {tableRange[f] || "—"}
                </span>
              </div>
            ))}
          </div>
          {appError && (
            <div className="cw-error-hint mt-1 text-left text-[10px] leading-snug text-zinc-400" data-calc-app-error>
              {appError}: check Start ≤ End, Step ≠ 0, and the row limit (
              {tableType === "fg" ? TABLE_ROWS_BOTH : TABLE_ROWS_SINGLE} rows for{" "}
              {tableType === "fg" ? "f(x)/g(x)" : tableType === "f" ? "f(x)" : "g(x)"}).
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-1">
            {screenBtn("Generate the number table", "Execute", executeTable, { data: "Execute table" })}
            {screenBtn("Back to home", "Back", () => setScreen("home"), { data: "Table setup back" })}
          </div>
        </div>
      )}

      {screen === "table-res" && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-950 p-3" data-calc-screen="table-res" aria-live="polite">
          <div className="mb-2 text-xs text-zinc-400">Number Table · {tableType === "fg" ? "f(x)/g(x)" : tableType === "f" ? "f(x)" : "g(x)"}</div>
          <div className="max-h-44 overflow-y-auto">
            <table className="w-full text-xs font-mono">
              <thead className="bg-zinc-900 text-zinc-400">
                <tr>
                  <th className="px-2 py-1 text-left">x</th>
                  {(tableType === "f" || tableType === "fg") && <th className="px-2 py-1 text-left">f(x)</th>}
                  {(tableType === "g" || tableType === "fg") && <th className="px-2 py-1 text-left">g(x)</th>}
                </tr>
              </thead>
              <tbody>
                {(tableRows ?? []).map((row, r) => (
                  <tr key={r}>
                    <td className="px-2 py-1 text-zinc-100" data-calc-table-cell={`x-${r}`}>
                      {formatNatural(row.x, state.resultForm, state.fix, fmt)}
                    </td>
                    {(tableType === "f" || tableType === "fg") && (
                      <td className="px-2 py-1 text-zinc-100" data-calc-table-cell={`f-${r}`}>
                        {row.f ? formatNatural(row.f, state.resultForm, state.fix, fmt) : "—"}
                      </td>
                    )}
                    {(tableType === "g" || tableType === "fg") && (
                      <td className="px-2 py-1 text-zinc-100" data-calc-table-cell={`g-${r}`}>
                        {row.g ? formatNatural(row.g, state.resultForm, state.fix, fmt) : "—"}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2">{screenBtn("Back to table range", "Back", () => setScreen("table-setup"), { data: "Table back" })}</div>
        </div>
      )}

      {/* ── phase D: the Equation app — the manual's flow: the Equation
          menu ([Simul Equation]/[Polynomial]/[Solver]), the
          number-of-unknowns / degrees menus, the Coefficient Editor
          (starts at zero — the manual's AC law), then the solution
          screen. Solver is pinned out of phase D (the phase-C "no
          silent growth" precedent) and renders the staged-rollout
          notice. ── */}
      {screen === "eq-menu" && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-950 p-3" data-calc-screen="eq-menu" aria-live="polite">
          <div className="mb-2 text-xs text-zinc-400">Equation · Equation Menu</div>
          <div className="space-y-1.5">
            {(["Simul Equation", "Polynomial", "Solver"] as const).map((label, i) => (
              <div key={label} className="flex items-center justify-between gap-2">
                <span className={`text-sm ${eqMenuCursor === i ? "text-zinc-50" : "text-zinc-300"}`}>
                  {eqMenuCursor === i ? "▶ " : "  "}
                  {label}
                </span>
                {screenBtn(`Select ${label}`, label, () => {
                  if (i === 0) setScreen("eq-unknowns");
                  else if (i === 1) setScreen("eq-degree");
                  else {
                    setNoticeApp("Solver");
                    setScreen("notice");
                  }
                }, { pressed: eqMenuCursor === i, data: label })}
              </div>
            ))}
          </div>
          <div className="mt-2">{screenBtn("Back to home", "Back", () => setScreen("home"), { data: "Equation back" })}</div>
        </div>
      )}

      {screen === "eq-unknowns" && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-950 p-3" data-calc-screen="eq-unknowns" aria-live="polite">
          <div className="mb-2 text-xs text-zinc-400">Simul Equation · Unknowns?</div>
          <div className="space-y-1.5">
            {(["2 Unknowns", "3 Unknowns", "4 Unknowns"] as const).map((label, i) => (
              <div key={label} className="flex items-center justify-between gap-2">
                <span className={`text-sm ${eqUnkCursor === i ? "text-zinc-50" : "text-zinc-300"}`}>
                  {eqUnkCursor === i ? "▶ " : "  "}
                  {label}
                </span>
                {screenBtn(`Select ${label}`, label, () => openEqCoeff((i + 2) as 2 | 3 | 4), { pressed: eqUnkCursor === i, data: label })}
              </div>
            ))}
          </div>
          <div className="mt-2">{screenBtn("Back to Equation menu", "Back", () => setScreen("eq-menu"), { data: "Unknowns back" })}</div>
        </div>
      )}

      {screen === "eq-coeff" && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-950 p-3" data-calc-screen="eq-coeff" aria-live="polite">
          <div className="mb-2 text-xs text-zinc-400">Simul Equation · Coefficient Editor · {eqUnknowns} Unknowns</div>
          <div className="max-h-44 overflow-y-auto rounded-md border border-zinc-800">
            <table className="w-full text-xs font-mono">
              <thead className="bg-zinc-900 text-zinc-400">
                <tr>
                  {SIMUL_UNKNOWN_NAMES.slice(0, eqUnknowns).map((v) => (
                    <th key={v} className="px-2 py-1 text-left">{v}</th>
                  ))}
                  <th className="px-2 py-1 text-left">=</th>
                </tr>
              </thead>
              <tbody>
                {eqCoeffs.map((row, r) => (
                  <tr key={r} className={eqCell.row === r ? "bg-zinc-800/60" : ""}>
                    {row.map((v, c) => {
                      const active = eqCell.row === r && eqCell.col === c;
                      const text = active && eqEntry ? eqEntry : v;
                      return (
                        <td
                          key={c}
                          className={`px-2 py-1 text-zinc-100 ${active ? "outline outline-1 outline-zinc-500" : ""}`}
                          data-calc-eq-cell={`${r}-${c}`}
                        >
                          {text}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-1 text-[10px] leading-snug text-zinc-500">
            Type on the keypad · EXE commits the cell · EXE on the last cell solves · AC clears all coefficients
          </div>
          {appError && (
            <div className="cw-error-hint mt-1 text-left text-[10px] leading-snug text-zinc-400" data-calc-app-error>
              {appError}: check the coefficient entry.
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-1">
            {screenBtn("Solve simultaneous equations", "Solve", () => solveSimulNow(eqCoeffs), { data: "Solve simul" })}
            {screenBtn("Back to unknowns menu", "Back", () => setScreen("eq-unknowns"), { data: "Coeff back" })}
          </div>
        </div>
      )}

      {screen === "eq-sol" && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-950 p-3" data-calc-screen="eq-sol" aria-live="polite">
          <div className="mb-2 text-xs text-zinc-400">Simul Equation · Solutions · {eqUnknowns} Unknowns</div>
          <div className="text-xs font-mono">
            {eqSolutions?.kind === "solved" ? (
              eqSolutions.values.map((v, i) => (
                <div key={SIMUL_UNKNOWN_NAMES[i]} className="flex justify-between gap-3 py-0.5">
                  <span className="text-zinc-400">{SIMUL_UNKNOWN_NAMES[i]}</span>
                  <span className="text-zinc-100" data-calc-eq-solution={SIMUL_UNKNOWN_NAMES[i]}>
                    {formatNatural(v, state.resultForm, state.fix, fmt)}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-zinc-100" data-calc-eq-singular>
                {eqSolutions?.kind === "no-solution" ? "No Solution" : eqSolutions?.kind === "infinite-solution" ? "Infinite Solution" : "—"}
              </div>
            )}
          </div>
          <div className="mt-2">{screenBtn("Back to Coefficient Editor", "Back", () => setScreen("eq-coeff"), { data: "Sol back" })}</div>
        </div>
      )}

      {screen === "eq-degree" && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-950 p-3" data-calc-screen="eq-degree" aria-live="polite">
          <div className="mb-2 text-xs text-zinc-400">Polynomial · Degree?</div>
          <div className="space-y-1.5">
            {(["ax²+bx+c=0", "ax³+bx²+cx+d=0", "ax⁴+bx³+cx²+dx+e=0"] as const).map((label, i) => (
              <div key={label} className="flex items-center justify-between gap-2">
                <span className={`text-sm ${eqDegCursor === i ? "text-zinc-50" : "text-zinc-300"}`}>
                  {eqDegCursor === i ? "▶ " : "  "}
                  {label}
                </span>
                {screenBtn(`Select degree ${i + 2}`, label, () => openEqPoly((i + 2) as 2 | 3 | 4), { pressed: eqDegCursor === i, data: label })}
              </div>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1">
            <span className="text-xs text-zinc-400">Complex Roots</span>
            {screenBtn("Complex Roots Off — the initial default", "Off", () => setEqComplexRoots(false), { pressed: !eqComplexRoots, data: "Complex roots off" })}
            {screenBtn("Complex Roots On — complex solutions display in the a+bi form", "On", () => setEqComplexRoots(true), { pressed: eqComplexRoots, data: "Complex roots on" })}
          </div>
          <div className="mt-2">{screenBtn("Back to Equation menu", "Back", () => setScreen("eq-menu"), { data: "Degree back" })}</div>
        </div>
      )}

      {screen === "eq-poly-coeff" && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-950 p-3" data-calc-screen="eq-poly-coeff" aria-live="polite">
          <div className="mb-2 text-xs text-zinc-400">
            Polynomial · Coefficient Editor · {["ax²+bx+c=0", "ax³+bx²+cx+d=0", "ax⁴+bx³+cx²+dx+e=0"][eqDegree - 2]}
            {eqComplexRoots ? " · Complex Roots On" : ""}
          </div>
          <div className="max-h-40 overflow-y-auto rounded-md border border-zinc-800">
            <table className="w-full text-xs font-mono">
              <thead className="bg-zinc-900 text-zinc-400">
                <tr>
                  {["a", "b", "c", "d", "e"].slice(0, eqDegree + 1).map((v) => (
                    <th key={v} className="px-2 py-1 text-left">{v}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {eqPolyCoeffs.map((v, i) => {
                    const active = eqCell.row === i;
                    const text = active && eqEntry ? eqEntry : v;
                    return (
                      <td
                        key={i}
                        className={`px-2 py-1 text-zinc-100 ${active ? "outline outline-1 outline-zinc-500" : ""}`}
                        data-calc-eq-cell={`p-${i}`}
                      >
                        {text}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
          <div className="mt-1 text-[10px] leading-snug text-zinc-500">
            Descending coefficients · EXE commits the cell · EXE on the last cell solves · AC clears all coefficients
          </div>
          {appError && (
            <div className="cw-error-hint mt-1 text-left text-[10px] leading-snug text-zinc-400" data-calc-app-error>
              {appError}: check the coefficient entry (the leading coefficient must not be zero).
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-1">
            {screenBtn("Solve polynomial equation", "Solve", () => solvePolyNow(eqPolyCoeffs), { data: "Solve poly" })}
            {screenBtn("Back to degree menu", "Back", () => setScreen("eq-degree"), { data: "Poly coeff back" })}
          </div>
        </div>
      )}

      {screen === "eq-poly-sol" && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-950 p-3" data-calc-screen="eq-poly-sol" aria-live="polite">
          <div className="mb-2 text-xs text-zinc-400">Polynomial · Solutions · {["ax²+bx+c=0", "ax³+bx²+cx+d=0", "ax⁴+bx³+cx²+dx+e=0"][eqDegree - 2]}</div>
          <div className="max-h-44 overflow-y-auto text-xs font-mono">
            {eqResults && eqResults.noRealRoots ? (
              <div className="text-zinc-100" data-calc-eq-message>No Real Roots</div>
            ) : (
              <>
                {(eqResults?.solutions ?? []).map((v, i) => (
                  <div key={`s-${i}`} className="flex justify-between gap-3 py-0.5">
                    <span className="text-zinc-400">x{i + 1}</span>
                    <span className="text-zinc-100" data-calc-eq-solution={`x${i + 1}`}>
                      {formatNatural(v, state.resultForm, state.fix, fmt)}
                    </span>
                  </div>
                ))}
                {(eqResults?.extrema ?? []).map((pt, i) => (
                  <div key={`e-${i}`} className="mt-1 border-t border-zinc-800 pt-1">
                    <div className="text-zinc-400" data-calc-eq-extrema-label={pt.kind}>
                      {pt.kind === "min" ? "Min" : "Max"} Coordinates (x, y)
                    </div>
                    <div className="flex justify-between gap-3 py-0.5">
                      <span className="text-zinc-400">x</span>
                      <span className="text-zinc-100" data-calc-eq-extrema-x={pt.kind}>
                        {formatNatural(pt.x, state.resultForm, state.fix, fmt)}
                      </span>
                    </div>
                    <div className="flex justify-between gap-3 py-0.5">
                      <span className="text-zinc-400">y</span>
                      <span className="text-zinc-100" data-calc-eq-extrema-y={pt.kind}>
                        {formatNatural(pt.y, state.resultForm, state.fix, fmt)}
                      </span>
                    </div>
                  </div>
                ))}
                {eqResults?.noLocalMaxMin && <div className="text-zinc-100" data-calc-eq-message>No Local Max/Min</div>}
              </>
            )}
          </div>
          <div className="mt-2">{screenBtn("Back to Coefficient Editor", "Back", () => setScreen("eq-poly-coeff"), { data: "Poly sol back" })}</div>
        </div>
      )}

      {/* QR — the phase-B key: the displayed result encoded as a QR
          matrix by OUR verified encoder (qr-encoder.ts — golden-matrix
          cross-checked against an independent implementation). The real
          device encodes a Casio web-service URL; ours says honestly what
          it encodes. */}
      {screen === "qr" && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-950 p-3" data-calc-screen="qr" aria-live="polite">
          <div className="mb-2 text-xs text-zinc-400">QR · {model.label}</div>
          {hasCommittedResult ? (
            <div className="space-y-2 text-xs">
              <canvas ref={qrCanvasRef} data-calc-qr className="mx-auto block w-full max-w-[220px]" />
              <div className="text-center font-mono text-zinc-100" data-calc-qr-text>
                {committedText}
              </div>
              <div className="text-center text-[10px] text-zinc-500">Encodes the displayed result as plain text — not the Casio web service.</div>
            </div>
          ) : (
            <div className="text-xs text-zinc-500" data-calc-qr-empty>
              No result to encode yet — EXE a calculation first.
            </div>
          )}
          <div className="mt-2">{screenBtn("Back to calculator", "Back", () => setScreen("calc"), { data: "QR back" })}</div>
        </div>
      )}

      {/* SETUP chips (MODE toggles): the CLASSIC layout's settings
          surface — the CW layout drives the same laws through the
          numbered SETTINGS screen. */}
      {layout === "classic" && setupOpen && (
        <div className="mt-2 flex flex-wrap gap-1 rounded-lg border border-zinc-700 bg-zinc-800/60 p-2" data-calc-setup>
          {(["DEG", "RAD", "GRA"] as const).map((a) => (
            <button
              key={a}
              type="button"
              aria-label={`Angle mode ${a}`}
              aria-pressed={state.angle === a}
              className="rounded px-2 py-1 text-xs text-zinc-100 hover:bg-zinc-700"
              onPointerDown={(e) => {
                e.stopPropagation();
                pointerPressAt.current = Date.now();
                press({ k: "setup-angle", angle: a });
              }}
              onClick={() => {
                if (Date.now() - pointerPressAt.current < 500) return;
                press({ k: "setup-angle", angle: a });
              }}
            >
              {a}
            </button>
          ))}
          <span className="mx-1 text-zinc-500">|</span>
          <button
            type="button"
            aria-label="Fixed decimals off"
            aria-pressed={state.fix === 0}
            className="rounded px-2 py-1 text-xs text-zinc-100 hover:bg-zinc-700"
            onPointerDown={(e) => {
              e.stopPropagation();
              pointerPressAt.current = Date.now();
              press({ k: "setup-fix", fix: 0 });
            }}
            onClick={() => {
              if (Date.now() - pointerPressAt.current < 500) return;
              press({ k: "setup-fix", fix: 0 });
            }}
          >
            Fix off
          </button>
          {[1, 2, 3, 4, 6].map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`Fixed decimals ${n}`}
              aria-pressed={state.fix === n}
              className="rounded px-2 py-1 text-xs text-zinc-100 hover:bg-zinc-700"
              onPointerDown={(e) => {
                e.stopPropagation();
                pointerPressAt.current = Date.now();
                press({ k: "setup-fix", fix: n });
              }}
              onClick={() => {
                if (Date.now() - pointerPressAt.current < 500) return;
                press({ k: "setup-fix", fix: n });
              }}
            >
              Fix {n}
            </button>
          ))}
          <button
            type="button"
            aria-label="Close setup"
            className="ml-auto rounded px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-700"
            onPointerDown={(e) => {
              e.stopPropagation();
              setSetupOpen(false);
            }}
          >
            Done
          </button>
        </div>
      )}

      {/* the keypad: the CW device posture (default) or the run-001
          classic posture behind the toggle */}
      <div className={`mt-2 grid gap-1.5 ${layout === "cw" ? "grid-cols-7" : "grid-cols-5"}`} data-calc-keypad data-calc-layout={layout}>
        {(layout === "cw" ? CW_GRID : GRID).flat().map(renderKey)}
      </div>
    </div>
  );
}

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
  formatNatural,
  initialCalcState,
  pressKey,
  type CalcDisplayFmt,
  type CalcKey,
  type CalcState,
} from "./calc-engine";
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
type Screen = "calc" | "home" | "settings" | "catalog" | "catalog-cat" | "vars" | "fns" | "tools" | "notice" | "qr";

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
  "Range ERROR": "Check the input range for this function.",
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
    // the staged-rollout notice — MG's own captured pattern (the chase
    // card's live probes); it doubles as our exam-honest fence
    setNoticeApp(label);
    setScreen("notice");
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

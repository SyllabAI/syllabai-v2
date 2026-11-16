/**
 * ScientificCalculator.tsx — T-MG-CALC run-001: the viewer-level exam
 * calculator overlay (task card L1/L7/L8).
 *
 * PLACEMENT LAW (L1): ONE instance at the VIEWER level — a sibling of
 * the ink host wrapper, spanning split view; opened from the pane tool
 * strips. It docks bottom-right ABOVE the ink toolbar and UNDER the
 * sovereign swap pill (z-law: pill z-50 > this z-40 > toolbar z-30).
 *
 * EXAM HONESTY (L2): every keystroke flows through the pure engine
 * (pressKey) — no history, no persistence, no network, no localStorage.
 *
 * GESTURE LAW (L7): the root carries data-gesture-exclude (the seam
 * marker) AND relays two-finger touch streams onto the visible ink
 * canvas — the paper's shared PaperGestures coordinator then pans/
 * zooms the PAPER exactly as if the fingers were on the page. A single
 * finger on the overlay is a calculator press, never ink.
 *
 * KEYBOARD PARITY (L8): digits, . + - * / ( ) ^, Enter =, Backspace
 * DEL, Delete AC, Escape closes, s/c/t trig, r √, a Ans, p π.
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
  type CalcKey,
  type CalcState,
} from "./calc-engine";

export interface ScientificCalculatorProps {
  open: boolean;
  onClose: () => void;
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

interface KeyDef {
  label: string;
  aria: string;
  key: CalcKey | "mode" | "close-setup";
  wide?: boolean;
  accent?: boolean;
}

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

export function ScientificCalculator({ open, onClose, gesturePlane }: ScientificCalculatorProps) {
  const [state, setState] = useState<CalcState>(() => initialCalcState("DEG"));
  const [setupOpen, setSetupOpen] = useState(false);
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

  /** run-003: the keypad key's action, shared by the pointer path and the
   * click path (keyboard Enter/Space on a focused button fires click
   * WITHOUT pointerdown — without this, the keypad was mouse/touch-only). */
  const keyDefPress = (def: { key: CalcKey | "mode" | "close-setup" }, isMode: boolean) => {
    if (isMode) setSetupOpen((v) => !v);
    else if (def.key !== "close-setup") press(def.key as CalcKey);
  };

  // L8 keyboard parity — mounted only while open
  useEffect(() => {
    if (!open) return;
    const h = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        onClose();
        return;
      }
      const k = keyFromKeyboard(ev.key);
      if (!k) return;
      ev.preventDefault();
      setState((s) => pressKey(s, k));
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

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

  const press = (k: CalcKey) => setState((s) => pressKey(s, k));

  const inputTex = useMemo(() => bufferToTex(state.buf), [state.buf]);
  const inputHtml = useMemo(
    () => katex.renderToString(inputTex, { throwOnError: false, output: "html" }),
    [inputTex],
  );

  if (!open) return null;

  const shift = state.mods.shift;
  const hyp = state.mods.hyp;
  const resultText =
    state.shown === "error" ? state.error : state.shown === "result" && state.result ? formatNatural(state.result, state.resultForm, state.fix) : null;

  const keyAria = (def: KeyDef): string => {
    // the SHIFT/hyp one-shot rewrites the trig labels (the device law);
    // the aria names are human-readable, the visual labels stay device-like
    if (typeof def.key === "object" && def.key.k === "trig") {
      const f = def.key.f;
      const full = f === "sin" ? "sine" : f === "cos" ? "cosine" : "tangent";
      if (shift && hyp) return `Arc hyperbolic ${full}`;
      if (shift) return `Arc${f}`;
      if (hyp) return `Hyperbolic ${full}`;
      return def.aria;
    }
    return def.aria;
  };
  const keyLabel = (def: KeyDef): string => {
    if (typeof def.key === "object" && def.key.k === "trig") {
      const f = def.key.f;
      if (shift && hyp) return `${f}⁻¹ʰ`;
      if (shift) return `${f}⁻¹`;
      if (hyp) return `${f}h`;
      return def.label;
    }
    return def.label;
  };

  return (
    <div
      data-gesture-exclude
      data-calc-root
      role="dialog"
      aria-label="Scientific calculator"
      className="fixed bottom-3 right-3 w-[min(360px,calc(100vw-16px))] max-h-[70vh] overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-900/95 p-3 shadow-2xl"
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
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium tracking-wide text-zinc-400">
          fx-83GT CW class · exam honest{shift ? " · SHIFT" : ""}{hyp ? " · hyp" : ""}
        </span>
        <button
          type="button"
          aria-label="Close calculator"
          className="rounded-md px-2 py-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onClose}
        >
          ✕
        </button>
      </div>

      {/* display: input preview (textbook math) + result/error line */}
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
        {/* T-MG-CALC run-002: the P2-lite copy affordance (card §6) — the
            displayed value to the clipboard; the answer-box handoff stays
            out until the operator names its home. */}
        {state.shown === "result" && state.result && (
          <div className="text-right">
            <button
              type="button"
              aria-label="Copy result"
              data-calc-copy
              className="text-xs text-zinc-400 hover:text-zinc-100"
              onPointerDown={(e) => {
                e.stopPropagation();
                const text = formatNatural(state.result!, state.resultForm, state.fix);
                if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).catch(() => {});
              }}
            >
              Copy result
            </button>
          </div>
        )}
      </div>

      {/* SETUP chips (MODE toggles): angle mode + display fix */}
      {setupOpen && (
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
            onClick={() => press({ k: "setup-fix", fix: 0 })}
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

      {/* the keypad: Casio CW posture, 5 columns */}
      <div className="mt-2 grid grid-cols-5 gap-1.5" data-calc-keypad>
        {GRID.flat().map((def) => {
          const isMode = def.key === "mode";
          return (
            <button
              key={def.aria}
              type="button"
              aria-label={keyAria(def)}
              data-calc-key={keyAria(def)}
              className={[
                "rounded-md py-2 text-sm select-none",
                def.accent ? "bg-zinc-700 text-zinc-100 hover:bg-zinc-600" : "bg-zinc-800 text-zinc-100 hover:bg-zinc-700",
                def.label === "=" ? "col-span-1" : "",
              ].join(" ")}
              onPointerDown={(e) => {
                e.stopPropagation();
                pointerPressAt.current = Date.now();
                if (relayRef.current.active) return; // a relayed gesture is never a press
                keyDefPress(def, isMode);
              }}
              /* run-003: real clicks and keyboard activation (Enter/Space)
                 fire click WITHOUT pointerdown — the a11y path. */
              onClick={() => {
                if (Date.now() - pointerPressAt.current < 500) return;
                if (relayRef.current.active) return;
                keyDefPress(def, isMode);
              }}
            >
              {keyLabel(def)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

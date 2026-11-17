/**
 * scientific-calculator.test.ts — T-MG-CALC run-001: the UI pin battery
 * (task card §3 UI list). jsdom posture: the ink harness is the FIRST
 * import (its module-order law applies unchanged — react-dom computes
 * its DOM facts at init).
 *
 * What is pinned here: the L1 overlay anatomy (one instance, the seam
 * marker, the close), the L8 keyboard parity, the L7 two-finger relay
 * onto the paper's gesture coordinator, the SHIFT/hyp one-shot label
 * law, the SETUP chips, and the end-to-end engine integration.
 */

import "../ink/ink-layer-pointerdown.harness";
import { pressPointerDown } from "../ink/ink-layer-pointerdown.harness";
import { describe, expect, test } from "bun:test";
import { act } from "react";
import React from "react";
import { createRoot } from "react-dom/client";

import { ScientificCalculator } from "./ScientificCalculator";
import { defaultPersisted, loadPersisted } from "./calc-models";

const doc = window.document;

function mount(props: {
  open: boolean;
  onClose?: () => void;
  gesturePlane?: { current: { zoomStep?: (dir: 1 | -1) => void } | undefined };
  /** T-MG-CALC-2 phase A: the paper's level hint (the course slug). */
  levelHint?: string;
  /** the persisted record seeded before render. The EXISTING pins ride
   * the classic layout (byte-identical run-001 behaviour); the CW-shell
   * pins seed "cw" explicitly. */
  seed?: { layout?: "cw" | "classic"; model?: string | null };
}): { root: ReturnType<typeof createRoot>; el: HTMLElement } {
  const container = doc.createElement("div");
  doc.body.appendChild(container);
  window.localStorage.setItem(
    "syllab-calculator-v1",
    JSON.stringify({
      v: 1,
      layout: props.seed?.layout ?? "classic",
      model: props.seed && "model" in props.seed ? props.seed.model : "fx-83gt-cw",
      settings: { io: "mathI/mathO", angle: "deg", numberFormat: { kind: "norm", variant: 2 }, fraction: "improper", decimalMark: ".", digitSeparator: false },
    }),
  );
  const root = createRoot(container);
  act(() => {
    root.render(React.createElement(ScientificCalculator, { onClose: () => {}, ...props }));
  });
  return { root, el: container };
}

/** phase A: a CW-layout mount (the new default posture). */
function mountCW(props?: Parameters<typeof mount>[0]) {
  return mount({ open: true, ...props, seed: { layout: "cw", ...(props?.seed ?? {}) } });
}

/** a click on ANY surfaced control (the shell screens' buttons carry
 * data-calc-screen-btn / data-calc-app, not data-calc-key). */
function clickCtl(el: HTMLElement, dataAttr: string, value: string) {
  const btn =
    el.querySelector<HTMLButtonElement>(`[${dataAttr}="${value}"]`) ??
    el.querySelector<HTMLButtonElement>(`[aria-label="${value}"]`);
  if (!btn) throw new Error(`no control "${dataAttr}=${value}"`);
  act(() => {
    btn.dispatchEvent(new window.MouseEvent("pointerdown", { bubbles: true, cancelable: true }));
  });
}

function clickKey(el: HTMLElement, aria: string) {
  const btn =
    el.querySelector<HTMLButtonElement>(`[data-calc-key="${aria}"]`) ??
    el.querySelector<HTMLButtonElement>(`[aria-label="${aria}"]`);
  if (!btn) throw new Error(`no key "${aria}"`);
  act(() => {
    btn.dispatchEvent(new window.MouseEvent("pointerdown", { bubbles: true, cancelable: true }));
  });
}

function resultText(el: HTMLElement): string {
  return el.querySelector("[data-calc-result]")?.textContent ?? "";
}

/** T-MG-CALC run-002: the posture pins scan the SHARED jsdom document —
 * earlier files' leftovers (stray pp-inkLayer canvases, pressed tool
 * buttons from the ink pins) would hijack the relay's own selectors.
 * Sweep the classes of DOM the component scans before each posture pin;
 * every swept test has already finished its assertions. */
function sweepStrays() {
  doc.querySelectorAll("canvas.pp-inkLayer").forEach((c) => c.remove());
  doc.querySelectorAll('button[aria-pressed="true"]').forEach((b) => {
    const l = b.getAttribute("aria-label") || "";
    if (["Draw", "Text", "Math text box", "Select", "Erase", "Line", "Ruler", "Protractor", "Compasses"].some((p) => l.startsWith(p))) b.remove();
  });
}

describe("(U1) the overlay anatomy (card L1)", () => {
  test("(U1a) open: one dialog root with the gesture-exclusion seam marker", () => {
    const { root, el } = mount({ open: true });
    const rootEl = el.querySelector("[data-calc-root]");
    expect(rootEl).not.toBeNull();
    expect(rootEl!.hasAttribute("data-gesture-exclude")).toBe(true);
    expect(rootEl!.getAttribute("role")).toBe("dialog");
    expect(rootEl!.getAttribute("aria-label")).toBe("Scientific calculator");
    expect(el.querySelectorAll("[data-calc-root]").length).toBe(1);
    act(() => {
      root.unmount();
    });
  });
  test("(U1b) closed: the component renders NOTHING (no hidden calculator)", () => {
    const { root, el } = mount({ open: false });
    expect(el.querySelector("[data-calc-root]")).toBeNull();
    act(() => {
      root.unmount();
    });
  });
  test("(U1c) the close button calls onClose", () => {
    let closed = false;
    const { root, el } = mount({ open: true, onClose: () => (closed = true) });
    const closeBtn = el.querySelector<HTMLButtonElement>('[aria-label="Close calculator"]');
    expect(closeBtn).not.toBeNull();
    act(() => {
      closeBtn!.click();
    });
    expect(closed).toBe(true);
    act(() => {
      root.unmount();
    });
  });
});

describe("(U2) the SHIFT/hyp one-shot label law", () => {
  test("(U2a) SHIFT rewrites sine to arcsin; the state banner shows SHIFT", () => {
    const { root, el } = mount({ open: true });
    expect(el.querySelector('[data-calc-key="Sine"]')).not.toBeNull();
    clickKey(el, "Shift");
    expect(el.querySelector('[data-calc-key="Arcsin"]')).not.toBeNull();
    expect(el.textContent).toContain("SHIFT");
    act(() => {
      root.unmount();
    });
  });
  test("(U2b) hyp rewrites sine to Hyperbolic sine; SHIFT+hyp → arc-hyperbolic", () => {
    const { root, el } = mount({ open: true });
    clickKey(el, "Hyperbolic");
    expect(el.querySelector('[data-calc-key="Hyperbolic sine"]')).not.toBeNull();
    clickKey(el, "Shift");
    expect(el.querySelector('[data-calc-key="Arc hyperbolic sine"]')).not.toBeNull();
    act(() => {
      root.unmount();
    });
  });
});

describe("(U3) end-to-end through the engine", () => {
  test("(U3a) 5 + 3 = shows 8 on the result line", () => {
    const { root, el } = mount({ open: true });
    clickKey(el, "5");
    clickKey(el, "Add");
    clickKey(el, "3");
    expect(resultText(el)).toBe(""); // nothing commits before '='
    clickKey(el, "Equals");
    expect(resultText(el)).toBe("8");
    act(() => {
      root.unmount();
    });
  });
  test("(U3b) 1 ÷ 3 = shows the EXACT fraction 1/3 (the amended L4 law), S⇔D → decimal", () => {
    const { root, el } = mount({ open: true });
    clickKey(el, "1");
    clickKey(el, "Divide");
    clickKey(el, "3");
    clickKey(el, "Equals");
    expect(resultText(el)).toBe("1/3");
    clickKey(el, "Toggle fraction decimal");
    expect(resultText(el)).toBe("0.3333333333");
    act(() => {
      root.unmount();
    });
  });
  test("(U3c) a Math ERROR renders on the result line and recovers", () => {
    const { root, el } = mount({ open: true });
    clickKey(el, "1");
    clickKey(el, "Divide");
    clickKey(el, "0");
    clickKey(el, "Equals");
    expect(resultText(el)).toBe("Math ERROR");
    clickKey(el, "All clear");
    expect(resultText(el)).toBe("");
    act(() => {
      root.unmount();
    });
  });
});

describe("(U4) the L8 keyboard parity", () => {
  test("(U4a) digits + Enter compute; Backspace deletes; Escape closes", () => {
    let closed = false;
    const { root, el } = mount({ open: true, onClose: () => (closed = true) });
    const fire = (key: string) =>
      act(() => {
        window.dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
      });
    fire("5");
    fire("+");
    fire("3");
    fire("Enter");
    expect(resultText(el)).toBe("8");
    fire("Backspace"); // DEL on the result → back to input? the engine: DEL edits the buffer
    fire("Escape");
    expect(closed).toBe(true);
    act(() => {
      root.unmount();
    });
  });
  test("(U4b) * and / map to × and ÷ (the desktop operator keys)", () => {
    const { root, el } = mount({ open: true });
    const fire = (key: string) =>
      act(() => {
        window.dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
      });
    fire("6");
    fire("*");
    fire("2");
    fire("Enter");
    expect(resultText(el)).toBe("12");
    act(() => {
      root.unmount();
    });
  });
});

describe("(U5) the L7 two-finger relay onto the paper", () => {
  test("(U5a) two touch pointers on the overlay relay pointerdowns onto the visible ink canvas (run-002 semantics: a tool ARMED)", () => {
    sweepStrays();
    // the armed Draw button — with NOTHING pressed the relay correctly
    // reads the resting state as SELECT (U7a) and pans the scroller
    const armed = doc.createElement("button");
    armed.setAttribute("aria-label", "Draw");
    armed.setAttribute("aria-pressed", "true");
    doc.body.appendChild(armed);
    // a stand-in paper canvas: the relay's own visible-canvas selector
    const fake = doc.createElement("canvas");
    fake.className = "pp-inkLayer";
    Object.defineProperty(fake, "getBoundingClientRect", {
      value: () => ({ width: 400, height: 300, top: 10, left: 10, right: 410, bottom: 310, x: 10, y: 10, toJSON: () => ({}) }),
    });
    doc.body.appendChild(fake);
    const seen: Array<{ type: string; pointerType?: string; pointerId?: number }> = [];
    fake.addEventListener("pointerdown", (ev) => {
      const e = ev as Event & { pointerType?: string; pointerId?: number };
      seen.push({ type: ev.type, pointerType: e.pointerType, pointerId: e.pointerId });
    });
    fake.addEventListener("pointermove", (ev) => seen.push({ type: ev.type }));
    fake.addEventListener("pointerup", (ev) => seen.push({ type: ev.type }));

    const { root, el } = mount({ open: true });
    const rootEl = el.querySelector("[data-calc-root]")!;
    act(() => {
      rootEl.dispatchEvent(pressPointerDown(rootEl, { pointerType: "touch", pointerId: 11, clientX: 30, clientY: 40 }).ev);
    });
    expect(seen.length).toBe(0); // ONE finger is a calculator press, never a relay
    act(() => {
      rootEl.dispatchEvent(pressPointerDown(rootEl, { pointerType: "touch", pointerId: 12, clientX: 90, clientY: 60 }).ev);
    });
    expect(seen.length).toBe(2); // BOTH pointers land on the paper as a gesture
    expect(seen[0].pointerType).toBe("touch");
    expect(seen[0].pointerId).toBe(11);
    expect(seen[1].pointerId).toBe(12);
    armed.remove();
    act(() => {
      root.unmount();
    });
    fake.remove();
  });
});

describe("(U6) the SETUP chips (MODE)", () => {
  test("(U6a) MODE opens the setup row; GRA flips the angle mode and sin 100 gon = 1", () => {
    const { root, el } = mount({ open: true });
    expect(el.querySelector("[data-calc-setup]")).toBeNull();
    clickKey(el, "Mode setup");
    expect(el.querySelector("[data-calc-setup]")).not.toBeNull();
    clickKey(el, "Angle mode GRA");
    // end-to-end: in GRA, sin(100) = 1 (100 gon = 90°)
    clickKey(el, "Sine");
    clickKey(el, "1");
    clickKey(el, "0");
    clickKey(el, "0");
    clickKey(el, "Equals");
    expect(resultText(el)).toBe("1");
    act(() => {
      root.unmount();
    });
  });
});

// ── T-MG-CALC run-002: the SELECT-mode relay + the copy affordance ────

import { mock } from "bun:test";

describe("(U7) run-002: SELECT-mode gestures over the overlay", () => {
  /** a fake visible ink canvas under a real scrollable div ancestor. */
  function fakePaper(): { canvas: HTMLCanvasElement; scroller: HTMLDivElement } {
    const scroller = doc.createElement("div");
    scroller.style.overflowY = "auto";
    Object.defineProperty(scroller, "scrollHeight", { value: 4000, configurable: true });
    Object.defineProperty(scroller, "clientHeight", { value: 400, configurable: true });
    Object.defineProperty(scroller, "scrollTop", { value: 0, writable: true, configurable: true });
    Object.defineProperty(scroller, "scrollLeft", { value: 0, writable: true, configurable: true });
    const canvas = doc.createElement("canvas");
    canvas.className = "pp-inkLayer";
    Object.defineProperty(canvas, "getBoundingClientRect", {
      value: () => ({ width: 400, height: 300, top: 10, left: 10, right: 410, bottom: 310, x: 10, y: 10, toJSON: () => ({}) }),
    });
    scroller.appendChild(canvas);
    doc.body.appendChild(scroller);
    return { canvas, scroller };
  }

  const fire = (target: Element, type: string, x: number, y: number, id: number, pt = "touch") =>
    act(() => {
      // instance-level fields via defineProperty — MouseEvent's pointer
      // fields are prototype getters (the harness's documented posture;
      // a plain Object.assign throws "readonly property" in strict ESM)
      const ev = new window.MouseEvent(type, { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y });
      Object.defineProperties(ev, {
        pointerType: { value: pt },
        pointerId: { value: id },
        isPrimary: { value: true },
        buttons: { value: type === "pointerdown" ? 1 : 0 },
        pressure: { value: 0 },
      });
      target.dispatchEvent(ev);
    });

  test("(U7a) SELECT armed (resting): two touches on the overlay PAN THE SCROLLER directly, never the canvas", () => {
    sweepStrays();
    const { root, el } = mount({ open: true });
    const { canvas, scroller } = fakePaper();
    const seen: string[] = [];
    canvas.addEventListener("pointerdown", () => seen.push("down"));
    const rootEl = el.querySelector("[data-calc-root]")!;
    const r = { left: 300, bottom: 700 };
    fire(rootEl, "pointerdown", r.left + 60, r.bottom - 60, 111);
    fire(rootEl, "pointerdown", r.left + 160, r.bottom - 60, 112);
    for (let i = 1; i <= 5; i++) {
      fire(rootEl, "pointermove", r.left + 60 - i * 6, r.bottom - 60 - i * 20, 111);
      fire(rootEl, "pointermove", r.left + 160 - i * 6, r.bottom - 60 - i * 20, 112);
    }
    fire(rootEl, "pointerup", 0, 0, 111);
    fire(rootEl, "pointerup", 0, 0, 112);
    expect(seen.length).toBe(0); // select-mode touches never reach the canvas
    expect(scroller.scrollTop).toBeGreaterThan(0); // the paper PANNED
    act(() => {
      root.unmount();
    });
    scroller.remove();
  });

  test("(U7b) SELECT-mode pinch steps zoom through the gesturePlane bridge (the coordinator's 1.2× rule)", () => {
    sweepStrays();
    const zoomStep = mock<(dir: 1 | -1) => void>(() => {});
    const { root, el } = mount({ open: true, gesturePlane: { current: { zoomStep } } } as never);
    const { scroller } = fakePaper();
    const rootEl = el.querySelector("[data-calc-root]")!;
    // spread 100 → 170: the STEPWISE law — each 1.2× crossing steps once,
    // re-anchoring on the stepped spread (per-finger moves cross twice)
    fire(rootEl, "pointerdown", 400, 500, 121);
    fire(rootEl, "pointerdown", 500, 500, 122);
    fire(rootEl, "pointermove", 365, 500, 121); // 135 → 1.35×: step in
    fire(rootEl, "pointermove", 535, 500, 122); // 170 → 1.26×: step in
    expect(zoomStep.mock.calls).toEqual([[1], [1]]);
    // back down 170 → 100: two honest 1/1.2 crossings → two steps out
    fire(rootEl, "pointermove", 400, 500, 121); // 135 → 0.79: step out
    fire(rootEl, "pointermove", 500, 500, 122); // 100 → 0.74: step out
    expect(zoomStep.mock.calls).toEqual([[1], [1], [-1], [-1]]);
    expect(scroller.scrollTop).toBe(0); // pure pinch: no vertical drift
    act(() => {
      root.unmount();
    });
    scroller.remove();
  });

  test("(U7c) a tool ARMED keeps the run-001 canvas relay (scroller untouched)", () => {
    sweepStrays();
    const { root, el } = mount({ open: true });
    const { canvas, scroller } = fakePaper();
    // the armed Draw button (the real toolbar's aria-pressed posture)
    const draw = doc.createElement("button");
    draw.setAttribute("aria-label", "Draw");
    draw.setAttribute("aria-pressed", "true");
    doc.body.appendChild(draw);
    const seen: string[] = [];
    canvas.addEventListener("pointerdown", () => seen.push("down"));
    const rootEl = el.querySelector("[data-calc-root]")!;
    fire(rootEl, "pointerdown", 400, 500, 131);
    fire(rootEl, "pointerdown", 500, 500, 132);
    expect(seen.length).toBe(2); // BOTH pointers land on the canvas → the coordinator
    expect(scroller.scrollTop).toBe(0); // the relay never pans directly when armed
    draw.remove();
    act(() => {
      root.unmount();
    });
    scroller.remove();
  });
});

describe("(U8) run-002: the copy affordance (card §6 P2-lite)", () => {
  test("(U8a) a committed result offers Copy; the click writes the DISPLAYED value to the clipboard", async () => {
    const writes: string[] = [];
    const writeText = mock<(t: string) => Promise<void>>((t) => {
      writes.push(t);
      return Promise.resolve();
    });
    Object.defineProperty(window.navigator, "clipboard", { value: { writeText }, configurable: true });
    const { root, el } = mount({ open: true });
    expect(el.querySelector("[data-calc-copy]")).toBeNull(); // nothing to copy before '='
    clickKey(el, "5");
    clickKey(el, "Add");
    clickKey(el, "3");
    clickKey(el, "Equals");
    const copyBtn = el.querySelector<HTMLButtonElement>("[data-calc-copy]");
    expect(copyBtn).not.toBeNull();
    expect(copyBtn!.getAttribute("aria-label")).toBe("Copy result");
    act(() => {
      copyBtn!.dispatchEvent(new window.MouseEvent("pointerdown", { bubbles: true, cancelable: true }));
    });
    expect(writes).toEqual(["8"]);
    // an ERROR state hides the affordance
    clickKey(el, "1");
    clickKey(el, "Divide");
    clickKey(el, "0");
    clickKey(el, "Equals");
    expect(el.querySelector("[data-calc-copy]")).toBeNull();
    act(() => {
      root.unmount();
    });
    delete (window.navigator as unknown as { clipboard?: unknown }).clipboard;
  });
});

// ── T-MG-CALC run-003: the keyboard as a USER sees it ─────────────────
// The operator's receipt: the run-001/002 verifies fired synthetic
// pointerdowns and never LOOKED at the rendered keyboard. The mobile
// screenshot showed the QP/MS pill (z-50) floating over the keypad's
// bottom row (./+/S⇔D buried), a bare black display with no resting
// "0", and keys wired pointer-only (real clicks / keyboard activation
// did nothing). Pins for all three, plus the z-law.

describe("(U9) run-003: the keyboard reads as a device and works by click/keyboard", () => {
  test("(U9a) at rest the display shows the device's muted '0'; it leaves on the first digit", () => {
    const { root, el } = mount({ open: true });
    const zero = el.querySelector("[data-calc-zero]");
    expect(zero?.textContent).toBe("0");
    clickKey(el, "5");
    expect(el.querySelector("[data-calc-zero]")).toBeNull();
    expect(el.querySelector("[data-calc-input]")?.textContent).toContain("5");
    act(() => {
      root.unmount();
    });
  });

  test("(U9b) the input line carries a LIGHT text color — run-003 fixup: the typed expression rendered near-black on the near-black panel (invisible until '=')", () => {
    const { root, el } = mount({ open: true });
    const line = el.querySelector("[data-calc-input]") as HTMLElement;
    expect(line.className).toContain("text-zinc-100");
    act(() => {
      root.unmount();
    });
  });

  test("(U9c) a real CLICK (no pointerdown) presses exactly once — keyboard/mouse a11y path", () => {
    const { root, el } = mount({ open: true });
    const key = el.querySelector<HTMLButtonElement>('[data-calc-key="7"]');
    expect(key).not.toBeNull();
    act(() => {
      key!.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    expect(el.querySelector("[data-calc-input]")?.textContent).toContain("7");
    act(() => {
      root.unmount();
    });
  });

  test("(U9d) pointerdown + trailing click stays ONE press (the guard)", () => {
    const { root, el } = mount({ open: true });
    const key = el.querySelector<HTMLButtonElement>('[data-calc-key="7"]');
    act(() => {
      key!.dispatchEvent(new window.MouseEvent("pointerdown", { bubbles: true, cancelable: true }));
      key!.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    expect(el.querySelector("[data-calc-input]")?.textContent).toContain("7");
    expect(el.querySelector("[data-calc-input]")?.textContent).not.toContain("77");
    act(() => {
      root.unmount();
    });
  });

  test("(U9e) the z-law: the overlay rides ABOVE the viewer's floating QP/MS pill (55 > 50)", () => {
    const { root, el } = mount({ open: true });
    const rootEl = el.querySelector("[data-calc-root]") as HTMLElement;
    expect(rootEl.style.zIndex).toBe("55");
    act(() => {
      root.unmount();
    });
  });
});

// ── T-MG-CALC-2 phase A: the CW device shell ───────────────────────────
// The chase card's spec pins, verified against the REAL component: the
// shell posture, the level-driven picker, the OK-dial + the staged-
// rollout notice (MG's captured pattern), the numbered SETTINGS dialog
// with the FIX law end-to-end, the CATALOG, the VARIABLE ⇄x store, the
// FUNCTION f(x) sheet, and the classic round-trip.

describe("(U10) phase A: the CW shell anatomy (the default posture)", () => {
  test("(U10a) the CW grid carries the shell keys, the interleave and the wide EXE; no MODE key", () => {
    const { root, el } = mountCW();
    expect(el.querySelector("[data-calc-layout]")?.getAttribute("data-calc-layout")).toBe("cw");
    for (const aria of ["Home", "Variable", "Settings", "Catalog", "Tools", "Function", "OK", "Execute", "Off", "Back", "variable A", "variable x", "variable z", "Times ten to the power", "Toggle mixed improper"]) {
      expect(el.querySelector(`[data-calc-key="${aria}"]`)).not.toBeNull();
    }
    expect(el.querySelector('[data-calc-key="Mode setup"]')).toBeNull();
    // the digit COMPLETENESS law (the prod battery caught the grid
    // shipping without 7/8/9 once — never again)
    for (const d of "0123456789") {
      expect(el.querySelector(`[data-calc-key="${d}"]`)).not.toBeNull();
    }
    for (const aria of ["Add", "Subtract", "Multiply", "Divide", "Percent", "Engineering notation", "Euler constant"]) {
      expect(el.querySelector(`[data-calc-key="${aria}"]`)).not.toBeNull();
    }
    act(() => {
      root.unmount();
    });
  });
  test("(U10b) EXE computes; the header names the model layout", () => {
    const { root, el } = mountCW();
    clickKey(el, "5");
    clickKey(el, "Add");
    clickKey(el, "3");
    expect(resultText(el)).toBe("");
    clickKey(el, "Execute");
    expect(resultText(el)).toBe("8");
    expect(el.textContent).toContain("fx-83GT CW layout");
    expect(el.textContent).toContain("Not affiliated with Casio.");
    act(() => {
      root.unmount();
    });
  });
  test("(U10c) SHIFT relabels the structural keys AND computes the remap (2 SHIFT x² = 8)", () => {
    const { root, el } = mountCW();
    clickKey(el, "2"); // the value first — SHIFT is one-shot and ANY key consumes it (the device law)
    clickKey(el, "Shift");
    expect(el.querySelector('[data-calc-key="Cube"]')).not.toBeNull();
    expect(el.querySelector('[data-calc-key="Square"]')).toBeNull();
    clickKey(el, "Cube");
    clickKey(el, "Execute");
    expect(resultText(el)).toBe("8");
    act(() => {
      root.unmount();
    });
  });
  test("(U10d) the picker defaults by the level hint (MG's map) and the solar skin rides the model", () => {
    const igcse = mount({ open: true, levelHint: "igcse-chemistry-19", seed: { layout: "cw", model: null } });
    expect(igcse.el.textContent).toContain("fx-991 CW layout");
    expect(igcse.el.querySelector("[data-calc-solar]")).not.toBeNull();
    const picker = igcse.el.querySelector<HTMLSelectElement>("[data-calc-model-picker]")!;
    expect([...picker.options].map((o) => o.value)).toEqual(["fx-83gt-cw", "fx-85gt-cw", "fx-991cw"]);
    expect(picker.value).toBe("fx-991cw");
    act(() => {
      igcse.root.unmount();
    });
    const gcse = mount({ open: true, levelHint: "gcse-maths-edexcel", seed: { layout: "cw", model: null } });
    expect(gcse.el.textContent).toContain("fx-83GT CW layout");
    expect(gcse.el.querySelector("[data-calc-solar]")).toBeNull();
    act(() => {
      gcse.root.unmount();
    });
  });
  test("(U10e) the layout toggle returns the run-001 classic keypad byte-for-byte", () => {
    const { root, el } = mountCW();
    act(() => {
      (el.querySelector("[data-calc-layout-toggle]") as HTMLButtonElement).click();
    });
    expect(el.querySelector('[data-calc-key="Equals"]')).not.toBeNull();
    expect(el.querySelector('[data-calc-key="Mode setup"]')).not.toBeNull();
    act(() => {
      root.unmount();
    });
  });
});

describe("(U11) phase A: the shell screens", () => {
  test("(U11a) HOME lists the model's apps; the dial+OK flow lands an unimplemented app on MG's notice", () => {
    const { root, el } = mountCW();
    clickKey(el, "Home");
    expect(el.querySelector('[data-calc-screen="home"]')).not.toBeNull();
    for (const app of ["calculate", "statistics", "table", "ratio", "mathBox"]) {
      expect(el.querySelector(`[data-calc-app="${app}"]`)).not.toBeNull();
    }
    clickKey(el, "Cursor down");
    clickKey(el, "Cursor down");
    clickKey(el, "Cursor down");
    clickKey(el, "OK");
    expect(el.querySelector('[data-calc-screen="notice"]')).not.toBeNull();
    expect(el.querySelector("[data-calc-notice]")?.textContent).toBe("Ratio. This app isn't on the simulator yet.");
    act(() => {
      root.unmount();
    });
  });
  test("(U11b) SETTINGS: Fix 2 flows to the display law end-to-end (5÷3 → 1.67, S⇔D inert)", () => {
    const { root, el } = mountCW();
    clickKey(el, "Settings");
    expect(el.querySelector('[data-calc-screen="settings"]')).not.toBeNull();
    clickCtl(el, "data-calc-screen-btn", "Fixed decimals 2");
    clickCtl(el, "data-calc-screen-btn", "Settings done");
    clickKey(el, "5");
    clickKey(el, "Divide");
    clickKey(el, "3");
    clickKey(el, "Execute");
    expect(resultText(el)).toBe("1.67");
    clickKey(el, "Toggle fraction decimal");
    expect(resultText(el)).toBe("1.67");
    act(() => {
      root.unmount();
    });
  });
  test("(U11c) CATALOG: the 7 categories; Numeric → log inserts and computes log(100) = 2", () => {
    const { root, el } = mountCW();
    clickKey(el, "Catalog");
    expect(el.querySelectorAll("[data-calc-cat]").length).toBe(7);
    clickCtl(el, "data-calc-cat", "numeric");
    clickCtl(el, "data-calc-screen-btn", "Logarithm base 10");
    clickKey(el, "1");
    clickKey(el, "0");
    clickKey(el, "0");
    clickKey(el, "Execute");
    expect(resultText(el)).toBe("2");
    act(() => {
      root.unmount();
    });
  });
  test("(U11d) VARIABLE ⇄x: Store from the result, the sheet shows it, Insert evaluates (A×2 = 16)", () => {
    const { root, el } = mountCW();
    clickKey(el, "5");
    clickKey(el, "Add");
    clickKey(el, "3");
    clickKey(el, "Execute");
    clickKey(el, "Variable");
    expect(el.querySelector('[data-calc-screen="vars"]')).not.toBeNull();
    clickCtl(el, "data-calc-screen-btn", "Store variable A");
    expect(el.querySelector('[data-calc-var-value="A"]')?.textContent).toContain("A = 8");
    clickCtl(el, "data-calc-screen-btn", "Insert variable A");
    clickKey(el, "Multiply");
    clickKey(el, "2");
    clickKey(el, "Execute");
    expect(resultText(el)).toBe("16");
    act(() => {
      root.unmount();
    });
  });
  test("(U11e) FUNCTION f(x): the entry defines f, the call substitutes exactly (f(4) = 5)", () => {
    const { root, el } = mountCW();
    clickKey(el, "variable x");
    clickKey(el, "Add");
    clickKey(el, "1");
    clickKey(el, "Function");
    expect(el.querySelector('[data-calc-screen="fns"]')).not.toBeNull();
    clickCtl(el, "data-calc-screen-btn", "Define function f from entry");
    expect(el.querySelector('[data-calc-fn-value="f"]')?.textContent).toContain("x+1");
    clickCtl(el, "data-calc-screen-btn", "Insert function f");
    clickKey(el, "4");
    clickKey(el, "Execute");
    expect(resultText(el)).toBe("5");
    act(() => {
      root.unmount();
    });
  });
  test("(U11f) OFF closes the overlay (the device-true power key)", () => {
    let closed = false;
    const { root, el } = mount({ open: true, onClose: () => (closed = true), seed: { layout: "cw" } });
    clickKey(el, "Off");
    expect(closed).toBe(true);
    act(() => {
      root.unmount();
    });
  });
});

describe("(U12) phase A: the persisted record", () => {
  test("(U12a) a manual model choice persists to the record", () => {
    const { root, el } = mountCW();
    const picker = el.querySelector<HTMLSelectElement>("[data-calc-model-picker]")!;
    const set = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value")!.set!;
    act(() => {
      set.call(picker, "fx-991cw");
      picker.dispatchEvent(new window.Event("change", { bubbles: true }));
    });
    expect(window.localStorage.getItem("syllab-calculator-v1")).toContain('"fx-991cw"');
    act(() => {
      root.unmount();
    });
  });
  test("(U12b) a malformed record falls back to the defaults — never bricks the overlay", () => {
    window.localStorage.setItem("syllab-calculator-v1", "{definitely not json");
    const p = loadPersisted();
    expect(p.layout).toBe("cw");
    expect(p.settings.angle).toBe("deg");
    window.localStorage.setItem("syllab-calculator-v1", JSON.stringify(defaultPersisted()));
  });
});

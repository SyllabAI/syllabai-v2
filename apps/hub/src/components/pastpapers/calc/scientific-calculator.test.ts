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

const doc = window.document;

function mount(props: { open: boolean; onClose?: () => void }): { root: ReturnType<typeof createRoot>; el: HTMLElement } {
  const container = doc.createElement("div");
  doc.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(React.createElement(ScientificCalculator, { open: props.open, onClose: props.onClose ?? (() => {}) }));
  });
  return { root, el: container };
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
  test("(U5a) two touch pointers on the overlay relay pointerdowns onto the visible ink canvas", () => {
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

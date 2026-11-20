/**
 * paper-gestures.test.ts — T-MG-INK-13 run-001, the two-finger gesture
 * lane's regression seam (operator law: "2 fingers always scroll, pinch
 * always zooms, NO MATTER THE TOOL").
 *
 * The same jsdom posture as ink-penmode.test.ts (whose import-order law
 * applies: the harness is the FIRST import). What is pinned here:
 *
 *   (P) the pure module laws (isStrayStroke's boundary, the coordinator's
 *       state machine: pan1 immediacy, lock, pair-break, pinch freeze).
 *   (L1) two fingers pan in classic AND stylus mode, tool-agnostic; a
 *       stolen stray stroke leaves NO commit (no undo entry).
 *   (L2) two fingers pinch through the bridge (ladder steps, rebased)
 *       without scrolling.
 *   (L3) the lock: pan-locked gestures never zoom; pinch-locked gestures
 *       never scroll.
 *   (L4) pen precedence: a pen down tears the gesture plane down (moves
 *       after it are inert, nothing commits).
 *   (L5) the mature-stroke complement: a second finger on a MATURE stroke
 *       is swallowed and the stroke still commits.
 *   (L8) a two-finger tap does nothing.
 *   (S) select stays unregistered: the native+s144 resting plane is
 *       untouched by the coordinator (the shipped behavior).
 *   (C) pointercancel cleans; a fresh stroke draws afterwards.
 */
import "./ink-layer-pointerdown.harness";

import { afterEach, describe, expect, mock, test } from "bun:test";

import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

import {
  doc,
  pressPointerDown,
  pressPointerMove,
  releasePointerUp,
} from "./ink-layer-pointerdown.harness";

import { InkCanvas, type InkCanvasProps } from "./InkLayer";
import { createGesturePlane } from "./gesturePlane";
import { isStrayStroke, PaperGestures } from "./paperGestures";
import type { InkColor, InkShape, InkTextShape } from "./ink";

async function dispatchOn(canvas: Element, ev: Event) {
  await act(async () => {
    canvas.dispatchEvent(ev);
  });
}

// ── the seam mount (the ink-penmode pattern) ──

let lastUnmount: (() => Promise<void>) | null = null;

function countingBridge() {
  const calls: Array<1 | -1> = [];
  return { bridge: { zoomStep: (d: 1 | -1) => calls.push(d) }, calls };
}

async function mountGestureCanvas(overrides: Partial<InkCanvasProps> = {}) {
  const commits = {
    stroke: mock((_page: number, _points: Array<[number, number]>, _pressures?: number[] | null) => {}),
    text: mock((_shape: Omit<InkTextShape, "id" | "kind">) => {}),
    math: mock((_shape: unknown) => {}),
    textEdit: mock((_id: string, _text: string) => {}),
    mathEdit: mock((_id: string, _tex: string) => {}),
    erase: mock((_ids: string[]) => {}),
    move: mock((_shape: InkShape) => {}),
  };
  const pinch = countingBridge();
  const gestures = overrides.gestures ?? new PaperGestures(pinch.bridge);
  const container = doc.createElement("div");
  doc.body.appendChild(container);
  const root = createRoot(container);
  const props: InkCanvasProps = {
    page: 1,
    shapes: [],
    mode: "pen",
    color: "red" as InkColor,
    widthFrac: 0.0038,
    onCommitStroke: commits.stroke,
    onCommitText: commits.text,
    onCommitMath: commits.math as never,
    onCommitTextEdit: commits.textEdit,
    onCommitMathEdit: commits.mathEdit,
    onCommitErase: commits.erase,
    onCommitMove: commits.move,
    gestures,
    ...overrides,
  };
  if (!props.liveToolsRef) {
    props.liveToolsRef = {
      current: { mode: props.mode, color: props.color, widthFrac: props.widthFrac },
    };
  }
  const render = (p: InkCanvasProps) =>
    act(async () => {
      root.render(React.createElement(InkCanvas, p));
    });
  await render(props);
  const canvas = container.querySelector("canvas")!;
  lastUnmount = async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    lastUnmount = null;
  };
  return { commits, canvas, container, gestures, pinch };
}

function installFakeScroller() {
  const el = { scrollTop: 0, scrollLeft: 0 };
  Object.defineProperty(doc, "scrollingElement", {
    configurable: true,
    get: () => el,
  });
  return el;
}

afterEach(async () => {
  if (lastUnmount) await lastUnmount();
  delete (doc as unknown as Record<string, unknown>).scrollingElement;
});

// ── (P) pure laws ──

describe("(P) paperGestures pure laws", () => {
  test("(P-a) isStrayStroke: young+short is stray; older or longer is not", () => {
    const t0 = 1000;
    expect(isStrayStroke(t0, { x: 0, y: 0 }, t0 + 150, 8, 0)).toBe(true);
    expect(isStrayStroke(t0, { x: 0, y: 0 }, t0 + 151, 0, 0)).toBe(false);
    expect(isStrayStroke(t0, { x: 0, y: 0 }, t0 + 10, 9, 0)).toBe(false);
    expect(isStrayStroke(t0, { x: 3, y: 4 }, t0 + 10, 0, 0)).toBe(true); // 5px travel
  });

  test("(P-b) pan1 pans from the FIRST move (beginPan parity)", () => {
    const g = new PaperGestures(null);
    const el = { scrollTop: 0, scrollLeft: 0 };
    g.pointerDown(1, 100, 100, "pan", el);
    expect(g.pointerMove(1, 100, 130)).toBe(true);
    expect(el.scrollTop).toBe(-30);
    g.pointerUp(1);
    expect(g.active()).toBe(false);
  });

  test("(P-c) the lock: pan stays pan under later spread; pinch stays pinch under travel", () => {
    const calls: Array<1 | -1> = [];
    // pinch lock (BOTH fingers move — the skew guard needs each pointer
    // to report once before the lock evaluates), then continued spread steps
    const g = new PaperGestures({ zoomStep: (d) => calls.push(d) });
    const el = { scrollTop: 0, scrollLeft: 0 };
    g.pointerDown(1, 100, 100, "pan", el);
    g.pointerDown(2, 200, 100, "pan", el); // centroid0 (150,100), spread0 100
    g.pointerMove(1, 80, 100);
    g.pointerMove(2, 220, 100); // spread 140 (delta 40) → pinch lock
    g.pointerMove(1, 0, 100);
    g.pointerMove(2, 240, 100); // spread 240/140 = 1.71 → one step, rebased
    expect(calls).toEqual([1]);
    expect(el.scrollTop).toBe(0); // travel never scrolls a pinch-locked gesture
    g.cancelAll();
    // pan lock complement: spread holds, the centroid travels → scroll
    const g2 = new PaperGestures({ zoomStep: (d) => calls.push(d) });
    const el2 = { scrollTop: 0, scrollLeft: 0 };
    g2.pointerDown(1, 100, 100, "pan", el2);
    g2.pointerDown(2, 140, 100, "pan", el2); // spread0 40, centroid0 (120,100)
    g2.pointerMove(1, 100, 140);
    g2.pointerMove(2, 140, 140); // allMoved: centroid (120,140) travel 40, spread delta 0 → PAN lock
    g2.pointerMove(1, 100, 240);
    g2.pointerMove(2, 140, 240); // centroid dy 100 → panned; spread never zoomed
    expect(el2.scrollTop).toBe(-100);
    expect(calls.length).toBe(1); // still just the pinch phase's one step
  });

  test("(P-d) pair break: pinch steps then freezes; a promoted pointer keeps panning", () => {
    const pinchCalls: Array<1 | -1> = [];
    const g = new PaperGestures({ zoomStep: (d) => pinchCalls.push(d) });
    const el = { scrollTop: 0, scrollLeft: 0 };
    g.pointerDown(1, 100, 100, "pan", el);
    g.pointerDown(2, 140, 100, "pan", el); // spread0 40, centroid0 (120,100)
    g.pointerMove(1, 90, 100); // spread 50 delta 10 <14; travel 5 — armed
    g.pointerMove(2, 154, 100); // spread 64 delta 24 ≥14 → pinch lock (rebased at 40)
    g.pointerMove(1, 60, 100); // spread 94: ratio 2.35 ≥1.2 → one step, rebased at 94
    expect(pinchCalls).toEqual([1]);
    g.pointerUp(2); // pair broke — pinch freezes
    g.pointerMove(1, 0, 100);
    g.pointerMove(2, 300, 100); // lifted pointer: untracked, ignored
    expect(pinchCalls.length).toBe(1); // frozen after the break
    // pan-break complement: a promoted pointer keeps panning
    const g2 = new PaperGestures(null);
    const el2 = { scrollTop: 0, scrollLeft: 0 };
    g2.pointerDown(1, 100, 100, "tool", el2);
    g2.pointerPromote(1);
    g2.pointerDown(2, 150, 100, "tool", el2);
    g2.pointerUp(2);
    g2.pointerMove(1, 100, 140); // remaining pointer pans
    expect(el2.scrollTop).toBe(-40);
  });
});

describe("(P-e) the shared plane factory (the live pinch-kill regression)", () => {
  test("(P-e) createGesturePlane() is born POPULATED — pdf-pane's bridge effect reads gesturePlane?.current once per zoomBy identity; an undefined current returned forever and draw-armed pinch silently no-opped live (pan worked, pinch dead both directions)", () => {
    const plane = createGesturePlane();
    expect(plane.current).toBeDefined();
    expect(typeof plane.current).toBe("object");
  });
});

// ── (L1) two-finger pan, tool-agnostic ──

describe("(L1) two-finger pan", () => {
  test("(L1-a) classic freehand: a stray dot is stolen — no commit, both fingers pan", async () => {
    const el = installFakeScroller();
    const { commits, canvas } = await mountGestureCanvas();
    // finger 1 opens a stroke…
    await dispatchOn(canvas, pressPointerDown(canvas, { clientX: 100, clientY: 75, pointerType: "touch", pointerId: 8 }).ev);
    await dispatchOn(canvas, pressPointerMove(canvas, { clientX: 103, clientY: 76, pointerType: "touch", pointerId: 8 }));
    // …finger 2 lands while the stroke is young → the L5 steal
    await dispatchOn(canvas, pressPointerDown(canvas, { clientX: 104, clientY: 77, pointerType: "touch", pointerId: 9 }).ev);
    // both fingers travel TOGETHER (real pan) → centroid pan, both axes
    await dispatchOn(canvas, pressPointerMove(canvas, { clientX: 63, clientY: 76, pointerType: "touch", pointerId: 8 }));
    await dispatchOn(canvas, pressPointerMove(canvas, { clientX: 64, clientY: 77, pointerType: "touch", pointerId: 9 }));
    await dispatchOn(canvas, pressPointerMove(canvas, { clientX: 23, clientY: 116, pointerType: "touch", pointerId: 8 }));
    await dispatchOn(canvas, pressPointerMove(canvas, { clientX: 24, clientY: 117, pointerType: "touch", pointerId: 9 }));
    await dispatchOn(canvas, releasePointerUp(canvas, { clientX: 23, clientY: 116, pointerType: "touch", pointerId: 8 }));
    await dispatchOn(canvas, releasePointerUp(canvas, { clientX: 24, clientY: 117, pointerType: "touch", pointerId: 9 }));
    expect(commits.stroke.mock.calls.length).toBe(0); // the stray dot never existed
    expect(el.scrollTop).toBe(-40); // the paper panned (centroid dy)
    expect(el.scrollLeft).toBe(40); // …and dx
  });

  test("(L1-b) stylus mode: one finger pans, the second upgrades to the two-finger plane", async () => {
    const el = installFakeScroller();
    const { commits, canvas, pinch } = await mountGestureCanvas({ mode: "pen", penMode: true });
    await dispatchOn(canvas, pressPointerDown(canvas, { clientX: 100, clientY: 75, pointerType: "touch", pointerId: 8 }).ev);
    await dispatchOn(canvas, pressPointerMove(canvas, { clientX: 100, clientY: 105, pointerType: "touch", pointerId: 8 }));
    expect(el.scrollTop).toBe(-30); // pan1 immediacy (the run-002 law)
    await dispatchOn(canvas, pressPointerDown(canvas, { clientX: 140, clientY: 75, pointerType: "touch", pointerId: 9 }).ev);
    await dispatchOn(canvas, pressPointerMove(canvas, { clientX: 100, clientY: 145, pointerType: "touch", pointerId: 8 }));
    await dispatchOn(canvas, pressPointerMove(canvas, { clientX: 140, clientY: 115, pointerType: "touch", pointerId: 9 }));
    await dispatchOn(canvas, pressPointerMove(canvas, { clientX: 100, clientY: 185, pointerType: "touch", pointerId: 8 }));
    await dispatchOn(canvas, pressPointerMove(canvas, { clientX: 140, clientY: 155, pointerType: "touch", pointerId: 9 }));
    expect(el.scrollTop).toBe(-70); // pan1's 30 + the locked gesture's 40
    expect(pinch.calls.length).toBe(0); // no zoom: the lock chose pan
    await dispatchOn(canvas, releasePointerUp(canvas, { clientX: 100, clientY: 145, pointerType: "touch", pointerId: 8 }));
    await dispatchOn(canvas, releasePointerUp(canvas, { clientX: 140, clientY: 115, pointerType: "touch", pointerId: 9 }));
    expect(commits.stroke.mock.calls.length).toBe(0); // touch never draws in stylus mode
  });
});

// ── (L2) pinch ──

describe("(L2) two-finger pinch", () => {
  test("(L2-a) spreading fingers steps the ladder through the bridge, not the scroll", async () => {
    const el = installFakeScroller();
    const { canvas, pinch } = await mountGestureCanvas({ mode: "pen", penMode: true });
    await dispatchOn(canvas, pressPointerDown(canvas, { clientX: 100, clientY: 100, pointerType: "touch", pointerId: 8 }).ev);
    await dispatchOn(canvas, pressPointerDown(canvas, { clientX: 180, clientY: 100, pointerType: "touch", pointerId: 9 }).ev);
    // spread 80 → 104 (+30%) → the LOCK (no step yet — the lock move only arms)
    await dispatchOn(canvas, pressPointerMove(canvas, { clientX: 88, clientY: 100, pointerType: "touch", pointerId: 8 }));
    await dispatchOn(canvas, pressPointerMove(canvas, { clientX: 192, clientY: 100, pointerType: "touch", pointerId: 9 }));
    expect(pinch.calls).toEqual([]);
    // rebased at spread0=80: the next pair crosses 1.2× → one zoom-in step
    await dispatchOn(canvas, pressPointerMove(canvas, { clientX: 78, clientY: 100, pointerType: "touch", pointerId: 8 }));
    await dispatchOn(canvas, pressPointerMove(canvas, { clientX: 202, clientY: 100, pointerType: "touch", pointerId: 9 }));
    expect(pinch.calls).toEqual([1]);
    // 124/104 < 1.2 — rebased again, no double step
    await dispatchOn(canvas, pressPointerMove(canvas, { clientX: 74, clientY: 100, pointerType: "touch", pointerId: 8 }));
    await dispatchOn(canvas, pressPointerMove(canvas, { clientX: 206, clientY: 100, pointerType: "touch", pointerId: 9 }));
    expect(pinch.calls).toEqual([1]);
    await dispatchOn(canvas, releasePointerUp(canvas, { clientX: 78, clientY: 100, pointerType: "touch", pointerId: 8 }));
    await dispatchOn(canvas, releasePointerUp(canvas, { clientX: 202, clientY: 100, pointerType: "touch", pointerId: 9 }));
    expect(el.scrollTop).toBe(0); // pinch never scrolls
  });

  test("(L2-b) classic mode pinches too — via the young-steal entry (L6 keeps mature strokes isolated)", async () => {
    installFakeScroller();
    const { commits, canvas, pinch } = await mountGestureCanvas({ mode: "pen" });
    // finger 1 opens a stroke; finger 2 lands WHILE IT IS YOUNG → steal
    await dispatchOn(canvas, pressPointerDown(canvas, { clientX: 100, clientY: 100, pointerType: "touch", pointerId: 8 }).ev);
    await dispatchOn(canvas, pressPointerDown(canvas, { clientX: 180, clientY: 100, pointerType: "touch", pointerId: 9 }).ev);
    // inward pinch: spread 80 → 56 (−30%) → the lock; then 48 crosses the out-ratio
    await dispatchOn(canvas, pressPointerMove(canvas, { clientX: 112, clientY: 100, pointerType: "touch", pointerId: 8 }));
    await dispatchOn(canvas, pressPointerMove(canvas, { clientX: 168, clientY: 100, pointerType: "touch", pointerId: 9 }));
    await dispatchOn(canvas, pressPointerMove(canvas, { clientX: 116, clientY: 100, pointerType: "touch", pointerId: 8 }));
    await dispatchOn(canvas, pressPointerMove(canvas, { clientX: 164, clientY: 100, pointerType: "touch", pointerId: 9 }));
    expect(pinch.calls).toEqual([-1]);
    await dispatchOn(canvas, releasePointerUp(canvas, { clientX: 116, clientY: 100, pointerType: "touch", pointerId: 8 }));
    await dispatchOn(canvas, releasePointerUp(canvas, { clientX: 164, clientY: 100, pointerType: "touch", pointerId: 9 }));
    expect(commits.stroke.mock.calls.length).toBe(0); // the stolen dot never committed
  });
});

// ── (L5) the mature-stroke complement ──

describe("(L5) mature strokes keep the isolation law", () => {
  test("(L5-a) a second finger on a MATURE stroke is swallowed; the stroke still commits", async () => {
    const el = installFakeScroller();
    const { commits, canvas } = await mountGestureCanvas();
    await dispatchOn(canvas, pressPointerDown(canvas, { clientX: 100, clientY: 75, pointerType: "touch", pointerId: 8 }).ev);
    await dispatchOn(canvas, pressPointerMove(canvas, { clientX: 160, clientY: 75, pointerType: "touch", pointerId: 8 }));
    await new Promise((r) => setTimeout(r, 170)); // age past the steal window
    await dispatchOn(canvas, pressPointerDown(canvas, { clientX: 104, clientY: 77, pointerType: "touch", pointerId: 9 }).ev);
    await dispatchOn(canvas, pressPointerMove(canvas, { clientX: 60, clientY: 77, pointerType: "touch", pointerId: 8 }));
    await dispatchOn(canvas, releasePointerUp(canvas, { clientX: 60, clientY: 77, pointerType: "touch", pointerId: 8 }));
    await dispatchOn(canvas, releasePointerUp(canvas, { clientX: 104, clientY: 77, pointerType: "touch", pointerId: 9 }));
    expect(commits.stroke.mock.calls.length).toBe(1); // the real stroke committed
    expect(el.scrollTop).toBe(0); // the palm never panned
  });
});

// ── (L4) pen precedence tears the plane down ──

describe("(L4) pen priority", () => {
  test("(L4-a) a pen down mid-gesture cancels it; later finger moves are inert", async () => {
    const el = installFakeScroller();
    const { commits, canvas } = await mountGestureCanvas({ mode: "pen", penMode: true });
    await dispatchOn(canvas, pressPointerDown(canvas, { clientX: 100, clientY: 100, pointerType: "touch", pointerId: 8 }).ev);
    await dispatchOn(canvas, pressPointerDown(canvas, { clientX: 180, clientY: 100, pointerType: "touch", pointerId: 9 }).ev);
    await dispatchOn(canvas, pressPointerDown(canvas, { clientX: 140, clientY: 140, pointerType: "pen", pointerId: 3, pressure: 0.5 }).ev);
    await dispatchOn(canvas, pressPointerMove(canvas, { clientX: 40, clientY: 100, pointerType: "touch", pointerId: 8 }));
    await dispatchOn(canvas, pressPointerMove(canvas, { clientX: 240, clientY: 100, pointerType: "touch", pointerId: 9 }));
    await dispatchOn(canvas, releasePointerUp(canvas, { clientX: 40, clientY: 100, pointerType: "touch", pointerId: 8 }));
    await dispatchOn(canvas, releasePointerUp(canvas, { clientX: 240, clientY: 100, pointerType: "touch", pointerId: 9 }));
    expect(el.scrollTop).toBe(0); // the plane is dead after the pen took over
    expect(commits.stroke.mock.calls.length).toBe(0); // and nothing half-committed
  });
});

// ── (L8) two-finger tap ──

describe("(L8) two-finger tap", () => {
  test("(L8-a) sub-threshold contact does nothing", async () => {
    const el = installFakeScroller();
    const { canvas, pinch } = await mountGestureCanvas({ mode: "pen", penMode: true });
    await dispatchOn(canvas, pressPointerDown(canvas, { clientX: 100, clientY: 100, pointerType: "touch", pointerId: 8 }).ev);
    await dispatchOn(canvas, pressPointerDown(canvas, { clientX: 180, clientY: 100, pointerType: "touch", pointerId: 9 }).ev);
    await dispatchOn(canvas, pressPointerMove(canvas, { clientX: 106, clientY: 102, pointerType: "touch", pointerId: 8 }));
    await dispatchOn(canvas, pressPointerMove(canvas, { clientX: 176, clientY: 99, pointerType: "touch", pointerId: 9 }));
    await dispatchOn(canvas, releasePointerUp(canvas, { clientX: 106, clientY: 102, pointerType: "touch", pointerId: 8 }));
    await dispatchOn(canvas, releasePointerUp(canvas, { clientX: 176, clientY: 99, pointerType: "touch", pointerId: 9 }));
    expect(el.scrollTop).toBe(0);
    expect(el.scrollLeft).toBe(0);
    expect(pinch.calls.length).toBe(0);
  });
});

// ── (S) select stays unregistered ──

describe("(S) select mode: the shipped native plane", () => {
  test("(S-a) the coordinator never claims select touches", async () => {
    const el = installFakeScroller();
    const { canvas, pinch } = await mountGestureCanvas({ mode: "select" });
    await dispatchOn(canvas, pressPointerDown(canvas, { clientX: 100, clientY: 100, pointerType: "touch", pointerId: 8 }).ev);
    await dispatchOn(canvas, pressPointerDown(canvas, { clientX: 180, clientY: 100, pointerType: "touch", pointerId: 9 }).ev);
    await dispatchOn(canvas, pressPointerMove(canvas, { clientX: 40, clientY: 100, pointerType: "touch", pointerId: 8 }));
    await dispatchOn(canvas, releasePointerUp(canvas, { clientX: 40, clientY: 100, pointerType: "touch", pointerId: 8 }));
    await dispatchOn(canvas, releasePointerUp(canvas, { clientX: 180, clientY: 100, pointerType: "touch", pointerId: 9 }));
    expect(el.scrollTop).toBe(0); // native pan handles it in the real DOM
    expect(pinch.calls.length).toBe(0); // the s144 plane handles pinch
  });
});

// ── (C) pointercancel hygiene ──

/** A pointercancel for a specific pointer (jsdom's MouseEvent lacks the
 * id AND the pointerType — real cancels carry both). */
function cancelPointer(target: Element, pointerId: number) {
  const ev = new (Object.getPrototypeOf(pressPointerDown(target).ev).constructor)(
    "pointercancel",
    { bubbles: true, cancelable: true, composed: true },
  ) as Event;
  Object.defineProperty(ev, "pointerId", { value: pointerId });
  Object.defineProperty(ev, "pointerType", { value: "touch" });
  return ev;
}

describe("(C) cancel hygiene", () => {
  test("(C-a) a cancelled stroke ends cleanly; a fresh stroke draws afterwards", async () => {
    const el = installFakeScroller();
    const { commits, canvas } = await mountGestureCanvas();
    await dispatchOn(canvas, pressPointerDown(canvas, { clientX: 100, clientY: 100, pointerType: "touch", pointerId: 8 }).ev);
    await dispatchOn(canvas, pressPointerDown(canvas, { clientX: 180, clientY: 100, pointerType: "touch", pointerId: 9 }).ev); // mature → swallowed
    await dispatchOn(canvas, cancelPointer(canvas, 8)); // the browser reclaims finger 8
    await dispatchOn(canvas, releasePointerUp(canvas, { clientX: 180, clientY: 100, pointerType: "touch", pointerId: 9 }));
    // a fresh stroke draws afterwards (no stuck plane, no clobber)
    await dispatchOn(canvas, pressPointerDown(canvas, { clientX: 120, clientY: 120, pointerType: "touch", pointerId: 10 }).ev);
    await dispatchOn(canvas, pressPointerMove(canvas, { clientX: 180, clientY: 150, pointerType: "touch", pointerId: 10 }));
    await dispatchOn(canvas, releasePointerUp(canvas, { clientX: 180, clientY: 150, pointerType: "touch", pointerId: 10 }));
    // the gesture-owned pointers never commit (the steal discarded the
    // dot); the FRESH stroke commits exactly once
    expect(commits.stroke.mock.calls.length).toBe(1);
    expect(el.scrollTop).toBe(0);
  });
});

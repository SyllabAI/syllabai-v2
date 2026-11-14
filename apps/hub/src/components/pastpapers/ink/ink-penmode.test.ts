/**
 * ink-penmode.test.ts — T-MG-INK-12 run-001, the pen-mode lane's
 * regression seam ("pen writes, finger scrolls").
 *
 * The operator's sanctioned proposal: when a stylus is detected, the
 * stylus writes ink automatically and touch works for scrolling. THIS
 * seam pins the gesture-side laws at the InkCanvas handler seam (the
 * same jsdom posture as ink-stylus.test.ts) plus the two PURE state
 * laws in ink-penmode.ts:
 *
 *   (P) the pure laws: the sticky load math (an explicit toggle wins;
 *       else a browser that has ever seen a stylus starts in pen mode)
 *       and the auto-arm target (the resting default select ONLY — an
 *       explicitly armed tool is never overridden).
 *   (Q) classic regression: with pen mode OFF (or absent), a finger
 *       stroke draws exactly as shipped — the run-001 pins read
 *       unchanged.
 *   (R) the pen-mode routing: touch NEVER draws — a draw-armed canvas
 *       pans the paper in JS (no commit, the scroll target moves);
 *       select-armed is NOT intercepted (native pan/pinch posture as
 *       shipped); the palm window suppresses palm PANS too.
 *   (S) the anchor law: EVERY pen event re-anchors the palm window —
 *       a touch immediately after a LONG pen stroke (older than
 *       PEN_SESSION_MS) is still rejected (the Addendum 20 post-stroke
 *       gap is dead; wall-clock pin).
 *   (T) the flip: the first pen event fires onPenSeen exactly once
 *       (hover included); a classic→pen transition discards an
 *       in-flight touch gesture (the palm stroke never existed).
 *   (U) unchanged under pen mode: mouse strokes commit byte-identical
 *       (no pressure channel); pen strokes carry their pressure channel.
 *
 * IMPORT-ORDER LAW: the harness MUST be the first import (see its
 * header — react-dom's module-init DOM detection reads the jsdom
 * globals this file installs).
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
import { computePenModeOnLoad, penAutoArm } from "./ink-penmode";
import type { InkColor, InkShape, InkTextShape } from "./ink";

/** The dispatch twin of the stylus seam's helper (act-wrapped so the
 * handler's state writes flush before the assertions read them). */
async function dispatchOn(canvas: Element, ev: Event) {
  await act(async () => {
    canvas.dispatchEvent(ev);
  });
}

// ── the seam mount (the ink-stylus pattern + rerender for the flip) ──

let lastUnmount: (() => Promise<void>) | null = null;

async function mountPenCanvas(overrides: Partial<InkCanvasProps> = {}) {
  const commits = {
    stroke: mock((_page: number, _points: Array<[number, number]>, _pressures?: number[] | null) => {}),
    text: mock((_shape: Omit<InkTextShape, "id" | "kind">) => {}),
    math: mock((_shape: unknown) => {}),
    textEdit: mock((_id: string, _text: string) => {}),
    mathEdit: mock((_id: string, _tex: string) => {}),
    erase: mock((_ids: string[]) => {}),
    move: mock((_shape: InkShape) => {}),
  };
  const onPenSeen = mock(() => {});
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
    onPenSeen,
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
  const rerender = async (o: Partial<InkCanvasProps>) => {
    Object.assign(props, o);
    await render(props);
  };
  lastUnmount = async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    lastUnmount = null;
  };
  return { commits, canvas, container, rerender, onPenSeen };
}

/** The pan-target seam: my findScrollAncestor walks real ancestors (all
 * inert under jsdom — no layout) and falls back to
 * document.scrollingElement; pin the LAW by installing a counting
 * stand-in there (the code writes scrollTop/scrollLeft on whatever the
 * property yields — any object with the two numbers is the honest
 * contract). */
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
  // the scroller stand-in is configurable — remove it so the next test
  // sees the environment's own scrollingElement
  delete (doc as unknown as Record<string, unknown>).scrollingElement;
});

// ── (P) the pure laws ──

describe("(P) ink-penmode pure laws", () => {
  test("(P-a) the load math: an explicit toggle always wins", () => {
    expect(computePenModeOnLoad("on", false)).toBe(true);
    expect(computePenModeOnLoad("off", true)).toBe(false);
  });
  test("(P-b) the load math: no explicit toggle → the sticky sighting decides", () => {
    expect(computePenModeOnLoad(null, true)).toBe(true);
    expect(computePenModeOnLoad(null, false)).toBe(false);
  });
  test("(P-c) the load math: a corrupted pref reads as auto (defensive)", () => {
    expect(computePenModeOnLoad("maybe", true)).toBe(true);
    expect(computePenModeOnLoad("", false)).toBe(false);
  });
  test("(P-d) the auto-arm target: the resting default ONLY", () => {
    expect(penAutoArm("select")).toBe(true);
    for (const m of ["pen", "text", "math", "erase", "line", "ruler", "protractor", "compasses"]) {
      expect(penAutoArm(m)).toBe(false);
    }
  });
});

// ── (Q) classic regression ──

describe("(Q) classic mode regression", () => {
  test("(Q-a) no pen mode prop → a finger stroke draws exactly as shipped", async () => {
    const { commits, canvas } = await mountPenCanvas();
    await dispatchOn(canvas, pressPointerDown(canvas, { clientX: 100, clientY: 75, pointerType: "touch", pointerId: 8 }).ev);
    await dispatchOn(canvas, pressPointerMove(canvas, { clientX: 140, clientY: 75, pointerType: "touch", pointerId: 8 }));
    await dispatchOn(canvas, releasePointerUp(canvas, { clientX: 140, clientY: 75, pointerType: "touch", pointerId: 8 }));
    expect(commits.stroke.mock.calls.length).toBe(1);
  });
});

// ── (R) the pen-mode routing ──

describe("(R) pen mode: touch never draws", () => {
  test("(R-a) a draw-armed canvas: the finger PANS the paper, commits nothing", async () => {
    const scroller = installFakeScroller();
    const { commits, canvas } = await mountPenCanvas({ penMode: true });
    await dispatchOn(canvas, pressPointerDown(canvas, { clientX: 100, clientY: 75, pointerType: "touch", pointerId: 8 }).ev);
    await dispatchOn(canvas, pressPointerMove(canvas, { clientX: 130, clientY: 105, pointerType: "touch", pointerId: 8 }));
    await dispatchOn(canvas, releasePointerUp(canvas, { clientX: 130, clientY: 105, pointerType: "touch", pointerId: 8 }));
    expect(commits.stroke.mock.calls.length).toBe(0);
    // the pan moved the paper by the pointer delta (down→move: +30,+30 →
    // the scroll position moves NEGATIVE — the paper follows the finger)
    expect(scroller.scrollTop).toBe(-30);
    expect(scroller.scrollLeft).toBe(-30);
  });
  test("(R-b) select-armed is NOT intercepted — the native pan/pinch posture as shipped", async () => {
    const scroller = installFakeScroller();
    const { commits, canvas } = await mountPenCanvas({ penMode: true, mode: "select" });
    const down = pressPointerDown(canvas, { clientX: 100, clientY: 75, pointerType: "touch", pointerId: 8 });
    await dispatchOn(canvas, down.ev);
    await dispatchOn(canvas, releasePointerUp(canvas, { clientX: 130, clientY: 105, pointerType: "touch", pointerId: 8 }));
    // no JS pan (the scroll target untouched — the browser owns the
    // gesture there), no ink, no rejection
    expect(scroller.scrollTop).toBe(0);
    expect(scroller.scrollLeft).toBe(0);
    expect(commits.stroke.mock.calls.length).toBe(0);
    expect(down.calls()).toBe(0);
  });
  test("(R-c) the palm window suppresses palm PANS too — no scroll mid-stroke", async () => {
    const scroller = installFakeScroller();
    const { commits, canvas } = await mountPenCanvas({ penMode: true });
    // the stylus writes first (stamps + re-anchors the window)
    await dispatchOn(canvas, pressPointerDown(canvas, { clientX: 100, clientY: 75, pointerType: "pen", pointerId: 7, pressure: 0.4 }).ev);
    await dispatchOn(canvas, pressPointerMove(canvas, { clientX: 130, clientY: 85, pointerType: "pen", pointerId: 7, pressure: 0.5 }));
    await dispatchOn(canvas, releasePointerUp(canvas, { clientX: 140, clientY: 90, pointerType: "pen", pointerId: 7 }));
    // the palm lands inside the window: swallowed whole — no pan, no ink
    const palm = pressPointerDown(canvas, { clientX: 200, clientY: 150, pointerType: "touch", pointerId: 8 });
    await dispatchOn(canvas, palm.ev);
    await dispatchOn(canvas, pressPointerMove(canvas, { clientX: 240, clientY: 180, pointerType: "touch", pointerId: 8 }));
    await dispatchOn(canvas, releasePointerUp(canvas, { clientX: 240, clientY: 180, pointerType: "touch", pointerId: 8 }));
    expect(palm.calls()).toBe(1); // preventDefault — the window law
    expect(commits.stroke.mock.calls.length).toBe(1); // the PEN's stroke only
    expect(scroller.scrollTop).toBe(0);
  });
  test("(R-d) a second finger is inert while one finger pans (no pinch in run-001)", async () => {
    const scroller = installFakeScroller();
    const { commits, canvas } = await mountPenCanvas({ penMode: true });
    await dispatchOn(canvas, pressPointerDown(canvas, { clientX: 100, clientY: 75, pointerType: "touch", pointerId: 8 }).ev);
    // the second finger lands and lifts — the pan keeps its owner
    await dispatchOn(canvas, pressPointerDown(canvas, { clientX: 200, clientY: 150, pointerType: "touch", pointerId: 9 }).ev);
    await dispatchOn(canvas, releasePointerUp(canvas, { clientX: 210, clientY: 160, pointerType: "touch", pointerId: 9 }));
    // the OWNER's move still pans (the gesture plane was not clobbered)
    await dispatchOn(canvas, pressPointerMove(canvas, { clientX: 120, clientY: 85, pointerType: "touch", pointerId: 8 }));
    expect(scroller.scrollTop).toBe(-10);
    expect(scroller.scrollLeft).toBe(-20);
    // the owner's lift closes the plane; a later move pans nothing
    await dispatchOn(canvas, releasePointerUp(canvas, { clientX: 120, clientY: 85, pointerType: "touch", pointerId: 8 }));
    await dispatchOn(canvas, pressPointerMove(canvas, { clientX: 160, clientY: 120, pointerType: "touch", pointerId: 8 }));
    expect(scroller.scrollTop).toBe(-10);
    expect(commits.stroke.mock.calls.length).toBe(0);
  });
  test("(R-e) the LIVE mirror wins over the prop — the stale-prop window is dead", async () => {
    const scroller = installFakeScroller();
    // the prop says classic, the parent's synchronous mirror says pen
    // (the flip wrote the ref before any render flushed) — the touch
    // must PAN, not draw
    const { commits, canvas } = await mountPenCanvas({ penMode: false, penModeRef: { current: true } });
    await dispatchOn(canvas, pressPointerDown(canvas, { clientX: 100, clientY: 75, pointerType: "touch", pointerId: 8 }).ev);
    await dispatchOn(canvas, pressPointerMove(canvas, { clientX: 130, clientY: 105, pointerType: "touch", pointerId: 8 }));
    await dispatchOn(canvas, releasePointerUp(canvas, { clientX: 130, clientY: 105, pointerType: "touch", pointerId: 8 }));
    expect(commits.stroke.mock.calls.length).toBe(0);
    expect(scroller.scrollTop).toBe(-30);
  });
});

// ── (S) the anchor law (wall-clock pin) ──

describe("(S) the palm window anchors on the LAST pen event", () => {
  test(
    "(S-a) a touch right after a LONG pen stroke is still rejected (the Addendum 20 gap is dead)",
    async () => {
      const { commits, canvas } = await mountPenCanvas();
      // the pen goes down, holds LONGER than PEN_SESSION_MS (1500ms), lifts
      await dispatchOn(canvas, pressPointerDown(canvas, { clientX: 100, clientY: 75, pointerType: "pen", pointerId: 7, pressure: 0.4 }).ev);
      await new Promise((r) => setTimeout(r, 1600));
      // the lift re-anchors the window (the down is now 1600ms stale)
      await dispatchOn(canvas, releasePointerUp(canvas, { clientX: 110, clientY: 75, pointerType: "pen", pointerId: 7 }));
      // the palm taps immediately after the lift: under the OLD
      // down-anchored window this tap would DRAW (the window measured
      // from the 1600ms-old down); under the re-anchored law it is
      // swallowed — even in classic mode.
      const palm = pressPointerDown(canvas, { clientX: 200, clientY: 150, pointerType: "touch", pointerId: 8 });
      await dispatchOn(canvas, palm.ev);
      await dispatchOn(canvas, releasePointerUp(canvas, { clientX: 210, clientY: 150, pointerType: "touch", pointerId: 8 }));
      expect(palm.calls()).toBe(1);
      expect(commits.stroke.mock.calls.length).toBe(0);
    },
    // the wall clock is the point of this pin — give it room
    { timeout: 10_000 },
  );
});

// ── (T) the flip ──

describe("(T) the sighting and the flip", () => {
  test("(T-a) the first pen event fires onPenSeen exactly once — hover included", async () => {
    const { canvas, onPenSeen } = await mountPenCanvas();
    // a HOVER move (no down, no stroke) is already a sighting
    await dispatchOn(canvas, pressPointerMove(canvas, { clientX: 100, clientY: 75, pointerType: "pen", pointerId: 7 }));
    expect(onPenSeen.mock.calls.length).toBe(1);
    // further pen events re-anchor but never re-fire
    await dispatchOn(canvas, pressPointerMove(canvas, { clientX: 120, clientY: 85, pointerType: "pen", pointerId: 7 }));
    await dispatchOn(canvas, pressPointerDown(canvas, { clientX: 120, clientY: 85, pointerType: "pen", pointerId: 7, pressure: 0.5 }).ev);
    await dispatchOn(canvas, releasePointerUp(canvas, { clientX: 130, clientY: 95, pointerType: "pen", pointerId: 7 }));
    expect(onPenSeen.mock.calls.length).toBe(1);
  });
  test("(T-b) touch and mouse are NOT sightings (a finger is not a stylus)", async () => {
    const { canvas, onPenSeen } = await mountPenCanvas();
    await dispatchOn(canvas, pressPointerDown(canvas, { clientX: 100, clientY: 75, pointerType: "touch", pointerId: 8 }).ev);
    await dispatchOn(canvas, releasePointerUp(canvas, { clientX: 110, clientY: 75, pointerType: "touch", pointerId: 8 }));
    await dispatchOn(canvas, pressPointerDown(canvas, { clientX: 100, clientY: 75, pointerType: "mouse", pointerId: 1 }).ev);
    await dispatchOn(canvas, releasePointerUp(canvas, { clientX: 110, clientY: 75, pointerType: "mouse", pointerId: 1 }));
    expect(onPenSeen.mock.calls.length).toBe(0);
  });
  test("(T-c) the classic→pen flip discards an in-flight touch gesture (the palm stroke never existed)", async () => {
    const { commits, canvas, rerender } = await mountPenCanvas();
    // the palm starts a stroke in classic mode (a real finger stroke)
    await dispatchOn(canvas, pressPointerDown(canvas, { clientX: 100, clientY: 75, pointerType: "touch", pointerId: 8 }).ev);
    await dispatchOn(canvas, pressPointerMove(canvas, { clientX: 140, clientY: 75, pointerType: "touch", pointerId: 8 }));
    // the pen mode flips mid-gesture (the parent's sighting flip, or the
    // user's toggle) → the in-flight palm stroke is discarded, not committed
    await rerender({ penMode: true });
    await dispatchOn(canvas, releasePointerUp(canvas, { clientX: 160, clientY: 75, pointerType: "touch", pointerId: 8 }));
    expect(commits.stroke.mock.calls.length).toBe(0);
  });
});

// ── (U) unchanged under pen mode ──

describe("(U) pen and mouse keep their run-001 laws in pen mode", () => {
  test("(U-a) a MOUSE stroke commits byte-identical — no pressure channel", async () => {
    const { commits, canvas } = await mountPenCanvas({ penMode: true });
    await dispatchOn(canvas, pressPointerDown(canvas, { clientX: 100, clientY: 75, pointerType: "mouse", pointerId: 1 }).ev);
    await dispatchOn(canvas, pressPointerMove(canvas, { clientX: 140, clientY: 75, pointerType: "mouse", pointerId: 1 }));
    await dispatchOn(canvas, releasePointerUp(canvas, { clientX: 140, clientY: 75, pointerType: "mouse", pointerId: 1 }));
    expect(commits.stroke.mock.calls.length).toBe(1);
    const [, , pressures] = commits.stroke.mock.calls[0]!;
    expect(pressures ?? null).toBeNull();
  });
  test("(U-b) a PEN stroke carries its pressure channel in pen mode", async () => {
    const { commits, canvas } = await mountPenCanvas({ penMode: true });
    await dispatchOn(canvas, pressPointerDown(canvas, { clientX: 100, clientY: 75, pointerType: "pen", pointerId: 7, pressure: 0.4 }).ev);
    await dispatchOn(canvas, pressPointerMove(canvas, { clientX: 140, clientY: 75, pointerType: "pen", pointerId: 7, pressure: 0.6 }));
    await dispatchOn(canvas, releasePointerUp(canvas, { clientX: 140, clientY: 75, pointerType: "pen", pointerId: 7 }));
    expect(commits.stroke.mock.calls.length).toBe(1);
    const [page, points, pressures] = commits.stroke.mock.calls[0]!;
    expect(page).toBe(1);
    expect(points.length).toBe(2);
    expect(pressures).toEqual([0.4, 0.6]);
  });
});

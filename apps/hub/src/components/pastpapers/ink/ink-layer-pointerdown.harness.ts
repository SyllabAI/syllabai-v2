/**
 * ink-layer-pointerdown.harness.ts — the T-MG-INK-6 run-002 test-harness
 * environment (test infra, not a test: bun test only picks up *.test.*).
 *
 * WHY A SEPARATE MODULE: the InkCanvas seam must mount under jsdom, and
 * react-dom computes its DOM facts (canUseDOM, isInputEventSupported,
 * canUseCompositionEvent, …) at MODULE INIT — under bun test its module
 * body evaluates before any later statement of the test file could land
 * a document global. ESM guarantees this module finishes evaluating
 * BEFORE the test file's react-dom import, so react-dom's init reads a
 * real (jsdom) DOM. Import order is therefore a LAW of this harness:
 * `import "./ink-layer-pointerdown.harness";` MUST be the first import
 * of the test file.
 *
 * The change-event consequence of that init (measured, not assumed):
 * react-dom's `isInputEventSupported` gate still reads false in this
 * environment, so input/change events route through its LEGACY
 * activeElement polyfill — handled below (attachEvent/detachEvent stubs
 * + the focusin/set/keydown typing recipe in typeIn), order-independently.
 *
 * The rest is the card's environment law (spec run-001, the
 * regression-seam pin): jsdom + a ResizeObserver stub (jsdom ships
 * none); the canvas 2d context is a no-op proxy (no `canvas` package —
 * the painter rides the same code path and no-ops pixel work); pointer
 * capture is stubbed (pen/line/erase/select call it on the opening
 * press); every canvas reports a fixed 400×300 page box so
 * normalizePoint and the commit-time sizeFrac law (14 css px ÷ cssW)
 * read deterministic fractions.
 */
import { JSDOM } from "jsdom";

type JSDOMEventCtor<T> = new (type: string, init?: Record<string, unknown>) => T;

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});

interface JSDOMWindowShape {
  document: Document;
  Document: { prototype: Record<string, unknown> };
  HTMLElement: { prototype: Record<string, unknown> };
  HTMLCanvasElement: { prototype: Record<string, unknown> };
  HTMLTextAreaElement: { prototype: Record<string, unknown> };
  Event: JSDOMEventCtor<Event>;
  UIEvent: JSDOMEventCtor<UIEvent>;
  MouseEvent: JSDOMEventCtor<MouseEvent>;
  KeyboardEvent: JSDOMEventCtor<KeyboardEvent>;
  FocusEvent: JSDOMEventCtor<FocusEvent>;
}

const w = dom.window as unknown as JSDOMWindowShape;
const g = globalThis as unknown as Record<string, unknown>;

for (const key of [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "HTMLCanvasElement",
  "HTMLTextAreaElement",
  "Element",
  "Node",
  "Event",
  "UIEvent",
  "MouseEvent",
  "KeyboardEvent",
  "FocusEvent",
  "InputEvent",
  "CustomEvent",
  "getComputedStyle",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "devicePixelRatio",
]) {
  try {
    g[key] = (w as unknown as Record<string, unknown>)[key];
  } catch {
    // a runtime-owned global (e.g. navigator) that refuses reassignment —
    // no law under test here needs the jsdom twin of that one
  }
}

// THE REACT 19.3 GATE (belt layer): react-dom's init checks
// `"oninput" in document`. jsdom's Document does not expose the oninput
// IDL attribute, so pin its PRESENCE on the prototype (the value is
// never used — only the `in` check is).
Object.defineProperty(w.Document.prototype, "oninput", {
  configurable: true,
  enumerable: true,
  get: () => null,
  set: () => {},
});

// The act() law: React 19's act requires the test environment flag.
(g as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The card's stub law: jsdom ships no ResizeObserver; the canvas effect
// (and the mtext overlay's self-measuring effect) observe one.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
g.ResizeObserver = ResizeObserverStub;

// React's IE8-era change-event polyfill law (jsdom reality): react-dom
// computes `isInputEventSupported` at MODULE INIT — under bun test its
// module body evaluates before any test-harness global lands, so the
// gate is FALSE and input/change events route through the legacy
// activeElement polyfill: `focusin` arms activeElementInst, a keydown
// delivers the pending change, `focusout` disarms — and arming calls
// attachEvent/detachEvent, which jsdom does not implement (raw TypeError
// mid-dispatch otherwise). No-op stubs keep that path functional.
w.HTMLElement.prototype.attachEvent = function attachEvent() {};
w.HTMLElement.prototype.detachEvent = function detachEvent() {};

// jsdom has no pointer capture: pen/line/erase/select call it on the
// opening press. Stub, never simulate failure.
w.HTMLCanvasElement.prototype.setPointerCapture = function setPointerCapture() {};
w.HTMLCanvasElement.prototype.releasePointerCapture = function releasePointerCapture() {};

// jsdom has no 2d context (no `canvas` package): a no-op proxy keeps
// repaint/sizeBackingStore/paintShapes on the real code path (property
// reads see no-op fns, writes are accepted) — measureText returns a
// width so the text-box paint math stays honest-shaped.
const noopCtx = new Proxy(
  {},
  {
    get(_t, p) {
      if (p === "measureText") {
        return () => ({ width: 10, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0 });
      }
      return () => undefined;
    },
    set() {
      return true;
    },
  },
);
w.HTMLCanvasElement.prototype.getContext = function getContext() {
  return noopCtx;
};

// The page-box law: every canvas reports the same 400×300 css box.
export const PAGE_W = 400;
export const PAGE_H = 300;
w.HTMLCanvasElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
  return {
    left: 0,
    top: 0,
    width: PAGE_W,
    height: PAGE_H,
    right: PAGE_W,
    bottom: PAGE_H,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  };
};

// ── exported harness primitives ──

export const doc = w.document;

/** The opening press of a trusted pointer sequence: a bubbling,
 * cancelable pointerdown carrying the pointerType jsdom's MouseEvent
 * cannot hold natively, with an instance-level preventDefault counter
 * (the synthetic React event forwards to the native call). */
export function pressPointerDown(
  target: Element,
  opts: { clientX?: number; clientY?: number; button?: number; pointerType?: string } = {},
) {
  const ev = new w.MouseEvent("pointerdown", {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: opts.clientX ?? 0,
    clientY: opts.clientY ?? 0,
    button: opts.button ?? 0,
    buttons: 1,
  });
  Object.defineProperty(ev, "pointerType", { value: opts.pointerType ?? "mouse" });
  let preventDefaultCalls = 0;
  const native = ev.preventDefault.bind(ev);
  ev.preventDefault = () => {
    preventDefaultCalls += 1;
    native();
  };
  return { ev, calls: () => preventDefaultCalls };
}

/** React-controlled textarea typing under the legacy change-event
 * polyfill (see the attachEvent note above): arm activeElement tracking
 * with a focusin, set the value through the native setter (bypasses the
 * instance tracker, so updateValueIfChanged sees the delta), then fire
 * the polyfill's keydown trigger — onChange lands with the new value.
 * The throwaway key ('a') is inert: no commit law keys on it. */
export function typeIn(ta: Element, text: string) {
  ta.dispatchEvent(new w.FocusEvent("focusin", { bubbles: true }));
  const setter = Object.getOwnPropertyDescriptor(
    w.HTMLTextAreaElement.prototype,
    "value",
  )!.set!;
  setter.call(ta, text);
  ta.dispatchEvent(new w.KeyboardEvent("keydown", { key: "a", bubbles: true, cancelable: true }));
}

export function pressKey(ta: Element, key: string, init: { shiftKey?: boolean } = {}) {
  ta.dispatchEvent(
    new w.KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
      shiftKey: !!init.shiftKey,
    }),
  );
}

/** React's onBlur delegates to the BUBBLING focusout. */
export function blurEditor(ta: Element) {
  ta.dispatchEvent(new w.FocusEvent("focusout", { bubbles: true }));
}

export function jsdomMouseEvent(type: string, init: Record<string, unknown> = {}) {
  return new w.MouseEvent(type, init);
}

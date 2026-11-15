import type { GesturePinchBridge } from "./paperGestures";

/**
 * gesturePlane.ts — T-MG-INK-13 run-002: the shared gesture plane's ref.
 *
 * THE LIVE-GATE REGRESSION (2026-11-15, prod): the viewer created this
 * ref as `useRef<GesturePinchBridge | undefined>(undefined)` and NOTHING
 * populated `.current` — pdf-pane's bridge effect reads
 * `gesturePlane?.current` and returns when it is undefined, so zoomStep
 * was never assigned and draw-armed pinch silently no-opped in BOTH
 * directions (pan worked — it never crosses the bridge). The factory is
 * the pin-able seam: the initializer guarantees an OBJECT exists before
 * the pane ever looks.
 */
export interface GesturePlaneRef {
  current: GesturePinchBridge | undefined;
}

export function createGesturePlane(): GesturePlaneRef {
  return { current: {} };
}

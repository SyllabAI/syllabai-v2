/**
 * paperGestures.ts — T-MG-INK-13 run-001: the two-finger gesture plane
 * for the ink paper (operator law: "2 fingers always scroll, pinch always
 * zooms, NO MATTER THE TOOL").
 *
 * WHY THIS EXISTS: the pane's s144 gesture zoom pairs touch pointers into
 * ladder steps ONLY on unmarked surfaces (select mode) — a draw-armed ink
 * canvas carries data-ink-drawing and its pointers were refused, so two
 * fingers did nothing at all while any draw tool was armed (the operator's
 * gap of record). This coordinator gives the INK layer its own gesture
 * plane for those pointers: JS pan (the proven beginPan mechanics,
 * generalized to a centroid) + pinch steps routed through the SAME zoomBy
 * ladder the toolbar and s144 use (the bridge), with a PAN/PINCH LOCK so
 * the two never fight mid-gesture.
 *
 * LAWS (each pinned in paper-gestures.test.ts):
 *  (L1) two tracked pointers pan the scroll ancestor, tool-agnostic.
 *  (L2) two tracked pointers pinch-zoom through the bridge (ladder steps,
 *       rebased per step — the s144 algorithm).
 *  (L3) gesture lock: the first threshold crossed (centroid travel vs
 *       spread change) fixes the mode until every pointer lifts.
 *  (L4) pen priority lives UPSTREAM (the canvas's palm window + pen
 *       precedence branches run before anything registers here); the
 *       canvas ALSO calls cancelAll() from discardGesture, so a pen
 *       landing mid-gesture tears the gesture down.
 *  (L5) stray-steal: the canvas promotes a young freehand stroke's
 *       pointer (isStrayStroke: ≤150ms old AND ≤8px of travel) and the
 *       stroke was discarded WITHOUT an undo entry — this module only
 *       receives the promoted pointer.
 *  (L6) mature strokes never register a second finger (the canvas keeps
 *       swallowing those) — one-gesture isolation as shipped.
 *  (L8) two-finger tap: below both lock thresholds nothing executes.
 *
 * The module never touches React and never reads the DOM beyond the
 * scroll element the canvas hands it (the same one-DOM-seam posture as
 * findScrollAncestor). role "pan" = a stylus-mode finger (pans alone,
 * immediately — beginPan parity); role "tool" = a classic finger that is
 * drawing (tracked for the centroid only, never pans alone); a promoted
 * pointer becomes "pan". A single remaining pointer after the pair breaks
 * keeps panning (natural scroll continuation).
 */

export interface GesturePinchBridge {
  /** Ladder step through the pane's zoomBy (honest ceiling + anchor-preserving refreeze). */
  zoomStep?: (dir: 1 | -1) => void;
}

/** The minimal scroll contract — the canvas hands a real scroll ancestor
 *  (findScrollAncestor); the pure pins hand a counting stand-in. */
export interface ScrollTarget {
  scrollTop: number;
  scrollLeft: number;
}

/** L5 constants — the stray-dot definition (tunable; see the task card D4). */
export const STRAY_STEAL = { ms: 150, px: 8 } as const;
/** L3 lock thresholds (css px). */
const PAN_LOCK_PX = 12;
const PINCH_LOCK_PX = 14;
/** L2 step ratio — identical to the pane's s144 PINCH_STEP_RATIO. */
const PINCH_STEP_RATIO = 1.2;
/** Ghost eviction: a pointer unseen this long is not coming back. */
const GHOST_MS = 3000;

interface TrackedPointer {
  x: number;
  y: number;
  role: "pan" | "tool";
  scrollEl: ScrollTarget | null;
}

type GestureMode = "idle" | "pan1" | "armed" | "pan" | "pinch";

/** L5 pure test: a freehand stroke this young and this close to its own
 *  start (x/y = the STROKE's current point, not the second finger's) is
 *  a stray dot the second finger cancels (no commit, no undo entry). */
export function isStrayStroke(
  startedAt: number,
  start: { x: number; y: number },
  now: number,
  x: number,
  y: number,
): boolean {
  return (
    now - startedAt <= STRAY_STEAL.ms &&
    Math.hypot(x - start.x, y - start.y) <= STRAY_STEAL.px
  );
}

export class PaperGestures {
  private pts = new Map<number, TrackedPointer>();
  private mode: GestureMode = "idle";
  private bridge: GesturePinchBridge | null;
  // gesture-space bookkeeping (armed/pan/pinch)
  private centroid0: { x: number; y: number } | null = null;
  private lastCentroid: { x: number; y: number } | null = null;
  private spread0 = 0;
  private lastStepSpread = 0;
  // L3 skew guard: touch streams INTERLEAVE (finger A's move lands while
  // finger B lags), so a per-move spread delta spikes on the first move —
  // a two-finger PAN would mis-lock as pinch. The lock evaluates only
  // after every tracked pointer has moved once since arming.
  private armedMoved = new Set<number>();
  // Ghost hygiene: a pointer whose up/cancel event is LOST (browser
  // reclaim races, the historical refreeze capture-kill) would otherwise
  // hijack every later stroke into a dead gesture. A pointer unseen for
  // GHOST_MS is evicted at the next pointerdown.
  private lastSeen = new Map<number, number>();

  constructor(bridge: GesturePinchBridge | null) {
    this.bridge = bridge;
  }

  /** True while this pointer participates in a pan/gesture this module owns. */
  owns(id: number): boolean {
    const mode = this.mode;
    return this.pts.has(id) && (mode === "pan1" || mode === "armed" || mode === "pan" || mode === "pinch");
  }

  /** Any live gesture (the canvas's pen-precedence discard asks this). */
  active(): boolean {
    return this.mode === "pan1" || this.mode === "armed" || this.mode === "pan" || this.mode === "pinch";
  }

  /** A stylus-mode finger (pans alone) or a classic finger (tracked for
   *  the steal centroid only). The scroll element is resolved by the
   *  canvas (findScrollAncestor) and kept from the first pointer. */
  pointerDown(id: number, x: number, y: number, role: "pan" | "tool", scrollEl: ScrollTarget | null): void {
    // ghost eviction first: pointers unseen past GHOST_MS leave the plane
    const now = performance.now();
    for (const [k, t] of this.lastSeen) {
      if (now - t > GHOST_MS) {
        this.pts.delete(k);
        this.armedMoved.delete(k);
        this.lastSeen.delete(k);
      }
    }
    if (this.pts.size === 0) {
      this.mode = "idle";
      this.centroid0 = null;
      this.lastCentroid = null;
      this.spread0 = 0;
    } else if (this.mode === "armed" && this.pts.size < 2) {
      this.mode = "idle";
      this.centroid0 = null;
    }
    const second = this.pts.size >= 1;
    this.lastSeen.set(id, now);
    this.pts.set(id, { x, y, role, scrollEl: this.pts.size === 0 ? scrollEl : [...this.pts.values()][0].scrollEl ?? scrollEl });
    if (!second) {
      // beginPan parity: a pan-role finger pans from its FIRST move, so
      // the centroid anchor initializes here (not on the first move).
      this.mode = role === "pan" ? "pan1" : "idle";
      this.lastCentroid = role === "pan" ? { x, y } : null;
      return;
    }
    // second pointer: re-arm the gesture space (a pan1 upgrade or a steal)
    this.mode = "armed";
    this.armedMoved.clear();
    const c = this.centroid();
    this.centroid0 = { ...c };
    this.lastCentroid = { ...c };
    const s = this.spread();
    this.spread0 = s;
    this.lastStepSpread = s;
  }

  /** L5: the canvas discarded a young stray stroke — its pointer joins
   *  the gesture plane (role pan: if the pinch finger lifts, it scrolls). */
  pointerPromote(id: number): void {
    const p = this.pts.get(id);
    if (p) p.role = "pan";
  }

  /** Update position; returns TRUE when the move was consumed by an
   *  active gesture (the canvas must not paint). Tool-role pointers in
   *  the idle mode return false (the stroke appends as shipped). */
  pointerMove(id: number, x: number, y: number): boolean {
    const p = this.pts.get(id);
    if (!p) return false;
    this.lastSeen.set(id, performance.now());
    p.x = x;
    p.y = y;
    if (this.mode === "pan1") {
      this.panByCentroid();
      return true;
    }
    if (this.mode === "armed") {
      this.armedMoved.add(id);
      // the skew guard: wait until every pointer has reported once
      if (this.pts.size > 0 && [...this.pts.keys()].some((k) => !this.armedMoved.has(k))) return true;
      // L3 lock: the larger relative signal wins, then stays locked.
      const c = this.centroid();
      const travel = Math.hypot(c.x - this.centroid0!.x, c.y - this.centroid0!.y);
      const spread = this.spread();
      const spreadDelta = Math.abs(spread - this.spread0);
      if (spreadDelta >= PINCH_LOCK_PX && spreadDelta >= travel) {
        this.mode = "pinch";
        this.lastStepSpread = this.spread0;
      } else if (travel >= PAN_LOCK_PX) {
        this.mode = "pan";
        this.lastCentroid = { ...c };
      }
      return true; // armed consumes moves — a stolen stroke must not resume
    }
    if (this.mode === "pan") {
      this.panByCentroid();
      return true;
    }
    if (this.mode === "pinch") {
      // L2: ladder steps rebased per step (the s144 algorithm); a broken
      // pair (one finger lifted) freezes the scale until all lift.
      if (this.pts.size >= 2 && this.bridge?.zoomStep) {
        const s = this.spread();
        const ratio = s / this.lastStepSpread;
        if (ratio >= PINCH_STEP_RATIO) {
          this.bridge.zoomStep(1);
          this.lastStepSpread = s;
        } else if (ratio <= 1 / PINCH_STEP_RATIO) {
          this.bridge.zoomStep(-1);
          this.lastStepSpread = s;
        }
      }
      return true;
    }
    return false;
  }

  pointerUp(id: number): void {
    this.pts.delete(id);
    this.armedMoved.delete(id);
    if (this.pts.size === 0) {
      this.mode = "idle";
      this.centroid0 = null;
      this.lastCentroid = null;
      this.spread0 = 0;
      return;
    }
    if (this.mode === "idle") return;
    // pair break: pan continues with the remaining pointer (anchored at
    // its CURRENT position — no one-move dead band), pinch freezes
    if (this.mode === "pinch") return;
    this.mode = "pan1";
    const c = this.centroid();
    this.lastCentroid = { ...c };
  }

  /** Pen precedence / tool flip: tear EVERYTHING down (L4). */
  cancelAll(): void {
    this.pts.clear();
    this.armedMoved.clear();
    this.mode = "idle";
    this.centroid0 = null;
    this.lastCentroid = null;
    this.spread0 = 0;
  }

  private centroid(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    for (const p of this.pts.values()) {
      x += p.x;
      y += p.y;
    }
    const n = this.pts.size || 1;
    return { x: x / n, y: y / n };
  }

  private spread(): number {
    const it = this.pts.values();
    const a = it.next().value as TrackedPointer | undefined;
    const b = it.next().value as TrackedPointer | undefined;
    if (!a || !b) return 0;
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private panByCentroid(): void {
    const c = this.centroid();
    const el = [...this.pts.values()][0]?.scrollEl ?? null;
    if (this.lastCentroid && el) {
      el.scrollTop -= c.y - this.lastCentroid.y;
      el.scrollLeft -= c.x - this.lastCentroid.x;
    }
    this.lastCentroid = { ...c };
  }
}

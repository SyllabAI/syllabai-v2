"use client";

/**
 * InkLayer — the standalone annotation-ink layer over the past-papers
 * viewer (T-MG-INK-1 run-003; plan of record docs/MG-MARK-PARITY-PLAN.md
 * §3.3; verdict record docs/MG-INK-SDK-GATE.md: NATIVE CANVAS INK on
 * pdf-pane v4 — tldraw production-licence-prohibited, 575.5 KB gz vs
 * 1.3 KB gz measured).
 *
 * MOUNTING LAW (the E3 decision realized): STANDALONE alongside the
 * pdf-pane v4 monolith — the monolith is NOT modified (the Risk-4
 * freeze-frame law). The layer portals one canvas INTO each rendered
 * page holder ([data-page], the pane's own `relative` positioning
 * context). The holder IS the page box, so a canvas at absolute inset-0
 * rides scroll/zoom/reflow for FREE — the RegionOverlay geometry law
 * (normalized 0..1, CSS percentages) at canvas grain: zero pixel math,
 * zero re-measure listeners. The windowed renderer's holder
 * mount/unmount is tracked by a structure-only MutationObserver
 * (childList; no geometry reads).
 *
 * GESTURE LAW: while ink mode is ON the canvas owns the page gesture
 * (touch-action: none — pen/stylus/finger all draw, one tap toggles it
 * off to scroll/select again). While OFF the layer renders nothing at
 * all — the paper stays a clean paper (the RegionOverlay chrome law).
 *
 * PERF PIN (c): coalesced capture (≥1.2 css px), rAF-throttled repaint,
 * backing store at dpr ≤ 2 (the pdf-pane:987 law via sizeBackingStore),
 * full-doc repaint of a few hundred shapes max (E4: single-writer,
 * full-doc PUT right-sized at 11,148 B / 17 shapes observed live).
 *
 * PERSISTENCE (run-002 plane): GET on mount, debounced full-doc PUT
 * carrying the BASE revision (0 seeds 1); 409 → GET + rebaseShapes
 * (union by id) + retry once; failures surface honestly and stay
 * retryable; unmount/toggle-off flushes before dispose (no edit lost to
 * a timer kill). Keyed by `sourceUrl` (the canonical raw corpus URL —
 * the external-document fallback key; documentRefType rides the
 * "paper_asset" default, inert for sourceUrl-keyed rows under the
 * sourceUrl-OR-documentRef refine).
 *
 * SCOPE: learner-only (no token → renders nothing, honest zero chrome);
 * view-mode QP pane only (the mock keeps exam conditions; books and
 * citations are excluded by the plan's scope honesty).
 *
 * A11Y POSTURE: the toolbar is the accessible surface (role=toolbar,
 * labelled controls); the ink canvas is aria-hidden (freehand strokes
 * have no text alternative; text shapes are visual annotations on the
 * paper image). Keyboard shortcuts are NOT bound globally — the pane
 * owns arrow/zoom keys (Risk 4: the monolith's keydown registry receives
 * no new competition).
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Check, Loader2, Pen, Redo2, Trash2, Type, Undo2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  INK_COLORS,
  INK_COLOR_KEYS,
  INK_WIDTH_FRACS,
  clamp01,
  makeShapeId,
  normalizePoint,
  shouldAppendPoint,
  type InkColor,
  type InkShape,
  type InkStrokeShape,
  type InkTextShape,
} from "./ink";
import { createInkSync, type InkSyncSnapshot } from "./ink-sync";
import { paintShapes, sizeBackingStore } from "./paint";

const TOKEN_KEY = "syllabai.token";

const SERVER_SNAPSHOT: InkSyncSnapshot = {
  status: "loading",
  shapes: [],
  baseRevision: 0,
  dirty: false,
};

export interface InkLayerProps {
  /** Wrapper around the QP PdfPane — its subtree is scanned for
   * [data-page] holders (scoped: a sibling pane is never touched). */
  hostRef: React.RefObject<HTMLElement | null>;
  /** The canonical document URL — the sourceUrl persistence key. */
  sourceUrl: string | null;
}

interface HolderEntry {
  page: number;
  el: HTMLElement;
}

export function InkLayer({ hostRef, sourceUrl }: InkLayerProps) {
  const [token, setToken] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [mode, setMode] = useState<"pen" | "text">("pen");
  const [color, setColor] = useState<InkColor>("black");
  const [widthIdx, setWidthIdx] = useState(1);
  const [holders, setHolders] = useState<HolderEntry[]>([]);

  // The v0 pilot posture: the bearer token lives in localStorage. Read
  // once on mount; no token → the layer never renders (honest zero
  // chrome — anonymous visitors see a clean paper).
  useEffect(() => {
    try {
      setToken(window.localStorage.getItem(TOKEN_KEY));
    } catch {
      setToken(null);
    }
  }, []);

  const sync = useMemo(
    () =>
      sourceUrl
        ? createInkSync({ sourceUrl, token })
        : null,
    [sourceUrl, token],
  );

  useEffect(() => {
    if (!sync) return;
    let alive = true;
    void sync.init();
    const unsub = sync.subscribe(() => {
      /* useSyncExternalStore re-reads getSnapshot on emit; this noop
       * subscription keeps the controller's listener set honest while
       * React drives re-renders. */
      if (!alive) return;
    });
    return () => {
      alive = false;
      unsub();
      // flush-before-dispose: a pending edit pushes before the store dies
      void sync.flush().then(() => sync.dispose());
    };
  }, [sync]);

  const snap = useSyncExternalStore(
    sync?.subscribe ?? (() => () => undefined),
    sync?.getSnapshot ?? (() => SERVER_SNAPSHOT),
    () => SERVER_SNAPSHOT,
  );

  // Latest-shapes ref: the pointer/rAF paths read without re-binding.
  const shapesRef = useRef<InkShape[]>(snap.shapes);
  shapesRef.current = snap.shapes;

  // Undo/redo are session-local full-set snapshots (the doc IS the state;
  // sync-conflict rebases fold into the same set — history survives).
  const pastRef = useRef<InkShape[][]>([]);
  const futureRef = useRef<InkShape[][]>([]);
  const [, forceHistoryTick] = useState(0);

  const commit = useCallback(
    (next: InkShape[]) => {
      if (!sync) return;
      pastRef.current = [...pastRef.current.slice(-49), shapesRef.current];
      futureRef.current = [];
      sync.applyLocal(next);
      forceHistoryTick((t) => t + 1);
    },
    [sync],
  );

  const undo = useCallback(() => {
    if (!sync || pastRef.current.length === 0) return;
    const prev = pastRef.current[pastRef.current.length - 1];
    pastRef.current = pastRef.current.slice(0, -1);
    futureRef.current = [...futureRef.current, shapesRef.current];
    sync.applyLocal(prev);
    forceHistoryTick((t) => t + 1);
  }, [sync]);

  const redo = useCallback(() => {
    if (!sync || futureRef.current.length === 0) return;
    const next = futureRef.current[futureRef.current.length - 1];
    futureRef.current = futureRef.current.slice(0, -1);
    pastRef.current = [...pastRef.current.slice(-49), shapesRef.current];
    sync.applyLocal(next);
    forceHistoryTick((t) => t + 1);
  }, [sync]);

  const clearAll = useCallback(() => {
    commit([]);
  }, [commit]);

  // Holder presence tracking (structure-only observer; no geometry).
  useEffect(() => {
    if (!enabled || !hostRef.current) return;
    const host = hostRef.current;
    const rescan = () => {
      const found: HolderEntry[] = [];
      for (const el of host.querySelectorAll<HTMLElement>("[data-page]")) {
        const page = Number.parseInt(el.dataset.page ?? "", 10);
        if (Number.isInteger(page) && page >= 1 && el.isConnected) found.push({ page, el });
      }
      found.sort((a, b) => a.page - b.page);
      setHolders((prev) =>
        prev.length === found.length && prev.every((h, i) => h.el === found[i].el && h.page === found[i].page)
          ? prev
          : found,
      );
    };
    rescan();
    const obs = new MutationObserver(rescan);
    obs.observe(host, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, [enabled, hostRef, sync]);

  const commitStroke = useCallback(
    (page: number, points: Array<[number, number]>) => {
      if (points.length < 2) return;
      const stroke: InkStrokeShape = {
        id: makeShapeId(),
        kind: "stroke",
        page,
        color,
        widthFrac: INK_WIDTH_FRACS[widthIdx],
        points,
      };
      commit([...shapesRef.current, stroke]);
    },
    [color, widthIdx, commit],
  );

  const commitText = useCallback(
    (shape: Omit<InkTextShape, "id" | "kind">) => {
      const text: InkTextShape = { id: makeShapeId(), kind: "text", ...shape };
      commit([...shapesRef.current, text]);
    },
    [commit],
  );

  if (!token || !sourceUrl || !sync) return null;

  return (
    <>
      {/* toolbar — floats over the pane's bottom edge (the mobile A/B pill
          pattern; the pane's own search owns top-11 right-2, so ink takes
          the bottom-right corner); renders nothing until the learner asks
          for ink */}
      {enabled ? (
        <div
          role="toolbar"
          aria-label="Ink annotations"
          className="absolute bottom-3 right-2 z-40 flex max-w-[calc(100%-1rem)] flex-wrap items-center gap-1 rounded-lg border bg-background/95 p-1 shadow-md backdrop-blur"
        >
          <Button
            size="sm"
            variant={mode === "pen" ? "secondary" : "ghost"}
            className="size-8 px-0"
            aria-pressed={mode === "pen"}
            aria-label="Pen tool"
            onClick={() => setMode("pen")}
          >
            <Pen className="size-4" aria-hidden />
          </Button>
          <Button
            size="sm"
            variant={mode === "text" ? "secondary" : "ghost"}
            className="size-8 px-0"
            aria-pressed={mode === "text"}
            aria-label="Text box tool"
            onClick={() => setMode("text")}
          >
            <Type className="size-4" aria-hidden />
          </Button>
          <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          {INK_COLOR_KEYS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Pen colour: ${c}`}
              aria-pressed={color === c}
              onClick={() => setColor(c)}
              className={cn(
                "size-6 rounded-full border-2 transition-transform",
                color === c ? "scale-110 border-foreground" : "border-transparent",
              )}
              style={{ backgroundColor: INK_COLORS[c] }}
            />
          ))}
          <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          {INK_WIDTH_FRACS.map((w, i) => (
            <button
              key={w}
              type="button"
              aria-label={`Pen thickness ${i + 1} of ${INK_WIDTH_FRACS.length}`}
              aria-pressed={widthIdx === i}
              onClick={() => setWidthIdx(i)}
              className={cn(
                "flex size-8 items-center justify-center rounded-md",
                widthIdx === i ? "bg-secondary" : "hover:bg-secondary/60",
              )}
            >
              <span
                aria-hidden
                className="rounded-full bg-foreground"
                style={{ width: 3 + i * 3, height: 3 + i * 3 }}
              />
            </button>
          ))}
          <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          <Button
            size="sm"
            variant="ghost"
            className="size-8 px-0"
            aria-label="Undo stroke"
            disabled={pastRef.current.length === 0}
            onClick={undo}
          >
            <Undo2 className="size-4" aria-hidden />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="size-8 px-0"
            aria-label="Redo stroke"
            disabled={futureRef.current.length === 0}
            onClick={redo}
          >
            <Redo2 className="size-4" aria-hidden />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="size-8 px-0"
            aria-label="Clear all ink on this paper"
            disabled={snap.shapes.length === 0}
            onClick={clearAll}
          >
            <Trash2 className="size-4" aria-hidden />
          </Button>
          <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          {/* the sync status pill — honest states only */}
          {snap.status === "saving" && (
            <span className="flex items-center gap-1 px-1 text-[11px] text-muted-foreground" role="status">
              <Loader2 className="size-3 animate-spin" aria-hidden /> Saving…
            </span>
          )}
          {snap.status === "synced" && (
            <span className="flex items-center gap-1 px-1 text-[11px] text-muted-foreground" role="status">
              <Check className="size-3" aria-hidden /> {snap.dirty ? "Saving…" : "Saved"}
            </span>
          )}
          {snap.status === "conflict" && (
            <span className="flex items-center gap-1 px-1 text-[11px] text-amber-600" role="alert">
              <AlertTriangle className="size-3" aria-hidden /> Edited elsewhere
            </span>
          )}
          {snap.status === "error" && (
            <button
              type="button"
              className="flex items-center gap-1 rounded px-1 text-[11px] text-destructive underline underline-offset-2"
              onClick={() => sync.retry()}
            >
              <AlertTriangle className="size-3" aria-hidden /> Retry sync
            </button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="size-8 px-0"
            aria-label="Close ink layer"
            onClick={() => setEnabled(false)}
          >
            <X className="size-4" aria-hidden />
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="absolute bottom-3 right-2 z-40 h-8 gap-1.5 bg-background/95 text-xs shadow-md backdrop-blur"
          aria-label="Draw on this paper (ink layer)"
          onClick={() => setEnabled(true)}
        >
          <Pen className="size-3.5" aria-hidden /> Ink
        </Button>
      )}

      {/* one canvas portal per mounted page holder */}
      {enabled &&
        holders.map(({ page, el }) =>
          createPortal(
            <InkCanvas
              key={page}
              page={page}
              shapes={snap.shapes.filter((s) => s.page === page)}
              mode={mode}
              color={color}
              widthFrac={INK_WIDTH_FRACS[widthIdx]}
              onCommitStroke={commitStroke}
              onCommitText={commitText}
            />,
            el,
            `ink-${page}`,
          ),
        )}
    </>
  );
}

interface InkCanvasProps {
  page: number;
  shapes: InkShape[];
  mode: "pen" | "text";
  color: InkColor;
  widthFrac: number;
  onCommitStroke: (page: number, points: Array<[number, number]>) => void;
  onCommitText: (shape: Omit<InkTextShape, "id" | "kind">) => void;
}

/** One page's ink canvas — portaled into the pane's page holder. */
function InkCanvas({ page, shapes, mode, color, widthFrac, onCommitStroke, onCommitText }: InkCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const boxRef = useRef<{ cssW: number; cssH: number }>({ cssW: 0, cssH: 0 });
  const activeRef = useRef<Array<[number, number]> | null>(null);
  const lastPxRef = useRef<[number, number] | null>(null);
  const rafRef = useRef(0);
  const [draft, setDraft] = useState<{ x: number; y: number; value: string } | null>(null);

  const repaint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const box = canvas.getBoundingClientRect();
    boxRef.current = { cssW: box.width, cssH: box.height };
    sizeBackingStore(ctx, canvas, box.width, box.height, window.devicePixelRatio || 1);
    paintShapes(ctx, boxRef.current, shapes, activeRef.current ? { color, widthFrac, points: activeRef.current } : null);
  }, [shapes, color, widthFrac]);

  // box resize (zoom/refreeze/window resize) → re-size + re-paint
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => repaint());
    ro.observe(canvas);
    repaint();
    return () => ro.disconnect();
  }, [repaint]);

  // shape changes → re-paint
  useEffect(() => {
    repaint();
  }, [repaint]);

  const scheduleLive = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      paintShapes(ctx, boxRef.current, shapes, activeRef.current ? { color, widthFrac, points: activeRef.current } : null);
    });
  }, [shapes, color, widthFrac]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      if (mode === "text") {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        const box = canvas.getBoundingClientRect();
        const [x, y] = normalizePoint(
          { left: box.left, top: box.top, width: box.width, height: box.height },
          e.clientX,
          e.clientY,
        );
        setDraft({ x, y, value: "" });
        return;
      }
      if (e.pointerType === "mouse" && e.button !== 0) return;
      canvas.setPointerCapture(e.pointerId);
      const box = canvas.getBoundingClientRect();
      activeRef.current = [
        normalizePoint({ left: box.left, top: box.top, width: box.width, height: box.height }, e.clientX, e.clientY),
      ];
      lastPxRef.current = [e.clientX, e.clientY];
      scheduleLive();
    },
    [mode, scheduleLive],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const active = activeRef.current;
      if (!active) return;
      const last = lastPxRef.current;
      if (last && !shouldAppendPoint(last, [e.clientX, e.clientY], 1.2)) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const box = canvas.getBoundingClientRect();
      active.push(
        normalizePoint({ left: box.left, top: box.top, width: box.width, height: box.height }, e.clientX, e.clientY),
      );
      lastPxRef.current = [e.clientX, e.clientY];
      scheduleLive();
    },
    [scheduleLive],
  );

  const endStroke = useCallback(() => {
    const active = activeRef.current;
    activeRef.current = null;
    lastPxRef.current = null;
    if (active && active.length >= 2) onCommitStroke(page, active);
    else repaint();
  }, [onCommitStroke, page, repaint]);

  const commitDraft = useCallback(() => {
    if (!draft) return;
    const value = draft.value.trim();
    const { cssW } = boxRef.current;
    if (value && cssW > 0) {
      onCommitText({
        page,
        color,
        // the editor edits at 14 css px — commit that relative size
        sizeFrac: clamp01(14 / cssW),
        x: draft.x,
        y: draft.y,
        text: value,
      });
    }
    setDraft(null);
  }, [draft, color, onCommitText, page]);

  return (
    <>
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        data-ink-page={page}
        className="pp-inkLayer absolute inset-0 z-30 h-full w-full"
        style={{ touchAction: "none", cursor: mode === "text" ? "text" : "crosshair" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
        onPointerLeave={(e) => {
          // pen lifted off the canvas mid-stroke (mouse edge) → end cleanly
          if (activeRef.current && e.pointerType === "mouse") endStroke();
        }}
      />
      {draft && (
        <textarea
          autoFocus
          aria-label="New text annotation"
          value={draft.value}
          onChange={(e) => setDraft({ ...draft, value: e.target.value })}
          onBlur={commitDraft}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              commitDraft();
            }
            if (e.key === "Escape") setDraft(null);
          }}
          className="absolute z-40 min-h-10 w-40 resize rounded border bg-background/95 p-1 text-xs shadow-md backdrop-blur"
          style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%` }}
          placeholder="Type, then Enter"
        />
      )}
    </>
  );
}

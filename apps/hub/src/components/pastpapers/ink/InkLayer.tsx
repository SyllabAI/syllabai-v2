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
 * LOCAL PERSISTENCE (T-MG-INK-3 run-002, plan §3.7 — the operator's
 * design law "marking = login-constrained; the other tools don't have
 * to be"): WITHOUT a token the SAME surface mounts in LOCAL mode on the
 * browser-local store (./ink-local-store — IndexedDB, ONE store, key =
 * sourceUrl, syllabai-ink/1 verbatim, ZERO network calls). The pill
 * states the posture honestly ("Local only — saved on this device.
 * Log in to sync."); the sync states are sync-mode-only. Login NEVER
 * auto-migrates: the consent-gated notice offers exactly Upload to
 * account (rebaseShapes union-by-id, one PUT on the normal sync path,
 * the local key clears only after the PUT confirms) | Discard local |
 * dismiss (keeps local, re-arms next visit).
 *
 * SCOPE: view-mode QP pane only (the mock keeps exam conditions; books
 * and citations are excluded by the plan's scope honesty). With a token
 * the layer is learner-only as shipped; without one it renders the
 * local-only surface — nothing leaves the device, no learnerId exists
 * on any local shape, and the ledger planes stay fenced out (the
 * region-mark token+paperId gate is untouched).
 *
 * A11Y POSTURE: the toolbar is the accessible surface (role=toolbar,
 * labelled controls); the ink canvas is aria-hidden (freehand strokes
 * have no text alternative; text shapes are visual annotations on the
 * paper image). Keyboard shortcuts are NOT bound globally — the pane
 * owns arrow/zoom keys (Risk 4: the monolith's keydown registry receives
 * no new competition).
 *
 * MATHS INSTRUMENTS (T-MG-INK-2 run-001 — the plan §3.3 surface card,
 * zero schema impact): line / ruler / protractor / compasses emit
 * ORDINARY stroke shapes (the pure ./instruments module owns the math);
 * the ruler/protractor guides are session-local chrome (never
 * persisted — a reload drops the guides and replays the ink). Snap
 * bands are honest: a drag that starts AND ends near the guide commits
 * the clean instrument stroke; a straddling drag commits the live mixed
 * path; off-guide drags stay raw freehand. No new global listeners —
 * the guides and tools ride the same canvas pointer handlers.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Check,
  Compass,
  Eraser,
  Gauge,
  Loader2,
  Minus,
  MousePointer2,
  Pen,
  Redo2,
  Ruler,
  Sigma,
  Trash2,
  Type,
  Undo2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  INK_COLORS,
  INK_COLOR_KEYS,
  INK_WIDTH_FRACS,
  clamp01,
  editMathShape,
  editTextShape,
  eraseShapes,
  makeShapeId,
  normalizePoint,
  rebaseShapes,
  shapeBoundsCss,
  shapesHitIds,
  shouldAppendPoint,
  translateShape,
  type InkColor,
  type InkMathShape,
  type InkShape,
  type InkStrokeShape,
  type InkTextShape,
  type MeasuredSize,
} from "./ink";
import { createInkLocal, inkLocalClear, inkLocalLoad } from "./ink-local-store";
import { createInkSync, type InkSyncSnapshot } from "./ink-sync";
import { registerLiveInk, unregisterLiveInk } from "./live-ink";
import { MathTextOverlay } from "./MathTextOverlay";
import { paintShapes, sizeBackingStore } from "./paint";
import {
  applyProtractorSnap,
  applyRulerSnap,
  compassesCommitable,
  compassesRadiusFrac,
  grabOffset,
  moveGuide,
  newProtractorGuide,
  newRulerGuide,
  protractorLivePoint,
  protractorRotateTo,
  rulerLivePoint,
  rulerRotateTo,
  sampleCircleCompasses,
  shortestSignedDelta,
  angleDegFrom,
  type InstrumentMode,
  type ProtractorGuide,
  type RulerGuide,
} from "./instruments";
import { ProtractorGuideView, RulerGuideView, holderRead } from "./InstrumentGuides";

const TOKEN_KEY = "syllabai.token";

/** T-MG-INK-4 — the tool modes of record. The MG census family closes:
 * pen / text / MATH (the Math text box) / SELECT / ERASE + the four
 * maths instruments. Browse stays the ink-off toggle posture (the
 * spec's disclosed non-goal). */
type InkToolMode = "pen" | "text" | "math" | "erase" | "select" | InstrumentMode;

/** The erase/select hit tolerance (the spec's css-px hit-disc law:
 * max(this, the pen's own width) — dpr-independent). */
const ERASE_TOL_CSS_PX = 12;

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

/** T-MG-INK-3 run-002 — the consent-gated migration notice's states
 * (sync mode only; LOCAL mode never migrates — there is nothing to
 * migrate onto). `failed` is the honest upload-failure phase: the local
 * ink is kept and the notice says so. */
type LocalInkMigration =
  | { phase: "armed"; localShapes: InkShape[] }
  | { phase: "uploading"; localShapes: InkShape[] }
  | { phase: "failed"; localShapes: InkShape[] };

export function InkLayer({ hostRef, sourceUrl }: InkLayerProps) {
  const [token, setToken] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [mode, setMode] = useState<InkToolMode>("pen");
  const [color, setColor] = useState<InkColor>("black");
  const [widthIdx, setWidthIdx] = useState(1);
  const [holders, setHolders] = useState<HolderEntry[]>([]);
  // T-MG-INK-7: the portal-root registry (page → the single wrapper div
  // the portal hosts inside the holder). The pane's page lifecycle
  // repaints a holder by EMPTYING it — renderPage's double-buffer swap
  // (`holder.replaceChildren(canvas)`) and the off-radius sweep — which
  // evicts the portal subtree, and React reconciliation never re-inserts
  // content that non-React code removed. The holder observer's eviction
  // law (below) re-attaches the REGISTERED subtree synchronously: the
  // SAME canvas node, same bitmap, same listeners — no remount, no state
  // change, nothing for React to disagree with (a keyed remount here
  // would make React unmount the detached ghost and throw NotFoundError).
  const inkRootsRef = useRef(new Map<number, HTMLElement>());
  // The instrument guides (T-MG-INK-2): session-local, one per instrument
  // per layer (each carries its own page — it renders only there).
  const [rulerGuide, setRulerGuide] = useState<RulerGuide | null>(null);
  const [protractorGuide, setProtractorGuide] = useState<ProtractorGuide | null>(null);
  const guideDragRef = useRef<{ tool: "ruler" | "protractor"; off: { x: number; y: number } } | null>(null);

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

  // T-MG-INK-3 run-002: the persistence MODE FORK of record — WITH a
  // token the sync controller is constructed exactly as shipped (and
  // NEVER without one: the sync gate is preserved verbatim); WITHOUT a
  // token the SAME surface mounts on the browser-local store (IndexedDB,
  // key = sourceUrl, zero network — ./ink-local-store never touches the
  // wire, so the fetch-spy pin holds by construction).
  const sync = useMemo(() => {
    if (!sourceUrl) return null;
    return token ? createInkSync({ sourceUrl, token }) : createInkLocal({ sourceUrl });
  }, [sourceUrl, token]);

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

  // T-MG-CROPMARK-1 run-002: the live-ink READ seam — the crop producer
  // composites the CURRENT working set (debounce-window edits and
  // toggle-off persisted strokes included). Read-only: the single-writer
  // law is untouched; the registry holds a reader fn, never a listener.
  useEffect(() => {
    if (!sourceUrl) return;
    registerLiveInk(sourceUrl, () => shapesRef.current);
    return () => unregisterLiveInk(sourceUrl);
  }, [sourceUrl]);

  // ── T-MG-INK-3 run-002: the consent-gated migration (SYNC mode only) ──
  // Login NEVER auto-migrates local ink. The notice arms when a token
  // exists AND a local doc exists for this sourceUrl (probed AFTER the
  // server doc's own read so the offer never races the GET); the
  // working set stays the server doc's — sync mode never DRAWS from
  // the local store.
  const [migration, setMigration] = useState<LocalInkMigration | null>(null);
  const migrationDismissed = useRef(false);
  useEffect(() => {
    if (!sync || !token || !sourceUrl) return;
    if (snap.status === "loading") return;
    let alive = true;
    void inkLocalLoad(sourceUrl).then((doc) => {
      if (!alive || migrationDismissed.current) return;
      if (!doc || doc.shapes.length === 0) return;
      setMigration((m) => m ?? { phase: "armed", localShapes: doc.shapes });
    });
    return () => {
      alive = false;
    };
  }, [sync, token, sourceUrl, snap.status]);

  // "Upload to account": union-by-id via the EXISTING rebaseShapes law
  // (server doc first, the local intent appended — id collision = local
  // wins, the newer intent), then ONE debounced PUT on the normal sync
  // path. No new wire shape, no new endpoint.
  const uploadLocalInk = useCallback(() => {
    if (!sync || !migration) return;
    sync.applyLocal(rebaseShapes(shapesRef.current, migration.localShapes));
    setMigration({ ...migration, phase: "uploading" });
  }, [sync, migration]);

  // The epilogue watch on the normal-path snapshot: the local key
  // clears ONLY after the server PUT confirms (synced + not dirty); a
  // failed/conflicted upload keeps local ink and says so (the honest
  // failed phase). A failed CLEAR keeps the notice honestly armed — the
  // upload is idempotent (union-by-id) and Discard can retry the delete.
  useEffect(() => {
    if (!sync || !migration || !sourceUrl) return;
    if (migration.phase !== "uploading") return;
    if (snap.status === "error" || snap.status === "conflict") {
      setMigration({ ...migration, phase: "failed" });
      return;
    }
    if (snap.status === "synced" && !snap.dirty) {
      void inkLocalClear(sourceUrl).then((ok) => {
        if (ok) setMigration(null);
        else
          setMigration((m) =>
            m && m.phase === "uploading" ? { phase: "armed", localShapes: m.localShapes } : m,
          );
      });
    }
  }, [sync, migration, snap.status, snap.dirty, sourceUrl]);

  // "Discard local": deletes the local key; the notice resolves.
  const discardLocalInk = useCallback(() => {
    if (!sourceUrl) return;
    void inkLocalClear(sourceUrl).then((ok) => {
      if (ok) setMigration(null);
    });
  }, [sourceUrl]);

  // Dismiss: keeps the local doc and re-arms next visit (per-mount —
  // within THIS mount the offer never re-fires once dismissed).
  const dismissMigration = useCallback(() => {
    migrationDismissed.current = true;
    setMigration(null);
  }, []);

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
  // T-MG-INK-7 EVICTION LAW: the same observer also analyses each batch
  // for external evictions — a batch that removed an ink root (the
  // `data-ink-root` wrapper or the canvas itself) from a still-connected
  // [data-page] target which carries NO ink canvas after the batch
  // settles (final-state check: a same-batch remove+re-add passes) lost
  // its portal subtree to a non-React `replaceChildren` (the pane's
  // renderPage double-buffer swap, the off-radius sweep, a rotation
  // refreeze). The heal re-attaches the registered subtree into the SAME
  // holder synchronously — the exact nodes React already believes are
  // rendered there, so React's model and the DOM agree again with ZERO
  // remounts. Surgical: only the evicted holder is touched; every other
  // page's canvas keeps node identity and in-flight gestures survive.
  // Loop-safe: a healed holder carries its canvas (the check can never
  // re-fire on it), the re-attach is an addition-only batch, and benign
  // addition-only batches (the pane's text-layer rebuilds) never heal.
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
    const heal = (muts: MutationRecord[]) => {
      const candidates = new Set<HTMLElement>();
      for (const m of muts) {
        for (const node of m.removedNodes) {
          if (
            node.nodeType === 1 &&
            ((node as HTMLElement).hasAttribute?.("data-ink-root") ||
              (node as HTMLElement).hasAttribute?.("data-ink-page")) &&
            m.target instanceof HTMLElement &&
            m.target.isConnected &&
            m.target.hasAttribute("data-page")
          ) {
            candidates.add(m.target);
          }
        }
      }
      for (const holder of candidates) {
        if (holder.querySelector("canvas[data-ink-page]")) continue;
        const page = Number.parseInt(holder.dataset.page ?? "", 10);
        if (!Number.isInteger(page) || page < 1) continue;
        const ghost = inkRootsRef.current.get(page);
        if (ghost && !ghost.isConnected) holder.appendChild(ghost);
      }
    };
    rescan();
    const obs = new MutationObserver((muts) => {
      rescan();
      heal(muts);
    });
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

  // ── T-MG-INK-4 commit paths ──
  // The math text box commits an ordinary mtext shape (the DOM overlay
  // renders it; the doc carries the KaTeX source verbatim).
  const commitMath = useCallback(
    (shape: Omit<InkMathShape, "id" | "kind">) => {
      const m: InkMathShape = { id: makeShapeId(), kind: "mtext", ...shape };
      commit([...shapesRef.current, m]);
    },
    [commit],
  );

  // ── T-MG-INK-4 run-003: the re-edit paths ──
  // Content replacement IN PLACE (the same id = the merge key — the move
  // law's newer-intent precedent, so an edit survives every 409 rebase
  // exactly like a move does); one commit → one undo step. Colour, size
  // and anchor untouched (content-only edit — recolour/resize is delete
  // + re-add, disclosed).
  const commitTextEdit = useCallback(
    (id: string, text: string) => {
      commit(editTextShape(shapesRef.current, id, text));
    },
    [commit],
  );

  const commitMathEdit = useCallback(
    (id: string, tex: string) => {
      commit(editMathShape(shapesRef.current, id, tex));
    },
    [commit],
  );

  // Erase: the tombstone law — every target becomes its tombstone IN
  // PLACE (same id), one commit per gesture (one undo step). Deletion
  // survives every rebase because the id IS the merge key.
  const commitErase = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      commit(eraseShapes(shapesRef.current, new Set(ids)));
    },
    [commit],
  );

  // Move: replace the moved shape IN PLACE (same id — the move is the
  // newer intent; local-wins on rebase).
  const commitMove = useCallback(
    (moved: InkShape) => {
      commit(shapesRef.current.map((s) => (s.id === moved.id ? moved : s)));
    },
    [commit],
  );

  // ── instrument-guide callbacks (T-MG-INK-2) ──
  // Drag/rotate/remove live in ANY mode (the tldraw posture); snap-DRAW
  // routes through the canvas only in the guide's own mode.
  const guideDown = useCallback((tool: "ruler" | "protractor", frac: { x: number; y: number }) => {
    const g = tool === "ruler" ? rulerGuide : protractorGuide;
    if (!g) return;
    guideDragRef.current = { tool, off: grabOffset(g, frac) };
  }, [rulerGuide, protractorGuide]);

  const guideMove = useCallback(
    (tool: "ruler" | "protractor", frac: { x: number; y: number }, box: { cssW: number; cssH: number }) => {
      const d = guideDragRef.current;
      if (!d || d.tool !== tool) return;
      if (tool === "ruler") {
        setRulerGuide((g) => (g ? moveGuide(g, frac, d.off) : g));
      } else {
        setProtractorGuide((g) => (g ? moveGuide(g, frac, d.off) : g));
      }
      void box;
    },
    [],
  );

  const guideRotate = useCallback(
    (tool: "ruler" | "protractor", frac: { x: number; y: number }, box: { cssW: number; cssH: number }) => {
      if (tool === "ruler") {
        setRulerGuide((g) => (g ? rulerRotateTo(g, frac, box) : g));
      } else {
        setProtractorGuide((g) => (g ? protractorRotateTo(g, frac, box) : g));
      }
    },
    [],
  );

  const guideCreate = useCallback(
    (tool: "ruler" | "protractor", page: number, frac: { x: number; y: number }) => {
      if (tool === "ruler" && !rulerGuide) setRulerGuide(newRulerGuide(page, frac));
      if (tool === "protractor" && !protractorGuide) setProtractorGuide(newProtractorGuide(page, frac));
    },
    [rulerGuide, protractorGuide],
  );

  // T-MG-INK-3 run-002: the gate is the SURFACE gate (a sourceUrl to key
  // on), not a token gate — the token chooses the persistence mode
  // (sync vs local) in the fork above, never whether the surface renders.
  if (!sourceUrl || !sync) return null;

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
          {/* T-MG-INK-4: the math text box (the MG census tool) — the
            * mtext kind via the KaTeX DOM overlay. */}
          <Button
            size="sm"
            variant={mode === "math" ? "secondary" : "ghost"}
            className="size-8 px-0"
            aria-pressed={mode === "math"}
            aria-label="Math text box tool"
            onClick={() => setMode("math")}
          >
            <Sigma className="size-4" aria-hidden />
          </Button>
          <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          {/* T-MG-INK-4: select + erase (the census tools) — shapes are
            * first-class now: single-shape select/move, whole-shape
            * atomic erase via the tombstone law. */}
          <Button
            size="sm"
            variant={mode === "select" ? "secondary" : "ghost"}
            className="size-8 px-0"
            aria-pressed={mode === "select"}
            aria-label="Select tool"
            onClick={() => setMode("select")}
          >
            <MousePointer2 className="size-4" aria-hidden />
          </Button>
          <Button
            size="sm"
            variant={mode === "erase" ? "secondary" : "ghost"}
            className="size-8 px-0"
            aria-pressed={mode === "erase"}
            aria-label="Erase tool"
            onClick={() => setMode("erase")}
          >
            <Eraser className="size-4" aria-hidden />
          </Button>
          <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          {/* T-MG-INK-2: the maths instruments (the MG census family).
            * Each emits ORDINARY strokes — zero schema impact. */}
          <Button
            size="sm"
            variant={mode === "line" ? "secondary" : "ghost"}
            className="size-8 px-0"
            aria-pressed={mode === "line"}
            aria-label="Straight line tool"
            onClick={() => setMode("line")}
          >
            <Minus className="size-4" aria-hidden />
          </Button>
          <Button
            size="sm"
            variant={mode === "ruler" ? "secondary" : "ghost"}
            className="size-8 px-0"
            aria-pressed={mode === "ruler"}
            aria-label="Ruler guide — draw along the edge"
            onClick={() => setMode("ruler")}
          >
            <Ruler className="size-4" aria-hidden />
          </Button>
          <Button
            size="sm"
            variant={mode === "protractor" ? "secondary" : "ghost"}
            className="size-8 px-0"
            aria-pressed={mode === "protractor"}
            aria-label="Protractor guide — draw along the rim"
            onClick={() => setMode("protractor")}
          >
            <Gauge className="size-4" aria-hidden />
          </Button>
          <Button
            size="sm"
            variant={mode === "compasses" ? "secondary" : "ghost"}
            className="size-8 px-0"
            aria-pressed={mode === "compasses"}
            aria-label="Compasses — drag from a pivot to draw a circle"
            onClick={() => setMode("compasses")}
          >
            <Compass className="size-4" aria-hidden />
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
          {/* the status pill — honest states only. T-MG-INK-3 run-002:
              LOCAL mode renders exactly ONE healthy state (the posture
              statement, role=status) plus the honest error; the sync
              states (Saving…/Saved/Edited elsewhere) are sync-mode-only. */}
          {token ? (
            <>
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
            </>
          ) : snap.status === "error" ? (
            <button
              type="button"
              className="flex items-center gap-1 rounded px-1 text-[11px] text-destructive underline underline-offset-2"
              onClick={() => sync.retry()}
            >
              <AlertTriangle className="size-3" aria-hidden /> Couldn't save on this device — retry
            </button>
          ) : (
            <span
              className="flex items-center gap-1 px-1 text-[11px] text-muted-foreground"
              role="status"
              aria-label="Local only — saved on this device. Log in to sync."
            >
              Local only — saved on this device. Log in to sync.
            </span>
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

      {/* T-MG-INK-3 run-002: the consent-gated migration notice — sync
          mode only, floating above the ink launcher. Exactly three exits:
          Upload to account | Discard local | dismiss (keeps local,
          re-arms next visit). Login never auto-migrates. */}
      {migration && token && sourceUrl && (
        <div
          aria-label="Ink saved on this device"
          className="absolute bottom-14 right-2 z-40 max-w-72 rounded-lg border bg-background/95 p-3 text-xs shadow-md backdrop-blur"
        >
          <p className="text-muted-foreground">
            {migration.phase === "failed"
              ? "Upload didn't complete — your ink is still saved on this device."
              : "You have ink on this paper saved only on this device."}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              className="h-7 px-2 text-xs"
              disabled={migration.phase === "uploading"}
              onClick={uploadLocalInk}
            >
              {migration.phase === "uploading" ? (
                <>
                  <Loader2 className="size-3 animate-spin" aria-hidden /> Uploading…
                </>
              ) : (
                "Upload to account"
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-destructive"
              disabled={migration.phase === "uploading"}
              onClick={discardLocalInk}
            >
              Discard local
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto size-7 px-0"
              aria-label="Dismiss — keep this ink on this device"
              disabled={migration.phase === "uploading"}
              onClick={dismissMigration}
            >
              <X className="size-3.5" aria-hidden />
            </Button>
          </div>
        </div>
      )}

      {/* one canvas portal per mounted page holder; the T-MG-INK-7
          wrapper gives the portal ONE registered root — the eviction law
          re-attaches this exact subtree if the pane's repaint empties the
          holder (same nodes, no remount). display:contents keeps the
          canvas's absolute positioning resolved against the holder. */}
      {enabled &&
        holders.map(({ page, el }) =>
          createPortal(
            <div
              key={`ink-${page}`}
              ref={(el2) => {
                if (el2) inkRootsRef.current.set(page, el2);
                else inkRootsRef.current.delete(page);
              }}
              data-ink-root={page}
              className="contents"
            >
              <InkCanvas
                key={page}
              page={page}
              shapes={snap.shapes.filter((s) => s.page === page)}
              mode={mode}
              color={color}
              widthFrac={INK_WIDTH_FRACS[widthIdx]}
              onCommitStroke={commitStroke}
              onCommitText={commitText}
              onCommitMath={commitMath}
              onCommitTextEdit={commitTextEdit}
              onCommitMathEdit={commitMathEdit}
              onCommitErase={commitErase}
              onCommitMove={commitMove}
              ruler={rulerGuide?.page === page ? rulerGuide : null}
              protractor={protractorGuide?.page === page ? protractorGuide : null}
              onGuideDown={guideDown}
              onGuideMove={guideMove}
              onGuideRotate={guideRotate}
              onGuideCreate={guideCreate}
              guideSlot={
                <>
                  {rulerGuide?.page === page && (
                    <RulerGuideView
                      guide={rulerGuide}
                      interactive
                      onDragStart={(e) => {
                        const r = holderRead(e);
                        guideDown("ruler", r.frac);
                      }}
                      onDragMove={(e) => {
                        const r = holderRead(e);
                        guideMove("ruler", r.frac, r.box);
                      }}
                      onRotateMove={(e) => {
                        const r = holderRead(e);
                        guideRotate("ruler", r.frac, r.box);
                      }}
                      onRemove={() => setRulerGuide(null)}
                    />
                  )}
                  {protractorGuide?.page === page && (
                    <ProtractorGuideView
                      guide={protractorGuide}
                      interactive
                      onDragStart={(e) => {
                        const r = holderRead(e);
                        guideDown("protractor", r.frac);
                      }}
                      onDragMove={(e) => {
                        const r = holderRead(e);
                        guideMove("protractor", r.frac, r.box);
                      }}
                      onRotateMove={(e) => {
                        const r = holderRead(e);
                        guideRotate("protractor", r.frac, r.box);
                      }}
                      onRemove={() => setProtractorGuide(null)}
                    />
                  )}
                </>
              }
              />
            </div>,
            el,
            `ink-${page}`,
          ),
        )}
    </>
  );
}

export interface InkCanvasProps {
  page: number;
  shapes: InkShape[];
  mode: InkToolMode;
  color: InkColor;
  widthFrac: number;
  onCommitStroke: (page: number, points: Array<[number, number]>) => void;
  onCommitText: (shape: Omit<InkTextShape, "id" | "kind">) => void;
  // T-MG-INK-4: the math text box + the erase/select commit paths.
  onCommitMath: (shape: Omit<InkMathShape, "id" | "kind">) => void;
  // T-MG-INK-4 run-003: the re-edit paths — content replacement in place
  // (the same id; empty value = cancel at the source).
  onCommitTextEdit: (id: string, text: string) => void;
  onCommitMathEdit: (id: string, tex: string) => void;
  onCommitErase: (ids: string[]) => void;
  onCommitMove: (moved: InkShape) => void;
  // T-MG-INK-2: the page-matched guides + the guide callbacks (the guide
  // state lives in InkLayer; the canvas only routes gestures to it).
  ruler?: RulerGuide | null;
  protractor?: ProtractorGuide | null;
  onGuideDown?: (tool: "ruler" | "protractor", frac: { x: number; y: number }) => void;
  onGuideMove?: (
    tool: "ruler" | "protractor",
    frac: { x: number; y: number },
    box: { cssW: number; cssH: number },
  ) => void;
  onGuideRotate?: (
    tool: "ruler" | "protractor",
    frac: { x: number; y: number },
    box: { cssW: number; cssH: number },
  ) => void;
  onGuideCreate?: (tool: "ruler" | "protractor", page: number, frac: { x: number; y: number }) => void;
  /** The guide chrome rendered as the canvas's sibling inside the holder. */
  guideSlot?: React.ReactNode;
}

type DragKind = "freehand" | "line" | "ruler" | "protractor" | "compasses" | "guide" | "erase" | "move";

/** The run-003 re-edit tap law: the TOPMOST hit of the given family
 * (text | mtext) under the point — shapeHitTest owns the geometry (the
 * same bounds law erase/select read), this only filters the family and
 * walks the hits back-to-front (doc order = paint order). */
function topmostFamilyHit<K extends "text" | "mtext">(
  family: K,
  shapes: InkShape[],
  frac: { x: number; y: number },
  box: { cssW: number; cssH: number },
  tolCssPx: number,
  measured?: (id: string) => MeasuredSize | undefined,
): Extract<InkShape, { kind: K }> | null {
  const hits = shapesHitIds(shapes, frac, box, tolCssPx, measured);
  for (let i = hits.length - 1; i >= 0; i--) {
    const s = shapes.find((sh) => sh.id === hits[i]);
    if (s && s.kind === family) return s as Extract<InkShape, { kind: K }>;
  }
  return null;
}

/** One page's ink canvas — portaled into the pane's page holder. The
 * gesture router for every ink mode: freehand (pen), text placement, and
 * the T-MG-INK-2 instruments (line / ruler / protractor / compasses),
 * whose pure math lives in ./instruments.
 *
 * Exported (component + props type) as the T-MG-INK-6 run-002 regression
 * seam: the pointerdown law is test-pinned at THIS handler in jsdom
 * (ink-layer-pointerdown.test.ts) — mounting the outer InkLayer would
 * drag the observer/local-store planes into the seam for no law of
 * theirs is under test here. Export-only: zero behaviour change. */
export function InkCanvas({
  page,
  shapes,
  mode,
  color,
  widthFrac,
  onCommitStroke,
  onCommitText,
  onCommitMath,
  onCommitTextEdit,
  onCommitMathEdit,
  onCommitErase,
  onCommitMove,
  ruler,
  protractor,
  onGuideDown,
  onGuideMove,
  onGuideRotate,
  onGuideCreate,
  guideSlot,
}: InkCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const boxRef = useRef<{ cssW: number; cssH: number }>({ cssW: 0, cssH: 0 });
  const activeRef = useRef<Array<[number, number]> | null>(null);
  const lastPxRef = useRef<[number, number] | null>(null);
  const rafRef = useRef(0);
  const [draft, setDraft] = useState<{ x: number; y: number; value: string; editId?: string } | null>(null);
  // instrument drag state (T-MG-INK-2)
  const dragKindRef = useRef<DragKind | null>(null);
  const guideToolRef = useRef<"ruler" | "protractor" | null>(null);
  const rawRef = useRef<Array<[number, number]>>([]);
  const pivotRef = useRef<{ x: number; y: number } | null>(null);
  const [sweepDeg, setSweepDeg] = useState<number | null>(null);
  // ── T-MG-INK-4 state: math draft, erase sweep, select/move ──
  const [mathDraft, setMathDraft] = useState<{ x: number; y: number; value: string; editId?: string } | null>(null);
  const [erasePreview, setErasePreview] = useState<Set<string> | null>(null);
  const [movePreview, setMovePreview] = useState<InkShape | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The dashed-bbox affordance in NORMALIZED fractions (zoom-invariant —
  // the RegionOverlay geometry law at chrome grain).
  const [selBox, setSelBox] = useState<{ l: number; t: number; w: number; h: number } | null>(null);
  const moveStartRef = useRef<{ clientX: number; clientY: number; shape: InkShape; moved: boolean } | null>(null);
  // The DOM-measured mtext boxes (css px), refreshed at gesture start —
  // the pure module never reads the DOM (the MeasuredSize seam).
  const measuredRef = useRef<Map<string, MeasuredSize>>(new Map());

  // The display set = the working set with the LIVE erase/move previews
  // folded in (the preview is visual only — nothing commits until the
  // gesture ends; the erase preview shows tombstoned targets, i.e. gone).
  const displayShapes = useMemo(() => {
    let out = shapes;
    if (erasePreview && erasePreview.size > 0) out = eraseShapes(out, erasePreview);
    if (movePreview) out = out.map((s) => (s.id === movePreview.id ? movePreview : s));
    return out;
  }, [shapes, erasePreview, movePreview]);

  const readMeasured = useCallback((id: string): MeasuredSize | undefined => measuredRef.current.get(id), []);

  const measureMtexts = useCallback(() => {
    const holder = canvasRef.current?.parentElement;
    const next = new Map<string, MeasuredSize>();
    if (holder) {
      for (const el of holder.querySelectorAll<HTMLElement>("[data-mtext-id]")) {
        const id = el.dataset.mtextId;
        if (!id) continue;
        const r = el.getBoundingClientRect();
        next.set(id, { w: r.width, h: r.height });
      }
    }
    measuredRef.current = next;
  }, []);

  // Selection is select-mode-only chrome: the AFFORDANCE derives from
  // the live shape set (a selected shape that got erased/tombstoned
  // auto-hides; the fractions are zoom-invariant so a stale box stays
  // honest). No effect, no cascading setState — the render gates it.
  const selectedShape =
    mode === "select" && selectedId ? displayShapes.find((s) => s.id === selectedId) ?? null : null;

  const repaint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const box = canvas.getBoundingClientRect();
    boxRef.current = { cssW: box.width, cssH: box.height };
    sizeBackingStore(ctx, canvas, box.width, box.height, window.devicePixelRatio || 1);
    paintShapes(ctx, boxRef.current, displayShapes, activeRef.current ? { color, widthFrac, points: activeRef.current } : null);
  }, [displayShapes, color, widthFrac]);

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
      paintShapes(ctx, boxRef.current, displayShapes, activeRef.current ? { color, widthFrac, points: activeRef.current } : null);
    });
  }, [displayShapes, color, widthFrac]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      if (mode === "text") {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        // T-MG-INK-6 run-002 (the pointerdown law): cancel the OPENING press
        // BEFORE any setDraft. Per the Pointer Events spec's compatibility
        // mapping, a canceled pointerdown suppresses the browser's compat
        // mousedown — so the press-focus transfer this same gesture would
        // fire cannot steal focus from the autoFocus'd draft textarea that
        // mounts below, and the mount → spurious onBlur → empty-commit →
        // unmount flash-close (the P1 defect of record, proven live
        // 2026-11-01) is dead at the root. ONE law covers the create tap AND
        // the run-003 re-edit tap (same branch, same race). The right-button
        // guard already returned above, so context menus survive; the
        // working tools (pen/erase/select/line/instruments) gain nothing —
        // their branches stay preventDefault-free, pinned by the test seam.
        e.preventDefault();
        const box = canvas.getBoundingClientRect();
        const cssBox = { cssW: box.width, cssH: box.height };
        const frac = normalizePoint(
          { left: box.left, top: box.top, width: box.width, height: box.height },
          e.clientX,
          e.clientY,
        );
        // T-MG-INK-4 run-003: the tap-hit re-edit law — a tap on an
        // EXISTING text box (topmost of the family) opens it for editing;
        // an empty-canvas tap creates a new one (the MG parity posture).
        const target = topmostFamilyHit("text", displayShapes, { x: frac[0], y: frac[1] }, cssBox, ERASE_TOL_CSS_PX);
        setDraft(
          target
            ? { x: target.x, y: target.y, value: target.text, editId: target.id }
            : { x: frac[0], y: frac[1], value: "" },
        );
        return;
      }
      if (mode === "math") {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        // T-MG-INK-6 run-002: the pointerdown law, math twin — the same
        // compat-mousedown suppression as the text branch above, covering
        // both the create tap and the mtext re-edit tap.
        e.preventDefault();
        const box = canvas.getBoundingClientRect();
        const cssBox = { cssW: box.width, cssH: box.height };
        const frac = normalizePoint(
          { left: box.left, top: box.top, width: box.width, height: box.height },
          e.clientX,
          e.clientY,
        );
        // run-003: the mtext twin — the measured-truth hit law (the same
        // read the erase/select gestures use), topmost of the family.
        measureMtexts();
        const target = topmostFamilyHit("mtext", displayShapes, { x: frac[0], y: frac[1] }, cssBox, ERASE_TOL_CSS_PX, readMeasured);
        setMathDraft(
          target
            ? { x: target.x, y: target.y, value: target.tex, editId: target.id }
            : { x: frac[0], y: frac[1], value: "" },
        );
        return;
      }
      if (mode === "erase" || mode === "select") {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        const box = canvas.getBoundingClientRect();
        const cssBox = { cssW: box.width, cssH: box.height };
        const frac = normalizePoint(
          { left: box.left, top: box.top, width: box.width, height: box.height },
          e.clientX,
          e.clientY,
        );
        measureMtexts();
        const hits = shapesHitIds(displayShapes, { x: frac[0], y: frac[1] }, cssBox, ERASE_TOL_CSS_PX, readMeasured);
        if (mode === "erase") {
          canvas.setPointerCapture(e.pointerId);
          dragKindRef.current = "erase";
          setErasePreview(hits.length > 0 ? new Set(hits) : new Set());
          return;
        }
        // select: the LAST hit is the topmost (doc/paint order)
        const topId = hits.length > 0 ? hits[hits.length - 1]! : null;
        const shape = topId ? displayShapes.find((s) => s.id === topId) ?? null : null;
        if (shape) {
          setSelectedId(shape.id);
          const b = shapeBoundsCss(shape, cssBox, measuredRef.current.get(shape.id));
          if (b && cssBox.cssW > 0 && cssBox.cssH > 0) {
            setSelBox({ l: b.x / cssBox.cssW, t: b.y / cssBox.cssH, w: b.w / cssBox.cssW, h: b.h / cssBox.cssH });
          }
          moveStartRef.current = { clientX: e.clientX, clientY: e.clientY, shape, moved: false };
          canvas.setPointerCapture(e.pointerId);
          dragKindRef.current = "move";
          return;
        }
        setSelectedId(null);
        setSelBox(null);
        return;
      }
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const box = canvas.getBoundingClientRect();
      const nbox = { left: box.left, top: box.top, width: box.width, height: box.height };
      const cssBox = { cssW: box.width, cssH: box.height };
      const frac = normalizePoint(nbox, e.clientX, e.clientY);
      if (mode === "line") {
        canvas.setPointerCapture(e.pointerId);
        dragKindRef.current = "line";
        activeRef.current = [frac, frac];
        lastPxRef.current = [e.clientX, e.clientY];
        scheduleLive();
        return;
      }
      if (mode === "compasses") {
        canvas.setPointerCapture(e.pointerId);
        dragKindRef.current = "compasses";
        pivotRef.current = { x: frac[0], y: frac[1] };
        rawRef.current = [frac];
        activeRef.current = [];
        lastPxRef.current = [e.clientX, e.clientY];
        scheduleLive();
        return;
      }
      if (mode === "ruler" || mode === "protractor") {
        const guide = mode === "ruler" ? ruler : protractor;
        if (guide) {
          const live =
            mode === "ruler" ? rulerLivePoint({ x: frac[0], y: frac[1] }, ruler!, cssBox) : protractorLivePoint({ x: frac[0], y: frac[1] }, protractor!, cssBox);
          if (live) {
            // pen down on the guide's snap line → instrument draw
            canvas.setPointerCapture(e.pointerId);
            dragKindRef.current = mode;
            rawRef.current = [frac];
            activeRef.current = [
              [live.x, live.y],
              [live.x, live.y],
            ];
            lastPxRef.current = [e.clientX, e.clientY];
            if (mode === "protractor") setSweepDeg(0);
            scheduleLive();
            return;
          }
          // off the snap line → the touch belongs to the guide (drag body)
          dragKindRef.current = "guide";
          guideToolRef.current = mode;
          canvas.setPointerCapture(e.pointerId);
          onGuideDown?.(mode, { x: frac[0], y: frac[1] });
          return;
        }
        // no guide yet → the creating tap (next touch manipulates it)
        onGuideCreate?.(mode, page, { x: frac[0], y: frac[1] });
        return;
      }
      canvas.setPointerCapture(e.pointerId);
      dragKindRef.current = "freehand";
      activeRef.current = [frac];
      lastPxRef.current = [e.clientX, e.clientY];
      scheduleLive();
    },
    [mode, ruler, protractor, onGuideDown, onGuideCreate, scheduleLive, displayShapes, readMeasured, measureMtexts],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const kind = dragKindRef.current;
      if (!kind) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const last = lastPxRef.current;
      if (kind === "freehand" && last && !shouldAppendPoint(last, [e.clientX, e.clientY], 1.2)) return;
      const box = canvas.getBoundingClientRect();
      const nbox = { left: box.left, top: box.top, width: box.width, height: box.height };
      const cssBox = { cssW: box.width, cssH: box.height };
      const frac = normalizePoint(nbox, e.clientX, e.clientY);
      lastPxRef.current = [e.clientX, e.clientY];
      if (kind === "erase") {
        const hits = shapesHitIds(displayShapes, { x: frac[0], y: frac[1] }, cssBox, ERASE_TOL_CSS_PX, readMeasured);
        if (hits.length > 0) {
          setErasePreview((prev) => {
            const next = new Set(prev ?? []);
            let changed = false;
            for (const id of hits) {
              if (!next.has(id)) {
                next.add(id);
                changed = true;
              }
            }
            return changed ? next : prev;
          });
        }
        scheduleLive();
        return;
      }
      if (kind === "move") {
        const st = moveStartRef.current;
        if (st) {
          const dx = (e.clientX - st.clientX) / box.width;
          const dy = (e.clientY - st.clientY) / box.height;
          if (dx !== 0 || dy !== 0) st.moved = true;
          const moved = translateShape(st.shape, dx, dy);
          if (moved) setMovePreview(moved);
          scheduleLive();
        }
        return;
      }
      if (kind === "guide") {
        onGuideMove?.(guideToolRef.current ?? "ruler", { x: frac[0], y: frac[1] }, cssBox);
        return;
      }
      if (kind === "line") {
        const active = activeRef.current;
        if (active && active.length >= 1) {
          activeRef.current = [active[0], frac];
          scheduleLive();
        }
        return;
      }
      if (kind === "compasses") {
        const pivot = pivotRef.current;
        if (pivot) {
          rawRef.current.push(frac);
          const r = compassesRadiusFrac(pivot, { x: frac[0], y: frac[1] }, cssBox);
          activeRef.current = compassesCommitable(r, cssBox) ? sampleCircleCompasses(pivot, r, cssBox) : [];
          scheduleLive();
        }
        return;
      }
      if (kind === "ruler" || kind === "protractor") {
        rawRef.current.push(frac);
        const guide = kind === "ruler" ? ruler : protractor;
        const live = guide
          ? kind === "ruler"
            ? rulerLivePoint({ x: frac[0], y: frac[1] }, guide as RulerGuide, cssBox)
            : protractorLivePoint({ x: frac[0], y: frac[1] }, guide as ProtractorGuide, cssBox)
          : null;
        const active = activeRef.current;
        if (active) {
          active.push(live ? [live.x, live.y] : frac);
          scheduleLive();
        }
        if (kind === "protractor" && protractor && rawRef.current.length >= 1) {
          // the swept-angle readout (raw start → raw current)
          const c = { x: protractor.x * cssBox.cssW, y: protractor.y * cssBox.cssH };
          const first = rawRef.current[0];
          const a0 = angleDegFrom(c, { x: first[0] * cssBox.cssW, y: first[1] * cssBox.cssH });
          const a1 = angleDegFrom(c, { x: frac[0] * cssBox.cssW, y: frac[1] * cssBox.cssH });
          setSweepDeg(Math.abs(shortestSignedDelta(a0, a1)));
        }
        return;
      }
      // freehand
      const active = activeRef.current;
      if (active) {
        active.push(frac);
        scheduleLive();
      }
    },
    [ruler, protractor, onGuideMove, scheduleLive, displayShapes, readMeasured],
  );

  const endStroke = useCallback(() => {
    const kind = dragKindRef.current;
    dragKindRef.current = null;
    const active = activeRef.current;
    activeRef.current = null;
    lastPxRef.current = null;
    if (!kind) return;
    if (kind === "guide") {
      guideToolRef.current = null;
      return; // guide manipulation commits no ink
    }
    if (kind === "erase") {
      // ONE commit per gesture (one undo step): the swept targets become
      // tombstones atomically; an empty sweep just repaints.
      const ids = erasePreview ? [...erasePreview] : [];
      setErasePreview(null);
      if (ids.length > 0) onCommitErase(ids);
      else repaint();
      return;
    }
    if (kind === "move") {
      const moved = movePreview;
      const st = moveStartRef.current;
      moveStartRef.current = null;
      setMovePreview(null);
      if (moved && st?.moved) onCommitMove(moved);
      return;
    }
    const canvas = canvasRef.current;
    const cssBox = boxRef.current.cssW > 0 ? boxRef.current : canvas ? { cssW: canvas.getBoundingClientRect().width, cssH: canvas.getBoundingClientRect().height } : { cssW: 0, cssH: 0 };
    if (kind === "compasses") {
      const pivot = pivotRef.current;
      pivotRef.current = null;
      const raw = rawRef.current;
      rawRef.current = [];
      if (pivot && raw.length > 0 && cssBox.cssW > 0) {
        const r = compassesRadiusFrac(pivot, { x: raw[raw.length - 1][0], y: raw[raw.length - 1][1] }, cssBox);
        if (compassesCommitable(r, cssBox)) {
          onCommitStroke(page, sampleCircleCompasses(pivot, r, cssBox));
          return;
        }
      }
      repaint();
      return;
    }
    if (kind === "line") {
      if (active && active.length >= 2 && cssBox.cssW > 0) {
        const [a, b] = [active[0], active[active.length - 1]];
        const px = Math.hypot((b[0] - a[0]) * cssBox.cssW, (b[1] - a[1]) * cssBox.cssH);
        if (px >= 2) {
          onCommitStroke(page, [a, b]);
          return;
        }
      }
      repaint();
      return;
    }
    if (kind === "ruler" || kind === "protractor") {
      const raw = rawRef.current;
      rawRef.current = [];
      setSweepDeg(null);
      const clean =
        kind === "ruler"
          ? ruler && raw.length >= 2
            ? applyRulerSnap({ x: raw[0][0], y: raw[0][1] }, { x: raw[raw.length - 1][0], y: raw[raw.length - 1][1] }, ruler, cssBox)
            : null
          : protractor && raw.length >= 2
            ? applyProtractorSnap({ x: raw[0][0], y: raw[0][1] }, { x: raw[raw.length - 1][0], y: raw[raw.length - 1][1] }, protractor, cssBox)
            : null;
      if (clean) {
        onCommitStroke(page, kind === "ruler" ? (clean as [number, number][]) : (clean as { points: [number, number][] }).points);
        return;
      }
      // the honest mixed path (projected where near the guide, raw elsewhere)
      if (active && active.length >= 2) {
        onCommitStroke(page, active);
        return;
      }
      repaint();
      return;
    }
    // freehand (the run-003 law)
    if (active && active.length >= 2) onCommitStroke(page, active);
    else repaint();
  }, [onCommitStroke, onCommitErase, onCommitMove, page, repaint, ruler, protractor, erasePreview, movePreview]);

  const commitDraft = useCallback(() => {
    if (!draft) return;
    const value = draft.value.trim();
    // run-003: the edit path — content replaced in place (same id); an
    // empty commit is a CANCEL (the shape is unchanged — deletion stays
    // the erase/✕ surface, never the editor).
    if (draft.editId) {
      if (value) onCommitTextEdit(draft.editId, value);
      setDraft(null);
      return;
    }
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
  }, [draft, onCommitTextEdit, color, onCommitText, page]);

  // T-MG-INK-4: the math draft commits an mtext at the same relative
  // size law as the text editor (14 css px at commit time). run-003:
  // the edit twin — content replaced in place (same id), empty = cancel.
  const commitMathDraft = useCallback(() => {
    if (!mathDraft) return;
    const value = mathDraft.value.trim();
    if (mathDraft.editId) {
      if (value) onCommitMathEdit(mathDraft.editId, value);
      setMathDraft(null);
      return;
    }
    const { cssW } = boxRef.current;
    if (value && cssW > 0) {
      onCommitMath({
        page,
        color,
        sizeFrac: clamp01(14 / cssW),
        x: mathDraft.x,
        y: mathDraft.y,
        tex: value,
      });
    }
    setMathDraft(null);
  }, [mathDraft, onCommitMathEdit, color, onCommitMath, page]);

  // The select affordance's ✕ — the tombstone law via the erase path.
  const eraseSelected = useCallback(() => {
    if (!selectedId) return;
    onCommitErase([selectedId]);
    setSelectedId(null);
    setSelBox(null);
  }, [selectedId, onCommitErase]);

  const toolCursor =
    mode === "text" || mode === "math"
      ? "text"
      : mode === "select"
        ? "default"
        : mode === "ruler" || mode === "protractor"
          ? "move"
          : "crosshair";

  return (
    <>
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        data-ink-page={page}
        className="pp-inkLayer absolute inset-0 z-30 h-full w-full"
        style={{ touchAction: "none", cursor: toolCursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
        onPointerLeave={(e) => {
          // pen lifted off the canvas mid-stroke (mouse edge) → end cleanly
          if ((activeRef.current || dragKindRef.current) && e.pointerType === "mouse") endStroke();
        }}
      />
      {sweepDeg !== null && protractor && (
        <div
          role="status"
          aria-label="Swept angle"
          className="pointer-events-none absolute z-40 rounded border bg-background/95 px-1.5 py-0.5 text-[11px] shadow-md"
          style={{
            left: `${protractor.x * 100}%`,
            top: `${protractor.y * 100}%`,
            transform: "translate(-50%, -220%)",
          }}
        >
          {Math.round(sweepDeg)}°
        </div>
      )}
      {guideSlot}
      {/* T-MG-INK-4: the mtext overlays — DOM chrome (pointer-events:
        * none) in the InstrumentGuides family; the canvas keeps the
        * gesture; erase/select read these boxes via [data-mtext-id]. */}
      {displayShapes.filter((s): s is InkMathShape => s.kind === "mtext").map((s) => (
        <MathTextOverlay key={s.id} shape={s} />
      ))}
      {/* the select affordance — dashed bbox (normalized fractions,
        * zoom-invariant) + the ✕ delete (tombstone via the erase path);
        * gated on the selected shape EXISTING in the live display set */}
      {mode === "select" && selectedShape && selBox && (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute z-40 rounded border border-dashed border-foreground/70"
            style={{
              left: `${selBox.l * 100}%`,
              top: `${selBox.t * 100}%`,
              width: `${selBox.w * 100}%`,
              height: `${selBox.h * 100}%`,
            }}
          />
          <button
            type="button"
            aria-label="Erase selected shape"
            onClick={eraseSelected}
            className="absolute z-40 flex size-5 items-center justify-center rounded-full border bg-background/95 text-muted-foreground shadow-md"
            style={{
              left: `${(selBox.l + selBox.w) * 100}%`,
              top: `${selBox.t * 100}%`,
              transform: "translate(-50%, -50%)",
            }}
          >
            <X className="size-3" aria-hidden />
          </button>
        </>
      )}
      {draft && (
        <textarea
          autoFocus
          aria-label={draft.editId ? "Edit text annotation" : "New text annotation"}
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
      {mathDraft && (
        <textarea
          autoFocus
          aria-label={mathDraft.editId ? "Edit math annotation" : "New math annotation"}
          value={mathDraft.value}
          onChange={(e) => setMathDraft({ ...mathDraft, value: e.target.value })}
          onBlur={commitMathDraft}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              commitMathDraft();
            }
            if (e.key === "Escape") setMathDraft(null);
          }}
          className="absolute z-40 min-h-10 w-44 resize rounded border bg-background/95 p-1 font-mono text-xs shadow-md backdrop-blur"
          style={{ left: `${mathDraft.x * 100}%`, top: `${mathDraft.y * 100}%` }}
          placeholder="LaTeX, then Enter"
        />
      )}
    </>
  );
}

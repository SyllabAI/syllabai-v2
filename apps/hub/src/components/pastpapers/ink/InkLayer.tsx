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
 * GESTURE LAW (T-HUB-INK-TOUCH run-001, operator: "when it is on, cant
 * scroll or pinch zoom the pdf viewer"): the layer OPENS in Browse
 * (select) — the paper's own gestures stay native (the canvas's
 * touch-action is pan-x pan-y pinch-zoom, so pan + pinch-zoom ride the
 * paper); arming a draw-family tool hands the gesture to the canvas
 * (touch-action: none — pen/stylus/finger all draw) until Select is
 * picked again. While OFF the layer renders nothing at
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
 *
 * BREAKAGE SWEEP (T-HUB-INK-BRK, operator 2026-11-12: "because of the
 * pen/writing toolkit, the pdf viewer has many problems, sometimes some
 * things break") — four pinned fixes:
 *   1. TOOLBAR WALL: the expanded row is ONE nowrap horizontally-
 *      scrollable line (the pane's own s146 law) — the flex-wrap wall
 *      used to cover the paper's bottom 2–3 rows deep on a phone pane
 *      and swallow every scroll/pinch touch there.
 *   2. PINCH HIJACK: a draw-armed canvas tags itself data-ink-drawing
 *      and the pane's pinch pairing (pdf-pane s144) skips those
 *      pointers — a palm resting mid-stroke used to pair with the pen,
 *      step the zoom and swap the holder under the live stroke.
 *   3. DRAFT RACE: the open text/math draft is COMMITTED before a
 *      second placement opens (mirror refs + a settle set) — the old
 *      path silently clobbered the typed text or let the stale removal
 *      blur cancel the successor; every close path is now idempotent.
 *   4. ZERO-BOX WIPES: repaint refuses sub-px boxes (detached reads
 *      during the pane's non-React holder swaps) — the store is no
 *      longer wiped to 1×1 and the commit-time cssW guards can no
 *      longer silently drop a stroke/text.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { computePenModeOnLoad, penAutoArm, type InkPenPref } from "./ink-penmode";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  Compass,
  Eraser,
  Gauge,
  Keyboard,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  INK_COLORS,
  INK_COLOR_KEYS,
  INK_CHIP_COLOR,
  INK_CHIP_MATH_LABEL,
  INK_CHIP_MATH_OFFSET_PX,
  INK_CHIP_MATH_PX,
  INK_CHIP_OPACITY,
  INK_CHIP_TEXT_LABEL,
  INK_CHIP_TEXT_PX,
  INK_TEXT_BASE_PX,
  INK_TEXT_FONT_STACK,
  INK_TEXT_WEIGHT,
  INK_WIDTH_DOTS,
  INK_WIDTH_FRACS,
  INK_WIDTH_NAMES,
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
import { MathKeyboard } from "./MathKeyboard";
import { MathTextOverlay, renderMathHtml } from "./MathTextOverlay";
import {
  backspaceValue,
  insertIntoValue,
  keyInsertion,
  type KeyInsertion,
} from "./math-keyboard";
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
import { getPpPrefs, subscribePpPrefs, updatePpPrefs } from "@/lib/pp-viewer-prefs";

const TOKEN_KEY = "syllabai.token";

/** T-MG-INK-4 — the tool modes of record. The MG census family closes:
 * pen / text / MATH (the Math text box) / SELECT / ERASE + the four
 * maths instruments. Browse stays the ink-off toggle posture (the
 * spec's disclosed non-goal). */
type InkToolMode = "pen" | "text" | "math" | "erase" | "select" | InstrumentMode;

/** The erase/select hit tolerance (the spec's css-px hit-disc law:
 * max(this, the pen's own width) — dpr-independent). */
const ERASE_TOL_CSS_PX = 12;

/** T-MG-INK-11 run-001: the palm-rejection window — a TOUCH gesture may
 * not start within this many ms of the last pen pointerdown (the palm
 * rests and taps while the stylus writes). Short on purpose: stylus-down
 * then finger-draw stays reachable once the window expires. */
const PEN_SESSION_MS = 1500;

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
  // T-MG-INK-11: MG's law — the annotator toolbar is ALWAYS visible on a
  // paper page (extracted live: all 18 buttons render with no gate, no
  // launcher). The old consent gate ("Ink" launcher) is gone; the sync
  // gate below (sourceUrl) is the only mount condition.
  // T-HUB-INK-TOUCH run-001 (operator: "THERE IS NO WAY TO DISABLE THE
  // BOTTOM TOOLS BAR"): the collapse control is IN scope now — the row
  // folds to a one-button pill (persisted per device), and the pill is
  // the way back. And the paper OPENS in Browse (select), not pen —
  // reading is the paper's first job; ink arms on an explicit pick.
  const [mode, setMode] = useState<InkToolMode>("select");
  // T-HUB-INK-BRK run-003: the LIVE tools mirror — armTool/pickColor/
  // pickWidth write it SYNCHRONOUSLY, before any React commit. On desktop
  // (lg) the first raster burst of all 28 pages can starve the re-render
  // for seconds; the portaled canvases' gesture handlers stayed on the
  // stale `mode` closure, so a tool armed in that window did NOTHING
  // (proven live 2026-11-13: tap dead at t0, alive at t+3s, same session).
  // The handlers read this ref first; `mode` stays for render-time
  // visuals. armTool also syncs the canvases' touch-action + the pane-pinch
  // marker imperatively so TOUCH gestures follow the new tool inside the
  // same dead window (a draw-armed finger used to pan the paper instead of
  // drawing until the render landed).
  const liveToolsRef = useRef<{ mode: InkToolMode; color: InkColor; widthFrac: number }>({
    mode: "select",
    color: "black",
    widthFrac: INK_WIDTH_FRACS[1],
  });
  // T-HUB-INK-TOUCH run-001: the collapsed posture — persisted per device
  // (the token-read try/catch pattern; private mode keeps the default).
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem("syllabai-ink-toolbar-collapsed") === "1");
    } catch {
      /* private mode — the expanded default stands */
    }
  }, []);
  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      try {
        window.localStorage.setItem("syllabai-ink-toolbar-collapsed", next ? "1" : "0");
      } catch {
        /* private mode — session-only posture */
      }
      return next;
    });
  }, []);
  // T-MG-INK-10: the arm epoch — every explicit arming (toolbar click,
  // hint-card arm) bumps it; the hover chips key their per-arm spend on
  // it (a placement spends the chip until the next arming).
  const [armSeq, setArmSeq] = useState(0);
  const [color, setColor] = useState<InkColor>("black");
  const [widthIdx, setWidthIdx] = useState(1);
  // T-HUB-INK-BRK run-003: the pick twins — the mirror writes FIRST (the
  // next stroke started inside the deferred-render window commits the
  // picked colour/width), then the render state catches up.
  const pickColor = useCallback((c: InkColor) => {
    liveToolsRef.current.color = c;
    setColor(c);
  }, []);
  const pickWidth = useCallback((i: number) => {
    liveToolsRef.current.widthFrac = INK_WIDTH_FRACS[i] ?? liveToolsRef.current.widthFrac;
    setWidthIdx(i);
  }, []);
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
  // T-HUB-INK-BRK run-003: the gesture-style sync — armTool's render-time
  // touch-action/data-ink-drawing updates are subject to the same deferred
  // re-render as the handlers, so this writes the canvases' gesture
  // contract IMPERATIVELY (a draw-armed finger must not pan the paper
  // inside the dead window). The render's style prop remains the truth
  // once it lands — the two agree (same source: liveToolsRef).
  const syncCanvasGestures = useCallback(() => {
    const { mode: m } = liveToolsRef.current;
    for (const root of inkRootsRef.current.values()) {
      const c = root.querySelector<HTMLCanvasElement>("canvas[data-ink-page]");
      if (!c) continue;
      c.style.touchAction = m === "select" ? "pan-x pan-y pinch-zoom" : "none";
      if (m === "select") c.removeAttribute("data-ink-drawing");
      else c.setAttribute("data-ink-drawing", c.getAttribute("data-ink-page") ?? "");
    }
  }, []);
  const armTool = useCallback((m: InkToolMode) => {
    liveToolsRef.current.mode = m;
    setMode(m);
    setArmSeq((s) => s + 1);
    syncCanvasGestures();
  }, [syncCanvasGestures]);
  // ── T-MG-INK-12 run-001: pen mode (stylus writes, finger scrolls) ──
  // The session state + the sticky preferences. The pure laws (the load
  // math, the auto-arm target) live in ./ink-penmode and are pinned
  // there; this is the wiring: the sighting persists 'stylus-seen', the
  // flip arms the freehand tool ONLY from the resting default, and an
  // explicit user toggle ('on'/'off') overrides the auto laws until
  // changed.
  const [penMode, setPenMode] = useState(false);
  const penModeRef = useRef(false);
  const penSeenRef = useRef(false);
  const penPrefRef = useRef<InkPenPref>("auto");
  useEffect(() => {
    try {
      const pref = window.localStorage.getItem("syllabai-ink-pen-mode");
      const seen = window.localStorage.getItem("syllabai-ink-stylus-seen") === "1";
      penSeenRef.current = seen;
      if (pref === "on" || pref === "off") penPrefRef.current = pref;
      penModeRef.current = computePenModeOnLoad(pref, seen);
      setPenMode(penModeRef.current);
    } catch {
      /* private mode — the session defaults stand (classic until a pen event) */
    }
  }, []);
  // The first-sighting law: persist the sticky sighting, then flip unless
  // the user explicitly declined ('off' — their finger-drawing choice
  // wins; the pen STILL writes as the armed tool either way). Idempotent
  // (the canvas may call it on every pen event).
  const markPenSeen = useCallback(() => {
    if (penSeenRef.current) return;
    penSeenRef.current = true;
    try {
      window.localStorage.setItem("syllabai-ink-stylus-seen", "1");
    } catch {
      /* private mode — session-only sighting */
    }
    if (penPrefRef.current === "off") return;
    penModeRef.current = true;
    setPenMode(true);
    if (penAutoArm(liveToolsRef.current.mode)) armTool("pen");
  }, [armTool]);
  // The honest off-switch (and the on-switch for stylus owners who want
  // pen mode before their first hover): an explicit preference overrides
  // the auto laws — an 'off' suppresses the sighting flip, an 'on' sticks
  // across loads.
  const togglePenMode = useCallback(() => {
    const next = !penModeRef.current;
    penModeRef.current = next;
    penPrefRef.current = next ? "on" : "off";
    if (next) {
      penSeenRef.current = true;
      try {
        window.localStorage.setItem("syllabai-ink-stylus-seen", "1");
      } catch {
        /* private mode */
      }
    }
    try {
      window.localStorage.setItem("syllabai-ink-pen-mode", next ? "on" : "off");
    } catch {
      /* private mode — session-only preference */
    }
    setPenMode(next);
  }, []);
  // T-MG-INK-9: the math keyboard's portal host — a pane-level bottom
  // strip (the keyboard is pane-wide, MG's virtual-keyboard posture; a
  // page holder must not contain it). pointer-events:none — the panel
  // re-enables itself; the empty strip never blocks the pane.
  const [kbHost, setKbHost] = useState<HTMLElement | null>(null);
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

  // T-MG-INK-3 run-002 → T-ACCOUNT-ONLY run-001: the persistence plane is
  // the SERVER controller ONLY. The device-local fork (the IndexedDB
  // controller) is retired as a LIVING store — /past-papers is a gated
  // surface, so a mounted InkLayer always rides a signed-in session. The
  // ONLY remaining consumer of ./ink-local-store is the consent-gated
  // migration below: a one-time RESCUE reader for ink drawn before the
  // sweep (upload → server confirm → the device doc clears). IndexedDB is
  // never written for new strokes and drains to empty as migrations land.
  const sync = useMemo(() => {
    if (!sourceUrl || !token) return null;
    return createInkSync({ sourceUrl, token });
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

  // T-MG-INK-8: the MG first-open affordance — the "Put your answer
  // down" card (MG's exact copy and behavior: shown once until the
  // learner arms a tool from it; clicking it arms TEXT on desktop, MG's
  // keyboard default). MG anchors it to their parsed first answer
  // region; we don't parse regions, so it floats above the ink toolbar
  // (the disclosed difference). T-ACCOUNT-ONLY run-001: the once-flag is
  // the "pdf-viewer-prefs" account doc's inkHintSeen field — the retired
  // localStorage flag is that module's legacy adoption.
  const [hintOpen, setHintOpen] = useState(false);
  useEffect(() => {
    if (!getPpPrefs().inkHintSeen) setHintOpen(true);
    return subscribePpPrefs(() => {
      if (!getPpPrefs().inkHintSeen) setHintOpen(true);
    });
  }, []);
  const dismissHint = useCallback(() => {
    updatePpPrefs({ inkHintSeen: true });
    setHintOpen(false);
  }, []);
  const armFromHint = useCallback(
    (m: InkToolMode) => {
      armTool(m);
      dismissHint();
    },
    [dismissHint, armTool],
  );

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
    if (!hostRef.current) return;
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
  }, [hostRef, sync]);

  const commitStroke = useCallback(
    (page: number, points: Array<[number, number]>, pressures?: number[] | null) => {
      if (points.length < 2) return;
      // T-HUB-INK-BRK run-003: the LIVE colour/width — a stroke STARTED in
      // the deferred-render window commits what the user picked (the
      // `color`/`widthIdx` closures here used to be seconds stale).
      const stroke: InkStrokeShape = {
        id: makeShapeId(),
        kind: "stroke",
        page,
        color: liveToolsRef.current.color,
        widthFrac: liveToolsRef.current.widthFrac,
        points,
      };
      // T-MG-INK-11 run-001: the stylus pressure channel rides the shape
      // only when the gesture captured one (index-aligned with points).
      if (pressures && pressures.length === points.length) stroke.pressures = pressures;
      commit([...shapesRef.current, stroke]);
    },
    [commit],
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
          the bottom-right corner); ALWAYS visible (T-MG-INK-11: MG's
          annotator toolbar ships with no gate — parity law) unless the
          user collapsed it (T-HUB-INK-TOUCH run-001: the pill below is
          the way back).
          T-HUB-INK-BRK: ONE nowrap horizontally-scrollable row (the pane's
          own s146 law) — the old flex-wrap built a 2–3-row wall over the
          paper's bottom on a phone pane (the reported "bottom toolbar
          blocks scroll/pinch": touches there never reached the scroller).
          The row keeps every control reachable at ~44px; pan-x keeps the
          row's pans inside the row.
          T-HUB-INK-BRK run-002 (operator stress test 2026-11-12): the row
          RIDES ABOVE the mobile A/B swap strip (bottom-16 <lg, bottom-3 at
          lg where the pill is hidden) — at the old bottom-3 the row's
          z-40 covered the z-30 swap pill and the paper/mark-scheme tabs
          stopped working the moment ink was toggled on. The Collapse
          control is sticky-right INSIDE the scroll row: with 17 controls
          (~640px) overflowing a phone pane, the fold button used to sit
          ~650px from the left edge — off-viewport, undiscoverable. */}
      {collapsed ? (
        <Button
          size="sm"
          variant="secondary"
          className="absolute bottom-3 right-2 z-40 size-9 rounded-lg border bg-background/95 p-0 shadow-md backdrop-blur"
          aria-label="Show annotation tools"
          onClick={toggleCollapsed}
        >
          <ChevronsUpDown className="size-4" aria-hidden />
        </Button>
      ) : (
        <div
          role="toolbar"
          aria-label="Ink annotations"
          className="absolute bottom-16 right-2 z-40 flex max-w-[calc(100%-1rem)] flex-nowrap items-center gap-1 overflow-x-auto overscroll-contain rounded-lg border bg-background/95 p-1 shadow-md backdrop-blur [touch-action:pan-x] lg:bottom-3"
        >
          <Button
            size="sm"
            variant={mode === "pen" ? "secondary" : "ghost"}
            className="size-8 px-0"
            aria-pressed={mode === "pen"}
            aria-label="Draw"
            onClick={() => armTool("pen")}
          >
            <Pen className="size-4" aria-hidden />
          </Button>
          <Button
            size="sm"
            variant={mode === "text" ? "secondary" : "ghost"}
            className="size-8 px-0"
            aria-pressed={mode === "text"}
            aria-label="Text"
            onClick={() => armTool("text")}
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
            aria-label="Math text box"
            onClick={() => armTool("math")}
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
            aria-label="Select"
            onClick={() => armTool("select")}
          >
            <MousePointer2 className="size-4" aria-hidden />
          </Button>
          <Button
            size="sm"
            variant={mode === "erase" ? "secondary" : "ghost"}
            className="size-8 px-0"
            aria-pressed={mode === "erase"}
            aria-label="Erase"
            onClick={() => armTool("erase")}
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
            aria-label="Line"
            onClick={() => armTool("line")}
          >
            <Minus className="size-4" aria-hidden />
          </Button>
          <Button
            size="sm"
            variant={mode === "ruler" ? "secondary" : "ghost"}
            className="size-8 px-0"
            aria-pressed={mode === "ruler"}
            aria-label="Ruler"
            onClick={() => armTool("ruler")}
          >
            <Ruler className="size-4" aria-hidden />
          </Button>
          <Button
            size="sm"
            variant={mode === "protractor" ? "secondary" : "ghost"}
            className="size-8 px-0"
            aria-pressed={mode === "protractor"}
            aria-label="Protractor"
            onClick={() => armTool("protractor")}
          >
            <Gauge className="size-4" aria-hidden />
          </Button>
          <Button
            size="sm"
            variant={mode === "compasses" ? "secondary" : "ghost"}
            className="size-8 px-0"
            aria-pressed={mode === "compasses"}
            aria-label="Compasses"
            onClick={() => armTool("compasses")}
          >
            <Compass className="size-4" aria-hidden />
          </Button>
          <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          {/* T-MG-INK-11: MG's palette anatomy (extracted live): ONE
            * trigger per row — a 16px round dot of the CURRENT colour,
            * label "Pen colour: {Name}" — opening a menu of the six
            * named colours; same for the four named thicknesses. The
            * old inline swatch/dot rows are gone (never MG's shape). */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="size-8 gap-1 px-1.5"
                aria-label={`Pen colour: ${color[0].toUpperCase()}${color.slice(1)}`}
              >
                <span
                  aria-hidden
                  className="size-4 rounded-full border-2 border-foreground/30"
                  style={{ backgroundColor: INK_COLORS[color] }}
                />
                <ChevronDown className="size-3 text-muted-foreground" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" aria-label="Pen colour">
              {INK_COLOR_KEYS.map((c) => (
                <DropdownMenuItem
                  key={c}
                  aria-label={c[0].toUpperCase() + c.slice(1)}
                  onSelect={() => pickColor(c)}
                >
                  <span
                    aria-hidden
                    className="size-4 rounded-full border-2 border-foreground/30"
                    style={{ backgroundColor: INK_COLORS[c] }}
                  />
                  {c[0].toUpperCase() + c.slice(1)}
                  {color === c && <Check className="ml-auto size-3.5" aria-hidden />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="size-8 gap-1 px-1.5"
                aria-label={`Pen thickness: ${INK_WIDTH_NAMES[widthIdx]}`}
              >
                <span
                  aria-hidden
                  className="rounded-full bg-foreground"
                  style={{ width: INK_WIDTH_DOTS[widthIdx], height: INK_WIDTH_DOTS[widthIdx] }}
                />
                <ChevronDown className="size-3 text-muted-foreground" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" aria-label="Pen thickness">
              {INK_WIDTH_FRACS.map((w, i) => (
                <DropdownMenuItem
                  key={w}
                  aria-label={INK_WIDTH_NAMES[i]}
                  onSelect={() => pickWidth(i)}
                >
                  <span
                    aria-hidden
                    className="flex size-4 items-center justify-center"
                  >
                    <span
                      className="rounded-full bg-foreground"
                      style={{ width: INK_WIDTH_DOTS[i], height: INK_WIDTH_DOTS[i] }}
                    />
                  </span>
                  {INK_WIDTH_NAMES[i]}
                  {widthIdx === i && <Check className="ml-auto size-3.5" aria-hidden />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          <Button
            size="sm"
            variant="ghost"
            className="size-8 px-0"
            aria-label="Undo"
            disabled={pastRef.current.length === 0}
            onClick={undo}
          >
            <Undo2 className="size-4" aria-hidden />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="size-8 px-0"
            aria-label="Redo"
            disabled={futureRef.current.length === 0}
            onClick={redo}
          >
            <Redo2 className="size-4" aria-hidden />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="size-8 px-0"
            aria-label="Clear all"
            disabled={snap.shapes.length === 0}
            onClick={clearAll}
          >
            <Trash2 className="size-4" aria-hidden />
          </Button>
          {/* T-MG-INK-12 run-001: the pen-mode toggle — stylus writes,
              finger scrolls. Auto-flips on the first stylus sighting (the
              sticky sighting persists per device); this is the honest
              off-switch for the rare stylus owner who finger-draws, and
              the on-switch for anyone who wants pen mode before the first
              hover. aria-pressed + the on/off glyph state; the data attr
              is the live-probe seam (the serving-probe doctrine). */}
          <Button
            size="sm"
            variant="ghost"
            className="size-8 px-0"
            aria-label="Pen mode: stylus writes, finger scrolls"
            aria-pressed={penMode}
            data-penmode={penMode ? "on" : "off"}
            title={penMode ? "Pen mode on — the stylus writes, fingers scroll and pan" : "Pen mode off — fingers draw when Draw is armed"}
            onClick={togglePenMode}
          >
            <Pen className={penMode ? "size-4" : "size-4 opacity-40"} aria-hidden />
          </Button>
          <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          {/* the status pill — honest states only. T-ACCOUNT-ONLY run-001:
              the account IS the store — the sync states (Saving…/Saved/
              Edited elsewhere/Retry) are the only states; the retired
              "Local only" posture is gone (the surface is gated, so a
              mounted layer always rides a signed-in session). */}
          {token ? (
            <>
              {snap.status === "saving" && (
                <span className="flex items-center gap-1 px-1 text-2xs text-muted-foreground" role="status">
                  <Loader2 className="size-3 animate-spin" aria-hidden /> Saving…
                </span>
              )}
              {snap.status === "synced" && (
                <span className="flex items-center gap-1 px-1 text-2xs text-muted-foreground" role="status">
                  <Check className="size-3" aria-hidden /> {snap.dirty ? "Saving…" : "Saved"}
                </span>
              )}
              {snap.status === "conflict" && (
                <span className="flex items-center gap-1 px-1 text-2xs text-amber-600" role="alert">
                  <AlertTriangle className="size-3" aria-hidden /> Edited elsewhere
                </span>
              )}
              {snap.status === "error" && (
                <button
                  type="button"
                  className="flex items-center gap-1 rounded px-1 text-2xs text-destructive underline underline-offset-2"
                  onClick={() => sync.retry()}
                >
                  <AlertTriangle className="size-3" aria-hidden /> Retry sync
                </button>
              )}
            </>
          ) : null}
          {/* T-HUB-INK-TOUCH run-001: the collapse control — MG's recorded
              out-of-scope extra, pulled in scope by operator demand ("THERE
              IS NO WAY TO DISABLE THE BOTTOM TOOLS BAR"). The row folds to
              the one-button pill; the posture persists per device. No
              "Close ink layer" — the surface itself never unmounts, only
              the chrome folds.
              T-HUB-INK-BRK run-002: sticky-right so the fold control stays
              visible however far the row has scrolled (it was the 17th
              control, ~650px deep — effectively unreachable on a phone). */}
          <Button
            size="sm"
            variant="ghost"
            className="sticky right-0 ml-1 shrink-0 rounded-md bg-background/95 size-8 px-0"
            aria-label="Collapse annotation tools"
            onClick={toggleCollapsed}
          >
            <ChevronsDownUp className="size-4" aria-hidden />
          </Button>
        </div>
      )}

      {/* T-MG-INK-3 run-002: the consent-gated migration notice — sync
          mode only, floating above the ink launcher. Exactly three exits:
          Upload to account | Discard local | dismiss (keeps local,
          re-arms next visit). Login never auto-migrates. */}
      {migration && token && sourceUrl && (
        <div
          aria-label="Ink saved on this device"
          className="absolute bottom-28 right-2 z-40 max-w-72 rounded-lg border bg-background/95 p-3 text-xs shadow-md backdrop-blur lg:bottom-14"
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

      {/* T-MG-INK-8: the MG "Put your answer down" card — exact copy,
          shown once (until armed/dismissed), only while the paper has
          no ink yet; clicking the card arms TEXT (MG's keyboard default),
          the ghost button arms the pen (MG's touch default), ✕ dismisses. */}
      {hintOpen && snap.shapes.length === 0 && (
        <div
          aria-label="Put your answer down"
          className="absolute bottom-28 right-2 z-40 w-72 rounded-lg border bg-background/95 p-3 text-xs shadow-md backdrop-blur lg:bottom-14"
        >
          <p className="font-semibold">Put your answer down</p>
          <p className="mt-1 text-muted-foreground">
            Click anywhere on the paper and type your working. It saves as you go.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              className="h-7 px-2 text-xs"
              onClick={() => armFromHint("text")}
            >
              <Type className="size-3" aria-hidden /> Type answers
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => armFromHint("pen")}
            >
              <Pen className="size-3" aria-hidden /> Write by hand
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto size-7 px-0"
              aria-label="Dismiss the writing hint"
              onClick={dismissHint}
            >
              <X className="size-3.5" aria-hidden />
            </Button>
          </div>
        </div>
      )}

      {/* T-MG-INK-9: the math keyboard portal host (pane-wide bottom
          strip; the MathKeyboard portals in here while a math draft is
          editing with the keyboard toggled open). */}
      {(
        <div
          ref={setKbHost}
          data-ink-kb-host
          className="pointer-events-none absolute inset-x-0 bottom-0 z-50"
        />
      )}

      {/* one canvas portal per mounted page holder; the T-MG-INK-7
          wrapper gives the portal ONE registered root — the eviction law
          re-attaches this exact subtree if the pane's repaint empties the
          holder (same nodes, no remount). display:contents keeps the
          canvas's absolute positioning resolved against the holder. */}
      {holders.map(({ page, el }) =>
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
              keyboardHost={kbHost}
              ruler={rulerGuide?.page === page ? rulerGuide : null}
              protractor={protractorGuide?.page === page ? protractorGuide : null}
              onGuideDown={guideDown}
              onGuideMove={guideMove}
              onGuideRotate={guideRotate}
              onGuideCreate={guideCreate}
              liveToolsRef={liveToolsRef}
              armSeq={armSeq}
              penMode={penMode}
              penModeRef={penModeRef}
              onPenSeen={markPenSeen}
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
  onCommitStroke: (page: number, points: Array<[number, number]>, pressures?: number[] | null) => void;
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
  /** T-MG-INK-9: the pane-level math-keyboard portal host (rendered by
   * InkLayer; the keyboard is pane-wide, never inside a page holder). */
  keyboardHost?: HTMLElement | null;
  /** T-MG-INK-10: the arm epoch — bumped by every explicit tool arming;
   * the hover chip's position and per-arm spend are keyed by it. */
  armSeq?: number;
  /**
   * T-HUB-INK-BRK run-003: the LIVE tools mirror (mode/color/widthFrac),
   * written SYNCHRONOUSLY by armTool/pickColor/pickWidth before any React
   * commit. On desktop (lg) the first 28-page raster burst can starve the
   * re-render for seconds; the portaled canvases' handlers used to stay on
   * the stale `mode` closure, so a tool armed in that window did NOTHING
   * (taps/strokes dead ~3-4s, self-healing only when some unrelated render
   * landed). The gesture handlers read this ref FIRST — the gesture
   * follows what the user clicked, not what React has flushed. The `mode`
   * prop stays for the render-time visuals (cursor/touch-action) and any
   * remaining closure reads that are cosmetic-only. OPTIONAL: the direct
   * InkCanvas mounts (the test harness) fall back to a per-instance ref
   * seeded from the props — the harness arms via props, so the fallback
   * mirrors it exactly; the production InkLayer always passes the live
   * layer-level ref.
   */
  liveToolsRef?: { current: { mode: InkToolMode; color: InkColor; widthFrac: number } };
  /**
   * T-MG-INK-12 run-001: pen mode (stylus writes, finger scrolls). When
   * true, a TOUCH pointer NEVER draws: a draw-family tool holds
   * touch-action:none, so the finger pans the paper via JS (beginPan);
   * with select armed the touch-action law is untouched and the browser's
   * native pan/pinch rides as always. Pen, mouse and every commit law are
   * UNCHANGED in both modes (the mouse byte-identical law holds in pen
   * mode — pinned at the seam). Optional: the direct test mounts default
   * to classic (false) so every pre-INK-12 pin reads unchanged.
   */
  penMode?: boolean;
  /**
   * T-MG-INK-12 run-001: the LIVE pen-mode mirror — the production
   * InkLayer's synchronous ref (markPenSeen/togglePenMode write it BEFORE
   * any React commit). The deferred-render window that starved `mode`
   * (T-HUB-INK-BRK run-003) would starve the penMode prop the same way:
   * a touch down seconds after the flip would read the stale prop and
   * DRAW instead of pan. The routing reads this ref FIRST; the `penMode`
   * prop stays the render-time truth. OPTIONAL: the direct test mounts
   * omit it and ride the prop.
   */
  penModeRef?: { current: boolean };
  /**
   * T-MG-INK-12 run-001: the first-sighting callback — fired on the FIRST
   * pen event of the mount (hover move or down; the anchor refreshes on
   * every pen event regardless). The parent (InkLayer) persists the
   * sticky sighting and flips pen mode; the canvas then discards any
   * in-flight gesture via the penMode prop effect (the palm stroke never
   * existed). Idempotent at the parent — the canvas may call it freely.
   */
  onPenSeen?: () => void;
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

/** T-MG-INK-12 run-001: the JS-pan target — the nearest ancestor that
 * actually scrolls (overflow auto/scroll AND content overflowing), else
 * the document scrolling element. Resolved at gesture START (a page
 * holder's ancestors are stable for the gesture's lifetime). The pure
 * modules never read the DOM — this is the pan's one DOM seam, the same
 * posture as the mtext MeasuredSize law. */
function findScrollAncestor(el: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = el.parentElement;
  while (node) {
    const oy = getComputedStyle(node).overflowY;
    if ((oy === "auto" || oy === "scroll") && node.scrollHeight > node.clientHeight) return node;
    node = node.parentElement;
  }
  return (typeof document !== "undefined" ? (document.scrollingElement as HTMLElement | null) : null) ?? null;
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
  keyboardHost,
  armSeq = 0,
  liveToolsRef,
  penMode = false,
  penModeRef,
  onPenSeen,
}: InkCanvasProps) {
  // T-HUB-INK-BRK run-003: the mirror the gesture handlers read. The
  // production InkLayer passes its layer-level liveToolsRef (written at
  // arm time, before any commit); a direct mount (the test harness) gets
  // the per-instance fallback seeded from the props it armed with.
  const liveToolsFallbackRef = useRef({ mode, color, widthFrac });
  const tools = liveToolsRef ?? liveToolsFallbackRef;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const boxRef = useRef<{ cssW: number; cssH: number }>({ cssW: 0, cssH: 0 });
  const activeRef = useRef<Array<[number, number]> | null>(null);
  const lastPxRef = useRef<[number, number] | null>(null);
  // T-MG-INK-11 run-001 (the stylus lane): the pen's per-point pressure
  // channel, captured parallel to activeRef for FREEHAND pen gestures
  // only (mouse/touch carry none — their strokes stay byte-identical).
  const activePressuresRef = useRef<number[] | null>(null);
  // The pointer-plane isolation law: ONE gesture owns the canvas at a
  // time. activePointerIdRef is the in-flight gesture's pointerId; a
  // second pointer's down/move/up (a palm resting on an iPad, a stray
  // finger) is swallowed instead of clobbering the live stroke. Cleared
  // by endStroke and the pen-precedence discard.
  const activePointerIdRef = useRef<number | null>(null);
  // The pen-session law (palm rejection): the timestamp of the last pen
  // EVENT. A TOUCH gesture may not start within PEN_SESSION_MS of it —
  // the palm rests and taps while the stylus writes. T-MG-INK-12 run-001
  // re-anchors the window: every pen event refreshes it (hover, down,
  // draw move, lift), not just the opening down — a stroke longer than
  // the window used to end with the window already expired, leaving the
  // post-stroke palm gap unprotected (the Addendum 20 gap of record).
  // The window stays short on purpose: in classic mode (pen mode off)
  // putting the stylus down and finger-drawing stays reachable after it
  // expires; in pen mode touch never draws anyway (it pans), so the
  // window there only suppresses palm-PANS while the stylus is live.
  const penSeenAtRef = useRef<number>(-Infinity);
  // ── T-MG-INK-12 run-001: the pen-mode gesture plane ──
  // The first-sighting marker (per mount; the parent's markPenSeen is the
  // sticky/dedupe authority — this only gates the local flip effect).
  const penSeenLocalRef = useRef(false);
  // The touch-pan gesture (pen mode only): the owning pointerId, its last
  // client point, and the scroll target resolved at gesture start. A
  // draw-family tool holds touch-action:none, so the finger's native pan
  // is dead — this gesture pans the paper in JS instead. Never draws.
  const panRef = useRef<{ id: number; x: number; y: number; el: HTMLElement | null } | null>(null);
  const rafRef = useRef(0);
  const [draft, setDraft] = useState<{ x: number; y: number; value: string; editId?: string } | null>(null);
  // T-HUB-INK-BRK (operator: "the pdf viewer has many problems, sometimes
  // some things break"): the draft MIRRORS + the settle guard — the
  // tap-elsewhere race of record. The old flow let the opening press of a
  // SECOND placement run setDraft(new) while the first textarea was still
  // mounted: preventDefault suppressed the focus transfer (no blur → no
  // commit — the typed text was silently clobbered), and when the browser
  // DID fire the removal blur, the stale onBlur closure ran AFTER the new
  // setDraft and its setDraft(null) killed the fresh editor. The mirror
  // lets the pointerdown path commit the OPEN draft first (data kept), and
  // the settle set makes every close path idempotent — a stale blur can
  // never re-commit (duplicate shapes/double undo) or clobber the successor.
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const settledDraftsRef = useRef(new Set<{ x: number; y: number; value: string; editId?: string }>());
  const [mathDraft, setMathDraft] = useState<{ x: number; y: number; value: string; editId?: string } | null>(null);
  const mathDraftRef = useRef(mathDraft);
  mathDraftRef.current = mathDraft;
  const settledMathDraftsRef = useRef(new Set<{ x: number; y: number; value: string; editId?: string }>());
  const mathRef = useRef<HTMLTextAreaElement | null>(null);
  // instrument drag state (T-MG-INK-2)
  const dragKindRef = useRef<DragKind | null>(null);
  const guideToolRef = useRef<"ruler" | "protractor" | null>(null);
  const rawRef = useRef<Array<[number, number]>>([]);
  const pivotRef = useRef<{ x: number; y: number } | null>(null);
  const [sweepDeg, setSweepDeg] = useState<number | null>(null);
  // ── T-MG-INK-4 state: erase sweep, select/move (the math draft + its
  //    mirror/settle guard live with the text draft above) ──
  // T-MG-INK-9: the equation keyboard — closed on create (MG's posture:
  // their math box carries the ⌨ toggle; the keyboard never auto-opens),
  // pane-wide via the keyboardHost portal.
  const [kbOpen, setKbOpen] = useState(false);
  // The keyboard's caret restore: the value is React-controlled, so the
  // selection is re-applied right after the commit renders (the rAF
  // race is dead by construction).
  const pendingCaretRef = useRef<number | null>(null);
  // ── T-MG-INK-10: MG's armed-tool hover chips ──
  // The cursor position in css px (page-local) while an editor tool is
  // armed, and the per-arm spend law: the first placement that opens an
  // editor spends the chip until the tool is (re)armed. Both are keyed
  // by the arm epoch (armSeq, bumped by every explicit arming) — a
  // stale-seq chip/spent is simply not the current arming, so no reset
  // effect is needed.
  const [chip, setChip] = useState<{ seq: number; x: number; y: number } | null>(null);
  const [spentSeq, setSpentSeq] = useState<number | null>(null);
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
    // T-HUB-INK-BRK: a sub-px box is a DETACHED or hidden canvas — the
    // pane's non-React holder swaps report 0×0 between the eviction and
    // the self-heal's re-attach. Sizing the store then would wipe the
    // bitmap to 1×1 and leave boxRef at zero, where the commit-time
    // cssW > 0 guards silently DROPPED strokes and text (the "sometimes
    // things break" window). Skip; the ResizeObserver repaint on
    // re-attach restores size and paint.
    if (box.width < 1 || box.height < 1) return;
    boxRef.current = { cssW: box.width, cssH: box.height };
    sizeBackingStore(ctx, canvas, box.width, box.height, window.devicePixelRatio || 1);
    paintShapes(ctx, boxRef.current, displayShapes, activeRef.current ? { color, widthFrac, points: activeRef.current, pressures: activePressuresRef.current ?? undefined } : null);
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

  // T-HUB-INK-BRK: the commit takes the draft TARGET (not the closure) and
  // settles it — one commit per draft instance, idempotent under the stale
  // blur a non-React holder eviction can fire after a successor opened.
  // run-003 laws unchanged: an edit replaces content in place (same id); an
  // empty commit is a CANCEL (the shape is untouched — deletion stays the
  // erase/✕ surface, never the editor). Defined BEFORE the pointer handler:
  // the tap-elsewhere law commits the open draft first.
  const commitDraft = useCallback(
    (target: { x: number; y: number; value: string; editId?: string } | null) => {
      if (!target || settledDraftsRef.current.has(target)) return;
      settledDraftsRef.current.add(target);
      if (settledDraftsRef.current.size > 64) {
        const first = settledDraftsRef.current.values().next().value;
        if (first !== undefined) settledDraftsRef.current.delete(first);
      }
      const value = target.value.trim();
      if (target.editId) {
        if (value) onCommitTextEdit(target.editId, value);
      } else {
        const { cssW } = boxRef.current;
        if (value && cssW > 0) {
          onCommitText({
            page,
            color,
            // T-MG-INK-9: the editor edits at MG's 16 css px default — commit
            // that relative size (WYSIWYG-honest at the reference width).
            sizeFrac: clamp01(INK_TEXT_BASE_PX / cssW),
            x: target.x,
            y: target.y,
            text: value,
          });
        }
      }
      if (draftRef.current === target) setDraft(null);
    },
    [onCommitTextEdit, color, onCommitText, page],
  );

  // T-MG-INK-4: the math draft commits an mtext at the same relative
  // size law as the text editor (14 css px at commit time). run-003:
  // the edit twin — content replaced in place (same id), empty = cancel.
  // T-HUB-INK-BRK: the settle guard twin (see commitDraft above) — one
  // commit per draft instance, stale-blur-proof. Escape DISCARDS: it
  // settles the draft WITHOUT committing, so a late blur cannot resurrect
  // discarded content.
  const commitMathDraft = useCallback(
    (target: { x: number; y: number; value: string; editId?: string } | null, discard = false) => {
      if (!target || settledMathDraftsRef.current.has(target)) return;
      settledMathDraftsRef.current.add(target);
      if (settledMathDraftsRef.current.size > 64) {
        const first = settledMathDraftsRef.current.values().next().value;
        if (first !== undefined) settledMathDraftsRef.current.delete(first);
      }
      const value = target.value.trim();
      if (!discard) {
        if (target.editId) {
          if (value) onCommitMathEdit(target.editId, value);
        } else {
          const { cssW } = boxRef.current;
          if (value && cssW > 0) {
            onCommitMath({
              page,
              color,
              sizeFrac: clamp01(INK_TEXT_BASE_PX / cssW),
              x: target.x,
              y: target.y,
              tex: value,
            });
          }
        }
      }
      if (mathDraftRef.current === target) {
        setMathDraft(null);
        setKbOpen(false);
      }
    },
    [onCommitMathEdit, color, onCommitMath, page],
  );

  const scheduleLive = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      paintShapes(ctx, boxRef.current, displayShapes, activeRef.current ? { color, widthFrac, points: activeRef.current, pressures: activePressuresRef.current ?? undefined } : null);
    });
  }, [displayShapes, color, widthFrac]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  // ── T-MG-INK-12 run-001: the pen-mode plane (helpers) ──
  // The gesture-plane discard — the pen-precedence cleanup, extracted so
  // the pen-mode flip uses the SAME one code path (a stuck erase sweep or
  // move box would outlive its dead gesture otherwise). No-op when
  // nothing is in flight (the pan gesture's pointerId plane still clears).
  const discardGesture = useCallback(() => {
    panRef.current = null;
    if (!dragKindRef.current) return;
    activeRef.current = null;
    activePressuresRef.current = null;
    lastPxRef.current = null;
    rawRef.current = [];
    pivotRef.current = null;
    dragKindRef.current = null;
    activePointerIdRef.current = null;
    setErasePreview(null);
    setMovePreview(null);
    setSweepDeg(null);
    repaint();
  }, [repaint]);
  // The pen-event anchor: EVERY pen event (hover, down, draw move, lift)
  // refreshes the palm window from the last pen event (the Addendum 20
  // gap kill), and the FIRST sighting fires onPenSeen (the parent's
  // sticky/dedupe authority). The flip's gesture discard rides the
  // penMode prop effect below — the prop, not the callback, is the
  // flip's source of truth (the parent may decline the flip on an
  // explicit off; only a real flip discards).
  const penEvent = useCallback(() => {
    penSeenAtRef.current = performance.now();
    if (!penSeenLocalRef.current) {
      penSeenLocalRef.current = true;
      onPenSeen?.();
    }
  }, [onPenSeen]);
  // The flip effect: a classic→pen transition discards any in-flight
  // gesture — an in-flight TOUCH stroke at the flip moment is by
  // definition a palm stroke (the pen mode's whole premise) and the pen
  // precedence law discards it the same way when the pen lands instead.
  // Also covers the manual toggle: a mid-stroke flip kills the live
  // gesture rather than committing a stroke under rules the user just
  // turned off.
  const prevPenModeRef = useRef(penMode);
  useEffect(() => {
    if (penMode && !prevPenModeRef.current) discardGesture();
    prevPenModeRef.current = penMode;
  }, [penMode, discardGesture]);
  // The touch-pan opener (pen mode, draw-family armed). One gesture owns
  // the plane: a second finger's down is swallowed (no pinch in run-001 —
  // the resting state's Select keeps NATIVE pan/pinch via the untouched
  // touch-action law, so pinch lives there; draw-armed pinch is a
  // run-002 candidate). The scroll target resolves now; capture keeps the
  // pan alive across the page holders (real events capture fine — the
  // runbook's synthetic-events law).
  const beginPan = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (panRef.current && e.pointerId !== panRef.current.id) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    activePointerIdRef.current = e.pointerId;
    panRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY, el: findScrollAncestor(canvas) };
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      // ── T-MG-INK-12 run-001: the pen-event anchor + first sighting ──
      // BEFORE the tool read: a no-hover stylus's first contact must DRAW
      // on this very event — the sighting flips the resting select to the
      // freehand tool, and reading `m` after that flip routes this down to
      // ink, not to a select tap. Hover-first devices flipped on the move
      // (see onPointerMove); this is the no-hover fallback (Pencil 1 on
      // older iPads) plus the anchor refresh for the window below.
      if (e.pointerType === "pen") penEvent();
      // T-HUB-INK-BRK run-003: the LIVE tool — the ref mirror armTool
      // writes synchronously (see the props doc). The closed-over `mode`
      // prop is whatever React last flushed; during the desktop raster
      // burst that is seconds old.
      const m = tools.current.mode;
      // ── T-MG-INK-11 run-001: the stylus pointer-plane laws ──
      // (1) pen session stamp — the palm-rejection window's anchor (as of
      //     T-MG-INK-12 the anchor lives in penEvent above: EVERY pen
      //     event refreshes it, not just the opening down);
      // (2) pen precedence — a pen down DISCARDS an in-flight touch
      //     gesture without committing it (the palm stroke never
      //     existed) and takes the canvas;
      // (3) palm rejection — a touch gesture may not start while a pen
      //     gesture is in flight OR within the pen-session window;
      // (4) one-gesture isolation — while a gesture is in flight, any
      //     OTHER pointer's down is swallowed (the clobber that used to
      //     overwrite activeRef/lastPxRef mid-stroke). Mouse is never
      //     rejected by (3) — desktops have no palms on the glass.
      const now = performance.now();
      if (e.pointerType === "pen" && dragKindRef.current) {
        // the discarded gesture's previews go with it (a stuck erase sweep
        // or move box would outlive its dead gesture otherwise)
        discardGesture();
      }
      if (
        e.pointerType === "touch" &&
        (dragKindRef.current !== null || now - penSeenAtRef.current < PEN_SESSION_MS)
      ) {
        e.preventDefault();
        return;
      }
      // ── T-MG-INK-12 run-001: pen mode — touch NEVER draws ──
      // A draw-family tool holds touch-action:none, so the finger pans via
      // JS; with select armed the touch-action law is untouched (native
      // pan/pinch rides) and the down keeps today's select-tap behavior —
      // NO interception, the resting state feels exactly as shipped. The
      // palm window above already returned the in-window touches, so a pan
      // here is a deliberate finger gesture, not a resting palm. The LIVE
      // mirror read first (the stale-prop law, T-HUB-INK-BRK run-003's
      // twin); the prop is the render-time fallback.
      if (e.pointerType === "touch" && (penModeRef ? penModeRef.current : penMode) && m !== "select") {
        beginPan(e);
        return;
      }
      if (dragKindRef.current !== null && e.pointerId !== activePointerIdRef.current) return;
      if (m === "text") {
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
        // T-HUB-INK-BRK: the tap-elsewhere commit — preventDefault (above)
        // suppressed the focus transfer, so the OPEN draft would never blur;
        // committing it here keeps the typed text AND lets the new placement
        // open cleanly (the settle guard below makes the eventual removal
        // blur of the old textarea a no-op).
        const open = draftRef.current;
        if (open) commitDraft(open);
        // T-MG-INK-10: opening an editor spends the chip for this arming.
        setSpentSeq(armSeq);
        setDraft(
          target
            ? { x: target.x, y: target.y, value: target.text, editId: target.id }
            : { x: frac[0], y: frac[1], value: "" },
        );
        return;
      }
      if (m === "math") {
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
        // T-HUB-INK-BRK: the math twin of the tap-elsewhere commit (see the
        // text branch above).
        const openMath = mathDraftRef.current;
        if (openMath) commitMathDraft(openMath);
        // T-MG-INK-10: the math twin of the chip-spend law.
        setSpentSeq(armSeq);
        setMathDraft(
          target
            ? { x: target.x, y: target.y, value: target.tex, editId: target.id }
            : { x: frac[0], y: frac[1], value: "" },
        );
        return;
      }
      if (m === "erase" || m === "select") {
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
        if (m === "erase") {
          canvas.setPointerCapture(e.pointerId);
          activePointerIdRef.current = e.pointerId;
          activePressuresRef.current = null;
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
          activePointerIdRef.current = e.pointerId;
          activePressuresRef.current = null;
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
      if (m === "line") {
        canvas.setPointerCapture(e.pointerId);
        activePointerIdRef.current = e.pointerId;
        activePressuresRef.current = null;
        dragKindRef.current = "line";
        activeRef.current = [frac, frac];
        lastPxRef.current = [e.clientX, e.clientY];
        scheduleLive();
        return;
      }
      if (m === "compasses") {
        canvas.setPointerCapture(e.pointerId);
        activePointerIdRef.current = e.pointerId;
        activePressuresRef.current = null;
        dragKindRef.current = "compasses";
        pivotRef.current = { x: frac[0], y: frac[1] };
        rawRef.current = [frac];
        activeRef.current = [];
        lastPxRef.current = [e.clientX, e.clientY];
        scheduleLive();
        return;
      }
      if (m === "ruler" || m === "protractor") {
        const guide = m === "ruler" ? ruler : protractor;
        if (guide) {
          const live =
            m === "ruler" ? rulerLivePoint({ x: frac[0], y: frac[1] }, ruler!, cssBox) : protractorLivePoint({ x: frac[0], y: frac[1] }, protractor!, cssBox);
          if (live) {
            // pen down on the guide's snap line → instrument draw
            canvas.setPointerCapture(e.pointerId);
            activePointerIdRef.current = e.pointerId;
            activePressuresRef.current = null;
            dragKindRef.current = m;
            rawRef.current = [frac];
            activeRef.current = [
              [live.x, live.y],
              [live.x, live.y],
            ];
            lastPxRef.current = [e.clientX, e.clientY];
            if (m === "protractor") setSweepDeg(0);
            scheduleLive();
            return;
          }
          // off the snap line → the touch belongs to the guide (drag body)
          dragKindRef.current = "guide";
          guideToolRef.current = m;
          canvas.setPointerCapture(e.pointerId);
          activePointerIdRef.current = e.pointerId;
          activePressuresRef.current = null;
          onGuideDown?.(m, { x: frac[0], y: frac[1] });
          return;
        }
        // no guide yet → the creating tap (next touch manipulates it)
        onGuideCreate?.(m, page, { x: frac[0], y: frac[1] });
        return;
      }
      canvas.setPointerCapture(e.pointerId);
      // T-MG-INK-11 run-001: the freehand gesture is the stylus lane's
      // commit path — a PEN captures its per-point pressure channel
      // (mouse/touch carry none: their strokes stay byte-identical).
      activePointerIdRef.current = e.pointerId;
      activePressuresRef.current = e.pointerType === "pen" ? [e.pressure] : null;
      dragKindRef.current = "freehand";
      activeRef.current = [frac];
      lastPxRef.current = [e.clientX, e.clientY];
      scheduleLive();
    },
    [mode, armSeq, ruler, protractor, onGuideDown, onGuideCreate, scheduleLive, displayShapes, readMeasured, measureMtexts, commitDraft, commitMathDraft, repaint, beginPan, discardGesture, page, penEvent, penMode, penModeRef, tools],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      // T-HUB-INK-BRK run-003: the live-tool read (see onPointerDown).
      const m = tools.current.mode;
      const kind = dragKindRef.current;
      // T-MG-INK-11 run-001: one-gesture isolation — another pointer's
      // moves (the palm under the stylus) never append to the live stroke.
      if (kind !== null && activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current)
        return;
      // ── T-MG-INK-12 run-001: pen-event anchor + hover sighting ──
      // A pen move with NO button is the HOVER plane (S Pen / Surface /
      // Wacom / Pencil-2 emit these before contact) — the first one flips
      // pen mode BEFORE the first stroke, so "stylus writes automatically"
      // needs no arming tap. Every pen move re-anchors the palm window
      // (the draw-move case: the window survives strokes of any length).
      if (e.pointerType === "pen") penEvent();
      // The pen-mode pan: the owning touch pans the paper while a
      // draw-family tool holds touch-action:none. Never appends ink.
      if (panRef.current && e.pointerId === panRef.current.id) {
        const p = panRef.current;
        if (p.el) {
          p.el.scrollTop -= e.clientY - p.y;
          p.el.scrollLeft -= e.clientX - p.x;
        }
        p.x = e.clientX;
        p.y = e.clientY;
        return;
      }
      // T-MG-INK-10: while an editor tool is armed and no editor is
      // open, the hover chip follows the cursor (MG's affordance).
      // Position-only tracking — drags are untouched below.
      if (!kind && (m === "text" || m === "math") && !draft && !mathDraft) {
        const box = canvas.getBoundingClientRect();
        setChip({ seq: armSeq, x: e.clientX - box.left, y: e.clientY - box.top });
      }
      if (!kind) return;
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
        // T-MG-INK-11 run-001: the COALESCED tail — the samples the
        // browser batched since the last frame (a stylus samples 2-4× the
        // render rate; Safari 18+ delivers them here, older engines fall
        // back to the single dispatch event). Each sample past the same
        // 1.2px thinning appends chronologically before the dispatch's
        // own point; a PEN keeps its pressure channel index-aligned.
        const native = e.nativeEvent;
        const coalesced =
          typeof native.getCoalescedEvents === "function" ? native.getCoalescedEvents() : [];
        const pressures = activePressuresRef.current;
        if (coalesced.length > 1) {
          const boxNow = canvas.getBoundingClientRect();
          const nboxNow = { left: boxNow.left, top: boxNow.top, width: boxNow.width, height: boxNow.height };
          // The thinning chain runs on a LOCAL baseline: `last` (the last
          // appended point's px, captured pre-dispatch) — lastPxRef already
          // holds the dispatch point's px here, and thinning the earlier
          // coalesced samples against it would resurrect sub-threshold
          // samples 30px away. lastPxRef stays untouched (it must end at
          // the dispatch point — the chronologically newest sample).
          let prevPx = last;
          for (const s of coalesced) {
            if (s === native) continue;
            const cur: [number, number] = [s.clientX, s.clientY];
            if (prevPx && !shouldAppendPoint(prevPx, cur, 1.2)) continue;
            prevPx = cur;
            active.push(normalizePoint(nboxNow, cur[0], cur[1]));
            if (pressures) pressures.push(s.pressure);
          }
        }
        active.push(frac);
        if (pressures) pressures.push(e.pressure);
        scheduleLive();
      }
    },
    [mode, draft, mathDraft, armSeq, ruler, protractor, onGuideMove, scheduleLive, displayShapes, readMeasured, penEvent, tools],
  );

  const endStroke = useCallback(() => {
    const kind = dragKindRef.current;
    dragKindRef.current = null;
    const active = activeRef.current;
    activeRef.current = null;
    lastPxRef.current = null;
    // T-MG-INK-11 run-001: the gesture plane clears unconditionally — the
    // pen's pressure channel (captured into `pressures` below) rides the
    // freehand commit; the owning pointerId releases the canvas.
    const pressures = activePressuresRef.current;
    activePressuresRef.current = null;
    activePointerIdRef.current = null;
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
    // freehand (the run-003 law) — T-MG-INK-11 run-001: a PEN gesture
    // commits its pressure channel alongside the points (index-aligned);
    // mouse/touch gestures pass null and stay byte-identical.
    if (active && active.length >= 2) onCommitStroke(page, active, pressures);
    else repaint();
  }, [onCommitStroke, onCommitErase, onCommitMove, page, repaint, ruler, protractor, erasePreview, movePreview]);

  // ── T-MG-INK-9: the equation keyboard's insert/backspace paths ──
  // The keyboard taps the DRAFT's selection (the textarea keeps focus —
  // the panel swallows its pointerdowns), the pure module owns the
  // maths, and the caret re-applies right after React commits the new
  // value (pendingCaretRef + the effect below).
  const kbInsert = useCallback(
    (ins: KeyInsertion) => {
      const ta = mathRef.current;
      const md = mathDraftRef.current;
      if (!ta || !md) return;
      const start = ta.selectionStart ?? ta.value.length;
      const end = ta.selectionEnd ?? start;
      const res = insertIntoValue(ta.value, start, end, ins);
      pendingCaretRef.current = res.caret;
      setMathDraft({ ...md, value: res.value });
    },
    [],
  );

  const kbBackspace = useCallback(() => {
    const ta = mathRef.current;
    const md = mathDraftRef.current;
    if (!ta || !md) return;
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? start;
    const res = backspaceValue(ta.value, start, end);
    pendingCaretRef.current = res.caret;
    setMathDraft({ ...md, value: res.value });
  }, []);

  // The caret/selection restore after a keyboard edit (and the keyboard
  // taps themselves never blur the draft — the panel's pointerdown law).
  useEffect(() => {
    if (pendingCaretRef.current === null) return;
    const ta = mathRef.current;
    if (!ta) return;
    const caret = Math.min(pendingCaretRef.current, ta.value.length);
    ta.focus();
    ta.setSelectionRange(caret, caret);
    pendingCaretRef.current = null;
  }, [mathDraft]);

  // T-MG-INK-9: the text font is a self-hosted webfont — the canvas
  // repaints once it is really loaded (a first paint before the load
  // would raster the fallback and stick until the next repaint).
  useEffect(() => {
    const fonts = (document as Document & { fonts?: { load: (f: string) => Promise<unknown> } }).fonts;
    if (!fonts) return;
    let alive = true;
    void fonts
      .load(`${INK_TEXT_WEIGHT} 16px "Shantell Sans"`)
      .then(() => {
        if (alive) repaint();
      })
      .catch(() => {
        /* the fallback stack paints; nothing to do */
      });
    return () => {
      alive = false;
    };
  }, [repaint]);

  // The select affordance's ✕ — the tombstone law via the erase path.
  const eraseSelected = useCallback(() => {
    if (!selectedId) return;
    onCommitErase([selectedId]);
    setSelectedId(null);
    setSelBox(null);
  }, [selectedId, onCommitErase]);

  // T-MG-INK-9: the cursor map, MG's extracted postures — the TEXT tool
  // arms the page with MG's I-beam (their pdf-draw-overlay--armed parent
  // computes cursor:text, live 2026-11-02); the MATH tool arms DEFAULT
  // (their math-armed overlay computes auto — the box, not a caret, is
  // the affordance); select default, ruler/protractor move, the rest
  // crosshair.
  const toolCursor =
    mode === "text"
      ? "text"
      : mode === "math" || mode === "select"
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
        data-ink-drawing={mode === "select" ? undefined : page}
        className="pp-inkLayer absolute inset-0 z-30 h-full w-full"
        style={{
          // T-HUB-INK-TOUCH run-001 (operator: "when it is on, cant scroll
          // or pinch zoom the pdf viewer"): the gesture follows the tool.
          // Browse (select) returns the paper's own pan + pinch-zoom —
          // taps still reach the canvas (tap-select, the ✕ affordance);
          // every draw-family tool owns the gesture (touch-action: none)
          // because a finger IS the pen there. Mouse shape-drag in select
          // mode is untouched (touch-action gates TOUCH pans only).
          // T-HUB-INK-BRK: the data-ink-drawing marker is the pane-pinch
          // contract — a draw-armed canvas's pointers NEVER pair into the
          // pane's pinch-zoom (a palm resting mid-stroke used to step the
          // zoom, swap the holder under the live stroke and kill the tool).
          touchAction: mode === "select" ? "pan-x pan-y pinch-zoom" : "none",
          cursor: toolCursor,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => {
          // T-MG-INK-11 run-001: one-gesture isolation — another pointer's
          // up/cancel (the palm lifting off an iPad) must not end or commit
          // the live gesture early.
          // T-MG-INK-12 run-001: the pen LIFT re-anchors the palm window
          // (the post-stroke palm gap — the window now runs from the last
          // pen event), and the pan gesture ends on its own pointer.
          if (e.pointerType === "pen") penEvent();
          if (panRef.current && e.pointerId === panRef.current.id) {
            panRef.current = null;
            activePointerIdRef.current = null;
            return;
          }
          if (activePointerIdRef.current === null || e.pointerId === activePointerIdRef.current) endStroke();
        }}
        onPointerCancel={(e) => {
          if (panRef.current && e.pointerId === panRef.current.id) {
            panRef.current = null;
            activePointerIdRef.current = null;
            return;
          }
          if (activePointerIdRef.current === null || e.pointerId === activePointerIdRef.current) endStroke();
        }}
        onPointerLeave={(e) => {
          // pen lifted off the canvas mid-stroke (mouse edge) → end cleanly
          if (
            (activeRef.current || dragKindRef.current) &&
            e.pointerType === "mouse" &&
            (activePointerIdRef.current === null || e.pointerId === activePointerIdRef.current)
          )
            endStroke();
          setChip(null);
        }}
      />
      {sweepDeg !== null && protractor && (
        <div
          role="status"
          aria-label="Swept angle"
          className="pointer-events-none absolute z-40 rounded border bg-background/95 px-1.5 py-0.5 text-2xs shadow-md"
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
      {/* T-MG-INK-10: MG's armed-tool hover chips — "Add text"/"Add maths"
          follow the cursor in the handwriting stack (MG's live extraction:
          rgb(159,168,178) @ 0.6, vertically centred on the cursor; maths
          +14px and 18px, text 24px weight 500). Hidden while an editor is
          open, spent once a placement opened one, back on re-arm. The
          working tools get no chip and there are no toolbar tooltips —
          the chip IS the hover text (MG's law). Decorative. */}
      {chip && chip.seq === armSeq && spentSeq !== armSeq && !draft && !mathDraft && (mode === "text" || mode === "math") && (
        <span
          aria-hidden="true"
          data-ink-add-chip={mode}
          className="pointer-events-none absolute z-40 whitespace-nowrap"
          style={{
            left: chip.x + (mode === "math" ? INK_CHIP_MATH_OFFSET_PX : 0),
            top: chip.y,
            transform: "translateY(-50%)",
            fontFamily: INK_TEXT_FONT_STACK,
            fontWeight: mode === "text" ? INK_TEXT_WEIGHT : 400,
            fontSize: mode === "text" ? INK_CHIP_TEXT_PX : INK_CHIP_MATH_PX,
            // T-MG-INK-11: MG's text chip paints at line-height 1.35
            // (their measured 32.39px box at 24px = 1.3496); maths is
            // leading-none (their measured 18px box).
            lineHeight: mode === "math" ? 1 : 1.35,
            color: INK_CHIP_COLOR,
            opacity: INK_CHIP_OPACITY,
          }}
        >
          {mode === "text" ? INK_CHIP_TEXT_LABEL : INK_CHIP_MATH_LABEL}
        </span>
      )}
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
          onChange={(e) => {
            setDraft({ ...draft, value: e.target.value });
            // MG's editor auto-grows with the typing (borderless,
            // transparent — the paper IS the editor chrome).
            const el = e.target as HTMLTextAreaElement;
            el.style.width = "";
            el.style.height = "auto";
            el.style.width = `${Math.max(48, el.scrollWidth + 2)}px`;
            el.style.height = `${Math.max(44, el.scrollHeight)}px`;
          }}
          onBlur={() => commitDraft(draft)}
          onKeyDown={(e) => {
            // MG's posture (tldraw text): Enter is a NEWLINE; the edit
            // commits on click-away (blur) or Escape.
            if (e.key === "Escape") commitDraft(draft);
          }}
          className="absolute z-40 min-h-[44px] resize-none overflow-hidden rounded border-transparent bg-transparent p-0 leading-[1.35] shadow-none outline-none"
          style={{
            left: `${draft.x * 100}%`,
            top: `${draft.y * 100}%`,
            width: 48,
            height: 44,
            fontFamily: INK_TEXT_FONT_STACK,
            fontWeight: INK_TEXT_WEIGHT,
            fontSize: INK_TEXT_BASE_PX,
            color: INK_COLORS[color],
          }}
        />
      )}
      {mathDraft && (
        <div
          data-ink-editor="math"
          className="absolute z-40 w-60 rounded-lg border bg-background/95 p-1.5 shadow-md backdrop-blur"
          style={{ left: `${mathDraft.x * 100}%`, top: `${mathDraft.y * 100}%` }}
        >
          {/* the live KaTeX preview — the SAME render law as the
              committed overlay, so editing agrees glyph-for-glyph */}
          <div
            aria-hidden
            data-math-draft-preview
            className="pointer-events-none flex min-h-7 items-center overflow-x-auto text-base"
            style={{ color: INK_COLORS[color] }}
            {...(renderMathHtml(mathDraft.value)
              ? { dangerouslySetInnerHTML: { __html: renderMathHtml(mathDraft.value)! } }
              : {})}
          />
          <div className="mt-1 flex items-start gap-1">
            <textarea
              ref={mathRef}
              autoFocus
              rows={1}
              aria-label={mathDraft.editId ? "Edit math annotation" : "New math annotation"}
              value={mathDraft.value}
              onChange={(e) => setMathDraft({ ...mathDraft, value: e.target.value })}
              onBlur={(e) => {
                // T-MG-INK-9: the ⌨ toggle and the box chrome are INSIDE
                // the editor — focusing them must not commit the draft
                // (MG's field posture). A blur to anywhere outside the
                // editor box is the click-away commit.
                const box = e.currentTarget.closest("[data-ink-editor]");
                if (box && box.contains(e.relatedTarget as Node | null)) return;
                commitMathDraft(mathDraft);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  commitMathDraft(mathDraft);
                }
                if (e.key === "Escape") commitMathDraft(mathDraft, true);
              }}
              className="min-h-7 w-full resize-none bg-transparent p-0 font-mono text-xs outline-none"
              placeholder="LaTeX"
            />
            <button
              type="button"
              aria-label="Toggle Virtual Keyboard"
              aria-pressed={kbOpen}
              onClick={() => setKbOpen((o) => !o)}
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-md border",
                kbOpen ? "bg-secondary" : "hover:bg-secondary/60",
              )}
            >
              <Keyboard className="size-4" aria-hidden />
            </button>
          </div>
        </div>
      )}
      {mathDraft &&
        kbOpen &&
        keyboardHost &&
        createPortal(
          <MathKeyboard
            onInsert={kbInsert}
            onBackspace={kbBackspace}
            onCommit={() => commitMathDraft(mathDraftRef.current)}
            onClose={() => setKbOpen(false)}
          />,
          keyboardHost,
        )}
    </>
  );
}

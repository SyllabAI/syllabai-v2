/**
 * Ink sync controller — T-MG-INK-1 run-003. PURE async state machine (no
 * React): owns the revision LWW law on the client half — the run-002
 * server half is the CAS/409 engine, this is the client that re-reads
 * and re-applies.
 *
 * LAW OF RECORD (run-002 revision doc + plan §3.3):
 * - the PUT carries the BASE revision (the stored revision the local doc
 *   was last synced at; 0 seeds revision 1 server-side);
 * - an accepted write advances the local base to the served row's
 *   revision (base + 1);
 * - 409 (stale base) → GET the stored row, rebaseShapes(stored, local),
 *   retry the PUT ONCE with the fresh base; a second 409 surfaces as the
 *   honest "conflict" state (the user re-opens; E4 single-writer keeps
 *   this path theoretical — it exists so the net never lies);
 * - network/format failures surface as "error" and stay retryable —
 *   local edits are never dropped (the working set survives until a
 *   write lands).
 *
 * Debounce law: edits schedule a push (default 900ms trailing) — one
 * PUT per drawing burst, never per pointermove. The timer is INJECTABLE
 * (tests drive it manually).
 */
import {
  emptyDoc,
  packDoc,
  parseDoc,
  rebaseShapes,
  type InkDoc,
  type InkShape,
} from "./ink";
import {
  fetchPdfDrawing,
  putPdfDrawing,
  type PutPdfDrawingResult,
} from "@/lib/pdf-drawings";

export type InkSyncStatus = "loading" | "synced" | "saving" | "conflict" | "error";

export interface InkSyncSnapshot {
  status: InkSyncStatus;
  /** The working shape set (the local intent, always the newest). */
  shapes: InkShape[];
  /** The base revision the next PUT is cut against (0 until first sync). */
  baseRevision: number;
  /** True while the local set has changes not yet confirmed stored. */
  dirty: boolean;
}

export interface InkSyncDeps {
  sourceUrl: string;
  token: string | null;
  /** Injectable debounce scheduler; returns a cancel fn (tests: manual). */
  schedule?: (fn: () => void, ms: number) => () => void;
  debounceMs?: number;
  load?: typeof fetchPdfDrawing;
  save?: typeof putPdfDrawing;
}

const DEFAULT_DEBOUNCE_MS = 900;

export function createInkSync(deps: InkSyncDeps) {
  const load = deps.load ?? fetchPdfDrawing;
  const save = deps.save ?? putPdfDrawing;
  const schedule =
    deps.schedule ??
    ((fn: () => void, ms: number) => {
      const t = setTimeout(fn, ms);
      return () => clearTimeout(t);
    });
  const debounceMs = deps.debounceMs ?? DEFAULT_DEBOUNCE_MS;

  let status: InkSyncStatus = "loading";
  let shapes: InkShape[] = [];
  let baseRevision = 0;
  let dirty = false;
  let pending = false; // a scheduled push exists
  let inFlight = false; // a PUT/GET loop is running
  let disposed = false;
  const listeners = new Set<(s: InkSyncSnapshot) => void>();

  let cancelTimer: (() => void) | null = null; // the single live debounce timer

  // STABLE snapshot law: useSyncExternalStore compares with Object.is —
  // the snapshot object changes identity ONLY when an emit happens.
  let lastSnapshot: InkSyncSnapshot = { status, shapes, baseRevision, dirty };

  function snapshot(): InkSyncSnapshot {
    return lastSnapshot;
  }

  function emit() {
    lastSnapshot = { status, shapes, baseRevision, dirty };
    for (const l of listeners) l(lastSnapshot);
  }

  /** Init: the GET (honest-null keeps the empty local doc + base 0 → the
   * first write seeds revision 1; an offline read never blocks drawing). */
  async function init(): Promise<InkSyncSnapshot> {
    const loaded = await load(deps.sourceUrl, deps.token);
    if (disposed) return snapshot();
    if (loaded?.drawing) {
      const doc = parseDoc(loaded.drawing.doc);
      if (doc) {
        shapes = doc.shapes;
        baseRevision = loaded.drawing.revision;
      }
    }
    status = "synced";
    emit();
    return snapshot();
  }

  async function runPush(): Promise<void> {
    if (inFlight || disposed) return;
    if (!dirty) return;
    inFlight = true;
    status = "saving";
    emit();
    // The write works on a fixed copy; edits during flight stay local and
    // re-schedule. Dirty-at-exit is REFERENCE equality: the store is
    // confirmed iff the working set is still the exact array that the
    // successful write carried (applyLocal/the rebase both reassign).
    let attempt = shapes;
    let result: PutPdfDrawingResult = await save(
      deps.sourceUrl,
      packDoc(attempt),
      baseRevision,
      deps.token,
    );
    if (result.outcome === "conflict") {
      // Re-read and re-apply (the run-002 law), retry once.
      const fresh = await load(deps.sourceUrl, deps.token);
      if (disposed) {
        inFlight = false;
        return;
      }
      const freshDoc = fresh?.drawing ? parseDoc(fresh.drawing.doc) : null;
      const stored = freshDoc?.shapes ?? [];
      attempt = rebaseShapes(stored, attempt);
      shapes = attempt;
      if (fresh?.drawing) baseRevision = fresh.drawing.revision;
      result = await save(deps.sourceUrl, packDoc(attempt), baseRevision, deps.token);
    }
    inFlight = false;
    if (disposed) return;
    if (result.outcome === "written") {
      baseRevision = result.drawing.revision;
      status = "synced";
      dirty = shapes !== attempt;
      if (dirty) schedulePush(); // the trailing timer carries the delta
    } else if (result.outcome === "conflict") {
      // Second 409 — the honest surfaced conflict (theoretical under E4).
      status = "conflict";
      dirty = false; // the rebase already folded stored∪local into shapes
    } else {
      status = "error";
      // dirty stays true — the working set is preserved, retry allowed.
    }
    emit();
  }

  /** SINGLE-TIMER law: at most one live debounce timer exists (a
   * re-schedule cancels its predecessor — the double-timer race the
   * run's own tests caught never gets a second timer to double-PUT). */
  function schedulePush(): void {
    if (disposed) return;
    cancelTimer?.();
    pending = true;
    cancelTimer = schedule(() => {
      pending = false;
      cancelTimer = null;
      void runPush();
    }, debounceMs);
  }

  /** A local edit landed (strokes/text/undo/redo/clear). Marks dirty and
   * schedules the trailing push. Pass `immediate` for destructive ops
   * (clear) — still debounced; the flag is reserved for future laws. */
  function applyLocal(next: InkShape[]): InkSyncSnapshot {
    shapes = next;
    dirty = true;
    schedulePush();
    emit();
    return snapshot();
  }

  /** Manual retry (the error state's button) — forces an immediate push. */
  function retry(): void {
    if (disposed) return;
    cancelTimer?.();
    cancelTimer = null;
    pending = false;
    dirty = true;
    void runPush();
  }

  /** Flush: cancel the trailing timer and await the in-flight/pending
   * push (the unmount/toggle-off law — no edit lost to a timer kill). */
  function flush(): Promise<void> {
    if (disposed) return Promise.resolve();
    cancelTimer?.();
    cancelTimer = null;
    pending = false;
    return runPush();
  }

  function subscribe(fn: (s: InkSyncSnapshot) => void): () => void {
    listeners.add(fn);
    fn(snapshot());
    return () => listeners.delete(fn);
  }

  function getSnapshot(): InkSyncSnapshot {
    return snapshot();
  }

  function dispose(): void {
    disposed = true;
    cancelTimer?.();
    cancelTimer = null;
    listeners.clear();
  }

  /** The working doc (for tests + the canvas painter's source of truth). */
  function doc(): InkDoc {
    return shapes.length ? packDoc(shapes) : emptyDoc();
  }

  return { init, applyLocal, retry, flush, subscribe, getSnapshot, dispose, doc };
}

export type InkSync = ReturnType<typeof createInkSync>;

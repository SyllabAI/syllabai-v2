/**
 * Ink LOCAL store — T-MG-INK-3 run-002 (plan of record
 * docs/MG-MARK-PARITY-PLAN.md §3.7). The no-token branch of the ink
 * persistence plane: the SAME ink surface, persisted browser-side with
 * ZERO server contact (the operator's design law of record — "marking =
 * login-constrained; the other tools don't have to be").
 *
 * ZERO-CONTACT LAW (the run's pin of record): this module NEVER imports
 * a network client — no fetch, no Bearer, no telemetry, by construction.
 * The mode fork upstream (InkLayer) constructs the sync controller ONLY
 * with a token; without one THIS controller is the whole persistence
 * plane, and it talks to IndexedDB alone. The test of record pins the
 * law with a fetch spy across the full controller lifecycle.
 *
 * STORAGE PIN: browser IndexedDB — ONE database ("syllabai-ink"), ONE
 * object store ("docs"), keyPath "sourceUrl" (the EXISTING doc-identity
 * law — the same key the server doc uses), value = the record
 * `{ sourceUrl, doc }` where `doc` is the syllabai-ink/1 container
 * VERBATIM (zero schema change; the honest-parse boundary at load is
 * ./ink's parseDoc — the same boundary the server path uses). No
 * localStorage fallback (the disclosed non-goal): an unavailable or
 * failing store is an honest error state, never a silent downgrade to a
 * different engine.
 *
 * REVISION LAW: none. One device, one writer — full-doc LWW overwrite
 * (the same full-doc grain as the server PUT) with no base, no CAS, no
 * 409. The debounce (single-timer, 900ms trailing), honest-parse,
 * flush-before-dispose and stable-snapshot laws carry over VERBATIM
 * from ./ink-sync.
 *
 * CONTROLLER SHAPE: the return surface mirrors the InkSync controller
 * exactly (init/applyLocal/retry/flush/subscribe/getSnapshot/dispose/
 * doc) so InkLayer swaps the two transparently and every drawing-path
 * law keeps byte-identical shape. Snapshot statuses reuse the shared
 * InkSyncStatus vocabulary; InkLayer's LOCAL pill renders exactly ONE
 * healthy state ("Local only — saved on this device. Log in to sync.",
 * role=status) plus the honest error (role=alert) — the Saving…/Saved/
 * Edited elsewhere states are sync-mode-only, never fabricated here.
 */

import { packDoc, parseDoc, type InkDoc, type InkShape } from "./ink";
import type { InkSyncSnapshot, InkSyncStatus } from "./ink-sync";

/** The record of record — ONE store, keyPath sourceUrl, doc verbatim. */
export interface InkLocalRecord {
  sourceUrl: string;
  doc: InkDoc;
}

/**
 * The injectable persistence seam. Contract: `get` resolves null for an
 * ABSENT key and REJECTS on store failure (the controller must be able
 * to tell "nothing saved yet" from "this device can't be trusted");
 * `put`/`delete` resolve false on failure, true on success — never
 * reject for the defined outcomes.
 */
export interface InkLocalBackend {
  get(key: string): Promise<InkDoc | null>;
  put(key: string, doc: InkDoc): Promise<boolean>;
  delete(key: string): Promise<boolean>;
}

export interface InkLocalDeps {
  sourceUrl: string;
  /** Injectable debounce scheduler; returns a cancel fn (tests: manual). */
  schedule?: (fn: () => void, ms: number) => () => void;
  debounceMs?: number;
  /** Injectable store seam (tests: in-memory; production: IndexedDB). */
  store?: InkLocalBackend;
}

const DEFAULT_DEBOUNCE_MS = 900;
const DB_NAME = "syllabai-ink";
const DB_VERSION = 1;
const STORE_NAME = "docs";

/** Wrap one IDBRequest into a promise (the only event-ordering we rely on). */
function requestAsPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("syllabai-ink: request failed"));
  });
}

/**
 * The production backend: the ONE IndexedDB database of record. Each op
 * opens → runs one transaction → closes (no long-lived handle, no
 * versionchange staleness); every failure rejects (get) or resolves
 * false (put/delete) per the seam contract. Where IndexedDB does not
 * exist at all (hardened browsers), open() rejects — the honest error
 * state, never a fallback engine.
 */
export function createIdbBackend(): InkLocalBackend {
  function open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        reject(new Error("syllabai-ink: IndexedDB unavailable"));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "sourceUrl" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("syllabai-ink: open failed"));
      req.onblocked = () => reject(new Error("syllabai-ink: open blocked"));
    });
  }

  async function withStore<T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => IDBRequest,
  ): Promise<T> {
    const db = await open();
    try {
      return await new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const req = run(tx.objectStore(STORE_NAME));
        tx.oncomplete = () => resolve(requestAsResult<T>(req));
        tx.onabort = () => reject(tx.error ?? new Error("syllabai-ink: transaction aborted"));
        tx.onerror = () => reject(tx.error ?? new Error("syllabai-ink: transaction failed"));
      });
    } finally {
      db.close();
    }
  }

  return {
    async get(key: string): Promise<InkDoc | null> {
      const rec = await withStore<InkLocalRecord | undefined>("readonly", (s) => s.get(key));
      return rec?.doc ?? null;
    },
    async put(key: string, doc: InkDoc): Promise<boolean> {
      try {
        await withStore("readwrite", (s) => s.put({ sourceUrl: key, doc } satisfies InkLocalRecord));
        return true;
      } catch {
        return false;
      }
    },
    async delete(key: string): Promise<boolean> {
      try {
        await withStore("readwrite", (s) => s.delete(key));
        return true;
      } catch {
        return false;
      }
    },
  };
}

/** Pull a completed request's result (tx.oncomplete guarantees it). */
function requestAsResult<T>(req: IDBRequest | null): T {
  return (req ? (req.result as T) : undefined) as T;
}

export function createInkLocal(deps: InkLocalDeps) {
  const store = deps.store ?? createIdbBackend();
  const schedule =
    deps.schedule ??
    ((fn: () => void, ms: number) => {
      const t = setTimeout(fn, ms);
      return () => clearTimeout(t);
    });
  const debounceMs = deps.debounceMs ?? DEFAULT_DEBOUNCE_MS;

  let status: InkSyncStatus = "loading";
  let shapes: InkShape[] = [];
  let dirty = false;
  let inFlight = false; // a device write is running
  let disposed = false;
  const listeners = new Set<(s: InkSyncSnapshot) => void>();

  let cancelTimer: (() => void) | null = null; // the single live debounce timer

  // STABLE snapshot law (the ink-sync law, verbatim): useSyncExternalStore
  // compares with Object.is — the snapshot object changes identity ONLY
  // when an emit happens. baseRevision stays 0 forever (no server).
  let lastSnapshot: InkSyncSnapshot = { status, shapes, baseRevision: 0, dirty };

  function snapshot(): InkSyncSnapshot {
    return lastSnapshot;
  }

  function emit() {
    lastSnapshot = { status, shapes, baseRevision: 0, dirty };
    for (const l of listeners) l(lastSnapshot);
  }

  /** Init: the device read (honest — a corrupted doc drops its bad
   * shapes at the SAME parseDoc boundary the server path uses; an
   * unreadable store surfaces the honest error state and drawing still
   * works in memory). */
  async function init(): Promise<InkSyncSnapshot> {
    try {
      const doc = await store.get(deps.sourceUrl);
      if (disposed) return snapshot();
      if (doc) {
        const parsed = parseDoc(doc);
        if (parsed) shapes = parsed.shapes;
      }
      status = "synced";
    } catch {
      if (disposed) return snapshot();
      status = "error";
    }
    emit();
    return snapshot();
  }

  async function runPush(): Promise<void> {
    if (inFlight || disposed) return;
    if (!dirty) return;
    inFlight = true;
    status = "saving";
    emit();
    // The write works on a fixed copy; edits during the write stay local
    // and re-schedule (the ink-sync reference-equality dirty law, verbatim).
    const attempt = shapes;
    let ok = false;
    try {
      ok = await store.put(deps.sourceUrl, packDoc(attempt));
    } catch {
      ok = false;
    }
    inFlight = false;
    if (disposed) return;
    if (ok) {
      status = "synced";
      dirty = shapes !== attempt;
      if (dirty) schedulePush(); // the trailing timer carries the delta
    } else {
      status = "error";
      // dirty stays true — the working set is preserved, retry re-attempts.
    }
    emit();
  }

  /** SINGLE-TIMER law (verbatim from ./ink-sync): at most one live
   * debounce timer exists — a re-schedule cancels its predecessor. */
  function schedulePush(): void {
    if (disposed) return;
    cancelTimer?.();
    cancelTimer = schedule(() => {
      cancelTimer = null;
      void runPush();
    }, debounceMs);
  }

  /** A local edit landed (strokes/text/undo/redo/clear). Marks dirty and
   * schedules the trailing device write. */
  function applyLocal(next: InkShape[]): InkSyncSnapshot {
    shapes = next;
    dirty = true;
    schedulePush();
    emit();
    return snapshot();
  }

  /** Manual retry (the local error pill's affordance) — forces an
   * immediate write. */
  function retry(): void {
    if (disposed) return;
    cancelTimer?.();
    cancelTimer = null;
    dirty = true;
    void runPush();
  }

  /** Flush: cancel the trailing timer and await the in-flight/pending
   * write (the unmount/toggle-off law — no edit lost to a timer kill). */
  function flush(): Promise<void> {
    if (disposed) return Promise.resolve();
    cancelTimer?.();
    cancelTimer = null;
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
    return shapes.length ? packDoc(shapes) : packDoc([]);
  }

  return { init, applyLocal, retry, flush, subscribe, getSnapshot, dispose, doc };
}

export type InkLocal = ReturnType<typeof createInkLocal>;

/**
 * The read-only probe for the CONSENT-GATED migration (sync mode only).
 * Sync mode NEVER draws from the local store — the server doc is the
 * single truth there; this exists ONLY so InkLayer can detect a local
 * doc and offer the explicit upload. Honest-null on any failure.
 */
export async function inkLocalLoad(sourceUrl: string): Promise<InkDoc | null> {
  try {
    const doc = await createIdbBackend().get(sourceUrl);
    return doc ? parseDoc(doc) : null;
  } catch {
    return null;
  }
}

/**
 * The local-key clear (the migration's confirmed-PUT epilogue and the
 * explicit "Discard local" exit). Resolves false when the delete fails
 * — the caller keeps the notice honestly armed (the upload itself is
 * idempotent: union-by-id).
 */
export async function inkLocalClear(sourceUrl: string): Promise<boolean> {
  try {
    return await createIdbBackend().delete(sourceUrl);
  } catch {
    return false;
  }
}

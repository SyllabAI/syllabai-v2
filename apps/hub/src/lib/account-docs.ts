"use client";

/**
 * Account documents — the client half of the workspace-document plane
 * (T-AUDIT-TIER1). THE REPLACEMENT FOR BROWSER PERSISTENCE.
 *
 * Where the hub's client stores used to keep their state in
 * localStorage/sessionStorage (progress overlay, mock results, last-opened,
 * deck sessions, guided-flow state, teacher coverage / saved tests /
 * reviews / drafts / classes, tutor / assistant / CLA-question thread
 * transcripts), they now keep it HERE — module memory hydrated from and
 * written through to the account (`user_documents` via
 * /api/v1/me/documents, contracts workspaceDocKeySchema). Nothing
 * learner/teacher-shaped is written to the browser anymore: signed in, the
 * account is the store of record; signed out, stores behave exactly as
 * empty and writes stay session-memory only (honest, disclosed — the user
 * tests signed-in accounts).
 *
 * LAWS (my-subjects.ts's write-through lineage, generalized):
 *  - HYDRATE ONCE PER IDENTITY: useAccountDocsSync() (mounted once in the
 *    app shell) GETs the whole doc set on identity acquisition and fills
 *    module memory. Server wins on hydrate UNLESS the key has pending
 *    local writes (dirty) — the user's just-typed work never loses to a
 *    racing fetch; dirty keys flush after hydration.
 *  - WRITE-THROUGH: every store write updates memory IMMEDIATELY (the UI
 *    never waits on the network) and schedules a debounced PUT of the whole
 *    document for that key. A failed PUT keeps the memory value and re-arms
 *    (the next write, hydration or visibility change retries) — the cache
 *    law, inverted: memory is the instant truth, the account is the
 *    durable truth.
 *  - SESSION-SCOPED SIGNED OUT: no identity → no GET, no PUT; memory-only
 *    writes survive the tab, not the browser. On login the dirty keys
 *    flush into the account (session work is adopted, never dropped).
 *  - KEY LAW: only contracts' workspaceDocKeySchema keys may be written;
 *    the server rejects anything else with 400 (the closed-vocabulary law).
 *  - 401 HONESTY: a 401 mid-flight means the session died — the api client
 *    already clears the session and fires syllabai:session-expired; this
 *    module just drops its dirty flags and stops scheduling (no zombie
 *    retry loop against a signed-out account).
 *
 * TEST SEAM: __resetAccountDocsForTests / __seedAccountDocsForTests give
 * the unit tests direct control of the module memory without fetch.
 */
import { useEffect } from "react";
import { api } from "@/lib/api";
import { useIdentity } from "@/lib/identity";

/** Debounce window for write-through flushes (coalesces bursts — e.g. a
 *  flashcard drill writing the deck session after every rating). */
const FLUSH_DEBOUNCE_MS = 400;

interface DocEntry {
  value: unknown;
  /** pending local write not yet confirmed by the server */
  dirty: boolean;
}

const memory = new Map<string, DocEntry>();
const listeners = new Map<string, Set<() => void>>();
const globalListeners = new Set<(key: string) => void>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

let hydrated = false;
let hydrating: Promise<void> | null = null;
let hydratedForEmail: string | null = null;

function notify(key: string) {
  listeners.get(key)?.forEach((fn) => fn());
  globalListeners.forEach((fn) => fn(key));
}

/**
 * Read one document from memory. `undefined` = not hydrated or never
 * written (the store decides its own empty shape); `null` = explicitly
 * cleared while signed out (stores treat null exactly like absent).
 */
export function readDoc<T = unknown>(key: string): T | undefined {
  const e = memory.get(key);
  return e ? (e.value as T) : undefined;
}

/** True once the current identity's hydration round-trip has landed. */
export function isHydrated(): boolean {
  return hydrated;
}

export function subscribeDoc(key: string, fn: () => void): () => void {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key)!.add(fn);
  return () => {
    listeners.get(key)?.delete(fn);
  };
}

/** Subscribe to ALL doc changes (store modules bridge this to their own
 *  snapshot events so their useSyncExternalStore consumers re-render). */
export function subscribeDocs(fn: (key: string) => void): () => void {
  globalListeners.add(fn);
  return () => {
    globalListeners.delete(fn);
  };
}

/** Write (or clear with null) one document. Memory-first, notify, then a
 *  debounced whole-document PUT. Never throws. */
export function writeDoc(key: string, value: unknown): void {
  memory.set(key, { value, dirty: true });
  notify(key);
  scheduleFlush(key);
}

function scheduleFlush(key: string) {
  if (timers.has(key)) clearTimeout(timers.get(key)!);
  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key);
      void flush(key);
    }, FLUSH_DEBOUNCE_MS),
  );
}

async function flush(key: string): Promise<void> {
  const e = memory.get(key);
  if (!e?.dirty) return;
  if (typeof window === "undefined") return;
  try {
    if (e.value === null) {
      await api.deleteWorkspaceDoc(key);
    } else {
      await api.putWorkspaceDoc(key, e.value);
    }
    // only clear the flag if no newer write landed mid-flight
    const cur = memory.get(key);
    if (cur && cur.value === e.value) cur.dirty = false;
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 401) {
      // session died — drop the pending flag (the session-expired event
      // already reset the UI); no zombie retries signed-out
      const cur = memory.get(key);
      if (cur && cur.value === e.value) cur.dirty = false;
      return;
    }
    // network/server hiccup — stay dirty; the next write, hydration or
    // visibility change retries (the re-arm law)
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => scheduleFlush(key), { once: true });
    }
  }
}

/**
 * Hydrate the whole doc set for the current identity. Server wins UNLESS
 * the key has pending local writes (dirty) — those flush after the merge.
 */
export async function hydrateAccountDocs(email: string): Promise<void> {
  if (typeof window === "undefined") return;
  if (hydrating) return hydrating;
  hydratedForEmail = email;
  hydrating = (async () => {
    try {
      const list = await api.workspaceDocs();
      const serverKeys = new Set<string>();
      for (const doc of list.docs) {
        serverKeys.add(doc.key);
        const cur = memory.get(doc.key);
        if (cur?.dirty) continue; // local intent wins; flush below
        memory.set(doc.key, { value: doc.value, dirty: false });
        notify(doc.key);
      }
      // docs the server no longer has (deleted from another device) — same
      // dirty law: pending local writes survive, clean absent keys clear
      for (const [key, e] of memory) {
        if (!serverKeys.has(key) && !e.dirty) {
          memory.set(key, { value: null, dirty: false });
          notify(key);
        }
      }
      hydrated = true;
      // flush the session's pending work into the account (login adoption)
      for (const [key, e] of memory) {
        if (e.dirty) scheduleFlush(key);
      }
    } catch {
      // core unreachable — memory (and any pending writes) stay as-is; the
      // next identity change or write re-attempts hydration
    } finally {
      hydrating = null;
    }
  })();
  return hydrating;
}

/** Sign-out / account-switch reset: drop hydrated state AND pending writes.
 *  Every key that had state (or listeners) re-notifies so bridged stores
 *  re-derive to their honest empty shapes — user A's data can never leak
 *  into user B's view. Signed-out writes are session-scoped by law, so a
 *  sign-out clears everything. */
export function resetAccountDocs(): void {
  const keys = new Set<string>([...memory.keys(), ...listeners.keys()]);
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
  memory.clear();
  hydrated = false;
  hydrating = null;
  hydratedForEmail = null;
  for (const key of keys) notify(key);
}

/**
 * The one-call sync surface: mount ONCE (the app shell), no arguments.
 * Hydrates on identity acquisition, resets on sign-out.
 */
export function useAccountDocsSync(): void {
  const identity = useIdentity();
  useEffect(() => {
    if (!identity) {
      if (hydrated || memory.size > 0) resetAccountDocs();
      return;
    }
    if (hydrated && hydratedForEmail === identity.email) return;
    void hydrateAccountDocs(identity.email);
  }, [identity?.email]); // eslint-disable-line react-hooks/exhaustive-deps -- the identity OBJECT is referentially unstable per read; email is the stable key
}

// ── test seam ─────────────────────────────────────────────────────────────

/** @internal test-only: wipe module state between tests. */
export function __resetAccountDocsForTests(): void {
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
  memory.clear();
  listeners.clear();
  globalListeners.clear();
  hydrated = false;
  hydrating = null;
  hydratedForEmail = null;
}

/** @internal test-only: seed memory + notify, as a hydration would. */
export function __seedAccountDocsForTests(docs: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(docs)) {
    memory.set(key, { value, dirty: false });
    notify(key);
  }
  hydrated = true;
}

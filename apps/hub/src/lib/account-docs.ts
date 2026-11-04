"use client";

/**
 * Account documents — the client half of the workspace-document plane
 * (T-AUDIT-TIER1 run-003). THE ACCOUNT IS THE DURABLE COPY.
 *
 * The hub's client workspace stores (deck sessions, guided-flow state,
 * progress overlays, teacher classes, test-builder drafts, tutor /
 * assistant / CLA-question thread transcripts) keep their existing
 * localStorage pools as the reactive UI cache (the T-TEACH-001 write-through
 * method — the UI never waits on the network and signed-out usage behaves
 * exactly as before); this module is the DURABLE COPY layer: module memory
 * hydrated from and written through to the account (`user_documents` via
 * /api/v1/me/documents, contracts workspaceDocKeySchema). The per-store
 * bridges in lib/account-docs-bridge.ts mediate between the two planes.
 *
 * LAWS (my-subjects.ts's write-through lineage, generalized):
 *  - HYDRATE ONCE PER IDENTITY: useAccountDocsSync() (mounted once in the
 *    app shell) GETs the whole doc set on identity acquisition and fills
 *    module memory. Hydration is the CONSERVATIVE UNION's server half: a
 *    server value lands unless the key has pending local writes (dirty) —
 *    the user's just-typed work never loses to a racing fetch; dirty keys
 *    flush after hydration. Pre-plane data is never orphaned: a clean key
 *    the server does not have reads as explicitly cleared (null), never
 *    undefined-while-hydrated.
 *  - WRITE-THROUGH: every store write updates the store's own cache
 *    IMMEDIATELY and mirrors here, which schedules a debounced PUT of the
 *    whole document for that key (400ms — coalesces streaming bursts). A
 *    failed PUT keeps the memory value and re-arms (the next write,
 *    hydration or visibility change retries) — memory is the instant
 *    truth, the account is the durable truth.
 *  - SESSION-SCOPED SIGNED OUT: no identity → no GET, no PUT; the stores'
 *    local pools work exactly as they always have (device-local). On login
 *    the account doc set hydrates and the bridges adopt/merge (the bridge
 *    owns the union law).
 *  - ACCOUNT-SWITCH RESET: signed-in → signed-in to a DIFFERENT account
 *    resets module state BEFORE the next identity's hydration — user A's
 *    pending dirty flags must never flush into user B's account
 *    (__needsSwitchReset, pinned in the unit tests).
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
import { useEffect, useRef } from "react";
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
 * cleared (stores treat null exactly like absent).
 */
export function readDoc<T = unknown>(key: string): T | undefined {
  const e = memory.get(key);
  return e ? (e.value as T) : undefined;
}

/** True once the current identity's hydration round-trip has landed. */
export function isHydrated(): boolean {
  return hydrated;
}

/** The email the current hydration ran for (null signed-out / pre-hydrate).
 *  The bridges read this for the pool-owner law — the owner email never
 *  rides the wire, it exists only device-side. */
export function hydratedEmail(): string | null {
  return hydrated ? hydratedForEmail : null;
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
 * Hydrate the whole doc set for the current identity. The server value
 * lands UNLESS the key has pending local writes (dirty) — those flush
 * after the merge (the dirty-wins law; the bridge adds the union on top).
 */
export async function hydrateAccountDocs(email: string): Promise<void> {
  if (typeof window === "undefined") return;
  if (hydrating) return hydrating;
  hydratedForEmail = email;
  hydrating = (async () => {
    try {
      const list = await api.workspaceDocs();
      // hydrated flips BEFORE the merge lands: the store bridges must see
      // the server truth arrive (their callbacks run inside these
      // notifications and re-derive the union against their live pools)
      hydrated = true;
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
      // flush the session's pending work into the account (login adoption)
      for (const [key, e] of memory) {
        if (e.dirty) scheduleFlush(key);
      }
    } catch {
      // core unreachable — memory (and any pending writes) stay as-is; the
      // next identity change or write re-attempts hydration (hydrated
      // never flipped, so the plane stays honestly device-local)
    } finally {
      hydrating = null;
    }
  })();
  return hydrating;
}

/** Sign-out / account-switch reset: drop hydrated state AND pending writes.
 *  Every key that had state (or listeners) re-notifies so bridged stores
 *  re-derive to their honest empty shapes — user A's data can never leak
 *  into user B's view. Signed-out writes stay in the stores' own device
 *  pools (they never lived here). */
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
 * The account-switch law (pure): a signed-in → signed-in jump to a
 * DIFFERENT email must reset module state BEFORE the next identity's
 * hydration — user A's pending dirty flags must never flush into user B's
 * account. Sign-out (next null) and fresh sign-in (prev null) are NOT
 * switches: the former resets through the signed-out branch, the latter
 * hydrates with adoption.
 */
export function __needsSwitchReset(prev: string | null, next: string | null): boolean {
  return prev != null && next != null && prev !== next;
}

/**
 * The one-call sync surface: mount ONCE (the app shell), no arguments.
 * Hydrates on identity acquisition, resets on sign-out AND on
 * account-switch (the __needsSwitchReset law).
 */
export function useAccountDocsSync(): void {
  const identity = useIdentity();
  const prevEmail = useRef<string | null>(null);
  useEffect(() => {
    const email = identity?.email ?? null;
    if (__needsSwitchReset(prevEmail.current, email)) resetAccountDocs();
    prevEmail.current = email;
    if (!email) {
      if (hydrated || memory.size > 0) resetAccountDocs();
      return;
    }
    if (hydrated && hydratedForEmail === email) return;
    void hydrateAccountDocs(email);
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

/** @internal test-only: seed memory + notify, as a hydration would (the
 *  optional email sets the hydration identity — the bridges' owner law). */
export function __seedAccountDocsForTests(docs: Record<string, unknown>, email?: string): void {
  hydrated = true;
  hydratedForEmail = email ?? null;
  for (const [key, value] of Object.entries(docs)) {
    memory.set(key, { value, dirty: false });
    notify(key);
  }
}

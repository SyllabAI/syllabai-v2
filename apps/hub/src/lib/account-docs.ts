/**
 * account-docs — the hub-side engine of the workspace-document plane
 * (T-AUDIT-TIER1 run-003; the T-TEACH-001 write-through law generalized
 * over the /api/v1/me/documents family).
 *
 * LAW OF RECORD (T-ACCOUNT-ONLY run-001, operator order 2026-11-05
 * "remove device-local things completely — every single thing must be
 * saved in account"; supersedes the run-003 mirrored-cache law of
 * 2026-11-03):
 *
 *  - THE ACCOUNT IS THE ONLY DURABLE STORE. localStorage is retired for
 *    ALL user state: stores live in module memory, hydrate from this
 *    engine, and every write is a debounced (400ms per key) PUT of the
 *    WHOLE document value. One intent, one PUT (the debounce coalesces;
 *    re-entrant mirrors see the echo guard / stamp equality).
 *  - the ONE deliberate device-local artifact is the auth session itself
 *    (lib/api.ts "syllabai.token"/"syllabai.user") — that is the login,
 *    not user state.
 *  - LEGACY ADOPTION (the no-data-loss clause): a store may register its
 *    retired localStorage keys via adoptLegacyStorage(). The pre-sweep
 *    device record is seeded into memory as a LEGACY-dirty value that
 *    commits up ONLY when the server has no doc of its own (server
 *    truth always wins over device truth); the device keys are REMOVED
 *    the moment the docKey is clean (server-adopted or flushed), so the
 *    browser ends the sweep holding nothing but the session. Adoption
 *    is once-per-tab-per-key: a failed seed never re-fires after an
 *    account switch (no cross-account seeding).
 *  - failed PUT: the value STAYS in memory with its dirty flag and the
 *    flush re-arms ONCE on the next visibilitychange→visible (a cold
 *    tab never spins; a returning tab converges). A 401 DROPS the dirty
 *    flag (the session is gone — the account copy cannot proceed) but
 *    keeps the value: memory remains the honest in-tab cache.
 *  - hydration: GET the account's list ONCE (single-flight), then merge:
 *    a plain DIRTY key wins over the server (its flush follows the
 *    merge); a LEGACY-dirty key yields to the server (then retires); a
 *    clean key adopts the server value; a known key ABSENT on the server
 *    becomes the explicit null (the honest "no durable copy" — never
 *    confused with "never looked"). `hydrated` flips TRUE before the
 *    merge-loop notifies — the bridge callbacks during hydration MUST see
 *    isHydrated()===true or they no-op forever (the run-003 lesson).
 *  - account switch / sign-out: resetAccountDocs() clears the engine AND
 *    broadcasts onAccountDocsReset so every registered store clears its
 *    own memory cache (a dirty value composed under account A must never
 *    cross into account B's plane).
 *
 * The per-store reconcile (thread pools etc.) is the bridge's law
 * (./account-docs-bridge.ts) — this module is store-agnostic.
 */
import { useEffect, useRef } from "react";
import { ApiError, api } from "./api";
import { useIdentity } from "./identity";

export const FLUSH_DEBOUNCE_MS = 400;

interface MemEntry {
  value: unknown;
  dirty: boolean;
  /** a value seeded from a retired localStorage record (see
   *  adoptLegacyStorage): commits up only when the server has no doc. */
  legacy?: boolean;
}

const memory = new Map<string, MemEntry>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const rearmHandlers = new Map<string, () => void>();
const subscribers = new Set<(key: string | null) => void>();
const resetListeners = new Set<() => void>();
/** docKey → the device localStorage keys backing its legacy record. */
const legacyKeysByDoc = new Map<string, string[]>();
/** tab-lifetime adoption guard (never cleared — no cross-account seeding). */
const legacyAdopted = new Set<string>();
let hydrated = false;
let hydrating: Promise<void> | null = null;

function retireLegacyKeys(docKey: string): void {
  const keys = legacyKeysByDoc.get(docKey);
  if (!keys || typeof window === "undefined") return;
  for (const k of keys) {
    try {
      window.localStorage.removeItem(k);
    } catch {
      // storage blocked — retirement is best-effort, memory already owns the value
    }
  }
  legacyKeysByDoc.delete(docKey);
}

function notify(key: string | null) {
  for (const s of subscribers) {
    try {
      s(key);
    } catch {
      // a broken subscriber never breaks the engine
    }
  }
}

function clearTimer(key: string) {
  const t = timers.get(key);
  if (t) {
    clearTimeout(t);
    timers.delete(key);
  }
}

/**
 * The current value of a doc: the server-adopted value (clean), the
 * pending local value (dirty), the explicit null (known-absent on the
 * server) — or undefined when the key was never seen (pre-hydration, or
 * a key no hydration ever mentioned). The bridge's decision tree keys on
 * exactly these four states.
 */
export function readDoc(key: string): unknown {
  return memory.get(key)?.value;
}

/** The write-through write: dirty now, PUT follows after the debounce. */
export function writeDoc(key: string, value: unknown): void {
  memory.set(key, { value, dirty: true });
  clearTimer(key);
  const t = setTimeout(() => {
    timers.delete(key);
    void flushDoc(key);
  }, FLUSH_DEBOUNCE_MS);
  timers.set(key, t);
  notify(key);
}

function rearmOnVisible(key: string) {
  if (rearmHandlers.has(key)) return; // already armed once
  if (typeof document === "undefined") return;
  const handler = () => {
    if (document.visibilityState !== "visible") return;
    document.removeEventListener("visibilitychange", handler);
    rearmHandlers.delete(key);
    void flushDoc(key);
  };
  document.addEventListener("visibilitychange", handler);
  rearmHandlers.set(key, handler);
}

/**
 * The flush of record: PUT the whole doc value. 401 drops the dirty flag
 * (the session is gone; the value stays as the local cache). Any other
 * failure keeps the dirty flag and re-arms on the next visibility.
 */
export async function flushDoc(key: string): Promise<void> {
  const mem = memory.get(key);
  if (!mem || !mem.dirty) return;
  clearTimer(key);
  const value = mem.value;
  try {
    await api.putWorkspaceDoc(key, value);
    // only the write that flew may go clean — a writeDoc during the
    // flight left a NEWER dirty value whose own timer is already armed
    const cur = memory.get(key);
    if (cur && cur.dirty && cur.value === value) {
      memory.set(key, { value, dirty: false });
      retireLegacyKeys(key); // the account owns it now — the device copy retires
      notify(key);
    }
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      const cur = memory.get(key);
      if (cur) memory.set(key, { value: cur.value, dirty: false });
      notify(key);
      return;
    }
    rearmOnVisible(key);
  }
}

/**
 * Hydration of record: one GET (single-flight), then the merge — dirty
 * wins, clean adopts, absent becomes the explicit null. `hydrated` flips
 * BEFORE the merge-loop notifies (the bridge must see it during the
 * hydration echoes — flipping it after was the run-003 defect). The final
 * null-key notification tells every registered bridge "hydration landed —
 * look at your doc NOW" so a pre-hydration device-local pool can adopt
 * even if it never wrote again.
 */
export async function hydrateAccountDocs(_email: string): Promise<void> {
  if (hydrating) return hydrating;
  const run = (async () => {
    try {
      const list = await api.workspaceDocs();
      hydrated = true; // BEFORE the merge-loop notifies — the run-003 law
      const seen = new Set<string>();
      for (const doc of list.documents) {
        seen.add(doc.key);
        const cur = memory.get(doc.key);
        // a LEGACY-dirty seed yields to the server (the server doc is the
        // account's own newer truth; the device copy then retires); a plain
        // dirty edit wins and flushes after the merge
        if (cur?.dirty && !cur.legacy) continue;
        memory.set(doc.key, { value: doc.value, dirty: false });
        retireLegacyKeys(doc.key); // server-adopted → the device copy retires
        notify(doc.key);
      }
      for (const key of [...memory.keys()]) {
        if (seen.has(key)) continue;
        if (memory.get(key)?.dirty) continue; // plain edits AND legacy seeds flush below
        memory.set(key, { value: null, dirty: false });
        notify(key);
      }
      notify(null); // the "hydration landed" broadcast
      const dirties = [...memory.entries()].filter(([, m]) => m.dirty).map(([k]) => k);
      await Promise.all(dirties.map((k) => flushDoc(k)));
    } catch {
      // hydration failure: hydrated stays FALSE — the device-local state
      // is untouched and the next identity change retries. The dirty
      // flags (if any) keep their pending PUTs.
    } finally {
      hydrating = null;
    }
  })();
  hydrating = run;
  return run;
}

export function isAccountDocsHydrated(): boolean {
  return hydrated;
}

/** The account-switch/scope-clear reset: memory, timers and re-arm
 *  handlers all drop, and every registered store is told to clear its own
 *  memory cache (the reset broadcast). Subscribers (the bridges) SURVIVE —
 *  they no-op while !hydrated and converge again on the next hydration. */
export function resetAccountDocs(): void {
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
  if (typeof document !== "undefined") {
    for (const handler of rearmHandlers.values()) {
      document.removeEventListener("visibilitychange", handler);
    }
  }
  rearmHandlers.clear();
  memory.clear();
  hydrated = false;
  hydrating = null;
  for (const cb of [...resetListeners]) {
    try {
      cb();
    } catch {
      // a broken reset listener never breaks the reset
    }
  }
}

/** Register a store-side cache-clear for account switches / sign-out.
 *  Returns the unregister handle (test teardown / HMR). */
export function onAccountDocsReset(cb: () => void): () => void {
  resetListeners.add(cb);
  return () => resetListeners.delete(cb);
}

/**
 * LEGACY ADOPTION (T-ACCOUNT-ONLY run-001) — the one-time bridge from the
 * pre-sweep world: a store registers the localStorage keys it is retiring
 * plus a reader over them. If the engine does not already own the docKey
 * and the device still holds a record, the parsed value seeds memory as a
 * LEGACY-dirty entry: it commits up on hydration ONLY when the server has
 * no doc of its own, and the device keys are removed the moment the docKey
 * is clean (server-adopted or flushed). Once per tab per docKey, forever —
 * a failed seed never re-fires after an account switch.
 */
export function adoptLegacyStorage(
  docKey: string,
  keys: readonly string[],
  read: () => unknown,
): void {
  if (typeof window === "undefined") return;
  if (legacyAdopted.has(docKey)) return;
  legacyAdopted.add(docKey);
  const present = keys.filter((k) => {
    try {
      return window.localStorage.getItem(k) !== null;
    } catch {
      return false;
    }
  });
  if (present.length === 0) return;
  legacyKeysByDoc.set(docKey, [...present]);
  if (memory.has(docKey)) {
    // the engine already owns this doc (server-adopted at hydration, or an
    // in-tab edit) — the device record is superseded: retire immediately
    retireLegacyKeys(docKey);
    return;
  }
  let value: unknown;
  try {
    value = read();
  } catch {
    value = undefined; // a corrupt record retires without seeding
  }
  if (value !== null && value !== undefined) {
    memory.set(docKey, { value, dirty: true, legacy: true });
    notify(docKey);
    if (hydrated) void flushDoc(docKey); // late adoption (post-hydration module init)
  }
}

/** Test seam: the retirement state of a docKey's legacy device keys. */
export function __legacyKeysForTests(docKey: string): string[] {
  return legacyKeysByDoc.get(docKey) ?? [];
}

/** Test seam: force-clean a doc's memory entry (flushed semantics without
 *  a network) so retirement laws can be exercised deterministically. */
export function __markCleanForTests(docKey: string): void {
  const mem = memory.get(docKey);
  if (mem) memory.set(docKey, { value: mem.value, dirty: false });
}

export function subscribeAccountDocs(cb: (key: string | null) => void): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

/** The account-switch law, pure: BOTH accounts non-null and different —
 *  a sign-out (next null) and a first sign-in (prev null) are handled by
 *  the hook's own transitions, never by this predicate. */
export function __needsSwitchReset(prev: string | null, next: string | null): boolean {
  return prev !== null && next !== null && prev !== next;
}

/**
 * The app-shell hook (ONE mount for the whole app): hydrate on the first
 * signed-in identity, reset+re-hydrate on an account switch, reset on
 * sign-out. Identity re-renders with the SAME email are no-ops.
 */
export function useAccountDocsSync(): void {
  const identity = useIdentity();
  const email = identity?.email ?? null;
  const last = useRef<string | null>(null);
  useEffect(() => {
    const prev = last.current;
    if (prev === email) return;
    last.current = email;
    if (prev !== null && email === null) {
      resetAccountDocs(); // sign-out: the durable copy is nobody's business now
      return;
    }
    if (__needsSwitchReset(prev, email)) {
      resetAccountDocs(); // switch: A's dirty values never cross into B
    }
    if (email) void hydrateAccountDocs(email);
  }, [email]);
}

// ── test seams (exported for the fixture suites; not an app surface) ────

export function __resetAccountDocsForTests(): void {
  resetAccountDocs();
}

/** Seed memory as if hydration landed with these values (hydrated flips
 *  FIRST — the same order the real hydrate uses, the run-003 law). */
export function __seedAccountDocsForTests(entries: Record<string, unknown>): void {
  resetAccountDocs();
  hydrated = true;
  for (const [key, value] of Object.entries(entries)) {
    memory.set(key, { value, dirty: false });
  }
}

/** Flush every dirty key NOW (timers dropped) — the deterministic drain
 *  the fixtures use instead of waiting out the 400ms debounce. */
export async function __flushAllForTests(): Promise<void> {
  for (const key of [...timers.keys()]) clearTimer(key);
  const dirties = [...memory.entries()].filter(([, m]) => m.dirty).map(([k]) => k);
  await Promise.all(dirties.map((k) => flushDoc(k)));
}

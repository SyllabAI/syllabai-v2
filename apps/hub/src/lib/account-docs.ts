/**
 * account-docs — the hub-side engine of the workspace-document plane
 * (T-AUDIT-TIER1 run-003; the T-TEACH-001 write-through law generalized
 * over the /api/v1/me/documents family).
 *
 * LAW OF RECORD (the run-003 design, operator order 2026-11-03 "things
 * that are localStorage-only, make them saved to account"):
 *
 *  - localStorage stays the REACTIVE UI cache (T-TEACH-001). This engine
 *    is the DURABLE ACCOUNT COPY — a mirrored second home, never a
 *    replacement. A signed-out user keeps everything device-local.
 *  - write-through: every engine write is a debounced (400ms per key) PUT
 *    of the WHOLE document value. One intent, one PUT (the debounce
 *    coalesces; re-entrant mirrors see the echo guard / stamp equality).
 *  - failed PUT: the value STAYS in memory with its dirty flag and the
 *    flush re-arms ONCE on the next visibilitychange→visible (a cold
 *    tab never spins; a returning tab converges). A 401 DROPS the dirty
 *    flag (the session is gone — the account copy cannot proceed) but
 *    keeps the value: memory remains the honest local cache.
 *  - hydration: GET the account's list ONCE (single-flight), then merge:
 *    a DIRTY key wins over the server (its flush follows the merge); a
 *    clean key adopts the server value; a known key ABSENT on the server
 *    becomes the explicit null (the honest "no durable copy" — never
 *    confused with "never looked"). `hydrated` flips TRUE before the
 *    merge-loop notifies — the bridge callbacks during hydration MUST see
 *    isHydrated()===true or they no-op forever (the run-003 lesson).
 *  - account switch: the memory resets when the signed-in email changes
 *    between two non-null accounts (__needsSwitchReset) — a dirty value
 *    composed under account A must never cross into account B's plane.
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
}

const memory = new Map<string, MemEntry>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const rearmHandlers = new Map<string, () => void>();
const subscribers = new Set<(key: string | null) => void>();
let hydrated = false;
let hydrating: Promise<void> | null = null;

/** T-CAPS-POLICY-1 — the silent-413 retirement. The last REJECTED-PUT state
 *  per key ("too_large" = the plane answered 413 document_too_large). A
 *  failed PUT used to keep the dirty flag and re-arm invisibly forever: the
 *  account copy froze while every surface kept working device-local, and
 *  NOTHING told anyone. Now the state is readable (readDocError) and
 *  notified (subscribers see the key), so any UI can surface it. Cleared
 *  on the next successful flush and on reset. */
export type DocError = "too_large";
const docErrors = new Map<string, DocError>();

export function readDocError(key: string): DocError | null {
  return docErrors.get(key) ?? null;
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
      notify(key);
    }
    if (docErrors.delete(key)) notify(key); // the honest clear after a healed write
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      const cur = memory.get(key);
      if (cur) memory.set(key, { value: cur.value, dirty: false });
      notify(key);
      return;
    }
    if (e instanceof ApiError && e.status === 413) {
      // T-CAPS-POLICY-1: surface the rejection instead of swallowing it.
      // The value STAYS dirty per the law (a later smaller write — e.g.
      // after the user deletes the fat thread — can still land); the
      // visibility re-arm still applies. Retry is futile until the value
      // changes, but the USER now knows; before this, nobody ever did.
      docErrors.set(key, "too_large");
      console.error(
        `[account-docs] PUT "${key}" rejected (413 document_too_large) — the account copy is stale until the value shrinks; local data is safe`,
      );
      notify(key);
      rearmOnVisible(key);
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
        if (memory.get(doc.key)?.dirty) continue;
        memory.set(doc.key, { value: doc.value, dirty: false });
        notify(doc.key);
      }
      for (const key of [...memory.keys()]) {
        if (seen.has(key)) continue;
        if (memory.get(key)?.dirty) continue;
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
 *  handlers all drop. Subscribers (the bridges) SURVIVE — they no-op
 *  while !hydrated and converge again on the next hydration. */
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
  docErrors.clear();
  hydrated = false;
  hydrating = null;
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

"use client";

/**
 * Account-docs → thread-store bridge (T-AUDIT-TIER1 run-003) — the union
 * mediator between the account document plane (lib/account-docs.ts) and the
 * hub's thread stores (tutor / assistant / CLA-question).
 *
 * The stores keep their localStorage pools as the reactive UI cache (the
 * T-TEACH-001 write-through method): load()/persist()/emit() untouched, the
 * storage event still works cross-tab, signed-out usage is byte-identical
 * to the pre-plane behavior. This module adds ONE tail to persist()
 * (mirrorThreadState) and ONE registration per store (bridgeThreadStore):
 *
 *  - mirrorThreadState(docKey, snapshot): the persist tail. Before
 *    hydration it is a no-op (the device-local law — nothing mirrors
 *    signed-out or pre-hydration). After hydration it writes the whole
 *    document into the account plane, which schedules the debounced PUT.
 *  - bridgeThreadStore(config): the subscribeDocs callback. When a doc
 *    changes (server hydration landed, or the store itself wrote), it
 *    merges the two thread pools under the conservative-union law and
 *    commits back:
 *
 *      server doc ABSENT + adoptable pool → mirror the device pool UP
 *        (the migration: pre-plane local data is adopted, never orphaned)
 *      FOREIGN pool (the owner side-tag names another account) → re-base
 *        the local store onto the account doc; NO union, NO PUT — user A's
 *        threads can never bleed into user B's transcript
 *      union ≠ server (local-only threads exist) → commit the union AND
 *        write it back — ONE intent, ONE debounced PUT (the echo guard
 *        absorbs the re-entrant notify)
 *      local ≠ union (server-only threads) → pull down only, nothing to
 *        PUT
 *
 * OWNER-TAG LAW: the device pool is side-tagged `<localKey>:owner` in
 * localStorage with the email it was last adopted/re-based for. Untagged
 * (pre-plane) pools are adoptable; a tagged pool is adoptable only for the
 * same account; signed-out nothing merges (isHydrated() gates everything).
 * The tag is device-local state — it never rides the wire.
 *
 * MERGE LAW: union by id, newer `updatedAt` wins, clock tie → the server
 * copy (the account is the durable truth), newest-first sort, per-store
 * caps respected (thread count slice + per-thread messages TAIL cap), and
 * malformed entries dropped, never thrown (the family's validMessage law).
 *
 * ECHO GUARD: while a remote application is in flight, mirrorThreadState
 * no-ops for that key — one intent, one PUT; the bridge's own writeDoc
 * notification can never re-enter and schedule a second PUT of the same
 * intent.
 */
import { readDoc, subscribeDocs, writeDoc, isHydrated, hydratedEmail } from "./account-docs";

/** The structural minimum a thread must carry to cross the bridge. The
 *  stores' own thread types all satisfy it (id + updatedAt + messages). */
export interface BridgedThread {
  id: string;
  updatedAt?: number | string | null;
  messages?: unknown[];
}

/** Structural validation: malformed entries are dropped, never thrown (the
 *  family law) — id must be a non-empty string, messages a real array. */
export function isBridgedThread(t: unknown): t is BridgedThread {
  return (
    !!t &&
    typeof t === "object" &&
    typeof (t as { id?: unknown }).id === "string" &&
    (t as { id: string }).id.length > 0 &&
    Array.isArray((t as { messages?: unknown }).messages)
  );
}

/** Numeric view of a thread's updatedAt for the newer-wins compare —
 *  epoch millis, ISO strings parse, anything else sorts as 0 (oldest). */
function tsOf(t: BridgedThread): number {
  const u = t.updatedAt;
  if (typeof u === "number") return Number.isFinite(u) ? u : 0;
  if (typeof u === "string") {
    const parsed = Date.parse(u);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

/**
 * The conservative union of two thread pools: by id, newer updatedAt wins,
 * tie → the server copy, newest-first, capped (threads sliced to
 * maxThreads, per-thread messages tail-capped to maxMessages). Malformed
 * entries on either side are dropped, never thrown.
 */
export function mergeThreadLists<T extends BridgedThread>(
  local: T[],
  server: T[],
  maxThreads: number,
  maxMessages: number,
): T[] {
  const byId = new Map<string, T>();
  for (const t of server) {
    if (isBridgedThread(t)) byId.set(t.id, t); // server first → the tie law
  }
  for (const t of local) {
    if (!isBridgedThread(t)) continue;
    const cur = byId.get(t.id);
    if (!cur) {
      byId.set(t.id, t);
      continue;
    }
    if (tsOf(t) > tsOf(cur)) byId.set(t.id, t); // newer wins; tie keeps server
  }
  return [...byId.values()]
    .sort((a, b) => tsOf(b) - tsOf(a))
    .slice(0, maxThreads)
    .map((t) => ({ ...t, messages: (t.messages ?? []).slice(-maxMessages) }) as T);
}

/** Do the two lists carry the SAME (id, updatedAt) set? — the
 *  change-detector for the union decision (message tails and caps are
 *  deliberately NOT compared: capping both sides equally must not
 *  ping-pong PUTs). */
function sameIdStamp<T extends BridgedThread>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  const key = (t: T) => `${t.id}:${tsOf(t)}`;
  const bKeys = new Map(b.map((t) => [t.id, key(t)]));
  return a.every((t) => bKeys.get(t.id) === key(t));
}

// ── the owner side-tag (device-local, never on the wire) ─────────────────

function ownerTagKey(localKey: string): string {
  return `${localKey}:owner`;
}

function readPoolOwner(localKey: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ownerTagKey(localKey));
  } catch {
    return null;
  }
}

/** Is this device's pool safe to merge into the current account's doc?
 *  untagged (pre-plane) → adoptable; tagged for the SAME account →
 *  adoptable; tagged for another account (or storage unavailable) →
 *  foreign. Signed-out never reaches here (isHydrated gates the bridge). */
export function poolAdoptable(localKey: string, email: string | null): boolean {
  if (typeof window === "undefined") return false;
  const tag = readPoolOwner(localKey);
  if (!tag) return true; // untagged legacy pool — adoptable
  return email != null && tag === email;
}

/** Side-tag the device pool for an account (after an adoption or a
 *  re-base — the tag records whose data the pool now mirrors). */
export function stampPoolOwner(localKey: string, email: string): void {
  if (typeof window === "undefined" || !email) return;
  try {
    window.localStorage.setItem(ownerTagKey(localKey), email);
  } catch {
    // quota/private-mode — the pool stays untagged; the next cycle re-derives
  }
}

// ── the echo guard (one intent, one PUT) ─────────────────────────────────

const applyingRemote = new Set<string>();

// ── the store tail ───────────────────────────────────────────────────────

/**
 * The persist() tail the thread stores call after their own localStorage
 * write. Before hydration (or while a remote application is in flight for
 * this key) it is a no-op; otherwise it mirrors the whole document into
 * the account plane — memory-first, notify, debounced PUT.
 */
export function mirrorThreadState(docKey: string, snapshot: unknown): void {
  if (!isHydrated()) return; // device-local law
  if (applyingRemote.has(docKey)) return; // echo guard — one intent, one PUT
  writeDoc(docKey, snapshot);
}

// ── the registration ─────────────────────────────────────────────────────

/** What a thread store hands the bridge: the live state, how to read its
 *  threads, how to fold a merged list back in, and how to build the
 *  account document from the live state. */
export interface ThreadStoreBridgeConfig<S, T extends BridgedThread> {
  /** the workspace document key (the contracts allow-list row) */
  docKey: string;
  /** the store's own localStorage pool key (the owner tag rides beside it) */
  localKey: string;
  /** the live store state (NOT a React snapshot — module memory) */
  snapOf: () => S;
  /** the thread list of a state */
  threadsOf: (s: S) => T[];
  /** fold a merged thread list back into the store: replace the threads,
   *  re-derive the active pointer(s) store-side, persist (the mirror tail
   *  no-ops under the echo guard) and notify the store's listeners */
  apply: (threads: T[]) => void;
  /** the account document value from the live store state (the store's
   *  own shape — { threads, activeId } / { threads, activeByQuestion }) */
  docOf: () => unknown;
  maxThreads: number;
  maxMessages: number;
}

/** Extract + validate the server doc's thread list (malformed dropped). */
function threadsFrom<T extends BridgedThread>(
  doc: unknown,
  maxThreads: number,
): T[] {
  const threads = (doc as { threads?: unknown } | null)?.threads;
  if (!Array.isArray(threads)) return [];
  return threads.filter((t) => isBridgedThread(t)).slice(0, maxThreads) as T[];
}

/**
 * Register a thread store with the account-document plane. The callback
 * runs on EVERY doc notification for the key (server hydration, the
 * store's own mirror, a reset) and re-derives the union — the decision
 * tree is the module header's law. Never throws.
 */
export function bridgeThreadStore<S, T extends BridgedThread>(
  config: ThreadStoreBridgeConfig<S, T>,
): void {
  const { docKey, localKey, maxThreads, maxMessages } = config;
  subscribeDocs((key) => {
    if (key !== docKey) return;
    if (applyingRemote.has(docKey)) return; // our own intent — absorbed
    if (typeof window === "undefined") return;
    if (!isHydrated()) return; // device-local law
    try {
      const server = readDoc<unknown>(docKey);
      const email = hydratedEmail();
      const localThreads = config.threadsOf(config.snapOf());

      if (server === undefined) return; // nothing known for this key yet

      if (server === null) {
        // the account has no doc for this key (never written or deleted
        // elsewhere)
        if (localThreads.length === 0) return; // nothing to adopt or clear
        if (poolAdoptable(localKey, email) && email) {
          // adoptable pool mirrors UP — the migration law (pre-plane local
          // data is adopted, never orphaned)
          applyingRemote.add(docKey);
          try {
            writeDoc(docKey, config.docOf());
            stampPoolOwner(localKey, email);
          } finally {
            applyingRemote.delete(docKey);
          }
        } else if (email) {
          // FOREIGN pool with no server doc: the pool belongs to another
          // account — re-base to the honest empty shape and re-tag, so this
          // account never reads the other's transcript and its own new work
          // can mirror up on the next cycle. (The other account's data is
          // safe: a stamped pool is by construction already account-backed.)
          applyingRemote.add(docKey);
          try {
            config.apply([]);
            stampPoolOwner(localKey, email);
          } finally {
            applyingRemote.delete(docKey);
          }
        }
        return;
      }

      if (!poolAdoptable(localKey, email)) {
        // FOREIGN pool: the device's storage belongs to another account —
        // re-base the local store onto the account doc; no union, no PUT
        const serverThreads = threadsFrom<T>(server, maxThreads);
        applyingRemote.add(docKey);
        try {
          config.apply(serverThreads);
          if (email) stampPoolOwner(localKey, email);
        } finally {
          applyingRemote.delete(docKey);
        }
        return;
      }

      // the conservative union — both directions
      const serverThreads = threadsFrom<T>(server, maxThreads);
      const union = mergeThreadLists<T>(localThreads, serverThreads, maxThreads, maxMessages);
      if (!sameIdStamp(union, serverThreads)) {
        // local-only threads exist → the account adopts them: commit AND
        // write back — ONE intent (the guard absorbs the re-entrant notify)
        applyingRemote.add(docKey);
        try {
          config.apply(union);
          writeDoc(docKey, config.docOf());
          if (email) stampPoolOwner(localKey, email);
        } finally {
          applyingRemote.delete(docKey);
        }
      } else if (!sameIdStamp(union, localThreads)) {
        // server-only additions → pull down, nothing to PUT
        applyingRemote.add(docKey);
        try {
          config.apply(union);
          if (email) stampPoolOwner(localKey, email);
        } finally {
          applyingRemote.delete(docKey);
        }
      }
    } catch {
      // the bridge never breaks the store — a failed cycle re-derives on
      // the next notification
    }
  });
}

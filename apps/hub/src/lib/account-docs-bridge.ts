/**
 * account-docs-bridge — the per-store reconcile law of the workspace-
 * document plane (T-AUDIT-TIER1 run-003). The engine (./account-docs.ts)
 * is store-agnostic; THIS module owns the thread-pool semantics the three
 * conversation stores (tutor / assistant / CLA) share.
 *
 * THE DECISION TREE (T-ACCOUNT-ONLY run-001, evaluated on every store
 * change AND every engine notification, for the one docKey the store
 * registered):
 *
 *   not hydrated, or an in-flight remote apply (the echo guard)  → no-op
 *   signed out                                                   → no-op
 *   server doc null/unknown:
 *     in-memory pool empty                                       → no-op
 *     pool has entries                                           → mirror
 *                                                                  UP
 *   server doc present:
 *     union stamp ≠ server stamp (local has something new/newer) → commit
 *                                                                  up, ONE
 *                                                                  intent
 *     union stamp ≠ local stamp (per-id refresh from the server) → pull
 *                                                                  down
 *     otherwise (stamps equal both ways)                         → no-op
 *
 * THE OWNER-TAG LAW IS RETIRED (run-003): device localStorage no longer
 * holds any pool, so there is nothing to tag, adopt or re-base — account
 * switches reset the engine AND the stores' memory caches (the reset
 * broadcast), and hydration then pulls the signed-in account's own truth.
 *
 * THE STAMP LAW: `sameIdStamp` compares ONLY the id:updatedAt sets. The
 * caps (maxThreads / the per-thread messages tail-cap) are invisible to
 * it — a capped re-merge can never re-trigger its own sync (the cap
 * ping-pong guard), and message-level differences without an updatedAt
 * bump never sync.
 *
 * THE ECHO GUARD: `applyingRemote` wraps every remote-driven mutation
 * (apply into the store AND writeDoc into the engine) — the synchronous
 * notification those mutations fire re-enters mirrorThreadState, which
 * must no-op until the intent completes. One intent, one mutation, one
 * PUT.
 *
 * A mirror NEVER THROWS: every store keeps working in-memory no matter
 * what the plane does.
 */
import {
  isAccountDocsHydrated,
  readDoc,
  subscribeAccountDocs,
  writeDoc,
} from "./account-docs";

/** The defensively-validated thread shape every bridged store's entries
 *  satisfy (id + messages are the load-bearing fields; updatedAt is the
 *  stamp, absent = 0 = oldest). */
export interface BridgedThread {
  id: string;
  updatedAt?: number | string;
  messages?: unknown[];
}

export function isBridgedThread(t: unknown): t is BridgedThread {
  if (!t || typeof t !== "object") return false;
  const c = t as { id?: unknown; messages?: unknown };
  return typeof c.id === "string" && c.id.length > 0 && Array.isArray(c.messages);
}

/** The updatedAt stamp as a comparable ms number — number, ISO string, or
 *  0 (oldest: malformed stamps never win, they just sort last). */
export function tsOf(t: BridgedThread): number {
  const u = t.updatedAt;
  if (typeof u === "number" && Number.isFinite(u)) return u;
  if (typeof u === "string") {
    const ms = Date.parse(u);
    if (Number.isFinite(ms)) return ms;
  }
  return 0;
}

/**
 * The CONSERVATIVE union (the mock-results merge law, not the last-opened
 * recency law): by id, the NEWER updatedAt wins, a tie keeps the SERVER's
 * entry, newest-first order, the pool cap and the per-thread messages
 * tail-cap applied. Malformed entries on either side drop silently — a
 * union never throws, and it never loses a well-formed record from
 * either side.
 */
export function mergeThreadLists<T extends BridgedThread>(
  local: T[],
  server: T[],
  maxThreads: number,
  maxMessages: number,
): T[] {
  const byId = new Map<string, T>();
  for (const s of server) {
    if (isBridgedThread(s)) byId.set(s.id, s);
  }
  for (const l of local) {
    if (!isBridgedThread(l)) continue;
    const cur = byId.get(l.id);
    if (!cur || tsOf(l) > tsOf(cur)) byId.set(l.id, l); // tie → server
  }
  const merged = [...byId.values()].sort((a, b) => tsOf(b) - tsOf(a)).slice(0, maxThreads);
  return merged.map((t) => {
    const msgs = t.messages;
    if (Array.isArray(msgs) && msgs.length > maxMessages) {
      return { ...t, messages: msgs.slice(-maxMessages) };
    }
    return t;
  });
}

/**
 * The stamp: the sorted id:updatedAt set, NOTHING else (the cap
 * ping-pong guard — see the module law above).
 */
export function sameIdStamp(a: BridgedThread[], b: BridgedThread[]): boolean {
  const stamp = (list: BridgedThread[]) =>
    list
      .map((t) => `${t.id}:${tsOf(t)}`)
      .sort()
      .join("|");
  return stamp(a) === stamp(b);
}

// ── the mirror ───────────────────────────────────────────────────────────

export interface ThreadStoreBridgeConfig<S, T extends BridgedThread> {
  /** the workspace-document key this pool mirrors into */
  docKey: string;
  maxThreads: number;
  maxMessages: number;
  /** the store's CURRENT snapshot (fresh on every evaluation) */
  readState: () => S;
  /** extract the thread list from a snapshot */
  readThreads: (snapshot: S) => T[];
  /** replace the store's thread list (pull-down / re-base) — the store's
   *  own active-pointer law rides inside */
  apply: (threads: T[]) => void;
  /** the signed-in account email, or null when signed out */
  getAuthEmail: () => string | null;
  /** the engine's hydration gate */
  isHydrated: () => boolean;
}

const applyingRemote = new Set<string>();
const registry = new Map<string, ThreadStoreBridgeConfig<never, BridgedThread>>();

/** The stored doc shape of record: { threads: BridgedThread[] }; anything
 *  else validates to [] (a malformed doc re-bases honestly, never throws). */
function storedThreads(raw: unknown): BridgedThread[] {
  if (!raw || typeof raw !== "object") return [];
  const t = (raw as { threads?: unknown }).threads;
  if (!Array.isArray(t)) return [];
  return t.filter(isBridgedThread);
}

/**
 * The mirror of record — called by the store's persist tail (an in-memory
 * write) and by the bridge's engine subscription (an engine-driven change),
 * with the store's FRESH snapshot.
 */
export function mirrorThreadState<S, T extends BridgedThread>(docKey: string, snapshot: S): void {
  try {
    const config = registry.get(docKey) as ThreadStoreBridgeConfig<S, T> | undefined;
    if (!config) return;
    if (!config.isHydrated() || applyingRemote.has(docKey)) return;
    const email = config.getAuthEmail();
    if (!email) return;
    const local = config.readThreads(snapshot);
    const raw = readDoc(docKey);
    // post-hydration, an unknown key behaves as the explicit null (the
    // "server never mentioned it" state)
    const serverRaw = raw === undefined ? null : raw;

    if (serverRaw === null) {
      if (local.length === 0) return; // nothing on either side
      // the account has no doc: mirror the in-memory pool UP
      applyingRemote.add(docKey);
      writeDoc(docKey, {
        threads: mergeThreadLists(local, [], config.maxThreads, config.maxMessages),
      });
      applyingRemote.delete(docKey);
      return;
    }

    const serverThreads = storedThreads(serverRaw);
    const union = mergeThreadLists(local, serverThreads, config.maxThreads, config.maxMessages);
    if (!sameIdStamp(union, serverThreads)) {
      // local has something new/newer → commit up, ONE intent
      applyingRemote.add(docKey);
      writeDoc(docKey, { threads: union });
      applyingRemote.delete(docKey);
      return;
    }
    if (!sameIdStamp(union, local)) {
      // per-id refresh from the server → pull down only (the memory
      // baseline is ALREADY the server's clean value, so the persist-tail
      // mirror this apply schedules later sees stamp equality and no-ops)
      applyingRemote.add(docKey);
      config.apply(union as unknown as T[]);
      applyingRemote.delete(docKey);
    }
  } catch {
    // a mirror never throws — the surfaces keep working in-memory
  }
}

/**
 * Register a store's bridge: joins the registry (the persist-tail
 * `mirrorThreadState(docKey, …)` calls dispatch through it) and subscribes
 * to the engine's notifications (hydration lands, flushes complete — the
 * bridge re-evaluates with a FRESH store snapshot). Returns the
 * unregister handle (module unload / test teardown).
 */
export function bridgeThreadStore<S, T extends BridgedThread>(
  config: ThreadStoreBridgeConfig<S, T>,
): () => void {
  registry.set(config.docKey, config as unknown as ThreadStoreBridgeConfig<never, BridgedThread>);
  const unsubscribe = subscribeAccountDocs(() => {
    mirrorThreadState(config.docKey, config.readState());
  });
  // one evaluation on registration — a bridge whose doc already hydrated
  // (late import / HMR) converges immediately; pre-hydration it no-ops
  mirrorThreadState(config.docKey, config.readState());
  return () => {
    registry.delete(config.docKey);
    unsubscribe();
  };
}

/** The engine's hydration gate, re-exported for the store registrations —
 *  ONE import site per store file. */
export { isAccountDocsHydrated };

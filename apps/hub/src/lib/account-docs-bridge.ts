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

// ── the byte budget of record (T-CAPS-POLICY-1) ─────────────────────────

/**
 * The durable-copy char budget. The workspace-doc plane rejects a PUT whose
 * serialized value exceeds WORKSPACE_DOC_MAX_BYTES (512KB) with 413 — and
 * the count caps (however high) can NEVER bound serialized size, because a
 * thread's cost lives in its message bodies. Before this law a saturated
 * pool PUT 413'd SILENTLY: the value stayed dirty on the device forever, the
 * account copy froze, nothing told anyone.
 *
 * The budget is measured in UTF-16 chars with a 2× UTF-8 safety factor:
 * 260,000 chars ≤ ~520KB at the pathological 2-bytes/char, and sits ~4×
 * under the server cap for the ASCII-heavy English content the surfaces
 * actually hold. The BINDING cap for a rich pool is THIS budget, not the
 * count cap — the count caps (200, server-parity) are the ceiling, the
 * budget is the wall.
 */
export const THREAD_DOC_BYTE_BUDGET = 260_000;

/** The envelope overhead: '{"threads":[]}' plus separators — subtracted
 *  once per doc, not per thread. */
const THREAD_DOC_OVERHEAD = 15;

/**
 * The byte-budget cap of record: newest-first in (the mergeThreadLists
 * order), oldest threads fall off first, the returned list serializes under
 * the budget. THE IRREDUCIBLE LAW: a single thread that alone exceeds the
 * budget cannot be bounded by eviction — the pool passes through UNCHANGED
 * and the PUT 413s, which the engine now SURFACES (readDocError). The local
 * cache keeps every thread either way; only the durable copy is bounded.
 */
export function capThreadsByBytes<T extends BridgedThread>(
  threads: T[],
  budget: number = THREAD_DOC_BYTE_BUDGET,
): T[] {
  if (threads.length === 0) return threads;
  const lengths = threads.map((t) => JSON.stringify(t).length);
  if (lengths[0] + THREAD_DOC_OVERHEAD > budget) return threads;
  let acc = THREAD_DOC_OVERHEAD;
  let count = 0;
  for (let i = 0; i < threads.length; i++) {
    const cost = lengths[i] + (count > 0 ? 1 : 0);
    if (acc + cost > budget) break;
    acc += cost;
    count++;
  }
  return threads.slice(0, count);
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

/**
 * The echo-guard span (T-CAPS-POLICY-1 hardening): covers ONE remote-driven
 * mutation's SYNCHRONOUS notify cascade. try/finally is the point — the
 * old inline add/delete pairs LEAKED the guard whenever `apply` threw mid-
 * span (the outer catch swallowed the throw, the guard never released, and
 * every later mirror for that key no-oped for the REST of the process — the
 * single-process full battery made this class visible). A leaked guard is
 * now impossible by construction.
 */
function guarded(docKey: string, fn: () => void): void {
  applyingRemote.add(docKey);
  try {
    fn();
  } finally {
    applyingRemote.delete(docKey);
  }
}
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
      guarded(docKey, () =>
        writeDoc(docKey, {
          threads: capThreadsByBytes(
            mergeThreadLists(local, [], config.maxThreads, config.maxMessages),
          ),
        }),
      );
      return;
    }

    const serverThreads = storedThreads(serverRaw);
    const union = mergeThreadLists(local, serverThreads, config.maxThreads, config.maxMessages);
    // T-CAPS-POLICY-1: the byte budget bounds the DURABLE copy, never the
    // device cache. The trim runs BEFORE the stamp checks so a trimmed
    // commit converges (bounded == server → no-op next pass; the count-only
    // law ping-ponged here) and the pull-down adopts the UNBOUNDED union
    // (the device cache never shrinks because the account doc did).
    const bounded = capThreadsByBytes(union);
    if (!sameIdStamp(bounded, serverThreads)) {
      // local has something new/newer (or the budget trimmed the doc) →
      // commit up, ONE intent
      guarded(docKey, () => writeDoc(docKey, { threads: bounded }));
      return;
    }
    if (!sameIdStamp(union, local)) {
      // per-id refresh from the server → pull down only (the memory
      // baseline is ALREADY the server's clean value, so the persist-tail
      // mirror this apply schedules later sees stamp equality and no-ops)
      guarded(docKey, () => config.apply(union as unknown as T[]));
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

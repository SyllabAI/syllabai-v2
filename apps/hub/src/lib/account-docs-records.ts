/**
 * account-docs-records — the record-POOL reconcile law of the workspace-
 * document plane (T-AUDIT-TIER1 run-004). run-003's bridge
 * (./account-docs-bridge.ts) owns the THREAD-LIST pools (tutor / assistant
 * / CLA); THIS module owns the five MAP-shaped pools that join in run-004:
 *
 *   "teacher-classes"      the teacher's local class containers;
 *   "progress:<slug>"      ONE doc per course's progress overlay;
 *   "deck-sessions"        the deck player's resume positions (per deck);
 *   "guided-flow"          the guided-lesson wizard states (per lesson);
 *   "test-builder-drafts"  the Test Builder per-course WIP drafts.
 *
 * THE SHELL IS THE SAME LAW (the run-003 decision tree, pool-shaped;
 * T-ACCOUNT-ONLY run-001 retirement of the owner-tag branches):
 *
 *   not hydrated / echo guard / signed out                → no-op
 *   server doc null-or-unknown:
 *     in-memory pool empty                                → no-op
 *     pool has entries                                    → mirror UP
 *   server doc present:
 *     stamp(union) ≠ stamp(server) (local has new/newer)   → commit up,
 *                                                            ONE intent
 *     stamp(union) ≠ stamp(local) (per-key refresh)        → pull down
 *     stamps equal both ways                               → no-op
 *
 * WHAT CHANGES PER STORE IS ONLY THE MERGE LAW (config.merge — the
 * conservative union over THAT pool's vocabulary) and its STAMP
 * (config.stamp — the ping-pong guard: the comparison that decides
 * "nothing to sync" must see ONLY the fields the merge keys on, so a
 * capped/decorated re-merge can never re-trigger its own sync).
 *
 * The echo guard, the never-throws posture and the caps are inherited
 * verbatim from the run-003 bridge (separate registry — the two bridges
 * never share a docKey). Device localStorage no longer holds any pool
 * (the sweep law): the owner-tag/adopt/re-base branches are retired —
 * account switches reset the engine AND the stores' memory caches, and
 * hydration pulls the signed-in account's own truth.
 */
import {
  isAccountDocsHydrated,
  readDoc,
  subscribeAccountDocs,
  writeDoc,
} from "./account-docs";

// ── shared helpers ──────────────────────────────────────────────────────

/** The entry stamp as a comparable ms number — number, ISO string, or 0
 *  (oldest: malformed stamps never win, they just sort last). The SAME
 *  convention as the thread bridge's tsOf. */
export function atOf(at: unknown): number {
  if (typeof at === "number" && Number.isFinite(at)) return at;
  if (typeof at === "string") {
    const ms = Date.parse(at);
    if (Number.isFinite(ms)) return ms;
  }
  return 0;
}

/**
 * The conservative record union (the mock-results merge law, pool-shaped):
 * by key, the NEWER stamp wins, a tie keeps the SERVER's entry. Entries
 * without a stamp field name it via `atKey` (default "at"). Unknown
 * entries (null/non-object) drop silently — a union never throws, never
 * loses a well-formed record from either side.
 */
export function unionByStamp<T>(
  local: Record<string, T>,
  server: Record<string, T>,
  atKey = "at",
): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries(server)) {
    if (v && typeof v === "object") out[k] = v;
  }
  for (const [k, v] of Object.entries(local)) {
    if (!v || typeof v !== "object") continue;
    const cur = out[k];
    if (!cur || atOf((v as Record<string, unknown>)[atKey]) > atOf((cur as Record<string, unknown>)[atKey])) {
      out[k] = v; // tie → server (cur stays)
    }
  }
  return out;
}

/** The ping-pong guard's stamp: the sorted "key:at" multiset, NOTHING
 *  else — a re-merge that only caps/decorates sees the same stamp and
 *  no-ops (the run-003 sameIdStamp law, pool-shaped). */
export function stampOf<T>(pool: Record<string, T>, atKey = "at"): string {
  return Object.entries(pool)
    .filter(([, v]) => v && typeof v === "object")
    .map(([k, v]) => `${k}:${atOf((v as Record<string, unknown>)[atKey])}`)
    .sort()
    .join("|");
}

/** The pool cap of record: keep the NEWEST-stamp N entries (the honest
 *  eviction — a capped pool never loses its most recent state). */
export function capByStamp<T>(pool: Record<string, T>, cap: number, atKey = "at"): Record<string, T> {
  const entries = Object.entries(pool);
  if (entries.length <= cap) return pool;
  return Object.fromEntries(
    entries
      .sort(
        (a, b) =>
          atOf((b[1] as Record<string, unknown>)[atKey]) - atOf((a[1] as Record<string, unknown>)[atKey]),
      )
      .slice(0, cap),
  );
}

// ── the mirror shell ────────────────────────────────────────────────────

export interface DocPoolBridgeConfig<S, E> {
  /** the workspace-document key this pool mirrors into */
  docKey: string;
  /** max entries the durable copy carries (the plane is bounded state) */
  cap: number;
  /** the store's CURRENT snapshot (fresh on every evaluation) */
  readState: () => S;
  /** the local pool as a Record map (defensive: junk drops) */
  readPool: (snapshot: S) => Record<string, E>;
  /** replace the store's pool (pull-down / re-base) */
  apply: (pool: Record<string, E>) => void;
  /** the conservative union over THIS pool's vocabulary */
  merge: (local: Record<string, E>, server: Record<string, E>) => Record<string, E>;
  /** the ping-pong guard's stamp over THIS pool's vocabulary */
  stamp: (pool: Record<string, E>) => string;
  /** the signed-in account email, or null when signed out */
  getAuthEmail: () => string | null;
  /** the engine's hydration gate */
  isHydrated: () => boolean;
}

const applyingRemote = new Set<string>();
const registry = new Map<string, DocPoolBridgeConfig<never, unknown>>();

/** The stored doc shape of record: a plain Record<string, E>; anything
 *  else validates to {} (a malformed doc re-bases honestly, never throws). */
function storedPool(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v && typeof v === "object" && !Array.isArray(v)) out[k] = v;
  }
  return out;
}

/** The pool mirror of record — the run-003 decision tree, pool-shaped. */
export function mirrorDocPoolState<S, E>(docKey: string, snapshot: S): void {
  try {
    const config = registry.get(docKey) as DocPoolBridgeConfig<S, E> | undefined;
    if (!config) return;
    if (!config.isHydrated() || applyingRemote.has(docKey)) return;
    const email = config.getAuthEmail();
    if (!email) return;
    const local = config.readPool(config.readState());
    const raw = readDoc(docKey);
    // post-hydration, an unknown key behaves as the explicit null
    const serverRaw = raw === undefined ? null : raw;

    if (serverRaw === null) {
      if (Object.keys(local).length === 0) return; // nothing on either side
      // the account has no doc: mirror the in-memory pool UP
      applyingRemote.add(docKey);
      writeDoc(docKey, capByStamp(local, config.cap));
      applyingRemote.delete(docKey);
      return;
    }

    const serverPool = storedPool(serverRaw) as Record<string, E>;
    const union = capByStamp(config.merge(local, serverPool), config.cap);
    if (config.stamp(union) !== config.stamp(serverPool)) {
      // local has something new/newer → commit up, ONE intent
      applyingRemote.add(docKey);
      writeDoc(docKey, union);
      applyingRemote.delete(docKey);
      return;
    }
    if (config.stamp(union) !== config.stamp(local)) {
      // per-key refresh from the server → pull down only (the memory
      // baseline is ALREADY the server's clean value, so the persist-tail
      // mirror this apply schedules later sees stamp equality and no-ops)
      applyingRemote.add(docKey);
      config.apply(union);
      applyingRemote.delete(docKey);
    }
  } catch {
    // a mirror never throws — the surfaces keep working in-memory
  }
}

/**
 * Register a store's pool bridge (the run-003 registration law): joins
 * the registry, subscribes to the engine's notifications, and evaluates
 * ONCE at registration (a store whose doc already hydrated converges
 * immediately; pre-hydration it no-ops). Returns the unregister handle.
 */
export function bridgeDocPool<S, E>(config: DocPoolBridgeConfig<S, E>): () => void {
  registry.set(config.docKey, config as unknown as DocPoolBridgeConfig<never, unknown>);
  const unsubscribe = subscribeAccountDocs(() => {
    mirrorDocPoolState(config.docKey, config.readState());
  });
  mirrorDocPoolState(config.docKey, config.readState());
  return () => {
    registry.delete(config.docKey);
    unsubscribe();
  };
}

/** The engine's hydration gate, re-exported for the store registrations. */
export { isAccountDocsHydrated };

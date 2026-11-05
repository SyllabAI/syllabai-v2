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
 * THE SHELL IS THE SAME LAW (the run-003 decision tree, pool-shaped):
 *
 *   not hydrated / echo guard / signed out                → no-op
 *   server doc null-or-unknown:
 *     local pool empty                                    → no-op
 *     pool foreign-tagged                                 → re-base to {}
 *                                                           + re-tag
 *     pool adoptable or ours                              → mirror UP
 *   server doc present:
 *     pool foreign-tagged → the durable copy IS the other account's own
 *     sync: re-base locally, NO PUT                        → pull
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
 * The owner-tag side-law, the echo guard, the never-throws posture and
 * the caps are inherited verbatim from the run-003 bridge (separate
 * registry — the two bridges never share a docKey).
 */
import {
  isAccountDocsHydrated,
  readDoc,
  subscribeAccountDocs,
  writeDoc,
} from "./account-docs";
import { readPoolOwner, stampPoolOwner } from "./account-docs-bridge";

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

// ── the byte budget of record (T-CAPS-POLICY-1) ─────────────────────────

/**
 * The durable-copy char budget for MAP-shaped pools — the same law as the
 * thread bridge's THREAD_DOC_BYTE_BUDGET (260,000 chars ≈ ≤520KB UTF-8 at
 * the pathological 2-bytes/char, ~4× under the plane's 512KB cap for
 * ASCII-heavy content): the count caps can never bound serialized size, and
 * an over-budget PUT 413s into silent per-device divergence. The budget
 * bounds the DURABLE copy only — the device cache keeps every entry.
 */
export const POOL_DOC_BYTE_BUDGET = 260_000;

/**
 * The pool byte-budget cap of record: newest-stamp-first preference, entries
 * that cannot fit are SKIPPED (not prefix-evicted — pool entries are
 * heterogeneous per-key records, so packing maximizes durable coverage),
 * the returned pool serializes under the budget. THE IRREDUCIBLE LAW: when
 * even the smallest entry alone exceeds the budget, the pool passes through
 * UNCHANGED and the PUT 413s — which the engine now SURFACES (readDocError);
 * the local cache keeps every entry either way.
 */
export function capPoolByBytes<T>(
  pool: Record<string, T>,
  budget: number = POOL_DOC_BYTE_BUDGET,
  atKey = "at",
): Record<string, T> {
  const entries = Object.entries(pool);
  if (entries.length === 0) return pool;
  const lengths = entries.map(([k, v]) => JSON.stringify({ [k]: v }).length);
  if (Math.min(...lengths) + 2 > budget) return pool;
  const order = entries
    .map((_, i) => i)
    .sort(
      (a, b) =>
        atOf((entries[b][1] as Record<string, unknown>)?.[atKey]) -
        atOf((entries[a][1] as Record<string, unknown>)?.[atKey]),
    );
  let acc = 2; // "{}"
  const kept: Array<[string, T]> = [];
  for (const i of order) {
    const cost = lengths[i] + (kept.length > 0 ? 1 : 0);
    if (acc + cost > budget) continue; // too fat here — smaller older entries may still fit
    acc += cost;
    kept.push(entries[i]);
  }
  return Object.fromEntries(kept);
}

// ── the mirror shell ────────────────────────────────────────────────────

export interface DocPoolBridgeConfig<S, E> {
  /** the store's OWN localStorage key (or a stable family name) —
   *  namespaces the :owner side-tag */
  localKey: string;
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

/**
 * The echo-guard span (T-CAPS-POLICY-1 hardening): covers ONE remote-driven
 * mutation's SYNCHRONOUS notify cascade. try/finally is the point — the
 * old inline add/delete pairs LEAKED the guard whenever `apply` threw mid-
 * span (the outer catch swallowed the throw, the guard never released, and
 * every later mirror for that key no-oped for the REST of the process).
 * A leaked guard is now impossible by construction (the thread bridge's
 * `guarded` law, pool-shaped).
 */
function guarded(docKey: string, fn: () => void): void {
  applyingRemote.add(docKey);
  try {
    fn();
  } finally {
    applyingRemote.delete(docKey);
  }
}

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
    const owner = readPoolOwner(config.localKey);

    if (serverRaw === null) {
      if (Object.keys(local).length === 0) return; // nothing on either side
      if (owner && owner !== email) {
        // the device-local pool belongs to ANOTHER account: re-base to
        // EMPTY + re-tag + the durable empty (B's pool initialized)
        guarded(docKey, () => config.apply({} as Record<string, E>));
        stampPoolOwner(config.localKey, email);
        guarded(docKey, () => writeDoc(docKey, {}));
        return;
      }
      // adoptable or already ours: mirror the device-local pool UP
      stampPoolOwner(config.localKey, email);
      guarded(docKey, () => writeDoc(docKey, capPoolByBytes(capByStamp(local, config.cap))));
      return;
    }

    const serverPool = storedPool(serverRaw) as Record<string, E>;
    if (owner && owner !== email) {
      // the durable copy belongs to the OTHER account: re-base locally,
      // NO PUT (the server copy is already B's own durable truth)
      guarded(docKey, () => config.apply(serverPool));
      stampPoolOwner(config.localKey, email);
      return;
    }

    // T-CAPS-POLICY-1: the byte budget bounds the DURABLE copy, never the
    // device cache — same ordering as the thread bridge (trim BEFORE the
    // stamp checks so a trimmed commit converges; pull-down adopts the
    // count-capped union, never the byte-trimmed one).
    const capped = capByStamp(config.merge(local, serverPool), config.cap);
    const bounded = capPoolByBytes(capped);
    if (config.stamp(bounded) !== config.stamp(serverPool)) {
      // local has something new/newer (or the budget trimmed the doc) →
      // commit up, ONE intent
      stampPoolOwner(config.localKey, email);
      guarded(docKey, () => writeDoc(docKey, bounded));
      return;
    }
    if (config.stamp(capped) !== config.stamp(local)) {
      // per-key refresh from the server → pull down only (the memory
      // baseline is ALREADY the server's clean value, so the persist-tail
      // mirror this apply schedules later sees stamp equality and no-ops)
      guarded(docKey, () => config.apply(capped));
    }
  } catch {
    // a mirror never throws — the surfaces keep working device-local
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

/**
 * Content cache + request single-flight (Render free-tier economics).
 *
 * Why this exists: the Spring Boot core runs on Render's free instance, which
 * spins down after 15 minutes of idle. Every wake is a full JVM + Spring
 * boot (tens of seconds on a 0.1-CPU instance) — the "takes forever to
 * load" experience. Two complementary defenses live here:
 *
 * 1. `cachedGet` — stale-while-revalidate cache for CURRICULUM CONTENT ONLY
 *    (subjects, knowledge tree, question lists, exam-paper browse/detail,
 *    concept-graph edges). Content is global and user-independent, changes
 *    only through teacher validation flows, and those flows call
 *    `invalidateContentCache()`. A repeat visit in the SAME TAB paints
 *    instantly from cache and — crucially — never wakes the sleeping
 *    backend: fewer instance-hours burned on the 750 h/month free budget.
 *
 *    T-ACCOUNT-ONLY run-001 (operator order 2026-11-05: "remove device-local
 *    things completely"): the cache is an IN-MEMORY Map, not localStorage —
 *    a cache is not account state, so it must not live on the device
 *    either. The cost is honest and bounded: the first content GET of a
 *    fresh tab hits the network (the SWR stale-copy speedup survives within
 *    the tab). The API surface and the SWR/single-flight semantics are
 *    byte-identical to the localStorage era.
 *
 * 2. `singleFlight` — de-duplicates in-flight GETs (React StrictMode
 *    double-mounts, two components asking for the same URL while the
 *    backend is cold). One network round-trip, shared promise.
 *
 * Explicitly NOT cached (always live): learner state, attempts, history,
 * recommendations, smart lesson, tutor/CLA, anything teacher-queue or
 * marking related — those must always reflect the server.
 *
 * What this file deliberately is NOT: a keep-alive pinger. Pinging a free
 * Render service on a timer to prevent spin-down violates Render's Terms
 * of Service and risks account suspension. The one legitimate wake request
 * per browser session (tied to a real page view) lives in `api.ts`.
 */

/** The RETIRED device-cache key prefix (a legacy sweep pin — nothing reads
 *  it; stale device cache entries simply expire ignored). */
export const RETIRED_CACHE_PREFIX = "syllabai.cache.v2";

const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000; // 6h when a call site omits a TTL

interface CacheEntry<T> {
  storedAt: number;
  data: T;
}

/** In-flight GET de-duplication, shared with the api client. */
const inflight = new Map<string, Promise<unknown>>();

/** The in-memory content cache of record (per tab — see the header law). */
const cache = new Map<string, CacheEntry<unknown>>();

/**
 * Coalesce concurrent identical GETs into one network request.
 * The first caller's promise is shared; later callers await it.
 */
export function singleFlight<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const p = run().finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, p);
  // `p` is returned to real callers who handle rejection; the finally-chain
  // above must not become an unhandled rejection itself.
  p.catch(() => {});
  return p;
}

/**
 * Drop every cached content payload. Called by teacher mutation flows that
 * change what the serving gate exposes (validate/place/reject papers and
 * versions, topic remapping, concept-graph re-activation).
 */
export function invalidateContentCache(): void {
  cache.clear();
}

/**
 * Stale-while-revalidate read-through cache for content GETs.
 *
 * - fresh hit  → resolves immediately, zero network.
 * - stale hit  → resolves IMMEDIATELY with the stale copy, then revalidates
 *                in the background (failures swallowed — stale stays
 *                authoritative until a successful refresh replaces it).
 * - miss       → single-flight network fetch, cached on success.
 */
export function cachedGet<T>(key: string, fetcher: () => Promise<T>, ttlMs: number = DEFAULT_TTL_MS): Promise<T> {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  const now = Date.now();

  if (entry && now - entry.storedAt < ttlMs) {
    return Promise.resolve(entry.data);
  }

  if (entry) {
    // Stale: hand back what we have, refresh quietly. The refresh is
    // fire-and-forget from the caller's perspective; a wake triggered by it
    // is user-visible work being done anyway (they asked for this content).
    void singleFlight(`${key}#revalidate`, fetcher)
      .then((fresh) => {
        cache.set(key, { storedAt: Date.now(), data: fresh });
      })
      .catch(() => {
        /* offline / backend down: the stale copy keeps serving */
      });
    return Promise.resolve(entry.data);
  }

  return singleFlight(`${key}#fetch`, async () => {
    const fresh = await fetcher();
    cache.set(key, { storedAt: Date.now(), data: fresh });
    return fresh;
  });
}

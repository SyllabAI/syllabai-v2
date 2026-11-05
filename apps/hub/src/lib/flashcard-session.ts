/**
 * flashcard-session — the deck player's session state (research pass 5,
 * DC-8 + DC-11). Two halves:
 *
 *   - DC-11 the PLAYER FILTER: a session-scoped query over the deck's cards
 *     combining the card-state family (Not viewed yet / Still learning /
 *     Know, plus the due axis — SyllabAI's computed analogue of SME's
 *     unobserved "Revisit" scheduling bucket) with a deck-internal scope
 *     family (card type). SME's per-lesson scope family has no corpus
 *     equivalent here: every SyllabAI deck IS one sub-topic (single section
 *     by construction — content census 2026-10-21), so card type stands in
 *     as the honest second axis. A "re-run mistakes only" preset (still
 *     learning ∪ due) is the highest-value default per DC-11's own note.
 *
 *   - DC-8 the RESUME: deck run position (and the filter that shaped it)
 *     survives a full reload — the SyllabAI analogue of SME's server-side
 *     resume (research pass 5, screenshot 198: position and bucket counts
 *     survive reload). T-ACCOUNT-ONLY run-001: the resume is ACCOUNT-scoped
 *     (the "deck-sessions" workspace doc) — the per-account resume the DC-8
 *     note called future work; the device record is retired by the sweep.
 *
 * Honesty pins (inherited from the flashcard evidence class):
 *   - this store is NEVER engagement evidence: resume position does not
 *     feed rings, mastery, or the review queue (lib/progress.ts stays the
 *     overlay of record — a resumed card is not a done card);
 *   - a saved run is restored only when it still covers EXACTLY the deck's
 *     cards (set-equality): a corpus change discards the stale session and
 *     the deck starts fresh — a saved run must never silently hide or
 *     phantom a card;
 *   - every negative (no save / corrupt save / private mode) degrades to a
 *     fresh run — the player never blocks, never spins, never invents.
 */

/** The card-state buckets a filter can select. "not-viewed" = the card has
 *  no rating trail anywhere (SME's default fourth row of Table 2). */
export type FlashcardCardState = "not-viewed" | "still-learning" | "know";

/** The player filter (DC-11). All-true + null cardTypes = unfiltered. */
export interface DeckCardFilter {
  states: Record<FlashcardCardState, boolean>;
  /** due-for-review axis — OR-ed with the state axis: a due card matches
   *  when EITHER its rating bucket or this axis is checked. */
  due: boolean;
  /** deck-internal scope family; null = every type in the deck. Cards with
   *  no cardType are bucketed as null and only match when null is selected. */
  cardTypes: Array<string | null> | null;
}

/** The unfiltered filter — the shape the player renders before hydration
 *  and returns to on "Clear filters". */
export const ALL_ON_FILTER: DeckCardFilter = {
  states: { "not-viewed": true, "still-learning": true, "know": true },
  due: true,
  cardTypes: null,
};

/** DC-11's highest-value default: re-run the misses — still-learning cards
 *  plus everything the trail says is due again. Scope family untouched. */
export function mistakesOnlyFilter(scope: Pick<DeckCardFilter, "cardTypes"> = { cardTypes: null }): DeckCardFilter {
  return {
    states: { "not-viewed": false, "still-learning": true, "know": false },
    due: true,
    cardTypes: scope.cardTypes,
  };
}

export function isFilterAllOn(f: DeckCardFilter): boolean {
  return f.states["not-viewed"] && f.states["still-learning"] && f.states["know"] && f.due && f.cardTypes === null;
}

/** How many restrictions the filter applies — the count on the Filters
 *  button (SME renders "Filters [4]"); 0 renders as no badge. */
export function countActiveFilterTerms(f: DeckCardFilter): number {
  const statesOff = (["not-viewed", "still-learning", "know"] as const).filter((s) => !f.states[s]).length;
  return statesOff + (f.due ? 0 : 1) + (f.cardTypes === null ? 0 : 1);
}

/** Validate a filter read back from storage; null (unfiltered) on any
 *  defect — a corrupt filter must never silently narrow a run. */
export function normalizeFilter(raw: unknown): DeckCardFilter | null {
  if (raw === null) return null;
  if (typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const statesRaw = (r.states ?? {}) as Record<string, unknown>;
  const states: Record<FlashcardCardState, boolean> = {
    "not-viewed": statesRaw["not-viewed"] === true,
    "still-learning": statesRaw["still-learning"] === true,
    "know": statesRaw["know"] === true,
  };
  // an ALL-False state axis is a legal (empty-run) selection, but a filter
  // whose keys were mangled (missing → false) reads as over-narrowing —
  // require every key present-and-boolean or reject the whole filter
  if (typeof statesRaw["not-viewed"] !== "boolean" || typeof statesRaw["still-learning"] !== "boolean" || typeof statesRaw["know"] !== "boolean") {
    return null;
  }
  if (typeof r.due !== "boolean") return null;
  let cardTypes: Array<string | null> | null = null;
  if (r.cardTypes !== null && r.cardTypes !== undefined) {
    if (!Array.isArray(r.cardTypes)) return null;
    if (!r.cardTypes.every((t) => t === null || typeof t === "string")) return null;
    cardTypes = r.cardTypes as Array<string | null>;
  }
  return { states, due: r.due, cardTypes };
}

/** The one match rule: type scope ANDs in; the due axis ORs over the state
 *  axis (a due card is work regardless of which bucket its tail sits in). */
export function matchesCardFilter(
  card: { state: FlashcardCardState; due: boolean; cardType: string | null },
  f: DeckCardFilter,
): boolean {
  if (f.cardTypes !== null && !f.cardTypes.includes(card.cardType)) return false;
  return f.states[card.state] || (card.due && f.due);
}

/** Apply the filter to a run order, preserving order. `lookup` keeps this
 *  pure — the caller binds it to the live schedule map (handlers) or the
 *  first-render map (session restore). All-on filters short-circuit. */
export function filterCardIds(
  order: readonly string[],
  f: DeckCardFilter | null,
  lookup: {
    scheduleOf(id: string): { rating: "still-learning" | "know"; due: boolean } | undefined;
    typeOf(id: string): string | null;
  },
): string[] {
  if (!f || isFilterAllOn(f)) return order.slice();
  return order.filter((id) => {
    const s = lookup.scheduleOf(id);
    return matchesCardFilter(
      { state: s ? s.rating : "not-viewed", due: s?.due ?? false, cardType: lookup.typeOf(id) },
      f,
    );
  });
}

// ── DC-8: the resume ───────────────────────────────────────────────────

/** One saved deck session. `order` is the FULL run order (pre-filter);
 *  `pos` indexes the FILTERED run at save time; `filter` null = unfiltered.
 *  On restore the filter is re-applied against the current buckets (a new
 *  session re-queries), so `pos` is clamped — position is approximate when
 *  ratings moved between sessions, exactly like SME's index resume. */
export interface DeckSessionState {
  v: 1;
  order: string[];
  pos: number;
  filter: DeckCardFilter | null;
  at: number;
}

export const deckSessionKey = (course: string, subtopicCode: string): string =>
  `syllabai-hub:deck-position:${course}:${subtopicCode}`; // RETIRED (legacy adoption pin)

// ── T-AUDIT-TIER1 run-004 → T-ACCOUNT-ONLY run-001 — the account IS the
// store ─────────────────────────────────────────────────────────────────
// The per-deck resume states (deliberately DEVICE-scoped since DC-8) mirror
// the account through the workspace-document plane under the
// "deck-sessions" key of record — and since the 2026-11-05 sweep order the
// account is the ONLY durable store: the pool lives in module memory,
// hydrates from the doc, and every save is the write-through. The retired
// per-deck localStorage records (syllabai-hub:deck-position:*) are adopted
// ONCE per tab (the engine's legacy adoption — they commit up only when the
// account has no doc of its own) and then removed.
// The union is per deck key, the NEWER `at` wins (tie -> server), capped.
// The honesty pins are UNCHANGED: a restored run must still cover EXACTLY
// the deck's cards (validateSessionAgainstDeck), and resume position is
// never engagement evidence.
import {
  atOf,
  bridgeDocPool,
  isAccountDocsHydrated,
  mirrorDocPoolState,
  unionByStamp,
} from "@/lib/account-docs-records";
import { adoptLegacyStorage, onAccountDocsReset } from "@/lib/account-docs";
import { readIdentitySnapshot } from "@/lib/identity";

const DECK_PREFIX = "syllabai-hub:deck-position:";
const DOC_KEY = "deck-sessions";
const MAX_DECK_SESSIONS = 80;

// the in-memory pool of record — every hook instance reads the same Map
const pool = new Map<string, DeckSessionState>();
const poolListeners = new Set<() => void>();

function emitPool(): void {
  for (const l of [...poolListeners]) {
    try {
      l();
    } catch {
      // a broken listener never breaks the store
    }
  }
}

function deckPoolKey(storageKey: string): string {
  return storageKey.slice(DECK_PREFIX.length);
}

function readDeckPool(): Record<string, DeckSessionState> {
  return Object.fromEntries(pool);
}

function writeDeckPool(next: Record<string, DeckSessionState>) {
  pool.clear();
  for (const [pk, state] of Object.entries(next)) pool.set(pk, state);
  emitPool();
}

// account switch / sign-out: the pool clears with the engine
if (typeof window !== "undefined") {
  onAccountDocsReset(() => {
    pool.clear();
    emitPool();
  });

  // the one-time legacy adoption: scan the retired per-deck keys ONCE, seed
  // the engine, and let the sweep law retire them on clean
  const legacyKeys: string[] = [];
  const legacyPool: Record<string, DeckSessionState> = {};
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k || !k.startsWith(DECK_PREFIX)) continue;
      const pk = deckPoolKey(k);
      const parts = pk.split(":");
      const s = loadLegacyDeckSession(parts[0] ?? "", parts.slice(1).join(":"));
      if (s) {
        legacyPool[pk] = s;
        legacyKeys.push(k);
      }
    }
  } catch {
    // a torn localStorage scan degrades to the pool it could read
  }
  if (legacyKeys.length > 0) {
    adoptLegacyStorage(DOC_KEY, legacyKeys, () => legacyPool);
  }

  bridgeDocPool<Record<string, DeckSessionState>, DeckSessionState>({
    docKey: DOC_KEY,
    cap: MAX_DECK_SESSIONS,
    readState: () => readDeckPool(),
    readPool: (p) => p,
    apply: (next) => writeDeckPool(next),
    merge: (local, server) => unionByStamp(local, server),
    stamp: (p) => Object.entries(p).map(([k, v]) => `${k}:${atOf(v.at)}`).sort().join("|"),
    getAuthEmail: () => readIdentitySnapshot()?.email ?? null,
    isHydrated: () => isAccountDocsHydrated(),
  });
}

/** A saved run may only restore when it covers EXACTLY this deck's cards:
 *  same size, no duplicates, every id present. Anything else (corpus wave,
 *  shuffled-in stale ids) discards the session — never a silently hidden
 *  or phantom card. */
export function validateSessionAgainstDeck(s: DeckSessionState, deckIds: ReadonlySet<string>): boolean {
  if (s.order.length !== deckIds.size) return false;
  if (new Set(s.order).size !== s.order.length) return false;
  for (const id of s.order) if (!deckIds.has(id)) return false;
  return true;
}

/** The strict shape check of record — shared by the legacy adoption (a raw
 *  device record) and the memory reads (a remote-merged entry). */
function parseDeckSession(raw: unknown): DeckSessionState | null {
  if (!raw || typeof raw !== "object") return null;
  const parsed = raw as Record<string, unknown>;
  if (parsed.v !== 1) return null;
  if (!Array.isArray(parsed.order) || !parsed.order.every((x) => typeof x === "string")) return null;
  if (typeof parsed.pos !== "number" || !Number.isInteger(parsed.pos) || parsed.pos < 0) return null;
  const filter = normalizeFilter(parsed.filter);
  if (parsed.filter != null && filter === null) return null; // corrupt filter → discard the session
  if (typeof parsed.at !== "number" || !Number.isFinite(parsed.at)) return null;
  return { v: 1, order: parsed.order as string[], pos: parsed.pos, filter, at: parsed.at };
}

/** The legacy-adoption reader: one retired device record, validated. */
function loadLegacyDeckSession(course: string, subtopicCode: string): DeckSessionState | null {
  try {
    const raw = window.localStorage.getItem(deckSessionKey(course, subtopicCode));
    if (!raw) return null;
    return parseDeckSession(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function loadDeckSession(course: string, subtopicCode: string): DeckSessionState | null {
  const s = pool.get(`${course}:${subtopicCode}`);
  return s ? parseDeckSession(s) : null;
}

export function saveDeckSession(course: string, subtopicCode: string, s: DeckSessionState): void {
  pool.set(`${course}:${subtopicCode}`, s);
  // T-ACCOUNT-ONLY run-001 — the account mirror IS the store (the
  // persist-tail law; there is no localStorage write behind it anymore)
  mirrorDocPoolState(DOC_KEY, readDeckPool());
}

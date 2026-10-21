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
 *     survive reload). Deliberately DEVICE-scoped browser-local state,
 *     matching the honesty chip's account/device disclosure — SME persists
 *     server-side per account; a per-account resume needs a core surface
 *     and is future work, not silently approximated here.
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

// ── DC-8: the device-scoped resume ───────────────────────────────────────

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
  `syllabai-hub:deck-position:${course}:${subtopicCode}`;

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

export function loadDeckSession(course: string, subtopicCode: string): DeckSessionState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(deckSessionKey(course, subtopicCode));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed.v !== 1) return null;
    if (!Array.isArray(parsed.order) || !parsed.order.every((x) => typeof x === "string")) return null;
    if (typeof parsed.pos !== "number" || !Number.isInteger(parsed.pos) || parsed.pos < 0) return null;
    const filter = normalizeFilter(parsed.filter);
    if (parsed.filter != null && filter === null) return null; // corrupt filter → discard the session
    if (typeof parsed.at !== "number" || !Number.isFinite(parsed.at)) return null;
    return { v: 1, order: parsed.order as string[], pos: parsed.pos, filter, at: parsed.at };
  } catch {
    return null;
  }
}

export function saveDeckSession(course: string, subtopicCode: string, s: DeckSessionState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(deckSessionKey(course, subtopicCode), JSON.stringify(s));
  } catch {
    // storage full / private mode — the session stays in-memory for this
    // visit; the resume simply won't survive a reload (honest degrade)
  }
}

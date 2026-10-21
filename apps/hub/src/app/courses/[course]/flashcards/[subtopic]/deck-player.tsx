"use client";

/**
 * Flashcard deck player — flip card, Still learning / Know rating, deck
 * progress, shuffle + restart. Ratings always persist to the browser-local
 * SIMULATED overlay (rings, queue); on the pilot course, when signed in,
 * they additionally record to the learner's core account as append-only
 * self-report evidence (tranche 4.4 — lib/flashcard-bridge, never mastery,
 * degrades silently).
 *
 * RATING-CONTROL CITATION, CORRECTED (research pass 5, figure 7): SME's
 * rating controls are ALWAYS visible — including on the card front — as a
 * deliberate rate-before-flip self-testing affordance ("the product trusts
 * the learner to rate honestly rather than forcing answer-then-rate"). THIS
 * PLAYER DEVIATES FROM THAT SOURCE: rating here is reveal-gated (disabled
 * until the back shows). The gating is SyllabAI's own choice (an
 * answer-first anchoring guard), NOT an SME behavior — the earlier "SME:
 * rate after seeing back" comment was a mis-citation of the observed source
 * and is superseded. Re-evaluating the gating itself is a product decision,
 * out of scope for the citation fix.
 *
 * Tranche 4.6: the deck is also where the Ebbinghaus review queue is worked
 * — cards whose rating trail says they are due again carry a badge, and
 * "Review due first" lifts them (stalest due first) to the front of the run.
 * T-C57: the queue is the UNION of this browser's trail and the account's
 * core review-schedule feed (pilot + signed in — lib/flashcard-unified.ts),
 * so a card rated from another device can come due here too. Still timing
 * only — self-report never touches mastery.
 *
 * DC-8 + DC-11 (research pass 5): the player is a session QUERY over the
 * deck, not an atomic deck — a Filters menu combines the card-state family
 * (Not viewed yet / Still learning / Know, plus the due axis) with a
 * deck-internal scope family (card type; SME's per-lesson family has no
 * corpus equivalent — every SyllabAI deck is one sub-topic by construction)
 * and a "Re-run mistakes only" preset (the highest-value default per
 * DC-11's own note). The run position is RESUMED: the device-scoped session
 * state (lib/flashcard-session) survives a reload — the SyllabAI analogue
 * of SME's server-side resume, scoped to THIS DEVICE on purpose, matching
 * the honesty chip's account/device disclosure. Filters persist with the
 * position. The session store is never engagement evidence: a resumed card
 * is not a done card (rings/queue read the overlay, as ever).
 *
 * Filter semantics (snapshot, not live): the filter re-queries the deck
 * when the learner acts on the run's structure (filter change, shuffle,
 * review-due-first, restore) — a rating mid-run never re-filters the run
 * out from under the card being looked at. Deck-wide counters (still
 * learning / know / due) stay unfiltered: the ledger is the ledger, the
 * run is the query.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CalendarClock, ChevronLeft, ListFilter, RotateCcw, Shuffle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Markdown } from "@/components/markdown";
import { rateFlashcard, useCourseProgress, type Course, type FlashcardRating } from "@/lib/progress";
import { unifiedQueue, useCoreReviewSchedule } from "@/lib/flashcard-unified";
import {
  ALL_ON_FILTER,
  countActiveFilterTerms,
  deckSessionKey,
  filterCardIds,
  loadDeckSession,
  mistakesOnlyFilter,
  saveDeckSession,
  validateSessionAgainstDeck,
  type DeckCardFilter,
  type FlashcardCardState,
} from "@/lib/flashcard-session";
import { getToken } from "@/lib/api";
import { isFlashcardSyncCourse } from "@/lib/flashcard-sync-eligibility";
import { submitFlashcardRating } from "@/lib/flashcard-bridge";
import { cn } from "@/lib/utils";

export interface DeckCard {
  id: string;
  front: string;
  back: string;
  sourceNoteId: string | null;
  sourceTitle: string | null;
  provenanceTier: string;
  /** corpus-native card type — the deck-internal scope axis (DC-11); null
   *  where the importer recorded none (bucketed "Unclassified"). */
  cardType: string | null;
}

const STATE_LABELS: Record<FlashcardCardState, string> = {
  "not-viewed": "Not viewed yet",
  "still-learning": "Still learning",
  "know": "Know",
};

const CARD_TYPE_LABELS: Record<string, string> = {
  question_and_answer: "Question / answer",
  keyword_definition: "Key term definition",
  true_or_false: "True or false",
  fill_in_the_blanks: "Fill in the blanks",
};

/** Human label for a scope-family bucket; unknown corpus types render as
 *  themselves (honest), absent types as "Unclassified". */
function cardTypeLabel(t: string | null): string {
  if (t === null) return "Unclassified";
  return CARD_TYPE_LABELS[t] ?? t;
}

export function DeckPlayer({
  course,
  subtopicCode,
  cards,
}: {
  course: Course;
  subtopicCode: string;
  cards: DeckCard[];
}) {
  const progress = useCourseProgress(course);
  const core = useCoreReviewSchedule(course);
  // the run has two layers: baseOrder (the full run order — natural,
  // shuffled, or due-first-lifted) and run (baseOrder with the session
  // filter applied — the cards actually worked through). Filters re-query
  // baseOrder; ratings never do (snapshot semantics — see header).
  const [baseOrder, setBaseOrder] = useState<string[]>(() => cards.map((c) => c.id));
  const [run, setRun] = useState<string[]>(() => cards.map((c) => c.id));
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  // DC-11/DC-8 session state: null = unfiltered (also the pre-hydration
  // shape — SSR renders the natural run, exactly as before this tranche)
  const [filter, setFilter] = useState<DeckCardFilter | null>(null);
  const [hydrated, setHydrated] = useState(false);
  // which deck key the save effect may write for (belt-and-braces against
  // in-place deck changes — the page also keys the player per deck)
  const [savedFor, setSavedFor] = useState<string | null>(null);
  // tranche 4.4 honesty chip: does rating here also record to the account?
  // Read after mount (async so SSR paint stays identical — the server never
  // sees the token), then during-render adjustments are unnecessary: the
  // session token doesn't change while a deck is open.
  const [syncMode, setSyncMode] = useState<null | "account" | "device" | "offline">(null);
  useEffect(() => {
    if (!isFlashcardSyncCourse(course)) return; // not a core-sync course: chip stays hidden (T-C66 — the same predicate the write gate reads, so the chip always tells the truth about where the rating goes)
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) setSyncMode(getToken() ? "account" : "device");
    });
    return () => {
      cancelled = true;
    };
  }, [course]);

  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const deckIds = useMemo(() => new Set(cards.map((c) => c.id)), [cards]);
  const deckKey = useMemo(() => deckSessionKey(course, subtopicCode), [course, subtopicCode]);
  const current = run.length > 0 ? byId.get(run[Math.min(pos, run.length - 1)]) : undefined;
  // T-C57 + T-C61: the rated counts and the schedule read the unified queue
  // (true cross-device trail merge when the raw trail walk completes, else
  // the T-C57 feed union, else this device alone), scoped to this deck's
  // cards — the honest counts a multi-device account sees, self-report only.
  const schedules = useMemo(
    () => unifiedQueue(progress.flashcards, core.source, Date.now()),
    [progress.flashcards, core.source],
  );
  const rated = schedules.filter((s) => s.subtopic === subtopicCode && byId.has(s.cardId));
  const stillLearning = rated.filter((s) => s.rating === "still-learning").length;
  const know = rated.filter((s) => s.rating === "know").length;
  const scheduleById = useMemo(() => new Map(schedules.map((c) => [c.cardId, c])), [schedules]);
  const dueStalestFirst = useMemo(
    () =>
      schedules
        .filter((c) => c.due && byId.has(c.cardId))
        .sort((a, b) => a.dueAt - b.dueAt || a.cardId.localeCompare(b.cardId))
        .map((c) => c.cardId),
    [schedules, byId],
  );

  // the filter's card lookup, bound to the CURRENT schedules for handlers.
  // The restore effect reads the same shape through a ref pinned to the
  // first render (a session restores into the deck as first seen — later
  // core merges are the structural actions' business, not the restore's).
  const lookup = useMemo(
    () => ({
      scheduleOf: (id: string) => {
        const s = scheduleById.get(id);
        return s ? { rating: s.rating, due: s.due } : undefined;
      },
      typeOf: (id: string) => byId.get(id)?.cardType ?? null,
    }),
    [scheduleById, byId],
  );
  const firstLookup = useRef(lookup);
  firstLookup.current = lookup;

  // the deck's scope-family buckets (deterministic; null sorts first)
  const deckTypes = useMemo(() => {
    const set = new Set(cards.map((c) => c.cardType));
    return [...set].sort((a, b) => (a ?? "").localeCompare(b ?? "") || String(a).localeCompare(String(b)));
  }, [cards]);

  /** Rebuild the run from a base order under a filter, holding the given
   *  card when it survives (else restarting at the top). */
  const rebuildRun = (base: string[], f: DeckCardFilter | null, keepId: string | null) => {
    const nextRun = filterCardIds(base, f, firstLookup.current);
    setRun(nextRun);
    const idx = keepId ? nextRun.indexOf(keepId) : -1;
    setPos(idx >= 0 ? idx : 0);
    setFlipped(false);
  };

  const changeFilter = (next: DeckCardFilter | null) => {
    setFilter(next);
    rebuildRun(baseOrder, next, current?.id ?? null);
  };

  const toggleState = (s: FlashcardCardState) => {
    const f = filter ?? ALL_ON_FILTER;
    changeFilter({ ...f, states: { ...f.states, [s]: !f.states[s] } });
  };

  const toggleCardType = (t: string | null) => {
    const f = filter ?? ALL_ON_FILTER;
    const cur = f.cardTypes;
    const nextSet = new Set(cur === null ? deckTypes : cur);
    const isOn = cur === null || cur.includes(t);
    if (isOn) nextSet.delete(t);
    else nextSet.add(t);
    changeFilter({ ...f, cardTypes: nextSet.size === deckTypes.length ? null : [...nextSet] });
  };

  const activeTerms = countActiveFilterTerms(filter ?? ALL_ON_FILTER);
  const activeFilter = filter ?? ALL_ON_FILTER;

  // DC-8 restore: after first paint, pick up this deck's saved session —
  // strictly validated against today's deck (a stale run discards, never
  // hides). SSR render stays card 1 unfiltered; the session lands deferred
  // (the same deferred-setState pattern as the honesty chip above).
  useEffect(() => {
    if (deckIds.size === 0) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      const saved = loadDeckSession(course, subtopicCode);
      if (saved && validateSessionAgainstDeck(saved, deckIds)) {
        const nextRun = filterCardIds(saved.order, saved.filter, firstLookup.current);
        setBaseOrder(saved.order);
        setFilter(saved.filter);
        setRun(nextRun);
        setPos(nextRun.length > 0 ? Math.min(saved.pos, nextRun.length - 1) : 0);
        setFlipped(false);
      }
      setSavedFor(deckKey);
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
    // the restore reads the FIRST-render schedules (firstLookup ref) and
    // runs once per deck — not per schedule tick
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course, subtopicCode, deckIds, deckKey]);

  // DC-8 persist: every structural change and every advance lands in the
  // device-scoped session store (SME persists per rating; the cadence is
  // the point — position is a first-class field, not scroll state). Never
  // throws; a lost save degrades to a fresh run next visit.
  useEffect(() => {
    if (!hydrated || deckIds.size === 0 || savedFor !== deckKey) return;
    saveDeckSession(course, subtopicCode, { v: 1, order: baseOrder, pos, filter, at: Date.now() });
  }, [hydrated, course, subtopicCode, baseOrder, pos, filter, deckIds, deckKey, savedFor]);

  const advance = (rating: FlashcardRating | null) => {
    if (!current) return;
    if (rating) {
      const ratedAt = rateFlashcard(course, current.id, subtopicCode, rating);
      // best-effort core mirror (pilot + signed in only); never blocks the
      // deck — the local overlay already holds the rating. T-C61: the
      // bridge persists the outcome as the entry's sync receipt, the one
      // fact the true cross-device merge uses to exclude the account's
      // copy of this flip (core stamps occurred_at server-side, so
      // timestamps cannot recognize the same event across sides)
      void submitFlashcardRating(
        course,
        current.id,
        rating,
        subtopicCode,
        ratedAt,
      ).then(
        (outcome) => {
          if (outcome.kind === "synced") {
            setSyncMode((m) => (m === "device" ? "account" : m));
          } else if (
            syncMode === "account" &&
            !/signed out|not the pilot/.test(outcome.reason)
          ) {
            // a real negative (core down / unknown anchor) — say it honestly
            setSyncMode("offline");
          }
        },
      );
    }
    setFlipped(false);
    // snapshot semantics: the rating just recorded does NOT re-filter the
    // run (the learner chose this run; the next structural action re-queries)
    setPos((p) => (p + 1 < run.length ? p + 1 : 0));
  };

  const shuffle = () => {
    // deterministic reshuffle so hydration stays stable
    let seed = cards.length * 7919 + 17;
    const arr = [...baseOrder];
    for (let i = arr.length - 1; i > 0; i--) {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      const j = seed % (i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    setBaseOrder(arr);
    rebuildRun(arr, filter, null);
  };

  if (cards.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">This deck is empty.</CardContent>
      </Card>
    );
  }

  if (run.length === 0) {
    // an empty run is always the learner's own filter — say so, hand back
    // the exit (the deck itself is non-empty by the guard above)
    return (
      <Card>
        <CardContent className="p-6 text-sm">
          <p className="text-muted-foreground">No cards match the current filters.</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => changeFilter(ALL_ON_FILTER)}>
            Clear filters
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!current) return null;

  return (
    <div className="space-y-4">
      {/* SME deck header: progress + counters */}
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild size="sm" variant="ghost" className="gap-1.5 text-xs">
          <Link href={`/courses/${course}/flashcards`}>
            <ChevronLeft className="size-3.5" aria-hidden /> All decks
          </Link>
        </Button>
        <span className="text-sm tabular-nums text-muted-foreground">
          {pos + 1}/{run.length}
        </span>
        {syncMode && (
          <Badge
            variant="outline"
            className={cn(
              "text-[10px]",
              syncMode === "account" && "border-success/30 text-success",
              syncMode === "device" && "text-muted-foreground",
              syncMode === "offline" && "border-destructive/30 text-destructive",
            )}
            title={
              syncMode === "account"
                ? "Ratings also record to your account as self-report evidence — they never change mastery."
                : syncMode === "device"
                  ? "Ratings stay on this device — sign in to record them to your account."
                  : "Core unreachable — ratings stay on this device for now."
            }
          >
            {syncMode === "account"
              ? "saved to your account"
              : syncMode === "device"
                ? "local only — sign in to sync"
                : "core unreachable — local only"}
          </Badge>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {dueStalestFirst.length > 0 && (
            <Badge variant="outline" className="border-warn/40 text-[10px] text-warn">
              {dueStalestFirst.length} due for review
            </Badge>
          )}
          <Badge variant="outline" className="border-destructive/30 text-[10px] text-destructive">
            {stillLearning} still learning
          </Badge>
          <Badge variant="outline" className="border-success/30 text-[10px] text-success">
            {know} know
          </Badge>
          {/* DC-11 player filters — a property of the session player, not
              the library page. Checkbox selections keep the menu open (the
              learner composes a query); the preset/clear actions close it. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="gap-1.5 text-xs">
                <ListFilter className="size-3.5" aria-hidden /> Filters
                {activeTerms > 0 && (
                  <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground tabular-nums">
                    {activeTerms}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel>Card state</DropdownMenuLabel>
              {(["not-viewed", "still-learning", "know"] as const).map((s) => (
                <DropdownMenuCheckboxItem
                  key={s}
                  checked={activeFilter.states[s]}
                  onCheckedChange={() => toggleState(s)}
                  onSelect={(e) => e.preventDefault()}
                >
                  {STATE_LABELS[s]}
                </DropdownMenuCheckboxItem>
              ))}
              <DropdownMenuCheckboxItem
                checked={activeFilter.due}
                onCheckedChange={() => changeFilter({ ...activeFilter, due: !activeFilter.due })}
                onSelect={(e) => e.preventDefault()}
              >
                Due for review
              </DropdownMenuCheckboxItem>
              {deckTypes.length > 1 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Card type</DropdownMenuLabel>
                  {deckTypes.map((t) => (
                    <DropdownMenuCheckboxItem
                      key={String(t)}
                      checked={activeFilter.cardTypes === null || activeFilter.cardTypes.includes(t)}
                      onCheckedChange={() => toggleCardType(t)}
                      onSelect={(e) => e.preventDefault()}
                    >
                      {cardTypeLabel(t)}
                    </DropdownMenuCheckboxItem>
                  ))}
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() =>
                  changeFilter({
                    ...mistakesOnlyFilter(),
                    cardTypes: activeFilter.cardTypes,
                  })
                }
              >
                Re-run mistakes only
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => changeFilter(ALL_ON_FILTER)}>Clear filters</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {dueStalestFirst.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5 text-xs"
              onClick={() => {
                // lift the due cards to the front, stalest due first; the
                // rest keep their current run order behind them. The filter
                // re-applies on the rebuilt base — due cards the filter
                // excluded stay excluded (the learner's query is explicit).
                const dueSet = new Set(dueStalestFirst);
                const next = [...dueStalestFirst, ...baseOrder.filter((id) => !dueSet.has(id))];
                setBaseOrder(next);
                rebuildRun(next, filter, null);
              }}
            >
              <CalendarClock className="size-3.5" aria-hidden /> Review due first
            </Button>
          )}
          <Button size="sm" variant="ghost" className="gap-1.5 text-xs" onClick={shuffle}>
            <Shuffle className="size-3.5" aria-hidden /> Shuffle
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="gap-1.5 text-xs"
            onClick={() => {
              setPos(0);
              setFlipped(false);
            }}
          >
            <RotateCcw className="size-3.5" aria-hidden /> Restart
          </Button>
        </div>
      </div>

      <div className="h-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${((pos + 1) / run.length) * 100}%` }}
        />
      </div>

      {/* the card */}
      <Card
        className="min-h-64 cursor-pointer select-none transition-shadow hover:shadow-md"
        onClick={() => setFlipped((f) => !f)}
        role="button"
        tabIndex={0}
        aria-label={flipped ? "Show front" : "Reveal answer"}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setFlipped((f) => !f);
          }
        }}
      >
        <CardContent className="flex min-h-64 flex-col justify-between gap-4 p-6">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="text-[10px]">
              {current.provenanceTier}
            </Badge>
            {scheduleById.get(current.id)?.due && (
              <Badge
                variant="outline"
                className="text-[10px] border-warn/40 text-warn"
                title="Your rating trail says this card is due for review again"
              >
                due for review
              </Badge>
            )}
            <span>{flipped ? "Back" : "Front"}</span>
            {current.sourceTitle &&
              (current.sourceNoteId ? (
                <Link
                  href={`/courses/${course}/revision-notes/${current.sourceNoteId}`}
                  className="ml-auto truncate text-primary underline-offset-2 hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  from “{current.sourceTitle}”
                </Link>
              ) : (
                // UX audit 2026-10-02 #12: no source note → the "from …" used
                // to render as a dead href="#" link (scroll-to-top). A plain
                // span keeps the provenance, drops the dead affordance.
                <span className="ml-auto truncate text-muted-foreground">
                  from “{current.sourceTitle}”
                </span>
              ))}
          </div>
          <div className="flex flex-1 items-center justify-center py-4">
            {flipped ? (
              <Markdown className="text-center">{current.back}</Markdown>
            ) : (
              // fronts carry **bold** key terms + $math$ too (13.7k cards) —
              // render through the corpus Markdown, not plain text
              <Markdown className="text-center" pClassName="text-lg font-medium leading-relaxed">
                {current.front}
              </Markdown>
            )}
          </div>
          <p className="text-center text-xs text-muted-foreground">
            {flipped ? "rate your recall below" : "tap the card to flip"}
          </p>
        </CardContent>
      </Card>

      {/* rating controls — enabled once revealed. DEVIATION NOTE (citation
          corrected, research pass 5 figure 7): SME's controls sit visible on
          the card FRONT (rate-before-flip self-testing); this reveal-gating
          is SyllabAI's own answer-first choice, not an SME behavior. */}
      <div className="grid grid-cols-2 gap-2">
        <Button
          size="lg"
          variant="outline"
          className={cn("border-destructive/30 text-destructive hover:bg-destructive/10")}
          disabled={!flipped}
          onClick={() => advance("still-learning")}
        >
          Still learning
        </Button>
        {/* Know button: bg-success resolves to the theme's action-green
            (SME emerald-700 5.5:1 / QG fern) — WCAG AA on white (P1-4 fix).
            text-success-ink is the copy-on-success token: dark themes ship
            lightened success hues where white text failed AA (audit 2026-10-02). */}
        <Button
          size="lg"
          className="bg-success text-success-ink hover:bg-success/90"
          disabled={!flipped}
          onClick={() => advance("know")}
        >
          Know
        </Button>
      </div>
    </div>
  );
}

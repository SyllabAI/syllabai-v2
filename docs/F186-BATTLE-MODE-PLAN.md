# F-186 — Strength Battle Mode — Build Plan (preregistration of record)

> Lane: F-186 build (operator word "F-186", IM trace `1a168cedec59d1ad`, 2026-10-23). Product
> spec: Kognity Competitive Research Dossier v1.1, **Deep Dive D §8.5 row 5** ("Same bank,
> 3-question / 60-second head-to-head vs classmate or a bot; class brackets for teachers.
> Explicitly a later wave — only after #1–#4 exist, so battles inherit model-drawn sets");
> tracker row **F-186** "Strength Battle mode (3-question / 60-second head-to-head)" (repo
> syllabai-v2, deps F-182 / F-185, Full Stack, Frontend Impl = Yes, Complexity Medium, P2).
> Committed WITH the implementation per the
> #216/#225/#229/#232/DC-4/F182/F183/F184/F185 pattern. Foundation of record:
> docs/F182-DRILL-SURFACE-PLAN.md + docs/F182-DRILL-BUILD-PLAN.md (the bank, the draw policies
> P1..P6, the zero-stakes law), docs/F183-MS-REVEAL-LAW-PLAN.md (the instant reveal — the
> dossier's law 2 covers battles verbatim: "Strength Tests and Strength Battles always show
> your score and solutions once you answer"), docs/F184-DECAY-STRENGTH-* (the strength law the
> battle reading composes), docs/F185-MODEL-DRIVEN-DRAW-PLAN.md (the model-drawn sets battles
> inherit — this lane's named precondition, now landed: v2 PR #332, merge 07c7315145). Nothing
> here re-adjudicates them.

## 1. What this PR adds (the filed lane)

The filed dossier line's final row. The F-185 build receipt names this lane as its successor;
the tracker row's Solution field is the scoping law verbatim: "Same drill bank, 3-question /
60-second synchronous head-to-head vs classmate or a bot; class-bracket mode for teachers;
strictly sequenced after the drill surface and model-driven draw so battles inherit
model-drawn sets." This PR lands the battle mode of record:

1. **The battle law (B1..B8 below)** — `services/drill/battle.ts` (pure) +
   `services/drill/battle-serve.ts` (compose): a battle is a 3-part model-drawn draw at one
   spec-point address over the BATTLE-ELIGIBLE pool, played against the seeded bot opponent
   of record inside a 60-second server clock, settled by a pure projection over the SAME
   immutable rows the drill already writes. Zero new tables, zero migrations, zero new math
   owners.
2. **The wire** — two additive drill-family routes (`POST /drill/battles`,
   `GET /drill/battles/:drawId/settlement`) + additive contracts schemas. The evidence path
   is byte-identical: battle answers ride the UNCHANGED `POST /drill/evidence` seam (same
   immutability, same instant F-183 reveal), which is the point — a battle is the drill's own
   practice log wearing competitive energy, not a second pipeline.
3. **The hub surface (Frontend Impl = Yes)** — `/practice/battle` (page + client + lib): the
   opt-in battle player. The countdown is the client affordance; the server clock is the law.
   Answer, see the examiner's MS instantly (the F-183 reveal), then settle head-to-head.

**What does NOT open here**: live matchmaking and async ghost opponents (need realtime infra
this repo does not have — the residual is §9), class brackets and any leaderboard (the row's
"bracket adoption" metric + ADR-036 k-anonymity posture make this an operator-gated lane —
no leaderboard ships here), any DB migration (a battle draw is a `drill_draws` row of 3
parts — same table, same shape, same recency substrate), any change to the drill draw /
evidence / strengths paths (F-182..F-185 behavior byte-identical; the only touched existing
file beyond routes/contracts is store.ts, which gains ONE additive read method).

## 2. The battle law (B1..B8 — pinned by apps/api/test/drill/battle.test.ts)

| # | Law | Mechanism of record |
|---|---|---|
| B1 | **SAME BANK, SECOND MODE** (dossier law 5) | battles draw from the SAME bank of record through the SAME draw laws — the F-185 model law M1..M8 with the sparse fallback to P1..P6, composed exactly as `drawForLearner` composes them, over the battle-eligible pool at the address with floor BATTLE_SIZE. No second content pipeline, no new bank, no re-adjudicated policy |
| B2 | **THE FORMAT OF RECORD** | BATTLE_SIZE = 3 parts, BATTLE_CLOCK_MS = 60_000 (the tracker row title verbatim: "3-question / 60-second"). The unit is the PART (P1 verbatim); the address is one spine spec-point code (P2 verbatim); the fail-closed floor applies at 3 (P3 verbatim — 409, never a short battle) |
| B3 | **FAIRNESS: ONE DRAW, ONE GRADER, SAME FORMAT** | both sides face the EXACT same part set (the battle draw — not two independent draws), the same 60-second clock, and THE one server-side grading law (`bank.isCorrectChoice`). The battle-eligible pool = choice-gradable parts at the address (non-null choices AND the grading lookup answers for the part) — a head-to-head cannot server-grade a structured part without inventing marks, and the seam refuses to invent marks. Below 3 eligible parts the battle refuses (P3 → 409) |
| B4 | **THE OPPONENT OF RECORD** | the seeded bot: per part, one uniform draw u from mulberry32(draw.seed) over the draw's part order; the bot is credited iff u < BOT_ACCURACY (0.5 — the fair coin); its latency is a second uniform draw in [BOT_LATENCY_MIN_MS 5_000, BOT_LATENCY_MAX_MS 15_000] — always inside the clock by construction (max total 45s < 60s). HONEST DISCLOSURE: this bot is a seeded coin, not a model — the wire names the law ("seeded-coin-v1"); the model-driven bot is the residual behind the same seam. Pure: same (seed, parts) → identical card; reconstructible from the draw audit row (M6 posture) |
| B5 | **THE CLOCK LAW** | the battle start of record = the draw row's `created_at` (the store's own stamp); the deadline = start + BATTLE_CLOCK_MS. An evidence row counts toward the battle iff its immutable write time ≤ deadline — the server clock is the law, the client countdown is the affordance. Over-clock rows stay REAL drill evidence (the strength reading reads them — the zero-stakes law is untouched) but score zero in the battle and are disclosed per-part (`inClock: false`). Settlement closes when every part carries evidence OR the clock expires (`closedBy: "all-answered" \| "clock"`); before either the settlement is 409 live |
| B6 | **THE SCORE OF RECORD** | marks are the currency (the seam's own grading law): a part's marks go to the learner iff their evidence row is server-graded `correct === true` within the clock; the same marks go to the bot iff the bot's coin credits the part. Both correct → BOTH score the part (`wonBy: "split"`) — deliberately NO race: DB write jitter is not a speed skill, and fabricating a finish-order from write timestamps would invent a second truth. Verdict: win / loss / draw by total marks. Text responses on battle parts score zero (correct null — the seam never graded them) while remaining real evidence for the reading |
| B7 | **SETTLEMENT COMPUTED, NEVER PERSISTED (ADR-031 posture)** | the settlement is a pure projection over the immutable draw + evidence rows + the bot law, computed AT READ against the injected `now`, stamped generatedAt, WRITING NOTHING — no battle table exists, none is added; there is nothing to persist because every input is already an immutable row. The settlement carries NO answer key: the bot's labels do not exist (the coin never picks one — B4) and the only reveal facts are the ones the learner's own evidence acks already carried (the F-183 law untouched) |
| B8 | **ZERO STAKES + OPT-IN (P6 + the row's Requirements)** | a battle exists only when the learner POSTs it — no auto-start, no scheduled battle, no gradebook surface, no progress-bearing read beyond the drill's own lane; battles write ONLY the same `drill_draws` + `drill_part_evidence` rows the drill already writes; battle draws enter the P4 recency substrate like any draw (the honest cost of "same bank"). The hub deep-link preselects the address but NEVER auto-starts (the opt-in law, rendered) |

## 3. Policy decisions of record (Q1..Q10, disclosed)

- **Q1 — the battle draw is ONE draw**: both sides answer the same `drill_draws` row's parts.
  Two independent draws (one per "player") would break the fairness law B3 and double the
  recency cost. The draw row's 3 parts ARE the battle card.
- **Q2 — battle-eligible = choice-gradable** (B3): `contentOf(partId).choices` non-null AND
  `isCorrectChoice(partId, firstLabel) !== null` (null means not-MCQ or no flagged choice —
  the bank's own vocabulary). No bundle change: the census of record is untouched; the
  eligible pool is a runtime filter over the existing pools, and the real-bundle pin in
  battle.test.ts proves the strongest address carries ≥ 3 eligible parts.
- **Q3 — BOT_ACCURACY = 0.5**: the fair coin. Not "easy", not "hard" — the opponent of record
  is a calibration-neutral sparring partner. The 5M-battle dossier row credits engagement to
  the format, not to opponent strength; a tunable bot (or a model-driven one) is a residual
  behind `botCard`'s seam.
- **Q4 — the bot's latency band [5s, 15s] per part**: total ≤ 45s < 60s, so the bot always
  finishes inside the clock (B5's "bot unopposed" case is well-defined). The latency is
  DISCLOSED per part in the settlement but is NOT a race input (B6 — no race; it is the
  opponent's card flavor, and the honesty proof that the bot played within the clock).
- **Q5 — the settlement gate is (all-answered) OR (clock expired)**: a learner who answers
  all 3 parts in 20 seconds gets the result immediately; the clock path exists so an
  abandoned battle still settles (unanswered parts score zero against the bot's coin — the
  bot plays every part by construction). Before either → 409 (the drill's P3 posture family).
- **Q6 — no answer key in the settlement** (B7): per-part the settlement carries the
  LEARNER's own graded facts (already revealed at answer time), the BOT's verdict
  (correct + latency), the winner, and the over-clock disclosure — and nothing else. The
  reveal law stays where F-183 put it: riding the evidence ack, post-attempt.
- **Q7 — wire churn is additive only**: two new routes on the drill router (same authz shell,
  same binding law, same error mapping), new contracts schemas
  (`battleStartRequestSchema`, `battleOpponentSchema`, `battleStartResponseSchema`,
  `battleSettlementPartSchema`, `battleSettlementResponseSchema`) — no existing schema or
  route changes; the drill draw/evidence/strengths behavior is byte-identical.
- **Q8 — no DB migration**: the battle draw is a `drill_draws` row (3 part ids — the shape
  already accepts any count; `recordDraw` is untouched); battle evidence is
  `drill_part_evidence` rows (provenance 'DRILL', the same lane). The store gains ONE
  additive read (`evidenceForDraw(drawId, learnerId)`) — a SELECT on the drill's own table.
  A battle-kind column is unnecessary: a battle IS a 3-part draw and only the battle route
  draws 3 (the settlement's discriminator, pinned).
- **Q9 — the recency cost is real and disclosed**: battle draws enter the P4 recency window
  like drill draws (same-bank law B1). A battle today consumes fresh-pool coverage at the
  address; the pin in routes asserts the battle path's SQL stays inside the drill lane.
- **Q10 — the opponent seam is the upgrade path**: `botCard(seed, parts)` is the ONLY bot
  in this lane; a reading-informed bot (the F-185 reading's own strength projection picking
  the coin) swaps in behind the same signature without touching the settlement law.

## 4. The seams (what composes, what stays)

- **`services/drill/battle.ts` (NEW)** — the pure law: constants of record (BATTLE_SIZE 3,
  BATTLE_CLOCK_MS 60_000, BOT_LAW, BOT_ACCURACY 0.5, BOT_LATENCY_MIN/MAX_MS),
  `botCard`, `settleBattle` + the settlement shapes. No store, no sql, no clock (now is an
  argument — the ADR-031 posture).
- **`services/drill/battle-serve.ts` (NEW)** — the compose: `drawForBattle` (eligible pool →
  sparse? random law : model law, floor 3 → recordDraw → the start outcome with opponent +
  clock) and `settlementForLearner` (ownership-scoped draw → battle discriminator →
  evidenceForDraw → the live gate → settleBattle). Reuses `learnerReading`/`sparseState`/
  `modelDrawForReading`/`drawForAddress`/`RANDOM_SELECTION` untouched.
- **`services/drill/store.ts`** — ONE additive read: `evidenceForDraw(drawId, learnerId)` (the
  same projection shape as `evidenceForCourse`, draw-scoped). Nothing else.
- **`services/drill/serve.ts`** — `partViewOf` exported (was module-private) so the battle
  compose renders identical part views; zero behavior change.
- **`routes/drill/index.ts`** — `POST /battles` + `GET /battles/:drawId/settlement` on the
  existing router (same authz shell, same binding law, same onError mapping; the settlement
  resolves the bank AFTER draw ownership like /evidence does).
- **`packages/contracts/src/drill.ts`** — the five additive battle schemas (Q7).
- **Hub (Frontend Impl = Yes)**: `src/lib/battle.ts` (NEW wire layer, the lib/drill.ts
  posture verbatim: null on any failure, honest empty states), `src/app/practice/battle/
  page.tsx` + `client.tsx` (NEW: opt-in picker reusing the drill addresses, the countdown
  player, the settlement view; answer flow reuses `postDrillEvidence` UNCHANGED so the
  instant MS reveal covers battle parts verbatim), `src/app/courses/[course]/strengths/
  strengths-panel.tsx` (+1 additive link beside the drill CTA).
- **Bank, census, draw, model-draw, strength, reveal, method-credit-agreement: UNTOUCHED.**

## 5. The corpus substrate (measured on the real bundle of record)

The battle runs over the F-182 census of record (unchanged by this PR — the anti-drift pin
stays green): 3928 eligible parts, 182 spine addresses, 157 drillable. The battle-eligible
filter (Q2) narrows each pool to choice-gradable parts, and the REAL numbers are part of
this plan: **443 battle-eligible parts course-wide; 68 of the 157 drillable addresses are
battle-ready** (≥ 3 eligible parts). The drill's flagship address 4CH1-1.25 carries exactly
**2** choice-graded parts in its 155-part pool — the battle REFUSES there (P3 → 409), the
fail-closed law demonstrated on the real bank and pinned as such: battles are honest about
where the head-to-head can be server-graded, and the hub renders the refusal as the
"fewer than three battle-eligible parts" state rather than a thinner battle. The strongest
battle-ready address is **4CH1-1.16 (70-part pool, 14 eligible)** — the integration pin
settles a real battle card there. Zero new tables, zero new columns, zero backfills, zero
content changes; expanding the choice-graded subset is a content-wave concern, not a
battle-law concern.

## 6. The validation metrics of record (tracker F-186) and their posture

- "Battles per active learner" / "opt-in rate" — **instrumentation posture**: every battle is
  an explicit POST (the opt-in law), and the battle draw is a disclosed `drill_draws` row;
  volume measurement is a later read over the audit trail the lane already writes. Not
  claimed here.
- "Bracket adoption by teachers" — **out of scope** (brackets are the class-bracket lane,
  ADR-036-gated; see §9). No teacher surface ships here.
- "3-question / 60-second" — **structural pins**: BATTLE_SIZE/BATTLE_CLOCK_MS constants +
  the fail-closed floor + the server clock law, all battery-pinned.

## 7. Battery of record (all green on this branch, pre-push)

- `bun run typecheck` (contracts/shared/db/api): **0 errors**; hub `tsc --noEmit`: **0**
- `bun test apps/api packages`: see the receipt JSON for the exact census at push time — the
  baseline of record at the battery base afbfcfb450 was 2788 pass / 13 skip / 0 fail
  (150 files); the battle battery adds the pins enumerated in §8
- `golden/retrieval-eval`: **22 pass / 0 fail** + **19/19 selftest vectors**; golden
  `--selftest` **OK**
- zero-core census gate: **GREEN** (the battle wire rides the v2 drill route family; no core
  route family touched)
- census anti-drift pin: green (census-of-record.json consumed, never recomputed; no census
  surface touched)

## 8. The pin map (what the battery asserts)

- `test/drill/battle.test.ts` (NEW): the format constants (B2); bot determinism + the fair-
  coin band over 400 coin flips + latency bounds < clock (B4); hand-computed golden bot card
  for the fixed seed 20261023; the clock law (in-clock / over-clock / unanswered, B5); the
  score law (split / learner / bot / neither, marks currency, no-race split, B6); verdicts;
  purity (same inputs → identical settlement; no input mutation; generatedAt === now, B7); the
  no-answer-key shape (no label anywhere); the REAL-bundle numbers of record: 443 eligible
  parts course-wide, 68 battle-ready addresses, 4CH1-1.25's 2-eligible refusal (the real
  fail-closed pin), and one real-pool battle card settled end-to-end at 4CH1-1.16.
- `test/drill/routes.test.ts` (+ battle describe): authz shell 401 on both new paths; 201
  start (contracts-parsed, opponent + clock disclosure, parts are the eligible MCQ subset,
  no answer facts); below-floor 409 (a 2-eligible-part address); unknown address 404;
  settlement 404 (unknown/foreign), 409 not-a-battle (a 5-part draw), 409 live, 200
  all-answered (hand-computed verdict), 200 clock-closed (bot unopposed), the zero-stakes
  SQL posture (every battle-path query stays on the drill lane; non-vacuous shell).
- `packages/contracts/src/drill.test.ts` (+ battle pins): schema round-trips + the wonBy /
  closedBy enums + opponent-kind rejection.

## 9. Non-goals & residuals (disclosed)

- **Live matchmaking / async ghost opponents** — the row's "vs classmate" arm. Needs realtime
  infra (or a ghost-replay design with its own privacy ruling) that this lane does not
  invent; the bot arm is the opponent of record. The settlement/seam design takes a
  second participant as a future opponent card (the opponent shape is a discriminated-union
  ready to grow a "classmate" kind).
- **Class brackets + any leaderboard** — the row's teacher mechanic. A leaderboard over
  learners is ADR-036 territory (k-anonymity research rule — the row's own "leaderboard
  posture must respect the k-anonymity research rule") and an operator-gated design; NOTHING
  leaderboard-shaped ships here, not even a per-address high score.
- **The model-driven bot** (Q10) — the seeded coin is the honest v1 opponent; the reading-
  informed coin swaps in behind `botCard`.
- **No battle-kind column** (Q8) — the 3-part discriminator is pinned; if a future lane ever
  draws 3-part drill draws (it has no reason to), the column lands then, with the journal.
- **Timed-reveal nuance** — the reveal rides each answer ack exactly as the drill's does
  (dossier law 2 covers battles verbatim); no post-settlement reveal pass exists because
  nothing new is revealed at settlement (Q6).

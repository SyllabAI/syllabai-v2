# T-MIG-068 merge + proof receipt — seeded-posture port parity, the remaining band

Operator-fired (IM trace `1a10fd303bbe4f49`, message "T-MIG-067"). Executed by r0r6 (Super Z main
agent) under R0 arbitration ruling2's re-claim clause ("the claiming lanes claim here"); the CARD is
r0-claimed @ `8516d25` (operator trace `1a10fe65d9d64f3d`), whose claim note names the
operator-fired implementation PR as the desk merge of record. This receipt: the race chain, the
merge of record, the gates, and the live-instrument proof.

## 1. Race chain of record

| t (UTC) | event |
|---|---|
| ~06:14Z | r0r6 executes the fired band as T-MIG-067 on branch `t-mig-067/r0r6` @ `33f9983`; PR #109 opened |
| ~06:2xZ | **R0 arbitration ruling2** (`c78ed9a`): 067 stays with the earliest-claim RICH-200-D fix (#107, `cdce05e`); the triage umbrella mechanically refiled as **T-MIG-068** — "the claiming lanes claim here" |
| 06:2xZ | r0r6 closes #109 concurrent-of-record (overlap audit in the close comment: the only overlap, `servable.ts`, was law-identical), re-branches `t-mig-068/r0r6` (questions lane DROPPED per the 068 fence), rebases, gates green, opens **PR #110** |
| ~06:3xZ | r0 claims the 068 CARD on main (`8516d25`), noting "sole open PR #109 = operator-fired trace 1a10fd303bbe4f49 implementing this card; r0 claims the card AND takes #109 through the review/merge desk" |
| 06:45Z | r0r6 merges **#110 of record → `3e4e22c`** (gates at head `9ef8f6b`: typecheck ×4, **1380/0/13skip/5580**, selftest OK) |
| ~06:47Z | the desk REOPENS and merges **#109 → `e760bdc`** (its scan predated the close); overlapping files resolve to the merged #110 bytes — the two PRs were content-identical on every shared file except the card yaml (dropped on the 068 branch) and the servable fence (resolved to main of record per r0's intake note). Net: a convergence, not a divergence |
| ~06:49Z | r1's independent 067/RICH-200-D implementation **YIELDS of record** (`33e281f` addendum): "same two root causes corroborated first-hand against the merged #110 (3e4e22c), which also caught the third DATE site (state.ts examSeriesByIds) this lane missed" — independent corroboration of the band's diagnosis |

## 2. The six divergences — root causes and fixes (all live-proven, §3)

| case | root cause (first-hand, run #11 boot log + frozen source) | fix |
|---|---|---|
| teacher-curriculum-versions-teacher-200 (500) | the `${""}` comment interpolation inside the sql template renders a bind param — Postgres received `"$1\n select n.validation_status…"` → 42601 "syntax error at or near $1" **position 8** (leading newline+indent) | `services/curriculum/review.ts`: comment moved out of the template; bind-slot-law comment in place |
| w4-target-series-put-201 (500) | pg drivers parse `date` columns into JS `Date`; `courseExamTargetView` passed the raw Date into `daysBetween` → `TypeError: toIso.slice is not a function` (daysBetween:257 via courseExamTargetView:849) | `services/learner-model/exam-target-reader.ts`: `wireDate()` seam helper normalizes Date\|string → bare date BEFORE countdown arithmetic and wire |
| w4-exam-series-qualification-filter-200 (200/DATE) | Date object serialized as `2026-10-08T00:00:00.000Z` vs the core's LocalDate passthrough `2026-10-08` | `toExamSeriesView` (learner-me) + `examSeriesByIds` (learner/state.ts — the site the r1 lane had missed) render the four DATE fields via wireDate; `entryDeadlinePassed` now compares normalized strings |
| w4-exam-series-seeded-calendar-200 (200/DATE) | same | same |
| w3-attempt-missing-fields-400 (envelope) | the replay harness serves the "empty body" capture as `{}` JSON; runs #9/#11 pin the core's answer: `malformed_body`/"request body is not readable (check field types and enum values)" (GlobalExceptionHandler.java:175-180 @ 6cad6ef); the port's "missing binds, @NotNull fires" reading produced `validation_failed` | `routes/assessment/index.ts` two-envelope classifier: absent-required (invalid_type/undefined) = **binding** → malformed_body; null-received stays the @NotNull constraint path (validation_failed); bad-uuid + range pins untouched |
| w3-attempt-structured-missing-fields-400 (envelope) | same | same |

Scope note (ratify-at-merge per r0's claim note "services/** touches map 1:1 onto the card's
divergence rows"): the card lettered routes/** + shared/**; the defects live in
`services/{curriculum,learner-model,learner-me,learner}/**` (thin-delegated routes; no `src/shared/`
exists in apps/api) + `routes/assessment/index.ts` + test/**. Fences honored: zero questions-lane
files, zero golden/**, packages/db/**, apps/hub/**, frozen repos.

## 3. Live-instrument proof (dispatch run 37425696004 @ merged main `3e4e22c`)

**Union verdict 142/177** (seed 129/162, prod 13/15) — **+5 vs run #11's 137/177 (40 → 35 divergences)**.

- `teacher-curriculum-versions-teacher-200` — **PASS** (absent from the failure list)
- `w4-exam-series-qualification-filter-200` — **PASS**
- `w4-exam-series-seeded-calendar-200` — **PASS**
- `w3-attempt-missing-fields-400` — **PASS**
- `w3-attempt-structured-missing-fields-400` — **PASS**
- `w4-target-series-put-201` — **200 vs 200** (the 500-class case is RETIRED); residual body diff is
  CLOCK-DRIFT ONLY: `daysToWindowStart 2 vs 3`, `daysToWindowEnd 24 vs 25` — the capture's frozen
  countdown was derived from the capture-day clock; the live read derives from today (ADR-031 law:
  derived is recomputed, never stored). Corpus-side: the case's tolerate[] needs the two derived
  countdown fields (or a capture-anchored pin) — CASE-OWNER amendment, not port work.
- The two w3-questions cases (067's) both 200 vs 200 at this head with their known corpus-side
  residuals (RICH-200-E families tie-order multiset-identical; topics staged-census 6/5 vs 4/4) —
  unchanged, case-owner lanes own them.

## 4. Gates of record (independently corroborated)

- At head `9ef8f6b` (PR #110): typecheck ×4 exit 0; **1380 pass / 0 fail / 13 skip / 5580 expect /
  73 files**; `bun golden/runner.ts --selftest` OK.
- Reconciliation vs the ratified law: cdce05e 1332/4558 → #108 +41/+1000 (1373/5552-5558 run-variance)
  → **#110 +7 tests/+28 pins → 1380/5580** — matched first-hand by R4b-ROUND-19's merged-tip
  corroboration ("RECONCILIATION EXACT"). Count-slip note: the 9ef8f6b commit message says "Tests +8"
  where the PR body says +7 — net gates identical; the slip is the null-still-binds pin counted
  against the replaced test.

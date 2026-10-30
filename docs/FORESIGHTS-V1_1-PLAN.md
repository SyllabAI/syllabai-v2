# FORESIGHTS-V1_1-PLAN — the context-enrichment amendment tranche (ADR-CLASS-0003)

| | |
|---|---|
| **Status** | EXECUTED (trace `1a18bd4b7d542cc1` operator go: "Go: one mini-ADR amendment tranche") — single tranche: contracts + service + api battery + hub panel + goldens; zero route bytes (the route serializes the view verbatim, so the T-MIG-053 t2 route-separation doctrine does not apply — disclosed call); zero DB contact (fakeSql + static renders only) |
| **Task** | T-FORESIGHT-V0-PLAN-1 (Stage C menu: SC-3a + §11.2), trace `1a18bd4b7d542cc1` |
| **Date** | 2026-10-30 |
| **Design law** | ADR-CLASS-0003 (the v1.1 amendment) on top of ADR-CLASS-0002 |
| **Basis** | `docs/FORESIGHTS-V0-PLAN.md` (the v0 plan of record); `apps/api/src/services/teacher/foresights.ts` (Stage A/B service of record); `packages/contracts/src/teacher.ts` Foresights-v1 block; `apps/hub/src/app/teacher/classes/[id]/knowledge-graph/foresights-panel.tsx` + its goldens |

## 1. Scope (one tranche, one PR)

The two ADR-CLASS-0003 decisions, end to end:

1. **D1 evidence recency** — `lastPracticedAt: string | null` on
   `ForesightsPrerequisiteCellView` AND `ForesightsContextChainRow`.
2. **D2 at-risk reason breakdown** — `atRiskByReason` (three fixed keys, always
   present) inside `ClassForesightsView.distribution`.

Policy marker stays `foresights/v1` (D1/D2 are additive context — the
derivation, decision tables, thresholds, headline and disclosure are
byte-unchanged). No route bytes. No DB. No new reads (the batching law is
re-pinned: 1× skill_states, 1× misconception_states).

## 2. Wire changes (packages/contracts/src/teacher.ts)

- `foresightsPrerequisiteCellViewSchema` gains `lastPracticedAt:
  javaInstantSchema.nullable()` — the most recent roster `last_practiced_at`
  on that node, `null` when unmeasured (the honesty law of
  `meanEffectiveMastery: null`, extended).
- `foresightsContextChainRowSchema` gains the same field, same law (symmetric,
  free — Query A already covers the chain scope).
- `classForesightsViewSchema.distribution` gains `atRiskByReason: z.object({
  LOW_MASTERY_PREREQ: int, ACTIVE_MISCONCEPTION_PREREQ: int,
  LOW_MASTERY_AND_ACTIVE_MISCONCEPTION_PREREQ: int })` — keys always present,
  `sum === distribution.atRisk` (test-pinned).
- Schema doc-comments cite ADR-CLASS-0003 (context only, never influence; C6:
  no staleness threshold is invented — the raw instant is exposed, the reader
  judges).

## 3. Service changes (apps/api/src/services/teacher/foresights.ts)

- After Query A: fold `lastPracticedByNode: Map<nodeId, Date>` = max
  `last_practiced_at` over the returned rows (Query A is roster-scoped by
  construction, so the max is over this class's enabled members only — the
  independent-student rule inherits the query's scope).
- Direct cells + context rows serialize `lastPracticedAt:
  lastPracticedByNode.get(id)?.toISOString() ?? null`.
- `atRiskByReason`: fold `learnerRows` where `state === "AT_RISK"` by reason
  (zeros-initialized fixed keys; `UNMEASURED_PREREQ` cannot appear — the §5
  table makes NOT_ASSESSABLE a different state — and the fold guards it away
  type-safely regardless).
- Zero new constants (C6 receipt: the diff adds no numeric literal).

## 4. Test battery changes (apps/api/test/teacher/foresights.test.ts)

Updated pins (the two exact-object `toEqual`s of record):

- "empty roster" — `distribution` gains `atRiskByReason: { …: 0 }` zeros.
- "the context chain" — the depth-2 row gains `lastPracticedAt: null`.

New `foresights/v1.1 amendment (ADR-CLASS-0003)` describe block:

1. **Recency on the cell:** two roster rows on SP1 with different dates →
   `cell.lastPracticedAt` = the MOST RECENT instant (max, not first-seen).
2. **Honest null:** the UNMEASURED fixture → `lastPracticedAt: null`, no date
   fabricated.
3. **Context-only law with evidence:** a skill row on the depth-2 SUB node →
   the context row's `lastPracticedAt` renders, AND the class state does not
   move (context evidence never classifies).
4. **Reason breakdown + sum invariant:** a fixture with one BOTH-reason and one
   LOW_MASTERY-reason AT_RISK learner → `atRiskByReason` matches the learner
   rows exactly and `sum === distribution.atRisk`.
5. **Zero-read receipt:** the batching test unchanged and green (still 1×
   skill_states / 1× misconception_states — D1 costs no query).

## 5. Hub changes (the §8 layout order law holds — no new section)

- Prerequisite chip (section 3): measured cells append a recency line
  `· last practiced YYYY-MM-DD` (a pure `slice(0, 10)` of the wire ISO string —
  zero `Date`/locale math, so the static renders stay deterministic);
  unmeasured cells render no recency line (nothing to say).
- Attention-queue header (section 4): when `distribution.atRisk > 0`, a second
  header line renders the breakdown in the same plain-language vocabulary —
  "N below the ready line only · N active misconception only · N both" — zeros
  included so the three-way shape is always legible.
- No re-sort, no chart, no headline/disclosure change; `types.ts` re-exports
  flow from the contracts automatically.

## 6. Golden extensions (foresights-panel.golden.test.tsx)

- Fixtures gain the new fields through `classForesightsViewSchema.parse` (the
  goldens still capture the real wire).
- New pins: the recency line renders on a measured chip with the exact date
  slice; the NOT_ASSESSABLE render contains NO "last practiced" text anywhere
  (all cells unmeasured); the AT_RISK render carries the breakdown line with
  the fixture's counts; the READY render carries none (atRisk = 0); the
  determinism double-render still byte-identical.

## 7. Gates

contracts typecheck; api typecheck; foresights battery (18 existing + 4 new)
+ FULL suite (the 3063-pass floor, now +4); hub tsc; v2-surface 34/34; hub
goldens 14/14 → 14 + new pins; `next build` if disk allows (the corpus prebuild
is the long pole; the ENOSPC ceiling class is disclosed if hit). Zero DB
contact throughout (Neon outage window untouched; auto-resume 2026-11-01T00:00Z).

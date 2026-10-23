# F-184 — Decay-Driven Strength Surface — Opening Plan (preregistration of record)

> Lane: F-184 opening (operator line "the filed dossier line is F-184 (decay strength,
> ADR-031 computed-never-persisted) → F-185 (model-driven draw + method-credit agreement
> measurement) → F-186 (battle wave)", IM trace `1a167ba6542964b1`, 2026-10-23). Product spec:
> Kognity Competitive Research Dossier v1.1, **Deep Dive D §8.3 (law 3) + §8.5**; tracker row
> **F-184** ("Decay-driven strength surface (mastery bar with computed decay)", P1, Wave 3 -
> Tutor & Diagnostic Intelligence, Cycle 2+, repo syllabai-v2, deps F-137 / F-159 / F-169 /
> F-033). Committed WITH the implementation per the #216/#225/#229/#232/DC-4/F182/F183 pattern.
> Foundation of record: docs/F182-DRILL-SURFACE-PLAN.md + docs/F182-DRILL-BUILD-PLAN.md (the
> address space and the evidence seam) and docs/F183-MS-REVEAL-LAW-PLAN.md (the drill-mode
> reveal law) — nothing here re-adjudicates them. The F-183 tracker note ends: "Next per the
> filed dossier line: F-184 decay strength -> F-185 model-driven draw -> F-186 battle wave."

## 1. What opens here (and what does not)

**Opens**: the read-only foundation of the decay-driven strength surface — the **strength law**
as pure code (per-address mastery anchor + ADR-031 read-time decay + honest bands + the
practice-now queue projection) and the pin battery that holds it to the evidence seam and the
drill census of record. Deliberately *not yet* a learner-facing feature: no endpoint, no zod
contracts churn, no DB object, no UI. The build PR (next on this line) adds the strength route
+ the learner-overview surface under these pinned shapes.

**Filed spec being implemented (dossier §8.5 row 3 / tracker F-184, verbatim)**: "Per-spec-point
strength display driven by learner state + computed decay (ADR-031: decay computed, never
persisted); the bar honestly falls as skills decay and doubles as the practice-now queue at
decaying addresses." Requirements of record: ADR-031 decay engine; spec-point learner overlay;
explicit bar-semantics documentation; **no engagement-only component**.

**Dependency posture (first-hand at open)**: F-137 (Learner State Model), F-159 (Ebbinghaus
Decay Job), F-033 (Student Proficiency Overlay) are `Not Started` rows and F-169 (Spec Graph &
Learner Overlay) is `Planned` — but their *substance* already exists in v2: the decay math of
record is `services/learner-model/decay.ts` + `packages/contracts/src/decay.ts` (the frozen-core
port, T-MIG-038/041/042/066 lanes, ADR-031 anchor law verbatim in both headers), and the
per-address learner substrate is the F-182 build's `drill_part_evidence` table (the F-055-shaped
seam). This lane **composes** those surfaces under one strength law; it does not adjudicate the
stale rows — disclosed, not resolved, exactly as the F-182 opening disclosed F-028/F-049/F-055.

## 2. The substrate (grounded, first-hand at open)

- **The one decay-math owner**: `apps/api/src/services/learner-model/decay.ts` —
  `decayedMastery(P0, lastPracticedAt, now, params)` = `P0 · e^(−t/τ)` with **τ frozen on the
  anchor's band** (30/90/365 days by LOW/DEVELOPING/SECURE at P0), floor 0.1, recomputed from
  the stored anchor on every call and never persisted; `bandOf` (0.45 / 0.8 thresholds). This
  opening imports it and adds **zero new decay math** — one owner, many surfaces.
- **The parameters of record**: `LEARNER_DECAY_PAPER_DEFAULTS` (τ 30/90/365; lowBandCeiling 0.45;
  highBandFloor 0.8; floor 0.1; reviewBelow 0.6) — Master Spec §11 Paper B, mirrored in
  `packages/contracts/src/decay.ts`. Pinned in the battery.
- **The evidence seam**: `drill_part_evidence` (migration 0010) — immutable rows keyed
  (learner, course, code, part) with `marks_awarded` / `marks_possible`. The seam's grading law:
  MCQ server-graded (`marksAwarded = correct ? marks : 0`); structured rows recorded **UNGRADED**
  (null — the server refuses to invent marks; the learner self-checks against the F-183 reveal).
- **The address space**: the drill census of record (`services/drill/census-of-record.json`,
  F-182 opening) — 182 spine SPEC_POINTs, 171 covered, **157 drillable**; the bar exists only
  where the drill ships (anchor-law adjacency).

## 3. The laws (S1..S6 — pinned by apps/api/test/drill/strength.test.ts)

| # | Law | Mechanism of record |
|---|---|---|
| S1 | **ANCHOR** — P0 is the marks-weighted mean of graded evidence | `Σ marksAwarded / Σ marksPossible` over rows with `marksAwarded != null` (exactly the server-graded MCQ rows); impossible rows (awarded > possible, negative) fail closed |
| S2 | **DECAY-AT-READ (ADR-031)** — strength = `decayedMastery(P0, lastGradedAt, now)` | the one owner's law verbatim; τ frozen on the anchor's band; floor 0.1; computed per call, **never persisted** (no strength table exists — this opening adds none); `now` is an explicit argument (no clock in the module) |
| S3 | **HONEST BANDS** — the bar re-bands on the decayed value | `bandOf(strength)` in the learner-model vocabulary; the semantics of record are the `BAR_SEMANTICS` strings (mastery × decay, not-a-grade); **no engagement counter anywhere** (the replaced overlay's "engaged %" fill is the named anti-pattern) |
| S4 | **HONEST NULL** — absence degrades visibly, never fabricates | zero graded evidence at an address → no bar (null); ungraded structured evidence is disclosed as a count and contributes nothing to mastery; unexplored addresses never masquerade as decaying ones |
| S5 | **PRACTICE-NOW QUEUE** — the same strengths feed the queue | evidence-bearing addresses with strength < reviewBelow (0.6), weakest first (strength asc, code asc tie-break), capped at 10 (`QUEUE_SIZE`); deterministic end to end |
| S6 | **ZERO-STAKES / NO-WRITE + ADJACENCY** — the bar rides the drill's address space | the module takes no store, no SqlFn, writes nothing, emits no gradebook event, reads no progress-bearing surface; its address space is the census's drillable set (157 of record) |

## 4. Policy decisions of the opening (each pinned by test)

- **Q1 — the anchor is marks-weighted, not a mean of means.** `Σ awarded / Σ possible` keeps a
  5-mark structured part from outweighing five 1-mark MCQs merely by count; weighted marks are
  the honest unit the seam already records.
- **Q2 — graded-only anchor.** Structured rows stay ungraded by the seam's own law; fabricating
  self-check numbers into mastery would corrupt the anchor. The BKT upgrade path (F-185/F-137)
  replaces the anchor derivation later without touching the decay law — the decay owner is
  untouched by construction.
- **Q3 — the decay clock is the latest graded evidence.** One address, one clock: the anchor is
  the post-practice posterior and `lastGradedAt` is its practice time (ADR-031's P₀ + t
  vocabulary). Clock skew (gradedAt in the future of `now`) shows the full anchor — the owner's
  law, pinned.
- **Q4 — the displayed band re-bands on the decayed value.** τ is frozen on the *anchor's* band
  (ADR-031 wording) while the *displayed* band reads the decayed strength — a SECURE anchor can
  honestly display as DEVELOPING as it decays. Both halves pinned in one conformance case.
- **Q5 — the queue is evidence-gated and capped.** Unexplored addresses are not "decaying" —
  they never enter the practice-now queue (the drill address picker already owns discovery);
  the cap keeps the queue a habit-sized surface (the Kognity 5-question posture, scaled).
- **Q6 — course scoping stays with the caller.** Evidence rows are (course, code)-keyed; the
  pure layer is code-keyed. The build PR scopes per course exactly as the drill routers do.

## 5. Battery of record (this PR)

`bun run typecheck` (contracts/shared/db/api) · `bun test apps/api packages` (the strength pins
ride the standard suite) · zero-core census gate unchanged (no surfaces touched — the PR is
additive: 1 module, 1 test file, this plan, receipt, worklog append; no census regeneration —
the census of record is consumed, not recomputed).

## 6. The line after this opening (the filed dossier line)

1. **F-184 build PR**: the strength route (read-only projection over the evidence seam) + the
   learner-overview surface (the strength-bar position Kognity validated) rendering
   `BAR_SEMANTICS` verbatim + the practice-now queue linking into drill draws.
2. **F-185**: model-driven draw (BKT/decay-informed selection; sparse-state fallback = the
   F-182 opening's random draw) + the method-credit agreement measurement consuming the F-183
   acks — the operator's line names it F-185's title.
3. **F-186**: Strength Battle (3Q/60s head-to-head) on the same bank, strictly after F-185.

## 7. Residuals (honest)

- The anchor is a marks-weighted posterior, **not BKT** — the filed BKT engine rows (F-137/
  F-138/F-139) are the research lanes' titles; this opening builds the honest substrate they
  will replace, and says so on the bar's semantics.
- No endpoint exists yet; nothing here is reachable by a learner. Until the build PR lands, the
  strength law is pinned code with zero runtime surface.
- Multi-course strength (the evidence table carries course) is a build-PR projection decision;
  the law of record is per-address and course-agnostic.
- The 11 uncovered + 14 thin addresses remain the corpus-growth queue (F-182 residuals verbatim);
  the bar inherits exactly the drill's address space, no more.

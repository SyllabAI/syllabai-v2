# DC-3 — Re-Attempt Entitlement: Plan of Record and Dated Preregistration

**Status:** preregistered claim-first (this commit); mechanism implemented behind the
five-gate merge discipline; **merge operator-gated**.
**Date:** 2026-10-22 (lane opened 2026-10-21, trace `1a1608f0c92a0349`).
**Lane:** DC-3 (P1 of the DC roadmap); sibling lanes of record: DC-1 (#273, merged),
DC-2 (#269 v14, merged), DC-6 (phases 1→3c, merged).

## 0. Provenance and recovery receipt

The spec of record was LOST in a sandbox reset (the 5th) and RECOVERED from the
operator-provided GitHub source (trace `1a161583f72832d5`,
`nawaf-al-hussain/FileUpload` → `SME-Research/`):

- `SyllabAI-SmartChat-Mark-Design-Spec.docx` — **sha256 `0da8044a0667a47c684d4b0486784be02bc4992546eca2ec2946043e9e2b287a`**
  — matches the recorded prefix `0da8044a` EXACTLY (byte-verified at download).
- §3.3 "DC-3 - Re-Attempt Economics" is the law of record; full-text extraction and
  the §DC-3 section extract are kept outside the repo at
  `download/recovered-spec/` (operator side) with `SHA256SUMS`.
- Authorship of record: "Design Specification - Task 48", SyllabAI Research,
  2026-10-19, grounded at v2 main `26d98da`.

## 1. The law of record (spec §3.3, quoted faithfully)

> **Decision.** SyllabAI meters the SECOND AI mark of a part, not the first. The
> first mark teaches the learner what the feedback feels like; the improvement
> loop — answer, read feedback, try again — is where willingness to pay
> concentrates, and it is also the cheapest thing to gate because the demand for
> it is self-generated. **Mechanics.** The attempt ordinal is first-class on the
> attempt row (the marking engine is already the single markAttempt path, so the
> ordinal is counted there, not inferred); the gate is an entitlement policy row
> read by the route, not UI styling: free = one AI mark per part per scheme
> revision, trial = N re-marks per day, paid = generous or unlimited. The count
> is disclosed at the point of gating ("Your first mark on this part is free —
> N re-marks left this month"), because silent metering reads as breakage.
>
> **Acceptance.** (a) Policy pin: on a free entitlement, the first markAttempt on
> a part passes and the second is refused with the count disclosure; on a paid
> entitlement both pass. (b) Ordinal pin: the ordinal survives re-marking after
> a scheme-revision bump is treated as a new part version. (c) Copy review: the
> gate never blocks viewing a past mark or the chat about it (DC-1 still applies
> to historical attempts); it meters only new marking work.

## 2. Grounding (first-hand, at the branch head)

- The single markAttempt path: `StudentSmartMarkService.smartMarkAttempt`
  (apps/api/src/services/smartmark/index.ts) → `SmartMarkService.markAttempt`
  (one batched pass over all part answers; the SAME pipeline the teacher queue
  runs; the route is a button-driven POST with no body).
- The part dimension lives in `answers.question_part_id` → `question_parts`
  (version-scoped: `question_parts.question_version_id NOT NULL`,
  `uq_question_part(label, question_version_id)`). A scheme-revision bump is a
  NEW question_version → NEW part rows → new part ids.
- `smart_mark_results` is APPEND-per-pass (one row per answer per pass;
  `answers`/`attempts` update in place). `SETTABLE_STATES = {PENDING,
  SMART_MARKED}` — a second pass on the same attempt is a legal re-mark.
- BASELINE_DB.md §4: the Flyway-owned baseline is structurally FROZEN while the
  Java core lives ("alter structure never"; "treat any urge to improve the
  schema as an escalation"); §4.2 allows NEW v2-only tables listed in the schema
  README. The 0006 class_features side-table is the standing precedent for
  state that must not reshape existing tables.
- Entitlement substrate: none exists (no plan/tier column on users; no
  subscriptions). `class_features` (0006) is the closest policy-row precedent.

## 3. Mechanics (as implemented)

1. **The ordinal ledger — `ai_mark_events` (migration 0008, v2-owned,
   APPEND-ONLY).** One row per marked part per pass:
   `(learner_id, question_id, attempt_id, answer_id, question_part_id,
   mark_ordinal, pipeline_version, created_at)`. The ordinal is counted IN the
   markAttempt path (a per-part prior count read under the metering lock) and
   STAMPED via `INSERT … SELECT count(*)+1 …` — never inferred after the fact.
   `(learner_id, question_part_id, mark_ordinal)` is UNIQUE: the ledger's
   fail-closed exactness law — a concurrent double-submit's colliding stamp
   cannot persist; it surfaces as an honest 409 retry.
2. **The entitlement policy — `mark_entitlement_policies` + `mark_entitlements`
   (0008, v2-owned side tables; the 0006 precedent).** Policy rows: tier →
   `{re_marks_per_day, unlimited}`. Seed rows: `free (0/day)`, `paid
   (unlimited)` — the two tiers acceptance (a) pins. **The trial row stays
   unshipped**: its N is the spec's open question (a) ("how many re-marks per
   day constitute a trial") — a business value the mechanism must not invent;
   the row ships when the operator's ruling lands. Learner tier:
   `mark_entitlements` row; **row-absent = free** (the v2 posture: no billing
   wiring exists; the gate is live, the paid tier is assignable row-wise).
   Unknown tier or missing policy row = fail-closed refusal
   (`ENTITLEMENT_POLICY_UNCONFIGURED`), never a silent pass.
3. **The gate (in the markAttempt path, server-side).** After the existing
   ownership → settle-guard → scheme-reveal → κ pre-checks (unchanged order),
   the pass runs inside the **entitlement envelope**: one transaction
   (`createSql.transaction`) holding a per-`(learner, question)` advisory lock
   (`pg_advisory_xact_lock(hashtextextended(...))`) across: ordinal counts →
   policy decision → the engine pass (tx-aware) → the ordinal stamp. The lock
   key is self-inflicted contention only (deadlock-free by construction); a
   concurrent double-click's second leg waits, then sees the first leg's
   events and meters accordingly.
4. **The decision law (uniform across tiers).** A part's would-be ordinal ≥ 2
   is a re-mark. `unlimited` → allowed. `re_marks_per_day = 0` (free) → any
   re-mark refused. Otherwise (trial, when shipped) re-marks are counted per
   UTC calendar day against `re_marks_per_day`. **Whole-pass refusal** — an
   attempt is never half-marked. A refused pass consumes nothing and writes
   nothing (the envelope rolls back to exactly nothing).
5. **The disclosure.** 402 with `{status, error: "entitlement_required",
   message, timestamp, detail}` where `detail` carries the tier, the policy,
   `reMarksUsedToday`, and the per-part refusal list
   (`{partId, label, priorMarks, ordinal}`) — the count and the reason ride
   the body; silent metering reads as breakage. Free-tier copy (pinned in
   tests): "Your first mark on this part is free -- re-marks need a paid
   plan." Trial copy: "… N re-marks left today."
6. **Scope of metering.** Only the STUDENT surface (`smartMarkAttempt`) — the
   teacher queue's own marking is school work, not learner-facing re-marks.
   A `SCHEME_NOT_VALIDATED` result consumes nothing (the engine's own law:
   nothing was marked). Acceptance (c): `explainFeedback` /
   `improvementPlan` / history reads never consult the entitlement tables.

## 4. Honest deviations from the spec's letter (recorded, not silent)

1. **"First-class on the attempt row"** — the attempts table is Flyway-owned
   and §4.1 forbids structural alteration ("the hardest technical constraint
   of the whole migration"). The ordinal is first-class on the append-only
   `ai_mark_events` ledger instead, keyed to the attempt via `attempt_id`;
   the attempts row itself is untouched. The spec's INTENT (counted in the
   path, stored, not inferred) is satisfied in full.
2. **"Read by the route"** — the policy row is read server-side in the
   marking path (the route carries the 402 mapping). The spec's contrast is
   gate-vs-UI-styling; the gate IS server-side law.
3. **"N re-marks left this month"** — the spec's own mechanics say trial =
   N re-marks per DAY; the copy is mechanics-truthful ("left today"). The
   day/month discrepancy is the spec's; the mechanics win.
4. **The trial tier ships as LAW, not as a row** — the per-day metering is
   implemented and tested against a synthetic policy row; the of-record row
   awaits the operator's N (open question (a)). No business value invented.

## 5. Acceptance mapping (test pins, apps/api/test/smartmark/dc3-entitlement.test.ts)

| spec pin | test |
| --- | --- |
| (a) free: first passes, ordinal 1 stamped | "row-absent learner = free…" |
| (a) free: second refused w/ count disclosure, ledger untouched | "free tier: the SECOND AI mark…" |
| (a) paid: both pass, ordinals 1→2 | "paid tier (unlimited)…" |
| (a)+fail-closed: unshipped policy refuses | "fail-closed: a tier whose policy row never shipped…" |
| mechanics: trial per-day metering, truthful remaining count | "trial law: re_marks_per_day…" |
| (b) bump = new part version → fresh bucket; old events survive | "scheme-revision bump = new part id…" |
| (b) ordinals stamped by the path, never inferred | "ordinals are stamped by the path…" |
| (c) past marks + chat ungated (zero entitlement queries) | "explainFeedback never consults…" |
| (c) no marking work → no metering | "SCHEME_NOT_VALIDATED results consume nothing" |
| envelope: one tx, rollback on refusal / commit on pass | "wired tx runner: …" (×2) |
| ledger exactness: collision → honest 409 | "fallback path: the unique-index collision…" |
| wire: 402 body carries count + reason | "wire: 402 entitlement_required…" |

Existing smartmark suites extended additively with the 0008-baseline gate
routes (fixtures); full battery at the branch head: **2515 pass / 0 fail /
13 skip (2528 tests, 131 files)**; `bun run typecheck` clean (4 workspaces);
`verifyBaseline` 0 drifts, census re-pinned **70/667/98/62/115 →
73/685/101/67/118** (the T-BOOK-002 re-baseline flow: the living 0000
snapshot refreshed from the generated 0008 end-state).

## 6. Merge posture

The five gates run on the PR. The merge word is the operator's; it also
constitutes the product sign-off the spec's effort note demands ("DC-3 touches
money and therefore wants product sign-off on the policy values before the
mechanism merges (the mechanism itself is small)") — the shipped policy values
are exactly free + paid as pinned in acceptance (a); trial remains unshipped
until the operator rules on open question (a).

## 7. Merge-gate renumber receipt (2026-10-22, at the merge word)

Main took the 0008 slot mid-flight (T-TEACH-011 `teaching_toolkit`, journal
idx 8, @337344dc) between this branch's first rebase (2cc541b2) and the
operator's merge word. Per first-pushed, this migration renumbers
**0008 → 0009** (`0009_dc3-mark-entitlement.sql`); the DDL statements are
byte-preserved from the authored 0008 file (header-only correction); the
75-table UNION end-state snapshot is the 0009 snapshot of record, and the
living 0000 baseline is refreshed from it (the T-BOOK-002 flow). Union
census re-measured offline: `tables 75/75 · columns 702 · indexes 102 ·
fks 70 · checks 120` — verifyBaseline VERIFY PASS, 0 drifts (was
73/685/101/67/118 on the pre-collision base; 72/684/99/65/117 on main).
Mechanism, tests, and the acceptance mapping are unchanged.

Toolstate note recorded honestly: the collision drizzle-kit reports on
main (`0000_snapshot.json` vs `0008_snapshot.json` sharing the copied id)
is PRE-EXISTING latent toolstate of the refresh flow, not introduced here;
this surgery hand-built the chain-true artifacts (prevId = main/0008.id)
instead of relying on `drizzle-kit generate`.

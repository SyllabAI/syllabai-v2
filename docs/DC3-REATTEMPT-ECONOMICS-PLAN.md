# DC-3 Re-Attempt Economics — prereg of record

**Status**: prereg — committed to main WITH the implementation PR (the
#216/#225/#229/#232/#269/#273 pattern: the plan doc is the PR's diff).
**Operator commission of record** (trace `1a1604fe1912f9b9`): "next spec item" —
the roadmap of record (Task-49 mirror, commit `f1e9e94f`) puts DC-3 first among
the un-started P1 items (P0 row closed: DC-1 ✅ #273 v15, DC-2 ✅ #269 v14,
DC-6 ✅ phases 1/2a/3/3b/3c).
**Spec recovery of record**: the spec docx was lost to sandbox reset #4 and
recovered VERBATIM from the operator-provided source (trace `1a1608f0c92a0349`,
github.com/nawaf-al-hussain/FileUpload/tree/main/SME-Research) — sha256
`0da8044a0667a47c684d4b0486784be02bc4992546eca2ec2946043e9e2b287a` == the
of-record prefix `0da8044a`. §3.3 quoted from the recovered bytes, never
paraphrased. Recovery census + the spec-loss receipt live in the session
worklog (DC3-NEXT).
**Grounding**: main `e024c11c`; the single markAttempt path = `SmartMarkService.
markAttempt` (one pass, attempt-row lock); student entry `student.smartMarkAttempt`
(settle-checks → resolveScheme → requireRevealableScheme → κ → markAttempt →
project); route `POST /api/v1/learners/me/attempts/{id}/smart-mark`;
scheme revision identity = `mark_schemes.version_label`
(UNIQUE(question_version_id, version_label)).

## 0. The law of record (spec §3.3, verbatim spine)

> **Decision.** SyllabAI meters the SECOND AI mark of a part, not the first.
> The first mark teaches the learner what the feedback feels like; the
> improvement loop — answer, read feedback, try again — is where willingness
> to pay concentrates, and it is also the cheapest thing to gate because the
> demand for it is self-generated.
> **Mechanics.** The attempt ordinal is first-class on the attempt row (the
> marking engine is already the single markAttempt path, so the ordinal is
> counted there, not inferred); the gate is an entitlement policy row read by
> the route, not UI styling: free = one AI mark per part per scheme revision,
> trial = N re-marks per day, paid = generous or unlimited. The count is
> disclosed at the point of gating ("Your first mark on this part is free —
> N re-marks left this month"), because silent metering reads as breakage.
> **Acceptance.** (a) Policy pin: on a free entitlement, the first markAttempt
> on a part passes and the second is refused with the count disclosure; on a
> paid entitlement both pass. (b) Ordinal pin: the ordinal survives re-marking
> after a scheme-revision bump is treated as a new part version. (c) Copy
> review: the gate never blocks viewing a past mark or the chat about it (DC-1
> still applies to historical attempts); it meters only new marking work.

The spec's own governance lines, carried forward as obligations of this prereg:
*"DC-3 touches money and therefore wants product sign-off on the policy values
before the mechanism merges (the mechanism itself is small)"* (effort notes);
open question (a) *"how many re-marks per day constitute a trial, and does
marking meter per part, per topic or per day?"* stays OPEN of record.

## 1. Rulings

- **R1 — ordinal substrate.** The v2 mark row is `smart_mark_results` (the row
  `markAttempt` produces per part): the spec's "attempt ordinal is first-class
  on the attempt row" maps to a NEW `attempt_ordinal` column there, computed
  INSIDE `markAttempt` under the attempt-row lock — counted, never inferred.
  Key = (learner, part, `mark_scheme_id`): the scheme row
  (question_version_id, version_label) IS the revision of record, so a
  scheme-revision bump starts a fresh ordinal — acceptance (b) by construction.
  Refusal rows (no VALIDATED scheme; `mark_scheme_id` null) carry a NULL
  ordinal: they are not marks.
- **R2 — migration 0008 (additive).** `smart_mark_results.attempt_ordinal
  integer` (nullable). Backfill = `ROW_NUMBER()` per
  (learner, part, mark_scheme_id) ordered by `created_at, id` — a default of 1
  would LIE for existing re-marks; refusal rows (null scheme) stay null.
- **R3 — the entitlement policy row.** The policy is a typed frozen module,
  `services/smartmark/entitlement.ts`: the matrix {free, trial, paid} exactly
  as the spec's mechanics line names them. Medium mapping DISCLOSED: v2 has no
  billing store, so a DB policy row would be uneditable dead weight — the
  module is the policy source the route reads, and `learnerMarkTier()` is the
  single swap point a future billing lane replaces. v2 posture of record:
  every learner is `free`.
- **R4 — the gate.** Lives in `student.smartMarkAttempt` BEFORE `markAttempt`
  — the route's handler body ("read by the route"); the route file itself is
  untouched. Free tier: every part of the attempt must carry
  `prior < 1` AI marks under the CURRENT scheme revision; a violation refuses
  the WHOLE ask (the one-pass engine is transactional — partial marking would
  violate pass atomicity) with 409 ConflictError and the spec's disclosure
  copy. Paid: short-circuit pass. Trial: the daily meter is the spec's OPEN
  question (a) — the gate refuses `entitlement_policy_pending_sign_off`
  (loud, honest, unreachable under the free-posture resolver) rather than
  inventing the day-window semantics.
- **R5 — disclosure copy.** The refusal detail uses the spec's own sentence
  template with honest counts: "Your first mark on this part is free —
  {reMarksPerDay} re-marks left" + the metered part's prior count. No
  invented product copy.
- **R6 — ordinal honesty.** The prior-count law is ONE shared query helper
  (`priorMarkCounts`): grouped by part, joined through this attempt's parts,
  filtered to the learner and `r.mark_scheme_id = scheme.id`. The engine adds
  +1 per part at insert time. Cross-attempt concurrent marking (two attempts
  of the same question marked simultaneously) computes under per-attempt row
  locks — the ordinal can race across DIFFERENT attempts; disclosed, not
  hidden (same-attempt concurrency is fully serialized by the existing lock).
- **R7 — acceptance (c) by construction.** The gate exists ONLY in the
  smart-mark POST path. Read paths (attempt views, past marks) and the CLA
  chat about historical attempts are untouched; `routes/cla.ts` stays
  byte-frozen; the DC-1 loader (latest attempt, fail-open) is untouched.
- **R8 — prompt identity.** DC-3 meters marking work and adds ZERO prompt
  content: NO `PROMPT_VERSION` bump — `tutor-grounded/v15` stands (law+run:
  v15 of record at #273). The stamps census re-runs in the battery.
- **R9 — fences.** ZERO bytes: `routes/cla.ts`, `routes/tutor.ts`,
  `services/tutor/**`, `services/cla/**`, `apps/hub/**`,
  `packages/contracts/**`. Touched: `services/smartmark/index.ts` (ordinal +
  gate), NEW `services/smartmark/entitlement.ts`, `packages/db/drizzle/0008`
  (+ meta — packages/db is not a lane fence; 0004/0006/0007 landed there),
  tests, this prereg.
- **R10 — test-side discipline.** The gate + ordinal add ONE new query shape;
  existing fakeSql route tables gain that single route (rows: [] ⇒ zero prior
  ⇒ byte-identical behavior — the 2488-test baseline holds). New pins in
  `test/smartmark/dc3-entitlement.test.ts`.
- **R11 — the two-site reality (grounded mid-implementation, disclosed).** The
  spec assumed "the single markAttempt path"; v2's AI marks insert from TWO
  sites: `SmartMarkService.markAttempt` (the student smart-mark pass) AND
  `TeacherMarkingService.markAnswer` (the teacher queue's own engine copy).
  Ruling: the ORDINAL stamps at BOTH insertion sites — every AI mark of a
  part is the metered good, and a teacher-queue mark that were invisible to
  the ordinal would under-count the learner's part. The GATE stays ONLY at
  the student route: the observed paywall is the learner's re-mark button and
  the entitlement being metered is the LEARNER's (the teacher queue is a
  teacher act; metering it against the learner's policy is not named by the
  spec). Refusal rows (SCHEME_NOT_VALIDATED) are NOT marks: excluded from the
  ordinal sequence (the live query + the 0008 backfill both key the exclusion
  on failure_reason — refusal rows carry the refused scheme's id, not a
  backing one) and stamped `attempt_ordinal: null`; a refusal consumed no
  feedback, so it can never deny the learner their first free mark.

## 2. The diff map (planned)

| File | Delta | Content |
| --- | --- | --- |
| `packages/db/drizzle/0008_dc3_mark_ordinal.sql` | NEW | column + backfill |
| `packages/db/drizzle/meta/_journal.json` | +1 entry | idx 8, tag 0008 |
| `packages/db/drizzle/meta/0008_snapshot.json` | NEW | 0007 + the column |
| `apps/api/src/services/smartmark/entitlement.ts` | NEW | policy matrix + tier resolver + refusal copy builder |
| `apps/api/src/services/smartmark/index.ts` | +~55 | `attempt_ordinal` on the row type; `priorMarkCounts` helper; engine counts the ordinal at insert; the gate in `smartMarkAttempt` |
| `apps/api/src/services/teachermarking/index.ts` | +~12 | R11: the teacher queue's own mark path stamps the ordinal too (counted there, not inferred); its refusal row stamps null |
| `apps/api/test/smartmark/smartmark.test.ts` | +route | the prior-count route (rows: []) |
| `apps/api/test/smartmark/routes.test.ts` | +route | same |
| `apps/api/test/smartmark/dc3-entitlement.test.ts` | NEW | acceptance pins (a)/(b)/(c) + matrix + dispatch |
| `docs/DC3-REATTEMPT-ECONOMICS-PLAN.md` | NEW | this prereg |

## 3. Acceptance mapping

| Spec pin | Implementation of record |
| --- | --- |
| (a) free: first markAttempt on a part passes, second refused with the count disclosure; paid: both pass | the gate in `smartMarkAttempt` (R4): prior ≥ 1 under the current scheme ⇒ 409 with the R5 copy; paid short-circuit. Pinned in dc3-entitlement.test.ts |
| (b) the ordinal survives re-marking; a scheme-revision bump is a new part version | ordinal persisted on `smart_mark_results` keyed by `mark_scheme_id` (R1/R2); the prior-count query filters on it; bump ⇒ new scheme row ⇒ fresh sequence. Pinned: engine returns `attempt_ordinal = prior + 1`; query shape pins the scheme key |
| (c) the gate never blocks viewing a past mark or the chat about it | gate exists only on the smart-mark POST (R7); routes/cla.ts byte-frozen; read-path tests unchanged green |

## 4. Battery plan (on the exact head, before the PR)

Root typecheck ×4; `bun test` apps/api + packages (baseline 2488/0/13 + the
new pins); targeted `dc3-entitlement` + `smartmark` + `cla-service`; golden
selftest; zero-core census gate; hub `tsc`; `next build`; stamps census
(v15 unchanged); `routes/cla.ts` zero-byte verification. The PR halts at the
operator-gated merge word WITH the spec's own product sign-off ask: the policy
values (trial N + day-scoping, per open question (a)) require the operator's
ruling before this mechanism merges.

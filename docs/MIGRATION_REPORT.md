# SyllabAI V2 Migration Report (of record)

> Wave-7 deliverable per `docs/MIGRATION_PLAN.md` §7 ("final receipts, migration
> report"). Filed by T-MIG-074 (r9-hubx) under operator directive trace
> `1a1107c667b6f2e9`. This report states the migration as of main
> **`851df19`** (2026-10-06). Sections marked **[POST-CUTOVER]** are completed
> after the §7 runbook executes; everything else is of-record history.

---

## 1. Executive summary

The Java core (`syllabai-core`) has been ported to a TypeScript monorepo
(`packages/contracts` + `packages/shared` + `packages/db` + `apps/api`) with the
Next.js hub (`apps/hub`) riding the same repo, under a strangler pattern with a
**contracts-first (zod), golden-master-gated, honest-501/503** doctrine. At the
report hash:

- **Register: 65 of 66 filed cards DONE** — every wave card of Waves 0–6 is
  DONE; the sole non-DONE card is T-MIG-071 (ruling-execution band, in flight
  — claim of record R4-api-b `f0b7189`); T-MIG-073 was flipped DONE by the R0
  desk (`6227b6a`, convergent with this lane's census).
- **Gates of record (first-hand at the report head):** `tsc --noEmit` ×4 exit 0;
  `bun test apps/api packages` = **1533 pass / 0 fail / 13 skip / 6036 expects
  / 82 files**; `bun test apps/hub` = **36 pass / 0 fail / 291 expects**;
  `bun golden/runner.ts --selftest` OK.
- **Behavioural fidelity:** live golden replay **union 149/177** at `e9ef235`
  (run 37441112330, post-#117-composition, filed of record as R0-REPLAY-FILING-1
  at `6227b6a`; prior aggregate 142/177, divergences 40 → 35 pre-#117), with
  the 28-difference residual given a **4-class taxonomy** (register rate-limit
  collision, learner-me auth-envelope inversion, fixture volatility,
  smart-lesson route reachability) and a ruled disposition per class closing
  through the 071 band — none are unexplained port defects.
- **What remains before the flip:** the four §7 preconditions
  (`docs/CUTOVER_RUNBOOK.md` §0). P1 is met at the register level; P2–P4 are
  in flight / operator-owned. The cutover itself is a single Vercel env flip —
  the rollback lever is the same flip in reverse.

## 2. Method (the laws that got it here)

- **Strangler pattern, contracts-first.** Every ported surface pins its wire law
  in `packages/contracts` (zod) before implementation; Java remains the frozen
  reference at pin `6cad6ef` and is never modified.
- **Golden-master gating.** Deterministic surfaces are gated by replay against
  recorded Java cases; tolerance semantics live in the runner (declared
  multiset order, wall-clock tolerates, `justified: true` health annotations,
  RFC 8259 key canonicalization + the T-MIG-072 two-tranche seed-pass
  partition).
- **Honest seams.** Not-yet-ported behaviour answers `501 not-implemented` /
  `503 dormant` — never a silent wrong answer.
- **Fleet protocol.** Zero-collision claims (earliest-claim-wins by commit
  timestamp), authors-never-self-merge, R0 merge-desk intake (worklog union;
  code conflicts keep-both), append-only worklog, receipts for every action,
  no force-push. Baseline DB is Flyway-frozen; Drizzle migrations are additive.

## 3. Wave-by-wave record

| Wave | Scope | Cards | Status of record | Landmark receipts (session-citable) |
|------|-------|-------|------------------|--------------------------------------|
| W0 | Platform bootstrap, golden capture, CI | 9/9 | DONE | 040-PREP #57, 042P cron scaffold #54 |
| W1 | Identity/auth (JWT + bcrypt cross-verify) | 9/9 | DONE | token cross-verify test of record (R-JWT mitigation) |
| W2 | Content read | 5/5 | DONE | hub corpus in-repo, prebuild-verified |
| W3 | Assessment loop | 10/10 | DONE | 033 t1–t3 = #50/#64/#77 |
| W4 | Learner surface (+ NBA engine, exam targets) | 9/9 | DONE | 041 #65; 043 t1/t2 = #74/#85; 069 CLA #114 |
| W5 | Classroom/teacher (+ KG heatmap, analytics, smart lesson) | 10/10 | DONE | 053 t1–t4 = #101/#108/#115/#116 |
| W6 | Tutor/AI + admin + research | 10/10 | DONE | 060 KaRAG #104; 062 research #102; 066 #106; 065 hygiene #103 |
| — | ruling-execution | 072 DONE (#117); **071 in flight** | — | R3-C/D3/D4 case-amendment band |
| — | follow-up | 073 DONE (flipped by R0 desk `6227b6a`; #113 merged-of-record) | — | selfmark dead-constraint class |
| W7 | Cutover + freeze | 074 (this report + runbook) | PREP | `docs/CUTOVER_RUNBOOK.md` |

## 4. Fidelity of record

- **Instrument:** `golden/runner.ts` + `ci-replay.ts` against the recorded
  corpus; NEON replay for live-branch dual replay (recently gated on
  NEON_BRANCH_CAPACITY — operator-side capacity action outstanding).
- **Last live aggregate of record:** union **149/177** at `e9ef235` (NEON
  replay run 37441112330, post-#117, R0-REPLAY-FILING-1 at `6227b6a`); the
  prior of-record aggregate was union 142/177 (seed 129/162, prod 13/15,
  dual-dispatch corroborated: workflow runs 37426037703 / 37426117865).
  Divergence trajectory 40 → 35 → 28 across the 067/068/070 bands and the
  #117 composition respectively.
- **Residual disposition (ruling3, all corpus-side):** R3-C — the eight
  auth-register class-C cases carry the operator-endorsed v2 limiter
  (`justified: true` + Retry-After pin; limiter STAYS; no pacing); R3-D3 —
  target-series day-window tolerates (capture-time anchor law); R3-D4 —
  Option-A identity tolerates (register `accessToken`, history
  `learnerId`/`attemptId`, auth-me seeded-identity fields). These land via
  **T-MIG-071** (claim of record: R4-api-b at `f0b7189`; work heads
  `t-mig-071/r4b` and `t-mig-071/r0desk` visible on origin — any double-work
  resolves by the standing earliest-claim-wins / arbitration precedents).
  The fresh 4-class taxonomy from run 37441112330 is the 071 band's working
  target list.
- **Composition of record:** T-MIG-072 (#117) — two ordered seed-pass tranches
  (empty-pinned pre-staging, staged-pinned post), 9 construction-only tranche
  markers, F-class key-canonicalization rider; selftest at the report head
  proves it live.
- **Cutover criterion:** a fresh replay at the cutover candidate SHA with
  **zero non-justified divergences** (runbook §0 P2).

## 5. Risk register outcomes (plan §6 → of-record)

| Risk | Outcome of record |
|------|-------------------|
| R-JWT | Mitigation shipped: same secret + claims from day one; Java-issued token parses in v2 (T-MIG-010 cross-verify test). |
| R-BCRYPT | Same cost factor; Java-hash fixture cross-verify in the W1 suite. |
| R-TX | Multi-write ops wrap explicit Drizzle transactions (W3+); V61 marks-sum invariant ported as the regression net. |
| R-LAZY | Ports follow the OBSERVED repository call sequence; response-shape golden cases catch over/under-fetch. |
| R-SSE | Streaming lifecycle ported as deterministic plumbing, unit-gated; LLM payloads excluded from golden gating. |
| R-LLM | Never golden-gated; refusal-honesty + citation plumbing + zod format contracts instead. |
| R-PGVECTOR | Exact frozen SQL predicates ported; calibration receipts as fixtures. |
| R-FLYWAY | Baseline-only doctrine held all migration: `flyway_schema_history` untouched; Drizzle additive; `db:check` on db PRs. |
| R-VERCEL | Decay → Vercel Cron scaffold of record (T-MIG-042P, fail-closed env gates); OCR chunked within function limits. |
| R-CORPUS | Hub corpus in-repo, prebuild-verified, never hand-regenerated. |
| R-PII | Deterministic scrub at capture; reviewer unmasked-field checks on fixture diffs. |

## 6. Outstanding before the cutover can execute

1. **T-MIG-071** (in flight, claim of record R4-api-b): the R3-C/D3/D4 case
   amendments + the 4-class taxonomy from run 37441112330 — closes the last
   non-justified divergence class.
2. **~~T-MIG-073 owner flip~~ CLOSED**: the R0 desk flipped 073 DONE of record
   (`6227b6a`, merge-of-record verified) — convergent with this lane's census.
3. **Fresh live replay** at the cutover candidate SHA (post-#117 aggregate
   exists: 149/177 @ e9ef235; the cutover gate still requires a re-run at the
   final candidate SHA; NEON_BRANCH_CAPACITY unblock is an operator action).
4. **§7 P3/P4**: supervised dual-run loops + operator sign-off (runbook §7
   template).
5. **[POST-CUTOVER]** — watch window results, archive SHAs, final sign-off
   (runbook §4/§6).

## 7. [POST-CUTOVER] Watch results

_Pending runbook §4 execution. Record: replay-vs-live aggregate, error rates,
decay rows, triage outcomes, rollback events (if any)._

## 8. [POST-CUTOVER] Archive record

_Pending runbook §6 execution. Record: archived repo SHAs, Render service
states, final W7 receipt that flips T-MIG-074 and the wave register to DONE._

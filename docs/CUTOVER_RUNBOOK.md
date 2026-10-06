# SyllabAI V2 Cutover & Rollback Runbook (Wave 7)

> **STATUS: PREP — NOT EXECUTED.** This runbook is the executable expansion of
> `docs/MIGRATION_PLAN.md` §7. Every step marked **[OPERATOR]** touches
> production (Vercel / Render / Neon / GitHub archive settings) and is
> **forbidden to code lanes** by the standing lane boundaries (Neon read-only,
> prod zero-write). Lanes may run every step marked **[LANE]**. Nothing in this
> file is executed by its mere presence on main.
>
> Provenance: operator directive trace `1a1107c667b6f2e9` ("Proceed with three
> in-review cards plus Wave-7 cutover") → T-MIG-074 (r9-hubx). Source of law:
> MIGRATION_PLAN.md §7 and the risk register (§6). Rollback law: **nothing gets
> deleted until Wave 7 completes** (plan §7.5).

---

## 0. Preconditions gate (ALL must hold before §1)

| # | Requirement (plan §7) | Status at runbook filing | Evidence of record | Re-verify |
|---|----------------------|--------------------------|--------------------|-----------|
| P1 | Waves 1–6 exit gates PASS | **MET (register)** — W0–W6 all cards DONE at `851df19` (64/66 cards DONE register-wide; the two non-DONE are non-wave bands: T-MIG-071 ruling-execution, T-MIG-073 follow-up) | `.syllabai/tasks/*.yaml` register; gates first-hand at flip head: typecheck ×4 exit 0, `bun test apps/api packages` 1533 pass / 0 fail / 13 skip / 6036 expects / 82 files, `bun test apps/hub` 36/0/291, `bun golden/runner.ts --selftest` OK | `bun run typecheck && bun test apps/api packages && bun test apps/hub && bun golden/runner.ts --selftest` |
| P2 | Golden replay 100% on deterministic surfaces | **NOT YET MET — in flight.** Last live aggregate of record: union 142/177 (seed 129/162), divergences 40 → 35 pre-#117. The #117 two-tranche composition (T-MIG-072) makes the RICH-200-C class executable on the instrument; the remaining residual class is dispositioned by operator ruling3 (R3-C/D3/D4) and lands via **T-MIG-071** (claimed by R4-api-b, `f0b7189`) | `receipts/R0-arbitration/ruling3-operator-four-rulings.json` (law of record); T-MIG-068 run-001-union residual disposition; R0-AUTO round-20 receipt (`e9ef235`) — fresh post-#117 live replay pending NEON_BRANCH_CAPACITY | `bun golden/runner.ts --selftest` + the ci-replay two-tranche mode; a fresh live NEON replay dispatch at the cutover candidate SHA |
| P3 | Supervised dual-run of the full learner loop + teacher loop against branch deployments | **PENDING — operator-supervised.** Hub dual-run CI parity of record (T-MIG-037); the §7 supervised loops are a human-witnessed exercise, not CI | T-MIG-037 receipt chain; §2–§4 of this runbook give the procedure | — |
| P4 | Operator sign-off recorded in `.syllabai/worklog.md` | **PENDING** — template in §7 of this runbook | — | — |

**Gate rule:** do NOT proceed to §1 while any of P1–P4 is unmet. P2 closes when
a fresh live replay at the cutover candidate SHA returns **zero non-justified
divergences** (justified residuals carry `justified: true` per the GOLDEN_MASTER
§4 convention and are enumerated in the ruling3 receipt).

---

## 1. Freeze window **[OPERATOR]**

1. Announce the freeze window (pilot-scale: minutes, not hours) — pilot users
   idle; no in-flight learner sessions.
2. Verify no cron/decay run is mid-flight (Vercel Cron nightly decay is 02:00
   UTC per the T-MIG-042P scaffold; schedule the freeze away from it or accept
   one no-op cycle — the v2 cron job is fail-closed and env-gated, it cannot
   double-fire while the Render core still owns traffic).
3. Snapshot the current `NEXT_PUBLIC_API_BASE_URL` value (rollback anchor —
   this is the entire rollback lever, see §5).

## 2. Traffic flip **[OPERATOR]**

1. Vercel `hub` project: set env `NEXT_PUBLIC_API_BASE_URL` → the v2 API
   domain; redeploy. Hub is stateless — the redeploy is the cutover.
2. v2 API env: same `SYLLABAI_JWT_SECRET` (token continuity, R-JWT mitigation —
   the T-MIG-010 cross-verify test proves Java-issued tokens parse in v2), same
   Neon **main** URL (no branch/DB copy — the baseline-only doctrine, R-FLYWAY,
   `flyway_schema_history` untouchable).
3. Java core on Render: **stays deployed**, stops receiving traffic. Do not
   scale it down, do not redeploy it, do not touch its env.
4. Smoke **[LANE-executable checks, operator-witnessed]**: learner login →
   agenda → flashcard rating → self-mark → history (the W3/W4 spine); teacher
   login → class → marking queue (W5); tutor SSE open/heartbeat/close (W6 —
   LLM payloads excluded from golden gating by standing law).
5. Rollback readiness check: re-deploy hub with the old base URL in a **preview
   deployment** and confirm it serves — proves the §5 lever works BEFORE it is
   needed.

## 3. Nightly decay takeover **[OPERATOR]**

1. Vercel project env: `DECAY_CRON_ENABLED=1` + `CRON_SECRET` set (fail-closed
   shape of record: 401 on missing/mismatched bearer, 200 `{status:skipped}`
   while disabled, 501 `{status:not-implemented}` only if the Wave-4 decay port
   were absent — it is not; `runNightlyDecay()` is behind the documented seam,
   T-MIG-042P).
2. Java core's scheduler: left running-but-idle by design (no traffic → no
   triggers). Verify harmless no-op for 48h (§4), then disable the Render
   service **[OPERATOR]** — not before.
3. Cross-check next morning: `decay_job_runs.window_start` PK idempotency held
   (exactly one row per window; zero double-decay across both schedulers during
   the overlap).

## 4. 48-hour watch **[OPERATOR + LANES]**

| Metric | Source | Alert threshold |
|--------|--------|-----------------|
| API error rate (5xx) | v2 logs | any sustained >0.5% over 1h |
| Latency p95 on the W3/W4 spine | v2 logs | regression vs. the golden capture posture beyond capture-day tolerance |
| Auth failures (token verify) | v2 logs | any spike → R-JWT recheck (secret/claims drift) |
| Nightly decay | `decay_job_runs` table (read-only SELECT from lanes is permitted) | missing row at 02:00 UTC+ε or duplicate rows |
| Golden replay vs live | replay dispatch at the prod SHA | zero new non-justified divergences |
| Hub issue triage | repo issues | triage within 24h; regressions → rollback decision (§5) |

**[LANE]** During the watch window, lanes may run the replay instruments and
file divergences; any **port-side** divergence is a rollback trigger per §5.

## 5. Rollback **[OPERATOR]** — at ANY point before decommission

> Flip Vercel `hub` env `NEXT_PUBLIC_API_BASE_URL` back to the Render core URL
> and redeploy. That is the entire rollback plan — the Java core is untouched
> the whole time (still deployed, still warm). Data drift risk during v2 tenure
> is bounded by the shared-Neon-main architecture: both cores read/write the
> same Postgres; there is no data migration to unwind. Nothing gets deleted
> until Wave 7 completes (plan §7.5).

Decision rule: any port-side fidelity regression on the live spine that CI
cannot reproduce-and-explain within the watch window → roll back first,
diagnose on branches after.

## 6. Archive **[OPERATOR]** — only after the 48h watch passes

1. GitHub: archive `SyllabAI/syllabai-core` and `SyllabAI/syllabai-hub`
   (archive = read-only; **never delete** — issues, receipts, blame stay
   resolvable).
2. Render: disable (not delete) the Java core service after the 48h check.
3. Record the archive SHAs + service states in the post-cutover section of
   `docs/MIGRATION_REPORT.md` and in a worklog receipt.

## 7. Operator sign-off (template — paste into `.syllabai/worklog.md`)

```markdown
---
Task ID: W7-CUTOVER-SIGNOFF
Agent: OPERATOR (human)
Task: Wave-7 cutover sign-off per docs/CUTOVER_RUNBOOK.md.

Work Log:
- Preconditions P1 [MET/PENDING], P2 [MET/PENDING — replay run <id>, divergences <n> non-justified],
  P3 dual-run learner loop [PASS/FAIL] teacher loop [PASS/FAIL] (witnessed <date>),
  P4 this entry.
- Cutover executed <UTC timestamp>: NEXT_PUBLIC_API_BASE_URL <old> -> <new>, hub redeploy <id>.
- DECAY_CRON_ENABLED=1 applied <UTC timestamp>; CRON_SECRET rotated Y/N.
- Rollback lever verified via preview deployment <id>.

Stage Summary:
- V2 IS LIVE for pilot traffic as of <UTC timestamp>. Watch window opens, closes <UTC+48h>.
```

## 8. Post-cutover obligations

- Fill the marked `[POST-CUTOVER]` sections in `docs/MIGRATION_REPORT.md`
  (watch results, archive SHAs, final replay-vs-live aggregate).
- Final receipts: one worklog entry per § above that fired, plus the closing
  W7 receipt that flips T-MIG-074 (and the wave register) to DONE.
- Standing law survives cutover: append-only worklog, receipts, no-force-push,
  authors-never-self-merge — the repo is the audit trail.

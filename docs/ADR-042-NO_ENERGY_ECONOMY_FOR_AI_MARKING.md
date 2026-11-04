# ADR-042: No Energy Economy for AI Marking — Metering Lives at the Provider-Budget Layer

- **Status:** PROPOSED — initiated with the T-MG rollout commission (operator order "Now, start working", 2026-11-04). Becomes **ACCEPTED on merge** (house law, ADR-040/041 precedent).
- **Date:** 2026-11-04
- **Related:** `docs/MG-MARK-ROLLOUT-PLAN.md` (the rollout tranche this ADR unblocks) · `docs/MG-MARK-PARITY-PLAN.md` (the marking engine of record) · `apps/api/src/services/llmchain/*` (the ONE chain of record: per-provider `dailyBudget` + health/cooldown) · `apps/api/src/middleware/ratelimit.ts` + `apps/hub/src/lib/rate-limit.ts` (the rate laws) · `mark_entitlements` / `ai_mark_events` (the existing entitlement + event planes)
- **Supersedes:** none. **Amends:** none.

## 1. Context

The competitive reference (mathsgenie.co.uk, live capture 2026-11-04) meters AI marking through a learner-facing **energy** economy: a balance widget ("5 energy left"), 1 energy per question-region mark, refresh cycles, upgrade nudges. Parity pressure says "copy the widget".

Our system has no credits/energy concept anywhere (code census: zero hits). What it does have: the LLM chain's per-provider `dailyBudget` (default 1000 calls/day, `SYLLABAI_LLM_DAILY_BUDGET`) with health-gated failover, per-IP rate limits on both planes, and — dormant — a real entitlement seam (`mark_entitlements`, written by smartmark/selfmark/teachermarking) plus the `ai_mark_events` graded-evidence spine (unique per learner+part+ordinal).

## 2. Decision

**We do not build an energy economy now.** Learner-visible metering is a billing decision, not a feature dependency of AI marking.

1. **Cost control stays at the provider layer**: the chain's `dailyBudget` + cooldown/failover + the route rate limits remain the only meters. A budget exhaustion renders the existing honest failure classes (the panels already say "marking unavailable — try again / self-mark instead").
2. **The event spine is the audit**: every marking run already writes `ai_mark_events`; per-learner consumption is one SQL aggregation away — no new ledger.
3. **If/when paid tiers need a real quota**, the seam is `mark_entitlements` (+ `ai_mark_events` for "marks used today" cosmetics): an additive lane touching identity+UI+billing TOGETHER — deliberately not smuggled in through a marking feature.
4. **What we visibly adopt from the reference is free**: the honest per-region score chips, the re-mark affordance, the feedback panel — already shipped.

## 3. Consequences

- MG-parity census shows one deliberate divergence (energy) — recorded here so it never resurfaces as a missing-parity bug.
- A "marks left today" cosmetic, if ever wanted, reads `ai_mark_events` counts — one view, no schema change.
- Any future economy decision supersedes this ADR with a new operator word and an entitlement-lane plan.

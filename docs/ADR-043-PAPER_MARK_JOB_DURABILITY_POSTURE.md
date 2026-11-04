# ADR-043: Paper-Mark Job Durability — the 202+Poll Posture Stands; a Durable Queue Is Carded, Not Built

- **Status:** PROPOSED — initiated with the T-MG rollout commission (operator order "Now, start working", 2026-11-04). Becomes **ACCEPTED on merge** (house law, ADR-040/041 precedent).
- **Date:** 2026-11-04
- **Related:** `docs/MG-MARK-ROLLOUT-PLAN.md` (the rollout tranche) · `apps/api/src/routes/paper-marking/index.ts` (the registry disclosure of record: "IN-PROCESS and NON-DURABLE — a restart loses queued/running jobs; the poll 404s honestly afterwards; retry: 0") · `apps/hub/src/lib/paper-marks.ts` (`pollUntilTerminal`'s honest `lost`/`timeout` classes) · `mark_awards` once-only claim (idempotent duplicate absorption)
- **Supersedes:** none. **Amends:** none.

## 1. Context

The competitive reference marks synchronously (~seconds, one round trip). Ours is 202 + poll with an in-process, non-durable `MarkJobRegistry`: an api restart orphans queued/running jobs, and the client's poll resolves to the DEFINED `lost` class (404 → "this mark is no longer running — mark again"), never a fabrication. This was a disclosed build-time decision, and the rollout plan inherited it unexamined.

The honest-cost accounting at rollout time: (a) marking jobs are seconds-lived vision/LLM runs, so the restart-loss window is tiny; (b) every job is idempotent at the ledger (the once-only claim absorbs duplicate award writes), so a learner-initiated re-mark after a loss is SAFE; (c) the UI already renders the loss honestly and the re-mark affordance is one click; (d) durable queueing (pg-backed job table + worker sweep) is a real infrastructure lane — schema, sweep cadence, stale-job reaping, observability — whose cost buys little until marking volume is a measured number, not a fear.

## 2. Decision

**The 202 + poll, non-durable registry posture stands for the rollout tranche.**

1. No durability engineering ships with Lanes A/C/E; the disclosed restart-loss semantics are part of the contract (route docblock, client `lost` class, panel copy).
2. The client NEVER re-POSTs to recover (retry: 0 — the shipped law); recovery is the learner's explicit re-mark, which is idempotent at the ledger.
3. **Escape hatch, carded not built**: if/when marking volume or job duration makes restart-loss user-visible, a pg-backed job table (enqueue row → worker sweep → terminal snapshot) is an additive lane under a new operator word. The `PaperMarkPollResponse` wire shape would not change — the registry is behind the poll route.

## 3. Consequences

- MG-parity census shows the second deliberate divergence (sync vs 202+poll) — recorded here beside ADR-042 so the divergence set is explicit.
- Operator dashboards can treat `ai_mark_events` + award `createdAt` as the de-facto job audit; no registry persistence is implied.
- The route module's disclosure docblock is normative: any change to the posture amends this ADR first.

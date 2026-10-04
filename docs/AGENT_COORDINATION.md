# Multi-Agent Coordination — syllabai-v2 migration

> 6–9 AI agents, one monorepo, zero collisions. This document is binding:
> an agent that cannot follow it must stop and report instead of improvising.
> Operator directive 2026-10-04 (trace `347fbb29ca71934f658854f7261bdb83`).

---

## 1. Roles (assign 6–9 agents to these lanes; one agent = one lane at a time)

| Role | Lane | Owns (never touches outside it) |
|------|------|--------------------------------|
| **R0** | Integrator / merge authority | Merging PRs, task `status:` transitions to DONE, `main` branch protection, final call on conflicts |
| **R1** | Contracts | `packages/contracts/**` |
| **R2** | Database | `packages/db/**`, Neon branches, `docs/BASELINE_DB.md` updates |
| **R3** | API port — lane A | `apps/api/src/routes/**` (wave-assigned subset) + its `apps/api/test/**` |
| **R4** | API port — lane B | `apps/api/src/routes/**` (disjoint wave-assigned subset) + its tests |
| **R5** | Hub adapter | `apps/hub/**` (excluding PROVENANCE.md content changes without R0) |
| **R6** | Golden-master / QA | `golden/**`, capture runs, scrub review, parity reports |
| **R7** | Docs / receipts / worklog shepherd | `docs/**`, `.syllabai/receipts/**` (flex lane: absorbs R1–R6 overflow; also runs CI babysitting) |

With 6 agents: R7 duties split across R3–R6. With 9: split R3/R4 per wave
(e.g. R3a/R3b) — never more than one agent per file-glob at a time.

## 2. Task lifecycle (the claim protocol)

Tasks live in `.syllabai/tasks/T-MIG-xxx.yaml` (format §4 — mirrors the
master-pack convention used by T-C42).

```
OPEN → CLAIMED (agent sets owner + claimed_at) → IN_PROGRESS (branch pushed)
     → IN_REVIEW (PR open, receipts attached) → DONE (R0 only)
     / BLOCKED (state the blocker in execution_record; R0 re-routes)
```

Rules:

1. **Claim before work.** Set `task.owner` to your agent id and
   `task.status: CLAIMED` with a timestamp IN THE SAME COMMIT that starts
   your branch, or in the PR description if the task file is being edited in
   the PR itself. Two agents claiming one task: earliest claim wins, R0
   arbitrates disputes.
2. **Branch per task:** `t-mig-xxx/<role><n>` (e.g. `t-mig-010/r3a`).
   No direct pushes to `main`. Ever.
3. **Stay inside `scope.allowed`.** The yaml's file globs are your fence.
   Need a file outside it? Stop the lane, file a new task, hand it to the
   owning role. This is what makes 9 agents collision-free without meetings.
4. **Every PR title starts with the task id**: `T-MIG-010: port identity
   auth routes`. PR body links the task yaml and lists the receipts.
5. **Receipts or it didn't happen**: PR must attach
   `.syllabai/receipts/T-MIG-xxx/<run>.json` — CI run ids, golden replay
   output, capture logs. The frozen org's culture (postflight_result.json,
   bench receipts) continues here unchanged.

## 3. Parallelism model (how "quick catch-up" is achieved safely)

- **Three serialised points only:** contracts → implementation → golden
  gate. Everything else runs in parallel.
- **The capture lane runs one wave ahead** of the port lane (R6 records
  Wave N+1's golden cases while R3/R4 port Wave N). Capture is the
  migration's metronome — see `docs/MIGRATION_PLAN.md` §10.
- **Wave lanes are disjoint by file ownership**, so R3 and R4 can port two
  domains simultaneously (e.g. W2 content-read in lane A while W3 assessment
  contracts land in lane B).
- **Neon branches per task** (`t-mig-xxx/<role>`) mean even DB-touching work
  never contends on state. See `BASELINE_DB.md`.

## 4. Task yaml format (same convention as master-pack T-C42)

```yaml
version: 1
task:
  id: T-MIG-010
  title: "Port identity/auth module to apps/api (Wave 1)"
  owner: "unassigned"          # agent id + session once claimed
  status: OPEN                 # OPEN|CLAIMED|IN_PROGRESS|IN_REVIEW|DONE|BLOCKED
  priority: P1
  wave: 1
  deps: [T-MIG-001, T-MIG-002]
  execution_record: >          # filled by the doing agent; append, never rewrite
    (what was done, evidence links, deviations from plan, findings)
base:
  repo: "syllabai-v2 @ <sha at claim time>; frozen refs: syllabai-core @ main,
    syllabai-hub @ 93226a43"
basis: >
  Operator directive 2026-10-04 trace 347fbb29…; MIGRATION_PLAN.md §5 Wave 1.
scope:
  allowed:
    - "apps/api/src/routes/auth/**"
    - "apps/api/src/middleware/rbac.ts"
    - "packages/contracts/src/auth.ts"
    - ".syllabai/tasks/T-MIG-010.yaml (status/execution_record only)"
  forbidden:
    - "apps/hub/** (R5's lane)"
    - "packages/db/** (R2's lane)"
    - "syllabai-core / syllabai-hub (frozen, C1)"
```

## 5. In-repo worklog protocol

`.syllabai/worklog.md` is append-only (same discipline as the operator's
own worklog). After finishing a task (or a meaningful attempt), append:

```markdown
---
Task ID: T-MIG-xxx
Agent: <role><n> (<agent id>)
Task: <one line>

Work Log:
- <concrete steps>

Stage Summary:
- <results / decisions / deviations>
```

Never rewrite or reorder existing entries. Conflicts with another agent's
append: `git pull --rebase` and re-append; the log is append-only by design.

## 6. Escalation ladder

1. **Blocked by code** (contract gap, missing schema): task → `BLOCKED`,
   file a dependency task, notify R0 in the PR.
2. **Blocked by parity** (golden case fails, cause not understood):
   do NOT weaken the case or widen the contract. Record the diff in the
   receipt; R0 + R6 decide: fix port, or document a justified divergence
   (operator-visible).
3. **Blocked by doctrine** (this doc + MIGRATION_PLAN don't cover it):
   stop, write the question into the task's `execution_record`, wait for
   the operator. Improvisation is how migrations rot.
4. **Secrets/PII observed in any fixture or log**: halt the lane, report to
   R0 immediately. Scrub before anything is committed (GOLDEN_MASTER.md §3).

## 7. Anti-patterns (instant review rejection)

- Widening a zod schema to make a test pass.
- A 200 response where the Java core returns 4xx/5xx (or the reverse) —
  "to make the hub work".
- Hand-editing `packages/db/src/schema` instead of `drizzle-kit pull`.
- Touching `flyway_schema_history`.
- Writing to `syllabai-core` / `syllabai-hub` for ANY reason (C1).
- Skipping the receipts.
- Reordering or editing past worklog entries.

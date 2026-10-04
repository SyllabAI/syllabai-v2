# Database Baseline — one Neon, Drizzle from the end-state

> Operator constraint: **the same Neon database** (2026-10-04 directive).
> Nothing here creates a second database, and nothing here manages the
> schema against Flyway's will.

## 1. The doctrine: baseline, never replay

The frozen Java core owns 63 Flyway migrations (V1..V61+). Their NET EFFECT
on the Neon schema is the contract. The v2 platform:

1. Never replays migration history in TypeScript.
2. Generates its Drizzle schema FROM the live database:
   ```bash
   # against a Neon BRANCH (never production main branch):
   DATABASE_URL="postgresql://…<branch-url>…" bun run --cwd packages/db db:pull
   ```
   `drizzle-kit pull` introspects the live schema into
   `packages/db/src/schema/*` — the baseline commit.
3. From baseline on, Drizzle migrations are ADDITIVE only, and only for
   v2-owned structures. Any column/table the Java core owns is read/write
   at the row level but never altered structurally by v2.

## 2. Neon branch strategy (also the multi-agent isolation model)

| Branch | Purpose |
|--------|---------|
| `production` (main) | Java core serves it today; v2 api attaches at cutover only |
| `t-mig-002/r2` | db baseline introspection |
| `t-mig-xxx/<role><n>` | per-task sandboxes — golden capture for write surfaces, integration runs |
| `golden-capture/<date>` | snapshot used to serve capture traffic for write endpoints |

Neon branches are copy-on-write — every agent gets production-shaped state
without production risk. This replaces the Java world's Testcontainers IT
database (the container daemon now only exists in CI, invisible).

## 3. Verification checklist (T-MIG-002 exit criteria)

- [ ] `drizzle-kit pull` output committed under `packages/db/src/schema/`.
- [ ] Table inventory diff vs `flyway_schema_history` contents: every table
      accounted for (modelled OR explicitly listed as core-owned-untouched).
- [ ] Row-count spot checks on a branch vs the same counts read through the
      Java core (or its seeded receipts): papers, questions, attempts,
      validated pool counts.
- [ ] pgvector extension + embedding tables present with correct dimensions.
- [ ] `flyway_schema_history` present and EXCLUDED from Drizzle management —
      documented in the schema folder README, never dropped, never renamed.
- [ ] Env mapping verified: `SYLLABAI_DATABASE_URL`
      (`jdbc:postgresql://ep-…neon.tech/syllabai?sslmode=require`) maps to
      `DATABASE_URL` by dropping the `jdbc:` prefix; same credentials.
      (`packages/db/src/client.ts` refuses `jdbc:`-prefixed URLs and blanks.)

## 4. Interaction rules with the frozen schema

1. **Read/write rows freely** (v2 owns its ports' behaviour), **alter
   structure never** while the Java core is live — a Drizzle migration that
   reshapes a Flyway-owned table would break the running core. This is the
   hardest technical constraint of the whole migration; treat any urge to
   "improve the schema" as an escalation (AGENT_COORDINATION §6.3).
2. New v2-only tables (e.g. golden capture bookkeeping) are allowed on
   branches pre-cutover, but must be listed in the schema README with their
   owning task id.
3. The nightly decay job moves to Vercel Cron at cutover — until then the
   Java core's scheduler keeps running; v2 must NOT double-schedule decay
   against the same branch (double-decay is a correctness bug, not a
   perf bug).

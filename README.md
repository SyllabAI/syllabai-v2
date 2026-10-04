# syllabai-v2

TypeScript monorepo for the SyllabAI platform migration: the Java backend
(`SyllabAI/syllabai-core`, frozen) and the product frontend
(`SyllabAI/syllabai-hub`, frozen) are being re-platformed here as
**apps/api** (Hono + Drizzle + Neon serverless) and **apps/hub** (imported
Next.js frontend), sharing **packages/contracts** as the single source of
API truth.

**Both upstream repos stay as-is.** Nothing is ever written to
`syllabai-core` or `syllabai-hub` during the migration. This repo connects
to the **same Neon Postgres database** — the database does not move.

## Layout

```
apps/
  api/                 # TS backend port target (Hono, zod, Drizzle, Neon)
  hub/                 # imported syllabai-hub @ 93226a43 (see PROVENANCE.md)
packages/
  contracts/           # zod schemas — the API contract, ported from core DTOs
  shared/              # cross-app logic (mathNormalize-class parity code)
  db/                  # Drizzle client + schema (baselined from core's Flyway end-state)
golden/                # golden-master parity harness (Java core vs v2 api)
docs/                  # MIGRATION_PLAN, AGENT_COORDINATION, GOLDEN_MASTER, BASELINE_DB, REFERENCE_DOCS
.sy/
  syllabai/tasks/      # T-MIG-xxx task files (same yaml convention as the master pack)
  syllabai/worklog.md  # append-only multi-agent worklog
.github/workflows/ci.yml
```

## Quickstart

```bash
bun install
bun run typecheck
bun test
bun run dev:api        # api on :8080 — GET /actuator/health is live day one
```

## Read this before writing any code

1. `docs/MIGRATION_PLAN.md` — the plan: waves, exit gates, risk register.
2. `docs/AGENT_COORDINATION.md` — how 6–9 agents claim tasks without collisions.
3. `docs/GOLDEN_MASTER.md` — the parity gate every ported module must pass.
4. `docs/BASELINE_DB.md` — how the Drizzle schema is baselined from the
   frozen Flyway end-state (never by replaying 63 migrations).
5. `docs/REFERENCE_DOCS.md` — index of the frozen upstream docs this migration relies on.

## Non-negotiable rules

- **core/hub freeze**: no commits, issues, or PRs against `syllabai-core` /
  `syllabai-hub` as part of this migration.
- **Contracts first**: no endpoint gets implemented before its zod schema
  exists in `packages/contracts` and is diffed against the Java DTO.
- **Golden-master gate**: a module is "ported" only when its recorded
  golden cases pass against the v2 api. Working code that fails parity is
  not done — it is a divergence to be explained or fixed.
- **Fail fast, fail loudly** — the Java core's boot discipline
  (blank JWT secret = refuse to start) carries over verbatim.

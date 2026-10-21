# syllabai-v2

TypeScript monorepo and, since the **2026-10-13 cutover**, the **only system
of record** for SyllabAI (api-of-record `syllabai-v2.vercel.app`, hub-of-record
`syllabai-hub-v2.vercel.app`). The Java backend (`SyllabAI/syllabai-core`,
archived read-only) and the product frontend (`SyllabAI/syllabai-hub`, archived
read-only) were re-platformed here as **apps/api** (Hono + Drizzle + Neon
serverless) and **apps/hub** (imported Next.js frontend), sharing
**packages/contracts** as the single source of API truth. The migration is
**COMPLETE** — 100% migrated, zero-core census LIVE=0, the census gate is
CI-enforced (`scripts/preflight_zero_core_census.py --gate` in `ci.yml`) — see
`docs/MIGRATION_REPORT.md` here and `CUTOVER_RETIREMENT_2026-10-13.md` in the
master pack repo `SyllabAI/syllabai`.

**The upstream repos stay as-is.** Nothing is ever written to
`syllabai-core` or `syllabai-hub`. This repo connects to the **same Neon
Postgres database** — the database does not move.

## Layout

```
apps/
  api/                 # TS backend port target (Hono, zod, Drizzle, Neon)
  hub/                 # imported syllabai-hub @ 93226a43 (see PROVENANCE.md)
packages/
  contracts/           # zod schemas — the API contract, ported from core DTOs
  shared/              # cross-app logic (mathNormalize-class parity code)
  db/                  # Drizzle client + schema (baselined from core's Flyway end-state)
books/                 # interactive-book authoring workspaces, per qualification (4ch1 pilot)
golden/                # golden-master parity harness (Java core vs v2 api)
docs/                  # MIGRATION_PLAN, AGENT_COORDINATION, GOLDEN_MASTER, BASELINE_DB, REFERENCE_DOCS, books/
.syllabai/
  tasks/               # T-MIG-xxx / T-BOOK-xxx task files (same yaml convention as the master pack)
  receipts/            # byte-exact receipts of record
  worklog.md           # append-only multi-agent worklog
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
6. `docs/books/BOOKS-START-HERE.md` — **if you are building or extending an
   interactive book** (the `T-BOOK-xxx` band): the three-layer storage model,
   the pack pipeline (S0–S4, gates G1–G4), the self-improvement law, and the
   new-subject checklist. Book doctrine lives under `docs/books/`; authoring
   workspaces under `books/<qual>/`.

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

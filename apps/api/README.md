# @syllabai/api

The TypeScript port target of the frozen Java core. Hono + zod (contracts)
+ Drizzle (db). Deployed to Vercel; runs locally with `bun run dev:api`.

Current state (seed commit):

- `GET /actuator/health` — LIVE, path- and shape-parity with the Java core.
- `POST /api/auth/register|/login` — validation LIVE via `@syllabai/contracts`
  (same accepted/rejected sets as the Java DTOs), handlers return honest 501
  until T-MIG-002 (db baseline) + T-MIG-010 (identity port) land.

Port order, per-module rules, and exit gates: `docs/MIGRATION_PLAN.md`.

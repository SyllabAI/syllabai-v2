# @syllabai/db

Drizzle ORM over the Neon serverless driver — pointed at the **same Neon
database** the frozen Java core uses. The schema is NOT hand-written: it is
generated from the live database end-state by `bun run --cwd packages/db
db:pull` (drizzle-kit pull) against a **Neon branch**, per
`docs/BASELINE_DB.md` and task T-MIG-002.

Hard rules:

1. Never run migrations that fight the Flyway-managed state. The baseline
   is the END-STATE of V1..V61+, not a replay of the history.
2. `flyway_schema_history` stays. Drizzle owns nothing it did not model.
3. Every db task runs on a Neon branch named after its task id
   (`t-mig-xxx/<agent>`), never directly on production.

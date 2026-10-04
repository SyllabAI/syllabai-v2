# packages/db — generated schema (T-MIG-002 baseline)

**This directory is GENERATED.** The introspection source of truth is the
live Neon end-state of the frozen Java core's Flyway migrations (V1..V61+,
63 rows in `flyway_schema_history`). It was captured by `drizzle-kit pull`
against the task branch, never hand-authored. Re-baselining procedure is at
the bottom of this file.

- Baseline captured: 2026-10-04T18:27Z (task T-MIG-002, branch `t-mig-002/r2`)
- Neon project: `billowing-cherry-15418366` ("SyllabAI", pg 18)
  - source branch: `t-mig-002/r2` (`br-dry-sun-a5wsx9n1`, copy-on-write of
    production `br-muddy-bar-a5huwldd`) — production itself was only ever
    the parent of the copy; zero reads/writes against production compute.
- Introspected: 62 tables · 579 columns · 87 indexes · 54 foreign keys ·
  98 check constraints · 0 views · 0 enums (live==snapshot==runtime verified,
  see `.syllabai/receipts/T-MIG-002/`)

## Files

| File | Origin |
|---|---|
| `schema.ts` | drizzle-kit 0.31.11 `pull` output + two logged deterministic renderer fixes (see "Renderer fixes") |
| `relations.ts` | drizzle-kit 0.31.11 `pull` output (byte-identical) |
| `custom_types.ts` | generated-companion shims for `bytea` / `tsvector` (column types with no native pg-core helper in the declared drizzle-orm 0.38.x) |
| `../drizzle/0000_organic_mauler.sql` | drizzle-kit pull's reference DDL snapshot of the end-state |
| `../drizzle/meta/0000_snapshot.json` | drizzle-kit introspection snapshot (the machine-readable baseline) |
| `../drizzle/meta/_journal.json` | drizzle-kit journal |

## flyway_schema_history — core-owned, NEVER managed by Drizzle

`flyway_schema_history` is present in the generated schema (62/62 tables are
modelled — none omitted silently) but is **Flyway-owned forever**:

- Drizzle must never DROP, RENAME, ALTER, or "clean up" it or any table the
  Java core owns. `drizzle-kit` output is kept verbatim so nothing is hidden.
- Drizzle migrations from baseline onward are **additive only** and only for
  v2-owned structures, per `docs/BASELINE_DB.md` §4.
- `docs/BASELINE_DB.md` is untouched by generation; this README is the
  schema-side record of the exclusion.

## Core-owned bookkeeping tables (present, untouched by v2 writes)

`flyway_schema_history` (V1..V61+, 63 rows at capture) ·
`campaign_db_identity` (boot-upserted campaign identity, core §1b) ·
`decay_job_runs` (V38 nightly-decay ledger — v2 Cron stays env-gated OFF
until Wave-7 cutover, see BASELINE_DB §4.3) ·
`archive_tc27_card_wave_20260928` (T-C27 archive) ·
`bootstrap_admin_state` · `model_versions` / `prompt_versions` /
`experiments` (§19 registries).

## Row-count spot checks at capture (SELECT-only, on the branch)

`users` 322 · `exam_papers` 108 · `questions` 1,526 · `question_versions`
1,526 · `attempts` 217 · `flashcard_ratings` 28 · `skill_states` 187 ·
`documents` 877 VALIDATED + 146 REJECTED (0 SUGGESTED) ·
`document_chunks` 4,740 total, 4,740 embedded, 4,740 at `embed_rev = 2`.
(The validated pool at embed_rev=2 was 2,935 in the T-C42 record of
2026-10-02; the growth to 4,740 is the wave-2 teacher-validation expansion
recorded there — content-ops history, not an introspection discrepancy.)

pgvector: extension `vector` 0.8.6 present; single vector column
`document_chunks.embedding vector(768)` (Gemini text-embedding-004
dimension, T-013 contract).

## Renderer fixes applied to drizzle-kit 0.31.11 output (logged, deterministic)

drizzle-kit 0.30.6 (the version `packages/db/package.json` declares) cannot
complete `pull` on this database at all: (a) it hard-imports
`drizzle-orm/gel-core`, which the declared drizzle-orm 0.38.x does not
export; (b) even with a newer orm, its internal squasher crashes on a null
`expression` index column present in this schema (ZodError "Expected string,
received null" at path `…columns.2.expression`). kit 0.31.11 completes the
pull but renders two constructs wrong; both fixes are applied by a script
(idempotent, logged site-by-site in the task receipt) and verified
programmatically — 579/579 columns match the snapshot after fixing:

1. `.default(')` → `.default('')` — 5 sites where the DB default is the
   empty string (kit dropped the closing quote).
2. `unknown("col")` → `bytea("col")` / `tsvector("col")` — 3 sites; kit
   emits `unknown(...)` for types with no pg-core helper and never imports
   it (unresolvable on any orm version). Shims live in `custom_types.ts`
   and map the DB types exactly.

**Dependency follow-up for the lane owner (not done here — outside this
task's fence):** `packages/db/package.json` declares `drizzle-kit ^0.30.0`
+ `drizzle-orm ^0.38.0`, a pair that cannot run `db:pull`. Recommend
aligning (e.g. kit 0.31.x + orm ≥ the version whose pg-core exports the
column types above, or pin kit 0.31.11 + orm 0.45.x and regenerate) in a
task that owns `packages/db/package.json`.

## Re-baseline procedure (never regenerate by hand)

1. Create/refresh a task-named Neon branch (copy-on-write of production —
   never pull against production itself).
2. Run `drizzle-kit pull` with `DATABASE_URL` pointing at that branch (an
   isolated toolchain is acceptable while the package.json pair is broken —
   see above; record tool versions in the receipt).
3. Re-apply the renderer-fix script; typecheck `packages/db`; re-run the
   §3 verification checklist; append a receipt; update this header with the
   new capture date and counts.

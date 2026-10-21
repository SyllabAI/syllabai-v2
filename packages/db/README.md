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

## v2-owned structures beyond the baseline (BASELINE_DB.md §4.2 registry)

Additive v2-native tables, each with its owning task. Core-era tables are
NEVER altered structurally — feature state that "belongs to" a core-era row
(e.g. `classes`) rides a v2-native side table instead.

| Table | Owning task | Migration | Law |
|---|---|---|---|
| `book_chapters`, `book_blocks`, `book_glossary_terms`, `chapter_progress` | books band (T-BOOK) | 0005, 0002 | ADR-BOOK-0001 |
| `cla_threads`, `cla_thread_messages` | T-MIG-04x DC6 sync tier | 0004 | DC6-CLA-SYNC-TIER-PLAN |
| `class_features` | T-TEACH-002 | 0006 | ADR-CLASS-0001 (side table for the Flyway-era `classes`; row-absent = all ON) |
| `course_registry` | T-TEACH-002 | 0006 | ADR-CLASS-0001 (COPIES `apps/hub/content/courses.json` via `scripts/seed-course-registry.ts` — never derived) |
| `teaching_coverage_events`, `teaching_coverage` | teacher band | pre-0006 era | TEACHER_ARCHITECTURE.md |
| `learner_course_enrolments` (exam targets, roster) | teacher band / T-TEACH-001 | pre-0006 era | T-TEACH-001 receipt |


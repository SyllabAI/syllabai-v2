# Seneca resource packs — plan of record (T-SENECA-001)

Operator commission (2026-10-23, trace `1a1651ae815dc3d5`): the teacher dashboard is
`syllabai-hub-v2.vercel.app`; there is already an assignment creator — **add the option
there**; resources are linked **only to courses that exist in SyllabAI** (example: Edexcel
IGCSE Chemistry 4CH1); **no course filterer** is needed because the resources are already
course-linked.

## 1. What exists (verified against the tree)

- The assignment creator: `apps/hub/src/app/teacher/assignments/assignments-client.tsx` —
  subject selector → subtopic checkboxes → `POST /api/teacher/assemble` (bank assembly) →
  `POST /api/v1/teacher/assignments` (frozen T-MIG-117 wire, fail-closed curriculum
  target validation). Learners: `/learner` assignments tab deep-links spec refs into the
  practice flow; hand-ins append into `assignment_submissions`; the roster is computed.
- Courses: `apps/hub/content/courses.json` — 94 registered; pilot `igcse-chemistry-19`
  (Edexcel IGCSE Chemistry, 4CH1).
- The content corpus of record for this feature: the operator-approved Seneca Resource
  Hub harvest (`SyllabAI/syllabai-experimental` @ `d67bc1e3`,
  `senecalearning/resources/captures/resource-hub-content/`; PII-scrubbed; SME attestation
  family 2026-10-23 — the same rights family the UGM lane rides).

## 2. Design decisions (and the laws they satisfy)

| # | Decision | Law satisfied |
|---|----------|---------------|
| D1 | The frozen assignments family is untouched; the option rides a **new self-contained v2-native module** `apps/api/src/routes/assignment-packs.ts` (route + service in one file, ONE mount line, own contracts file, own tests) | T-TEACH-012 self-contained fence |
| D2 | Three **additive** Neon tables: `seneca_resources` (content rows, `course_slug`-linked), `assignment_resources` (ordered task list per assignment), `assignment_resource_states` (per-learner per-task completion + server-side score). The Flyway-era `assignments` row is never ALTERed — the pack hangs off it by FK | BASELINE_DB.md §4 additive-only; 0006 side-table precedent |
| D3 | Resource **→ course linking**: each `seneca_resources.course_slug` is set at import from an explicit Seneca→hub map that ONLY contains slugs present in `courses.json` (start: `Chemistry: Edexcel iGCSE` → `igcse-chemistry-19`). Unknown slug = refuse to import (fail-closed) | operator directive "only courses in syllabai right now" |
| D4 | **No course filterer**: the hub picker fetches `/api/v1/teacher/assignment-packs/resources?course=<page course>` — the course is the page's own context; the picker offers kind tabs + topic select + search, never a course dropdown. A course with no linked library renders the honest empty state | operator directive |
| D5 | Create-path: `POST /api/v1/teacher/assignment-packs` writes the SAME `assignments` row (spec_refs `[]`, marks/count derived) + side-table tasks, so the EXISTING learner list, agenda, hand-in (`POST /api/v1/learners/me/assignments/:id/submissions`), roster and close/reopen all work unchanged. Pack ids validate fail-closed: every resource id must exist AND belong to the assignment's course (404/400 verbatim-shape errors) | V49/V51 workflow semantics; honesty rules (fail-closed targets) |
| D6 | Server-side scoring at task completion (exam question: `marksAwarded` clamped to `marksTotal`, score = marks/marksTotal; section/quiz: completion = full credit). The hand-in score is derived from states — never typed by hand | the prototype's server-scoring law; the hub's hand-in-honesty law |
| D7 | Rendering gated by `flags.json` key `senecaCourseResources` (absent flag/slug = OFF; one-flip kill). A flagged course with no committed rows renders the honest empty state | ADR-CLASS-0001 flag law |
| D8 | Learner task content ($var templates + `generationScript`) is instantiated CLIENT-side in the pack player — the same execution surface Seneca itself uses; the API never evals corpus scripts | no server-side eval of corpus code |

## 3. Surfaces

1. **Teacher creator** (`/teacher/assignments`): content-source toggle — "Question bank"
   (existing flow, unchanged) | "Seneca resources" (new): kind tabs (Notes / Exam
   questions / Quizzes), topic select (from the course's own `topic_path` census), search,
   selection tray with marks; create → pack endpoint.
2. **Learner** (`/learner` assignments tab): an assignment backed by a pack renders an
   inline "Resource pack" player — notes (markdown), exam questions (instantiated
   markdown + mark-scheme reveal + marks entry), quizzes (summary); completion posts to
   the pack endpoint; the existing hand-in flow submits the derived numbers.
3. **Teacher roster**: unchanged — packs are `assignments` rows.

## 4. Import pipeline

`scripts/import_seneca_resources.py` reads the harvest course-layer files
(`courses/edexcel-igcse-chemistry/…` + the chemistry quiz slice), scrubs PII
(creator fields — already scrubbed corpus-side, re-checked), resolves the
Seneca→hub slug map against `apps/hub/content/courses.json`, and upserts
`seneca_resources` rows into Neon (`DATABASE_URL`). Idempotent (upsert by Seneca
resource id). The corpus never ships inside this repo — the import reads the
experimental checkout path given on the CLI.

## 5. Gates

- `bun run typecheck` + `bun test` (new `apps/api/test/assignmentpacks/**`) + hub `tsc`.
- Frozen families byte-untouched (diff-checked in the PR).
- Receipts: `.syllabai/receipts/T-SENECA-001/`.

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
| D2 | Three additive tables: `seneca_resources` (content rows, `course_slug`-linked), `assignment_resources` (ordered task list per assignment), `assignment_resource_states` (per-learner per-task completion + server-side score). The Flyway-era `assignments` row is never ALTERed — the pack hangs off it by FK. **(run-004 placement supersede: `seneca_resources` re-homes to the sci-chem warehouse — see D9; the two side families ride 0014 in main, seneca FK omitted.)** | BASELINE_DB.md §4 additive-only; 0006 side-table precedent |
| D3 | Resource **→ course linking**: each `seneca_resources.course_slug` is set at import from an explicit Seneca→hub map that ONLY contains slugs present in `courses.json` (start: `Chemistry: Edexcel iGCSE` → `igcse-chemistry-19`). Unknown slug = refuse to import (fail-closed) | operator directive "only courses in syllabai right now" |
| D4 | **No course filterer**: the hub picker fetches `/api/v1/teacher/assignment-packs/resources?course=<page course>` — the course is the page's own context; the picker offers kind tabs + topic select + search, never a course dropdown. A course with no linked library renders the honest empty state | operator directive |
| D5 | Create-path: `POST /api/v1/teacher/assignment-packs` writes the SAME `assignments` row (spec_refs `[]`, marks/count derived) + side-table tasks, so the EXISTING learner list, agenda, hand-in (`POST /api/v1/learners/me/assignments/:id/submissions`), roster and close/reopen all work unchanged. Pack ids validate fail-closed: every resource id must exist AND belong to the assignment's course (404/400 verbatim-shape errors) | V49/V51 workflow semantics; honesty rules (fail-closed targets) |
| D6 | Server-side scoring at task completion (exam question: `marksAwarded` clamped to `marksTotal`, score = marks/marksTotal; section/quiz: completion = full credit). The hand-in score is derived from states — never typed by hand | the prototype's server-scoring law; the hub's hand-in-honesty law |
| D7 | Rendering gated by `flags.json` key `senecaCourseResources` (absent flag/slug = OFF; one-flip kill). A flagged course with no committed rows renders the honest empty state | ADR-CLASS-0001 flag law |
| D8 | Learner task content ($var templates + `generationScript`) is instantiated CLIENT-side in the pack player — the same execution surface Seneca itself uses; the API never evals corpus scripts | no server-side eval of corpus code |
| D9 | **PLACEMENT (run-004 rework, operator ruling 2026-10-24, trace `1a16adad843081b1`)**: `seneca_resources` is a CORPUS plane — it lives in the **sci-chem course-group warehouse** (template **wh-v2** = frozen wh-v1 + the pack DDL fragment, `scripts/provisioner/wh-v2-fragment-seneca-resources.sql`), NEVER in main. The module takes two sql seams: MAIN (course_registry, classes, assignments + the two side families on **0014**) and the warehouse pooler client built from `SYLLABAI_WAREHOUSE_URL_SCI_CHEM` (the env NAME the `warehouse_registry` row stores — 0013 naming law; run-005 pooler law). The former main-side JOIN is split — positions on main (`assignment_resources`), content on the warehouse by id — ids are the contract (§4.1), NO cross-project FK (0014 omits it; run-002's pre-ruling FK drops at T1); D5 validation stays app-side. Absent env = NULL seam → 503 `warehouse_unavailable` (fail loud, never a silent empty library; D7 keeps the UI dark). Importer writes the warehouse; the `course_registry` re-check stays on MAIN. T1 order: provision wh-v2 → parity-verified row migration (counts by kind, distinct ids, PII rescan 0, spot-content hashes) → zero-residue main drop → registry seed sci-chem/wh-v2/ASSIGNED → Vercel env → the operator's serving flip. No dual writes ever | docs/DATA-PLANE-PLACEMENT.md (RATIFIED); docs/ADR-038; receipt `.syllabai/receipts/T-SENECA-001/run-003-placement-ruling.json` |

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
Seneca→hub slug map against `apps/hub/content/courses.json`, re-checks the
slugs fail-closed against MAIN's live `course_registry` (`MAIN_DATABASE_URL`),
and upserts `seneca_resources` rows into the **sci-chem WAREHOUSE**
(`SYLLABAI_WAREHOUSE_URL_SCI_CHEM` — run-004 placement; the table DDL is the
wh-v2 template's and is never created by the script). Idempotent (upsert by
Seneca resource id). The corpus never ships inside this repo — the import
reads the experimental checkout path given on the CLI.

## 5. Gates

- `bun run typecheck` + `bun test` (new `apps/api/test/assignmentpacks/**`) + hub `tsc`.
- Frozen families byte-untouched (diff-checked in the PR).
- Receipts: `.syllabai/receipts/T-SENECA-001/`.

## 6. Rollout wave — ALL mapped courses (D10; operator rulings trace `1a16fa6c496aa371`)

**Rulings of record (2026-10-25):** (1) PLACEMENT (a) — W1 (ep-calm-queen) stays the
INTERIM home for every course group's Seneca pack; dedicated course-group warehouses
later; (2) IAL — Edexcel IAL courses map to Seneca "International A Level" content;
where a subject has no IAL-tagged rows (Maths), the closest equivalent is the Edexcel
A Level (UK) family (receipt-documented); (3) VARIANTS — booster/revision/Predicted-
Papers/HyperLearning families are INCLUDED per course (the whole matching group).

**D10 — multi-course storage (wh-v3):** one Seneca resource genuinely serves SEVERAL
hub courses (Combined-award chemistry → 4SD0; an Edexcel-iGCSE maths section → 4MA1
Foundation AND Higher AND the 2024 modular units). Under PK(id) a row can only live in
one course (last-write-wins; later courses starve). wh-v3 re-shapes `seneca_resources`
to **PRIMARY KEY (id, course_slug)** — the (resource, course) pair is the unit; each
hub course gets its own library instance. DDL of record:
`scripts/provisioner/wh-v3-fragment-seneca-resources-multi-course.sql` (also widens
`course_slug` to varchar(96) — the longest hub slug is 66 chars). The live swap was the
established T1 pattern: one transaction (create v3 → carry pilot rows → drop → rename →
indexes → `warehouse_meta.template_version wh-v2→wh-v3`), parity-verified, zero
residue. **The API module needs NO change** — `where course_slug = $1` keeps its exact
semantics on per-course instances.

**Linking of record:** `scripts/rollout_import_seneca_v3.py` carries the full rule
table (82 mapped courses of 94 registered; honestly unmapped = no Seneca equivalent:
Accounting ×5, Environmental Management ×2, Further Maths/Additional/Pure ×3, Maths B
4MB1, IAL Maths Decision 1). Rows match by the harvest's own tag taxonomy (board
values `Edexcel iGCSE` / `Cambridge International` / `Edexcel`; level values `iGCSE` /
`A Level` / `AS Level` / `International A Level`; Triple/Combined; Higher/Foundation
tier gating for 4MA1 and 0580/0607). Edexcel-iGCSE science sections are Triple-tagged
by Seneca (no Combined sections exist in the harvest slices) — 4SD0 libraries carry
the Double-Award exam questions (breadcrumb `Science (Double Award) …`) + the Science
subject slice. Content fidelity: slice rows are byte-identical to the deep course
files (verified per-field against the pilot import — parity gate receipt).

**Coverage (run-007):** 58,207 (resource, course) instances / 31,233 distinct
resources / 82 courses; maths plane untouched (8,202 chunks); PII rescan 0; W1 138 MB.

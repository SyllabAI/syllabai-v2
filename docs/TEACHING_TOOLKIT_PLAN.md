# TEACHING TOOLKIT PLAN — the 4 educator-ai generators in the Teacher Dashboard

**Status:** PROPOSED (plan of record for the T-TEACH-010..016 band)
**Date:** 2026-10-22
**Source material:** reverse-engineered ZNotes educator-ai contract + working
recreation proven at 100% structural fidelity (repo `SyllabAI/syllabai-experimental`,
`znotes/research/2026-10-22-recreation.md`, `znotes/recreation/` — original prompts,
validated output schemas, fidelity anchors).

---

## 1. Goal

Put the four AI generators into the SyllabAI Teacher Dashboard:

| Tool (ZNotes title) | SyllabAI id | Output document |
|---|---|---|
| Lesson Plan Generator | `lesson-plan` | Overview / Lesson Plan / Assessment / Additional tabs |
| Rubric Developer | `rubric` | criteria × 4 levels (scores computed, not generated) |
| Curriculum Mapper | `sow` | multi-lesson scheme of work (12-field lesson cards) |
| Learning Coach | `coach` | clarify/challenge 6-section document |

**Operator directive adopted as the core design law:** teachers already have
specific classes per subject, so **the generator forms never ask for a subject**.
Subject / board / level / curriculum code are resolved server-side from the
teacher's class (or a picked class on cross-class surfaces), exactly the way
Test Builder and Assignments already resolve `?course=`.

## 2. Why this ports cleanly (evidence)

- The recreation's four output schemas were validated **field-by-field against
  4 real captured outputs** (60/60, 37/37, 38/38, 18/18 contract paths EXACT).
  The zod contracts in §5 are those schemas, typed.
- Prompt engineering is **original** (ZNotes' server prompts are unknowable) and
  model-agnostic JSON — portable to the FailoverLlmChain (groq → gemini →
  openrouter) unchanged.
- ZNotes' grounding pattern (chapter `outcomes` auto-attached verbatim as
  `learningObjectives`) maps 1:1 onto SyllabAI's `knowledge_nodes` SPEC_POINT
  tree and `book_chapters.learning_objective` — our content graph is *richer*
  (it adds per-class `teaching_coverage`).

## 3. Class-context replaces the subject picker (the mapping)

| ZNotes input | SyllabAI source | Notes |
|---|---|---|
| `userId` on the wire | **JWT identity only** (`requireRole(c,"TEACHER","ADMIN")`) | security upgrade; never accept ids that ride auth |
| Subject picker | `classes.course_slug` → `course_registry.subject/board/level/curriculum_code` | rendered as read-only context chips, not an input |
| Board / level pickers | same lookup | no UI |
| Chapter / topic picker | `knowledge_nodes` (TOPIC → SPEC_POINT via `knowledge_edges.PART_OF`) + `book_chapters` (course_id, title, learning_objective) | the only "content" input the teacher makes |
| `learningObjectives` (lesson plan) | **auto-attached verbatim** SPEC_POINT titles (or book_chapters.learning_objective) for the picked topic; teacher may deselect rows | parity with ZNotes' grounding behavior, proven in phase 2 |
| Emphasis areas / ability | teacher input (presets) + Phase C: `teaching_coverage` gaps and weakness options (`/teacher/tests/weakness-options`) preselect | class-aware differentiation |
| Learning Coach "note card" | Phase A: pasted text; Phase C: pick from `book_chapters`/`revision_note` of the class's course | |
| Quota FREE=5 / PLUS=100 | per-teacher daily counter (§6) | SyllabAI has no teacher plan tiers yet |
| Async `responseId` + 20 s poll | **synchronous** generation, smart-mark-batch posture (LLM-in-request already in production on this stack); SSE progress is a Phase D option via the tutor streaming law | no queue infra exists; $0-cost posture |

## 4. Where it lives in the dashboard

1. **Class workspace TOOLS grid** — `class-detail-client.tsx` `const TOOLS` and
   the mirror in `class-workspace-local.tsx`: a "Teaching Toolkit" card group
   (4 tools, deep-linked `/teacher/toolkit/<tool>?class=<id>&course=<slug>`).
   This follows the operator's standing rule that tools live *inside the class*.
2. **New teacher tab** — append `{ href: "/teacher/toolkit", label: "Toolkit", icon: Sparkles }`
   to `TABS` in `components/teacher/teacher-nav.tsx`. `/teacher/toolkit` renders
   a class picker (live rosters via `api.teacherClasses()`) + "My generated
   resources" history. This fulfills the on-page roadmap chip
   "Teacher AI Assistant — Phase 3".
3. **Per-class gating** — extend ADR-CLASS-0001: additive column
   `class_features.ai_toolkit boolean` (DEFAULT TRUE keeps row-absent = ON);
   toggle rides the existing `/features` endpoint + `classes-client.tsx` UI.
4. **RBAC** — hub: `<RequireAuth role="teacher">` already wraps `/teacher/*`
   via `teacher/layout.tsx`; API: `requireRole(c, "TEACHER", "ADMIN")` shell
   identical to `teachermarking.ts`.

Routes: `/teacher/toolkit` (picker + history), `/teacher/toolkit/lesson-plan`,
`/teacher/toolkit/rubric`, `/teacher/toolkit/sow`, `/teacher/toolkit/coach`
(one client component family, tool-differentiated forms; output renderers ported
from the recreation's `renderers.tsx`, already shadcn/Tailwind).

## 5. API design (precedent-accurate)

### Contracts — `packages/contracts/src/teaching-toolkit.ts`

Zod, closed enums, uuid wire ids, size caps, refusal constants; barrel
one-liner + sibling `.test.ts`. Four payload schemas (subject **absent** —
resolved server-side) and four output schemas = the validated recreation
schemas. Rough shapes:

```ts
toolkitClassContext  // { classId?, courseId, subject, board, level, curriculumCode, label }
lessonPlanInput      // { topic, duration 30..60, learningObjectives: string[] (1..12),
                     //   homework "Yes"|"No", teachingStyle?, studentAbility? }
rubricInput          // { topic, assignmentType (16 presets), assessmentType (10),
                     //   taskDescription ≤600, marksPerCriterion 4|5|8|10|12|20|25,
                     //   criteria: string[] 1..4 (16 presets) }
sowInput             // { topic, totalLessons 1..5, lessonDuration 30..180 step 15,
                     //   difficultyLevel (3), emphasisAreas 0..20, userPreferences? }
coachInput           // { mode "clarify"|"challenge", audience (5 presets), inputText ≤2000 }
```

Output schemas (`lessonPlanOutput`, `rubricOutput`, `sowOutput`, `coachOutput`)
are the exact captured contracts — key names preserved (`main_argument` /
`key_concepts` snake_case for coach; camelCase elsewhere).

### Routes — `apps/api/src/routes/teaching-toolkit.ts`

`buildTeachingToolkitRouters(env)` factory, mounted once in `index.ts`:

```
POST /api/v1/teacher/toolkit/generate          # {toolType, classId?, courseId?, data}
GET  /api/v1/teacher/toolkit/context           # ?classId= (&topicId=) → chips + outcomes + coverage stats
GET  /api/v1/teacher/toolkit/resources         # ?limit=50&type=&classId= (own rows only)
GET  /api/v1/teacher/toolkit/resources/:id     # detail (ownership-checked)
```

Handler law (per family convention):

1. `requireRole(c, "TEACHER", "ADMIN")` shell middleware.
2. Resolve class context: `classes.teacher_id = auth uid` (**ownership check**)
   → `course_registry` row → subject/board/level. Missing class ⇒ 404
   `class_not_found`; archived class ⇒ 409.
3. Gate: `class_features.ai_toolkit` (row-absent = ON) and daily quota (§6) —
   429 `toolkit_quota_exhausted` with reset time.
4. LLM via the standard seam: `seams.chain ?? buildLlmChain(env)`, new bridge
   `chainAsToolkitGenerator(chain)` in `llmchain/bridges.ts` —
   `temperature 0.5`, `maxTokens 8000`, `reasoningEffort "low"`.
5. JSON wall: extract `{...}` (fence-tolerant), **zod parse as the boundary**,
   one self-heal retry that feeds the parse error back to the model
   (port of the recreation's proven loop). Both attempts 400-law-logged in the
   row's `failure_reason` on hard failure.
6. Persist (§6) and return `{ resource, output, elapsedMs, model }`.
7. Envelope law: unreadable body → 400 `malformed_body`; contract failure →
   400 `validation_failed "field: message"`; `apiError()` shapes throughout.

`prompt_versions` registration (existing registry pattern): rows
`teaching-toolkit/lesson-plan|rubric|sow|coach`, version `1.0`, template =
the recreation's prompts (verbatim from `znotes/recreation/src/lib/prompts.ts`).

### Persistence — additive migration `packages/db/drizzle/0008_teaching_toolkit.sql`

```sql
CREATE TABLE teaching_toolkit_resources (
  id uuid PK DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES users(id),
  class_id uuid REFERENCES classes(id),          -- null = ad-hoc (no class context)
  course_slug varchar(64) NOT NULL,
  tool_type varchar(16) NOT NULL,                -- lesson_plan | rubric | sow | coach
  input_metadata jsonb NOT NULL,                 -- prompt inputs + resolved context chips
  output jsonb,                                  -- generated document (null until success)
  status varchar(12) NOT NULL DEFAULT 'SUCCESS', -- SUCCESS | FAILED
  model varchar(120), provider_name varchar(40),
  failure_reason varchar(500),
  elapsed_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_toolkit_resources_teacher ON teaching_toolkit_resources (teacher_id, created_at DESC);

CREATE TABLE teaching_toolkit_usage (
  teacher_id uuid NOT NULL REFERENCES users(id),
  usage_day date NOT NULL,
  used integer NOT NULL DEFAULT 0,
  PRIMARY KEY (teacher_id, usage_day)
);

ALTER TABLE class_features ADD COLUMN ai_toolkit boolean NOT NULL DEFAULT true;
```

Append-only results (smart_mark_results posture); schema README updated with
owning task id. No Flyway-era table is touched.

### Quota

`SYLLABAI_TOOLKIT_DAILY_LIMIT` (default **25/day/teacher** — ZNotes gives 5
free / 100 paid; SyllabAI's $0-cost chain budget (`SYLLABAI_LLM_DAILY_BUDGET`,
default 1000) comfortably covers 25). Counter upserted in
`teaching_toolkit_usage`; checked before the chain call; surfaced in the UI as
"n / 25 today". Rate-limit: add the route to the existing **llm tier** keying
(`middleware/ratelimit.ts` — currently keys tutor/cla/transcribe/smart-mark;
toolkit keys on teacher identity the same way).

## 6. Hub UI design (no subject field anywhere)

**Common shell** (`/teacher/toolkit/[tool]/client.tsx`):
- Header context chips (read-only): `Subject · Board · Level · Curriculum code`
  + class name — the visual replacement for the removed subject picker.
- Loading: the recreation's staged progress UX (ZNotes' pending → processing →
  success strings), direct-await note.
- Output: ported renderers (tab structures identical to ZNotes'), then export
  row — Phase D (JSON now, PDF print / DOCX via docx later, CSV for rubric).
- History strip: last resources for this class (deep-link `?resourceId=`).

**Per-tool form deltas vs the recreation:**

| Tool | Removed (class-resolved) | Kept from recreation presets | SyllabAI-native additions |
|---|---|---|---|
| lesson-plan | subject, board/level | duration 30–60 slider, teaching style (9), ability (4), homework Y/N | topic picker = spec tree / book chapters; **objectives auto-attached verbatim, read-only checklist** (deselect allowed) |
| rubric | subject | assignment type (16), assessment type (10), task description, marks/criterion (4/5/8/10/12/20/25), criteria (16, ≤4) | topic prefill from last picked topic; scores computed client-side (100/75/50/25%) |
| sow | subject, board, level | lessons 1–5, duration 30–180, difficulty (3), emphasis areas (20), preferences | topic-range picker on the spec tree; Phase C: "resume from first untaught spec point" (teaching_coverage) |
| coach | subject | mode clarify/challenge, audience (5) | Phase C: attach book chapter / revision note as the passage |

## 7. Task cards (T-TEACH-010..016 band, filed as yaml)

| id | title | size | deps | allowed fences (abridged) |
|---|---|---|---|---|
| T-TEACH-010 | contracts + prompt registry seeds + chain bridge `chainAsToolkitGenerator` | M | — | `packages/contracts/src/teaching-toolkit*`, `apps/api/src/services/llmchain/bridges.ts` (additive) |
| T-TEACH-011 | migration 0008 + schema README + drizzle pull check | S | 010 | `packages/db/drizzle/0008*`, `packages/db/src/schema/*` |
| T-TEACH-012 | toolkit routes (generate/context/resources) + quota + feature gate + tests | L | 010, 011 | `apps/api/src/routes/teaching-toolkit.ts`, `index.ts` (1 mount line), `middleware/ratelimit.ts` (llm tier line), `apps/api/test/teachingtoolkit/*` |
| T-TEACH-013 | hub: toolkit tab + class picker + history page | M | 012 | `apps/hub/src/app/teacher/toolkit/*`, `components/teacher/teacher-nav.tsx` (1 row), `lib/api.ts` (client fns) |
| T-TEACH-014 | hub: 4 tool pages (forms without subject + ported renderers) + class-workspace TOOLS cards | L | 013 | `apps/hub/src/app/teacher/toolkit/[tool]/*`, `components/teaching-toolkit/*`, both `TOOLS` arrays |
| T-TEACH-015 | grounding depth: coverage-aware SOW resume + weakness preselect + note-card passage for coach | M | 014 | routes/context extensions, toolkit components |
| T-TEACH-016 | exports (print-PDF, DOCX via docx, CSV rubric) + SSE progress (optional, tutor streaming law) | M | 014 | hub components only |

Every card: `status: OPEN`, wave `teach-toolkit-A` (010–012) / `teach-toolkit-B`
(013–014) / `teach-toolkit-C` (015–016); tests with fake chain seams (explicit
`seams.chain ?? buildLlmChain(env)`); CI gates unaffected (pure v2 additive —
zero-core census, golden master, hub build all untouched).

## 8. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Provider JSON drift (groq/gemini/openrouter) | zod wall at the boundary + 1 self-heal retry (proven in recreation across 4/4 tools); temperature 0.5; `finishReason` truncation law from the chain |
| SOW output size (4–6k tokens) | `maxTokens 8000`, lessons capped at 5; sync latency observed 12–22 s in recreation — acceptable next to smart-mark-batch |
| Vercel function limits on sync LLM | smart-mark-batch already runs LLM-in-request in production on this stack; SSE progress via the tutor law if UX needs it (Phase D) |
| Prompt drift / auditing | prompts live in `prompt_versions` (registry pattern), not in code strings |
| Cost creep | per-teacher daily quota + llm-tier rate limit + existing per-provider daily budget |
| Feature-flag shock to existing classes | `DEFAULT true` column = row-absent semantics preserved; toggle per class in the existing classes UI |

## 9. What we deliberately do NOT port from ZNotes

- `userId` on the wire (JWT identity instead), plain-text async polling
  (synchronous/optional SSE), their server prompts (unknowable), their content,
  their quota tiering (no teacher plans yet).

# ADR-CLASS-0001: Class-scoped AI-feature toggles — the side-table law, the anchor-strength enforcement tiers, and the course_registry bridge

| | |
|---|---|
| **Status** | ACCEPTED (operator-ordered queue T-TEACH-002; trace lineage 1a15ece07422fcd9 → this task) |
| **Band** | `T-TEACH-xxx` (teacher platform) |
| **Task** | T-TEACH-002 |
| **Date** | 2026-10-21 |
| **Basis** | ADR-015 (class = authorization overlay); ADR-025 (Smart Mark contract); ADR-027 D1 (enrollment scoping); `apps/hub/docs/TEACHER_MODE_PLAN.md` Phase 3 (operations); `docs/BASELINE_DB.md` §4 (frozen-schema interaction rules); DC6-CLA-SYNC-TIER-PLAN §8 (byte-untouched fences); `apps/hub/content/courses.json` (the course registry of record) |

The Cycle-1 pilot (Edexcel IGCSE Chemistry 4CH1, ~50 resit students, 8 weeks)
needs the classroom teacher to be the authority over which AI features reach
their class members: Smart Mark auto-grading (test-condition sessions), the
tutor and the CLA (supervised sessions). ADR-015 made the class an
authorization overlay; this ADR gives the overlay its policy switches, with
the enforcement honesty stated per surface instead of implied.

## Context: the anchor inventory is UNEQUAL

Server-side enforcement needs the course anchor of an interaction. The three
surfaces carry anchors of different strength, measured on the wire and in the
schema of record:

1. **Tutor** (`POST /api/v1/tutor/ask`, `/ask/stream`): the request body
   carries `courseRef` (V53 opaque hub course reference, optional) and the
   optional `sessionId` resolves `tutor_sessions.course_ref` server-side.
   A real, resolvable anchor in both paths — with the disclosed gap that a
   body `courseRef` is client-declared (the hub always sends it; a
   hand-rolled client could omit it, and the frozen contract keeps it
   optional, so parity forbids making it mandatory).
2. **CLA** (`POST /api/v1/learners/me/cla/ask`): the ask wire is STATELESS —
   `{ kind, rootId?, topicNodeId?, questionId?, partId?, specCode?, noteId?,
   mode, question }`, no thread binding, no courseRef. The `CHECK` kind's
   `questionId` resolves through `questions → exam_papers → subjects →
   curriculum_versions.code`; the other kinds anchor to knowledge nodes and
   revision notes, whose rows carry NO course slug and no derivable path to
   one (the node tree is code-keyed global; `revision_note` has no course
   column).
3. **Smart Mark** (`POST /api/v1/learners/me/attempts/{id}/smart-mark` + the
   two feedback actions): the attempt resolves `attempts → questions →
   exam_papers → subjects → curriculum_versions.code`. The same terminal gap
   as CLA-CHECK: `curriculum_versions.code` (e.g. `4CH1-2017`) does not map
   to a course slug (e.g. `igcse-chemistry-19`) by any derivable rule — the
   hub registry says so explicitly ("EXPLICIT hub-maintained data, never
   derived").

The missing link for the question-chain surfaces is a COPY of the hub
registry, not a derivation: `apps/hub/content/courses.json` maps 49 of its 94
courses to a `curriculumCode` (37 distinct values; 7 of them are shared by
multiple slugs — the maths variants — so the bridge is one-to-many and the
gate's matching law must be conservative); 45 courses (the Edexcel IAL
family among them) carry none and stay unanchorable for question-chain
surfaces until the operator backfills the registry. The pilot course row is
the proof case: `igcse-chemistry-19 ↔ 4CH1-2017`.

## Decisions

### 1. The toggles live in a v2-native side table, never on the core-era row

`classes` is a Flyway-era table (the 0000 baseline replay creates it; the
classroom routers are parity ports of `TeacherClassController`). The frozen
schema law (`BASELINE_DB.md` §4.1) forbids structural alteration of core-era
tables; this ADR does NOT carve a retirement-posture exception — the
`T-MIG-139` constraint-swap precedent stays confined to its own ratified
card. The feature state therefore lives in a NEW v2-owned table:

```sql
CREATE TABLE "class_features" (
  "class_id"   uuid PRIMARY KEY REFERENCES "classes"("id") ON DELETE CASCADE,
  "smart_mark" boolean NOT NULL DEFAULT true,
  "tutor"      boolean NOT NULL DEFAULT true,
  "cla"        boolean NOT NULL DEFAULT true,
  "updated_at" timestamptz NOT NULL,
  "updated_by" uuid
);
```

Row-absent = every feature ON (the default the pilot inherits; every
captured parity body stays byte-identical). Writes are UPSERTs; reads are
LEFT JOINs with COALESCE. Zero bytes of the core-era table change.

### 2. The course_registry bridge: copied, never derived, seeded verbatim

A new v2-owned table copies the hub registry verbatim (COPIED, not derived —
the registry's own never-derived law is honored by making the API a consumer
of the file of record):

```sql
CREATE TABLE "course_registry" (
  "course_slug"     varchar(100) PRIMARY KEY,
  "curriculum_code" varchar(50),
  "level"           varchar(40)  NOT NULL,
  "subject"         varchar(100) NOT NULL,
  "code"            varchar(20)  NOT NULL,
  "board"           varchar(50),
  "label"           varchar(160),
  "status"          varchar(16)  NOT NULL,
  "source"          varchar(200) NOT NULL,
  "synced_at"       timestamptz  NOT NULL
);
CREATE INDEX "ix_course_registry_cc" ON "course_registry" ("curriculum_code")
  WHERE "curriculum_code" IS NOT NULL;
```

Seeding is an explicit, idempotent, committed script
(`scripts/seed-course-registry.ts`) reading
`apps/hub/content/courses.json` — full-row upsert with `source` pinning the
provenance file. The seed is an OPERATOR/agent step with a receipt, never an
api-boot side effect (fail-fast boot law; no surprise writes). The sync law:
when the hub registry changes, the seed re-runs and the receipt discloses the
delta; drift is operational and honest, never silent. The gate DEGRADES
gracefully when the table is empty or a course has no `curriculumCode`:
question-chain anchors resolve to zero slugs and the surface stays open —
the anchor-strength law below owns that honesty. `course_registry` is listed
as a v2-owned structure with its owning task id per `BASELINE_DB.md` §4.2.

### 3. The gate law: conservative union, fail-closed, cost-zero denial

Feature `F ∈ {tutor, cla, smart_mark}` is DENIED for learner `L` on anchor
slug set `S` iff `L` has a membership in an ACTIVE class whose
`course_slug ∈ S` and whose `F` toggle is OFF (COALESCE default ON).
The union is CONSERVATIVE: multi-slug bridges (the maths variants) and
multi-class memberships deny if ANY matching class denies — a teacher's
guarantee for their class cannot be weakened by another teacher's choice.
Independent learners (no memberships) and ARCHIVED classes are unaffected.
Denial answers `403` with `code = "feature_disabled_by_teacher"` and a FIXED
client-safe message (the GlobalExceptionHandler discipline: bodies never
embed internals), and fires BEFORE any pipeline or LLM spend — the deny path
is cost-zero.

### 4. The anchor-strength law: enforcement is per-surface honest, never pretended

| Surface | v1 disposition | Anchor |
|---|---|---|
| Tutor `/ask` + `/ask/stream` | **ENFORCED** | body `courseRef` ?? bound session's `course_ref` — direct slug match, no bridge needed |
| CLA ask, kind `CHECK` | **ENFORCED** | `questionId` → question chain → `course_registry` bridge |
| Smart Mark (all three POSTs) | **ENFORCED** | attempt chain → `course_registry` bridge |
| CLA ask, other kinds | **OPEN (disclosed)** | node/note anchors do not reach a slug; named fix: knowledge-node curriculum anchoring is a separate data-plane task |
| Tutor ask, blank `courseRef` + no session | **OPEN (disclosed)** | parity keeps the field optional; the hub always sends it |
| Registry-less courses (45) | **OPEN (disclosed)** | no `curriculumCode` → question-chain surfaces unanchorable until operator backfill |

Unresolvable references (unknown question/attempt ids) stay the routes' own
404s — the gate NEVER fabricates an anchor, and an anchorless request passes
through unchanged. The gate is a policy gate, not an existence oracle.

### 5. Enforcement lives at the composition root, byte-zero in the frozen routes

`DC6-CLA-SYNC-TIER-PLAN` §8 pins `routes/cla.ts` at ZERO bytes; the tutor and
smartmark routers are capture-parity surfaces with the same discipline
respected. The gate therefore wraps the MOUNTED routers in `src/index.ts`
(the composition root owns wiring; the routes own their frozen behavior):

- `app.route("/api/v1/tutor", gated(tutor.tutorRoute))`
- `app.route("/api/v1/learners/me/cla", gated(cla.claRoute))`
- `app.route("/api/v1/learners/me/attempts", gated(smartmark.studentRoute))`
  — the SELF-MARK mount stays unwrapped (self-marking is the learner's own
  act, not an AI feature).

The wrapper is a Hono middleware factory over named paths only; it reads a
CLONE of the request body (never consumes the stream), resolves the anchor
per surface law, consults the gate, and either passes through (every frozen
binding/validation/404 behavior byte-identical) or denies 403 before the
frozen handler runs.

### 6. The control plane: one teacher endpoint, honest views

`POST /api/v1/teacher/classes/{id}/features` — teacher-owner-gated through
the classroom service's §17 law (`ownedClass`), body
`{ smartMark?, tutor?, cla? }` (partial updates; unknown keys rejected by the
contract schema), answering the refreshed teacher class detail view. Every
teacher class view and the LEARNER classroom view carry a `features` block
(always present, defaults materialized) — the learner sees the state their
teacher set, which is the honesty surface for the pilot's "your teacher has
turned this off for this class" copy. Toggles are per-class, not
per-student; per-student overrides are explicitly out of scope (YAGNI until
a pilot need is named).

## Consequences

- Two new v2-owned tables (`class_features`, `course_registry`) + the seed
  script + one gate module + composition-root wiring; the migrations are
  additive-only and v2-native, honoring `BASELINE_DB.md` §4 to the letter.
- The pilot gets real enforcement where the anchors are real, and an honest
  recorded-state disclosure where they are not — no pretended coverage.
- Named follow-ups, in dependency order: (a) operator registry backfill for
  the 45 `curriculumCode`-less courses (data authority); (b) knowledge-node
  curriculum anchoring for the CLA non-CHECK kinds (data-plane task);
  (c) learner-side copy polish riding the existing 403 code.

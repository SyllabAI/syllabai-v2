# SyllabAI v2 Migration Plan — Java core → TypeScript monorepo

> Status: ACTIVE · Authorized by operator directive 2026-10-04 17:01Z
> (trace `347fbb29ca71934f658854f7261bdb83`): *"Create the new repo, clone
> everything needed in there. Create docs for successfully migrating to that
> repo … We will be connecting to the same neon database … core and hub repos
> … will stay as is. We have to quickly make the new repo catch up."*
>
> Companion docs: `AGENT_COORDINATION.md` (6–9 agents) · `GOLDEN_MASTER.md`
> (parity gate) · `BASELINE_DB.md` (Neon/Drizzle) · `REFERENCE_DOCS.md`
> (frozen upstream doc index).

---

## 1. Objective and non-negotiable constraints

**Objective:** re-platform SyllabAI's backend from the frozen Java core
(49 controllers, 52 services, 58 repositories, 63 Flyway migrations, 227
test files) to TypeScript in this monorepo, and adapt the imported hub
frontend to it — reaching full behavioural parity, verified by golden-master
evidence, fast enough that the frozen sources never become the de-facto
system.

**Constraints (from the operator directive — none may be negotiated by agents):**

| # | Constraint | Consequence |
|---|-----------|-------------|
| C1 | `syllabai-core` and `syllabai-hub` are FROZEN — read-only reference | Every fix lands here; upstream is never edited. Bug found upstream? Port the fix here and record it in the task's `execution_record`. |
| C2 | Same Neon Postgres database | Schema end-state is owned by Flyway (frozen). Drizzle baselines FROM it (§6); Drizzle never fights it. |
| C3 | Multi-agent execution (6–9 agents) | File-ownership matrix + claim protocol in `AGENT_COORDINATION.md` are mandatory, not advisory. |
| C4 | Speed matters ("quickly catch up") | Waves run in parallel lanes where ownership is disjoint; golden-master gates are the only serialisation point. Speed comes from discipline, not skipped evidence. |
| C5 | Fail-fast + receipts culture carries over | Every module port ships with task yaml `execution_record` + golden cases; honest 501s, never fake 200s. |

## 2. Source inventory (frozen inputs — captured 2026-10-04)

- **`SyllabAI/syllabai-core`** (Java 25, Spring Boot, Flyway V1..V61+, Neon
  Postgres + pgvector, deployed Render free tier): 49 controllers / 52
  services / 58 repositories / 63 migration files / 227 test files.
  Authoritative reference for behaviour, DTO shapes, validation rules,
  error shapes, and the schema end-state.
- **`SyllabAI/syllabai-hub`** (Next.js, bun toolchain): imported at commit
  `93226a43edefafb3bfa9d0fddf119948da29fa9a` into `apps/hub`
  (see `apps/hub/PROVENANCE.md`).
- **`SyllabAI/syllabai`** (master pack): 13 ADRs + 65 task files — process
  law and the task-yaml convention this repo reuses. ADR-035 (executive
  layer), ADR-036 (k-anonymity) bind the new api's research surfaces too.
- **Neon** (`billowing-cherry-15418366/neondb` per T-C42 records): the one
  database, unchanged. Branching used per §6.

### 2.1 Controller domain groups (the port map)

| Domain (wave) | Controllers |
|---|---|
| Identity/auth (W1) | AuthController, BootstrapAdminController, PasswordChangeRequest surface |
| Content read (W2) | ContentController, ContentDocumentController, ContentReaderController, QuestionAssetController, CurriculumController, TeacherCurriculumController |
| Assessment loop (W3) | AttemptController, AttemptHistoryController, ExamPaperController, QuestionController, StudentSmartMarkController, LearnerSelfMarkController, TeacherMarkingController, SmeQuestionAdminController, TestBuilderController, TranscriptionController |
| Learner surface (W4) | LearnerAgendaController, LearnerStateController, LearnerRecommendationController, LearnerAssignmentController, LearnerExamSeriesController, FlashcardRatingController, FlashcardRatingTrailController, FlashcardReviewScheduleController, NightlyDecayJob/Ebbinghaus subsystem |
| Classroom/teacher (W5) | LearnerClassroomController, TeacherClassController, ClassKnowledgeGraphController, TeachingCoverageController, ClassAnalyticsController, TeacherRosterController, TeacherConceptGraphController, NoteVoteController, KnowledgeController, RevisionNoteLearnerController, RevisionNoteAdminController, SmartLessonController |
| Tutor/AI + admin (W6) | TutorController, TutorSessionController, ClaController, InterventionRunController, LlmAdminController, ResearchCalibrationController (k-anonymity per ADR-036), GlmOcrIngestionController, RoutingController |

## 3. Target architecture

```
apps/api      Hono on Vercel (node runtime), zod via @syllabai/contracts,
              Drizzle via @syllabai/db, Neon serverless driver.
              Path parity with the Java core is MANDATORY (golden replay +
              hub compatibility depend on it), including /actuator/health.
apps/hub      Imported Next.js frontend, bun toolchain; adapted to v2 api
              by env switch + contracts adoption. Corpus/content assets are
              part of the import (80MB content/, 23MB content-maps/).
packages/*    contracts (zod) · shared (parity-critical pure logic) ·
              db (client + generated schema)
```

Deploy model: two Vercel projects from this one repo (`api`, `hub`),
independent release cadence via path scoping. The Java core keeps serving
production traffic untouched until the cutover (§7).

## 4. Methodology — four load-bearing practices

### 4.1 Contracts first
No endpoint is implemented before its zod schema exists in
`packages/contracts`, ported constraint-for-constraint from the Java DTO
(source file named in the schema header). The api validates with it; the hub
imports it for typed clients. Contract drift becomes a compile error today
instead of a runtime discovery next month.

### 4.2 Baseline, never replay (database)
The Drizzle schema is generated from the LIVE Neon end-state
(`drizzle-kit pull` on a Neon branch) — the net effect of V1..V61+. The
migration history is never replayed in TypeScript. Flyway bookkeeping tables
(`flyway_schema_history`) stay untouched. Details + verification queries:
`BASELINE_DB.md`.

### 4.3 Golden-master parity gate
Recorded request/response pairs from the frozen Java core are replayed
against the v2 api (`golden/runner.ts`). A module is "ported" only when its
cases pass. Deterministic surfaces only — LLM-dependent paths are excluded
from golden gating and get behavioural gates instead. Procedure:
`GOLDEN_MASTER.md`.

### 4.4 Strangler fig, hub included
The v2 api grows module by module behind its own base URL while the Java
core keeps serving. `apps/hub` switches per-module (env-driven API base
override per surface is introduced in W1 tooling) — no big-bang flip. The
old repos stay frozen and end archived, never deleted.

## 5. Wave plan

Sequencing rule: **dependencies first, risk last.** Auth before everything
(everything needs JWT); tutor/LLM chain last (hardest parity, least
deterministic).

### Wave 0 — Platform bootstrap (this commit + T-MIG-000..003)
Scope: workspace unification, db baseline, golden-master bring-up, CI.
Exit gate: CI green; `drizzle-kit pull` schema committed + verified against
Neon branch; golden harness selftest + live replay of health/auth cases;
hub build passes in monorepo.

### Wave 1 — Identity/auth (T-MIG-010..012)
Port: register (incl. teacher join-code gate, ADMIN refusal), login, JWT
issue/verify, password change, bootstrap-admin, RBAC middleware.
Key compat requirements: same BCrypt cost, same JWT secret env
(`SYLLABAI_JWT_SECRET`) so Java-issued tokens remain valid through cutover,
same validation floors (12-char letter+digit password).
Exit gate: golden cases for all identity endpoints pass; hub login works
against v2 api on a branch deployment.

### Wave 2 — Content read (T-MIG-020..022)
Port: content/curriculum/question-asset read surfaces. Highest read volume,
lowest write complexity — the fastest visible parity win.
Exit gate: golden cases for the content read surfaces; hub reader pages
verified against v2 on branch.

### Wave 3 — Assessment loop (T-MIG-030..034)
Port: attempt submit/history, exam papers, questions, smart/self marking,
test builder. The marks-accounting heart — port the V61-era invariants
(double-condition guarded updates, marks-sum Δ checks) as explicit
transactional code + tests. This wave carries the platform's correctness
reputation; no shortcuts.
Exit gate: golden cases incl. marks-sum invariants; property tests on the
accounting rules; replay of recorded attempt flows.

### Wave 4 — Learner surface (T-MIG-040..043)
Port: agenda, state, recommendations, exam series, flashcards + the
Ebbinghaus decay subsystem (NightlyDecayJob → Vercel Cron; decay math is
deterministic → golden-gated).
Exit gate: golden cases + one recorded end-to-end learner loop on branch.

### Wave 5 — Classroom/teacher (T-MIG-050..053)
Port: classes, rosters, marking, KG/coverage/analytics, notes, revision
notes, smart lessons.
Exit gate: golden cases; teacher surfaces verified on branch.

### Wave 6 — Tutor/AI + admin (T-MIG-060..066)
Port: tutor + sessions (SSE streaming parity!), CLA, intervention runs,
LLM admin, research calibration (k-anonymity per ADR-036 binds the port),
OCR ingestion, routing. Golden gates apply to deterministic surfaces
(authz, session lifecycle, citation plumbing); LLM-output surfaces get
behavioural gates + recorded-shadow comparisons instead.
Exit gate: pilot-teacher supervised dual-run checklist passes.

### Wave 7 — Cutover (§7) and freeze
Flip Vercel domains, archive upstream repos, final receipts, migration
report.

## 6. Risk register (top risks and standing mitigations)

| ID | Risk | Mitigation |
|----|------|------------|
| R-JWT | Token incompatibility at cutover | Same `SYLLABAI_JWT_SECRET` + same claims/alg from day one (T-MIG-010 carries a cross-verify test: Java-issued token parses in v2). |
| R-BCRYPT | Hash verification drift | Same BCrypt cost factor; cross-verify test with a Java-produced hash fixture (scrubbed). |
| R-TX | Transactional semantics gap (Spring `@Transactional` vs Drizzle manual tx) | Every multi-write operation in W3+ wraps in an explicit Drizzle transaction; the V61 marks-sum invariant tests port as the regression net. |
| R-LAZY | Hibernate lazy-load semantics have no Drizzle twin | Port from the Java service layer's OBSERVED query behaviour (the repository call sequence), not from entity mappings; golden cases on response shapes catch over/under-fetching. |
| R-SSE | Tutor SSE streaming parity (Vercel function duration limits) | Streaming lifecycle (open/heartbeat/close semantics) is ported as deterministic plumbing and unit-gated; LLM payloads are excluded from golden gating. Verify Vercel duration limits in W6 spike BEFORE porting. |
| R-LLM | Nondeterministic tutor/CLA outputs | Never golden-gated. Behavioural gates: refusal honesty, citation plumbing (grounded citations resolve to the same chunks), format contracts via zod. |
| R-PGVECTOR | Vector distance semantics (operator/param mismatches) | Port the exact SQL predicates from the frozen repositories; calibration bench receipts (T-C77 heritage) used as fixtures for recall-style spot checks. |
| R-FLYWAY | Drizzle tooling fighting Flyway-managed state | Baseline-only doctrine (§4.2); Drizzle migrations are additive from baseline; `flyway_schema_history` untouchable; every db PR includes `db:check`. |
| R-VERCEL | Function limits vs Java-core long paths (ingestion, decay) | Long jobs split: decay → Vercel Cron; OCR ingestion → chunked/queued within limits; spike in the owning wave's first task. |
| R-CORPUS | Hub content corpus (80MB) vs repo hygiene | Corpus is imported and stays in-repo (hub prebuild verifies it); never regenerate by hand — catch-up re-import only (§8). |
| R-PII | Pilot data leaking into golden fixtures | Mandatory scrub at capture (deterministic masking of emails/names/tokens); reviewer checks fixture diffs for unmasked fields before merge. |

## 7. Cutover and rollback runbook (summary)

**Preconditions (all must hold):** Waves 1–6 exit gates PASS; golden replay
100% on deterministic surfaces; supervised dual-run of the full learner
loop + teacher loop against branch deployments; operator sign-off recorded
in `.syllabai/worklog.md`.

1. Freeze window announced (pilot is small; minutes, not hours).
2. Vercel: `hub` project env `NEXT_PUBLIC_API_BASE_URL` → v2 api domain;
   redeploy. v2 api env carries the same `SYLLABAI_JWT_SECRET` + Neon main
   URL. Java core on Render stays deployed but no longer receives traffic.
3. Vercel Cron takes over the nightly decay job; Java core's scheduler is
   left running-but-idle by design (it will no-op harmlessly post-cutover
   only if traffic stops — verify and disable its Render service after 48h).
4. 48h watch: error rate, golden replay against live, hub issue triage.
5. Rollback at ANY point before decommission: flip `NEXT_PUBLIC_API_BASE_URL`
   back to the Render core URL and redeploy — the Java core is untouched the
   whole time. This is the entire rollback plan, and it is why nothing gets
   deleted until Wave 7 completes.
6. Archive `syllabai-core` / `syllabai-hub` (GitHub archive = read-only;
   never delete — issues, receipts, blame stay resolvable).

## 8. Catch-up sync procedure (upstream changed? it must not — but if it does)

The upstreams are frozen by directive. If the operator ever orders a
catch-up (e.g. a hotfix landed upstream before freeze enforcement):

1. `git clone --depth 1 https://github.com/SyllabAI/syllabai-hub` (or core).
2. Diff against `apps/hub` (or the relevant ported module) at the imported
   SHA (`apps/hub/PROVENANCE.md`).
3. Port the delta through the SAME gates (contracts → golden cases → task
   receipt). Never copy blindly over ported code.
4. Update PROVENANCE.md with the new import SHA + task reference.

## 9. Definition of Done (module-level)

A module (controller surface) is DONE when ALL hold:

1. zod contract(s) in `packages/contracts`, constraint-identical to the Java
   DTOs, with source-file headers.
2. Handlers ported; multi-write paths in explicit transactions; fail-fast
   env gates intact.
3. Golden cases captured from the Java core (scrubbed) pass against v2.
4. Unit tests green in CI; no skipped tests without a task-recorded reason.
5. Task yaml `execution_record` filled (what, evidence, deviations); PR
   merged by the integrator role; worklog appended.

`status: DONE` in the task yaml is written by the integrator only.

## 10. First-days sequencing (quick-catch-up calendar)

- **Day 1:** T-MIG-000 (workspace unification) + T-MIG-002 (db baseline) +
  T-MIG-003 (golden bring-up) — three parallel agents, disjoint files.
- **Day 1–2:** T-MIG-001 (contracts wave-1) → unblocks T-MIG-010.
- **Day 2–4:** T-MIG-010 (identity port) ∥ T-MIG-011 (hub auth adapter) ∥
  T-MIG-004 (capture content-read cases for W2).
- **Day 4+:** Wave 2 lane opens; Wave 1 hardening lane; capture lane runs
  one wave ahead of the port lane — the capture lane is the migration's
  metronome.

# TEACH_ME_PLAN.md — Teach-Me: the learn-by-teaching lane

> Drop-in path: `docs/TEACH_ME_PLAN.md` (syllabai-v2). Status: **COMMISSIONED** —
> operator "accept all" on Q1–Q5, 2026-11-01 (chat `97a19c8c`). Evidence class fixed by
> **ADR-040**. Task file of record: `.syllabai/tasks/T-TEACHME-001.yaml` (research field = probe
> transcript summary). Probe evidence pack (operator-side): `mg-probe/PROBE-FINDINGS.md` + 10 screenshots, 2026-10-31.

---

## 1. Rollout: pilot 4CH1 first, subject-agnostic build (the operator's scope question)

**Answer: 4CH1 first — but the code never knows that.**

Every contract, table, route and component in this plan is keyed by `spec_point_id` and
parameterised by `course_id`. There is **zero chemistry logic anywhere**: no subject
conditionals, no per-course branches. The pilot scope is enforced by two data-side
gates:

1. **`flags.json` → `teachMe`** — `{ enabled: true, courses: ["igcse-chemistry-19"] }`
   (honest "import pending" roadmap state elsewhere; lib/courses.ts honest-absent law).
2. **The content gate** below — a course is *eligible* only when its content
   prerequisites exist, because two guardrails physically need them.

### 1.1 The content gate (what makes a course Teach-Me-eligible)

| # | Prerequisite | Why it's load-bearing |
|---|---|---|
| G1 | Canonical spec tree with per-point descriptions (objective generation draws from it) | Objectives must be spec-point-grounded, not free-LLM-invented — that's twist (1) and the whole review-card verdict model |
| G2 | Revision-note corpus indexed (pgvector) for the course | The 80% verbatim-overlap pasted-notes detector has nothing to compare against without it → anti-gaming fails open, which is forbidden; **fail-closed = course not eligible** |
| G3 | Question-bank sets + revision notes linked in the serving corpus | Suggested Practice must link real resources (MG parity: review linked Rounding · Question Bank / Notes); hypothetical links are a trust defect |
| G4 | Quota sentinel dashboard row for the course's teachMe lane | Cost visibility precedes exposure |

### 1.2 Waves

| Wave | Courses | Entry condition | Notes |
|---|---|---|---|
| **Wave 0 — pilot** | **4CH1 (igcse-chemistry-19)** | G1–G4 already true; 50 Cycle-1 resit students | Paper B instruments attach here; 3 sessions/day/student cap; teacher-ratification queue manned by the pilot teacher |
| **Wave 1** | Next courses passing G1–G4 — expected order: **4PH1 physics** (currently onboarding), then IGCSE Maths | Gate checklist reviewed per course; config retune from pilot data | No code changes; flags.json + content only |
| **Wave 2 — all subjects** | Every course as G1–G3 complete | Corpus backfill is the long pole, not code | Overlap detector ships per-course only when G2 lands for that course |

### 1.3 Why not all subjects at once (the four real reasons)

1. **Anti-gaming integrity.** The overlap detector is fail-closed: without an indexed
   corpus for a course, either the detector can't run (forbidden) or the course is
   ineligible. All-subjects-today would mean shipping lanes where pasted notes sail
   through.
2. **Doctrine validation.** Q3's guardrail and the A-window are unproven at scale. 4CH1's
   50 students is the bounded blast radius; the pilot teacher mans the workbench queue.
3. **Cost exposure.** Wave-0 worst case ≈ 1,050 sessions/week ≈ ≤8.4k LLM calls/week on
   the free chain. Multiplying by every course before the quota law has run in
   production is how the $0/no-card doctrine gets its first exception.
4. **Paper B needs a clean instrument.** A platform-wide feature change and a pre-registered
   pilot measurement are different papers. Wave 0 is the measurement; Wave 2 is the
   platform. Sequencing them is what makes the research finding publishable.

**What "start implementing" means today:** everything in §4–§11 below is
subject-agnostic and ships in run-001/run-002 now; 4CH1 is Wave 0 of the *content*
rollout, not the code's scope.

---

## 2. Experience spec (parity with the original, twists native to our corpus)

### 2.1 Wizard (4 steps, MG-faithful)

1. **Topics** — spec-tree picker, **≤ 3 spec points** (MG: ≤3 topics), grade-banded, with
   a "describe your own" free-text fallback that maps to nearest spec points (LLM assist,
   same pinned objective-generation prompt).
2. **Pupil difficulty** — Easy ("knows nothing") / Medium ("knows the basics but mixes
   things up") / Hard ("gets the basics and grills you on the tricky parts").
3. **Session length** — Quick Review = **3** objectives / In-Depth = **4** (ruling Q4).
4. **Mode** — Chat in v1. Voice is run-004 feasibility spike (hub TTS/STT posture).

### 2.2 Session player

- Objectives panel, live tick-off on coverage (auto-advance, no scoring screen — probe
  of record), header "n/4 completed"; each objective renders its **spec-point id(s)**
  (our twist 1) and status.
- Chat: student explanation lands → **one combined judge call** returns
  (a) verdict chip (expandable → one-sentence extractive Feedback line naming the covered
  learning point, MG-faithful), (b) per-objective coverage deltas, (c)
  `contradictionDetected`, (d) the Pupil's next probe message (paraphrase-back + edge-case
  question, probe pattern of record).
- **Ask-for-help** button present, gated OFF in v1 (stub, honest tooltip).
- Composer: no attachments in v1 (matches original's free tier; run-004).

### 2.3 Review card (async, "Generating session review…")

- **Strengths** — bullets quoting the student's own examples (MG-faithful, extractive).
- **Areas for improvement** — includes corrections of errors made in-session, with the
  correct statement (this is where Q3's full disclosure lives).
- **Per-spec-point verdicts** (our twist 2) — covered / partially covered / not covered /
  flagged (pasted-notes), each tied to spec-point ids the objectives recorded.
- **Misconception notes** (our twist 3) — wrong-but-confident statements classified
  against the misconception registry → `teach_misconception_candidates` (BDT candidate
  queue, AI_SUGGESTED, never auto-promoted).
- **Exam anchoring** (our twist 4) — "where would this show up in an exam?" attaches a
  real past-paper part from the serving corpus for the course.
- **KG closure** (our twist 5) — prerequisite warnings from the T-C11 graph when a taught
  point has a weak prerequisite.
- **Suggested Practice** (our twist 6) — real question-bank sets + revision notes (G3).
- Session permalink + history list on the course's Teach-Me landing ("Today · Chemistry ·
  4m ago · Completed").
- **No XP/energy/streak changes in v1** (original grants none; run-004 operator-gated).

### 2.4 The Pupil (persona, D5 + D2)

Simple avatar, name "the Pupil", never breaks character in-session, never confirms a
canon-contradicting statement (confusion template instead), asks the next edge-case
question after paraphrasing its updated understanding. Pinned prompt v1 in
`run-001-kit/prompts/pupil.md` — actually fused into the combined judge prompt
(§2.2); `pupil.md` is the behavioural source of truth the fused prompt must satisfy.

---

## 3. Architecture

```
hub (Next.js)                    api (Hono)                          db (Drizzle / Neon Postgres)
/courses/[course]/teach-me  →  POST /teach-me/sessions            →  teach_sessions
   wizard (4 steps)                (spec_point_ids, difficulty,      teach_objectives
   chat player                      length, mode)                    teach_objective_coverages
   review card                   POST /teach-me/sessions/:id/message  teach_misconception_candidates
   history                       (judge → chip + coverage + probe)    + evidence row (AI_SUGGESTED,
                                 POST /teach-me/sessions/:id/end         kind TEACH_SESSION) — append-only
                                 (async review generation)          (+ read-only joins to spec tree,
                                 GET  /teach-me/sessions?course=     misconception registry, KG, corpus)
```

- **LLM chain:** existing `LlmProvider` free failover (Groq → Gemini → OpenRouter,
  T-023 lineage). Two pinned prompts v1: `teachme.turn.v1` (combined judge+probe,
  JSON-out) and `teachme.review.v1` (JSON-out). Fixture replay in CI (T-MIG-039 law);
  fail-closed refusal on shape drift.
- **Deterministic pre-judge gates** (before any LLM call): message-count ceiling,
  word-floor, overlap check (corpus), quota check. LLM sees only messages that pass.
- **Deterministic post-judge gates:** zod-strict shape validation; coverage-credit
  dedupe (7-day window); evidence append via the AI_SUGGESTED path only.

## 4. Data model (run-001 migration — additive only)

Four new tables (exact column names for existing references — user, course, spec point,
evidence, misconception registry — to be aligned with the live schema at PR time; the
kit uses the obvious names and marks them):

- **`teach_sessions`** — id (uuid pk), user_id, course_id, spec_point_ids (jsonb, ≤3),
  difficulty (enum easy|medium|hard), length (enum quick|in_depth), mode (enum chat;
  voice reserved), status (enum active|review_pending|completed|abandoned),
  message_count int, llm_call_count int, tokens_used int, flags jsonb (quota/overlap/
  guardrail events for the sentinel), created_at, ended_at.
- **`teach_objectives`** — id, session_id fk, ordinal int, text, spec_point_ids jsonb,
  status enum (not_started|covered|not_covered|flagged), created_at.
- **`teach_objective_coverages`** — id, objective_id fk, message_seq int, covered bool,
  evidence_quote text (extractive), verdict text, contradiction_detected bool,
  created_at. Append-only; drives the live tick and the review verdicts.
- **`teach_misconception_candidates`** — id, session_id fk, spec_point_ids jsonb,
  statement text, matched_misconception_id (nullable fk to registry), confidence
  numeric, status enum (candidate|ratified|rejected) default candidate, created_at.
  Ratification is the workbench's job; the default never changes without a teacher.

**Evidence write path:** on a covered objective, append one AI_SUGGESTED evidence row
(kind `TEACH_SESSION`) per (student, spec point) — **skipped** if a row for the same
(student, spec point) exists within `repeatCreditWindowDays` (D4). The row references
session_id + objective_id + evidence_quote. Of-record mastery is untouched; ratification
in the workbench is the only promotion path (D1).

## 5. Contracts (zod-strict, `packages/contracts/teach-me.ts`)

`TeachSession`, `TeachObjective`, `TeachObjectiveCoverage`, `VerdictChip`,
`ReviewCard` (+ nested `SpecPointVerdict`, `MisconceptionNote`, `ExamAnchor`,
`PrereqWarning`, `SuggestedPracticeItem`), plus request/response DTOs for the five
routes. Full file supplied in `run-001-kit/contracts/teach-me.ts`.

## 6. API (run-002, `apps/api/src`, behind the flags gate)

| Route | Behaviour |
|---|---|
| `POST /teach-me/sessions` | Validate course eligible (flags + content gate), quota check (3/day), spec points exist in canonical tree (≤3) → generate objectives (LLM call 1) → session + objectives rows → return session |
| `POST /teach-me/sessions/:id/message` | Ownership check, status=active, message ceiling → word floor (sub-floor: in-character nudge, no judge call) → overlap check → combined judge call (chip + coverage deltas + contradiction flag + next probe) → persist coverage rows → append evidence (deduped) → return chip + probe + objective states |
| `POST /teach-me/sessions/:id/end` | status → review_pending → async review generation (LLM call N) → ReviewCard (§2.3) → status=completed → sentinel counters |
| `GET /teach-me/sessions?course=` | History list (today/earlier, course, status) |
| `GET /teach-me/sessions/:id` | Session permalink payload (transcript + objectives + review) |

Quota denial, ceiling breach and shape drift all return typed, fail-closed errors —
never a degraded "best effort" path.

## 7. Anti-gaming config object (single source, D4)

`run-001-kit/config/teach-me.config.ts` — `TEACH_ME_CONFIG` holds: `minWordsPerExplanation: 40`,
`verbatimOverlapFlag: 0.80`, `repeatCreditWindowDays: 7`, `dailySessionCap: 3`,
`objectivesByLength: { quick: 3, inDepth: 4 }`, `maxMessagesByLength: { quick: 5, inDepth: 6 }`,
`maxLlmCallsPerSession: 10`, `maxTokensPerSession: 60_000`, `flags: { teachMe: { enabled, courses } }`.
The vague-explanation re-probe retunes **this file only**; tests read constants from it,
never inline literals.

## 8. Quota & cost model (D3)

- Server-side cap: count sessions started by (user, UTC-day) at create; cap+1 → typed
  quota error; hub shows an honest "back tomorrow" state (no dark patterns — the
  original's countdown-40%-off wall is explicitly *not* replicated).
- Calls/session = 1 + messages + 1 ≤ 8 (In-Depth worst case); CI asserts ≤ 10 and
  ≤ 60k tokens/session on fixture replays.
- Pilot worst case: 50 × 3/day × 7d = 1,050 sessions/week ⇒ ≤ 8.4k calls/week (typical
  ≈ 7k). Sentinel dashboard tracks calls/tokens per day, per course, per provider —
  alerts at 70% of the modelled ceiling.

## 9. Teacher workbench (ratification, D1)

- New queue: `TEACH_SESSION` AI_SUGGESTED rows + misconception candidates, filterable by
  course/class, staged-decision pattern (reuse T-TEACH toolkit components; no changes to
  existing teacher pages — the task file forbids it; the queue is an additive panel).
- Ratify ⇒ evidence row promoted to record status by the existing promotion machinery;
  reject ⇒ row marked rejected, retained (append-only audit).
- Pilot teacher reviews the queue weekly during Wave 0; queue depth is a Paper B metric
  (teacher load is an outcome, not a hidden cost).

## 10. Hub surfaces (run-003)

- `/courses/[course]/teach-me` — wizard → player → review → history; static-params
  prerender for the landing; card in the course page's Learn band keyed on the flags
  gate; non-pilot courses show honest "import pending" roadmap state (lib/courses.ts
  honest-absent law).
- Client fns in `lib/api.ts`; card mount in `lib/courses.ts` read-only.

## 11. Testing & gates (all runs)

`bun test` + `tsc --noEmit` + `eslint` on touched files; behavioural gate on all LLM
output (fixture replay, T-MIG-039); zod-strict contracts. Behavioural test list
(skeletons supplied in `run-001-kit/tests/teach-me.behavioural.test.ts`):

1. quota denial at cap+1 (typed error, no session row);
2. message ceiling per length (Quick 5 / In-Depth 6);
3. LLM-call ceiling (≤ 10) and token ceiling (≤ 60k) on full fixture sessions;
4. word-floor: 39-word message ⇒ no chip, no coverage credit, nudge response;
5. overlap ≥ 0.80 fixture ⇒ objective not_covered + review flag;
6. 7-day dedupe: second coverage of same (student, spec point) ⇒ no new evidence row;
7. contradiction fixture ⇒ confusion template; **no-affirmation invariant** (response
   must not contain affirmation markers on `contradictionDetected: true`);
8. shape drift fixture ⇒ fail-closed refusal, session left consistent;
9. evidence rows are AI_SUGGESTED, append-only, reference session + objective;
10. of-record mastery unchanged after a full fixture session (invariant scan).

## 12. Observability

Quota sentinel extension: per-day sessions/LLM calls/tokens by course and provider;
guardrail event counters (contradictions detected, overlap flags, quota denials,
sub-floor nudges); review-generation latency; workbench queue depth. All counters come
from `teach_sessions.flags` + coverage rows — no new telemetry stack.

## 13. Paper B hooks (pre-register now)

1. **A-vs-B disclosure timing** — the D2 residual window (congratulation-before-correction
   frequency + student notice rate) becomes a measurable comparison if a Wave-1 arm
   ever runs option B; pre-register the metric before Wave-0 data exists.
2. **Coverage-credit vs ratified-rate gap** — AI_SUGGESTED coverage rows vs
   teacher-ratified rows per spec point = an honest calibration curve for LLM-judged
   coverage (the teach-session analogue of Smart Mark's κ).
3. **Teacher load** — workbench queue depth and review latency as an outcome.
4. **Learning gain** — per-spec-point performance on subsequent question-bank attempts,
   covered-by-teaching vs not, within the pilot cohort (observational; stated as such).

## 14. Run plan & open items

| Run | Scope | State |
|---|---|---|
| run-000 | rulings + ADR-040 + this plan | **DONE** (2026-11-01; ADR-040 in the master pack) |
| run-001 | contracts + migration (+ DB apply when operator supplies DATABASE_URL, T-SENECA-001 precedent) | **THIS PR** (`t-teachme-1/run-001`) — receipt `.syllabai/receipts/T-TEACHME-001/run-001.json` |
| run-002 | API lane: lifecycle, pinned prompts v1, fixture replay, ceilings, fail-closed | NEXT — the D4 constants land as `apps/api/src/teach-me/config.ts` (one config object, ruling Q5) |
| run-003 | hub lane: wizard, player, review card, history, flags gate, honest roadmap state | spec §§2, 10 |
| run-004 | operator-gated: Voice spike, attachments, XP/streak loop (original grants none) | deferred |
| re-probe | vague-explanation gating + fully-wrong review (needs Pro or second account) | gates Q5 constants only |

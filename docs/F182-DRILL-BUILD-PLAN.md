# F-182 — Per-Spec-Point Drill Surface — Build Plan (preregistration of record)

> Lane: F-182 build (operator word "build PR.", IM trace `1a16503704429681`, 2026-10-23), the
> second lane of the filed F-182 line. Product spec: Kognity Competitive Research Dossier v1.1,
> **Deep Dive D §8.5 row 1**; tracker row **F-182** (repo syllabai-v2, deps F-028 / F-049 / F-178).
> Committed WITH the implementation per the #216/#225/#229/#232/DC-4/F182-opening pattern.
> Foundation of record: docs/F182-DRILL-SURFACE-PLAN.md (the opening) — its §4 policies P1..P6
> and §6.1 build sequence are the law this PR executes; nothing here re-adjudicates them.

## 1. What the build PR adds (the opening's §6.1 line, verbatim scope)

The opening landed the read-only foundation: the census of record (3928 eligible parts, 171/182
spine addresses covered, 157 drillable), the pure 5-part draw (`drawForAddress`), and the pin
battery. This PR turns it into a surface — **zod contracts + the drill route + the F-055-shaped
attempt-evidence seam + the hub drill UI** — under the zero-stakes law: **no gradebook writes**.

**What does NOT open here**: the MS-reveal *law* (F-183 — drill-mode reveal gating, markPoints
M1..Mn structure), the decay strength surface (F-184, ADR-031 computed-never-persisted), the
model-driven draw (F-185), battles (F-186). The reveal CONTENT rides this PR's evidence ack
(disclosed below); the LAW is F-183's title.

## 2. The wire (packages/contracts/src/drill.ts — F-182-SPEC-NATIVE, DC-7 posture)

No Java DTO exists to port; the source of record is this prereg + the dossier row. Contracts-first
still applies: every endpoint binds through these schemas and nothing else.

| Path | Shape | Notes |
|---|---|---|
| `GET /api/v1/learners/me/drill/addresses?course=` | `drillAddressesResponseSchema` | census summary + **drillable-only** rows (P3 — the surface offers exactly these) |
| `POST /api/v1/learners/me/drill/draw` | `drillDrawRequestSchema` → `drillDrawResponseSchema` | `{course, code, seed?}`; the response always carries the seed actually used (P5); **no answer facts in the payload** |
| `POST /api/v1/learners/me/drill/evidence` | `drillEvidenceRequestSchema` → `drillEvidenceResponseSchema` | the F-055 SHAPE (ADR-016: score, time, confidence, flag); one immutable row per (draw, part); the ack carries the instant reveal |

Answer-leakage law (pinned by test): the draw response's choices ship `{label, textMd}` only —
`isCorrect` and `solutionMd` are bank-side facts; the server grades MCQ from its private lookup and
returns `solutionMd` ONLY as the evidence ack (post-attempt instant reveal). Structured parts are
recorded **UNGRADED** (`correct`/`marksAwarded` null — never 0, never invented); the learner
self-checks against the revealed solution.

## 3. The substrate (packages/db migration `0010_drill_surface.sql`)

Two tables in the drill's OWN address space (bundle part ids — string — never the uuid-keyed
questions plane):

- `drill_draws` — the recency substrate (P4 reads the learner's latest draws at the address) + the
  draw audit trail (seed, part ids, pool facts — the P5 determinism receipt). FK users cascade;
  index (learner, course, code, created_at desc).
- `drill_part_evidence` — the F-055-shaped attempt evidence: score (`correct`/`marks_awarded`),
  time (`response_time_ms`), confidence (`confidence_level` 1..5), flag (`self_doubt_flag`),
  response payload (choice label | free text), provenance `'DRILL'`. **Immutable**: unique
  (draw_id, part_id), no UPDATE path exists in code.

**Zero-stakes law (the disclosure that matters)**: neither table is read by any gradebook/progress
projection (DC-7's rollup reads `attempts`/`ai_mark_events`/`revision_note_viewed` only), and the
drill surface writes no `attempts`/`ai_mark_events` rows. Drill state is its own lane by
construction — a drill can never move a ring, a plan task, or a recommendation.

**Journal repair of record (disclosed)**: `drizzle-kit check` was DEAD on main before this PR —
`0000_snapshot.json` (the T-MIG-002 baseline) carried `prevId` = 0008's id and `0009_snapshot.json`
carried an id cloned from 0000's (both since the DC-3 re-baseline), a duplicate-pointer collision
that refused both `check` and `generate`. The repair: `0000.prevId → ""` (the baseline convention)
+ a fresh unique id for 0009 (metadata only — zero DDL change to any landed migration). The
baseline snapshot then re-baselined to the union end-state per the T-MIG-002-R mechanic:
**77/730/105/73/126** (was 75/702/102/70/120), VERIFY PASS, 0 drifts, measured.

## 4. The bank port (services/drill/bank.ts)

`DrillBank` is the injectable port (the SqlFn posture): pools, census rows, content views (no
answer facts), marks, the private `isCorrectChoice` grading lookup, and `solutionOf`. Production
composition (`bundleBank`) loads the served bundle of record
(`apps/hub/content/<course>/questions.json` + `curriculum.json`) lazily once per isolate via the
census-script relative-path law, behind the **fail-closed course registry**
(`DRILL_COURSE_REGISTRY = ["igcse-chemistry-19"]` — the anchor law: an uncensused course is not a
smaller bank, it is no bank; 404, never a guess). Parts without content refuse loudly at load.

Integration pins (test/drill/bank.test.ts): the bank part count equals the census-of-record 3928;
157 drillable addresses; 4CH1-1.25 serves 155; choices ship without `isCorrect`; the grading lookup
answers server-side only. The opening's anti-drift artifact pin stays untouched and holds.

## 5. Error laws (each pinned)

| Case | Status |
|---|---|
| anonymous caller (all three paths) | 401 before any handler (the authz shell posture) |
| unknown course | 404 `not_found` — "drill course … is not served — the surface ships only where a census of record exists" |
| unknown address | 404 `not_found` |
| address below the floor | 409 `conflict` — the P3 message verbatim ("below the drillable floor") |
| malformed body / bad seed / bad confidence | 400 `malformed_body` (failed safeParse = the binding failure) |
| unknown or FOREIGN draw | 404 `not_found` (ownership-scoped resolution — no state leak) |
| part not in the draw | 400 `bad_request` |
| choice response on a non-MCQ part | 400 `bad_request` (the bank refuses to grade what has no choices) |
| second evidence write for the same (draw, part) | 409 `conflict` — immutability (ADR-016) |

## 6. The hub surface (apps/hub/src/app/practice/drill/)

`/practice/drill` — the client (lib/drill.ts wire layer, progress-server posture: any failure →
honest empty state, never a fabricated draw): the drillable address picker (grouped by topic, pool
counts on every chip) → the 5-part player (MCQ choice buttons / structured textarea, confidence
1..5, self-doubt flag — the F-055 telemetry rendered verbatim) → instant reveal per part
(correctness badge for server-graded MCQ, the solution for everything) → the zero-stakes summary →
**Retake (fresh draw)** (no seed sent; the server draws a new one — the retake law). Signed-out
visitors get the sign-in CTA (the drill is identity-bearing: draws and evidence key to the
learner). The page pins `course=igcse-chemistry-19` (the censused course of record).

## 7. Battery of record (this PR)

`bun run typecheck` 0 · `bun test apps/api packages` **2639 pass / 13 skip / 0 fail** (the 52 new
drill/contracts/db pins included) · golden selftest OK · retrieval-eval 0 fail + 19/19 vectors ·
zero-core census gate GREEN · census regeneration byte-identity (`9e94c938…`, unchanged) ·
`build:hub` exit 0 (prebuild corpus gates + next build) · eslint on touched hub files 0 ·
`drizzle-kit check` GREEN (repaired journal).

## 8. Residuals (honest)

- The draw endpoint reads the bundle at runtime through the census-script relative path (works in
  dev, tests, and the local battery). The API's serverless packaging is a deploy-lane concern
  outside this repo's CI; the bank port makes that a one-function swap if the live deployment ever
  needs a different loading strategy — the failure mode is fail-loud (500 with a bank-load error),
  never a silent empty draw.
- Recency is naive by design (P4): latest-10-draws at the address, fallback disclosed via
  `usedFallback`. F-185's model-driven draw supersedes the selection; the seam stays.
- Structured parts are recorded ungraded; Smart Mark integration is the marking lanes' title, not
  this PR's. The evidence rows carry everything a future grader needs (response payload + telemetry).
- The 11 uncovered + 14 thin addresses remain the corpus-growth queue (P3 keeps them unoffered).
- The reveal rides the evidence ack (submit-to-reveal). F-183 owns the reveal LAW (incl. any
  peek-without-answer posture and the markPoints M1..Mn structure).

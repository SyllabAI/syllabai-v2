# F-184 — Decay-Driven Strength Surface — BUILD Plan (preregistration of record)

> Lane: F-184 build PR (operator order "F-184 build PR", IM trace `1a168294c095a295`,
> 2026-10-23). Sits on the F-184 opening of record (docs/F184-DECAY-STRENGTH-PLAN.md,
> v2 PR #325, merge `cbae0f1369357b0`) exactly as the opening's §6 named it: **the strength
> route (read-only projection over the evidence seam) + the learner-overview surface (the
> strength-bar position Kognity validated) rendering `BAR_SEMANTICS` verbatim + the
> practice-now queue linking into drill draws**, replacing the engagement-coupled overlay
> panel (the strengths tab's localStorage "SIMULATED overlay" whose `% engaged` fill is the
> named anti-pattern of opening law S3). Product spec: Kognity dossier v1.1 Deep Dive D
> §8.3 (law 3) + §8.5 row 3 / tracker F-184 ("Decay-driven strength surface (mastery bar
> with computed decay)", P1, repo syllabai-v2). Committed WITH the implementation per the
> #216/#225/#229/#232/DC-4/F182/F183/F184-opening pattern. Base of record: v2 main
> `3e3fafef8ae9` at push time (8 content/books/attestation commits past the opening merge;
> zero overlap with this lane's files; the chemistry census substrate `questions.json`
> untouched in the range — re-pinned by the draw.test.ts anti-drift pin in the battery).

## 1. What builds here

- **The wire** (`packages/contracts/src/strength.ts`, NEW): the strength response contracts —
  query, bar view, practice-now entry, the semantics block, the summary. One GET, read-only.
- **The read** (`apps/api/src/services/drill/store.ts`, additive): `evidenceForCourse` —
  a SELECT over the drill's OWN `drill_part_evidence` table (the F-055-shaped seam,
  migration 0010). Zero-stakes law untouched: no write, and no progress-bearing table is
  read — the drill reads its own lane.
- **The projection** (`apps/api/src/services/drill/strength-serve.ts`, NEW): composes the
  bank's address space + the store read + THE strength law of record
  (`services/drill/strength.ts`, S1..S6 untouched — zero new decay math, zero new strength
  math) into the wire shape.
- **The route** (`apps/api/src/routes/drill/index.ts`, additive): `GET
  /api/v1/learners/me/drill/strengths?course=<slug>` on the drill router — the authz shell,
  contracts binding, `UnknownCourseError → 404` mapping and the census-of-record bank are
  the drill router's own laws, reused verbatim.
- **The hub wire** (`apps/hub/src/lib/drill.ts`, additive): `fetchStrengths` on the same
  posture as the drill lib (null on any failure; the caller renders the honest state).
- **The surface** (`apps/hub/src/app/courses/[course]/strengths/`, REPLACEMENT): the
  strengths tab becomes the decay-driven learner-overview — bars + practice-now queue +
  `BAR_SEMANTICS` rendered verbatim. The engagement-coupled overlay panel is deleted
  (git rm semantics: the file is rewritten; the localStorage/SIMULATED posture leaves this
  tab for good).
- **The deep link** (`apps/hub/src/app/practice/drill/client.tsx`, additive): `?code=<code>`
  on the drill page begins the draw at that address when it is drillable — the practice-now
  queue's "Drill this" lands IN a drill draw, the opening plan §6.1's "linking into drill
  draws".
- **Receipt + battery**: receipt run-001-r0; contracts test; route battery; the full CI
  battery locally (typecheck, bun test apps/api packages, golden selftest, retrieval eval,
  zero-core census gate, build:hub).

## 2. Policy decisions of the build (each disclosed; the pinned laws stay pinned)

- **Q7 — one GET, the whole projection.** `GET /drill/strengths` returns `{course,
  generatedAt, semantics, summary, bars, queue}` in one body: the semantics block rides the
  payload so the surface renders the SERVER's `BAR_SEMANTICS` verbatim (law S3's "the
  strings the surface must render" — the client never re-derives semantics), and the queue
  rides beside the bars it distills (S5: "the same strengths feed the queue"). A second
  endpoint would invite the two halves drifting.
- **Q8 — `created_at` is the graded-at clock.** Evidence rows are immutable and written
  once, post-attempt, with the MCQ grading already applied (`marks_awarded` computed at
  insert). `created_at` IS the moment the grade existed — exactly the opening's Q3 clock
  ("the anchor is the post-practice posterior and lastGradedAt is its practice time"). No
  new column, no backfill, no persisted decay (ADR-031: computed-never-persisted — this PR
  adds no strength table and writes nothing).
- **Q9 — the clock stays injected.** The route layer takes `nowOf` as a dep (default
  `() => new Date()`); the pure law keeps taking `now` as an argument. The decay-at-read
  computation is per-request; the response stamps `generatedAt` = that `now` (ISO-8601) —
  the honest "these numbers were computed for THIS read" disclosure.
- **Q10 — the overlay panel leaves.** The strengths tab previously rendered a browser-local
  SIMULATED overlay with an engagement fill — the named anti-pattern. The replacement
  renders ONLY the strength law's projection: no engagement counter exists anywhere in the
  new surface (pin: the response schema has no such field; the panel has no such state).
- **Q11 — bars render weakest-first.** The server orders `bars` by strength ascending
  (code ascending tie-break — the S5 ordering law extended to the wall), so the honest
  picture leads with what is fading. The queue is the capped (QUEUE_SIZE=10) distillation
  of exactly those addresses below `reviewBelow` (0.6).
- **Q12 — adjacency is enforced at the projection.** Evidence rows whose code is not a
  DRILLABLE address of the bank's census are excluded from every bar and the queue (law
  S6: the bar exists only where the drill ships). The summary discloses
  `ungradedOnlyAddresses` (evidence present, no graded row — no bar, law S4) so absence
  stays visible instead of silently vanishing.
- **Q13 — the deep link begins the draw.** `?code=` with a drillable address auto-begins
  the draw once per page mount (ref-guarded, never while a draw is active, never for an
  address outside the fail-closed picker). Zero-stakes holds: a draw writes only the drill's
  recency/audit lane. A non-drillable or unknown code falls back to the picker (honest
  degradation, no invented draw).
- **Q14 — course scoping stays with the caller** (opening Q6 verbatim): the route scopes
  per course through the drill bank registry; the projection is code-keyed underneath.

## 3. Battery of record (this PR)

`bun run typecheck` · `bun test apps/api packages` (NEW: contracts strength pins +
`apps/api/test/drill/strength-route.test.ts` route battery — authz shell 401, contracts
parse, decay conformance through the wire at a frozen `nowOf`, weakest-first ordering,
adjacency exclusions, honest empty, unknown-course 404, malformed query 400, and a
no-write pin asserting every SQL statement the route fires is a SELECT on the drill's own
lane) · golden selftest + retrieval eval (untouched lanes, CI parity) · zero-core census
gate (`--gate`, LIVE=0 law — the new hub wire rides the v2 drill family, not any core
route) · `bun run build:hub` (the strengths tab is statically prerendered; the build is
the prerender gate).

## 4. The line after (the filed dossier line, unchanged)

F-185 — model-driven draw (BKT/decay-informed selection; sparse-state fallback = the F-182
opening's random draw) + the method-credit agreement measurement consuming the F-183 acks —
then F-186 (battle wave, strictly sequenced after F-185). This build PR hands F-185 the
finished read surface and touches nothing the F-185 draw lane owns (draw.ts untouched).

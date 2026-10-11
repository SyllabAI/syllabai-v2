# P3 Witness Click-Path — Supervised Dual-Run Loops (CUTOVER_RUNBOOK §2.4 / P3)

> **STATUS: STAGED — awaiting the operator witness session.** This file expands
> the P3 precondition of `docs/CUTOVER_RUNBOOK.md` into a browser click-path the
> operator performs and witnesses on the live dual-run posture. Nothing here is
> executed by its presence on main. Companion files: `docs/P4-SIGNOFF-PREFILL.md`
> (the paste-ready sign-off), `docs/DECOMMISSION-BANDS-PLAN.md` (why some steps
> below still route to the legacy core).
>
> Provenance: operator order trace `1a12c1607ee86c41` ("stage the P3 witness
> click-path script + pre-filled P4 sign-off") — staged by r7a.

## How to read the plane column

The hub is in the **dual-run posture** (T-MIG-037 flip law): every flipped row of
`V2_SURFACE_PREFIXES` / `V2_SURFACE_MIDPATH_PREFIXES` (44 + 4 rows of record at
main) routes browser-direct to the v2 api carrier; everything else rides the
legacy core. A witness step marked **CORE** is therefore EXPECTED to ride the
legacy core today — it is not an incident; it is the exact inventory the
decommission bands exist to retire. Seeing both planes answer in one session is
the point of the exercise.

## Session preconditions

1. **Accounts**: the operator-held pilot learner + pilot teacher accounts
   (value never persisted lane-side). If a fresh probe pair is preferred, use
   the honest register surface on `https://syllabai-hub-v2.vercel.app/login`
   (register law: 12-char letter+digit floor) — note them in the witness table.
2. **Timing**: schedule away from the 02:00 UTC decay cron (§1 of the runbook),
   or accept one no-op cycle (v2 cron is fail-closed; the core scheduler is
   running-but-idle by design — the exactly-once PK law holds across both).
3. **Rollback anchor awareness**: the entire rollback lever is unsetting
   `NEXT_PUBLIC_API_V2_BASE_URL` on the hub project (the surface test pins every
   path back to core — MIGRATION_PLAN §7). Nothing in this click-path changes
   any env var.
4. **Evidence**: for each step, optionally open DevTools → Network and confirm
   the request host matches the plane column. Screenshots are welcome; the
   init column is the minimum witness record.

## Loop A — learner spine (W3/W4)

| # | Click path | Expected result | Wire call | Plane | Init / UTC |
|---|-----------|-----------------|-----------|-------|------------|
| A1 | `/login` → enter learner credentials → submit | Redirect to the learner home; no error toast | `POST /api/v1/auth/login` | **v2** | |
| A2 | Learner home → dashboard | Agenda strip + next-best-action card render with real rows (not skeletons) | `GET /api/v1/learners/me/agenda`, `GET /api/v1/learners/me/recommendations?rootId=…`, `GET /api/v1/learners/me/state` | **v2** | |
| A3 | Dashboard → practice → answer one question → submit | Attempt accepted; the self-mark row appears | `POST /api/v1/attempts` (+ structured variant) | **v2** | |
| A4 | Same session → pick a self-mark 0–5 | Mark recorded; "Next" enables | self-mark submit (the T-MIG-032 family) | **v2** | |
| A5 | Learner home → assignments tab | Assignment list renders; progress derived from the session log | `GET /api/v1/learners/me/assignments` (+ submissions) | **v2** | |
| A6 | Learner home → classroom tab | Class overview/feed render; no 403/500 | `GET /api/v1/learners/me/classroom` (foundation, T-MIG-112) | **v2** | |
| A7 | Practice a flashcard → rate it | Rating sticks; trail updates | `POST /api/v1/learners/me/flashcard-ratings` (T-MIG-095) | **v2** | |

## Loop B — teacher spine (W5)

| # | Click path | Expected result | Wire call | Plane | Init / UTC |
|---|-----------|-----------------|-----------|-------|------------|
| B1 | `/login` → teacher credentials → submit | Teacher home renders | `POST /api/v1/auth/login` | **v2** | |
| B2 | Teacher → classes | Class list renders (the pilot class visible) | `GET /api/v1/teacher/classes` (T-MIG-112) | **v2** | |
| B3 | Open the class detail | Roster + class view render | `GET /api/v1/teacher/classes/:uuid` | **v2** | |
| B4 | Same page load (subjects picker / KG tab data) | Renders — **this leg rides the legacy core by law** (the T-MIG-035 check-3 posture; retire = decommission band B4) | `GET /api/v1/subjects` | **CORE** | |
| B5 | Class → knowledge-graph tab | Heatmap/node views render | `GET /api/v1/teacher/classes/:uuid/knowledge-graph` (mid-path rows, T-MIG-086) | **v2** | |
| B6 | Teacher → marking | Queue page renders with paged rows + throughput counts | `GET /api/v1/teacher/marking/queue-v2?state=…`, `GET /api/v1/teacher/marking/throughput`, `GET /api/v1/teacher/marking/kappa/latest` (T-MIG-113) | **v2** | |
| B7 | Open one marking answer detail | Detail renders — **legacy core by law** (the over-capture row-grammar posture; retire = band B1) | `GET /api/v1/teacher/marking/answers/:uuid` | **CORE** | |
| B8 | Submit a human-mark on that answer | Mark saved; row state updates | `POST /api/v1/teacher/marking/answers/:uuid/human-mark` (mid-path row, T-MIG-114) | **v2** | |

## Loop C — tutor SSE (W6)

| # | Click path | Expected result | Wire call | Plane | Init / UTC |
|---|-----------|-----------------|-----------|-------|------------|
| C1 | `/tutor` → open a chat thread | Thread view opens; heartbeat/stream connects | hub route `POST /api/ai/chat` (SSE) | **CORE-hardwired** (retire = band B3) | |
| C2 | Ask one curriculum question | Streaming answer renders (LLM payloads are excluded from golden gating by standing law — witness is UI-level only) | same route | **CORE-hardwired** | |
| C3 | Close the thread / navigate away | Stream closes cleanly, no dangling spinner | same route | **CORE-hardwired** | |

## Witness declaration

When all rows are init'd, paste the P4 block from `docs/P4-SIGNOFF-PREFILL.md`
into `.syllabai/worklog.md` with the witnessed date + PASS/FAIL per loop. Any
non-conforming step → screenshot + the step number + the wire call, and stop:
the §5 decision rule (roll back first, diagnose on branches) applies to
**port-side fidelity regressions**, not to the expected CORE legs.

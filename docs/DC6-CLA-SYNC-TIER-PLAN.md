# DC-6 phase 3 — the CLA sync tier (prereg of record)

**Status**: prereg — committed to main WITH the implementation PR (the #216/#225 pattern: the plan doc is the PR's diff-of-record anchor).
**Operator ruling of record** (trace `1a15a73da1a77c05`): *"conversations should be saved to the database instead, so history follows the learner across devices."*
**Feasibility pass of record**: `SYNC-TIER-FEASIBILITY` (session worklog; local `audit/sync-tier-feasibility.md`) — path (iii) adopted: a NEW v2-native cla-thread family; path (i) (tutor-sessions append) REJECTED (tutor-pane pollution); path (ii) (`cla/ask` sessionId) RECORDED FALLBACK (frozen-path contact — not taken).
**Grounding**: main `8ee371e`; #216 (assistant rail) + #225 (question-surface history) landed; the `sessionId` seam exists on every question thread (`question-cla-threads.ts:56`).

## 1. Decision

The question-surface CLA threads get a **server mirror tier** implementing the operator's DB ruling, using the tutor's proven §22 architecture (local-first, lazy server binding, cross-device hydration) as a NEW additive v2-native family. **Zero frozen contact**: `cla/ask` stays byte-frozen (T-MIG-069/097 untouched — the ask route is NOT modified); the tutor surface is NOT modified; the core is NOT contacted (no parity family exists for CLA threads — nothing to diverge from).

**Sync law (the load-bearing decision)**: the LOCAL store remains the source of truth; the server is a **best-effort full-state mirror**. The client pushes the entire transcript (≤100 messages) on a debounced schedule after every transcript commit, and hydrates server-only threads on overlay open. This is a client-mirror design — deliberately NOT server-side append-on-ask — because the client is the only witness of gate/error legs (they are client renderings of 400/409/404/503), so client-side mirror capture is FULL-fidelity where append-on-ask would silently lose them.

## 2. Scope

**IN (this PR)**: question-CLA surface (`surface = 'question_cla'`) end-to-end — DB tables, migration 0004, contracts, api store + routes + route-test battery, hub client bindings, v2-surface rows, the sync module, overlay hydration + player sync hook, store bind/hydrate pins.

**OUT (disclosed follow-ups)**: (a) the assistant-surface wiring — the DB `surface` CHECK already reserves `'assistant'`; the follow-up adds the `sessionId` field to `assistant-threads.ts` + the same sync module reuse; (b) delete/rename rail wiring — the DELETE endpoint ships tested but with NO client call site (the cross-question rail follow-up owns it); (c) durable deletion-propagation markers.

## 3. Server family (additive, v2-native)

Mounted at `/api/v1/learners/me/cla/threads` (index.ts mount, out-of-fence comment per T-MIG precedent), auth shell `requireAuth` first (the tutorsessions.ts:52 pattern), same error mapping family (404 not_found / 409 conflict / 400 "malformed request"):

| Endpoint | Law |
|---|---|
| `POST /` | create the mirror anchor `{surface:"question_cla", questionId, questionNumber, courseSlug, title}` → 201 `{threadId, createdAt}`; per-learner cap 200 → 409 conflict (the tutor R13 law: "delete an old chat…"); a `question_cla` row REQUIRES `question_id` (DB CHECK) |
| `GET /?surface=&questionId=` | summaries, newest-active first, cap 50 listed (the tutor list law); no transcript bodies |
| `GET /:id` | full transcript, seq-ordered; foreign-or-unknown id 404s indistinguishably (the §22 oracle law) |
| `PUT /:id` | the mirror write: full-state upsert `{title, questionNumber, courseSlug, messages[≤100]}` — per-row `INSERT … ON CONFLICT (thread_id, seq) DO UPDATE` + tail delete beyond the incoming length (no empty-transcript window), `last_active_at` never moves backwards; 200 `{threadId, lastActiveAt}`; 404 on foreign/unknown (client drops the binding — deletion is respected, no auto-recreate within the session) |
| `DELETE /:id` | 204; foreign-or-unknown 404 (no client call site v1 — disclosed §2) |

**Tables** (migration `0004_cla_thread_sync_tier.sql`, drizzle chain 0000→0004 under the T-MIG-139 fresh-env bootstrap law; additive-only):
- `cla_threads`: `id uuid PK`, `learner_id uuid FK→users ON DELETE CASCADE`, `surface varchar(20) CHECK ('question_cla','assistant')`, `question_id varchar(120) NULL`, `question_number integer NULL`, `course_slug varchar(64) NULL`, `title varchar(120) NOT NULL`, `created_at`/`last_active_at` timestamptz NOT NULL; CHECK `question_cla ⇒ question_id NOT NULL`; indexes `(learner_id, last_active_at DESC)` + `(learner_id, question_id)`.
- `cla_thread_messages`: `id uuid PK`, `thread_id uuid FK→cla_threads ON DELETE CASCADE`, `seq integer NOT NULL`, `kind varchar(16) CHECK ('user','assistant','gate','error')`, `text text NULL`, `question text NULL` (the error leg's echoed question — the round-trip law), `payload jsonb NULL`, `payload_version integer DEFAULT 1 NOT NULL`, `occurred_at timestamptz NOT NULL`, `created_at timestamptz NOT NULL`; `UNIQUE (thread_id, seq)`; shape CHECK (`assistant ⇔ payload NOT NULL AND text NULL AND question NULL`; others `⇔ text NOT NULL AND payload NULL`); question CHECK (`error ⇔ question NOT NULL`); index `(thread_id, seq)`.

**Contracts** (`packages/contracts/src/cla.ts`, additive tail): `claThreadCreateSchema`, `claThreadSyncSchema` (message discriminated union mirroring the client's 4-kind union; `at` = epoch ms int; assistant leg = `claAnswerViewSchema` payload — the ALREADY-ratified schema, zero new shape invention), `claThreadSummarySchema`, `claThreadViewSchema` (thread stamps ISO strings, tutor-view style; message `at` epoch ms — the client render vocabulary, disclosed). The route defensively `.parse()`s its own views (the cla.ts:282 wire law).

## 4. Client tier (additive to the phase-2a family)

- **Store** (`question-cla-threads.ts`, additive functions only): `bindQuestionClaSession(questionId, localThreadId, serverThreadId)`, `unbindQuestionClaSession(localThreadId)` (404 drop), `hydrateQuestionClaThreads(questionId, serverViews[])` — upsert-by-`sessionId`, local threads win (a bound thread is never clobbered), hydration NEVER moves the active pointer, caps respected. Two battery-refined laws (§6a): bind is FIRST-WINS (recovery goes through unbind — a stale-server rebinding is never silent), and hydration NEVER evicts an in-use thread — under full-store pressure the oldest ADDITIONS yield and the return count discloses exactly how many survived (the delete rail is the pressure relief valve).
- **Sync module** (`question-cla-sync.ts`, NEW): `scheduleQuestionClaSync(questionId)` — 800ms trailing debounce per question; no token → no-op; ensures binding (POST once, bind, then PUT) then PUTs the full transcript; fire-and-forget, silent failures (best-effort law), PUT 404 → unbind + session-scoped drop marker (no auto-recreate); `hydrateQuestionClaFromServer(questionId)` — guarded per question per session, individual transcript-fetch failures skip that thread.
- **Wiring** (2 call sites, additive): player `setMessages` adapter (`question-player.tsx`) schedules the sync after each store commit; overlay `open` effect hydrates when a token exists. Restore of a hydrated thread rides the EXISTING `setActiveQuestionThread` path — one rendering path, no new UI.
- **api.ts**: 1 `V2_SURFACE_PREFIXES` row (`/api/v1/learners/me/cla/threads` — prefix-row class, the tutor-sessions precedent) + 5 client functions mirroring the `tutorSession*` block; types in `types.ts` (the hub hand-declares, the TutorSession* style).

## 5. Disclosed deviations (all additive, none behavioral on existing surfaces)

1. **Client-mirror, not server-append** — gate/error legs sync (full fidelity); the cost is a chatty PUT per ask (debounced) and LWW-on-full-state conflict semantics (last ask wins; the tutor's single-writer-per-session practice makes this moot in practice).
2. **No `/latest`** — the question-scoped list is the hydration read; the global-latest read belongs to the rail follow-up.
3. **Message `at` is epoch ms in views** (thread stamps stay ISO) — round-trip fidelity with the local store beats ISO purity on a parity-free family.
4. **`surface='assistant'` lives in the DB CHECK with no API writer** — reserved for the follow-up, so the follow-up needs no migration.
5. **Fire-once sync, no client POST retry** (hub `request<T>()` retries GETs only — verified api.ts:1105-1110) — a failed append leaves a local-only gap, disclosed as the best-effort tier law.
6. **DELETE ships unwired** (tested server-side; rail follow-up owns the client call site).

## 6. Acceptance pins (the test battery)

Server (`apps/api/test/cla/threads.test.ts`, the tutor-routes.test.ts harness: real routers over fakeSql, injected auth, real error boundary): unauth 401 shell; create 201 shape + cap 409; question_cla-requires-questionId (DB CHECK mirrored by validation); list summaries (no bodies, cap 50, newest-first); view seq-ordered transcript + foreign/unknown 404 indistinguishable; PUT full-state upsert (create→update→shrink tail-delete; lastActiveAt monotonic; >100 messages 400; bad kind 400; assistant-payload shape law); PUT 404 foreign; DELETE 204 + foreign 404.

Hub: bind/unbind/hydrate store pins (bind refuses cross-question; hydrate never clobbers a bound thread, never moves the active pointer, respects caps, skips malformed); v2-surface rows (threads base + `:id` paths route v2; segment-safety: `/cla/threadsxyz` behavior matches the tutor-sessions prefix-row class); typecheck + build green.

## 6a. Battery-caught store defects (fixed in the STORE, never by relaxing a test)

1. **The error leg's `question` field had no storage home** — the sync round-trip would have dropped it and the view contract would have rejected every error message. Fixed: the `question text NULL` column + the `error ⇔ question NOT NULL` CHECK, caught before any apply.
2. **Hydration under a full store evicted its own just-fetched threads** (all 40 in-use threads protected → the additions were the only evictable rows). Fixed with the survivor law above.
3. **bind() rebind silently** contradicted its own doc comment — made first-wins of record.

## 7. Gate sequence (the established battery, full re-run before push)

root typecheck → bun test apps/api packages (full suites, expect 0 fail) → hub `tsc --noEmit` → cla + assistant + threads test pins → eslint on changed paths → `next build` full production. Base drift: rebase + full battery re-run (the #216/#225 law).

## 8. Risk fences (byte-untouched of record)

`apps/api/src/routes/cla.ts` (the frozen ask) — ZERO bytes; `packages/contracts/src/cla.ts` existing exports — additive tail only, no edits above the marker; `apps/api/src/routes/tutor*.ts`, `services/tutor/session-store.ts`, `packages/db/src/schema/schema.ts` existing tables — additive tail only; tutor hub files — ZERO bytes; BFF/goldens — ZERO bytes. The 404-after-auth fallback stays the last mount.

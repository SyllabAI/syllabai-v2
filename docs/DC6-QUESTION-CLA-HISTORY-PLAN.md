# DC-6 Phase 2a — Question-surface CLA history (hub-only, additive)

Task ID: DC6-WIRING-P2A · Operator directives (IM trace 1a15a73da1a77c05):
(1) ruling of record — "conversations should be saved to the database instead,
so history follows the learner across devices"; (2) "Proceed with (b) —
persist those Q&A threads (same store family as phase 1, question-scoped) so
learners can revisit what they asked about a problem."

## 0. What this is

Phase 1 (PR #216, merged `bf5dd4c`) gave `/assistant` a history rail. The one
surface still outside DC-6's parity law is the question-anchored CLA overlay
on the exam-questions player: its transcript lives in a per-question React
`Record` lifted to the player (`question-player.tsx` line 160) — close the
panel, switch tabs, reload: gone. This task persists those Q&A threads,
question-scoped, in the SAME local store family as phase 1, and gives the
learner a restorable "Past chats on this question" list.

## 1. Decisive constraints discovered during feasibility

- The transcript state is **lifted to the player**, not owned by the overlay:
  `QuestionClaOverlay` receives `messages` / `setMessages` props, and the
  player already adapts functional updaters against `prev[key]` (the
  fresh-prev race law). The store must therefore accept the SAME
  updater-or-array payload and resolve it **inside the store** — resolving in
  the player against render-time state would break the mid-flight ask
  contract (the running `ask()` closure holds the render-N setter).
- `cla/ask` stays **frozen parity** (T-MIG-069/097; phase-1 plan §1). Nothing
  here touches it: persistence is client-side of the existing contract.
- The operator's DB ruling is the END-STATE of record. This phase ships the
  local tier of the tutor's own two-tier architecture and the sync seam; the
  server tier is the sequenced next PR (§7), not smuggled in here.

## 2. Decision

- NEW `apps/hub/src/components/cla/question-cla-threads.ts` — local thread
  store, structural mirror of `assistant-threads.ts` (itself a mirror of
  `tutor/threads.ts`): module state + `useSyncExternalStore`, cross-tab
  storage event, 400ms throttled persist, quota-exceeded in-memory degrade.
  Own keys (`syllabai.claThreads.v1`, `…activeByQuestion.v1`) — disjoint from
  assistant and tutor stores; zero imports from any client component or other
  surface (the message union is a disclosed structural copy of the overlay's
  `QuestionClaMessage`). Caps: 40 threads / 100 messages per thread (the CLA
  answer view carries citations + tools — heavier than assistant turns; 100
  not 200, disclosed). Threads carry `questionId` + `questionNumber` +
  `courseSlug` (V53 discipline) and the `sessionId?: string | null` sync seam.
  One write path: `commitQuestionClaMessages(questionId, update, meta)` —
  empty-resolve = archive (pointer cleared, thread kept); non-empty = ensure
  active thread (created on first ask, never on page load) + replace
  messages + title law (first user turn).
- EDIT `apps/hub/src/app/courses/[course]/exam-questions/[topicSlug]/question-player.tsx`
  — the ONLY state change: `claTranscripts` useState is replaced by the store
  snapshot; `messages` derives from the active thread;
  `setMessages` forwards the untouched payload to
  `commitQuestionClaMessages`. The ask flow (request body, error mapping,
  409 gate, ordering) is byte-identical.
- EDIT `apps/hub/src/components/cla/question-cla-overlay.tsx` — additive only:
  a "Past chats on this question" block in the EMPTY state (below the two
  quick chips — which stay primary, SME parity), listing up to 8 threads for
  THIS question (title · turn count · relative time); a tap becomes the
  question's active thread. Header buttons, shells, anchor line, transcript
  rendering: untouched. With no history the empty state renders
  pixel-identical.
- NEW `apps/hub/src/components/cla/question-cla-threads.test.ts` — the pin
  battery (§4).
- NEW this doc.

Byte-untouched: `apps/api/**`, `packages/**`, `apps/hub/src/app/tutor/**`,
`apps/hub/src/app/assistant/**`, the BFF routes, every golden case.

## 3. Disclosed deviations

1. **Device-local tier now; server tier sequenced.** The operator's ruling
   makes DB-backed history the of-record end-state. Phase 2a ships the local
   tier + the `sessionId` seam exactly where the tutor's §22 sync tier slots
   in; the server pane/sync PR decides the append path (exposed sessions
   append endpoint vs optional `sessionId` on frozen `cla/ask`) on its own
   feasibility pass. "Revisit on this device" is delivered now; "follows the
   learner across devices" lands with the sync tier — both surfaces together,
   so no surface is left behind on a mixed architecture.
2. **"New chat" archives instead of destroying.** The old law on this surface
   was "survives nothing". Revisit REQUIRES survival: New chat now clears the
   active pointer and lists the thread under "Past chats on this question"
   (phase-1 assistant semantics). Disclosed in the header doc comment.
3. **Restore is transcript-only.** The overlay's target/anchor selection is
   per-open by design (existing behavior); restored answers keep their own
   per-message trace (mode, provider, evidence, latency). The anchor line
   always shows the LIVE question — if the corpus wording changed since a
   stored answer, the discrepancy is visible, not hidden.
4. **Restore-only history list.** No delete/undo in the overlay (the store
   API carries the laws; a cross-question rail pass would own full rail
   vocabulary). Capped lists, honest counts.

## 4. Acceptance pins

- (a) Family pin: the store behaves like the assistant/tutor local stores
  (create-on-first-ask, title law, caps, throttled persist, cross-tab,
  quota degrade) with provably disjoint keys.
- (b) Restore pin: the active thread's transcript survives panel close,
  question switches, and reloads (device tier); New chat archives; a past
  chat tap restores; a post-archive ask opens a NEW thread without touching
  the archived one.
- (c) Isolation pin: cla threads are invisible to the assistant and tutor
  stores and vice versa (test-pinned, read-only probes).
- (d) Race pin: updater resolution happens against store state (fresh-prev
  law) — a mid-flight ask's user and assistant turns can never drop.
- (e) Do-no-harm pin: ask flow semantics byte-identical; gates (§5) green.

## 5. Gate sequence (abort on first red)

1. `bun install`
2. `bun run typecheck` (root — api+packages untouched proof)
3. `bun test apps/api packages` (untouched-behavior proof)
4. `cd apps/hub && bunx tsc --noEmit`
5. `bun test apps/hub/src/components/cla` (new store pins)
6. eslint on the changed/new paths
7. `bun run --cwd apps/hub build` (definitive; the phase-1 honest-fallback
   clause applies verbatim if the sandbox cannot complete it)

## 6. Risks and their fences

- R1 Base drift (lanes actively merging — t-mig-138 landed through this
  task's start): branch field is `components/cla/*` + `question-player.tsx` +
  this doc — a file set the active api-side lanes do not touch; base
  re-checked immediately before the PR opens.
- R2 localStorage quota / private mode: try/catch, in-memory degrade (family
  shape).
- R3 SSR hydration: empty server snapshot (family shape).
- R4 Corpus drift vs stored answers: the anchor line + per-message trace keep
  the live question honest; no gating, no silent re-anchoring (deviation 3).
- R5 Storage growth: 40×100 caps, eviction protects the active thread only.
- R6 Behavior change to the ask flow: none — payload forwarding is
  pass-through; only where messages are stored changes.

## 7. Out of scope (filed, not forgotten)

- Server-backed CLA sessions (the operator's DB ruling): the sync-tier PR —
  sessions-append feasibility pass first, frozen `cla/ask` byte-untouched.
- Cross-question CLA history rail (full rail vocabulary: search, groups,
  rename, delete+undo).
- DC-2 v13 prompt bump — unchanged sequencing: after DC-6 lands cleanly.

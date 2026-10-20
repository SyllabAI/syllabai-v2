# DC-6 Phase 1 — Assistant History Parity (hub-only, additive)

Task ID: DC6-WIRING-P1 · Operator directive (IM trace 1a1598c8f84aca81):
"Proceed, but make a foolproof plan. Don't break anything in v2."

## 0. What this is

The DC-1..12 wiring audit (worklog `DC-WIRING-AUDIT-2026-10-20`) found DC-6
(history symmetry) **PARTIAL**: the tutor surface ships a conversation rail
(`ThreadSidebar`), while the standalone assistant (`/assistant`) keeps its
transcript in bare React state — the exact asymmetry DC-6 outlaws. This task
wires the assistant's history rail. It is the cheapest DC in the set and the
only one whose phase 1 touches **zero core files**.

## 1. The decisive constraint discovered during feasibility

The tutor's own rail is **localStorage-first**: `tutor/threads.ts` is a local
thread store (module state + `useSyncExternalStore`, 40-thread/200-turn caps,
throttled persist, cross-tab sync); the §22 server session is a *lazily bound
sync target* (`sessionId?: string | null`, "null = local-only thread"), and
the sidebar renders the LOCAL threads with the server pane as a second,
clearly-labeled section. "On this device" is an established, honest house
tier — not a new invention.

Meanwhile the assistant's ask path is `POST /api/ai/cla` (hub BFF) → core
`POST /api/v1/learners/me/cla/ask` — the latter is a **frozen-parity port**
(T-MIG-069/097 lineage, two-envelope classifier, golden-pinned) whose request
schema has no `sessionId`, and the sessions store exposes **no append
endpoint** over HTTP (append is internal to the tutor ask path). Therefore
server-backed assistant history cannot be reached without a parity-deviation
decision on a heavily-pinned surface.

## 2. Decision

Phase 1 mirrors the tutor's own architecture exactly:

- NEW `apps/hub/src/app/assistant/assistant-threads.ts` — local thread store
  (structural mirror of `tutor/threads.ts`: module store +
  `useSyncExternalStore`, cross-tab storage event, MAX 40 threads / 200
  messages, 400ms throttled persist, quota-exceeded degrades honestly to
  in-memory). Own storage keys (`syllabai.assistant.threads.v1`) — fully
  disjoint from the tutor store. Threads carry `courseSlug` (V53 discipline:
  the rail filters slug-to-slug, never by label). Copies two pure helpers
  (`groupThreads`, `relativeTime`) with disclosure — zero tutor imports, so
  the tutor surface is byte-untouched.
- NEW `apps/hub/src/app/assistant/history-rail.tsx` — slim local rail with
  the tutor rail's interaction vocabulary: New chat, search, date groups,
  relative timestamps, turn counts, inline rename, delete with undo toast,
  course scope line. No server pane (disclosed below).
- EDIT `apps/hub/src/app/assistant/assistant-client.tsx` — the ONLY edited
  file: transcript state moves from bare `useState` to the active store
  thread (render block untouched — the message shape is field-identical);
  desktop rail column + mobile Sheet mount in the existing container.

Byte-untouched: `apps/api/**`, `packages/**`, `apps/hub/src/app/tutor/**`,
the BFF routes, `assistant/page.tsx`, and every golden case.

## 3. Disclosed deviations from DC-6's letter

1. **Device-local, not server-store-backed (phase 1).** DC-6's mechanics say
   "backed by the existing session store". Reaching that store from the CLA
   surface requires either an exposed sessions-append endpoint or an optional
   `sessionId` on the frozen-parity `cla/ask` — an operator-level parity
   decision, filed as the follow-up, NOT smuggled into this task. Phase 1
   delivers DC-6's user-visible parity (the browser on both surfaces) at the
   tutor's own local tier; the rail is built so the server pane can be added
   later exactly the way the tutor's was (a second labeled section).
2. **Resume restores the transcript, not the anchors.** The CLA's §3
   explicit-context contract stays explicit: after resume the anchor bar
   shows the live (default) selection, and every restored message keeps its
   own per-message anchor label (already rendered). The learner re-picks the
   anchor before the next ask; nothing silently re-anchors.
3. **No scope note in stored titles.** The store's derived-title law (title =
   first user turn) is frozen parity; the surface is distinguished by the
   rail's header and the per-message context labels instead.

## 4. Acceptance pins

- (a) Parity pin: both surfaces render a rail with the same interaction
  vocabulary (new chat / search / date groups / relative timestamps / rename
  / delete+undo). Unit-tested at the store layer.
- (b) Resume pin: resuming a thread restores its full transcript; the anchor
  selection is NOT changed (deviation 2, disclosed in-UI by the anchor bar).
- (c) Isolation pin: assistant and tutor threads share no storage keys, no
  imports, no types — a tutor thread can never surface in the assistant rail
  or vice versa (test-pinned: keys disjoint, stores independent).
- (d) Do-no-harm pin: `bun run typecheck` + `bun test apps/api packages` pass
  UNCHANGED (API/packages byte-untouched); hub `tsc --noEmit`, eslint on
  changed paths, the new store test, and `next build` all green.

## 5. Gate sequence (abort on first red)

1. `bun install`
2. `bun run typecheck` (root — api+packages untouched proof)
3. `bun test apps/api packages` (untouched-behavior proof)
4. `cd apps/hub && bunx tsc --noEmit`
5. `bun test apps/hub/src/app/assistant` (new store tests)
6. eslint on the changed/new paths
7. `bun run --cwd apps/hub build` (definitive; if the sandbox cannot complete
   a pre-existing-heavy step, the failure is disclosed and gate 4–6 stand as
   the binding verification, stated honestly in the PR)

## 6. Risks and their fences

- R1 Base drift (lanes are actively merging today; t-mig-136 landed 12:36Z):
  branch is confined to `apps/hub/src/app/assistant/` + this doc — a file
  field with zero overlap; base is re-checked immediately before the PR opens.
- R2 localStorage quota / private mode: try/catch, in-memory degradation
  (tutor precedent, same code shape).
- R3 SSR hydration: `useSyncExternalStore` server snapshot is the empty
  state (tutor precedent, same shape).
- R4 Cross-surface leakage: impossible by construction — disjoint keys, no
  shared imports (pin c).
- R5 Behavior change to the ask flow: none — `ask()` keeps its request body,
  error handling, and ordering byte-identical; only where the messages are
  stored changes.

## 7. Out of scope (filed, not forgotten)

- Question-surface (exam-questions CLA overlay) history — its transcripts are
  per-question-keyed state; needs its own rail design pass (phase 2).
- Server-backed assistant sessions — needs the parity decision (deviation 1).
- DC-2 v13 prompt bump — touches every tutor response; the opposite of
  foolproof; sequenced after this lands cleanly.

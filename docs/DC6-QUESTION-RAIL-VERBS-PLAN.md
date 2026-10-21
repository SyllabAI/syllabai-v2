# DC-6 phase 3c — the question-rail management verbs (prereg of record)

**Status**: prereg — committed to main WITH the implementation PR (the #216/#225/#229/#232 pattern: the plan doc is the PR's diff-of-record anchor).
**Operator commission of record** (trace `1a15b3df8fdc0d8d`): "1 → 2 → 3 Proceed" — the SECOND of the three follow-ups the sync-tier prereg (`docs/DC6-CLA-SYNC-TIER-PLAN.md` §2 OUT-b) disclosed: "delete/rename rail wiring — the DELETE endpoint ships tested but with NO client call site (the cross-question rail follow-up owns it)".
**Grounding**: main `1714d59`; #232 (phase 3b, the assistant surface) merged 2026-10-21 as `418a23a`; the API family verified complete first-hand (`routes/cla-threads.ts` PUT :177 full-state mirror + DELETE :214 → 204 / foreign-or-unknown 404); the hub client method verified already shipped UNWIRED (`api.ts` `claThreadDelete`, whose comment of record names "the phase-3c question-rail verbs" as its intended call site); the question rail verified = the overlay's "Past chats on this question" list (`question-cla-overlay.tsx`), rendering NON-active threads only; the store's own hydration comment (`question-cla-threads.ts` "the rail follow-up (delete wiring) is the pressure relief valve") anticipates this slice.

## 1. Decision

The question rail's "Past chats" entries get the SAME management verbs the assistant rail shipped in phase 3b — rename, delete, undo — under the SAME family laws (local store = source of truth; server = best-effort full-state mirror; fire-once; PUT 404 = deletion respected; silent-failure degradation to local-only). **Zero API changes**: PUT (rename rides the full-state mirror write — title is a field of `ClaThreadSync`) and DELETE (204) both exist and are tested server-side; `claThreadDelete` exists client-side. This PR is the call-site wiring only. **Zero frozen contact**: `cla/ask` byte-untouched (T-MIG-069/097 posture), no tutor files, no assistant files (phase 3b's lane stays byte-identical), no contracts edits, no migration.

## 2. Scope

**IN (this PR)**: store tail (`question-cla-threads.ts`): `renameQuestionClaThread` (returns the fresh row — the mirror mirrors exactly what was renamed), `deleteQuestionClaThread` (clears the owning question's active pointer to null — the archive law), `insertQuestionClaThread` (undo restore at the SAME id, caps respected); sync tail (`question-cla-sync.ts`): `notifyQuestionClaThreadDeleted` (drop marker FIRST + session-scoped `deletedServerThreads` + server DELETE fire-and-forget when bound), `renameQuestionClaThreadOnRail` (local rename, then a DIRECT full-state PUT for THIS thread), the hydration filter that skips this session's deleted server threads; overlay wiring (`question-cla-overlay.tsx`): per-entry rename (Pencil → inline input + Check, Enter/Escape keys) and delete (Trash2 → toast + Undo) affordances, hover-revealed ≥lg / always-visible below (the assistant rail's exact vocabulary); store verb pins in `question-cla-threads.test.ts`.

**OUT (still disclosed)**: the FULL cross-question rail — search, date groups, a global-latest read, and a cross-question surface beyond the overlay's empty state (the phase-2a prereg §7 vocabulary; a lane of its own); durable deletion-propagation markers (today's markers stay session-scoped — sync-tier prereg §2 OUT-c); delete/rename for the ACTIVE thread (the rail lists non-active threads only; the active title auto-derives from the first user turn — the phase-2a title law, unchanged); server-side undo (DELETE is a hard delete of record; undo restores locally only).

## 3. The verbs' laws (family copy-adapt, `assistant-threads.ts` / `assistant-sync.ts` / `history-rail.tsx` verbatim posture)

| Verb | Local half (store) | Network half (sync module) | UI (overlay) |
|---|---|---|---|
| rename | `renameQuestionClaThread(id, title)` — whitespace collapsed, 80 cap, empty keeps old, `updatedAt` moves, returns the fresh row or null | `renameQuestionClaThreadOnRail(id, draft)` — takes the store's RETURNED row and PUTs its full state (title + questionNumber + courseSlug + messages); PUT 404 → unbind + drop marker; other failures silent | Pencil (hover ≥lg) → inline input + Check; Enter commits, Escape cancels |
| delete | `deleteQuestionClaThread(id)` — removes the row, clears the owning question's pointer to null | `notifyQuestionClaThreadDeleted(thread)` — drop marker FIRST (the debounced loop can never re-create it), `deletedServerThreads` records the server anchor, pending timer cancelled IF the deleted row is its question's active one (defensive), then `api.claThreadDelete` fire-and-forget when bound + tokened | Trash2 (hover ≥lg) → local removal + toast with Undo |
| undo | `insertQuestionClaThread(thread, false)` — same id back, caps respected, pointer untouched | none — the server row stays deleted; the restored thread is LOCAL-ONLY from then on (a later PUT on its stale binding 404s → unbind + drop marker — the phase-3b law handles it honestly) | the toast's Undo button → "Restored" toast |

**Why a DIRECT PUT for rename** (not the debounced loop): the rail lists NON-active threads only, and `scheduleQuestionClaSync` mirrors a question's ACTIVE thread — a renamed rail entry would never reach the server through it. The direct PUT carries the store's returned row verbatim; a same-moment cross-tab edit loses nothing (local = source of truth; the next hydration/PUT reconciles).

**Why the hydration filter**: between the fire-and-forget DELETE and the server row's disappearance, a refetch could list the deleted thread and hydrate it back (a NEW local id bound to the dying server row). The session-scoped `deletedServerThreads` set closes this window for the session; the cross-session law belongs to the durable-marker follow-up (OUT-c), disclosed in the sync-tier prereg.

## 4. Disclosed deviations (all additive, none behavioral on existing surfaces)

1. **Copy-adapt over a shared module** — the family's disclosed style (phase 1: "shares ZERO files with the tutor surface"; phase 3b §5.5): the question verbs copy the assistant's shapes so neither surface's blast radius reaches the other.
2. **`renameQuestionClaThread` RETURNS the fresh row** — a small signature departure from the assistant's `renameThread` (void): the mirror needs the exact renamed state, and returning it beats a second store probe. The assistant lane stays byte-identical.
3. **Undo restores LOCAL-ONLY** — phase 3b's disclosed posture verbatim (its §5.4): the server row is gone; the restored thread re-joins the sync tier only through a future ask's lazy re-bind (a fresh POST), never by re-mirroring into the dead anchor.
4. **The defensive active-pointer timer cancel** — the rail can only delete non-active threads, but if a pointer race ever made one active, the pending debounced mirror of the deleted row is cancelled; the store's pointer cleanup (`deleteQuestionClaThread`) covers the state half.
5. **Toast copy "Chat deleted"/"Restored"** vs the assistant's "Conversation deleted"/"Restored" — the question rail's entries are chats on a question, not conversations; vocabulary follows the surface (the phase-2a rail already says "Past chats").

## 5. Acceptance pins (the test battery)

Hub store pins (`question-cla-threads.test.ts`, bun, no DOM — the honest-degradation tier): rename sets a trimmed/collapsed title, moves `updatedAt`, returns the row; an empty draft keeps the old title; an unknown id returns null and mutates nothing; delete removes the row and clears the OWNING question's pointer (other questions' pointers untouched); insert restores at the SAME id with `makeActive=false` leaving pointers alone and `makeActive=true` re-pointing the owning question; the 40-cap is respected on insert. Hub `tsc --noEmit` + eslint changed paths + `next build` full production green. API: ZERO bytes — the existing `threads.test.ts` battery already pins PUT/DELETE.

## 6. Gate sequence (the established battery, full re-run before push)

root typecheck → bun test apps/api packages (full suites, expect 0 fail) → hub `tsc --noEmit` → hub pin suites (assistant + question + tutor store pins) → eslint on changed paths → `next build` full production. Base drift: rebase + full battery re-run.

## 7. Risk fences (byte-untouched of record)

`apps/api/src/routes/cla.ts` (the frozen ask) — ZERO bytes; `apps/api/**` — ZERO bytes (no route, no store, no contracts change; the server battery is untouched); `apps/hub/src/app/assistant/**` — ZERO bytes (phase 3b's lane); tutor hub files — ZERO bytes; `packages/**` — ZERO bytes. The diff touches exactly three hub files (store tail, sync tail, overlay rail) + the plan doc + the store pin suite.

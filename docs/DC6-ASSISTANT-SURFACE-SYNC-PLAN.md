# DC-6 phase 3b — the assistant-surface sync wiring (prereg of record)

**Status**: prereg — committed to main WITH the implementation PR (the #216/#225/#229 pattern: the plan doc is the PR's diff-of-record anchor).
**Operator commission of record** (trace `1a15b3df8fdc0d8d"): "1 → 2 → 3 Proceed" — the first of the three follow-ups the sync-tier prereg (`docs/DC6-CLA-SYNC-TIER-PLAN.md` §2 OUT-a) disclosed: the DB `surface` CHECK already reserves `'assistant'` (schema.ts:1400 comment of record); this PR opens the API writer and wires the assistant rail into the same mirror tier.
**Grounding**: main `1149646f`; #229 (the sync tier) merged 2026-10-20; `assistant-threads.ts` verified with ZERO sync seams; the assistant rail's rename/delete/undo UI already exists locally (`history-rail.tsx`).

## 1. Decision

The assistant rail (`/app/assistant`) joins the sync tier under the SAME laws of record (local store = source of truth; server = best-effort full-state mirror; fire-once; PUT 404 = deletion respected; hydration never moves the pointer; silent-failure degradation to local-only). **Zero frozen contact**: `cla/ask` byte-untouched (T-MIG-069/097 posture), the tutor surface untouched, no migration (the phase-3 tables already admit the surface — plan §5.4's reservation pays off).

**The one new design decision — the assistant-leg payload contract**: the assistant rail's transcript is a coarse projection (`AssistantMessage`: content string + citations + mode/provider/model/refused/evidenceCount + a coarse context `{kind, anchor, attempted?}` — from the hub `/api/ai/cla` route), NOT the question surface's ratified `claAnswerViewSchema` (whose context carries server-resolved uuids/topics/tools the rail never receives). Fabricating uuids to force `claAnswerViewSchema` would be shape invention; widening the question surface's payload union would weaken its wire law. So the assistant surface gets its OWN additive schemas (below), and each surface's law stays exact.

## 2. Scope

**IN (this PR)**: contracts additive tail (assistant create/sync/view schemas + the assistant answer payload schema); the API admission branch (create slit → surface branch; PUT + GET branch on the ROW's surface via the new `surfaceOf`); store `questionId` widened to nullable; hub types + 3 client functions; `assistant-threads.ts` sync tail (sessionId seam + bind/unbind/hydrate, the phase-3 laws verbatim); `assistant-sync-wire.ts` (the PURE construction contract: role-union ↔ 4-kind wire union, round-trip honest); `assistant-sync.ts` (the mirror loop, copy-adapt of `question-cla-sync.ts` per the family's disclosed copy-adapt style — zero cross-surface imports); wiring (ask commits schedule the sync, mount hydrates, rail rename schedules, rail delete propagates the server DELETE — the deletion-respected law demands it: an unwired delete would resurrect on every hydration); test battery.

**OUT (still disclosed)**: the cross-question rail + its global-latest read and delete/rename affordances for the QUESTION surface (follow-up 2 of the commission); durable deletion-propagation markers (today's drop marker stays session-scoped); the assistant rail's `>100`-message local threads mirror only their newest 100 (the family wire law; the local 200 cap predates and stays).

## 3. Server family (additive branches, v2-native)

Same mount, same error mapping, same oracle law. The phase-3 schemas stay **byte-identical** — the assistant surface branches on them:

| Endpoint | Assistant-surface law |
|---|---|
| `POST /` | body `{surface:"assistant", courseSlug nullable, title}` (`.strict()` — a questionId/questionNumber smuggle is a 400) → the store inserts `question_id NULL` (the DB scope CHECK `assistant ⇔ question_id IS NULL` satisfied) → 201 |
| `GET /` | unchanged; `?surface=assistant` is the hydration read |
| `GET /:id` | the ROW's surface picks the view schema: `claAssistantThreadViewSchema` (2-kind message union, coarse payload) vs the unchanged `claThreadViewSchema` |
| `PUT /:id` | `store.surfaceOf()` (new, the ownership oracle) reads the ROW first; the row's surface picks the sync schema: `{title, courseSlug nullable, messages[≤100]}` — questionNumber ABSENT (an assistant thread never has one) |
| `DELETE /:id` | unchanged (its first call sites land in this PR: the rail's delete + undo interplay) |

**Contracts** (`packages/contracts/src/cla.ts`, additive tail only — zero edits above the phase-3 marker): `claAssistantContextSchema`, `claAssistantAnswerPayloadSchema` (the rail's projection VERBATIM — every field optional exactly as the rail stores it), `claAssistantThreadCreateSchema`, `claAssistantThreadSyncMessageSchema` (2-kind union: user text ≤2000 / assistant payload), `claAssistantThreadSyncSchema`, `claAssistantThreadViewSchema`. The gate/error kinds are deliberately ABSENT — the assistant rail never stores them (errors are transient `setError` state, verified `assistant-client.tsx:230-242,269`).

**Store** (`threads-store.ts`): `ClaThreadCreateInput.questionId: string | null` (the only existing-shape edit, disclosed); `ClaThreadSyncInput.messages` widened to the two-union; new `surfaceOf` (the oracle law — foreign/unknown 404 indistinguishable). Everything else byte-identical.

## 4. Client tier (additive to the phase-1 family)

- **Store tail** (`assistant-threads.ts`): `AssistantThread.sessionId?: string | null`; `bindAssistantSession` (FIRST-wins), `unbindAssistantSession`, `getAssistantThread`, `hydrateAssistantThreads` (local wins, NEVER moves `activeId`, caps respected, the survivor law: under full-store pressure the oldest additions yield and the return count discloses), malformed-message skip.
- **Wire contract** (`assistant-sync-wire.ts`, NEW, PURE — zero api imports so the pins run without a network surface): `toWireAssistantMessage` (user → `kind:"user", text:content`; assistant → `kind:"assistant", payload:{answer:content, citations, ...projection fields as-they-are}` — the typed construction contract, no casts, absent fields stay absent), `fromWireAssistantMessage` (the exact inverse; gate/error rows skip — they cannot exist on assistant rows), `MIRROR_TRANSCRIPT_CAP = 100`.
- **Sync module** (`assistant-sync.ts`, NEW — the question-cla-sync laws, copy-adapt): per-thread 800ms trailing debounce, token-gated, SSR-guarded; lazy-bind (POST once → bind → PUT); fire-once (no POST/PUT retry — the hub retries GETs only); PUT 404 → unbind + session-scoped drop marker (no auto-recreate); `notifyAssistantThreadDeleted(thread)` — the drop marker + the server DELETE when bound (fire-and-forget; a failed DELETE leaves the row until the durable-marker follow-up — disclosed); `hydrateAssistantFromServer()` — once per session, list `?surface=assistant` → per-thread GET (the s143 discipline; an individual failure skips that thread) → hydrate.
- **Wiring** (4 call sites, additive): `assistant-client.tsx` — after the user-leg and assistant-leg `appendMessages` commits (the debounce coalesces one PUT per ask burst) + the mount hydration effect; `history-rail.tsx` — both rename commit sites schedule the sync for THAT thread (not just the active one), `remove()` notifies the deleted thread first.
- **api.ts + types.ts**: `claAssistantThreadCreate` / `claAssistantThreadSync` / `claAssistantThreadGet` (+ the hand-declared types, the TutorSession* style); `claThreadList` / `claThreadDelete` are shared as-is.

## 5. Disclosed deviations (all additive, none behavioral on existing surfaces)

1. **Per-surface schemas, not a payload union** — the question surface's wire law (`assistant ⇔ claAnswerViewSchema`) stays exact; the assistant law pins the rail's projection verbatim. The route/store branch on the ROW's surface, never the caller's claim.
2. **The mirror carries the newest 100** of a locally-200 thread (the family wire law; the local cap stays 200). A >100-thread hydrated on another device continues from its newest 100 — disclosed fidelity bound.
3. **The phase-3 reservation pin flips** — `threads.test.ts` "assistant surface is RESERVED → 400" is REPLACED by the admission battery (the pin's own comment reserved it "until the follow-up lands"; the operator's 1→2→3 commission is that follow-up). The question-surface rejection laws (bad surface, questionId smuggle at the assistant branch, missing questionId at the question branch) are re-pinned in the same battery.
4. **Delete propagates from the assistant rail in THIS PR** — not because it was scoped here, but because the rail already ships delete and an unwired delete would resurrect threads on every hydration (a correctness bug, not a feature gap). Undo after a synced delete restores the thread LOCAL-ONLY (the server row is gone; the PUT 404 → unbind law handles the stale binding honestly).
5. **Copy-adapt over a shared sync module** — the family's disclosed style (phase 1: "shares ZERO files with the tutor surface"); the two sync modules stay decoupled so neither surface's blast radius reaches the other.
6. **The PUT oracle becomes body-blind** (battery-caught law upgrade) — reading the ROW's surface before the body parse means a foreign/unknown thread answers 404 BEFORE any body law. Phase 3 leaked body validity to foreign callers (a malformed body got 400, a well-formed one 404 — a probe signal); the battery caught the ordering change and the pin was strengthened, not relaxed: the smuggle-400 law now pins against an OWNED row, and the foreign-404 law pins for BOTH body shapes.

## 6. Acceptance pins (the test battery)

Server (`apps/api/test/cla/threads.test.ts`, same harness): assistant create 201 (question_id NULL inserted); assistant + questionId smuggle → 400; assistant + questionNumber smuggle → 400; question surface with missing questionId → 400; assistant PUT round (200, seq upserts, metadata refresh, markActive guard); question-schema body at an assistant row → 400 (the surfaceOf branch); gate kind at an assistant row → 400; GET assistant view (2-kind union, coarse payload round-trip); list `?surface=assistant`.

Hub (`assistant-threads.test.ts`, bun, no DOM): bind first-wins + cross-thread refusal; unbind no-ops; hydrate (server-only land bound; local wins; `activeId` NEVER moves; caps + survivor law; malformed skip); the construction contract pins (role-union → wire → role-union round-trip byte-honest, absent fields stay absent); the 100-mirror-cap law. Hub `tsc --noEmit` + eslint changed paths + `next build` full production green.

## 7. Gate sequence (the established battery, full re-run before push)

root typecheck → bun test apps/api packages (full suites, expect 0 fail) → hub `tsc --noEmit` → hub pin suites (assistant + question + tutor store pins) → eslint on changed paths → `next build` full production. Base drift: rebase + full battery re-run.

## 8. Risk fences (byte-untouched of record)

`apps/api/src/routes/cla.ts` (the frozen ask) — ZERO bytes; `packages/contracts/src/cla.ts` — additive tail only, zero edits to the phase-3 exports; `apps/api/src/services/cla/threads-store.ts` — the two disclosed type widenings + `surfaceOf` only; `routes/cla-threads.ts` — the create slit becomes the surface branch, PUT/GET gain the surface branch (the question-surface laws byte-identical in behavior); tutor hub files — ZERO bytes; the question surface files — ZERO bytes (FU-2's lane); BFF/goldens — ZERO bytes.

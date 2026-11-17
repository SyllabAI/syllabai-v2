# ADR-044 run-010 — receipt (the Phase 2 preregistration of record — the Editor Workbench MVP, Tier 1 only)

- Date: 2026-11-17 · Authority: governance filing under the standing-authorization session that closed Gate 2 (run-009) — filings need no fresh order; **the BUILD itself awaits the operator's go**. · Design of record: `docs/ADR-044-EDITOR_ROLE_CONTENT_WORKBENCH.md` §8–§10 (ACCEPTED on merge).

## Why now

Phase 1 is fully closed: the planes, `requireEditor`, `GET /me`, the hub capability + edit-history (run-002, PR lineage of record), the grants saga (runs 003–006), the fork-option-2 probe (run-007), the cutover lane (run-008), the exit criterion on prod (run 43663367700, `ok:true`, enforcement `none-needed`), and the live cutover (run-009 — the app's pooled connections authenticated AS `syllabai_v2_app_w3r3`; `/editor/me` wire-proved 403 fail-closed for the grant-less). The ADR's own route file still says it: *"the banks/preflight/proposals/review/receipts surfaces are Phase 2"*. This filing pins the build so the next session executes instead of rediscovering — the exact recycle-loss class this house keeps paying.

## The build units (each independently shippable and revertible; each a receipts-carrying PR)

- **B1 — the gate engine as ONE shared package** (`packages/editor-gates`): the single-module law of §8 — consumed (a) in the hub bundle for client-side pre-flight and (b) in CI/prebuild as the corpus gates; the law families **G-CANON, G-SER, G-FIELD, G-CHAR, G-ASSET, G-EYES, G-SCOPE** as typed refusals with stable editor-readable codes; the reference MVP's fixtures (incl. the three wave-D-repaired physics questions) as regression pins; the tier classifier's boundary tests live in the engine's own suite (a misclassification is a failing test, never a judgment call).
- **B2 — the proposal plane API** (v2-native additive under `/api/v1/editor/*`): `GET /banks` (corpus inventory from the resources HEAD, read-only); `POST /preflight` (stateless gate run → the typed refusal list); `POST /proposals` (server-side tier classification — the client's is advisory; Tier 1 auto-merge path only when all gates green AND `base_sha` clean); `GET /proposals` + `GET /proposals/:id`; `GET /proposals/:id/receipts`; the §7 state machine (draft → preflight_failed / queued_review / approved / merged / rejected / superseded); the two-envelope shell law on every body-bearing route.
- **B3 — the caps, pinned in contracts** (`packages/contracts/src/editor.ts` extensions): open proposals per user **10**; receipt rows per proposal **200**; field delta bytes per proposal **512KB** (the WORKSPACE_DOC_MAX_BYTES figure, already load-tested); every cap a pinned test; request schemas two-envelope-shaped; response schemas mirror the records.
- **B4 — the Tier 1 auto-merge path with the PR transport DISCLOSED-SIMULATED** (the §9 MVP law carried verbatim): proposals persist + receipts + the journal renders the pipeline state; the PR on `syllabai-resources` is **simulated and disclosed in-app in Phase 2** (the reference MVP's no-networked-commit-path disclosure); Phase 3 swaps ONLY the transport (the GitHub App) — "not one line of the pipeline above changes shape". The census-guard-coupled serve stays **lane-only** in every phase.
- **B5 — the Workbench hub UI** (identity-gated, the teacher-store client law): bank browser (from `GET /banks`), question view (the exact production rendering components, not a re-implementation, with the structured-edit toggle over canonical fields), pre-flight panel (each refusal: code + offending field + smallest corrective hint), proposal journal (the user's own proposals with state, tier, hashes). The Tier 2 review queue is **Phase 3** — negative space in Phase 2, not a placeholder.

## The acceptance law (verified against the MVP golden path)

Act as an editor → open a bank → repair a field → watch pre-flight type the gates → propose → see Tier 1 advance with a receipt; the API golden path and the browser flow both green (the reference bar: **20/20** API + **10/10** UI). Plus the standing walls: census-guard untouched; zero bytes under `apps/hub/content/**`; NO editor-reachable serve or merge-to-main endpoint (E-0, §11 — asserted by tests, not by comment); the append-only receipts law enforced at the DB layer (now provable — the app runs AS w3r3 per run-009).

## Explicit boundaries of this preregistration

- Tier 2/3 do not ship in Phase 2 (the classifier routes them; Tier 2's queue is Phase 3; Tier 3 discloses and stops, hand-off to lanes).
- No GitHub App, no real PR transport, no serve trigger, no corpus write path from the editor plane in Phase 2.
- The build start is the operator's call (or the next standing-authorization turn); this filing only pins scope, order of units, and acceptance.

## Disclosures

- Zero src bytes this filing: the task card + this receipt + the worklog row.
- Standing rotation reminder (THIRTY-FOURTH filing): the GitHub PAT, the Neon API key, both owner DSNs, the Vercel token(s), and the staged w3r3 DSN (in-channel origin) remain pending rotation.
- Agent: Super Z <agent@syllabai.local>

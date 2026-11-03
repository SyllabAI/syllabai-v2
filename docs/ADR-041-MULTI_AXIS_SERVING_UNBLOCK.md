# ADR-041: Multi-Axis Serving Unblock — Version Promotion Through the Corpus's Own Review Surface

- **Status:** PROPOSED — initiated by operator order ("Initiate a project to address the unblocking lever", IM trace `1a1a0ee2b42f4d95`, 2026-11-03). Becomes **ACCEPTED on merge** (house law, ADR-040 precedent); the Stage-1 fire remains **operator-held** regardless of ADR acceptance.
- **Date:** 2026-11-03
- **Related:** `.syllabai/receipts/T-SM-ROLLOUT/od1-live-ma-probe-r0.json` (the probe of record that named this lever) · `docs/ADR-040-LEVELS_OF_RESPONSE_MARKING.md` (the G-lanes that birthed the SUGGESTED versions) · ADR-025 (per-part marking unit) · `assessment/submit.ts` submitStructured step 3 + `assertPaperAllowsServing` (the serving law this ADR unblocks, unchanged) · `apps/api/src/services/content/review-writes.ts` `validateQuestionVersion` (the review surface this ADR rides, unchanged) · vehicle `apps/api/scripts/smart-mark/promote-multi-axis-versions.mts`
- **Supersedes:** none. **Amends:** none — the serving law (VALIDATED-only, fail-closed) and the review law (one transactional UPDATE + one audit row per version) are load-bearing and stay byte-current.

## 1. Context

The OD-1 live multi-axis answer probe (run-001, order trace `1a19f6877e9c76a1`) proved at runtime that **live R4 multi-axis consumption is unreachable through the sanctioned learner surface: 0 of the 147 multi-axis parts can receive an answer**. Cause: all 147 multi-axis parts (≥2 VALIDATED part-bound LEVELS sibling schemes on the NEWEST version of a STRUCTURED active question; 492 VALIDATED axis-suffixed schemes over 101 newest versions) sit on question versions whose `validation_state` is `SUGGESTED` — the ADR-040 G-lanes birthed these questions as single-version SUGGESTED with the LEVELS schemes already VALIDATED, and the VERSION state never walked the review lifecycle. `submitStructured` step 3 fails closed (404) on any non-VALIDATED newest version, exactly as designed.

Levers checked and closed at probe time:

1. `POST /api/v1/auth/bootstrap-admin` → `GET /bootstrap-status {"available":false}` — the window is permanently closed because **an ADMIN already exists** (`adminCount == 1`, DB-proven 2026-11-03); the `adminCount == 0` clause of `claimable()` can never re-open.
2. TEACHER self-registration requires `SYLLABAI_TEACHER_JOIN_CODE` (default `""` → gate CLOSED); the value is not exfiltratable and the gate is closed by default law.
3. A direct DB write is against the operating law: production writes ride product surfaces only.

The probe named the unblock lever: *walk the chosen (or all) question versions through the corpus's own review law — `POST /api/v1/teacher/content/question-versions/:id/validate` (TEACHER/ADMIN, transactional, audit-recorded) — then re-fire the probe unchanged; every other piece (VALIDATED LEVELS siblings, R4 per-axis dispatch, entitlement, DC-3 envelope) is already byte-current on main.*

Re-proven this run (read-only DB, vehicle census drift-reconciled): **147 parts / 492 axes / 101 versions, all versions SUGGESTED; every touched paper is SUGGESTED** — the V20 paper gate (`assertPaperAllowsServing`) blocks only REJECTED/FLAGGED papers, so version promotion alone unblocks serving. Non-paper-bound questions pass the V20 gate by early return; the 147 are all paper-bound to non-blocking papers.

## 2. Decision

Unblock by **promotion through the product surface**, never by direct DB writes, staged with a minimal blast radius first.

### 2.1 The promotion rides the existing review surface — no new endpoints, no migrations

Each chosen question version is validated by exactly the corpus's own review transaction: `POST /api/v1/teacher/content/question-versions/:id/validate` → `validateQuestionVersion` (one `UPDATE question_versions SET validation_state='VALIDATED'` + one `recordAudit(... "VALIDATE", "question_version", id, from, "VALIDATED", "")` row, in one transaction). The endpoint is port-faithful to the frozen Java surface and needs zero code change. Looping the single-version surface 147 times is *preferred* over inventing a batch endpoint: 147 audit rows with per-version actor/timestamp is the review trail the corpus already defines, and no new API surface needs its own ADR.

### 2.2 Staged fire — one version first, the rest only on a separate operator word

- **Stage 1 (the chosen single):** validate `b61de1f1-b6f2-4df9-b899-d62c63aa96d3` (question `2066bee4`, newest version 1; part `09e1b776` "b-ii" 8 marks; 2 VALIDATED LEVELS axes `2-b-ii#a1`/`2-b-ii#a2`, 4 bands each) — the exact probe candidate — then **re-fire the OD-1 probe unchanged**: real learner register/login → `POST /api/v1/attempts/structured` on part `09e1b776` → observe R4 live consumption (per-axis band decisions summed at the part, PR-B #641), `failure_reason=None`, no `MULTI_AXIS_DISPATCH_NOT_WIRED`, and the census flip `answers_on_multi_axis_parts ≥ 1`.
- **Stage 2 (the remaining 100 versions / 146 parts / 490 axes):** only on an explicit operator word, after Stage 1 proves end-to-end. The vehicle refuses `--ids all` by design; scope choice is always an explicit list or the manifest.

### 2.3 The session key is operator-held; the vehicle cannot self-authorize

The vehicle's `--fire` requires a bearer token the lane does not hold (bearer guard exits 2 without one — proven). Ranked key-turn options for the operator:

1. **Hand an existing TEACHER/ADMIN bearer** (26 TEACHER / 1 ADMIN exist in production) for the fire window — zero production change. *Recommended.*
2. **One-time `SYLLABAI_TEACHER_JOIN_CODE` turn** (Vercel env, Production scope): the lane self-registers a dedicated TEACHER through the sanctioned register route, fires, and the code is removed after — both turns receipted.
3. (Not default) Any other lever only on explicit operator instruction that amends this ADR.

### 2.4 The vehicle is the enforcement mechanism

`apps/api/scripts/smart-mark/promote-multi-axis-versions.mts` (house vehicle pattern, T-BOOK-069 precedent):

- `--census` re-computes the multi-axis census **read-only** and fails loudly (exit 1) on drift from the numbers of record (147 parts / 492 axes) — a drifted manifest must never be fired against.
- `--plan` renders the per-version review packet (question, paper + state, parts, axes, marks, the exact effect: one UPDATE + one audit row).
- `--fire` is the **only** write path and it never touches the DB: sequential POSTs to the review surface, stop fail-closed on the first non-2xx, `--dry-run` proven to send nothing, explicit scope required.

### 2.5 This is a review decision, not a bulk flip

VALIDATE is the corpus's own review act. The manifest (`.syllabai/receipts/T-SM-UNBLOCK-1/promotion-manifest-r0.json`) is the review packet of record; the operator (or a teacher the operator designates) reviews it before any fire. Every fire leaves one audit row per version — who, when, SUGGESTED→VALIDATED — queryable through the existing audit surface.

## 3. Consequences

- **Positive:** the sanctioned learner surface can finally reach multi-axis parts; R4 live consumption becomes observable; the MA-10 census gap (`answers_on_multi_axis_parts = 0`) closes through real traffic; zero code, zero migration, zero default env change.
- **Negative / accepted:** 606 SUGGESTED versions corpus-wide stay SUGGESTED except the ones this ADR promotes (the 101 multi-axis-bearing versions, staged; or the Stage-1 single first). The other 505 non-multi-axis SUGGESTED versions remain unreachable by design until their own review — which is the honest posture, not a regression.
- **Neutral:** if the Stage-1 probe still fails after promotion, the probe's 404 law names the next boundary — but code-read says every later gate (V20 paper, parts existence, allocation law) passes for the candidate.

## 4. Gates (before any fire)

1. ADR-041 ACCEPTED (this document merged).
2. Vehicle guards proven of record (usage/connect/bearer exit 2; dry-run zero-HTTP; census drift check OK at 147/492/101) — **done this run, see receipt**.
3. Operator key turn delivered (§2.3 option 1 or 2) — **operator-held**.
4. Re-census immediately pre-fire (drift check) — vehicle built-in.

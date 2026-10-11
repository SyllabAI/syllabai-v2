# Final Decommission Bands Plan — Reaching Zero Core Routing (§6.2 pre-gate)

> **STATUS: PLAN — no band claimed by this filing.** This file plans the work
> that stands between today's dual-run posture and the §6.2 Render disable of
> `docs/CUTOVER_RUNBOOK.md` (disable = not delete; operator lever). It consumes
> the baseline census of record
> `.syllabai/receipts/W7-CUTOVER/zero-core-census-baseline.json`
> (instrument: `scripts/preflight_zero_core_census.py`, run 2026-10-12) and the
> P3 witness disclosure (docs/P3-WITNESS-CLICKPATH.md). Provenance: operator
> order trace `1a12c1607ee86c41`.

## 1. Baseline of record — what still routes to the core, and is it live?

The flip table at main carries **44 exact rows + 4 mid-path rows** (pinned by
`apps/hub/src/lib/api.v2-surface.test.ts`). The stay-core residue, with the
census classification + manual annotations:

| # | Core-routed surface | Census class | Live call-sites of record | Retiring band |
|---|--------------------|--------------|---------------------------|---------------|
| 1 | `GET /api/v1/teacher/marking/answers/:uuid` (detail) + the POST tails `/smart-mark`, `/smart-mark-batch` | LIVE | marking-client.tsx:234 (`markingAnswer`), :289 (`smartMarkBatch`) | B1 (T-MIG-116) |
| 2 | `GET /api/v1/teacher/assignments` | LIVE | assignments-client.tsx:134 (`teacherAssignments`) | B2 (T-MIG-117) |
| 3 | `POST /api/v1/learners/me/answer-input/transcribe` (GLM seam) | LIVE | answer-ink-pad.tsx:194 (`transcribeHandwriting`) | B6 (T-MIG-121) |
| 4 | `GET /api/v1/subjects` | LIVE | class-client.tsx:82; classes/[id]/knowledge-graph/client.tsx:73 | B4 (T-MIG-119) |
| 5 | hub route `POST /api/ai/chat` (SSE) → `coreStreamAuthorized` | HARDWIRE-LIVE | tutor/chat.tsx:320 → route.ts | B3 (T-MIG-118) |
| 6 | questions list/detail/families via the hub **server-proxy** `/api/core/questions` → core | LIVE (annotated — the census's `families(` hint under-counts; the proxy is called from question-cla-overlay.tsx + attempt-bridge.ts) | the CLA overlay + the attempt bridge | B5 (T-MIG-120) |
| 7 | learner exam-papers reads (`/exam-papers?subjectId=`, `/exam-papers/:uuid`) | DORMANT (the `examPapers` emitter, api.ts:1797, has zero page call-sites) | none | B7 ruling |
| 8 | `GET /api/v1/learners/me/intervention-runs` (LLM-bearing, no positive wire) | stay-core LAW pinned in the 096/110 test loops (not in the CORE_ONLY array — census scope note) | none | B7 ruling |
| 9 | `GET /api/v1/tree?includeMisconceptions=true` (the `tree()` emitter) | DORMANT | none | B7 ruling |
| 10 | `/api/v1/teacher/curriculum/versions` (the honest-501 stub subtree) | DORMANT | none | B7 ruling (the 111 stub law forbids a flip whose capture includes a stub — a flip would first need the port band) |

Census instrument notes (disclosed): (a) the extractor strips `//` comments, so
the moved-out `knowledge/nodes/:uuid/tree` pin is not double-counted; (b) the
`smartMarkAttempt` hit in question-player.tsx is the LEARNER-side smart-mark,
which rides the flipped `/api/v1/learners/me/attempts` row — it is NOT a
core-routing leg (the band B1 scope covers the TEACHER marking smart-mark
tails only); (c) GNU-BRE quirk documented — the instrument greps fixed-strings.

## 2. Band table (proposed IDs; cards land on claim per the board law)

Every band follows the standing recipe chain: **fetch-first claim → capture
against the frozen core (live carrier or the proven local 107-law rig) →
verify vs live v2 (the 092 deviation) with an HONEST verdict, FAIL-NO-FLIP →
the narrow rows land at the table tail with the line-test pin → PR → r0-auto
sha-guarded merge → the post-merge redeploy (the 092/093 recipe + LINK/PROJECT
assertions + post-fire wire smoke) → battery + union replay → receipt/worklog**.

| Band | Scope | Capture class | Flip row form | Exit gate |
|------|-------|--------------|---------------|-----------|
| **B1 · T-MIG-116** | The marking `answers/:uuid` SUBTREE in one band: the detail GET + the two POST tails (smart-mark, smart-mark-batch) — the 114 lesson is that a mid-path row over-captures BOTH tails, so all three laws must be golden-verified before the row lands | The 107-law local-rig capture (proven in 113/114); smart-mark is LLM-adjacent → the keyed live-prove class per the cla/ask (097) precedent, or the operator ruling (b) declared class per the 106 precedent if a keyless law is captured | ONE mid-path row `/api/v1/teacher/marking/answers/:uuid` (+ the batch leaf if startsWith does not capture it — the row grammar decides at claim) | 3-subtree verify ALL-GREEN; the marking page rides v2 end-to-end; battery needles 0 |
| **B2 · T-MIG-117** | `teacher/assignments` list read (+ any same-page write emitters found at claim) | two-plane capture, the 092 recipe | leaf row `/api/v1/teacher/assignments` (bare-only path per the 112 roster posture) | assignments page rides v2; no-regression needles 0 |
| **B3 · T-MIG-118** | Re-point the hub `/api/ai/chat` SSE route to the v2 tutor stream (the ask/ask-stream pair is ALREADY flipped declared-justified of record, the 106 ruling) — a hub CODE band, not a table row | SSE contract parity: open/heartbeat/close frames + the refusal law; LLM payloads excluded from golden gating by standing law (the witness is law-level, not payload-level) | no table row (the route hardwire is replaced); the core-proxy SSE seam retires with a surface-test pin | the tutor loop answers through v2; coreStreamAuthorized has zero remaining call-sites; union green |
| **B4 · T-MIG-119** | `subjects` leaf (+ optional `tree` leaf if its positive 200 captures clean in the same band) | two-plane capture; the positive 200 wire (fixture-mapped per the 109 uuid lesson if the body is corpus-dependent) | leaf rows at the table tail; the 035 check-3 law DISCHARGED | both teacher class pages ride v2 for subjects; tree either flipped or explicitly ruled dormant-core |
| **B5 · T-MIG-120** | The `/api/core/questions` server-proxy family: questions list + detail + mark-scheme GET + families — positive wires uncaptured of record (401 shells + the unknown-404 law only) | capture-first (the 109 fixture-mapped class — corpus-dependent bodies need per-case sentinels); then re-point the proxy to v2 or decompose into table rows | proxy re-point + leaf rows as the grammar allows | the CLA overlay + attempt bridge ride v2; the proxy's core URL dependency retires |
| **B6 · T-MIG-121** | `answer-input/transcribe` (the GLM seam, 401-only posture of record) | keyed live-prove (the 097 class) or operator ruling (b) if the capture stays 401-law-only | leaf row | the ink pad rides v2; the GLM seam dependency disclosed of record |
| **B7 · ruling band** | The DORMANT residue (exam-papers learner reads, intervention-runs, tree if not taken in B4, curriculum/versions stub subtree) | none required — zero live call-sites each | operator ruling per item: declared-DORMANT-CORE (accepted strand-in-place, safe because nothing routes there) vs capture+verify+flip | a ruling receipt enumerating each item's disposition; the census list reaches zero LIVE entries with the dormant items disclosed |
| **Z · the census gate** | `preflight_zero_core_census.py` hardened (per-call-site path resolution, the intervention-runs pin folded into the extraction) and converted from report to CI gate the moment the LIVE list hits zero | — | — | zero LIVE entries + a census-soak (2 consecutive scheduled replays + 48h) → **§6.2 Render disable becomes [OPERATOR]-safe** |

## 3. Sequencing and effort order

1. **B1 first** — the marking page is the highest-traffic LIVE core leg and the
   capture rig + message-law corpus are the freshest of record (113/114).
2. **B3 second** — the SSE re-point retires the only remaining stream hardwire
   and is the last band where the 106 declared-justified law carries directly.
3. **B2, B4 next** — small leaf bands, independent, parallelizable across desks.
4. **B5** — the capture-heaviest band (positive wires must be manufactured
   against the core corpus first).
5. **B6 + B7** — the keyed/ruling tail; B7 is paperwork-only if the operator
   rules dormant-strand-in-place.
6. **Z** lands continuously: re-run the census after every band merge; the
   receipt ledger tracks LIVE count 6 → 0.

**Parallelization law**: bands are independent families — but the hub redeploy
serialize (one carrier) and the flip-table exact-set test mean merges queue
through the r0-auto sha-guarded desk; no two bands stage a redeploy
concurrently (the race-guard law).

## 4. What §6.2 needs that bands do not deliver

- The P3 witness + P4 paste (docs/P3-WITNESS-CLICKPATH.md,
  docs/P4-SIGNOFF-PREFILL.md) — operator testimony, the runbook gate letter.
- Issue #147 zombie decommission (`syllabai.vercel.app`, prj_D7vf) — operator.
- §6.1 GitHub archive — operator (eligible of record now).
- PAT rotation + the post-cutover MIGRATION_REPORT.md §-fills — operator, after
  §6.2.
- Data law: both cores read/write the same Neon main (the baseline doctrine) —
  the disable moves NO data; rollback after a disable = re-enable the Render
  service (bounded by the shared-DB architecture, runbook §5).

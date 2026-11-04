# T-MG rollout plan — from landed lanes to learner-visible AI marking (dated 2026-11-04)

**Status**: plan of record for the T-MG rollout tranche (the DC-7 pattern: lands BEFORE the implementation PRs; every lane PR cites this doc). Provenance: external read-only competitive capture of mathsgenie.co.uk's live AI marking (2026-11-04, operator-consented, operator-supplied account — 6-digit code login, two live marks run through their pipeline; request/response captured verbatim) + a first-hand codebase survey of this repo at main `02886329`.

**Headline**: the AI marking ENGINE is already on main — `T-MG-MARK-PARITY-1` landed five of six phases (regions `mark_point_rects`, the `mark_awards` ledger + `mark_working_blocks`, the ink layer `syllabai-ink/1`, the crop-then-mark pipeline `paper-mark/v1` with the 202+poll API, and the feedback panel + paper rollup). What remains is **productization**: the core player's typed answers have no AI mark before submission, the paper surface arms only via `?paperId=` deep-link, region rects cover one seeded paper family, and the live capture surfaced a small contract delta. Six lanes below; ~5–7 runs to learner-visible, corpus-wide; zero engine work.

## 1. Asset inventory (MG's live contract vs main)

| MG capability (live 2026-11-04) | SyllabAI equivalent | Status |
| --- | --- | --- |
| Server-preprocessed regions (`pdfMarking.getRegions`), regionId drives everything | `mark_point_rects` (normalized 0..1) + regions read model | **Shipped** (seed family landed with a validated extraction instrument — Lane B is scale-out) |
| Per-question ink/text, vector persistence + autosave | `syllabai-ink/1`, `InkLayer`, `learner_pdf_drawings` (revision 409 rebase), IndexedDB local mode | **Shipped** (T-MG-INK-1..10) |
| `markQuestionRegion {regionId, imageDataUrl, subjectCode, workingBlocks}` | `POST /api/v1/paper-marks/regions/:regionId/mark` → crop (`produce-crop.ts`, 4 MB law) → vision transcription → doctrine-match vs `mark_points` → once-only award claim | **Shipped** (`paper-mark/v1`) |
| Mark-scheme grounding (`markschemeUsed`, `markPointsAwarded[{code, awarded}]`) | verdict joined back to `mark_points` rows; unknown ref = honest 502 | **Shipped — stronger than MG** (doctrine from DB rows, not pixels) |
| Evidence pointers (`workingBlocks[{ref, shapeIds}]`, per-award `workingRef`) | `mark_working_blocks` + `mark_awards.workingRef` — schema shipped; per-award citation surfacing pending | **Partial — Lane E** |
| Feedback object (`chatMessage`, `pointsScored/NotScored`, `strategiesForImprovement` failure-only, `thoughtProcess`) | honest panel (`RegionMarkLayer.tsx` via `feedbackCopyModel`) | **Shipped**; `attempt` classification missing (Lane E) |
| Per-region score chip + Re-mark button | score chip + "mark again with AI" (`RegionMarkLayer.tsx`) | **Shipped** |
| Paper-level rollup ("Marked 5/11") | `paper-marks-rollup.tsx` Σ via `fetchPaperMarksLedger` | **Shipped** (T-MG-FEEDBACK-1) |
| Typed-answer AI marking in the practice player | core lane marks only AFTER submission (Smart Mark); legacy lane is an honest 501 stub (ADR-029) | **Gap — Lane C** (the regrade channel `POST /parts/:partId/regrade` exists with zero hub callers) |
| Upload flow ("paper marker": paper + mark scheme, consent checkbox, extraction state machine) | nothing; `documentRefType` `"paper_mark_submission"` pre-arranged in the pdf-drawings enum | **Absent — Phase 5, waived by choice; Lane D, operator decision open** |
| Energy economy (1 energy/mark) | no credits concept; provider dailyBudget + rate limits + `mark_entitlements`/`ai_mark_events` | **Deliberately different — Lane F ADR** |
| Synchronous mark call | 202 + poll, in-process non-durable registry | **Shipped; durability disclosed — Lane F ADR** |

## 2. What the 2026-11-04 live capture settles (plan-of-record §1.9 updates)

1. **`workingRef`/`workingBlocks` → OBSERVED** (MG: per-block refs W1/W2 mapped to shape IDs; per-award `workingRef` citations). The evidence-pointer law in the Phase-2 schema was the right model; acceptance case delivered.
2. **MG's crop includes the printed question** (stem + marks footer + writing in one JPEG; the model reads the question from pixels). Ours crops the region only and grounds doctrine in `mark_points` rows — keep ours; add stem TEXT as doctrine-match context (Lane E).
3. **MG has no re-mark caching** (`markedAt` updates per re-mark). Our content-hash caching idea from the parity plan risk #2 stands (Lane E).
4. **`attempt: "full"`** classification exists in their verdict — analytics we lack (Lane E).
5. **Their text renders in a handwriting font** (model calls typed input "handwritten"). Our Shantell Sans choice independently matches — validation, no action.

## 3. The lanes

Branch/PR staging per the tranche discipline: one branch per run (`t-mg-<lane>/run-001`), PR cites this doc, **merges operator-gated** (Gate 5 of the parent plan carries). Records (this doc, cards, ADRs, worklog) land direct.

### Lane C — T-MG-PLAYER-MARK-1: advisory per-part AI marking in the core player (ship first)

Ground truth found during commissioning (amends the draft plan): the legacy-lane 501 stub (`apps/hub/src/app/api/ai/mark/route.ts`) is NOT a trap to delete — it is the honest legacy-lane floor per ADR-029 (SME corpus questions carry corpus IDs that do not map to core parts). The REAL gap: on the core-live lane (`CoreMarkingFlow`, which owns core `question_parts` UUIDs via the bridge join), the learner gets no AI mark until they SUBMIT real attempts. MG's live capture shows the value moment: type → "Mark my answer" → instant AI read, nothing written to the account.

**Scope**: on the core lane's draft phase, an advisory "Mark my draft with AI" affordance that sends each structured part's draft through `POST /api/v1/paper-marks/parts/:partId/regrade {answerHtml}` (partId = the bridge join's corePartId), polls via the existing `pollUntilTerminal`, and renders per-part verdicts through `feedbackCopyModel` (the five-field copy law + failure-only strategies, single-sourced). Label: "advisory — writes no attempt" (the ledger write lands on the paper plane; the attempt plane is untouched; the authoritative Smart Mark flow stays byte-identical). Parts without mark_points get the honest 422 `no_mark_points` surfaced as "no mark scheme definitions for this part yet". The stub stays byte-identical.

**Files**: `apps/hub/src/lib/paper-marks.ts` (+ `requestPartRegrade`, the mirror-law client — no contracts/api/db bytes), `apps/hub/src/app/courses/[course]/exam-questions/[topicSlug]/question-player.tsx` (CoreMarkingFlow draft phase), a bun test beside the lib. **Gate 1: zero diffs on `prompt.ts`, `PROMPT_VERSION`, `packages/contracts/**`.**

**Acceptance**: core-live question + typed draft → per-part advisory verdict (score chip, scored/not-scored lists, failure-only strategies) without any attempt POST; signed-out/unconfigured/network failures render the honest classes; the legacy lane is untouched. Receipt: bun tests + typecheck + CI.

### Lane A — T-MG-SURFACE-1: discoverability beyond the deep-link

Region marking arms only with `?paperId=<uuid>`. Add the learner-facing entry: papers with rect coverage get a "Mark with AI" affordance on the past-papers surface (paper card / viewer toolbar row); uncovered papers show nothing (honest-null). Arming stays in `paper-viewer-client.tsx` — **zero bytes in `pdf-pane.tsx`** (the monolith freeze law). No api/db/contracts bytes. Acceptance: logged-in learner on a covered paper reaches region marking in ≤2 clicks; logged-out sees no entry; screenshot receipt.

### Lane B — T-MG-MP-RECT-2: region-rect coverage at scale (content lane)

Commissioning correction: T-MG-MP-RECT-2 run-001 is ALREADY EXECUTED (2026-10-30, card `.syllabai/tasks/T-MG-MP-RECT-2.yaml` status OPEN with the full execution record) — a deterministic pdfplumber/PyMuPDF extraction instrument exists, with the 76-row manifest of record for the 1MA1-1F Jun 2025 seed family (sha-pinned in test, census-reconciled against the MS, oracle-validated against MG's PUBLIC getRegions payload: 63/64 geometry within 0.03 normalized or containment, zero page mismatches). **The remaining Lane B work is scale-out, not invention**: run the existing instrument across the corpus (2–3 runs), same acceptance law — ≥90% rect precision on a 20-paper validation slice, human-reviewed manifests before seeding (vision proposals only for scanned papers; never auto-seeded), idempotent seed, per-rect provenance. Coverage becomes the data Lane A's affordance reads. Parallel-safe with A/C/E.

### Lane E — T-MG-MARK-DELTA-1: the live-capture contract delta (engine-side, one run)

1. Per-award evidence citation surfaced (verdict points may carry `workingRef`; the honest panel renders "this mark came from your working at W2" when present — schema exists, this is prompt + panel rendering).
2. `attempt` classification (`full` | `partial` | `blank`) on the verdict, stored on `mark_awards` (additive migration).
3. Stem TEXT (from `questions`/`question_parts`) as doctrine-match context; the CROP_TRANSCRIPTION scope rule stays untouched.
4. Crop-hash caching: `{crop bytes, ink-doc revision, mark_points version}` hash on the award; identical re-marks short-circuit; "mark again with AI" forces fresh (MG's re-mark semantics + our cost law).
5. Plan-of-record §1.9 rows → observed (evidence: the 2026-11-04 capture pack).

Files: `apps/api/src/services/paper-marking/{index.ts,prompt.ts}` (new sentences carry the module identity), `packages/contracts/src/paper-marking.ts` (additive optional fields only), one additive migration, the panel. Contracts changes DO touch `packages/contracts/**` — this lane carries its own Gate-1 disclosure (additive-only, no renames).

### Lane D — T-MG-UPLOAD-1: the waived Phase 5 (operator decision gate, then build)

The decision first (parent plan §5 risk 1, still open): is user-upload marking product scope or internal-tooling only? The live capture strengthens the product case (MG's upload flow is a first-class growth surface) but the copyright posture is theirs; legal review precedes any accepted upload. If the word is "build": `paper_mark_submissions` (+ `_pages`) tables (additive), upload (two PDFs or photos, accept `image/*,.heic,.heif,application/pdf`, the 4 MB inline-base64 law holds — no S3), consent checkbox verbatim, subject/paper extraction (glm-ocr bridge + Gemini), auto-region PROPOSALS + human confirm (never auto-seeded), mark-scheme ingestion into `mark_schemes`/`mark_points`, then the existing crop-then-mark pipeline unchanged. Surface: `/pastpapers/paper-marker`. Batch submission explicitly out (fast-follow card). Nothing else depends on D.

### Lane F — two ADRs, recorded not coded

ADR-042 (no energy economy — meter at provider budgets; `mark_entitlements`/`ai_mark_events` are the seam if paid tiers need quota) and ADR-043 (202+poll durability posture — the non-durable registry is disclosed, the honest classes cover restart loss, a pg-backed queue is carded-not-built). Both land with this doc.

## 4. Sequencing

- **Ship order**: C → A → (B lands coverage quietly) → E polish. C and A are small; C first (daily traffic, and it deletes the "no AI mark before submit" gap where learners actually are).
- **Independent**: B and E touch disjoint files from A/C; all four can be in flight together.
- **Total to learner-visible, corpus-wide**: ~5–7 runs; the engine ships in none of them.

## 5. What we deliberately do NOT copy from MG

| MG behavior | Why not |
| --- | --- |
| Energy balance as a product economy | Metering lives at the provider-budget layer; a credits economy is a billing decision (ADR-042). |
| Model reads the question from pixels | Doctrine-match grounds every award in `mark_points` rows with a 502 on unknown refs — harder to hallucinate. Stem text rides as context (Lane E), never as the grounding source. |
| Synchronous marking call | 202 + poll is shipped, honest about failed/timeout/lost, keeps workers free. |
| Raw reasoning verbatim in the client panel | The honest panel (chatMessage, scored/not-scored, strategies) already answers "why did I lose the mark"; `reasoning` stays transcription-anchored server-side. |
| Batch upload + upload-time MS gating for our own corpus | Batch is a fast-follow; our corpus papers carry their mark schemes by ingestion. |

## 6. Risks

1. **Vision is a single provider** (Gemini is the chain's only vision member). Outage stalls crop marking — the honest panel states it. A second vision member is cardable, not planned.
2. **Rect precision on scans** — vision-proposed rects need the human-review manifest gate; never auto-seed (MG's own `confirm` state is the same lesson).
3. **Cost per mark** — one crop per mark (~30 KB JPEG at our law); Lane E's content-hash cache removes the dominant repeat cost; "mark again" keeps fresh-mark semantics.
4. **The monolith** — `pdf-pane.tsx` learns nothing, ever; every affordance mounts beside it.
5. **Copyright (Lane D only)** — consent gate verbatim; legal review is a carding prerequisite.

## 7. Immediate next actions

1. Commission Lanes C/A/B/E + ADRs (THIS commit — cards OPEN, awaiting branch words).
2. Lane C run-001 branches first.
3. Operator rules on Lane D scope — the only genuine open decision.

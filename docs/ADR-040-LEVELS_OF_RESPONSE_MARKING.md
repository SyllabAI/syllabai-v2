# ADR-040: Levels-of-Response (Band-Scheme) Marking in Smart Mark

- **Status:** PROPOSED — scope pre-ruled by operator (**Option A, extend**, trace `1a16ecdab7ae71a9`, recorded of record on PR #352 and #276); ADR drafting ordered (trace `1a16f03396d6da4d`, "draft the ADR yourself"). Becomes **ACCEPTED on merge**; implementation lanes gate on acceptance.
- **Date:** 2026-10-25
- **Related:** #276 §2 Wave 3 (the blocked lane this ADR unblocks) · PR #352 + `registry-gap-audit-r0` (funnel B, the 21 rows of record) · ADR-025 (product contract: per-part marking unit, κ gate F-161) · ADR-037 v0.7 (`mark_points[]` per part, the converter) · ADR-038 + `docs/DATA-PLANE-PLACEMENT.md` (data-plane placement + seam contract — binding) · ADR-009 ($0 LLM chain) · migration `0007_t-sm-kappa-subject` (SUBJECT-scope evaluation infrastructure, reused not rebuilt) · `0011_dc5-mark-point-alternatives` (the additive-migration pattern for marking-adjacent tables) · T-SM-BRIDGE-WIDEN r0 (the exclusions this ADR lifts)
- **Supersedes:** none. **Amends:** issue #276 §4 guardrail 7 ("Band-scheme rows never flip under this rollout") — lifted for band rows only once this ADR's gates (§4) pass; Wave 3 moves from BLOCKED to planned. Issue #276's title scope ("all point-scheme courses") is widened by operator ruling to include band-scheme courses as of `1a16ecdab7ae71a9`.

## 1. Context

Smart Mark was designed, calibrated, and flipped for **point-scheme** questions: a mark scheme decomposes into atomic `mark_points` rows bound to a `question_part_id`, the LLM chain decides each point independently, the score is the sum of awarded points, and agreement with humans is measured as unweighted per-point κ under the F-161 gate (fail-closed, `smart_mark_agreement_evaluations`, threshold 0.60, minimum-packet floors D5).

A material fraction of the registry cannot be decomposed that way. **Levels-of-response (band-scheme)** mark schemes do not award points; they award a **band**:

> *"Level 2 (3–4 marks): Answers use some precise scientific terminology. Answers make linked statements that apply knowledge and understanding... "* — the examiner reads the whole response, selects the level whose descriptor it best matches, then picks a mark **within** the level's range.

Under the current pipeline these parts cannot mark faithfully, which is exactly why issue #276 Wave 3 wrote: *"levels-of-response / band-scheme subjects do not decompose into atomic `mark_points` and would mark unfaithfully under the current pipeline"* — and excluded them via the T-SM-BRIDGE-WIDEN r0 checklist exclusions. The registry-gap audit of record (PR #352) quantified the exclusion as **funnel B: 21 rows, ~7,900+ parts**, and showed the blocker is NOT corpus (most rows already carry 100%-coverage corpora, e.g. 0455×2 = 1,237 parts, 4GE1 = 883, 4BS1 = 612, 9609 = 692). The blocker is a design decision, which the operator has now made: **extend** (Option A).

Two framing facts bound the design:

1. **The marking unit does not move.** ADR-025's per-part law holds: band marking is still decided per `question_part`. What changes is the *decision type* — from N boolean point decisions to one ordinal placement + a within-band mark.
2. **Kind is a property of the scheme/part, not the course.** Real papers are mixed (e.g. 4BS1 paper 1 structured parts + levels-marked extended parts; 0455 structured paper 1/2 + word-essay parts). The model must be per-part dispatchable, and mixed courses must be able to complete when *both* kinds pass their gates.

## 2. Decision

Extend Smart Mark with a **band-aware marking kind** alongside the existing point kind — additive everywhere, zero change to flipped point-scheme behavior, fail-closed on every missing input.

### 2.1 Scheme model (G1 for bands)

- **`mark_schemes.scheme_kind`** — additive column, `varchar(10)`, `'POINTS' | 'LEVELS'`, default `'POINTS'`, CHECK-constrained. Every existing row reads POINTS without a backfill; nothing about today's flipped courses changes.
- **New table `mark_bands`** (the levels analog of `mark_points`, mirroring its ergonomics):
  - `id` uuid PK · `mark_scheme_id` uuid FK→`mark_schemes` ON DELETE CASCADE · `level_index` int ≥ 1 (ordinal, 1 = lowest) · `marks_min` int ≥ 0 · `marks_max` int ≥ `marks_min` · `descriptor_md` text **verbatim-as-printed** · `guidance_md` text nullable ("notes for awarders" / exemplar guidance as printed) · `extraction_confidence` double precision 0–1 · `created_at` timestamptz. Unique `(mark_scheme_id, level_index)`, index on `mark_scheme_id, level_index`.
- **Coverage law (R2 audit extension):** a LEVELS part is G1-ready iff its VALIDATED scheme's bands are contiguous and tile the part's awarded range — i.e. sorted bands satisfy `b[i].marks_max + 1 = b[i+1].marks_min` and `min = 0 or 1`, with the top band reaching `question_parts.marks`. Zero marks is **not** a band: blank/no-rewardable responses are handled by the deterministic rule (§2.3), matching how point schemes treat zero. The R2 SQL gains `parts_with_bands_bound` beside `parts_with_points_bound`.
- **Converter (ADR-037 v0.7) gains a LEVELS extraction mode:** band descriptors verbatim, marks ranges, guidance blobs; ingestion births schemes `SUGGESTED` exactly as the point mode does. R4 SME validation is unchanged in flow; the validation checklist gains three LEVELS checks: descriptors verbatim, ranges contiguous/tiling, level count and ranges consistent with the printed paper total.

### 2.2 Decision semantics (the marking path)

- **Dispatch:** the part's bound scheme's `scheme_kind` selects the marker path. One dispatch, no guessing; a missing or unvalidated scheme refuses exactly as today.
- **The band decision of record:** `level_placement` (which `level_index`) + `awarded_marks` (within the placed band's `[marks_min, marks_max]`) + `descriptor_hits` (which descriptors the response met, with a one-line rationale each). This is the LEVELS analog of a per-point decision bundle.
- **Recording:** `smart_mark_results.breakdown` JSONB carries the pinned shape `band_decision_v1` (same JSONB pattern the point path already uses); `human_marks` gains additive `band_placement` JSONB (same pinned shape, nullable, so teacher packets for band parts record placement + within-band marks). Both write to **main** (learner model per DATA-PLANE-PLACEMENT); no new decision table is invented where the append-only rows of record already exist.
- **Hard range law:** the runtime **must** reject (one deterministic retry, then honest refusal) any model output whose `awarded_marks` falls outside the placed band's range. Silent clamping is forbidden — the honest negative over the quiet wrong mark, same posture as `rootIdForCourseCode`'s deterministic refusal.
- **Refusals:** `SCHEME_NOT_VALIDATED` reused verbatim; **`NO_SCHEME_BANDS`** added as the LEVELS analog of `NO_SCHEME_POINTS`; a kind mismatch between dispatch and bound scheme is an internal guard that refuses loudly (never silently re-routes).
- **Prompt:** part label + question prompt + the level descriptors (+ guidance) + learner answer → placement, within-band marks, descriptor hits. `general_guidance` — already stored, disclosed as unsent in the point path (issue #276 §4.8) — is **sent** in the LEVELS prompt from day one: band descriptors are short enough that the thinness debt does not need to be re-created for the new kind.
- **Blank/empty answer:** deterministic zero — no placement, no LLM call — identical to the point path's deterministic-zero smoke check (R7).

### 2.3 κ methodology (G2 for bands)

Per-point κ is undefined when there are no points. The band methodology of record:

- **Primary metric: quadratic-weighted κ (QWK)** over the ordinal `level_placement`, computed on the same `smart_mark_agreement_evaluations` rows — QWK **is** a kappa and drops into the existing `kappa` column; `observed_agreement` carries unweighted exact-placement agreement. Scope law carries over unchanged: PAPER-scope minimum per R5, SUBJECT-scope rows via the migration-0007 infrastructure (the partial index, CHECKs, and key-exclusivity law all apply untouched).
- **Additive provenance: `smart_mark_agreement_evaluations.metric`** — `varchar(20)`, default `'POINT_UNWEIGHTED'`, `'BAND_QWK'` for band rows (additive; no interaction with the key-exclusivity CHECKs). The flip gate for mixed courses requires green on **every metric kind present** in the course — a mixed course is not done while its band parts are uncalibrated even if its point parts passed long ago.
- **Gate law carried over, not re-tuned:** QWK ≥ 0.60 (F-161), fail-closed, absence of an evaluation = gated. Honest caveat of record: 0.60 was tuned for unweighted point κ; if the first band eval cycle shows it miscalibrated for ordinal placement, re-pinning goes through the same receipted pre-registration discipline (declared, never discovered post-hoc).
- **Minimum-packet floors, band edition (D5-β, pre-registered now):** n_pairs ≥ 25 scored; scored ≥ 50% of the packet; capture ≥ 80%; packet level-span ≥ 2 distinct teacher placements (guards the QWK degenerate-unanimity case); ≥ 10 boundary-straddling pairs (teacher mark within one mark of a band edge — placement error concentrates at boundaries); override + teacher-authorship + disclosure clauses unchanged.
- **Within-band marks:** disclosed, not gated, in cycle 1 (mean absolute error + exact-rate per band), because placement drives the grade-relevant structure; escalation to a gated within-band floor is a receipts-backed follow-up if MAE disappoints.

### 2.4 Data-plane placement (binding law compliance)

- `mark_schemes.scheme_kind` and `mark_bands` are **corpus** — they follow the corpus plane lifecycle exactly as `mark_points` does under `DATA-PLANE-PLACEMENT.md` (T0 main alongside the existing scheme tables until their course group's T1 flip, then migrate with the warehouse fleet; never a reason to grow main's steady-state corpus).
- Band decision writes (`smart_mark_results.breakdown`, `human_marks.band_placement`) are **mark writes = learner model → main**, same as every mark write today.
- Scheme lookup stays **by id** with no cross-project FKs; no vectors, no embeddings, no RAG enter the band path — the band extension adds *decision type*, not retrieval (guardrail §4.2 of #276 holds verbatim).

### 2.5 Registry flips for band rows

Unchanged law, new rows: the two-file flip (`courses.json` row + `validate_cie_bundles.ts` pin advance), operator-signed, R2/R5 numbers per line in the PR body — only now R2 includes `parts_with_bands_bound` and R5 includes the BAND_QWK row. Flips are per course row; mixed rows flip when both kinds are green (a row whose band parts are still uncalibrated stays unflipped — no partial flips). The T-SM-BRIDGE-WIDEN r0 band exclusions are lifted by acceptance of this ADR, not by this document's existence: the checklist exclusion retires when its named replacement (these gates) is live in code.

## 3. What does not change (guardrails re-affirmed)

1. Per-part marking unit (ADR-025) — band decisions are per-part.
2. No RAG/embeddings in the marking path — the band path reads only the scheme rows.
3. Honest refusals verbatim (V34 G-2) — extended, not weakened (`NO_SCHEME_BANDS` joins the family).
4. κ law fail-closed (F-161) — extended to QWK; absence = gated.
5. Append-only results — `smart_mark_results` history preserved; re-submits re-run and append.
6. MCQ stays deterministic — band support touches STRUCTURED marking only.
7. The 29-row flipped set and the 30 of record: zero behavior change (default `scheme_kind='POINTS'`, same prompts, same gate math).
8. The $0 chain (ADR-009): still one call per structured attempt; LEVELS prompts are longer (descriptors are verbose) and that delta is measured at R8 per band, not assumed.

## 4. Alternatives rejected

| Alternative | Why rejected |
|---|---|
| Keep the point-scheme boundary (old Option B) | Rejected by operator scope ruling (Option A, trace `1a16ecdab7ae71a9`); leaves 21 rows + ~7,900 parts permanently unmarkable while their corpora sit ready — an honest boundary, but now a chosen limitation, not a design constraint |
| Decompose band descriptors into pseudo-points ("L2 = two points of 1") | Unfaithful to the instrument: descriptors are holistic and non-exclusive; pseudo-points double-count across levels, fabricate per-point decisions humans never made, and make κ look meaningful while measuring nothing a real examiner does |
| Holistic direct-marks model (predict 0–max without placement) | Loses the ordinal structure that makes calibration possible and the descriptor transparency that makes feedback teachable; placement is what the human examiner does, so it is what agreement must be measured against |
| Rubric-as-retrieval (nearest marked answers) | Violates the no-RAG-in-marking guardrail; imports tutor-plane infra into the marking path; drifts with corpus churn |
| Wait for teacher marks to accumulate organically | Fails the same way point-scope 4CH1 G2 is failing today (57% of marks lack per-point decisions; eval rows fail-closed) — band calibration needs the D5-β packet discipline armed from the start |

## 5. Sequencing

1. **Acceptance** — this ADR merges; the T-SM-BRIDGE-WIDEN r0 band exclusions are marked lifted-pending-gates in the next rollout receipt.
2. **One additive migration** (drizzle, following the `0011_dc5` pattern): `mark_schemes.scheme_kind` + `mark_bands` + `smart_mark_agreement_evaluations.metric` + `human_marks.band_placement` + the `NO_SCHEME_BANDS` refusal constant. Transactional apply law unchanged (backup → pre-flight → apply → post-verify).
3. **Converter LEVELS mode + validator rules** (verbatim/contiguity/tiling) in the corpus lane; schemes birth `SUGGESTED`, R4 SME validation unchanged.
4. **Hub marking dispatch + `band_decision_v1` breakdown + LEVELS prompt** behind the existing eligibility line — band parts refuse honestly until their scheme is VALIDATED even on flipped mixed rows.
5. **Eval lane:** QWK computation, D5-β floors, `metric` discriminator, SUBJECT-scope band evals riding the 0007 infrastructure.
6. **Band waves** through the unchanged R1–R8 runbook with the §2 substitutions; flips two-file; receipts per wave into #276. Corpus-complete rows (0455×2, 4GE1, 4BS1, 9609 — converter+validation only) are the natural first band wave.

## 6. Consequences

- **Positive:** the 21 funnel-B rows (~7,900 parts) become reachable, closing the operator-ruled finish line at 84/94; mixed courses stop carrying permanent honest refusals on essay parts; calibration methodology extends to ordinal instruments without disturbing the point world; the D5-β floors are pre-registered before the first packet exists.
- **Costs:** one additive migration; a converter mode; a prompt rework; QWK + floors implementation; teacher packets for bands (G2 remains teacher-queue-dependent — the ADR unblocks the design, not the human calibration); slightly longer prompts against $0-tier budgets.
- **Honest residuals:** the 0.60 threshold is carried over, not tuned; within-band marks are disclosed-not-gated in cycle 1; coursework-style rows (e.g. the 4EA1 paper 3 coursework row) stay out of scope until they surface as servable exam parts (see OQ-1); QWK degeneracy is guarded by floors, but boundary-heavy papers may still need more packet volume than point papers did.

## 7. Open operator questions

- **OQ-1 — coursework rows:** `igcse-english-language-a-16-paper-3-coursework` is a coursework surface, not an exam-servable paper. Recommendation of record: it stays outside band scope (and outside flips) unless/until it surfaces as servable parts; confirm or overrule.
- **OQ-2 — first band wave order:** corpus-complete rows first (converter + validation + calibration), or English-first (the most band-native subjects, but likely the thinnest calibration packets)? Recommendation of record: corpus-complete first — it exercises the full gate chain on rows already past G1, before the packet-hungry subjects.

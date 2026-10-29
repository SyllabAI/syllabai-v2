# F-183 — Instant MS-Reveal Law in Drill Mode — Build Plan (preregistration of record)

> Lane: F-183 build (operator word "Proceed: F-183 (MS-reveal law)", IM trace `1a165913bfff6c0d`,
> 2026-10-23). Product spec: Kognity Competitive Research Dossier v1.1, **Deep Dive D §8.4–8.5**
> (the two loudest verified Kognity complaints: shallow explanations on wrong answers, and
> exact-answer marking without method credit); tracker row **F-183** (repo syllabai-v2, deps
> F-182 / F-047 / F-144, Backend + Integration, Frontend Impl = Yes). Committed WITH the
> implementation per the #216/#225/#229/#232/DC-4/F182 pattern. Foundation of record:
> docs/F182-DRILL-SURFACE-PLAN.md + docs/F182-DRILL-BUILD-PLAN.md — the drill surface, its
> policies P1..P6 and the zero-stakes law are the law this PR executes; nothing here
> re-adjudicates them. Positioning line of record (tracker Agent Notes): **the solutions are
> the examiner's.**

## 1. What this PR adds (the F-182 build's disclosed successor, verbatim scope)

The F-182 build rode the reveal CONTENT on the evidence ack (`solutionMd`) and explicitly
disclosed: "the LAW is F-183's title." This PR lands that law — the drill reveal upgrades from
the bundled solution prose to **the real mark scheme of record** (the examiner's own M1..Mn
points, verbatim) **plus the Smart Mark method-credit verdict on structured parts**, under a
gating law that is instant in drill mode and untouched everywhere else.

**What does NOT open here**: the decay strength surface (F-184, ADR-031 computed-never-persisted),
the model-driven draw (F-185 — also the live-generator quality lane), battles (F-186), and any
change to the non-drill reveal surfaces (the MarkSchemeReveal VALIDATED_ONLY/INCLUDE_SUGGESTED
gating stays byte-identical — zero diff on services/questions/reveal.ts).

## 2. The law (L1..L6 — pinned by apps/api/test/drill/reveal-law.test.ts)

| # | Law | Mechanism of record |
|---|---|---|
| L1 | **INSTANT** — the reveal rides the evidence ack, the SAME response that records the attempt | serve.ts computes the reveal only AFTER `store.recordEvidence` commits the immutable row; no second gated fetch exists on the surface |
| L2 | **NEVER TEACHER-GATED** — drill MS of record is the SERVED corpus, not the AI-extracted plane | the bank reads the bundle's per-part `markPoints` + `answerStatus`; the drill never queries `mark_schemes`; `drillMarkSchemeViewSchema` has NO validationState field, so the gated plane's semantics (VALIDATED_ONLY / REJECTED / FLAGGED) cannot reach the ack |
| L3 | **VERBATIM** — points render exactly as the examiner wrote them | ref = corpus point id, textMd byte-for-byte, corpus order preserved; `marksTotal` derived as sum-of-points and the bank FAIL-CLOSES unless it equals the part's marks |
| L4 | **METHOD CREDIT** — structured drill parts get the Smart Mark verdict | the ADR-025 Decision vocabulary adapted: per-point `methodCredited` boolean + rationale computed AGAINST the MS of record; EPHEMERAL ack content (the FeedbackLlm posture — persisted nowhere); MCQ parts never carry one |
| L5 | **BOUNDARIES** — instant in drill, gated elsewhere, no leakage either direction | zero diff on services/questions/reveal.ts; the draw response schema carries no reveal fields (pinned on the wire); no drill MS enters any other surface (the bank is drill-private) |
| L6 | **HONEST NULL** — absence degrades visibly, never paraphrases | no linked MS of record → `markScheme: null` with the solution prose still riding; dormant/absent/invalid generator → `methodCredit: null`; both nulls feed the validation metric |

## 3. The corpus substrate (measured on the real bundle of record)

The wave-20 solution-enrichment wave carries the MS of record on the bundle: per-part
`markPoints: {id, marks, textMd}[]` with `answerStatus: "linked"`. Measured over
`apps/hub/content/igcse-chemistry-19/questions.json`:

| Population | Parts | Linked MS of record | Share |
|---|---|---|---|
| Eligible (spec-anchored, the bank) | 3928 | **2537** | 64.6% |
| Drillable-pool (anchored to a drillable address, the offered surface) | 3924 | **2535** | 64.6% |
| — structured (text-response) drillable-pool parts | 3557 | 2394 | 67.3% |
| — MCQ drillable-pool parts | 367 | 141 | — |

**The examiner's arithmetic holds corpus-wide**: point marks sum to the part's marks on ALL
2537 linked parts (0 mismatches — pinned in bank.test.ts as a full-corpus loop, and enforced
fail-closed in the bank at load: a disagreeing bundle refuses to serve). The 1391 unlinked
eligible parts ALL carry solution prose — the L6 degradation lane is fully populated.

## 4. The wire (packages/contracts/src/drill.ts — F-183-SPEC-NATIVE, DC-7 posture)

`drillEvidenceResponseSchema` gains exactly two nullable fields (required keys, stable shape):

- `markScheme: { source: "corpus-of-record", answerStatus, points: {ref, textMd, marks}[], marksTotal } | null`
- `methodCredit: { engine: "smart-mark", pipelineVersion, allocations: {ref, methodCredited, rationale}[], creditsTotal } | null`

Everything else on the drill wire is untouched: the draw response still carries NO answer facts
and now additionally carries no MS fields (schema-level + on-the-wire pins).

## 5. The seams (bank port + generator port + the ONE chain)

- **Bank port** (`services/drill/bank.ts`): `markSchemeOf(partId): DrillBankMarkScheme | null` —
  the corpus MS verbatim, built in the same single pass as the content maps, fail-closed
  arithmetic (§3).
- **Generator port** (`services/drill/reveal.ts`): `DrillMethodCreditGenerator` — the
  MarkingCandidateGenerator posture (injected, lifecycle-gated, propose-only). Every allocation
  is re-validated against the MS of record before the ack (the validator-trio law adapted: no
  invented refs, no duplicates, rationale required); ANY violation degrades to the honest null.
- **Chain bridge** (`services/llmchain/bridges.ts`): `chainAsDrillMethodCreditGenerator` — the
  house pattern at drill scale (one structured part per call; temperature 0.1; reasoningEffort
  LOW; budget 300 + 150/point capped 2000; truncation refuses; strict-JSON allocations). Dormant
  by default: zero-key boots (and SYLLABAI_LLM_MODE=test) register every member dormant, the
  bridge's `available()` delegates to the chain, and the ack degrades to L6 — the honest-503
  posture of record, byte-identical in spirit to the pre-adapter surfaces.
- **App root** (`apps/api/src/index.ts`): the drill composition moves one line down to ride THE
  ONE LLM CHAIN OF RECORD — `buildDrillRouters(env, { methodCreditGenerator:
  chainAsDrillMethodCreditGenerator(llmChain) })`. No second chain, no new keys, no new spend
  surface without the chain being up.

## 6. The hub player (Frontend Impl = Yes)

The reveal panel renders the MS of record above the solution prose: one row per point — the
M-label (`MP1..` derived for display only; the wire ref stays the corpus id), the examiner's
text via the markdown renderer, the point's marks, and — when the verdict exists — the per-point
method-credit chip (`method credited` / `no method credit`) plus the credits summary line with
the pipeline version. Unlinked parts render exactly what F-182 rendered (the prose solution) —
the honest degradation, visible.

## 7. Validation metric of record (tracker F-183)

"% drill reveals showing full M-point MS" — **64.6% baseline of record** (2535/3924 offered
parts; the ratio is a corpus property, pinned by bank.test.ts, and moves only when content
lands — never at runtime). "Method-credit agreement on structured drill parts" — the ack now
carries the verdict (per-point + creditsTotal + pipelineVersion); agreement measurement is the
F-185 model-driven-draw lane's title, consuming these acks.

## 8. Battery of record (all green on this branch, pre-push)

- `bun run typecheck` (contracts/shared/db/api): 0 errors; hub `tsc --noEmit`: 0
- `bun test apps/api packages`: **2700 pass / 13 skip / 0 fail** (144 files) — 61 new pins over
  the F-182 receipt's 2639 (contracts drill 3, reveal-law battery 18 incl. the wire block,
  real-bundle MS 4, routes.test.ts untouched-but-green, opening's draw pins untouched)
- golden `--selftest` OK; `build:hub` ✓ (Compiled successfully)
- census anti-drift pin holds (draw.test.ts green: census-of-record.json regenerates
  byte-identically — this PR touches no census surface)
- lint on every touched hub file: 0 problems (4 pre-existing problems on main are disclosed and
  untouched: deck-player.tsx unused-disable warning; toolkit-client.tsx two set-state-in-effect
  errors; exports.tsx unused-disable warning)

## 9. Non-goals & residuals (disclosed)

- The 1389 drillable-pool parts without a linked MS of record reveal prose-only (L6) — content
  is the content lanes' title; the metric makes the gap visible, the law refuses to paper over it.
- The method-credit verdict is one-shot synchronous on the evidence ack (one structured part ≤
  2000 tokens); no queue, no retry — a refusal degrades to the null verdict and the drill
  remains fully usable. Async/queued verdicts are the F-185 lane's concern.
- The generator's zero-shot prompt quality is deliberately unclaimed here: no agreement number
  is asserted for the live model in this PR (the metric infrastructure is what lands); F-185
  owns model-driven quality.
- Per-point method credit is boolean (the ADR-025 verdict vocabulary); partial method marks are
  the marking lanes' concern, not the drill's.

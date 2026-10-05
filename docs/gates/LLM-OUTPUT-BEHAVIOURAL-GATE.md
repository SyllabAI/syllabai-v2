# LLM-OUTPUT Behavioural Gate Doctrine

| | |
|---|---|
| **Status** | Draft — filed under T-MIG-039 for review; feeds T-MIG-034 (LLM-chain lane) |
| **Conformance target** | GOLDEN_MASTER §3 (LLM-dependent outputs are NEVER golden-gated) · MIGRATION_PLAN risk R-LLM · §5 Wave 6 |
| **Seams covered** | smart-mark feedback prose (`FeedbackLlm`) · transcription (unlanded — stub contract) |
| **Companion ADR** | `docs/adr/ADR-MIG-0001-llm-seam-strategy.md` |
| **Harness** | `golden/llm-shadow/` (self-contained, selftest-green) |
| **Real seam grounding** | `apps/api/src/services/smartmark/index.ts` :414-419, :883-893; `apps/api/src/routes/smartmark/index.ts` :53-76 |

---

## 1. Problem Statement

GOLDEN_MASTER §3 excludes LLM-dependent outputs from the golden gate:
tutor text, CLA, intervention prose — and, in the W3 seams this card gates,
the **smart-mark feedback prose** (feedback-explanation, improvement-plan)
and the upcoming **transcription** surface. These outputs are
nondeterministic, so the two classic gate designs both fail:

1. **Byte-exact goldens** produce false reds on behaviourally equivalent
   output (sampling variance, provider-side nondeterminism, prompt drift).
   Teams respond by mechanically re-recording, which trains everyone to read
   the gate as noise.
2. **Fuzzy "close enough" matching** produces false greens: invented
   grounding references, altered numeric/factual tokens, scheme-text leaks
   and dropped transcript segments pass silently.

The migration plan already names the destination (risk R-LLM: "refusal
honesty, citation plumbing (grounded citations resolve to the same chunks),
format contracts via zod" and Wave 6 §5: "behavioural gates + recorded-shadow
comparisons"). This doctrine supplies the missing *mechanics*: a tolerance
taxonomy, a comparison pipeline, a fixture lifecycle, and CI gate semantics
that make those three named dimensions checkable — deterministically, in CI,
with no model invocation.

## 2. Scope and Non-Goals

**In scope.** Behavioural gating of the two LLM prose seams at the seam
boundary — we gate the *artifact* the system consumes, not the model, the
prompt, or the provider. The doctrine defines: fixture anatomy, the two
postures, canonicalization, tolerance classes (§4), the comparison pipeline
(§5), CI semantics (§6), and the fixture lifecycle (§7). The harness in
`golden/llm-shadow/` implements all of it as a skeleton with a selftest.

**Non-goals.** Prompt quality evaluation; model selection; live-cost
optimization; any edit to `apps/api/**` or `packages/**` (the seam *code* is
T-MIG-034's surface — this card feeds it and deliberately does not touch it);
edits to `golden/runner.ts` or `golden/cases/**` (the deterministic
forever-gate stays byte-identical; harness registration there is 034's
integration decision).

## 3. The Three §3 Dimensions, Operationalized

GOLDEN_MASTER §3 prescribes exactly what LLM surfaces get gated on. Each
dimension maps onto the machinery of §4–§5:

| §3 dimension | What it means at the seam | Gate mechanism |
|---|---|---|
| **Honesty of refusals** | When the engine cannot ground or serve, it refuses — never fabricates. Today's law: `available() = false` → `SmartFeedbackGenerationError` → 503 `smart_feedback_unavailable` with the FIXED body (route :70-76); empty response refused (:889-891); explain/improve 409 when no accepted result exists | Deterministic service law — pinned as T0 contract vectors in the harness (`lib/seam-config.ts` carries the verbatim strings with source cites) and exercised end-to-end in LIVE posture: insufficient-grounding input must produce the honest refusal, never prose |
| **Citation plumbing** | "grounded citations resolve to the same grounding chunks" — prose must reference the same per-point decisions the service loaded (`loadFeedbackSource`), never invent or swap them | **Grounding anchors** (§4.1): normalized keyphrases of each grounding chunk, recorded in the fixture at capture time; replay requires every baseline anchor to resolve in the candidate, and forbids candidate references outside the grounding set |
| **Format contracts via zod** | The consumed envelope shapes: `FeedbackExplanationView { partId, explanation, modelId, generatedAt }`, `ImprovementPlanView { partId, plan, modelId, generatedAt }`; transcript envelope when answerinput lands | **T1 structural checks** (§4): envelope field names + required keys, verified verbatim (the canonical-schema pin discipline that caught 032's `marks → marksPossible` correction) |

Everything else in the artifact is prose text — that is where the tolerance
taxonomy below applies.

## 4. Tolerance Classes

All comparison verdicts are expressed in four classes. A seam declares, per
field/segment, which class applies; the declaration lives in
`golden/llm-shadow/lib/seam-config.ts` and is reviewed — it is the contract
that keeps the gate legible.

| Class | Name | Applies to | Rule |
|---|---|---|---|
| **T0** | EXACT | ids, counts, model ids, view enums, refusal contract strings, numeric/factual tokens | equality after canonicalization |
| **T1** | STRUCTURAL | envelope shapes (§3 zod row), transcript segment ordering | field names verbatim; required keys present; ordering constraints hold |
| **T2** | SEMANTIC-PRESERVING | the prose itself (explanation, plan, transcript text) | variance permitted iff grounding anchors all resolve, no numeric/factual drift, no leak vector fires, and divergence stays bounded (§4.2) |
| **T3** | FORBIDDEN-DRIFT | whole artifact | any of: lost/unresolvable grounding anchor, invented grounding reference, changed numeric/factual token, **scheme-text leak** (verbatim scheme rubric lines surfacing in prose — the pointLabel law, :897-904), answer-writing in the improvement plan where deterministically detectable, fabricated transcript content → hard fail |

T3 is deliberately conservative: at gate level, an ungrounded rewrite is
indistinguishable from hallucination, so it fails. The escape hatch is the
LIVE posture re-record path (§7), never threshold-widening inside a failing
PR.

### 4.1 Grounding anchors

At capture time (LIVE posture, §7), the harness records `anchors: string[]` —
a deterministic, normalized keyphrase per grounding chunk (per-point decision
labels, referenced facts). Replay requires each baseline anchor to **resolve**
in the candidate (content-token containment after canonicalization — the
same chunk is recognizable, however reworded), and records any candidate
content-token cluster that looks like a reference but resolves to nothing
(reported, and hard-failed when it matches a `forbidden` leak vector).
Anchor extraction is deterministic and stored IN the fixture, so CI never
runs a model to compute or check anchors (GOLDEN_MASTER §5's spirit: the
diff engine itself must be deterministic and selftested).

### 4.2 Bounded divergence

T2 similarity = asymmetric coverage: the fraction of baseline content tokens
(anchor-relevant spans weighted in) that the candidate preserves. Starting
thresholds: **0.90** for feedback prose, **0.90** for transcript text, plus a
coarse expansion bound (candidate length ≤ 1.5 × baseline). Thresholds may
only be relaxed by a reviewed commit citing a LIVE-posture drift report that
demonstrates false positives at the stricter value — the same
"declared relaxation, never silent" discipline as the runner's
`tolerate`/`unordered` rules (GOLDEN_MASTER §5).

## 5. Comparison Pipeline

```
recorded fixture ─┐
                  ├─ canonicalize (NFKC, line endings, whitespace collapse,
                  │  numeric tokens extracted BEFORE collapsing)
                  ├─ segment (envelope fields / prose / refusal vectors)
                  ├─ per-field classify (declared class per seam config)
                  ├─ anchor resolution (citation plumbing) + leak vectors
                  ▼
        aggregate: worst-class-wins; T3 / invariant = immediate hard fail
                  ▼
        verdict: PASS | FAIL        (+ diff report artifact on FAIL)
```

- **Canonicalization** (§4 of the doctrine is the runner's tolerance law
  applied to prose): Unicode NFKC; line endings unified; whitespace collapsed
  *after* numeric extraction; numeric tokens normalized (`1,000` ≡ `1000` —
  formatting variance must not mask a value change, and a value change must
  not hide behind formatting).
- **Verdicts.** PASS — all fields within declared classes. FAIL — any T0/T1
  mismatch, any T3 hit, any invariant violation, or T2 beyond bounds. There
  is no automatic third verdict: a stale *baseline* (LIVE certified the new
  output class, fixtures not yet re-recorded) is dispositioned by R0 or the
  seam owner as a re-record task with a reviewed commit — never an automatic
  pass, and never a silent widening.
- **Diff report.** Emitted on every FAIL as a JSON artifact (per-field
  classes, anchor resolution table, scores). A gate whose failure mode is a
  bare red X is a gate people route around.

## 6. Postures and CI Semantics

| Posture | Model in loop? | Runs | Verifies |
|---|---|---|---|
| **RECORDED** (default, CI) | No | every PR (CI lane), via the harness `bun test` + selftest | envelope shapes; refusal contract vectors; replay determinism; comparator behaviour on fixture pairs; seam-adjacent transformation changes against recorded shadows |
| **LIVE** (rig) | Yes | manual / pre-exit rituals; the W3 EXIT replay (40/40) and Wave-6's supervised dual-run are LIVE rituals | real seam behaviour over the full surface set; produces new recorded shadows + drift reports |

Hard rules:

1. **No model invocation in CI. Ever.** Not for comparison, not for anchor
   extraction, not for "a quick check". RECORDED is deterministic, hermetic,
   cost-bounded — and therefore flake-free.
2. **`--selftest` stays green** (GOLDEN_MASTER §5): the harness ships a
   fixed-vector selftest of the comparator itself. A parity gate with a
   broken comparator generates false confidence — the selftest is the
   anti-tautology device.
3. **A RECORDED failure is never retried blindly.** There is no flake —
   there is no model. If a failure looks model-shaped, the correct move is a
   LIVE run: stale baseline (→ re-record path) or real regression (→ fix).

## 7. Fixture Lifecycle

A **shadow fixture** (`llm-shadow/v1`) is one recorded seam artifact plus the
metadata needed to compare and audit it:

```jsonc
{
  "schema": "llm-shadow/v1",
  "seam": "smart-mark-prose",            // | "transcription"
  "view": "feedback-explanation",        // envelope kind (prose seam)
  "surface": "<surface-id>",
  "case": "<case-id>",
  "recordedAt": "<ISO-8601>",
  "provenance": {                        // audit-only, NEVER compared
    "modelId": "...", "promptHash": "sha256(...)",
    "sampling": { "temperature": 0.2 }, "posture": "LIVE"
  },
  "artifact": { /* the consumed artifact — envelope + prose text */ },
  "anchors": ["..."],                    // grounding chunks, §4.1
  "forbidden": ["..."]                   // leak vectors, §4 T3
}
```

- **Capture** happens only in LIVE posture on the rig (or the CI-side Neon
  replay runner once it lands — the register item that is currently the only
  live-replay instrument). Recorded prose is reviewed **by a human** before
  it becomes law; mechanical bulk re-recording is forbidden — it turns the
  golden master into a tautology.
- **Scrub discipline** (GOLDEN_MASTER §2) applies verbatim: deterministic
  masking of emails/names/tokens, stable fake ids. The committed skeleton
  fixtures are synthetic mark-scheme-domain data precisely so nothing real
  leaks before the first LIVE capture.
- **Rotation**: a deliberate prompt/model change ships either updated
  fixtures from a LIVE session or an explicit R0-dispositioned re-record
  task. `provenance.modelId` + `promptHash` make stale-model shadows
  auditable. Superseded versions stay in git history with the drift report
  that justified the rotation.
- **Zero prod contact**: recording adds no write paths to prod or Neon;
  fixtures are text artifacts.

## 8. The Two Seams

### 8.1 smart-mark prose (`FeedbackLlm`)

The real seam (services/smartmark :414-419): `available(): boolean` +
`generate(systemPrompt, userPrompt, temperature): Promise<string>`, prose
**ephemeral, never persisted**, served through two envelopes —
feedback-explanation (grounded walk-through of recorded per-point decisions;
"the LLM explains decisions, it never makes them") and improvement-plan
("coach — never answer-writing, never scheme dumps"). Refusal law: the
`SmartFeedbackGenerationError` path and the 503 fixed body (already pinned by
032's route tests — the harness cites, it does not re-pin). The harness's
`ShadowFeedbackLlm` (capture/replay proxy) implements exactly this contract
shape, so T-MIG-034 can install it at the existing
`buildSmartMarkRouters(env, seams)` injection point with zero core edits
(ADR-MIG-0001, Option A).

### 8.2 transcription (stub — seam unlanded)

The transcription DTOs are deliberately not ported yet (contracts/
assessment.ts :38-40 — the answerinput package belongs to its owning wave).
The harness therefore ships the transcription gate as a **stub**: seam
contract documented (normalize-audio → `TranscriptArtifact { segments[] }`),
fixture anatomy + comparator machinery live and selftested, wired to nothing.
The owning wave inherits a working gate: record shadows at its first LIVE
session, flip the seam config, done. Assumption recorded: segment-level
T0 (index/timing/speaker) + T2 (text) — revisit against the real DTO when it
lands.

## 9. Open Items for T-MIG-034

1. Install `ShadowFeedbackLlm` (replay mode) as the CI default at the
   `seams.llm` injection point; capture mode is rig-only.
2. First LIVE capture session: real shadows replace the synthetic fixtures;
   anchors recorded from actual `loadFeedbackSource` chunks.
3. Runner registration: decide whether the shadow gates join
   `golden/runner.ts --selftest` (§5 keeps that lane always-green) or stay a
   separate `bun test golden/llm-shadow` CI lane. This card deliberately
   does not touch runner.ts.
4. MarkingCandidate structure gates (the generator seam): the structured
   candidate artifact (marks_awarded, validation_passed, breakdown) wants
   T0/T1 machinery this harness already provides — extend, don't fork.
5. Threshold ratification: §4.2 starting values get confirmed or adjusted
   against the first LIVE drift report.

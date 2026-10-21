# DC-2 v14 — the two-tier disclosure law, spec-recovered (supersession of the authored v13 anchor)

- **Date of record**: 2026-10-22
- **Operator word**: "Supersede v13" (IM trace `1a15fcac1eba9fed`, 2026-10-22)
- **Queue**: DC-2 follow-through — the supersession clause of record from PR #262: *"A future spec recovery supersedes via a dated new prereg, never by silent edit."*
- **Recovery event of record**: lane worklog `DC2-SPEC-RECOVERED` (operator pointer trace `1a15fc6b2e4264e5`)
- **Lane discipline**: additive-only · `cla/ask` route byte-frozen (T-MIG-069/097) · merge operator-gated

## 1. What this supersedes, and why

PR #262 (merged as `6b5e0cc`, 2026-10-21) shipped the DC-2 two-tier disclosure law with an **authored** law text, because the law's carrier of record — `SyllabAI-SmartChat-Mark-Design-Spec.docx` — was lost to sandbox resets at implementation time. The authored anchor was disclosed as such in #262's provenance section, with the recovery clause quoted above.

The spec has now been **recovered byte-exact** from the operator's pointer (`github.com/nawaf-al-hussain/FileUpload` → `SME-Research/`), preserved with SHA256SUMS (spec sha256 `0da8044a0667a47c684d4b0486784be02bc4992546eca2ec2946043e9e2b287a`), and its §3.2 states the DC-2 law of record. The recovered spec's DC-1..DC-7 definitions match the lane's of-record mapping one-for-one, so the recovery is authenticated against the census, not just plausible.

What the spec's law has that the authored anchor did not:

| Spec §3.2 (of record) | Authored v13 (#262) | Delta |
|---|---|---|
| A two-tier **state machine computed in the pipeline**, not model judgement | A provenance-based Rules-list bullet | The tier is a per-ask computed signal, not left to the model |
| Tier 1 (hint level): all pre-attempt assistance + all post-attempt inline tabs | Provenance floor only (own vs official) | Tier-conditional boundary |
| Tier 2 (explicit): **only** a post-attempt chat turn on a marked part, or an explicit reveal affordance | Absent | The tier-2 trigger is now explicit |
| Tier-1 MUST NOT: state an un-awarded marking point, its alternatives, or completing values | Partial (never invent/estimate) | The spec's MUST-NOT is now of record |
| `prepare()` computes the tier from (part marked?, surface, deliberate act flag); inline tab generators consume the same tier flag | Absent | Tier mechanics + the one-law-many-consumers rule |

## 2. The law text of record (spec §3.2, Decision paragraph, verbatim)

> Disclosure is a two-tier state machine computed in the pipeline, not left to model judgement: tier 1 (hint level) applies to all pre-attempt assistance and all post-attempt inline tabs; tier 2 (explicit) applies only to a post-attempt chat turn on a marked part, or an explicit reveal affordance. Tier 1 may name the skill, the command word, the technique and the shape of a good answer; it MUST NOT state an un-awarded marking point, its acceptable alternatives, or values that would complete it.

And the observed behaviour it governs (§3.2 Observed, verbatim):

> Explicit disclosure — naming the missed point with acceptable alternatives and numeric values — appeared only behind a deliberate conversational act in the chat.

## 3. Prompt-bullet composition (honest provenance, span by span)

The spec's Decision is prose describing a design decision; the system prompt needs an imperative rule addressed to the model ("the same imperative register as the QUIZ SCAFFOLD serving rule", spec §3.2 Mechanics). The bullet's spans, by provenance:

| Span in the new v14 bullet | Provenance |
|---|---|
| "tier 1 (hint level) applies to all pre-attempt assistance and all post-attempt inline tabs; tier 2 (explicit) applies only to a post-attempt chat turn on a marked part, or an explicit reveal affordance" | **Spec-verbatim** (§3.2 Decision) |
| "The user message carries a DISCLOSURE TIER 2 block exactly when tier 2 is live" | Register adaptation — names the actual pipeline signal the model sees (the spec's "computed in the pipeline") |
| "you may name the skill, the command word, the technique and the shape of a good answer" | **Spec-verbatim** (§3.2, second person) |
| "you MUST NOT state an un-awarded marking point, its acceptable alternatives, or values that would complete it" | **Spec-verbatim** (§3.2, second person) |
| "you may name the missed marking point with its acceptable alternatives and numeric values as the mark scheme in the SOURCES gives them, labelled as mark-scheme content" | Spec §3.2 Observed ("naming the missed point with acceptable alternatives and numeric values") + the labelling carry-forward |
| "Mark values, mark-split descriptors and examiner notes are never invented or estimated: state them only when the SOURCES carry them, and never present your own worked answer as the official mark scheme" | **Carry-forward** from the authored v13 anchor — the provenance floor, which the spec's law presumes (tier 2 reads "as the mark scheme … gives them") and which guards the always-on honesty family the spec's tiers do not address |
| "A QUIZ SCAFFOLD keeps its own rule: answers stay hidden until each question is attempted." | **Byte-verbatim carry-forward** from v13 (the spec states the v13 law rides "in the same imperative register as the QUIZ SCAFFOLD serving rule" — the carve-out keeps the scaffold's answer-hiding supreme) |

The authored anchor's service period: 2026-10-21 (PR #262 merge) → this supersession. It is not edited silently: this prereg is the dated supersession instrument, and the v14 history entry in `prompt.ts` records the recovery provenance (spec sha256 prefix, operator trace, this prereg's path).

## 4. Mechanics — where the tier comes from (code of record, no new substrate)

### 4.1 The tier predicate is the leakage policy of record

The CLA surface already carries the frozen deterministic answer-leakage gate (T-MIG-067 tranche-1a, `apps/api/src/services/cla/leakage-policy.ts`, ported line-against-line from `ClaLeakagePolicy.java`, CLA contract §7.2/§7.3/§7.4):

- `schemePointEvidenceAllowed(context, mode)` = question context AND `attempted === true` AND mode ≠ `"HINT"` — the scheme's own points may ground the ask **post-attempt only, never on HINT**.
- `checkModeAdmission`: CHECK pre-attempt throws 409 before retrieval or generation.
- Mark-scheme document chunks never enter question contexts (page-level binding cannot be deterministic).

The spec's tier-2 trigger — "a post-attempt chat turn on a marked part" minus the scaffolding-only surface — is **exactly this predicate**. Therefore the v14 tier flag is *defined by* the of-record predicate, not a second implementation of it:

```
disclosureTier = schemePointEvidenceAllowed(context, mode) ? 2 : 1
```

This makes the spec's acceptance (b) — "the tab generator and the tutor, given the same marked part, agree on what tier they are in" — true **by construction** on this surface: the evidence gate and the prompt tier are one predicate with two consumers, which is precisely the spec's Mechanics clause ("so that tabs and tutor share one law rather than two divergent prompt edits"). v2 has no inline tab generators yet; this PR leaves that clause as the law the future tab surfaces must satisfy (the same review-gate posture as DC-6's surface-parity rule), and the shared-predicate pattern is the prescribed implementation.

### 4.2 Surfaces, honestly scoped

| Surface | Tier behaviour of record in this PR | Why |
|---|---|---|
| CLA question contexts (`PAST_PAPER_QUESTION`, `QUESTION_PART`), post-attempt, mode ≠ HINT | **Tier 2** — the DISCLOSURE TIER 2 block renders | The §7.3 attempt-state read (frozen substrate) already resolves `attempted`; zero new DB reads |
| CLA HINT mode (any attempt state) | Tier 1, no block | §7.2: scaffolding only — never scheme points |
| CLA pre-attempt question contexts | Tier 1, no block | Spec tier 1: all pre-attempt assistance |
| CLA topic-anchored kinds (`KG_TOPIC`, `SPECIFICATION_POINT`) | Tier 1, no block | Not anchored to the learner's assessment content |
| Tutor ask path (`routes/tutor.ts` → `karag prepare()`) | **Tier 1 default** (`assembleTutorContext` fills 1) | The tutor pipeline has no part-reference resolution until DC-1 (prepare step 2.8 + `markContext`); faking one would fabricate the spec's resolution order. The v14 law bullet governs the tutor surface at its tier-1 posture; the paper-exploration flow stays under the of-record part-by-part law (scheme content as labelled SOURCES, unchanged) |
| The explicit reveal affordance | Outside this PR's chat law — v2's mark-scheme reveal (`questions/reveal.ts`) is a deterministic, policy-gated surface (VALIDATED_ONLY / INCLUDE_SUGGESTED), not a model behaviour | The spec's tier-2 second trigger names a UI affordance; the deterministic reveal already carries its own policy of record |

### 4.3 Deliberate act flag

On the CLA surface the chat turn itself is the deliberate conversational act (spec §3.2 Observed); the resolver's kind + mode make it deterministic. The "explicit reveal affordance" arm is the deterministic reveal surface (§4.2). No new flag is invented — the of-record §7.3 read and the ResponseMode enum carry the state machine, which is why no migration and no new DB read are needed.

## 5. Diff map (5 files, additive)

1. `apps/api/src/services/tutor/prompt.ts` — `PROMPT_VERSION` "13"→"14" + the v14 history entry (recovery provenance); the authored v13 bullet replaced by the composed spec law (§3 above); `PromptContext.disclosureTier?: 1 \| 2`; the user-prompt assembler renders the `DISCLOSURE TIER 2:` block (unfenced, OUR scaffolding — the tier is computed state, not learner data) only when `disclosureTier === 2`, after the QUIZ SCAFFOLD block.
2. `apps/api/src/services/tutor/context.ts` — `TutorContext.disclosureTier: 1 \| 2` + `AssembleInputs.disclosureTier?: 1 \| 2`; `assembleTutorContext` defaults to 1 (the tutor surface's tier-1 posture until DC-1).
3. `apps/api/src/services/cla/service.ts` — the tutorContext construction fills `disclosureTier: schemePointEvidenceAllowed(context, mode) ? 2 : 1`. That is the file's ONLY change; the telemetry stamp (`promptIdentity()`) moves by import as in every bump.
4. `apps/api/test/tutor/tutor-core.test.ts` — identity pin → `tutor-grounded/v14`; the law-presence test re-pinned to the spec's verbatim spans; NEW tier-block render pins (block present ⟺ tier 2; absent at tier 1/undefined; ordering after QUIZ SCAFFOLD / before INTERVENTION PLAN).
5. `apps/api/test/cla/cla-service.test.ts` — identity pin → `tutor-grounded/v14`; NEW tier pins: QUESTION_PART post-attempt EXPLAIN → 2; HINT → 1; attempted-false → 1; KG_TOPIC → 1.
6. `docs/DC2-V14-SUPERSESSION-PLAN.md` — this prereg.

## 6. Fences (byte-untouched of record)

- `apps/api/src/routes/cla.ts` — the frozen ask — **zero bytes**.
- `apps/api/src/services/cla/leakage-policy.ts` — the frozen T-MIG-067 port — **zero bytes** (consumed, never modified; the tier is defined by it).
- `apps/api/src/services/tutor/karag.ts` — **zero bytes** (the tutor surface's tier default lives in `assembleTutorContext`; prepare() stages untouched; DC-1's step 2.8 remains DC-1's).
- `apps/hub/**`, `packages/**` — **zero bytes**; no migration; no new DB reads (the tier consumes the resolver's existing §7.3 attempt-state read).
- The QUIZ SCAFFOLD bullet, the paper part-by-part bullet, and the refusal constants stay byte-verbatim (the quiz carve-out is restated in the law bullet as the carry-forward, matching the spec's own register note).

## 7. Acceptance pins (spec §3.2 mapped onto the deterministic discipline)

Under the R-LLM doctrine (LLM outputs are never golden-gated; the deterministic plumbing is), the spec's acceptance criteria pin to their deterministic carriers:

| Spec acceptance | Deterministic carrier in this PR |
|---|---|
| (a) Adversarial asks at tier 1 yield no scheme point or alternative; they do at tier 2 | The evidence layer of record already enforces the substance: scheme-point evidence enters ONLY when `schemePointEvidenceAllowed` (post-attempt, non-HINT) — pinned green since T-MIG-067 and re-pinned here via the tier-consistency pins; the prompt-side carrier: the tier-2 block renders ONLY at tier 2, and the tier-1 MUST-NOT sentence is in the system prompt (law-presence pin, both variants) |
| (b) Tab generator and tutor agree on tier for the same marked part | **By construction**: one predicate (`schemePointEvidenceAllowed`), two consumers (evidence admission + prompt tier). Future tab surfaces inherit the pattern; the prereg records it as the implementation law |
| (c) Refusal register matches the existing tutor refusal tone | The refusal constants stay byte-verbatim; the carry-forward floor keeps the honest-say-so behaviour ("state them only when the SOURCES carry them") |

## 8. Battery plan (exact head)

Root typecheck ×4 · `bun test apps/api packages` (the known pre-existing `classroom/features.test.ts:428` timestamp-race flake class is disclosed if it fires; proof protocol: stash-run on clean main) · targeted pins: tutor-core + cla-service · golden selftest · retrieval-eval + selftest · zero-core census gate · hub `tsc --noEmit` · `next build` · `routes/cla.ts` zero-byte check on the final diff.

## 9. Gate

MERGE OPERATOR-GATED — this PR halts at the merge word. The merge word approves the supersession of record: from merge forward, the spec-recovered text is the DC-2 law of record and the authored anchor's service period ends.

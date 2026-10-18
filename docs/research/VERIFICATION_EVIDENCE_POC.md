# Verification Evidence Gate — focused v2 audit and PoC

**Status:** PROPOSED — research/engineering prototype only; not an accepted learner-model change.
**Audit scope:** source-level review of learner-model writes/reads, assessment evidence publication, NBA recommendations, and InterventionRun in `SyllabAI/syllabai-v2`.
**Source snapshot:** v2 main at `3cdbfddf4e2cfb389b2ff899b68ae38de17249c5` (read-only GitHub inspection, 2026-10-18).
**Execution status:** source inspected. PoC tests authored but not executed in this environment; CI result required before any promotion.

## Executive result

**Recommendation:** keep the existing probabilistic learner model and intervention boundary. Add a separate, provenance-backed verification-evidence view only if the PoC tests and later data-contract review pass. Do not equate a correct response with demonstrated mastery, and do not replace BKT/BDT with a new ladder.

### What is already strong (source-verified)

- `apps/api/src/services/learner-model/model-update.ts` contains a dedicated BKT/BDT evidence update path. The assessment publisher calls it for marked MCQ evidence; it uses format-aware guessing, decayed BKT priors, and updates only misconception tags actually expressed by a wrong distractor. An untagged wrong answer does not update misconception probability.
- `apps/api/src/routes/assessment/index.ts` wires the real learner-model publisher. The attempt write has an `evidence_emitted` guarded flip after publication; the current source path is not a general arbitrary chat-to-mastery writer.
- `apps/api/src/services/tutor/learner-model.ts` exposes learner state and active struggle inferences to the tutor policy. Empty substrates remain honestly empty.
- `apps/api/src/services/learner-me/nba.ts` ranks deterministic next actions within subject boundaries and uses servable-question gates and structured reason codes.
- `apps/api/src/services/intervention/index.ts` snapshots diagnosis/state references, fixes the intervention definition/hash and allowed tools, enforces ownership/state transitions, and freezes terminal runs. The accepted prototype contract is also documented in the canonical repository's `docs/research/INTERVENTION_RUN_PROTOTYPE.md`.

### Gap / risk (source-verified unless marked otherwise)

1. **No explicit assistance/exposure dimension in the learner-model event contract.** `AssessmentEvidenceEvent` includes attempt/question IDs, correctness, topic/spec-point anchors, misconception tags, question type/options and timestamp, but no validated hint/solution-exposure or independent-vs-supported indicator. Thus BKT receives the graded correctness signal without this new verification label.
2. **The system has probabilistic mastery, not an explicit evidence ladder.** This is not itself a BKT defect. The product/research layer may need a separate explanation of whether an answer was attempted, supported, independently correct, or successful on delayed transfer.
3. **Transfer cannot safely be inferred from similarity alone.** It needs canonical SpecificationPoint linkage, a distinct validated question, a known earlier learning opportunity, a delay policy, and trusted support/exposure metadata.
4. **Concurrency remains a disclosed seam in the model updater.** Its source header says optimistic-lock conflict handling is not ported and concurrent submit races can lose the version bump. This audit did not redesign that write path.
5. **Coverage boundary:** structured-answer evidence is emitted at authoritative marking, not at initial pending submission. The PoC must not count pending/ungraded attempts as success.
6. **Not established by this audit:** real learner outcome gains, production runtime behavior, current database migration state, and CI status for the proposed branch.

## Proposed evidence semantics

The PoC adds a pure function returning one label:
- `ATTEMPTED`: incorrect, ungraded, or assistance provenance unknown.
- `SUPPORTED_SUCCESS`: correct, but a hint/step-by-step/teacher support or answer exposure is recorded.
- `INDEPENDENT_SUCCESS`: correct with explicit `assistance=NONE` and no answer exposure.
- `TRANSFER_SUCCESS`: independent correct on an explicitly designated transfer assessment, with a distinct canonical question sharing one or more SpecificationPoints with earlier evidence, after a configured minimum delay.

This is a **parallel evidence classification**, not a mastery value, score, causal claim, or database write. The minimum transfer delay is an explicit versioned experiment parameter; the PoC imposes no default. Unknown support is fail-closed. Only application-controlled metadata may set assistance and transfer flags.

## PoC artifact

- `apps/api/src/services/learner-model/verification-evidence.ts`: pure classifier; `masteryMutation` is always `NONE`.
- `apps/api/test/learner/verification-evidence.test.ts`: adversarial unit cases for assistance, exposure, unknown metadata, ungraded/wrong attempts, delayed transfer, same-question attempts, anchor mismatch, future-dated evidence, and invalid policy.
- No database migration, live endpoint, tutor prompt, BKT/BDT write, KG mutation, or production wiring is included.

## Verification plan before promotion

1. Run `bun test apps/api/test/learner/verification-evidence.test.ts`, then `bun test apps/api packages`, typecheck and CI on this branch.
2. Review whether attempt/session schema has reliable, app-authored support and answer-exposure metadata. If it does not, stop at prototype; do not infer support from free-form conversation.
3. Add property tests: reordering irrelevant prior events does not change the label; duplicate/current/future attempts cannot satisfy transfer; changing only unrelated SpecificationPoints cannot create transfer.
4. Evaluate on a frozen, anonymized scenario set: immediate correct after hint, correct after solution reveal, correct with unknown support, repeated identical question, later distinct question on same SpecificationPoint, transfer question on unrelated SpecificationPoint, conflicting later evidence, concurrent submissions.
5. Report precision/false-positive rate for `INDEPENDENT_SUCCESS` and `TRANSFER_SUCCESS`; separately monitor BKT calibration. Do not tune on the held-out evaluation set.
6. If the evidence semantics are accepted, define canonical persistence/provenance in the Master Spec/ADR before adding runtime writes. Keep SpecificationPoints canonical, attempts immutable, learner state as overlay, and InterventionRun as orchestration only.

## GitLearnOS patterns: adopt/reject

**Borrow as design input:** explicit evidence provenance, distinction between supported and independent performance, delayed transfer check, fail-closed unknowns, inspectable reason codes, and a reversible/auditable state-transition boundary.

**Do not adopt:** Git as SyllabAI's learner database, Markdown as canonical learner state, GitLearnOS knowledge points replacing SpecificationPoints, RAG-Anything as default retrieval, or DeepSeek Harness as a runtime dependency. GitLearnOS itself describes its Harness integration as Developer Preview and requires a separate verified RAG layer for a complete deployment. See [upstream README](https://github.com/Guojiz/gitlearnos) and its stated limits.

## Decision requested later

Do not promote this proposal until CI and the data-provenance feasibility review pass. The next decision is whether to persist a separate verification-evidence record and where it belongs in the existing attempt/learner-model contract—not whether to replace BKT.

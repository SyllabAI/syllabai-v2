# ADR-CLASS-0003: Foresights context enrichment without derivation change (the v1.1 amendment — evidence recency + at-risk reason breakdown)

| | |
|---|---|
| **Status** | ACCEPTED (operator go, trace `1a18bd4b7d542cc1`: "Go: one mini-ADR amendment tranche" — the recommendation-of-record from the Stage C menu rendered in the same trace) |
| **Band** | `ADR-CLASS-xxx` (teacher/class platform) |
| **Task** | T-FORESIGHT-V0-PLAN-1 (Stage C menu, item SC-3a + plan §11.2) |
| **Date** | 2026-10-30 |
| **Basis** | `docs/FORESIGHTS-V0-PLAN.md` §2, §4, §10, §11 (the deferred Stage C list and the open decisions); ADR-CLASS-0002 (the comprehension-first law — this amendment is its second applicant); Stages A+B of record (contracts+service `7bbc8ea6`/`a6fc888e`, route+panel+goldens `16e5f4a0`/`0b5f76d0`); the Stage C menu of record (trace `1a18bd4b7d542cc1`: SC-1 numeric projection, SC-2 LLM narration, SC-3 context rows, SC-4 weighted propagation) |

## The receipt

The v0 plan deferred four Stage C candidates "each needs its own ADR" and left
one §11 decision explicitly recommended-but-untaken ("distribution breakdown of
AT_RISK by reason — useful, cheap; recommended"). The Stage C menu of record
adjudicated all of them against the CK-12 receipt and the C1–C7 law. Exactly two
survive as an executable, law-clean tranche — and both share one property that
makes them safe to bundle: **neither changes the derivation.** The decision
tables, the thresholds, the headline templates, the disclosure string, and the
two-query evidence surface are all untouched; the wire simply exposes context
the service already computes or already reads. Everything else on the menu is
rejected or deferred with reasons recorded here, so the menu cannot re-open by
accident.

## The decision (the v1.1 amendment, policy marker unchanged)

**D1 — Evidence-recency context fields (menu item SC-3a).**
`ForesightsPrerequisiteCellView` and `ForesightsContextChainRow` each gain
`lastPracticedAt: string | null` — the most recent `skill_states.last_practiced_at`
across the class's enabled roster on that node, null when the cell is unmeasured.
Laws it rides under:

- **Zero new reads.** Query A already selects `last_practiced_at` (it feeds
  `decayedMastery`). The field is an in-memory max over rows the service already
  holds; the batching law (§9: 1× skill_states, 1× misconception_states) is
  re-pinned unchanged.
- **Context only, never influence.** The field classifies nothing. The
  contextChain law ("context only, zero classification influence", plan §2.7)
  extends verbatim to the new field: a battery fixture carries evidence on a
  depth-2 context row and the class state must not move.
- **Zero new thresholds (C6).** No staleness cut, no "fresh enough" constant —
  the raw instant is exposed and the reader judges. Inventing a recency
  threshold would be a new tuned parameter and would need this ADR to justify
  it; we decline to.
- **Honesty.** Unmeasured cells carry `null`, never a fabricated date (the same
  law as `meanEffectiveMastery: null`).
- **Policy marker stays `foresights/v1`.** The derivation is byte-identical; an
  additive context exposure does not create a new aggregation contract. Clients
  written against v0 parse v1.1 views (zod additions only).

**D2 — At-risk reason breakdown (plan §11.2, adopted).**
`ClassForesightsView.distribution` gains
`atRiskByReason: { LOW_MASTERY_PREREQ, ACTIVE_MISCONCEPTION_PREREQ,
LOW_MASTERY_AND_ACTIVE_MISCONCEPTION_PREREQ }` — the in-memory fold of the
already-sorted learner rows by their §5 reason, when `state === "AT_RISK"`. The
three keys are always present (zeros, not absent) so consumers never
distinguish shapes; the invariant `sum(atRiskByReason) === distribution.atRisk`
is pinned by test. This answers the polarized-class question §13.3 poses —
*which kind of at-risk dominates* — without adding a single read or a single
number the learner surfaces do not already produce.

**Render law for both (ADR-CLASS-0002 unchanged).** The hub panel renders both
exposures inside the EXISTING §8 layout order — recency as a line on the
prerequisite chips (section 3), the reason breakdown folded into the attention
queue's header line (section 4). No new section, no chart, no re-sort, no
numbers beyond counts and one date; the C1 headline and C3 disclosure strings
are byte-unchanged. C7 comprehension fixtures extend: the recency line renders
for measured cells and is absent for unmeasured ones; the breakdown renders
only when at least one learner is AT_RISK.

## The dispositions of record (the rest of the Stage C menu — closed)

Recorded so the deferred list stops being re-litigated silently:

- **SC-1 numeric projection from cohort priors — REJECTED for now.** Predicting
  an unpracticed target requires priors from somewhere: cross-cohort pooling is
  banned (plan §2.6, the corpus moat CK-12 spent years building), within-class
  cross-topic propagation IS the shipped band model, and assumed numbers are
  fabrication. The 4-state band is the honest numeric; measured targets already
  route to the T-MIG-053 drill-down. Revisit only after live post-unlock
  accrual demonstrates need, with its own ADR and C2 visual law compliance.
- **SC-2 LLM narration variants — DEFERRED (shape frozen if ever taken).**
  Runtime LLM calls are banned here: they break the determinism law
  (byte-identical views), the golden battery, C5 derivability, and add $0-tier
  cost. The only compliant shape is **authoring-time narration**: LLM drafts a
  frozen variant pool per C1 template offline; the wire carries a deterministic
  variant id; renders stay byte-stable and C7-gated. Value is real but modest
  (the CK-12 failure was graph opacity, not sentence stiffness — the fixed
  template is a feature). Revisit only on operator demand.
- **SC-3b review-schedule context rows — REJECTED.** A scheduling row is
  intent, not mastery evidence; it flirts with the never-conflate boundary
  (plan §2.3) for zero classification payoff, and it is a genuinely new read on
  the Neon $0 tier. The attempts-recency half (D1) captures the teacher's real
  question ("how stale is this evidence?") without it.
- **SC-4 whole-chain weighted propagation — REJECTED.** Any per-hop weight is a
  new tuned parameter (banned by C6), and a multiplicative chain fails C5's
  one-sentence test — it is exactly the opacity class the CK-12 50%-receipt
  convicts. Revisit only if a zero-parameter structural rule over the context
  chain is ever found.

## Scope of application

The `foresights/v1` wire, the `classForesights` service, the mounted route's
serialized view (verbatim — zero route bytes change), and the hub Foresights
panel. Does not amend any other surface; does not touch the learner model
(prediction remains non-evidence, plan §2.5).

## Compliance notes

Against ADR-CLASS-0002: C1 headline and C3 disclosure byte-unchanged; C2
untouched (still no chart, band vocabulary still the only visual); C4 unchanged
(unmeasured cells now disclose `lastPracticedAt: null` honestly, matching the
`meanEffectiveMastery: null` posture); C5 — the one-sentence derivation remains
true and is now *better evidenced* (the teacher can see how recent the evidence
behind it is); C6 — zero new parameters (verified by the continued absence of
any constant added to the service); C7 — the battery and goldens extend with
the recency, breakdown, sum-invariant and context-does-not-influence pins.

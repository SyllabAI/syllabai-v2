# ADR-CLASS-0002: The comprehension-first law for prediction surfaces (the CK-12 50%-receipt)

| | |
|---|---|
| **Status** | ACCEPTED (operator directive, trace `1a1893280de1b2c5`: "adopt the 50%-receipt as a design law for any future prediction surface") |
| **Band** | `ADR-CLASS-xxx` (teacher/class platform) |
| **Task** | T-FORESIGHT-V0-PLAN-1 (leg a) |
| **Date** | 2026-10-30 |
| **Basis** | CK-12 Foundation, "Foresights Teacher Analysis" impact-team study (`info.ck12.org/impact-team-studies/foresights-teacher-analysis` — 10 teachers, vendor-run); T-RESEARCH-CK12-LA-1 run-001 teardown (`docs/research/CK12_INSIGHTS_FORESIGHTS_TEARDOWN.md`); ADR-031 (clock posture); T-MIG-053 §4 evidence semantics (`apps/api/src/services/teacher/analytics.ts` header law); the §13.3 shared band vocabulary (`packages/contracts/src/teacher.ts`) |

## The receipt

In CK-12's own usability study of its Foresights predictive feature (ten teachers,
demo class, survey with comprehension exercises): **90%** reported the Foresights
menu was "easy to interpret", the cohort averaged **75%** on the reading-the-menu
quiz — and **50% had trouble reading the Skill Level Prediction graph**. The
vendor's own data separates presentation-ease from comprehension, and shows the
predictive visual is where teacher trust breaks. The study is small, self-selected
and vendor-run; as efficacy evidence it is weak — as a **design risk receipt it is
directional and we adopt it as binding**. SyllabAI's disclosure posture already
refuses fabricated certainty on the measurement side ("unmeasured is honest",
T-MIG-053 §4); the same posture applied to the *prediction* side needs a
presentation law, because a probabilistic surface that teachers misread is worse
than no surface: it manufactures false confidence at scale.

## The law

Any surface — wire view, hub panel, report, export — that presents a
**prediction, projection, prior, or readiness estimate** (anything about learner
performance that is not itself measured evidence) must satisfy ALL of the
following. A surface that cannot satisfy one of them does not ship.

**C1 — Headline sentence first.** The surface leads with a plain-language template
sentence that carries the decision the teacher should make ("this class looks
ready for X", "expect X to land hard for learners relying on Y", "this cannot be
honestly predicted yet, assign Z first"). The sentence must be renderable with
zero charts. Charts decorate the sentence; the sentence never captions a chart as
an afterthought. Templates, not free-form generation — the exact wording is
reviewable code.

**C2 — No bare probabilistic visuals.** No graph of a probability, mastery prior,
or projected distribution without ALL of: (i) the C1 sentence on the same screen,
(ii) a band-level (qualitative) encoding using the shared §13.3 vocabulary
(LOW | DEVELOPING | SECURE | UNMEASURED) — never a bare numeric curve, (iii) the
C3 disclosure rendered adjacent. The 50%-failure element in the CK-12 study was a
dense quantitative graph read without narrative support; that construction is
banned here.

**C3 — Prior ≠ evidence, disclosed on the wire.** The prediction view carries a
mandatory `disclosure` string field (wire-level, not UI copy) stating: what
evidence it was derived from, the as-of instant, and that it is a model prior —
not a measurement of the target. Any client, including ones we do not write,
must therefore render the provenance. This is the prediction-side sibling of the
"unmeasured is honest" law: measurement surfaces fabricate nothing, prediction
surfaces claim nothing they cannot explain.

**C4 — Honest cannot-predict as a first-class state.** Insufficient evidence is a
named, styled outcome (`NOT_ASSESSABLE` class) with its own sentence and, where
possible, an unlock path (which single missing measurement would restore
assessability). Cold start is disclosed inline at the point of use — never as
fine print, never as an empty chart.

**C5 — One-sentence derivability.** The derivation must be explainable to a
teacher in one sentence of the form "derived from your class's own practice
evidence on prerequisite topics, banded by the same thresholds the learner
surfaces use". If a surface's derivation cannot be stated that simply, the
surface is too opaque to ship (this is the anti-CK-12-opacity clause: no
published-methodology surface survived our teardown review).

**C6 — Shared thresholds only.** Prediction surfaces reuse the SAME parameters
the learner-facing surfaces use — the decay band ceilings (LOW < 0.45 ≤
DEVELOPING < 0.8 ≤ SECURE), the BDT active threshold (0.5, with
`relaxedToPrior` staleness relaxation), the recommendation evidence floors
(`weakMasteryCeiling` 0.45, `minAttemptsForWeakness` 2). No prediction-specific
tuning, no teacher-specific tuning — extending T-MIG-053's read-only-by-
construction law to the prediction side. New constants require their own ADR.

**C7 — Comprehension gate in the test battery.** A prediction surface ships only
with a comprehension check in its test/golden battery: given the rendered
surface (fixture), a reader must be able to answer "what does this tell me to
do, and how confident should I be?" from the surface alone. The battery encodes
the answers as fixtures. This operationalizes the CK-12 study's
comprehension-exercise methodology as a CI gate — the vendor tested after
shipping; we test before.

## Scope of application

Applies to every future surface presenting non-measured performance information:
the Foresights-v0 read model (T-FORESIGHT-V0-PLAN-1 leg b, the first applicant),
any successor predictive read model, any LLM-narrated projection layer (the LLM
may render a C1 template's variants but may not originate the claim), and any
export/report path that carries projected values. Does NOT apply to surfaces
that present only measured evidence (T-MIG-053 overview/learners/drill-down,
F-072 heatmap trio) — those remain governed by their own evidence laws.

## Compliance notes for the first applicant

The Foresights-v0 plan (`FORESIGHTS-V0-PLAN.md`) is written against this law:
band-level classification instead of numeric prediction (C1/C2), a mandatory
wire `disclosure` field (C3), `NOT_ASSESSABLE` + unlock path as the cold-start
outcome (C4), deterministic prerequisite-chain propagation stated in one
sentence (C5), zero new thresholds — every cut inherits the learner engine's
numbers (C6), and the test battery includes the comprehension fixtures (C7).

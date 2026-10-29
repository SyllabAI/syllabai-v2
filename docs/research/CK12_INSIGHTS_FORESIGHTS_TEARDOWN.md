# CK-12 "Insights" & "Foresights" — competitive feature teardown

**Status:** RESEARCH NOTE — external competitive analysis only; no product decision, no code change, no DB contact (zero-DB-contact discipline held; production Neon quota outage window unaffected).
**Task ID:** T-RESEARCH-CK12-LA-1 run-001 (operator trace `1a18927f61e8cbf5`: "Before proceeding, I want you to analyze two features. Those are 'Insights' and 'Foresights' https://www.ck12.org/pages/learning-analytics/")
**Date:** 2026-10-30 (Asia/Dhaka)
**Source basis:** 8 external sources, gathered web-side 2026-10-30; no authenticated CK-12 product access (demos are behind sign-in). Every CK-12-internal claim below is from CK-12's own pages or the CK-12-run study; everything under "How it likely works" is explicitly INFERENCE.

## Sources of record

| # | Source | What it yielded |
|---|--------|-----------------|
| S1 | `ck12.org/pages/learning-analytics/` (official landing page) | Positioning copy, demo subject matrix, cold-start note, "Getting Started" flow |
| S2 | Help Center `7361858991899` "How to Access Insights" | Access paths; data shown: engagement score, skill level, time on read |
| S3 | Help Center `360047996193` "How to View Insights" | Step-by-step access; LMS routing; related-metric article set |
| S4 | Help Center LMS articles (Canvas `360055302973`, Schoology `360053519294`, generic LMS `360055410453`) | "Go to Insights" from-assignment loop; class-report entry |
| S5 | `info.ck12.org/impact-team-studies/foresights-teacher-analysis` (CK-12-run study) | 10-teacher usability study with quantified findings incl. the 50% prediction-graph comprehension failure |
| S6 | Tech & Learning review "What is CK-12 and How Can Teachers Use It?" | Third-party description: Foresights = future proficiency prediction; Insights = skill levels already demonstrated (beginning → mastery); gap recommendations; top-performer highlights |
| S7 | CK-12 OTAN curriculum write-up | Adaptive practice is "AI-assisted"/ML-driven with hint-adapted questioning — the data engine feeding both analytics features |
| S8 | Corroborating snippets (Facebook educator post; LinkedIn post; YouTube "CK-12 Learning Analytics: Insights & Foresights" video, unviewed) | Foresights granularity described as individual AND class |

## Executive result

1. **Insights is retrospective; Foresights is predictive.** Insights = per-student and whole-class view of what already happened on assigned lessons (skill level already demonstrated, engagement, time-on-read). Foresights = predicted class/individual performance on a concept **before it is assigned**. Same teacher surface, opposite temporal direction; CK-12 sells them as one "Learning Analytics" pairing.
2. **Foresights is the differentiator and it is gated by data gravity.** It requires that students "have completed a couple of assignments related to this subject" (cold-start gate), it exists only for core Math/Science FlexBooks 2.0 subjects (Precalculus is explicitly insights-only), and it plausibly depends on CK-12's longitudinal item-response corpus across millions of students on a fixed concept taxonomy — an asset syllabai-v2 does not have and should not pretend to have.
3. **The pairing maps almost 1:1 onto what syllabai-v2 already built — with one big delta.** T-MIG-053's class-intelligence read model (evidence-kind-separated aggregates, BKT mastery bands, BDT misconceptions, weak-prerequisite projection, honest UNMEASURED posture) IS the Insights analog, arguably deeper than CK-12's. The Foresights analog (teacher-facing prediction on an unassigned topic) does not exist anywhere in the API surface. That is the entire competitive gap in one line.
4. **CK-12's own study is the warning label, not the brochure.** 50% of ten tested teachers misread the Skill Level Prediction graph despite 90% calling the menu "easy to interpret". Any future syllabai predictive surface must lead with plain-language, band-level claims tied to the existing evidence-floor laws — never a bare line chart of a probabilistic estimate. This is a direct usability receipt from the vendor itself.
5. **House-law alignment and tension.** A CK-12-style composite "Engagement Score" collides with syllabai's disclosure posture (tutor engagement is deliberately reported in its own fields and NEVER as mastery). A Foresights surface would likewise have to present prediction as prediction (a prior, not evidence) or it violates the same law that killed "correct answer = mastery" thinking in the Verification Evidence audit.

---

## 1. Product positioning (S1, verbatim-anchored)

Landing-page framing: *"Teachers: Maximize Your Impact with Learning Analytics"* — *"Teachers truly have superpowers now with predictive analytics along with in-depth performance insights for each student."*

The page splits the offering into two named features:

- **Class Foresights** — *"Leverage our system's predictive analytics to see how your class will perform on a concept before it's even assigned!"* (S1)
- **Class Insights** — *"Discover individualized insights for every student and gain a comprehensive view of performance and engagement across your CK-12 or LMS class."* (S1)

Onboarding mechanics worth copying on their own merits:

- **Demo-first discovery.** The page's centerpiece is a subject picker launching "Foresights and Insights" demos (Math 6/7/8, Algebra I/II, Geometry, Precalculus\*; Biology, Chemistry, Physics, Earth Science, Life Science, Physical Science; \*"Only insights available" for Precalculus). Users evaluate the analytics on a fabricated demo class before their own class has any data — this entirely sidesteps the cold-start problem in the sales motion even though the product still has it.
- **Zero-configuration promise with an asterisk.** *"Go to any concept from our core CK-12 Math and Science FlexBooks 2.0 and you'll be able to access Foresights immediately!"* with the footnote *"\*Students need to have completed a couple of assignments related to this subject."* The honest gate is disclosed in fine print.
- Page-quality note: the FAQ block on this page renders lorem-ipsum placeholder text (S1) — the marketing surface outran the content surface, which itself signals where CK-12's investment is concentrated.

## 2. Insights teardown (S2, S3, S4, S6)

**Definition (S6):** displays skill levels students have **already demonstrated**, on a scale running **"beginning" through "mastery"**, alongside engagement data.

**Surface composition:**

- Per-student individualized view + whole-class aggregate view (S2: "To see insights for the whole class, please select the whole class option").
- Graphs **and** lists (S6). Class-level view flags performance gaps **with recommendations** and highlights students performing exceptionally well (S6).
- Metric layer (S2/S3 related-article set): **Skill Level** (mastery scale), **Student Engagement Score**, **Time on Read** (reading-time calculation), plus how students "interacted with lessons".

**Access paths (S2/S3/S4):**

1. Native: open assigned lesson → menu grid (upper right) → select class → select student (or whole class).
2. LMS (Google Classroom, Canvas, Schoology): class report → click assignment; or click the assignment in the LMS itself → **"Go to Insights"** button. The analytics follow the assignment, not a separate dashboard login.

**Structural reading:** Insights is a lesson-scoped read model over the assignment loop, not a standalone BI dashboard. The unit of analysis is *assignment → class → student*, which is exactly why LMS users get it "for free" — the assignment is the join key.

## 3. Foresights teardown (S1, S5, S6, S8)

**Definition (S6):** predicts a student's (and, per S1, the class's) **future proficiency in a selected topic** — before assignment. S8 corroborates individual + class granularity.

**What the UI names (S5):** a **"Skill Level Prediction graph"** — the single UI element the study names, which 50% of tested teachers could not read correctly.

**Gates and scope:**

- Cold-start gate: a couple of completed assignments in the subject first (S1).
- Subject scope: core Math/Science only; Precalculus ships insights-only (S1) — i.e., even within the supported subject list, coverage is not uniform. Treat this as an admission that the predictor needs dense per-concept training data and degrades gracefully to Insights where it doesn't exist.
- Availability posture: free, reached from any core concept page (S1); CK-12 is a non-profit and the feature sits on the free tier (subject to unstated "Free Limited Access" terms).

**Validation posture (S5, CK-12-run study):** ten teachers reviewed Foresights on a demo class, then completed a survey with comprehension exercises. Findings: 90% "menu easy to interpret"; average **75%** on reading-comprehension quiz of the menu; **50% had trouble reading the Skill Level Prediction graph**; 70% "meaningful data"; 90% "would save time"; 70% "would recommend". Caveats: n=10, self-selected, vendor-run, demo class only — directional evidence of onboarding friction, not efficacy evidence. No published prediction accuracy, calibration, or methodology anywhere in the gathered sources.

## 4. How it likely works — INFERENCE, flagged as such

No CK-12 source publishes the model. Mechanically plausible stack, anchored on S7 (adaptive practice is ML-driven with adaptive hinting):

- **Skill Level** ← mastery estimation (IRT/Elo/knowledge-component family) over adaptive-practice item responses per concept; the "beginning → mastery" scale is a banded presentation of a continuous estimate.
- **Engagement Score** ← composite over interaction telemetry (time on read, attempt activity, completion, lesson interactions).
- **Foresights** ← mastery state + cohort priors: for an unassigned concept, predict the distribution of outcomes from (a) the student's/class's measured skills on related concepts via the concept graph, and (b) historical performance of similar cohorts on that concept from CK-12's cross-year corpus. The Precalculus gap and the "couple of assignments" gate both fit this shape: no dense cohort history or no student prior → no prediction.
- **What this means for imitation:** the *shape* (priors over a concept graph + honest gates) is portable; the *asset* (millions of longitudinal item responses on a fixed taxonomy) is not.

## 5. Strengths, weaknesses, risks

**Strengths**

- Closed loop: content → assignment → telemetry → analytics → recommendation → next assignment, with LMS-native re-entry ("Go to Insights" from the LMS assignment itself, S4).
- Prediction-before-assignment is genuinely rare in free-tier K-12 tooling and is a strong teacher-time story (90% time-saving perception, S5).
- Demo-class onboarding decouples evaluation from data accumulation.

**Weaknesses / risks**

- **Prediction comprehension failure at 50%** (S5) — the core UI cannot be reliably read by its own target user in the vendor's own test.
- Subject ceiling: math/science core only; no ELA/social-studies analytics; uneven within-subject coverage (Precalc).
- Interpretability opacity: no published methodology, accuracy, or confidence semantics → teacher trust rests on presentation, which is exactly what the study shows is fragile.
- Cold start is real for year-one teachers (the demo motion hides it from buyers, not from users).
- Vendor-run, n=10 evidence base; FAQ placeholders on the landing page.

## 6. Mapping to syllabai-v2 (the "before proceeding" lens)

Grounded in source review of `apps/api/src/services/teacher/analytics.ts` (T-MIG-053 tranche-2 r3a, frozen law `syllabai-core @ 6cad6ef`) and `docs/research/VERIFICATION_EVIDENCE_POC.md`:

| Capability | CK-12 | syllabai-v2 today | Delta |
|---|---|---|---|
| Retrospective per-student + class view | Insights: skill level, engagement score, time on read | T-MIG-053: evidence-kind-separated aggregates (raw attempt 14-day window, evidence-backed practice, tutor engagement in own fields, BKT mastery, BDT misconceptions, coverage, review state); F-072 heatmap trio | **At parity or deeper** — house posture separates evidence kinds where CK-12 composites them |
| Honest-empty posture | Not evidenced | "Unmeasured is honest" — null means, UNMEASURED bands, nothing fabricated | House is stricter |
| Gap → recommendation | Insights recommends actions for gaps; flags top performers (S6) | Weak-prerequisite projection (T-C11) + affected-learner reason codes; NBA next-best-action on the learner side | Partial — no teacher-facing "what to do next" action layer on top of the aggregates |
| LMS loop | "Go to Insights" from Canvas/Schoology/GC assignment (S4) | No LMS integration | Open space (separate workstream, not analytics) |
| Predictive surface | Foresights: pre-assignment class/individual prediction + Skill Level Prediction graph | **None** | **The gap** |
| Cold-start handling | Disclosed fine-print gate + demo classes | Evidence floor / servable-question gates already encode the same instinct | Reuse existing gates rather than inventing new ones |
| Prediction trust UX | 50% graph misread (S5) | — | Design law to adopt before building: plain-language bands + explicit prior/evidence framing |

**What a Foresights-shaped v0 would have to be to survive house law (sketch, not a plan):**

1. **Prediction as prior, never as evidence.** A projected mastery-band distribution on an unassigned topic, derived from existing BKT states + the already-validated prerequisite edges (`prerequisiteRelations`, T-C11 projection machinery — concept→spec-point anchoring already exists). It must present under the same disclosure discipline as DC2-class surfaces: "this is a model prior, here is what it is derived from, here is the class's measured coverage" — and it must never write back into the learner model.
2. **Deterministic first.** The T-MIG-053 precedent (band + weak-prereq propagation, no ML, batched-by-construction) suggests v0 is a *derived read model over existing tables*, not a new predictive engine: propagate measured bands backward through the prerequisite chain to unmeasured topics, emit a banded risk view + reason codes. That is honest, explainable, cheap on Neon ($0-tier constraint: read-model aggregation, no new write path), and directly addresses the CK-12 weakness (interpretability).
3. **Cold start = existing evidence semantics.** UNMEASURED prerequisites are never claimed weak today; the same law extends: no prediction without the evidence floor, surfaced as "cannot predict yet, here is why" — which is better than CK-12's fine-print asterisk.
4. **Adopt the receipt, not the graph.** S5's 50% failure is the single most actionable data point in this teardown: any future surface leads with a sentence ("7 of 24 learners are likely to struggle on X — prerequisite Y is weak for them"), charts secondary, confidence semantics explicit.

**Explicit non-recommendations:** do not build a composite Engagement Score (collides with the never-conflate-engagement-with-mastery law); do not promise per-student outcome prediction without a cohort corpus (CK-12's moat is data, not algorithm); do not chase the demo-class marketing motion before there is a real class loop.

## 7. Open questions (require authenticated product access)

1. Exact Foresights output encoding (probability band? score range? per-student rows vs class curve?) — S1/S6/S8 conflict slightly on granularity.
2. Whether predictions update live on assignment completion, or are batch/pre-assignment only.
3. "Free Limited Access" terms actually governing Insights/Foresights (FAQ placeholders unresolved).
4. Whether the Engagement Score feeds the Foresights predictor (would contradict our reading that it's mastery-driven).

## Worklog

See `worklog.md` entry `T-RESEARCH-CK12-LA-1 run-001`. No code, no schema, no DB, no routes touched.

# FORESIGHTS-V0-PLAN — the deterministic pre-assignment readiness read model

| | |
|---|---|
| **Status** | SCOPED — plan of record; implementation gated on operator go (stages below) |
| **Task** | T-FORESIGHT-V0-PLAN-1 (leg b), trace `1a1893280de1b2c5` |
| **Date** | 2026-10-30 |
| **Design law** | ADR-CLASS-0002 (comprehension-first prediction surfaces) — this plan is its first applicant |
| **Basis (all read first-hand)** | `apps/api/src/services/teacher/analytics.ts` (T-MIG-053 t2 r3a); `apps/api/src/services/knowledge/graphs.ts` (F-072 heatmap trio: `graphOwnedClass` :226, `memberStudentIds` :242, `enabledRoster` :252, class-scoped cell semantics); `apps/api/src/services/teacher/kg.ts` (`prerequisiteChain` :88 — recursive CTE, depth ≤ 10, `max(depth)`, order depth desc; `conceptAnchorsWithin` :185); `apps/api/src/services/learner-model/decay.ts` (`bandOf` 3-state, LOW < 0.45 ≤ DEVELOPING < 0.8 ≤ SECURE; BDT activeThreshold 0.5); `packages/contracts/src/teacher.ts` (analyticsBandSchema 4-state, affectedReasonSchema); `apps/api/src/routes/teacher-kg.ts` (the mounted class-scoped route precedent) |

## 0. One-paragraph statement (the C5 test)

Foresights-v0 answers, for one class and one not-yet-practiced curriculum topic:
"given this class's own practice evidence on this topic's prerequisite chain,
who is likely to struggle, who looks ready, and what cannot be honestly
predicted yet" — derived read-only from `skill_states` and
`misconception_states` over exactly the class's enabled member roster, banded
and thresholded by the same learner-engine numbers the learners themselves see,
propagating through the already-validated prerequisite graph, and rendered as a
plain-language headline first. No numbers are invented for topics nobody has
practiced; where evidence is missing the surface says so and names the
assignment that would unlock a prediction.

## 1. What CK-12 taught us, distilled into v0 constraints

From `docs/research/CK12_INSIGHTS_FORESIGHTS_TEARDOWN.md`: CK-12's Foresights
predicts proficiency before assignment but (a) 50% of its own study's teachers
misread the Skill Level Prediction graph, (b) no methodology is published, (c)
the cold-start gate hides in fine print, and (d) it depends on a longitudinal
cross-cohort item corpus SyllabAI does not have. Therefore v0 inverts each
weakness: band-level classification instead of numeric curves (a), a
deterministic one-sentence derivable derivation (b), `NOT_ASSESSABLE` +
unlock-path as a first-class state (c), and **no cohort pooling whatsoever** —
every claim derives from this class's own evidence only (d). ADR-CLASS-0002
encodes all four as law.

## 2. Non-goals (v0 — explicitly out, each needs its own ADR)

1. **No numeric mastery prediction.** No "your class will score 0.62 on T".
   The projection is band-level + 3-state classification. Numeric projection
   requires a cohort corpus we deliberately do not fake.
2. **No per-learner outcome probabilities.** Learner rows are classified, not
   scored.
3. **No composite engagement score, ever** (ADR-CLASS-0002 + the never-conflate
   law). Tutor signals do not appear anywhere in this view — the v0 evidence
   surface is exactly two tables.
4. **No LLM in the derivation.** Headlines are reviewable template strings. An
   LLM narration layer (rendering template variants) is a possible Stage C; it
   may paraphrase, never originate, a claim.
5. **No writes.** Zero new tables, zero migrations, zero learner-model
   feedback. Pure read model; the learner model cannot learn from the
   prediction (prediction is not evidence).
6. **No cross-class or historical-cohort pooling** (privacy boundary + the
   corpus moat analysis).
7. **No whole-chain weighting.** Depth > 1 prerequisites are context rows only;
   classification uses DIRECT (depth-1, post-projection) prerequisites only.
   Weighted propagation would introduce tuned parameters — banned by C6.

## 3. Service shape

**File:** `apps/api/src/services/teacher/foresights.ts` (sibling of
`analytics.ts`). **Policy marker:** `foresights/v1`.

```
classForesights(deps: ForesightsDeps, teacherId, classId, rootId, nodeId)
  → ClassForesightsView
```

**Deps:** `KnowledgeDeps & { engine?: ForesightsEngineParams }` where
`ForesightsEngineParams = { decay: LearnerDecayParams; bdt: LearnerBdtParams;
weakMasteryCeiling: number; minAttemptsForWeakness: number }` — the SAME shape
T-MIG-053 uses, defaulting to `LEARNER_ENGINE_PAPER_DEFAULTS` + the frozen
CONFIG numbers (0.45 / 2). No new parameters exist in v0 (C6).

**Gate order (mirrors F-072 exactly):**
1. `graphOwnedClass(deps, teacherId, classId)` — 404 "class not found" → 403
   "this class belongs to another teacher".
2. Tree read `knowledgeTree(deps, rootId, true)` — root 404-first.
3. Target node 404 + subject isolation: node outside the root's PART_OF
   subtree → 404 "node is not part of this subject subtree" (never a silent
   cross-subject hop).
4. **No archived-class gate** (F-072 law: 409 is a write gate; a teacher may
   inspect a past class's foresights).

**Roster:** `memberStudentIds` + `enabledRoster` — EXACTLY this class's enabled
member rows (the independent-student rule: a non-member never moves a single
number). These three helpers are currently private in `knowledge/graphs.ts`;
Stage A exports them verbatim (mechanical export, REUSE-not-redeclare — the
041/043/053-t1 precedent).

**Clock:** ONE `deps.clock.now()` anchor feeds `decayedMastery`,
`relaxedToPrior`, and the wire `asOf` (ADR-031 posture, same as both analytics
predecessors).

## 4. Data flow (batched by construction — 5 reads total)

1. Tree read (root 404-first) → structure scope.
2. `prerequisiteChain(deps, nodeId)` → depth-tagged prerequisite set (CTE
   depth ≤ 10, `max(depth)` semantics, order depth desc — verbatim reuse).
3. `conceptAnchorsWithin(deps, rootId)` → the T-C11 projection machinery:
   concept-level prerequisites project onto their anchor SpecificationPoints
   (validated V15 anchor edges), self-projections collapse, projected pairs
   carry `derived: true` + `derivedViaConceptCodes` — the identical collapse
   and flagging `weakPrerequisites()` already performs.
4. **Query A** — `skill_states` for roster × scope, WITH `last_practiced_at`
   (needed for effective mastery): one query, in-memory grouped by node and by
   learner. (T-MIG-053 t2 bands RAW mastery in topic cells; F-072 bands
   EFFECTIVE decayed mastery. **Foresights bands EFFECTIVE** — a prediction
   must see the class as the learners see themselves now. This divergence from
   t2 is deliberate and disclosed here; the F-072 precedent governs.)
5. **Query B** — `misconception_states` for the misconception nodes attached
   under the direct-prereq set, staleness-relaxed at the asOf anchor.

That is the entire evidence surface. No attempts-window read, no engagement
read, no review-schedule read in v0 (each is a Stage C candidate; their absence
is why the view stays lean on the Neon $0 tier).

## 5. The projection (deterministic decision table)

**Definitions** (all thresholds existing — C6):
- `cell(p)` = class-level cell for prerequisite node p: `learnersMeasured`
  (roster members with a `skill_states` row on p), `meanEffectiveMastery`
  (mean of `decayedMastery(mastery, lastPracticedAt, asOf, decay)`, 4-dp,
  null when unmeasured), `masteryBand` (4-state union: `bandOf` or
  "UNMEASURED"), `weak` (meanEffective < `weakMasteryCeiling` 0.45, only when
  measured), `learnersWithActiveMisconception` (distinct members with
  `relaxedToPrior(probability, prior, last_evidence_at, asOf, tau) ≥
  activeThreshold` 0.5 on a misconception attached under p).
- **Direct set D(T)** = depth-1 prerequisites of T after concept projection.
- Learner cell `cell(p, L)`: learner L's effective mastery on p, `weak_L` =
  (attempts ≥ `minAttemptsForWeakness` 2 && effective < 0.45 — the SAME
  LOW_MASTERY rule as `affectedLearners()`), `misco_L` = active-misconception
  flag on p for L.

**Class-level state** (first match wins):

| # | Condition | State | classReason | Headline template (C1) |
|---|-----------|-------|-------------|------------------------|
| 1 | D(T) is empty | NOT_ASSESSABLE | NO_PREREQUISITE_CHAIN | "The concept graph records no prerequisites for {T}, so there is nothing to project from." |
| 2 | ∃ p ∈ D(T): learnersMeasured(p) = 0 | NOT_ASSESSABLE | UNMEASURED_PREREQUISITES | "This cannot be honestly predicted yet: {codes} has/have no class evidence. Assign {first-unlock-code} practice to unlock a prediction." |
| 3 | ∃ p ∈ D(T): weak(p) | ASSESSABLE_AT_RISK | WEAK_PREREQUISITES | "Expect {T} to land hard: {k} of {n} prerequisites sit below the class's ready line ({codes})." |
| 4 | otherwise | ASSESSABLE_READY | — | "This class looks ready for {T}: every prerequisite it has practiced sits at DEVELOPING or above." |

**`unlockPath`** (C4): set only when classReason = UNMEASURED_PREREQUISITES —
the first unmeasured direct prerequisite in curriculum order (code asc); the
wire carries `{ nodeId, code, title }`.

**Per-learner state** (first match wins; reasons mirror
`affectedReasonSchema`'s shape):

| # | Condition (over D(T), learner's own cells) | State | reason |
|---|--------------------------------------------|-------|--------|
| 1 | ∃ p: no skill_states row for L on p | NOT_ASSESSABLE | UNMEASURED_PREREQ |
| 2 | ∃ p: weak_L(p) && misco_L(p) | AT_RISK | LOW_MASTERY_AND_ACTIVE_MISCONCEPTION_PREREQ |
| 3 | ∃ p: weak_L(p) | AT_RISK | LOW_MASTERY_PREREQ |
| 4 | ∃ p: misco_L(p) | AT_RISK | ACTIVE_MISCONCEPTION_PREREQ |
| 5 | otherwise | READY | — |

Two-level honesty is the point: the class can be ASSESSABLE while individual
learners are NOT_ASSESSABLE (the class has evidence on p; this learner does
not) — each level states only what its own evidence supports.

**Learner sort** (deterministic, the teacher's attention queue — mirrors
T-MIG-053's measured-first-weakest-first-unmeasured-last pattern):
AT_RISK first (reason lexical asc → mean effective mastery over measured
direct prereqs asc → displayName case-folded) → READY (displayName
case-folded) → NOT_ASSESSABLE (displayName case-folded).

**Distribution** (§13.3 spirit — a polarized class must not hide behind an
average): counts by learner state; plus the LOW/DEVELOPING/SECURE count
distribution over measured direct-prereq cells.

**Target-measured flag:** if T itself has skill_states rows
(`targetMeasured: true`), the view still renders (it becomes the
retrospective-validation lens: why T landed as it did) and the wire carries the
flag so the hub routes the teacher to the T-MIG-053 drill-down for the measured
view. Foresights' home terrain is unmeasured targets.

## 6. Wire contract (packages/contracts/src/teacher.ts additions)

```ts
export const foresightsPolicySchema = z.literal("foresights/v1");
export const foresightsStateSchema =
  z.enum(["ASSESSABLE_READY", "ASSESSABLE_AT_RISK", "NOT_ASSESSABLE"]);
export const foresightsClassReasonSchema =
  z.enum(["NO_PREREQUISITE_CHAIN", "UNMEASURED_PREREQUISITES", "WEAK_PREREQUISITES"]);
export const foresightsLearnerStateSchema =
  z.enum(["READY", "AT_RISK", "NOT_ASSESSABLE"]);
export const foresightsLearnerReasonSchema = z.enum([
  "LOW_MASTERY_PREREQ", "ACTIVE_MISCONCEPTION_PREREQ",
  "LOW_MASTERY_AND_ACTIVE_MISCONCEPTION_PREREQ", "UNMEASURED_PREREQ",
]);
```

Views (zod, reusing `analyticsBandSchema`, `measuredBandSchema`,
`javaInstantSchema`, REUSE-not-redeclare):

- `ForesightsPrerequisiteCellView { nodeId, code, title, depth: 1,
  derived, derivedViaConceptCodes: string[], learnersMeasured,
  meanEffectiveMastery: number|null, masteryBand: analyticsBandSchema,
  weak: boolean, learnersWithActiveMisconception: number }`
- `ForesightsContextChainRow { nodeId, code, title, depth: 2..10,
  learnersMeasured, meanEffectiveMastery: number|null, masteryBand }` —
  context only, zero classification influence (§2.7).
- `ForesightsLearnerRow { learnerId, displayName, state, reason,
  weakPrereqCodes: string[], miscoPrereqCodes: string[],
  unmeasuredPrereqCodes: string[], meanEffectiveMastery: number|null }`
- `ClassForesightsView { policy, classId, rootId, asOf: javaInstantSchema,
  targetTopic: { nodeId, code, title }, targetMeasured: boolean,
  classState, classReason: …|null, headline: string, disclosure: string,
  unlockPath: { nodeId, code, title }|null,
  prerequisites: ForesightsPrerequisiteCellView[],
  contextChain: ForesightsContextChainRow[],
  distribution: { ready: number, atRisk: number, notAssessable: number,
    prereqBandCounts: { LOW: number, DEVELOPING: number, SECURE: number } },
  learners: ForesightsLearnerRow[] }`

**The mandatory C3 disclosure string** is assembled server-side, e.g.:
`"Derived read-only from this class's own practice evidence on {T}'s
prerequisite topics at {asOf}; banded by the same thresholds learners see.
A readiness prior — not a measurement of {T}."` — wire-level so every client
renders provenance (ADR-CLASS-0002 C3).

## 7. Route (Stage B)

`GET /api/v1/teacher/classes/{classId}/foresights?rootId=&nodeId=` — mounted on
the existing teacher classes router (`routes/teacher-kg.ts` shape), TEACHER/ADMIN
security per the SecurityConfig law, gate order per §3. Stage A ships
contracts+service+tests with NO mount (the T-MIG-053 t2 doctrine — the route is
a separate reviewed tranche).

## 8. Hub surface (Stage B, R5 lane)

A Foresights panel in the class workspace, entered from the existing class
knowledge-graph: pick any topic node → "Readiness" panel. Layout order is the
ADR law, enforced: (1) the headline sentence, styled by state (ready / at-risk
/ cannot-assess visual classes); (2) the disclosure line; (3) prerequisite band
chips (4-state vocabulary, derived ones flagged with their concept codes);
(4) the learner attention list (three groups in the frozen sort); (5) the
unlock path CTA when present; (6) ONLY THEN any chart — and every chart carries
the headline as its literal caption. `targetMeasured: true` renders a route
chip to the drill-down instead of the attention list.

## 9. Test battery (fakeSql pin pattern, per ADR-CLASS-0002 C7)

1. **Determinism:** fixed clock, same inputs → byte-identical view.
2. **Honesty (class):** class-wide unmeasured direct prereq →
   NOT_ASSESSABLE + unlockPath; no band fabricated anywhere.
3. **Honesty (learner):** class ASSESSABLE + learner NOT_ASSESSABLE row
   coexist (two-level honesty lock).
4. **Independent-student rule:** a non-member learner's skill_states rows
   never move any number (roster-law fixture).
5. **Subject isolation:** target outside the root subtree → 404.
6. **T-C11 mirror:** concept-level prereq projects onto anchors, derived flags
   set, self-collapse, unmeasured-never-weak.
7. **Decay anchor:** effective mastery at the single asOf drives bands; raw
   stored mastery never leaks into a band.
8. **Staleness relaxation:** stale misconception below activeThreshold → not
   active, not counted.
9. **Sort locks:** the §5 learner sort frozen fixture-by-fixture.
10. **No-engagement-contamination (law test):** tutor signals in fixtures
    never appear in the view.
11. **targetMeasured routing flag.**
12. **C7 comprehension fixtures:** for each state fixture, the battery pins
    the expected answers to "what does this tell me to do?" (READY → assign T;
    AT_RISK → prereq remediation first, codes named; NOT_ASSESSABLE → unlock
    path named). The gate a CK-12 never ran, run pre-ship.

## 10. Stages

- **Stage A (implementation tranche 1):** contracts additions (§6) +
  `services/teacher/foresights.ts` (§3–5) + export of
  `graphOwnedClass`/`memberStudentIds`/`enabledRoster` from
  `knowledge/graphs.ts` + the §9 battery. No route, no hub, no DB. Gates: api
  typecheck + api tests + hub build untouched. Zero DB contact (plan-only
  until the operator go; Neon outage window unaffected).
- **Stage B (tranche 2, separate PR):** route mount (§7) + hub panel (§8) +
  golden capture of the three state renders.
- **Stage C (deferred, each needs its own ADR/plan):** numeric projection from
  cohort priors; LLM narration variants over the C1 templates; review-schedule
  and attempts-window context rows; whole-chain weighted propagation.

## 11. Open decisions for the implementer (flagged, not blocked)

1. `contextChain` depth cap: mirror `prerequisiteChain`'s 10 verbatim (default)
   or cap lower for wire size — implementer's call, disclosed in the PR.
2. Distribution breakdown of AT_RISK by reason — useful, cheap; recommended.
3. Hub placement: class-graph side panel vs dedicated workspace tab — R5's
   call with the operator (§8 states the law, not the location).

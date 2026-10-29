# F-185 — Model-Driven Drill Draw + Method-Credit Agreement Measurement — Build Plan (preregistration of record)

> Lane: F-185 build (operator word "Proceed F-185 (model-driven draw + method-credit agreement
> measurement)", IM trace `1a168845df85bf7d`, 2026-10-23). Product spec: Kognity Competitive
> Research Dossier v1.1, **Deep Dive D §8.5 row 4** (the category-making substitution); tracker
> row **F-185** "Model-driven drill draw (BKT/decay-informed question selection)" (repo
> syllabai-v2, deps F-182 / F-184 / F-138 / F-139 / F-055, Backend + Research, Frontend Impl =
> No, Complexity High, P2, research-gated). Committed WITH the implementation per the
> #216/#225/#229/#232/DC-4/F182/F183/F184 pattern. Foundation of record:
> docs/F182-DRILL-SURFACE-PLAN.md + docs/F182-DRILL-BUILD-PLAN.md (the draw policies P1..P6 and
> the zero-stakes law), docs/F183-MS-REVEAL-LAW-PLAN.md (the method-credit acks this lane's
> measurement consumes — the F-183 plan §7 handoff verbatim: "agreement measurement is the
> F-185 model-driven-draw lane's title, consuming these acks"), and docs/F184-DECAY-STRENGTH-*
> (the strength law S1..S6 and the evidence projection this lane's reading composes). Nothing
> here re-adjudicates them.

## 1. What this PR adds (the filed lane, both titles)

The F-184 build receipt names this lane as its successor: "F-185 model-driven draw +
method-credit agreement measurement (consuming the F-183 acks), then F-186 battle wave." This
PR lands BOTH titles:

1. **The model-driven draw goes live**: `POST /draw` composes the learner's read-only evidence
   projection into an information-maximizing selection law (M1..M8 below), with the sparse-state
   fallback to the F-182 random law (P1..P6 verbatim) and a wire disclosure of which policy
   served the draw. Retakes now target gaps instead of re-rolling dice wherever the learner
   state is modelled.
2. **The method-credit agreement measurement infrastructure of record**: the two-rater Cohen's
   kappa law over the F-183 ack's per-point method-credit verdicts (A1..A5 below) — the
   statistic of record for the F-183 validation metric, aligned with the T-SM-KAPPA-SUBJECT
   marking-plane precedent. The F-183 precedent governs the posture: *the metric infrastructure
   is what lands; no agreement number for the live model is asserted by this PR.*

**What does NOT open here**: battles (F-186, strictly sequenced after F-185 per its filed row),
the BKT engine itself (F-138/F-139 — the reading seam is their upgrade path), any DB migration
(the draw audit row keeps its P1..P6-era shape — see §6), any hub file (Frontend Impl = No; the
additive draw-response field rides through the existing client untouched), and any change to
the evidence ack path (the F-183 reveal law is byte-identical — zero diff on reveal.ts
behavior; the file itself is untouched).

## 2. The selection law (M1..M8 — pinned by apps/api/test/drill/model-draw.test.ts)

| # | Law | Mechanism of record |
|---|---|---|
| M1 | **READ-ONLY LEARNER READING** | every learner number is computed AT READ from the drill's own immutable `drill_part_evidence` rows (ADR-031 verbatim: decay computed, never persisted; no learner-state table exists, none is added); `now` is an explicit argument — no clock in the module |
| M2 | **THE READING OF RECORD** | per code, the F-184 strength law composed, not re-adjudicated: the S1 marks-weighted anchor + the S2 decayed strength from THE ONE decay-math owner; codes without graded evidence are UNEXPLORED (strength null — the S4 honest posture) |
| M3 | **THE INFORMATION PROXY OF RECORD** | at one address every candidate carries the address code, so the discriminating signal is the part's SECONDARY codes: I(part) = Σ u(c) over codes(part) \\ {address}, u(c) = 1 − strength(c) for evidence-bearing codes, UNEXPLORED_WEIGHT for unexplored ones; a disclosed PROXY, not BKT information gain (F-138's title) |
| M4 | **SPARSE-STATE FALLBACK** | below SPARSE_EVIDENCE_FLOOR graded rows in the course the state is unmodelled and the F-182 random law P1..P6 serves verbatim, disclosed policy "random" + sparseFallback true; the law refuses to model from nothing |
| M5 | **EXPLORATION FLOOR** | EXPLORATION_SLOTS of the DRAW_SIZE slots are uniform-random over the fresh pool (seeded): coverage stays honest and the policy stays unpredictable even at full evidence |
| M6 | **ANTI-GAMING** | determinism P5 EXTENDED by the reading: (bank, address, recency, reading, seed) → exactly one draw, the reading a pure function of the immutable evidence rows + now (both reconstructible from the audit); the seed of record stays a fresh per-draw seed; the response carries the POLICY used, never a learner-state number (wire-pinned) |
| M7 | **LATENCY BUDGET** | the selection is pure synchronous arithmetic over the already-fetched bank + evidence projection: no await, no LLM call, no store round-trip inside the selection; the draw path's only reads remain the recency + evidence SELECTs (the evidence read IS the F-184 strengths projection's own SELECT — one query, the drill's own table) |
| M8 | **ZERO STAKES (P6 verbatim)** | the module SELECTS; it writes nothing, emits no gradebook event, persists no decay/skill state/policy outcome beyond the draw audit row the surface already records |

## 3. The measurement law (A1..A5 — pinned by apps/api/test/drill/method-credit-agreement.test.ts)

| # | Law | Mechanism of record |
|---|---|---|
| A1 | **INPUT OF RECORD** | a TRIAL pairs two raters' verdicts over the SAME structured part's SAME MS-of-record points; each side is the F-183 ack's `DrillMethodCreditAllocation` list — the validator-trio law already guarantees ack allocations reference known refs, no duplicates |
| A2 | **POINT-PAIRED DENOMINATOR** | a point is COMPARED iff BOTH raters allocated it; single-rater refs are EXCLUDED and disclosed (never scored as agreement or disagreement) — the denominator of record is the paired-point count |
| A3 | **THE STATISTICS OF RECORD** | Po = observed per-point agreement; Pe = Cohen's expected agreement from the two raters' joint marginals over the SAME paired points; kappa = (Po − Pe)/(1 − Pe); the honest null: zero paired points or a degenerate denominator (1 − Pe ≈ 0) → null, never a fabricated kappa |
| A4 | **NO PERSISTENCE** | the measurement computes from the trials its caller hands it and stores nothing (the acks are EPHEMERAL per F-183 law L4; the zero-stakes law untouched) — no store, no SqlFn, no clock in the module |
| A5 | **HONEST DISCLOSURE** | the result carries the population (trials, compared + excluded points), each rater's credit totals over the PAIRED denominator, and the per-trial breakdown; exclusions always visible |

## 4. Policy decisions of record (Q1..Q10, disclosed)

- **Q1 — draw unit & address**: P1/P2 verbatim (the unit is the PART; the address is one spine
  spec-point code). The model selects WITHIN the address pool; it does not choose the address
  (the learner/picker does — the F-182 surface law; the F-184 practice-now queue is the
  address-level guide).
- **Q2 — the reading is composed, not re-adjudicated**: the F-184 opening's disclosed posture
  verbatim. The learner reading of record = `learnerReading()` = the S1/S2 strength law grouped
  per code over `store.evidenceForCourse()` (the exact read the strengths route already
  performs). F-137/F-138/F-139 stay the research lanes that replace the reading's derivation;
  the BKT posterior read swaps in behind the same seam, the policy untouched.
- **Q3 — UNEXPLORED_WEIGHT = 0.5**: an unexplored code's true weakness is unknown; 0.5 is the
  honest midpoint (not assumed weak 1.0, not assumed secure 0.0). Its exploration value is real
  but must never masquerade as modeled weakness.
- **Q4 — SPARSE_EVIDENCE_FLOOR = 5 graded rows, COURSE-wide**: the reading differentiates
  secondary codes course-wide; a learner with fewer than 5 graded rows in the course is
  unmodelled. Ungraded (structured) rows never count (graded = the server-graded MCQ
  population, the S1 law). Per-address sparsity needs no separate rule: the address code itself
  cannot discriminate, so a thin address history degrades gracefully to the unexplored weights.
- **Q5 — EXPLORATION_SLOTS = 1 of 5**: one uniform-random slot per model draw. Coverage stays
  honest, the greedy top-4 cannot be fully farmed, and the exploration slot doubles as the
  information-gathering hedge the proxy cannot express.
- **Q6 — anti-gaming posture**: P5's fresh-seed law is the first line (a retake re-seeds); the
  exploration floor the second; the wire disclosure the third — the draw response names the
  POLICY and never carries a strength/weight number, so the model's picks cannot be replayed or
  farmed from any response.
- **Q7 — wire churn is exactly one additive required field**: `drillDrawResponseSchema.selection`
  = `{policy: "model"|"random", sparseFallback, explorationSlots}` (the F-183 additive-field
  pattern: required key, stable shape). No other wire change; the no-answer-facts law is
  untouched and re-pinned (the L5 boundary test now parses through the extended schema).
- **Q8 — no DB migration**: the draw audit row keeps its current shape (the policy label is
  derivable for research from the response disclosure; PERSISTING it for the A/B metric needs a
  `drill_draws` column — deferred to the research-run lane because the db migration journal is
  owned by the in-flight Seneca lane (PR #316) and a colliding journal edit would manufacture a
  conflict. Disclosed residual, not an omission.)
- **Q9 — the 409 path reads evidence before refusing**: the evidence SELECT precedes the floor
  check (P3 stays inside the draw laws, single throw site). One read-only SELECT on the drill's
  own lane on a path that then refuses — harmless, disclosed.
- **Q10 — measurement collection is operator-gated**: the acks are ephemeral, so a live
  agreement number needs a collection run — a second generator pass at reveal time (2× LLM
  spend) or a teacher-reference replay (marking time). Both are research runs (spend/ethics
  gates); the kappa law + trial shape land here as the infrastructure of record (the F-183
  precedent verbatim). No live number is claimed.

## 5. The corpus substrate (measured on the real bundle of record)

The selection runs over the F-182 census of record (unchanged by this PR — the anti-drift pin
in draw.test.ts stays green): 3928 eligible parts, 182 spine addresses, 157 drillable. The
chemistry integration pins run the model draw at the strongest address **4CH1-1.25 (155-part
pool)** over a hand-built full-coverage reading and pin the weak-secondary dominance of the
greedy slots; the sparse pins run the composer posture over an empty reading (the random law
serves, disclosed). The F-184 evidence projection is the reading's substrate — zero new tables,
zero new columns, zero backfills.

## 6. The seams (what composes, what stays)

- **`services/drill/model-draw.ts` (NEW)** — the selection law M1..M8 as pure functions:
  `learnerReading`, `sparseState`, `informationWeight`, `partInformation`,
  `modelDrawForAddress`/`modelDrawForReading`, `RANDOM_SELECTION`, the constants of record
  (UNEXPLORED_WEIGHT 0.5, SPARSE_EVIDENCE_FLOOR 5, EXPLORATION_SLOTS 1).
- **`services/drill/method-credit-agreement.ts` (NEW)** — the measurement law A1..A5 as pure
  functions: `pairedRefs`, `methodCreditAgreement`, the trial/rater/result shapes.
- **`services/drill/serve.ts`** — `drawForLearner` gains the injected `now` (ADR-031 posture,
  the strengths dependency reused) and the policy composition: reading → sparse ? drawForAddress
  (disclosed) : modelDrawForReading. `recordDrillEvidence` untouched (F-183 byte-identical).
- **`routes/drill/index.ts`** — the draw handler passes the injected clock; nothing else.
- **`packages/contracts/src/drill.ts`** — `drillDrawSelectionSchema` + the response field (Q7).
- **Store, bank, census, reveal, hub: UNTOUCHED.**

## 7. The validation metrics of record (tracker F-185) and their posture

- "Post-draw mastery gain vs random draw (A/B)" — **instrumentation posture**: the wire now
  discloses which policy served every draw; the A/B study itself is the research-run lane
  (needs the policy label persisted per Q8 + volume + F-138/F-139 calibration). Not claimed
  here.
- "Draw latency" — **structural pin**: the selection is synchronous pure arithmetic (M7); no
  new store round-trip beyond the one SELECT the strengths projection already performs.
- "Evidence value per attempt" — the information proxy of record IS the operationalization
  (M3); its calibration is F-139's title.
- "Method-credit agreement on structured drill parts" (the F-183 metric, this lane's second
  title) — the kappa law of record lands (A1..A5); the live number is the operator-gated
  collection run (Q10).

## 8. Battery of record (all green on this branch, pre-push)

- `bun run typecheck` (contracts/shared/db/api): **0 errors**; hub `tsc --noEmit`: **0**
- `bun test apps/api packages`: **2788 pass / 13 skip / 0 fail** (150 files) — 36 new pins over
  the F-184 build receipt's 2752: model-draw battery 22 (M1/M2 reading + decay conformance incl.
  the hand-computed 0.8 → e^(−22/365) case, M3 weights, M4 sparse, M5..M8 pick/determinism/
  anti-gaming/disclosure shape, the 4CH1-1.25 real-pool integration), method-credit-agreement
  battery 10 (hand-computed kappa cases 0.5 / 1 / −1, the degenerate honest null, paired
  denominators, exclusions, aggregation, purity), contracts selection pins 1 (+2 updated draw
  literals), routes F-185 model-policy pins 3 (policy disclosure + M3 through the wire, M6
  determinism, the zero-stakes SQL posture incl. the non-vacuous shell), test-infra stub
  handlers 2 (routes + reveal-law sqlStubs gain the evidence-projection read — the F-183 L5
  boundary pin green through the extended schema)
- `golden/retrieval-eval`: **22 pass / 0 fail** + **19/19 selftest vectors**
- zero-core census gate: **GREEN** (the draw wire rides the v2 drill family; no core route
  family touched)
- census anti-drift pin: green in the suite (census-of-record.json consumed, never recomputed;
  no census surface touched)

## 9. Non-goals & residuals (disclosed)

- **The policy label is not persisted** (Q8): the A/B metric's per-draw policy column waits for
  a quiet db journal (the in-flight Seneca lane owns migrations 0010+/journal right now); the
  wire disclosure carries the policy meanwhile.
- **The reading is a proxy, not BKT** (Q2): F-137/F-138/F-139 replace the anchor derivation;
  the policy is untouched by construction (the reading seam).
- **No live agreement number** (Q10): the collection runs (second generator pass or teacher
  reference) are operator-gated research runs; the kappa infrastructure of record is what
  lands — the F-183 precedent verbatim.
- **The draw picks within an address; it does not pick the address** (Q1): address-level
  guidance remains the picker + the F-184 practice-now queue.
- **F-186 (battle wave)** follows per the filed dossier line, strictly sequenced after F-185
  per its filed row; battles inherit model-drawn sets — the composition point is
  `drawForLearner`, untouched by F-186's matchmaking concerns.

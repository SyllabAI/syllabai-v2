# golden/retrieval-eval — the retrieval eval harness (Card C)

Fusion-layer evaluation for the KG-RAG band: **weights-vs-uniform ablation**
over the REAL serving fusion, scored against the **question_topics
anchoring**. Sibling of `golden/llm-shadow` (same lane conventions: own
package.json/tsconfig, `bun test <dir>` lane, fixed-vector selftest, no
`golden/runner.ts` edits).

## Run

```sh
bun test golden/retrieval-eval           # the gate pins (fixture corpus)
bun run --cwd golden/retrieval-eval selftest   # fixed-vector comparator selftest
```

CI: a sibling step in the `verify` job, after the golden-master self-check.

## The no-drift law (what is REAL vs what is FIXTURE)

- **REAL — the fusion**: this harness imports the serving modules VERBATIM
  (`apps/api/src/services/tutor/rrf.ts` — `fuse`, `fuseWithPlanWeights`,
  `PLAN_V2_WEIGHTS` — and `tutor/evidence.ts` — `evidenceFromChunk`,
  `evidenceFromNode`). Both are pure (no db / env / provider), which is what
  makes a CI provider-free harness over the real fusion possible. A copied
  fusion would drift; an imported one cannot.
- **FIXTURE — the arms' inputs**: the serving arms are SQL-bound; CI has no
  database. The harness replays each arm's observable contract over recorded
  fixture data: the vector arm = cosine over RECORDED EMBED_REV 2 vectors +
  the dual-EXISTS serving-eligibility gate + the MIN_COSINE 0.50 floor +
  `TUTOR_VECTOR_CANDIDATES` 12; the KG arm = recorded match specificities +
  the 0.50 specificity floor + `TUTOR_MAX_TOPICS` 5. Constants are CITED from
  `tutor/karag.ts` (never re-decided here) and pinned by the gates.

## Provider-free law

Vectors are RECORDED fixtures at `EMBED_REV 2` (the same posture as the
serving corpus: stored chunk vectors per generation, never recomputed). The
harness embeds nothing and calls nothing — a question's "embedding" is its
recorded fixture vector and cosine runs locally. CI needs no embedding
provider, by construction.

## Label law

Labels come FREE from the `question_topics` anchoring (`question_id`,
`node_id`, `is_primary` — the provisioned table's shape): a retrieved item is
correct for a question iff it grounds an anchored node. KNOWLEDGE_NODE items
ground their `nodeId`; chunk items ground the fixture's `groundTruthTopics`.
That ground truth is deliberately NOT the serving `EvidenceItem.topicIds`
field — in the frozen v0 serving shape those are QUERY-level (the
intent-matched topics attached to every chunk, `karag.ts:364`) and would make
every retrieved chunk a hit. The harness still attaches topicIds query-level
for shape fidelity.

Metrics (`lib/metrics.ts`, pure, selftest-pinned):

- `recall@budget` = fraction of anchors grounded by ≥1 item inside the top
  `TUTOR_EVIDENCE_LIMIT` (6) fused list,
- `MRR` = reciprocal rank of the first anchor-grounding item,
- `hit@1` = the top-1 grounds an anchor.

Zero-anchor questions are UNMEASURABLE — reported (`sufficiency.unmeasurable`),
never averaged. Anchors absent from every arm candidate are counted as
`coverageGaps`.

## Ablation

Each question fuses TWICE — plan-v2 weights (the serving posture) and uniform
1.0 (the control) — and the report carries both aggregates plus the deltas.
The fixture corpus (`fixtures/corpus-v1.json`) is hand-derived so the pins are
exact, including a **damaging flip**: on question 5 a paper-linked
UNVALIDATED mark-scheme chunk (grounds: none) leads under uniform weights,
while the titration NOTE anchor leads under plan-v2 — plan MRR 1.0 vs uniform
17/20 (the anchor survives at uniform rank 4), Δ = 3/20, Δhit@1 = 0.2. The
other four questions keep their anchor-led top-1 under both weightings (their
exact 1/61 ties break toward KNOWLEDGE_NODE on the frozen source-ordinal
tiebreak), so the flip taxonomy stays honest: one question, one damaging
flip, zero benign key noise.

## Layout

```
lib/types.ts       the recorded fixture contract (label law lives in the header)
lib/metrics.ts     pure ranking metrics (selftest pins are hand-computed)
lib/harness.ts     arms → REAL fuse ×2 weightings → budget → report
fixtures/corpus-v1.json   the synthetic micro-corpus (5 nodes / 12 chunks / 6 questions)
gates/retrieval-eval.test.ts   the CI gate pins over the fixture corpus
selftest.ts        fixed-vector comparator selftest (GOLDEN_MASTER §5 discipline)
```

Standalone strict typecheck (optional, dev-only, mirrors llm-shadow):
`cd golden/retrieval-eval && bunx tsc --noEmit -p tsconfig.json` — the repo's
typecheck ×4 does not include this subtree (by fence design; this harness is
its own CI lane).

## What this harness is NOT (yet)

It evaluates the FUSION layer over fixtures — not the end-to-end serving
retrieval over the live corpus (that needs the DB and is the soak band's
business). When real recorded embeddings at EMBED_REV 2 are exported, the
same `evaluateCorpus` consumes them unchanged: the fixture is data, the
contract is the report.

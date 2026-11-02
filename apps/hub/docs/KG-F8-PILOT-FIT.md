# KG-F8 pilot-fit — AI-generated prerequisite edges, measured and gated out

**Date:** 2026-11-02 · **Lane:** T-KG-F8-1 (operator order: "Proceed with F8 — export pre
edges for all courses", following KG-AUDIT-2 finding F8) · **Scripts:**
`scripts/kg_f8_generate.py` (generator), `scripts/kg_f8_qa.py` (pilot-fit harness),
`scripts/kg_f8_vote.py` (vote scorer) · **Ground truth:** the pilot's
operator-validated store (`content/igcse-chemistry-19/prerequisites.json` → 145 `pre`
edges published in `public/kg/data/igcse-chemistry-19.json`)

---

## The task and why a gate was needed

F8 (KG-AUDIT-2) found that 105 of 106 published course graphs are pure spanning trees
(hier edges only); all 145 prerequisite + 10 related-knowledge edges belong to the pilot.
The export pipeline already supports per-course prerequisite snapshots
(`content/<slug>/prerequisites.json`) — only the pilot has one, and its content came from
the operator-validated T-C11 settled store plus hand-curated SME tuples. A corpus-wide
AI generation run was therefore fitted **against the pilot's ground truth before
shipping anything**, so the same measurement that would justify 105 courses could also
stop them.

## Data reality

- Concept webs (`content/<slug>/concept-graph.json`): 105 of 106 bundles are **empty
  stubs** (`nodes: []`); only the pilot carries a real web (113 concepts / 275 edges,
  operator review-gated). There is no transferable concept data.
- The pilot's settled store is nearly **point-level**: 113 concepts with 117 anchor
  edges ≈ 1.04 anchors per concept; 112 validated concept edges project to 124 point
  pairs (~1.1 pairs per edge — no cross-product amplification).

## What was measured (all against the 145 published pre edges)

| Generator shape | Pairs (pilot) | Precision | Recall | Verdict |
|---|---|---|---|---|
| Concept anchors + cross-product projection | 1,058 | **2.36%** | 17.2% | anchor explosion — rejected |
| Single-pass point-level pairs | 59 | **44.1%** | 17.9% | workable base shape |
| 3-run self-consistency vote, K=2 | 111 → 80 kept | **29.7–46.3%** (run variance) | 17–23% | agreement does not select for semantics |
| 3-vote unanimous subset | 54 | 44.4% | 16.6% | **all 54 are listing-adjacency chains** |
| 3-vote AND non-adjacent (cross-cutting) | **0** | — | — | no cross-cutting pair reached agreement |

("Precision" here is a **lower bound**: the operator store is selective, not exhaustive
— a pair it lacks is not proven wrong. But the shape of the failure is decisive.)

## The decisive finding

Self-consistency agreement selects for **prompt compliance, not semantics**: the only
pairs all three runs agree on are listing-adjacent chains ("next point builds on
previous"), which the renderer's hierarchy already implies and the operator's store
deliberately mostly omits (27/124 validated are adjacent). Cross-cutting dependencies —
**67% of the operator's validated web** (e.g. `1.14 → 1.37–1.48`, the particle model
reappearing across topics) — never reach agreement: each run proposes *different*
cross-topic pairs, i.e. unstable judgments, not knowledge. Painting 105 courses with
adjacency chains plus unstable cross-topic guesses would add noise to a surface whose
brand is "nothing is invented".

## Verdict

**No AI prerequisite edges ship to the 105 courses.** The corpus stays at the honest
state the audit disclosed; F8 remains open. What lands instead:

1. `kg_export.py` **v1.6 — the concept-web tier**: a snapshot may carry
   `conceptWebPrerequisiteEdges` ({prerequisite, dependent, skill, basis} — structure
   endpoints resolve verbatim, concept endpoints through anchors). They project through
   the same governance as the validated tier but stay OUT of `prereqValidated` (the
   renderer fork labels them INFERRED PROTOTYPE) and only in-order pairs ship. Inert
   until snapshots exist; the pilot's payload is structurally unchanged (verified
   node/edge/point/prereqValidated equality).
2. The **generator + QA harness committed as scripts**, with the raw LLM runs and the
   vote scorer, so the measurement above is reproducible.
3. This document as the F8 gate record.

## The honest paths to F8 (recommended order)

1. **Operator curation, batched by subject** — the T-C11 way (review sheets per batch),
   at subtopic-pair granularity first (a subject teacher can mark ~30 section-pair
   dependencies per course quickly), then point projection. Highest quality, real cost.
2. **Evidence-grounded regeneration** — an AI pass that must cite the course's own
   revision-notes corpus per pair (retrieval over `content/<slug>/notes.json`), with a
   review queue of per-pair evidence; only pairs with note-backed evidence ship, still
   labeled INFERRED PROTOTYPE until reviewed.
3. **Do not** re-run the free-form generation measured here — the gate numbers are the
   reason this document exists.

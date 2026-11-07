# DC9 — Tutor KG intent pivot arm (T-TUTOR-PIVOT-2)

**Status:** implemented, run-001 · **Date:** 2026-11-07 · **Operator directive:** "the T-task cards in §5, starting with the P0" (T-TUTOR-AUDIT-1 Part 5 item 3) · **Trace:** 1a1b5125735e19c5 · **Escalates:** the DC7 §4 scope-guard residual

## 1. The measured defect (the escalation condition, met)

DC7 §4 deliberately left the KG intent arm on the blended query and named its
own escalation trigger: *"Escalate to a KG-side arm only if live run-001
receipts show the residual mattering."* The T-TUTOR-AUDIT-1 completion pass
(2026-11-07, live on `www.syllab-ai.com`, course-scoped 4CH1 threads, receipts
in `tutor-audit-receipts/`) measured three classes:

| class | ask | outcome |
|---|---|---|
| bare pivot | "Why does potassium react more violently with water than sodium?" (2nd turn of a chlorine thread) | **refused** with six tangential pills (universal indicator, litmus/phenolphthalein, flame tests, `sme-note-rn_…`, "Chemical tests") — TU-2 reproduced |
| mid-thread pivot | "New topic: calculate moles in 8.0 g of methane (CH₄)…" mid-thread | **refused** with tangential pills (chemical tests / carboxylic acids / water purity) — a core quantitative skill |
| anaphora | "explain that more simply + exam-style question" | answered — **about the previous topic**, not the pivot (the blend anchored the wrong prior) |

The DC7 pivot vector arm (the bare question's own ranked list) was LIVE
during these repros and did not save them.

## 2. The mechanism (code-derived inference, honestly labelled)

`prepare()` resolved KG intent on `enriched` (the 4-turn/1200-char
working-memory blend) ONLY. The matched topics feed two amplifiers:

1. `kgCandidates` — the topics' own rows enter the pool; and
2. `specBoostSet` — TEXTBOOK rows whose spec codes intersect the matched
   topics' codes fuse at the **anchor tier (1.0)**.

On a pivot, the blend still carries the previous topic's vocabulary, so the
PREVIOUS topic owns both amplifiers and the pivot topic contributes nothing.
The audit's potassium repro fits exactly: the M1 chlorine turn's test-worded
vocabulary plausibly matched a "Chemical tests"-shaped title; its anchored
rows then owned the six-row head the honesty floor reads, and the DC7 bare
vector rows — one un-anchored list against anchored competition — lost the
head. (Inference from the observed pill rail + code path, not turn-level
provenance; the corpus-side alternative — potassium rows simply absent from
the vector store — is not excluded, and is covered by the DC7 arm plus the
corpus ingest plane, not by this card.)

## 3. The fix (one changeset, frozen laws untouched)

`karag.ts` step 1.1: under the **exact DC7 pivot condition**
(`enriched !== query`), the BARE question resolves its OWN KG intent and the
two contexts merge (`mergeKnowledgeContexts`, `kg-retriever.ts`):

- topics dedup by nodeId at the **max** matchScore, re-sorted by the frozen
  ranking law (specificity desc, code asc);
- prerequisites dedup per (forTopicId, nodeId) at max depth; misconceptions
  dedup per (forTopicId, nodeId);
- an empty arm is the identity; a single-turn ask (or all-blank history)
  never constructs the second arm — **byte-identical posture, zero extra
  queries**;
- no extra cap: each arm is already capped at `maxTopics`; the union may
  exceed `maxTopics` BY DESIGN (the pivot topic must survive even when the
  blend's five topics are all real) — `TUTOR_EVIDENCE_LIMIT` still governs
  what serves.

The bare topics then (a) carry their own KG rows into the pool and (b) join
the spec-boost set — on-pivot rows reach the anchor tier the previous
topic's rows already held, and the RRF consensus bonus (rows both the blend
and bare arms rank) reinforces agreement, the same mechanism that made DC7
WS1 work for the vector plane.

**No prompt bytes change — no tutor identity bump** (the DC7 identity
 bumps rode prompt-law changes; the intent surface is retrieval-internal).

## 4. Alternatives considered and rejected

- **Subtract blend topics on a pivot.** Breaks genuine follow-ups ("why?"
  after a moles answer needs the moles intent) — the DC7 posture explicitly
  preserves the blended arm's frozen behaviour.
- **Similarity-gated intent blending.** New machinery + a threshold to
  calibrate; the bare arm achieves the guarantee with zero new thresholds
  (the DC7 rejection carries over).
- **Prompt-only instruction ("ignore previous topic").** Not a foundation
  (the DC7 run-002 ruling: the pipeline carries the guarantee, prompts are
  not foundations).

## 5. Scope guards (deliberately untouched)

- The blend KG arm, the vector arms (incl. the DC7 pivot arm), the RRF math,
  the weight map, the anchor tier, the pool caps: all frozen.
- The paper-question resolver keeps the blended query (identity parsing
  benefits from history — DC7 §4, unchanged).
- The rerank seam note carries forward: a real reranker's query choice must
  be revisited (rerank-against-blend would re-import the defect).
- The "explain that…" anaphora class is **NOT claimed by this card** — a
  bare-query arm is undefined for an anaphoric ask (the bare question
  carries no content); the blend anchoring there IS the designed follow-up
  behaviour, and unpredictability of the anchor is a separate mechanism
  (disclosed in T-TUTOR-AUDIT-1 TU-13, no card filed).

## 6. Verification

- Local gates (run-001, this sandbox, bun 1.3.14 == the pinned toolchain):
  `bun test apps/api packages` → **3459 pass / 0 fail** (13 pre-existing
  skips) including the 8 new PIVOT-2 tests (4 merge-law pins, 4 pipeline
  laws: bare-intent survival, both-arms union, single-turn byte-parity,
  blank-history degenerate); `bunx tsc --noEmit` (apps/api) clean.
- Post-merge live plan (the audit's own shapes, as the verify learner on
  4CH1-2017): (a) chlorine thread → bare potassium-vs-sodium pivot → expect
  an answered, cited turn whose pills sit in Group-1/reactivity territory,
  not the chemical-tests rail; (b) chlorine thread → "New topic: calculate
  moles in 8.0 g of methane" → expect an answered, cited quantitative turn;
  (c) single-turn moles ask → answer quality parity. The standing cron
  health battery remains the regression tripwire.

## 7. Residuals disclosed

- Title-only v0 matcher (no stemming/synonymy, documented at the
  retriever): a pivot question whose topic vocabulary never appears in any
  VALIDATED title resolves NO bare intent — the DC7 bare vector arm remains
  the coverage for that class (and a corpus-ingest question if the rows
  themselves are absent).
- The union can double the intent surface on multi-turn asks (≤ 2×
  maxTopics topics before the pool cap) — accepted deliberately; the pool
  cap law bounds serving.
- The streamed meta event keeps its pre-generation contract (DC7 run-002
  residual, unchanged here).

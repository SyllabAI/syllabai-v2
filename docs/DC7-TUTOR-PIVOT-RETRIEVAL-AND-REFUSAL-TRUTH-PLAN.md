# DC7 — Tutor pivot retrieval + refusal truth (T-TUTOR-PIVOT-1)

**Status:** implemented, run-001 · **Date:** 2026-11-05 · **Operator directive:** "draft the fix card (retrieval + refusal-redirect as one PR)" · **Trace:** 1a1a7c1d764199c5

## 1. The measured defect

Live report (2026-11-05): the tutor refused *"What is the difference between
evaporation and boiling?"* with *"I'm sorry, but the supplied sources do not
contain any information about the difference between boiling and evaporation."*

Root-caused against production via the read-only CI lane
(`t-tutor-diag-1-refused-turns`, runs 001–003), session `bd6c89ff`
(learner `b8f8afb5`, course `4CH1-2017`):

| seq | turn | ev | refused | outcome |
|-----|------|----|---------|---------|
| 3–4 | bare "Hi" | 6 | false | retrieval follows conversation |
| 9–12 | exam-strategy Q&A | 6 | false | answered |
| 13–14 | "Difference between boiling and evaporation" | **6** | **false** | **model-worded refusal** |
| 15–16 | "What is latent heat. Explain" | 6 | false | model-worded refusal |

Two failures, one root cause:

1. **Retrieval contamination (the pivot class).** `retrievalQuery()` prepends
   the last 4 turns (1,200-char budget) to the retrieval query. After five
   exam-technique turns, BOTH retrieval arms (KG intent + pgvector) searched
   for *exam strategy + the question* and pulled six wrong rows; the honesty
   floor then correctly refused — the corpus holds the answer (9/9 cold
   single-turn probes hit it with the bare question).
2. **The analytics gap.** `refused` is `evidence.length === 0`
   (deterministic only). A model-worded refusal — evidence present but wrong
   — recorded `refused=false`, invisible to tutor analytics and the struggle
   signals (`tutor-signals.ts` reads the flag).

## 2. The fix (one changeset, two workstreams)

### Workstream 1 — the pivot arm (retrieval)

`karag.ts` prepare() step 2.1: when working memory actually contributed to
the retrieval query (`enriched !== query`), the **bare question** retrieves
on its own and fuses as a **third ranked list through the existing weighted
RRF** — frozen math, tiebreak order, weight map untouched.

- The blended arm keeps its frozen behaviour: genuine follow-ups ("why?",
  "and part (b)?") keep their history signal.
- Rows both arms agree on fuse with a **double contribution** — the RRF
  consensus bonus reinforces on-topic rows.
- A single-turn ask (or all-blank history) degenerates to
  `enriched === query`: the arm is a no-op — **byte-identical behaviour,
  zero extra retrieval work**.
- Cost on multi-turn asks: +1 embedding call +1 pgvector query.

### Workstream 2 — refusal truth + redirect

1. **v17 refusal shape law** (`prompt.ts`, identity bump
   `tutor-grounded/v16 → v17`): a refusal opens with the deterministic
   family's own stem — *"I can't answer that from the validated course
   material yet."* — states what is missing, and ends with **ONE learner
   redirect**: rephrase the question, or start a new conversation on the new
   topic. One refusal voice across the deterministic and model-worded
   classes; no more bare-apology dead ends.
2. **The refusal-truth detector** (`refusal-detect.ts`,
   `modelRefusalLikely`): deterministic string laws on the finished answer —
   tier 1: the canonical stem; tier 2: the tolerant apology family
   ("i'm sorry, but …") gated on a material phrase AND a negation (a
   corrective answer opening with an apology must NOT record refused).
   Wired in `karagAsk` (blocking) and `karagAskStream` (accumulated text at
   completion; the mid-stream meta keeps its pre-generation contract).
   Telemetry, the API response and the persisted turn inherit the truth
   through the single computation (routes persist `refused` verbatim).

## 3. Alternatives considered and rejected

- **HyDE (hypothetical document embeddings).** Rejected for this defect:
  HyDE generates its retrieval document from the query it is GIVEN — on a
  contaminated query it amplifies the contamination (a confident imaginary
  textbook paragraph about exam strategy). The measured failure is not a
  question↔document vocabulary gap (9/9 cold probes hit the corpus with
  plain embedding; curriculum rows are near-question-shaped), and the
  pipeline already has RRF + a rerank seam. Cost (+1 LLM call/ask,
  provider-rotation variance) for an unproven gain on an in-domain corpus
  (the HyDE paper's own weak case). Re-triable later behind a flag ONLY if
  the health battery shows colloquial-phrasing misses after this fix.
- **Similarity-gated blending.** Gate history inclusion on question↔history
  embedding similarity. Equivalent outcome to the pivot arm but with new
  machinery (extra embedding pass + a threshold law to calibrate); the pivot
  arm achieves the guarantee with zero new thresholds.
- **Structured refusal marker (`[[REFUSED]]` sentinel).** Stream-hostile
  (strip-before-know races the wire) and fragile across the rotated provider
  pool. The canonical-stem law + detector achieves the analytics truth with
  zero wire changes.

## 4. Scope guards (deliberately untouched)

- The KG intent arm: still consumes the blended query. **Disclosed
  residual:** on a pivot, the KNOWLEDGE CONTEXT topic list and the spec-boost
  set can still describe the previous topic; the evidence pool — what the
  honesty floor reads — is what changed. Escalate to a KG-side arm only if
  live run-001 receipts show the residual mattering.
- The rerank seam: prod runs `noReranker`; when a real reranker lands, its
  query choice must be revisited (rerank-against-blend would re-import the
  defect).
- The paper-question resolver (keeps the blended query — identity parsing
  benefits from history for follow-ups), the CLA surface (own pipeline),
  `TUTOR_REFUSAL` bytes (already carry a redirect; the frozen-bytes test
  holds).

## 5. Verification

- `bun test apps/api packages`: **3391 pass / 0 fail** (was 3380 pass — 11
  new tests: 10 detector pins, 4 pivot-arm laws incl. the RRF consensus
  double-count, 3 pipeline refusal-truth laws incl. stream parity; identity
  pins bumped to `tutor-grounded/v17` in tutor-core + cla-service).
- `tsc --noEmit` (apps/api): clean.
- Post-merge live plan: re-run the bd6c89ff conversation shape (5 exam turns
  → pivot ask) against prod and confirm (a) an answered, cited pivot turn,
  (b) `refused=true` on a forced model-worded refusal in
  `tutor_session_turns`; the standing cron health battery (job 501196)
  continues as the regression tripwire.

## 6. Residuals disclosed

- The detector is best-effort truth on the analytics plane (R-LLM doctrine:
  LLM outputs are never golden-gated). A refusal phrased outside both stem
  families is still missed; an apology-opening correction that names the
  sources AND negates within the first 300 chars would false-positive. The
  v17 law narrows both by pinning the stem.
- Single-turn asks are byte-identical; multi-turn asks carry one extra
  embedding call + one extra pgvector query.

## 7. Run-001 live findings (post-merge prod replay, 2026-11-05)

Deployment `ad852640` (Production, success 19:37:42Z). Replay via
`/api/v1/tutor/ask` as the verify learner, course `4CH1-2017`:

- **Workstream 1 (the pivot arm): LIVE and working.** The deterministic
  fingerprint held: the with-history pivot ask shares citations with the
  cold single-turn ask (overlap ≥ 2 — model-independent), and the pivot
  answered correctly with citations on the post-deploy probes ("Evaporation
  vs. boiling — Temperature: boiling occurs at one fixed temperature …").
  The pre-deploy gemini refusals were the old build.
- **Workstream 2: two live-measured gaps, fixed in run-002.**
  1. The small-model pool does not follow the v17 stem/redirect law: 6/6
     observed model-worded refusals used their own wording families
     ("The supplied/provided sources do not contain …", "I'm sorry, but
     none of the supplied sources contain …") — none opened with the
     canonical stem, none carried a redirect.
  2. The detector missed both live families: the source-first openers
     (no apology stem) and the "none of the … contain" negation.
- **Run-002 corrections (this commit):**
  - Detector tier 3: `SOURCE_STEMS` ("the supplied/provided/the sources",
    "none of the") gated on content-LACK verbs — correction verbs
    ("do not support/say") deliberately unlisted so corrective openers
    never record refused.
  - The DETERMINISTIC redirect: `withRefusalRedirect` appends the
    way-forward line ("Could you rephrase the question, or start a new
    conversation on this topic?") on every detected model-worded refusal —
    blocking before the answer returns; streaming as a tail delta before
    the completed event (rendered chat + fullAnswer + persisted turn all
    match). Idempotent (law-compliant answers untouched). A prompt law is
    not a foundation; the pipeline now carries the redirect itself.
- **Residual:** the streamed meta event keeps refused=false (pre-generation
  contract); the completed event, telemetry and the persisted turn are the
  truth carriers. "None of the sources …" corrective openers would
  false-positive (deemed implausible as a correction shape; disclosed).
- Suite: 3400 pass / 0 fail (9 new run-002 tests). Typecheck clean.

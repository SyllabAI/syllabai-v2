# DC10 Appendix B — GLM substitute review (POSITION-LEVEL RECONSTRUCTION)

> **Provenance and honesty note.** When no direct path to the intended
> external reviewer existed, the same brief (Appendix A) was run through GLM
> as an explicitly-labelled substitute second opinion, 2026-11. The full
> review text was produced in-session and lost to a sandbox recycle before
> it could be committed. **Only its four positions survive in the session
> records — not its argumentation.** This file therefore reconstructs the
> positions and records how DC10 resolved each one; it does NOT attempt to
> re-derive the lost prose, and no argument is attributed to the substitute
> reviewer beyond the positions themselves. Reconstructed 2026-11-17.

---

## The four surviving positions, and how DC10 resolved them

### 1. Kill v3 as proposed — CONVERGED, adopted
The substitute recommended killing the v3 extraction learner graph outright.
The external review independently reached the same verdict with four
recorded reasons (DC10 §5.3): served evidence is derivable from a
deterministic join table with zero LLM; extractor+auditor+merger costs ≥2
LLM calls per turn on a $0 stack; SyllabAI's KG proposition rows already are
the corpus learnharness lacks; and "never store mastery" is wrong for us —
mocks/drills/marks are ground truth. **Resolution:** v3 killed as proposed;
reshaped as the served-evidence ledger (DC10 §7.7). Two independent reviews
converging on this kill is the strongest single signal in the whole review
trail.

### 2. Merge v1 and v2 into one pass — PARTIALLY ADOPTED
The substitute argued v1 and v2 should not ship as separate layers. DC10
kept separation but for a different reason than sequencing risk: the
operator's phasing directive (P1 content/prompt-only, no learner data → P2
confidence + aimed answering → P3 ledger + loop) partitions by **risk class
and data dependency**, not by the v1/v2 labels. Practical overlap was
absorbed: the P1 voice-law bump and the P1 distractor discipline share one
deploy window, and DC10 §7.4's confidence capture ships in P2 while its
consumption is deferred to P3 — so nothing in v1+v2 was dropped on
sequencing grounds.

### 3. Binary confidence (two buttons), not three — REJECTED
The substitute recommended reducing the confidence capture to a binary
(Sure / Not sure). The external review argued the opposite: three levels
(Sure / Think so / Guessing, no default) with five consumption rules (DC10
§7.4). Three levels preserve the middle self-assessment band that binary
collapses, and the log-first gate means the extra resolution costs nothing
at capture time. **Resolution:** three buttons, log-first, consumption
gated on the calibration curve.

### 4. Opt-in diagnose mode — REJECTED in that form
The substitute kept a diagnose mode but made it opt-in. The external review
went further and killed the diagnose *prologue* entirely: the first answer
must fully answer the question (frozen rule, DC10 §5.2), and diagnosis
survives only as the collapsed form — one optional, deterministic,
post-answer probe near a known gap (DC10 §7.6), with bracketing behaviour
accumulating across sessions rather than taxing a single one.
**Resolution:** diagnose-as-prologue killed; the probe is the survivor.

## What the substitute review contributed, net

Its durable contribution is the v3 kill — a position reached independently
before the external review, which turned "one reviewer's objection" into a
converged verdict. Its two divergences (binary confidence, opt-in diagnose)
were both resolved toward the external review's finer-grained positions,
with reasoning of record in DC10 §3, §7.4 and §7.6. This is exactly why the
substitute was run despite being labelled as such: independent convergence
is evidence, and independent divergence needs a written reason to override.

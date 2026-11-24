# golden/answer-quality — the offline answer-quality lane (T-TUTOR-AUDIT-P3, F2)

The offline answer-quality lane of record (audit P3-04 + P3-05 + P3-06,
finding F2). It scores **recorded WIRE tutor turns** through the SERVING laws
of record — imported VERBATIM (the no-drift discipline, P3-01's own ruling:
"a re-implemented law would drift; an imported one cannot") — against the
**committed baseline of record**. The P3 exit criterion this lane closes:
*"Baseline committed; its first week of trend is the reference for P4 and P5."*

## The three dimensions of record (the rubric v1, P3-04)

1. **Citation support** — a serving turn (not refused, evidence present)
   carries at least one IN-RANGE citation marker, scored with the serving
   `carriesInRangeCitation` (refusal-detect.ts :169, the F4 second signal)
   on the **wire answer**. The stored DB transcript is NOT scoreable here:
   the session store strips EVERY citation marker at persist
   (conversation.ts :42-52 — "its source numbers belong to the
   KA_RAG_COMPLETED telemetry row, the citation archive of record"). The
   wire answer is the citation archive of record.
2. **Refusal correctness** — the learner-experience law the
   TUTOR_REFUSAL redirect + F4 gate exist to hold: a refused turn (or a
   turn whose head the serving detector re-derives as a refusal shape) must
   show a WAY FORWARD — the redirect line (`hasRedirectLine`), an in-range
   citation (F4: the cited answer is substantive), or the deterministic
   family's own opener (whitespace-normalized; the family copy wraps it
   across a template-literal line break). The deterministic family is
   EXEMPT via the wire's own `provider` discriminator
   (`deterministic-*`, karag :870/:877/:884 blocking, :1013/:1016/:1019
   stream) — its way-forward copy is reviewed deterministic law. Two more
   serve-time invariants are scored because recorded wire turns make them
   checkable post-hoc: the analytics flag cannot disagree with a
   detector-shaped head (the serve path computes `refused` with THIS
   detector on THIS head), and the F4 suppression must have held (a cited
   refused answer never carries the tacked-on suffix).
3. **Truncation disclosure** — the wire's `truncated` flag must equal
   `isTruncationFinish(finishReason)` re-derived from the recorded reason
   (the run-013 law, karag.ts :129).

## Layout

```
lib/types.ts               the recorded-turn / verdict / report / baseline shapes
lib/scorer.ts              the pure scorer — serving laws imported verbatim
lib/baseline.ts            the sha256 corpus pin + the baseline cross-check
score.ts                   the CLI: score (evidence producer) | pin-baseline (deliberate)
selftest.ts                fixed-vector anti-tautology device (GOLDEN_MASTER §5)
gates/answer-quality.test.ts   the committed-corpus + committed-baseline gate
fixtures/turns-v1.json     the corpus of record (18 legal wire shapes)
baseline.json              the baseline of record (P3-06 — the sha-pinned anchor)
```

## Run

```sh
bun test golden/answer-quality            # the gate (the ci.yml verify leg)
bun run --cwd golden/answer-quality selftest   # the fixed-vector selftest
bun golden/answer-quality/score.ts score --corpus golden/answer-quality/fixtures/turns-v1.json \
  --json /tmp/aq-report.json --baseline golden/answer-quality/baseline.json
```

## The baseline law (P3-06)

`baseline.json` pins THREE things: the corpus sha256, the rubric the
measurement speaks, and the rubric v1 aggregate over that corpus. The
weekly lane (`.github/workflows/t-tutor-audit-p3-answer-quality.yml`, P3-05)
re-scores the committed corpus and cross-checks the fresh aggregate against
the pin — ANY drift (corpus edit without re-pin, serving-law change that
moves the measurement, rubric change) is RED. A deliberate re-pin:

```sh
bun golden/answer-quality/score.ts pin-baseline \
  --corpus golden/answer-quality/fixtures/turns-v1.json \
  --out golden/answer-quality/baseline.json
```

is the SAME-PR conversation (§7: no silent widening). The scorer's `score`
mode is an evidence producer and exits 0 ALWAYS — the workflow's alert step
carries the gate (the P1 verdict/alert doctrine, T-MIG-047).

## What is real vs synthetic (the capture posture, disclosed)

- **Real**: the scorer mechanics (every law imported from serving code, no
  re-implementation), the violation classes, the baseline anchor, the
  corpus shape-space law — all pinned by the selftest + the gate.
- **Synthetic**: run-001's corpus of record is a SYNTHETIC, SCRUBBED corpus
  (no PII) composed at capture time — the deterministic refusal texts and
  the redirect suffix are imported from the serving modules VERBATIM
  (byte-exact by construction), the remaining prose is scrubbed chemistry
  tutoring copy covering the legal wire shape space (cited/uncited serving
  turns, gate-rescued model-worded refusals, the F4 suppression shape, the
  deterministic family, truncated turns). The first LIVE capture (real
  recorded wire turns, human-reviewed before commit — the llm-shadow
  doctrine) replaces this corpus and re-pins the baseline deliberately.
- The baseline's run-001 numbers (citation support 8/10 = 0.8, refusal
  correctness 1.0, truncation 2/18) are the SYNTHETIC corpus's honest
  measurement — the anchor the trend lane holds until the LIVE re-pin.

## Integration notes

- Self-contained sibling of `golden/llm-shadow` and `golden/retrieval-eval`:
  it imports ONLY `apps/api/src/services/tutor/{refusal-detect,karag,prompt}.ts`
  (all import graphs terminate in pure shapes / injected ports — the same
  rationale retrieval-eval records for rrf.ts) and never touches
  `golden/runner.ts` or `golden/cases/**` (the deterministic forever-gate
  stays byte-identical).
- CI legs: the ci.yml verify lane runs the gate + selftest on EVERY PR
  (same discipline as the retrieval-eval leg, P3-02); the weekly schedule
  (P3-05) publishes the report of record as a 90-day artifact + step
  summary and REDs on baseline drift. Provider-free by construction (no
  model, no database — the corpus and the baseline are committed files).

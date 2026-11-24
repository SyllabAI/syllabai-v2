# golden/conformance-trend — the conformance pass-rate trend lane (T-TUTOR-AUDIT-P4, P4-08)

The conformance pass-rate trend lane of record (audit P4-08). It scores
**recorded WIRE marked-part tutor turns** through the SERVING DC-5 law of
record — imported VERBATIM (the no-drift discipline, P3-01's own ruling:
"a re-implemented law would drift; an imported one cannot") — against the
**committed baseline of record**. The measurement is the trend lane the
report-only → blocking conversation needs: the DC-5 lint's false-positive /
violation shape on real serves, published weekly, anchored so it cannot move
silently.

## Why the recorded turn of record is the WIRE turn

The conformance report of record rides the TutorAnsweredEvent
(karag.ts :960, `conformance: generated.conformance ?? null`); the wire
answer is POST-lint (the lint runs after the H2 hygiene, karag :1263-1274);
the scheme rows of record ride the resolved MarkContext (mark_points +
mark_point_alternatives, mark-context.ts :52-85). The stored DB transcript
is not scoreable (the session store strips markers at persist,
conversation.ts :42-52) — the wire turn is the conformance archive of record.
The scorer adds NO plumbing: it scores what already exists.

## The decision tree of record (the rubric v1, P4-08)

Per turn, the recorded report is put in exactly one branch of the serving
law's own posture, and the branch's invariant is re-derived through the
verbatim law:

1. **BLOCKING serving turn** (the DC-5 surface of record, report present) —
   the recorded report must be internally consistent (`stripped ==
   ruleA + ruleB`, OR the turn-level fail-open shape `stripped == 0 &&
   ruleA + ruleB > 0` — the empty-result law returns the input unchanged),
   and:
   - `ruleA + ruleB == 0` → re-linting the WIRE answer must be all-clear
     (a clean serve);
   - `stripped == ruleA + ruleB > 0` → re-linting the WIRE answer must be
     all-clear (the strip held — the offending sentences never reached the
     learner);
   - the fail-open shape → the wire answer IS the input, so re-linting it
     must reproduce the recorded counts exactly.
2. **REFUSED turn** — `conformance` must be null (the lint never activates
   on a refusal; karag :254-256).
3. **STREAM serving turn** — `conformance` must be null (no report is
   published on the stream event today, karag :1130-1146) and the
   per-sentence law re-derived on the WIRE answer must be all-clear (the
   wrapper held the violating sentences back, per-sentence decisions final).

Lane violation codes: `report-not-active`, `report-count-mismatch`,
`wire-breaks-law`, `refusal-report-present`, `stream-report-present`.
The measurement dimensions: conformance pass rate over the report-bearing
surface (blocking serving turns), the Rule A / Rule B violation mix, strip /
fail-open / pass-through turn counts.

## Layout

```
lib/types.ts               the recorded-turn / verdict / report / baseline shapes
lib/scorer.ts              the pure scorer — the DC-5 law imported verbatim
lib/baseline.ts            the sha256 corpus pin + the baseline cross-check
score.ts                   the CLI: score (evidence producer) | pin-baseline (deliberate)
selftest.ts                fixed-vector anti-tautology device (GOLDEN_MASTER §5)
gates/conformance-trend.test.ts   the committed-corpus + committed-baseline gate
fixtures/marked-turns-v1.json     the corpus of record (12 legal wire shapes)
baseline.json              the baseline of record (P4-08 — the sha-pinned anchor)
tools/compose-corpus.ts    the authoring tool (the corpus = the law's own outputs)
```

## Run

```sh
bun test golden/conformance-trend            # the gate (the ci.yml verify leg)
bun run --cwd golden/conformance-trend selftest   # the fixed-vector selftest
bun golden/conformance-trend/score.ts score --corpus golden/conformance-trend/fixtures/marked-turns-v1.json \
  --json /tmp/cft-report.json --baseline golden/conformance-trend/baseline.json
```

## Capture posture (disclosed)

Run-001's corpus is SYNTHETIC and SCRUBBED (no PII): the wire answers and the
recorded conformance reports are the SERVING LAW'S OWN OUTPUTS
(tools/compose-corpus.ts runs `lintMarkedPartTurn` /
`MarkConformanceStreamSanitizer` / `conformanceReport` verbatim — zero
hand-copying); the deterministic refusal text is prompt.ts TUTOR_REFUSAL
verbatim. The first LIVE capture (real recorded wire turns, human-reviewed
before commit — the llm-shadow doctrine) replaces this corpus and re-pins the
baseline deliberately (§7: no silent widening).

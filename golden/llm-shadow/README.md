# golden/llm-shadow — LLM-OUTPUT behavioural gate harness (T-MIG-039)

Recorded-shadow comparison harness for the two LLM prose seams per
`docs/gates/LLM-OUTPUT-BEHAVIOURAL-GATE.md` / GOLDEN_MASTER §3. Feeds
T-MIG-034 (LLM-chain lane). **Self-contained**: no `apps/api` import,
no `golden/runner.ts` or `golden/cases/**` edits (the deterministic
forever-gate stays byte-identical).

## Run

```sh
bun test golden/llm-shadow           # gate stubs + fixture lifecycle
bun run --cwd golden/llm-shadow selftest   # comparator fixed-vector selftest
```

Both green at filing time (25 tests / 15 selftest vectors). Standalone strict
typecheck (optional, dev-only): `cd golden/llm-shadow && bun add -d @types/bun
&& bunx tsc --noEmit -p tsconfig.json` — the repo's own typecheck ×4 does not
include this subtree, and `bun test apps/api packages` does not discover it
(by fence design: this harness is its own CI lane).

## Layout

```
lib/types.ts               fixture / verdict / artifact types (duck-typed seam shapes)
lib/seam-config.ts         THE REVIEWED CONTRACT: refusal strings (verbatim, source-cited),
                           envelope field law, tolerated fields, T2 thresholds
lib/shadow-compare.ts      canonicalize -> anchor-resolve -> classify -> aggregate (pure)
lib/feedback-llm-proxy.ts  ShadowFeedbackLlm — capture/replay proxy (ADR-MIG-0001 Option A)
gates/smart-mark-prose.shadow.spec.ts   gate stub: lifecycle + T0-T3 vectors + proxy determinism/refusals
gates/transcription.shadow.spec.ts      gate stub (seam UNLANDED — answerinput contracts wave)
selftest.ts                fixed-vector comparator selftest (GOLDEN_MASTER §5 discipline)
fixtures/<seam>/{recorded,candidate}    llm-shadow/v1 fixtures (synthetic, scrubbed)
```

## Integration (T-MIG-034's decisions — this card only stages)

1. **Wire the proxy**: `buildSmartMarkRouters(env, seams)` already accepts
   `seams.llm` / `seams.generator` (routes/smartmark :136-166). Install
   `ShadowFeedbackLlm` in replay mode as the CI/rig-test default; capture
   mode is rig/LIVE-posture only. One composition-root line, zero core edits.
2. **First LIVE capture**: real shadows replace the synthetic fixtures;
   grounding anchors recorded from actual `loadFeedbackSource` chunks;
   human-reviewed before commit (doctrine §7).
3. **CI lane**: keep `bun test golden/llm-shadow` as its own always-green
   lane, or register the selftest with `golden/runner.ts --selftest` — 034
   decides; this card did not touch runner.ts.
4. **Structured candidates**: the generator seam's `MarkingCandidate`
   artifact wants T0/T1 machinery from this harness — extend, don't fork.
5. **Thresholds**: §4.2 starting values (0.90 / 1.5) get ratified or
   adjusted against the first LIVE drift report.

## What is real vs stubbed

- **Real**: comparator mechanics (canonicalization, anchor resolution,
  T0–T3 classification, envelope law, leak vectors, aggregation), the proxy's
  replay determinism + honest refusals, fixture anatomy — all tested.
- **Stubbed**: the transcription seam (unlanded), LIVE capture tooling on the
  rig, runner registration, synthetic fixtures awaiting real recorded shadows.

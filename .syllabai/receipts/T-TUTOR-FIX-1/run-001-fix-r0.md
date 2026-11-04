# T-TUTOR-FIX-1 run-001 — the paper-walkthrough empty-generation death (#706)

**Date:** 2026-11-04 · **Lane:** T-TUTOR-FIX-1 · **Branch:** `t-tutor-fix1/run-001` (cut @ main `0288632`)
**Operator order:** "Proceed with fixing" (chat trace 1a1a50c9524a9c05), executing the fix the #706 filer scoped as "file the fix under the tutor lane".
**Closes:** issue #706 (T-TUTOR-EXP-2 run-001 battery, §3, scenario 9 blocker).

## 1. Diagnosis of record (static, first-hand code reads @ 0288632)

The wire shape in #706 — stream opens, `citations` serves 5, then the fixed `error` event, 3/3 deterministic, hint/quiz controls green on the SAME pin — is the signature of exactly ONE server path:

1. `routes/tutor.ts` streamSSE catch — any throw inside `module.askStream` after stream-open becomes the fixed `error` event (M2). ✔ matches.
2. `services/tutor/karag.ts` `karagAskStream` — the **L2 empty-generation law** throws `TutorGenerationError` when the generator yielded ZERO deltas (`metaSent` false, "the client sees citations → the fixed error event, never a silently blank done"). ✔ matches — no `meta` event was observed between citations and error in the battery captures.
3. The generator streams zero deltas when the CHAIN returns an empty stream. The chain law (`FailoverLlmChain.stream`) treats a member that **completes cleanly with zero deltas** as success ("possibly empty-complete — the frozen law") — no failover to gemini/openrouter. ✔ one member suffices.
4. Why empty on the walkthrough ask only: the tutor generator sent `maxTokens: 900` — the frozen yml `syllabai.tutor.max-tokens` default, **calibrated for the retired non-reasoning groq default `llama-3.3-70b-versatile`** (the r4b capture of record, T-MIG-090 header: the code default is retired). The chain of record serves **`openai/gpt-oss-120b` — a reasoning model whose reasoning tokens count against the completion cap**. A complex pinned walkthrough prompt spends the whole budget in the reasoning channel → zero content deltas → L2 death. The controls (tier-1 hint ~100 words, scaffold quiz) fit reasoning+content inside 900 → green. 3/3 deterministic at temperature 0.2 with fixed evidence.
5. Ruled OUT by first-hand reads: the paper-pin resolver (guarded, degrades honestly — and it RESOLVED: citations served), `loadMarkContext` (requires qnum AND part letter; "question 6" alone → null; also `.catch(() => null)`), the quiz scaffold (advisory), the telemetry sink (fires after the deltas/completed), the route two-envelope classifier (pre-stream errors only), the adapters (identical request params ride every ask; no ask-shaped throw site).

The mechanism claim "gpt-oss reasoning tokens count against `max_tokens`" is Groq-documented behavior for the openai/gpt-oss family; the MODEL of record is first-hand in this tree (`YML_GROQ_MODEL_DEFAULT = "openai/gpt-oss-120b"`, llmchain/index.ts). The battery's raw captures (`battery_out/prod/S9.summary.json`) live in the T-TUTOR-EXP-2 workspace and remain the confirmatory evidence for the zero-delta shape.

## 2. Fix of record (minimal, in-fence, additive to no frozen law)

| File | Change |
|---|---|
| `apps/api/src/services/tutor/karag.ts` | `TUTOR_COMPLETION_BUDGET_DEFAULT = 4000` (exported, with the full value-history comment); the generator default becomes `opts.maxTokens ?? TUTOR_COMPLETION_BUDGET_DEFAULT`. |
| `apps/api/src/services/tutor/index.ts` | Re-export the constant (the historical import surface stays byte-stable). |
| `apps/api/src/routes/tutor.ts` | `tutorMaxTokensFromEnv(env)` — the composition-root projection of the frozen `syllabai.tutor.max-tokens` binding (`SYLLABAI_TUTOR_MAX_TOKENS`; blank/invalid/≤0 → default, the record-compactor `resolveInt` semantics), wired into the ONE construction site: `buildGroundedTutorGenerator(llm, { maxTokens: tutorMaxTokensFromEnv(env) })`. The tranche-2 port documented the option but never wired it — every construction site took the code default. |
| `apps/api/test/tutor/completion-budget.test.ts` | NEW pin: default = 4000; the budget rides BOTH seams (generate + streamGenerate) to the provider; an explicit override wins; the env projection law (absent/blank/invalid/≤0 → default; positive integers ride verbatim). Recording fakes only — zero model calls. |

NOT changed (named fences): the L2 law, the chain stream law (empty-complete stays clean — the frozen behavior), the adapters/bridges, the prompt family, the resolver/pin/quiz/mark-context, telemetry. The truncation disclosure law already keeps an over-long generation honest (`finish_reason length` → `truncated: true` on the wire), which is what makes a larger budget safe to serve.

## 3. Gates of record

- `tsc --noEmit` (apps/api): **clean**.
- `bun test` (apps/api, full battery): **2750 pass / 13 skip / 0 fail** (42,533 expect calls, 150 files) — includes the 6 new pins and the untouched tutor/llmchain/smartmark suites.
- Diff surface: 3 modified files (+39/−2) + 1 new test. Working tree otherwise clean; the tracked `apps/api/node_modules` symlink blob byte-unchanged (`56d1db7`).

## 4. Verification boundary (honest)

This lane ran NO live provider call (TEST doctrine; no keys in the lane sandbox). The live close-out is the T-TUTOR-EXP-2 battery re-run — scenario 9 (the walkthrough leg) against a deployed build carrying this fix — exactly the re-run the #706 body names as blocked. The diagnosis is static-plus-wire-shape: it explains every observed signal (citations-then-error, no meta, 3/3, controls green) with one mechanism and survives first-hand falsification attempts on the five alternative throw sites.

## 5. Ops note for the operator

- The knob is live post-merge: `SYLLABAI_TUTOR_MAX_TOKENS` tunes the budget without a code change (e.g. an operator wanting the stricter wire may set 2000; the default 4000 is the no-env behavior).
- The same reasoning-budget class was AUDITED on the sibling seams of record: marking already computes a real completion-budget formula (800 + 400/mark, caps 4k/8k) with `reasoningEffort: LOW`; toolkit carries `TOOLKIT_MAX_TOKENS`; answer-input carries its own `MAX_TOKENS`. The tutor was the only seam still serving the pre-reasoning-era fixed 900.

## Addendum r1 — rebase of record + CI re-trigger (2026-11-04, same lane window)

- REBASE of record: the first push (head `f5a8617`, cut @ main `0288632`) raced the parallel-lane worklog appends — main advanced to `964307aa` (RN-DEBRIS-11 verify + t-mg-rollout-commission + T-BOOK-074 close-out) and the PR reported mergeable_state=dirty on `.syllabai/worklog.md` only (the standing append-only tail race; every code file rebased byte-clean). Rebased onto `964307aa` as `47d1758`; worklog conflict resolved as a UNION (main's sections in main's order, this lane's section stays at the tail — both sections intact, zero bytes of either section altered); **force-with-lease pushed over the open PR** — disclosed here per the T-KG-PRE-10 force-push disclosure class (theirs was pre-PR; this one is post-PR, sole head of a no-review PR).
- RE-GATES on the rebased head: `tsc --noEmit` clean; `bun test` apps-api FULL battery **2750 pass / 13 skip / 0 fail** (42,533 expect calls) — re-run first-hand after the rebase.
- CI re-trigger: the initial `pull_request` run never registered (0 checks for the branch across both heads — the dropped-event class when the head moves before Actions consumes the opening event; the branch filter shows NO RUNS). This addendum commit is the `synchronize` that re-arms the workflow. Receipt file only — deliberately NOT the worklog (zero collision surface for the next parallel-lane rebase).
- Main moved again during verification (merges of #714/#720/#722/#725 → tip ≥ `070f903`); mergeability re-checked before hand-off below.

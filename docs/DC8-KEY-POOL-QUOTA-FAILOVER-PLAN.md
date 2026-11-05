# DC8 — LLM + embedding key pools: automatic quota failover (T-OPS-KEYPOOL-1)

**Status:** implemented, run-001 · **Date:** 2026-11-05 · **Operator directive:** "we have a lot of keys — if quota finishes, I want it to use automatically the others" · **Trace:** 1a1aa5bf9c669399

## 1. The measured defect

The ask layer 500ed for ~5.4 continuous hours (2026-11-04 ~19:53Z → 2026-11-05
01:15Z, probes every 120 s — the T-TUTOR-PIVOT-1 replay receipts). Control
probes isolated the plane: login 200, `GET /api/v1/tutor/sessions` 200 (API +
DB healthy), `POST /api/v1/tutor/ask` 500 on 12/12 probes. Two single-key
seams turn one exhausted free-tier key into a full ask-layer outage:

1. **The LLM chain keys.** `buildLlmChain` registered exactly ONE member per
   provider (`groq → gemini → openrouter`); failover existed only ACROSS
   providers. When every provider's single key hit its daily quota, the
   aggregate throw surfaced as the 500.
2. **The embedding key.** `GeminiEmbeddingProvider` took one
   `SYLLABAI_EMBEDDING_GEMINI_API_KEY` — "no failover by design" — and the
   embedding call runs on EVERY ask (KG arm + pgvector arm + the DC7 pivot
   arm's bare-question embedding). One dead embedding key 500s every ask
   regardless of the LLM chain's health.

The frozen health law already knew how to bench broken keys —
`LlmProviderHealth.recordFailure` cools a member after
`failureThreshold` consecutive failures (yml-effective 3/60) and benches an
`AUTHENTICATION_FAILURE`/`MODEL_NOT_FOUND` to the END OF THE UTC DAY — but
with one key per plane there was nowhere to fail over TO.

## 2. The fix (one changeset, two seams)

**The pool projection — `parseKeyPool` (llmchain/index.ts).** The EXISTING
key vars accept a comma-separated pool (`"k1,k2,k3"`); split, trim, drop
empties; NO dedupe (duplicates are the operator's own redundancy, disclosed).
A single key is the pool of one — the pre-DC8 surface, byte-compatible. NO
new env names: the operator pastes all keys into the vars of record
(`SYLLABAI_GROQ_API_KEY`, `SYLLABAI_GEMINI_API_KEY`,
`SYLLABAI_OPENROUTER_API_KEY`, `SYLLABAI_EMBEDDING_GEMINI_API_KEY`).

**Workstream 1 — the LLM chain key pool** (`buildLlmChain`): every key
constructs its own member (`groq`, `groq#2`, `groq#3`, …), inserted in
provider order, so the FROZEN failover loop (untouched — the switchOnFirst
stream law, the aggregate exhaustion contract, the routing/media filter)
tries a provider's next key BEFORE the next provider. Each member owns its
credential (the `#N` name rides `providerName` → `answer_provider`, so
receipts can see which key served). The daily budget becomes per KEY
(per-member) — the truer free-tier grain; disclosed. TEST mode + zero-key
boots stay fail-closed (dormant singletons; the test-mode warn now reports
the pool count).

**Workstream 2 — the embedding key pool** (`GeminiEmbeddingProvider` +
`resolveEmbeddingProvider`): per-key `LlmProviderHealth` (the chain's OWN
kernel — one health law across both planes) + the chain's own classifier
(`classifyHttpStatus`/`classifyTransportError`). First HEALTHY key serves;
429 keys cool after the failure threshold; auth-dead keys bench to the end
of the UTC day; dimension mismatches are `INVALID_RESPONSE` failures that
fall to the next key. The T-013 posture that SURVIVES: no silent fallback to
empty search — when every key is exhausted the aggregate throws (the honest
red the frozen arm contract requires: transport failures propagate).

**Config:** the embedding pool defaults to the chain's yml-effective 3/60
knobs; the `SYLLABAI_LLM_CHAIN_FAILURE_THRESHOLD` /
`SYLLABAI_LLM_CHAIN_COOLDOWN_SECONDS` env remain the one knob set.

## 3. Alternatives considered and rejected

- **A separate quota-cooldown class parsing provider bodies ("quota
  exceeded").** Rejected: the frozen classifier law classifies from status
  codes and exception TYPES, never by parsing error strings. With a pool,
  the 60 s re-probe of a dead key costs one wasted call per cooldown window
  per key — irrelevant against an outage measured in hours.
- **Round-robin/sticky-load balancing across keys.** Rejected: changes which
  key serves when ALL are healthy (observability churn, per-key rate-limit
  pattern changes) without adding availability. Pool order is priority
  order; the health law does the balancing under failure.
- **A gateway/proxy key-pool service.** Rejected: a new moving part in the
  serving path for what the in-process frozen health loop already expresses.

## 4. Scope guards (deliberately untouched)

- The frozen failover loop, stream commit law, media routing, aggregate
  message shapes, `LlmProviderHealth` semantics, the chain order law, the
  llmadmin report schema (`providers` is a record — `#N` keys ride it).
- The dormant/TEST fail-closed posture (ADR-023) — keys present in TEST mode
  are still ignored entirely.
- `resolveEmbeddingProvider`'s unkeyed → null posture (the verbatim
  IllegalStateException path upstream) — no silent unkeyed fallback.

## 5. Verification

- `bun test apps/api packages`: **3435 pass / 0 fail** (22 new DC8 pins:
  pool parsing incl. no-dedupe; construction names/order; single-key
  byte-compat; TEST-mode fail-closed; per-key credential ownership on the
  wire; 429 rotation within one generate; auth benching to UTC-day end;
  aggregate exhaustion on the chain AND the embedding plane; the
  all-cooling zero-call throw; the dimension-mismatch fall-through).
- `tsc --noEmit`: clean (apps/api + apps/hub).
- Post-merge live plan: the operator pastes the comma-separated pools into
  the four Vercel env vars and redeploys; the standing health battery
  (job 501196) plus a rerun of `tutor_replay_pivot.py` (the T-TUTOR-PIVOT-1
  replay) verify the ask layer serves through single-provider quota death.

## 6. Residuals disclosed

- A quota-dead key is re-probed once per cooldown window (3 failures to
  re-arm the cooldown after expiry) — bounded waste, honest by design (the
  classifier cannot distinguish daily-quota 429s from RPM 429s without
  body parsing, which the frozen law forbids).
- Duplicate keys in a pool are NOT deduped — they behave as two members
  sharing one fate (the operator's redundancy choice).
- The `#N` member names change `answer_provider` values under multi-key
  boots (`groq#2`); analytics that group by exact provider string see the
  per-key grain (a feature for the DC7-class receipts; disclosed).
- The embedding pool has no per-key budget knob (0 = unlimited, the chain's
  budget governs the chat plane); the chain budget is now per KEY.

## 7. Run-001 receipt

(filled post-merge: deploy id, the operator's key-pool env flip, and the
live probe verdicts — the ask layer serving through a single provider's
quota death.)

# ADR-MIG-0002: LLM chain real adapters — the wave-3 lane lands (ADR-023 amendment of record)

| | |
|---|---|
| **Status** | **Accepted (operator-directed)** — supersedes the adapter-construction deferral in ADR-023 posture comments; ADR-MIG-0001's capture/replay proxy remains the behavioural-gate mechanism |
| **Deciders** | Operator directive ①, trace `1a117913519cd141` ("land the LLM-chain real adapters + SYLLABAI_LLM_* env (unblocks Tutor/Smart-Mark/CLA/transcription at once)"); executed by lane w0a |
| **Date** | 2026-10-08 |
| **Conformance** | GOLDEN_MASTER §3 (LLM-OUTPUT surfaces stay non-golden) · behavioural-gate doctrine §6 (CI stays model-free) · ruling4 (T-MIG-090 chain-of-record config) · ADR-MIG-0001 |
| **Frozen sources** | `SpringAiChatModelAdapter.java`, `LlmChainConfig.java`, `LlmProviderFailureClassifier.java`, `FailoverLlmChain.java` @ 6cad6ef; `LlmMarkingCandidateGenerator.java` (prompt v3/v4) |

## Context

The T-MIG-090 port (services/llmchain, ruling4) landed the chain's deterministic
plumbing — three-layer `SYLLABAI_LLM_*` env projection, health law, chain
report — with adapter construction deliberately fail-closed dormant in EVERY
mode ("real ChatModel construction is the wave-3 LLM-chain lane's surface").
That left tutor in-corpus asks, smart-mark marking runs, CLA generation and
transcription on their honest-503 dormant postures (correct, but not serving).
The live health round (2026-10-07, R0-V2HEALTH) confirmed the three genuine
defects reduce to the missing adapters and the operator commissioned the lane
directly.

## Decision

1. **buildLlmChain constructs REAL adapters** (`adapters.ts`) for a member when
   `!testMode && enabled && hasKey(apiKey)` — exactly the frozen
   `LlmChainConfig.registerProvider` law:
   - `groq`, `openrouter`: OpenAI-compatible `POST {baseUrl}/chat/completions`
     (Bearer key; `model` = request pin > configured default; `temperature` /
     `max_tokens` / `reasoning_effort` ride only when present);
   - `gemini`: Google GenAI v1beta `models/{model}:generateContent`
     (`x-goog-api-key`, `systemInstruction`, `generationConfig.maxOutputTokens`,
     media as `inlineData`) — the chain's vision-capable member.
2. **The fail-closed posture survives where it was load-bearing**: TEST mode
   ignores keys entirely (never constructs adapters — no code path can silently
   spend quota); zero-key boots register dormant members (chain report shows
   what is missing; generation refuses honestly); the r4b leg-04 golden
   (capture posture = zero-key/TEST) is byte-untouched.
3. **Port bridges** (`bridges.ts`): `chainAsLlmProvider` (tutor/CLA),
   `chainAsFeedbackLlm` + `chainAsCandidateGenerator` (smart-mark — the
   LlmMarkingCandidateGenerator port: prompt v3/v4, budget formula
   800 + 400/mark caps 4k/8k, truncation refusals, clamp-don't-reject,
   whole-batch refusals, deterministic-validator downstream),
   `chainAsTranscriptionProvider` (vision routing).
4. **Chain extensions**: request carries the frozen `LlmRequest` optionals
   (temperature/maxTokens/model/media/reasoningEffort); media requests route
   ONLY to `supportsMedia()` members with the DISTINCT exhaustion message;
   `FailoverLlmChain.stream` implements the frozen commit law (failover only
   before the first delta; after it, errors propagate).
5. **ONE chain of record** (`src/index.ts`) shared by tutor, CLA, smart-mark,
   transcription and the admin chain-health report (health counters, cooldowns
   and budgets are per-chain state).
6. **Env contract of record** (all pre-existing, three-layer per ruling4):
   `SYLLABAI_LLM_MODE` (production/test/live), `SYLLABAI_LLM_GROQ_API_KEY`,
   `SYLLABAI_LLM_GEMINI_API_KEY`, `SYLLABAI_LLM_OPENROUTER_API_KEY` (layer-1;
   the `SYLLABAI_GROQ_API_KEY`-style relaxed-binding aliases remain),
   `SYLLABAI_LLM_GROQ_BASE_URL`/`SYLLABAI_LLM_GROQ_MODEL` (yml-effective
   defaults), `SYLLABAI_LLM_CHAIN_{TIMEOUT,COOLDOWN,FAILURE_THRESHOLD,DAILY_
   BUDGET_PER_PROVIDER}` and `SYLLABAI_LLM_DAILY_BUDGET`. Tutor/CLA grounding
   additionally needs `SYLLABAI_EMBEDDING_GEMINI_API_KEY` (the vector arm's
   separate seam — one Gemini key typically serves both).

## Consequences

- Deployments with keys flip tutor/Smart-Mark/CLA/transcription from honest
  503 to real generation with zero further code changes; zero-key deployments
  are byte-identical in behaviour to the pre-adapter surface.
- The two dormant-seam pins in `test/llmadmin/routes.test.ts` were amended of
  record (LIVE constructs real adapters; the dormant discipline is pinned on
  TEST mode, zero-key boots, and directly constructed dormant members). The
  leg-04 golden gate is untouched.
- 45 new deterministic tests (fake fetch, no network) pin the wire laws.
- Live provider keys remain operator-held credentials; this ADR changes no
  credential handling (keys ride the existing env injection, never code).
- Smart-mark marking results additionally require the pipeline's DB surface
  (`smart_mark_results`, κ-gate tables) present on the serving database — the
  DDL of record already includes them; production application state is a
  deployment concern outside this ADR.
- The recommendations 500 and the tutor in-corpus 500 observed live are
  SEPARATE defects (deterministic NBA edge / pre-generation path); they need
  runtime stacks to pin and are not addressed here.

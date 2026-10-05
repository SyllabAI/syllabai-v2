# ADR-MIG-0001: LLM Seam Strategy — seam-injection proxy vs port-vs-W6-defer

| | |
|---|---|
| **Status** | **Draft** — filed under T-MIG-039; feeds T-MIG-034 review (R0 ratification requested) |
| **Deciders** | T-MIG-034 owner (r1) with R0 ratification; operator kept informed |
| **Date** | 2026-10-05 |
| **Conformance** | GOLDEN_MASTER §3 · MIGRATION_PLAN §5 W6 + risk R-LLM/R-SSE · AGENT_COORDINATION §7 (C1) |
| **Companion doctrine** | `docs/gates/LLM-OUTPUT-BEHAVIOURAL-GATE.md` |

## Context

W3 carries two LLM prose seams whose outputs GOLDEN_MASTER §3 excludes from
golden gating: the **smart-mark feedback prose** (`FeedbackLlm`:
feedback-explanation, improvement-plan — ephemeral, never persisted) and the
**transcription** surface (unlanded; answerinput contracts wave). The
behavioural gate (companion doctrine) needs three capabilities at the seam:

1. **Capture** — record seam outputs with provenance (model id, prompt hash,
   sampling) into shadow fixtures, LIVE posture only.
2. **Replay** — serve recorded artifacts deterministically in CI, so the
   behavioural gate never invokes a model (doctrine §6, hard rule 1).
3. **Observation** — expose the prompt/provenance context so the comparator
   can separate model-side drift from transformation-logic regressions.

Today the seams are **dormant**: `dormantCandidateGenerator` and
`dormantFeedbackLlm` (routes/smartmark :53-62) refuse honestly (503
`smart_feedback_unavailable` fixed body; `CANDIDATE_GENERATION_UNAVAILABLE`),
and the service pipeline is fully ported and unit-pinned around them (032
tranche-1/2). The LLM-chain lane (T-MIG-034, r1) owns the live provider.
The question: **how does the gate's capture/replay integrate when that
lands — and what does W3 adopt in the meantime?**

Hard constraints that shape the decision:

- **No core rewrites mid-wave**: the smartmark/selfmark pipeline is merged,
  pinned, and R0-ratified (mounts ratified 5992850136); re-plumbing it for
  observability is W6-scale surgery, not W3 work.
- **C1**: `syllabai-core` / `syllabai-hub` are frozen, read-only — nothing
  may be added to the frozen core to serve capture.
- **CI must stay model-free** (doctrine §6): whatever mechanism is chosen
  must make replay deterministic.
- **Wave discipline** (MIGRATION_PLAN §5): the full tutor/LLM chain (SSE
  streaming, CLA, intervention runs, LLM admin) is Wave 6 — "tutor/LLM chain
  last (hardest parity, least deterministic)". W3 must not pre-empt that
  architecture.

## Options

### Option A — seam-injection proxy (adopted for W3→W6 window)

The composition root **already has the seam**:
`buildSmartMarkRouters(env, seams)` accepts
`seams.{generator, llm, publisher, clock}` (:136-166), and the dormant pair
proves the honest-refusal default. Option A ships a **capture/replay proxy
as just another `FeedbackLlm` / `MarkingCandidateGenerator` implementation**
(harness: `golden/llm-shadow/lib/feedback-llm-proxy.ts`):

- REPLAY mode: `available()` true when a recorded shadow exists for the
  prompt-hash key; `generate()` returns the recorded artifact byte-stably;
  no shadow → honest refusal, exactly the dormant semantics. This becomes
  the CI/rig-test default.
- CAPTURE mode: wraps a delegate provider; forwards real calls, records
  `{promptHash, temperature, output, recordedAt}` into the rig's fixture
  writer. Rig/LIVE-posture only — never in CI.
- Prose surfaces stay ephemeral (never persisted by the service — the proxy
  writes fixtures, the service does not change), so the "never stored" law
  is untouched.

Pros:
- **Zero core edits.** The proxy rides the existing injection point; the
  merged, ratified pipeline is untouched. Boundary compliance is structural,
  not promised.
- Deterministic replay by construction; the same object is the CI default,
  the rig capture tool, and the gate's transport.
- Reversible and cheap: remove the proxy from `seams`, the system returns to
  the dormant pair.

Cons:
- Duck-typed seam contract: interface drift in `FeedbackLlm` is caught by
  T1 structural checks + the route pins at review time, not compile time in
  the harness (the harness deliberately does not import apps/api — golden/**
  must not couple to app code).
- Provenance completeness depends on what the seam exposes (prompt text is
  visible — hashable; model id must ride the fixture's own provenance field).

### Option B — port the LLM seam infrastructure now vs W6-defer

Port a first-class, instrumented LLM infrastructure module (provider
abstraction, prompt registry, telemetry, native capture/replay) into the
monorepo as part of W3 (B1), or acknowledge the port as the destination
architecture and defer it to Wave 6 (B2), using Option A as the interim.

Pros (B1): compile-time coupling; complete provenance by construction; no
interim mechanism to retire.
Cons (B1): W3 is the assessment wave — an LLM-infra port lands architecture
in a wave whose exit criterion is verification evidence; it pre-empts Wave 6
design decisions (SSE streaming parity per R-SSE, provider choices for
tutor/CLA, research calibration) that should drive the module's shape. High
blast radius against a freshly ratified pipeline.
Cons (B2, vs A): two mechanisms unless the interim is retired wholesale at
W6; fixture format must be designed now to survive the port (it is —
`llm-shadow/v1` has no proxy-specific fields); deferred payoff means the
doctrine's own pain points inform the W6 design later than ideal.

## Decision (draft)

**Adopt Option A (seam-injection proxy) for the W3→W6 window.** T-MIG-034
installs the replay proxy as the CI/rig-test default and owns capture mode on
the rig. Revisit at Wave 6 planning with recorded evidence: the drift reports
and provenance gaps accumulated by then become the input to the LLM-infra
port design (B2) — at which point the port is proposed with data, inside the
wave whose scope admits it.

Explicitly rejected for now: B1 — wave-discipline violation with
disproportionate blast radius against a freshly ratified pipeline.

Early-revisit triggers (any one forces the W6 conversation early):

1. Interface drift incident: `FeedbackLlm` changes shape in a way the T1
   structural checks catch only at runtime review — the duck-typing
   trade-off is then a liability.
2. The W3 EXIT ritual (two-posture replay, 40/40) cannot execute reproducibly
   through the proxy.
3. Provenance gaps block verdict review in practice (null model id / prompt
   hash recurrence).

## Consequences

- The harness owns a `ShadowFeedbackLlm` implementing the `FeedbackLlm`
  contract shape (duck-typed; no apps/api import). 034 wires it via
  `buildSmartMarkRouters` seams — one line at the composition root, no core
  edits.
- Fixture format (`llm-shadow/v1`) is proxy-agnostic from day one; a W6 port
  does not invalidate recorded shadows.
- Refusal semantics are preserved under both modes: no-shadow replay refuses
  exactly like the dormant pair (honest 503 path), so "honesty of refusals"
  (§3 dimension 1) is itself gated.
- W6 planning receives a documented decision trail: this ADR + the drift
  reports + the provenance audit accumulated by then.

## Status Tracking

- Draft → T-MIG-034 review → R0 ratification → **Accepted** with the W3
  exit-gate evidence bundle (first LIVE replay) as its first validating
  artifact.

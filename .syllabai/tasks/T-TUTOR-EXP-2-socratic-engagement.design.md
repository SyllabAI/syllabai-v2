# T-TUTOR-EXP-2 — the Socratic-engagement design draft (run-000) — 2026-11-04

card: T-TUTOR-EXP-2 (`.syllabai/tasks/T-TUTOR-EXP-2-socratic-engagement.yaml`) · status: STARTED ·
branch: `t-tutor-exp/run-002` (off main 98845b69) · zero functional bytes — this document is the work

## 1. The measured posture of record

The 2026-11-03/04 live 4CH1 battery (the same one of record for T-TUTOR-EXP-1's defect
classes, trace 1a1a290703d26805 family) shows a tutor that answers superbly and then
stops: every turn is a complete, well-cited, properly bounded monologue, and the
conversation advances only when the LEARNER sends the next message. Nothing in the
product checks whether the explanation landed, invites the learner to apply it, or
hands the floor back. For an exam-prep tutor that posture is safe but inert — the
dialogue is the missing layer.

## 2. Ground truth: why the tutor is a broadcast (the prompt is the cause)

Mapped this run, `apps/api/src/services/tutor/prompt.ts` (v16) — the interactive
mechanics that DO exist:

| mechanism | law | what it does NOT do |
|---|---|---|
| QUIZ SCAFFOLD block | serve only the scaffold's questions; answers hidden until attempted | only fires on a paper-pinned quiz ask — deterministic, not conversational |
| improvised-quiz laws (v16) | marks honesty + the citation floor | the tutor ASKS the questions, but nothing probes whether the prior explanation landed |
| RECENT LEARNING EXPERIENCES | one continuity sentence opening the FIRST answer of a session | about the learner's history, not about the current explanation |
| two-tier disclosure | hint-level vs explicit marking points | restricts what may be said; never invites the learner to say anything |

The conclusion of the mapping: **the broadcast posture is structural.** The rules list
never once instructs the tutor to end a turn with anything that expects a reply. No
model-side fix can be trusted while the system prompt commands a monologue — the fix
belongs in the prompt, as a clause with the same discipline as the existing laws.

## 3. The drafted v17 clause (DRAFT — lands only after §5 reads clean)

Placed in the Rules list immediately after the v16 marks-honesty clause:

```
- Hand the floor back on explanation turns: when you have just given a
  substantive explanation (not a paper-question walkthrough, not a quiz
  turn, not a tier-1 hint turn), end with ONE short comprehension probe
  the learner can answer from what you just explained — for example "why
  does X follow from Y?" or "what would happen to the rate if X
  doubled?". The probe is grounded: its answer must be in the SOURCES
  you cited this turn. Never ask more than one probe, never make it a
  yes/no, never open a new topic with it, and never ask the learner to
  recall a specification reference, topic code, page number or source
  label. Skip the probe when the learner asked a quick lookup, when the
  turn already asks them something, or when the INTERVENTION PLAN calls
  for direct instruction. The answer always comes first: the probe never
  withholds, defers or conditions the explanation, and it lives inside
  the 200-word budget as one sentence.
```

Design decisions embodied in the clause:

1. **Answer-first, absolutely.** The classic Socratic failure mode (withholding the
   answer to make the student dig) is the named refusal of this design: on an
   exam-prep product the answer arrives, then the floor comes back.
2. **One probe, grounded, no new topic.** The probe's answer must be in the SOURCES
   the turn already cited — the probe creates NO new fabrication surface and cannot
   drift beyond the evidence window the grounding gate judged.
3. **The skip-set is explicit.** Quiz turns (scaffolded or improvised — the quiz IS
   the comprehension check), tier-1 hint turns (probing before the learner attempts
   would pressure-leak), paper walkthroughs (part-by-part shape; extension noted in
   the card's deferred list), quick lookups, and direct-instruction intervention
   plans. The INTERVENTION PLAN hook uses structure that already exists in
   `PromptContext` — no new pipeline state in option (a).
4. **It rides existing law, adds none.** Spec-recall prohibition (already v16 law)
   is restated inside the clause so the probe cannot launder a spec-recall ask; the
   200-word concision budget absorbs the probe as one sentence — no budget change.
5. **Option (a) prompt-only first.** A deterministic cadence field in session state
   (option (b) — probe at most once per N explanation turns) is deliberately
   deferred behind the eval: if the battery shows per-turn fatigue, the cadence
   lands as pipeline state; if not, the clause stays as written.

## 4. Guardrails (the frozen laws the probe must never breach)

- **Disclosure tiers**: at tier 1 the probe must not carry, hint or be answered by an
  un-awarded marking point — the probe asks about the explanation just GIVEN (tier
  lawful by construction), never about the hidden mark scheme.
- **Marks honesty (v16)**: the probe never carries a mark allocation.
- **Citation floor / scaffold laws**: untouched — the probe is prompt text only; the
  wire, contracts and the deterministic pipeline (quiz floor included) do not move.
- **Concision**: 200 words + citations, probe included; the battery must show no
  answer-length regression.
- **Refusal honesty**: the insufficient-sources law is untouched; a probe is never a
  substitute for saying what is missing.

## 5. The eval battery (the gate before v17 lands)

12 scenarios on the 4CH1 pilot course (`igcse-chemistry-19`), A/B: v16 baseline vs
v17-draft, identical asks and seeds, same harness family as the 2026-11-03 battery:

| # | scenario family | scored expectation for v17 |
|---|---|---|
| 1–5 | substantive explanation asks (5 topics) | exactly one probe per turn; answerable from the cited sources; answer itself unchanged in substance |
| 6 | improvised quiz turn ("quiz me on rates") | NO probe (the quiz is the check); marks law intact |
| 7 | paper-pinned quiz (scaffold) | NO probe; scaffold law byte-stable |
| 8 | tier-1 hint turn on a marked part | NO probe; zero tier leakage |
| 9 | paper-question part-by-part walkthrough | NO probe in v17 (deferred extension); part labels intact |
| 10 | quick lookup ("what's the charge of a sulfate ion?") | NO probe (skip-set); concise answer |
| 11 | the 3 honest-refusal asks (off-topic / out-of-spec / retrieval-miss) | refusal text unchanged; no probe substituting for the refusal |
| 12 | multi-turn: probe answered by the learner | the next turn builds on the learner's probe answer (no verbatim repeat law intact) |

Regressions watched on EVERY scenario: answer ≤ 200 words + citations; citations
well-formed (`Revision notes — <title> — p1` — run-001's labels visible); zero
fabrication; zero tier leakage. Scoring: deterministic checks (probe count, word
bound, refusal match) + a manual pass on probe answerability and tone. The battery
runs LIVE (the same pilot-course path the outage verification used) — no synthetic
corpus. Gate: 1–5 probe-rate 5/5, 6–10 probe-rate 0/5, 11 unchanged refusals, 12
coherent build-on, zero regressions.

## 6. What lands, in what order

1. **run-000 (this)**: card + this design draft — zero functional bytes.
2. **run-001 (next)**: implement the v17 clause on a feature branch behind the
   identity-pin updates; the A/B battery against the live pilot; the receipt of
   record with the scored matrix. If the battery fails, the clause is revised (or
   option (b) cadence is designed) — the battery verdict is the gate, not taste.
3. **run-002+**: the deferred extensions (paper-walkthrough probes, cadence state)
   only if the eval says they are wanted.
